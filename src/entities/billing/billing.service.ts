// src/services/billing.service.ts
import { PrismaClient, Prisma, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { 
  BillingStatus, 
  BillingResponse, 
  BillingMetrics,
  BillingWebhookInput,
  SessionEndInput,
  SessionEndResponse,
  BILLING_CONFIG 
} from './billing.schema';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class BillingLogger {
  private logFile: fs.WriteStream;
  private fastifyLogger?: FastifyBaseLogger;
  
  constructor(fastifyLogger?: FastifyBaseLogger) {
    this.fastifyLogger = fastifyLogger;
    this.logFile = fs.createWriteStream(
      path.join(logsDir, 'billing.log'),
      { flags: 'a' }
    );
  }
  
  private formatLog(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: 'BillingService',
      message,
      ...data
    };
    return JSON.stringify(logEntry);
  }
  
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    const formatted = this.formatLog(level.toUpperCase(), message, data);
    
    this.logFile.write(formatted + '\n');
    
    const colors = {
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[90m'
    };
    const reset = '\x1b[0m';
    console.log(`${colors[level]}[BILLING]${reset} ${formatted}`);
    
    if (this.fastifyLogger) {
      this.fastifyLogger[level]({ ...data, service: 'BillingService' }, message);
    }
  }
  
  info(message: string, data?: any) { this.log('info', message, data); }
  warn(message: string, data?: any) { this.log('warn', message, data); }
  error(message: string, data?: any) { this.log('error', message, data); }
  debug(message: string, data?: any) { this.log('debug', message, data); }
  
  close() {
    this.logFile.end();
  }
}

export class BillingService {
  private logger: BillingLogger;
  private metrics: BillingMetrics = {
    totalRequests: 0,
    successfulBillings: 0,
    failedBillings: 0,
    duplicateRequests: 0,
    insufficientCreditEvents: 0,
    averageTransactionTime: 0,
    totalTransactionTime: 0,
    totalMinutesBilled: 0,
    uptime: 0
  };

  constructor(
    private prisma: PrismaClient,
    fastifyLogger?: FastifyBaseLogger
  ) {
    this.logger = new BillingLogger(fastifyLogger);
    this.logger.info('BillingService initialized', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database_url: process.env.DATABASE_URL ? 'configured' : 'not configured'
    });
  }

  async handleMinuteBilling(data: BillingWebhookInput): Promise<BillingResponse> {
    const requestId = `bill_${data.conversation_id}_min${data.minute}_${Date.now()}`;
    const startTime = Date.now();
    
    this.metrics.totalRequests++;
    this.metrics.lastProcessedAt = new Date();
    
    this.logger.info('Processing billing request', {
      requestId,
      correlation_token: data.correlation_token,
      conversation_id: data.conversation_id,
      minute: data.minute,
      timestamp: data.timestamp,
      metrics_total_requests: this.metrics.totalRequests
    });

    try {
      this.logger.debug('Fetching simulation attempt by correlation token', {
        requestId,
        correlation_token: data.correlation_token
      });
      
      const attempt = await this.prisma.simulationAttempt.findUnique({
        where: { correlationToken: data.correlation_token },
        include: {
          student: {
            include: {
              user: true
            }
          },
          simulation: {
            include: {
              courseCase: true
            }
          }
        }
      });

      if (!attempt) {
        this.logger.error('Invalid correlation token - no attempt found', {
          requestId,
          correlation_token: data.correlation_token,
          conversation_id: data.conversation_id
        });

        this.metrics.failedBillings++;
        
        return {
          status: BillingStatus.ERROR,
          creditsRemaining: 0,
          minuteBilled: data.minute,
          totalMinutesBilled: 0,
          shouldTerminate: true,
          message: 'Invalid correlation token - session not found'
        };
      }

      // CHECK IF STUDENT IS ADMIN - BYPASS BILLING
      if (attempt.student.user.isAdmin) {
        this.logger.info('Admin user detected - bypassing billing', {
          requestId,
          student_id: attempt.student.id,
          student_email: attempt.student.user.email,
          is_admin: true,
          minute: data.minute
        });
        
        // Update attempt minutes without charging
        await this.prisma.simulationAttempt.update({
          where: { id: attempt.id },
          data: {
            minutesBilled: data.minute,
            durationSeconds: data.minute * BILLING_CONFIG.MINUTE_DURATION_SECONDS
          }
        });
        
        this.metrics.successfulBillings++;
        
        return {
          status: BillingStatus.CONTINUE,
          creditsRemaining: 999999,
          minuteBilled: data.minute,
          totalMinutesBilled: data.minute,
          attemptId: attempt.id,
          shouldTerminate: false,
          message: 'Admin user - unlimited usage'
        };
      }

      // REGULAR BILLING LOGIC FOR NON-ADMIN USERS
      const currentMinutesBilled = attempt.minutesBilled || 0;
      
      this.logger.debug('Checking if minute already billed', {
        requestId,
        minute_requested: data.minute,
        minutes_already_billed: currentMinutesBilled,
        attempt_id: attempt.id
      });
      
      if (data.minute <= currentMinutesBilled) {
        this.metrics.duplicateRequests++;
        
        this.logger.warn('Minute already billed - returning idempotent response', {
          requestId,
          minute_requested: data.minute,
          minutes_already_billed: currentMinutesBilled,
          attempt_id: attempt.id,
          total_duplicates: this.metrics.duplicateRequests
        });

        const response: BillingResponse = {
          status: BillingStatus.CONTINUE,
          creditsRemaining: attempt.student.creditBalance,
          minuteBilled: data.minute,
          totalMinutesBilled: currentMinutesBilled,
          attemptId: attempt.id,
          shouldTerminate: false,
          message: 'Already billed (idempotent response)'
        };
        
        return response;
      }

      if (data.minute > currentMinutesBilled + 1) {
        this.logger.warn('Non-sequential minute billing detected', {
          requestId,
          minute_requested: data.minute,
          expected_minute: currentMinutesBilled + 1,
          gap: data.minute - (currentMinutesBilled + 1),
          attempt_id: attempt.id
        });
      }

      this.logger.info('Attempt found successfully', {
        requestId,
        attempt_id: attempt.id,
        student_id: attempt.student.id,
        student_name: `${attempt.student.firstName} ${attempt.student.lastName}`,
        student_email: attempt.student.user.email,
        current_balance: attempt.student.creditBalance,
        minutes_already_billed: currentMinutesBilled,
        simulation_id: attempt.simulation.id,
        case_title: attempt.simulation.courseCase.title
      });

      const { student } = attempt;

      if (student.creditBalance < 1) {
        this.metrics.insufficientCreditEvents++;
        
        this.logger.warn('Insufficient credits detected', {
          requestId,
          student_id: student.id,
          student_email: student.user.email,
          current_balance: student.creditBalance,
          required: 1,
          minutes_billed: currentMinutesBilled,
          total_insufficient_events: this.metrics.insufficientCreditEvents
        });

        return {
          status: BillingStatus.TERMINATE,
          creditsRemaining: 0,
          minuteBilled: data.minute,
          totalMinutesBilled: currentMinutesBilled,
          attemptId: attempt.id,
          shouldTerminate: true,
          message: 'Insufficient credits to continue',
          gracePeriodSeconds: 30
        };
      }

      const transactionStartTime = Date.now();
      
      this.logger.info('Starting credit deduction transaction', {
        requestId,
        student_id: student.id,
        amount_to_deduct: 1,
        current_balance: student.creditBalance,
        expected_balance_after: student.creditBalance - 1,
        minute_to_bill: data.minute
      });
      
      try {
        const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          
          this.logger.debug('Decrementing student credit balance', {
            requestId,
            student_id: student.id,
            operation: 'DECREMENT',
            amount: 1
          });
          
          const updatedStudent = await tx.student.update({
            where: { id: student.id },
            data: {
              creditBalance: { decrement: 1 }
            }
          });

          this.logger.debug('Student balance updated successfully', {
            requestId,
            student_id: student.id,
            old_balance: student.creditBalance,
            new_balance: updatedStudent.creditBalance,
            change: -1
          });

          if (updatedStudent.creditBalance < 0) {
            this.logger.error('CRITICAL: Balance went negative - rolling back', {
              requestId,
              student_id: student.id,
              balance: updatedStudent.creditBalance
            });
            throw new Error('INSUFFICIENT_CREDITS');
          }

          this.logger.debug('Creating credit transaction record', {
            requestId,
            student_id: student.id,
            amount: 1,
            balance_after: updatedStudent.creditBalance,
            minute: data.minute
          });
          
          const creditTransaction = await tx.creditTransaction.create({
            data: {
              studentId: student.id,
              transactionType: CreditTransactionType.DEBIT,
              amount: 1,
              balanceAfter: updatedStudent.creditBalance,
              sourceType: CreditTransactionSource.SIMULATION,
              sourceId: attempt.id,
              description: `Voice conversation minute ${data.minute}`,
              createdAt: new Date()
            }
          });

          this.logger.debug('Credit transaction record created', {
            requestId,
            transaction_id: creditTransaction.id,
            transaction_type: creditTransaction.transactionType,
            balance_after: creditTransaction.balanceAfter
          });

          this.logger.debug('Updating simulation attempt with minutes billed', {
            requestId,
            attempt_id: attempt.id,
            new_minutes_billed: data.minute,
            new_duration_seconds: data.minute * BILLING_CONFIG.MINUTE_DURATION_SECONDS
          });
          
          await tx.simulationAttempt.update({
            where: { id: attempt.id },
            data: {
              minutesBilled: data.minute,
              durationSeconds: data.minute * BILLING_CONFIG.MINUTE_DURATION_SECONDS
            }
          });

          return updatedStudent;
        }, {
          maxWait: BILLING_CONFIG.TRANSACTION_MAX_WAIT_MS,
          timeout: BILLING_CONFIG.TRANSACTION_TIMEOUT_MS
        });

        const transactionDuration = Date.now() - transactionStartTime;
        this.metrics.totalTransactionTime += transactionDuration;
        this.metrics.successfulBillings++;
        this.metrics.totalMinutesBilled++;
        this.metrics.averageTransactionTime = 
          this.metrics.totalTransactionTime / this.metrics.successfulBillings;
        
        this.logger.info('Transaction completed successfully', {
          requestId,
          transaction_duration_ms: transactionDuration,
          new_balance: result.creditBalance,
          minute_billed: data.minute,
          total_minutes_billed_this_attempt: data.minute,
          total_successful: this.metrics.successfulBillings,
          total_minutes_billed_all_time: this.metrics.totalMinutesBilled,
          avg_transaction_time: this.metrics.averageTransactionTime.toFixed(2)
        });

        let response: BillingResponse;
        
        if (result.creditBalance === 0) {
          this.logger.warn('Last credit used - will terminate conversation', {
            requestId,
            student_id: student.id,
            minute_billed: data.minute,
            total_minutes_this_session: data.minute
          });
          
          response = {
            status: BillingStatus.TERMINATE,
            creditsRemaining: 0,
            minuteBilled: data.minute,
            totalMinutesBilled: data.minute,
            attemptId: attempt.id,
            shouldTerminate: true,
            message: 'Last credit used - conversation will end',
            gracePeriodSeconds: BILLING_CONFIG.DEFAULT_GRACE_PERIOD_SECONDS
          };
          
        } else if (result.creditBalance <= BILLING_CONFIG.WARNING_THRESHOLD_CREDITS) {
          this.logger.warn('Low credits warning threshold reached', {
            requestId,
            student_id: student.id,
            credits_remaining: result.creditBalance,
            minute_billed: data.minute,
            warning_threshold: BILLING_CONFIG.WARNING_THRESHOLD_CREDITS
          });
          
          response = {
            status: BillingStatus.WARNING,
            creditsRemaining: result.creditBalance,
            minuteBilled: data.minute,
            totalMinutesBilled: data.minute,
            attemptId: attempt.id,
            shouldTerminate: false,
            message: `Low credits warning: ${result.creditBalance} minute(s) remaining`
          };
          
        } else {
          response = {
            status: BillingStatus.CONTINUE,
            creditsRemaining: result.creditBalance,
            minuteBilled: data.minute,
            totalMinutesBilled: data.minute,
            attemptId: attempt.id,
            shouldTerminate: false
          };
        }

        const totalDuration = Date.now() - startTime;
        
        this.logger.info('Billing request completed successfully', {
          requestId,
          total_duration_ms: totalDuration,
          transaction_duration_ms: transactionDuration,
          response
        });

        return response;
        
      } catch (error) {
        const transactionDuration = Date.now() - transactionStartTime;
        this.metrics.failedBillings++;
        
        if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') {
          this.logger.error('Transaction failed - insufficient credits', {
            requestId,
            transaction_duration_ms: transactionDuration,
            student_id: student.id,
            error: error.message
          });

          this.logger.info('Resetting negative balance to zero', {
            requestId,
            student_id: student.id
          });
          
          await this.prisma.student.update({
            where: { id: student.id },
            data: { creditBalance: 0 }
          });

          this.metrics.insufficientCreditEvents++;

          return {
            status: BillingStatus.TERMINATE,
            creditsRemaining: 0,
            minuteBilled: data.minute,
            totalMinutesBilled: currentMinutesBilled,
            attemptId: attempt.id,
            shouldTerminate: true,
            message: 'Insufficient credits'
          };
        }

        this.logger.error('Transaction failed with unexpected error', {
          requestId,
          transaction_duration_ms: transactionDuration,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          total_failed: this.metrics.failedBillings
        });

        throw error;
      }
      
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      
      this.logger.error('Billing request failed completely', {
        requestId,
        total_duration_ms: totalDuration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        conversation_id: data.conversation_id,
        minute: data.minute
      });
      
      throw error;
    }
  }

  async handleSessionEnd(data: SessionEndInput): Promise<SessionEndResponse> {
    const sessionId = `session_end_${data.conversation_id}_${Date.now()}`;
    const startTime = Date.now();
    
    this.logger.info('Processing session end request', {
      sessionId,
      correlation_token: data.correlation_token,
      conversation_id: data.conversation_id,
      total_minutes: data.total_minutes,
      timestamp: data.timestamp
    });

    try {
      const attempt = await this.prisma.simulationAttempt.findUnique({
        where: { correlationToken: data.correlation_token },
        include: {
          student: {
            include: {
              user: true
            }
          },
          simulation: {
            include: {
              courseCase: true
            }
          }
        }
      });

      if (attempt) {
        const currentMinutesBilled = attempt.minutesBilled || 0;
        const finalMinutesBilled = Math.max(data.total_minutes, currentMinutesBilled);
        const finalDurationSeconds = finalMinutesBilled * BILLING_CONFIG.MINUTE_DURATION_SECONDS;
        
        // Note if it's an admin session
        if (attempt.student.user.isAdmin) {
          this.logger.info('Admin session ended - no billing impact', {
            sessionId,
            attempt_id: attempt.id,
            student_id: attempt.student.id,
            is_admin: true,
            minutes: finalMinutesBilled
          });
        }
        
        this.logger.info('Updating final attempt duration and minutes billed', {
          sessionId,
          attempt_id: attempt.id,
          student_id: attempt.student.id,
          student_email: attempt.student.user.email,
          is_admin: attempt.student.user.isAdmin,
          old_minutes_billed: currentMinutesBilled,
          new_minutes_billed: finalMinutesBilled,
          old_duration: attempt.durationSeconds,
          new_duration: finalDurationSeconds,
          case_title: attempt.simulation.courseCase.title
        });
        
        if (data.total_minutes > currentMinutesBilled) {
          await this.prisma.simulationAttempt.update({
            where: { id: attempt.id },
            data: {
              minutesBilled: data.total_minutes,
              durationSeconds: finalDurationSeconds,
              endedAt: new Date(data.timestamp)
            }
          });
          
          this.logger.info('Updated attempt with final billing info', {
            sessionId,
            attempt_id: attempt.id,
            minutes_billed: data.total_minutes
          });
        } else {
          await this.prisma.simulationAttempt.update({
            where: { id: attempt.id },
            data: {
              endedAt: new Date(data.timestamp)
            }
          });
          
          this.logger.info('Session ended without additional billing', {
            sessionId,
            attempt_id: attempt.id,
            minutes_already_billed: currentMinutesBilled,
            minutes_reported: data.total_minutes
          });
        }

        const duration = Date.now() - startTime;
        
        this.logger.info('Session end processed successfully', {
          sessionId,
          attempt_id: attempt.id,
          total_minutes_billed: finalMinutesBilled,
          final_balance: attempt.student.user.isAdmin ? 999999 : attempt.student.creditBalance,
          processing_duration_ms: duration
        });
        
        return { 
          success: true, 
          totalMinutesBilled: finalMinutesBilled,
          attemptFound: true,
          finalBalance: attempt.student.user.isAdmin ? 999999 : attempt.student.creditBalance
        };
        
      } else {
        this.logger.warn('Session end - attempt not found', {
          sessionId,
          correlation_token: data.correlation_token
        });
        
        return { 
          success: false, 
          totalMinutesBilled: 0,
          attemptFound: false
        };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Session end processing failed', {
        sessionId,
        duration_ms: duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  getMetrics(): BillingMetrics {
    return {
      ...this.metrics,
      uptime: process.uptime()
    };
  }
  
  resetMetrics(): void {
    this.logger.info('Resetting billing metrics', {
      old_metrics: this.metrics
    });
    
    this.metrics = {
      totalRequests: 0,
      successfulBillings: 0,
      failedBillings: 0,
      duplicateRequests: 0,
      insufficientCreditEvents: 0,
      averageTransactionTime: 0,
      totalTransactionTime: 0,
      totalMinutesBilled: 0,
      uptime: 0
    };
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up BillingService', {
      final_metrics: this.metrics
    });
    this.logger.close();
  }
}