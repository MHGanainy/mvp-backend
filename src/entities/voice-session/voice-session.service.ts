import { PrismaClient, Prisma, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import {
  SessionConfigResponse,
  HeartbeatBody,
  HeartbeatResponse,
  SaveTranscriptBody,
  SaveTranscriptResponse,
} from './voice-session.schema';

export class VoiceSessionService {
  constructor(
    private prisma: PrismaClient,
    private log: FastifyBaseLogger
  ) {}

  async getSessionConfig(correlationToken: string): Promise<SessionConfigResponse> {
    // Try SimulationAttempt first
    const simAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { correlationToken },
      include: {
        simulation: true,
      },
    });

    if (simAttempt) {
      return {
        systemPrompt: simAttempt.simulation.casePrompt,
        openingLine: simAttempt.simulation.openingLine,
        voiceId: simAttempt.simulation.voiceModel,
        caseType: 'simulation',
      };
    }

    // Fall back to InterviewSimulationAttempt
    const interviewAttempt = await this.prisma.interviewSimulationAttempt.findUnique({
      where: { correlationToken },
      include: {
        interviewSimulation: true,
      },
    });

    if (interviewAttempt) {
      return {
        systemPrompt: interviewAttempt.interviewSimulation.casePrompt,
        openingLine: interviewAttempt.interviewSimulation.openingLine,
        voiceId: interviewAttempt.interviewSimulation.voiceModel,
        caseType: 'interview',
      };
    }

    throw new Error('Attempt not found for correlationToken');
  }

  async handleHeartbeat(data: HeartbeatBody): Promise<HeartbeatResponse> {
    // Try SimulationAttempt first
    const simAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { correlationToken: data.correlationToken },
      include: {
        student: { include: { user: true } },
        simulation: true,
      },
    });

    if (simAttempt) {
      return this.processHeartbeat({
        attemptId: simAttempt.id,
        studentId: simAttempt.student.id,
        isAdmin: simAttempt.student.user.isAdmin,
        creditBalance: simAttempt.student.creditBalance,
        minutesBilled: simAttempt.minutesBilled ?? 0,
        startedAt: simAttempt.startedAt,
        table: 'simulationAttempt',
      });
    }

    // Fall back to InterviewSimulationAttempt
    const interviewAttempt = await this.prisma.interviewSimulationAttempt.findUnique({
      where: { correlationToken: data.correlationToken },
      include: {
        student: { include: { user: true } },
        interviewSimulation: true,
      },
    });

    if (interviewAttempt) {
      return this.processHeartbeat({
        attemptId: interviewAttempt.id,
        studentId: interviewAttempt.student.id,
        isAdmin: interviewAttempt.student.user.isAdmin,
        creditBalance: interviewAttempt.student.creditBalance,
        minutesBilled: interviewAttempt.minutesBilled ?? 0,
        startedAt: interviewAttempt.startedAt,
        table: 'interviewSimulationAttempt',
      });
    }

    this.log.warn({ correlationToken: data.correlationToken }, 'Heartbeat for unknown correlationToken');
    return { status: 'stop', reason: 'session_not_found' };
  }

  private async processHeartbeat(ctx: {
    attemptId: string;
    studentId: string;
    isAdmin: boolean;
    creditBalance: number;
    minutesBilled: number;
    startedAt: Date;
    table: 'simulationAttempt' | 'interviewSimulationAttempt';
  }): Promise<HeartbeatResponse> {
    const nextMinute = ctx.minutesBilled + 1;

    // Admin bypass — update minutes but do not charge credits
    if (ctx.isAdmin) {
      await this.updateAttemptMinutes(ctx.table, ctx.attemptId, nextMinute);
      return { status: 'ok' };
    }

    // Credit check
    if (ctx.creditBalance < 1) {
      this.log.info({ attemptId: ctx.attemptId, creditBalance: ctx.creditBalance }, 'Credits exhausted');
      return { status: 'stop', reason: 'credits_exhausted' };
    }

    // Deduct 1 credit in a transaction
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedStudent = await tx.student.update({
        where: { id: ctx.studentId },
        data: { creditBalance: { decrement: 1 } },
      });

      if (updatedStudent.creditBalance < 0) {
        throw new Error('INSUFFICIENT_CREDITS');
      }

      const sourceType = ctx.table === 'simulationAttempt'
        ? CreditTransactionSource.SIMULATION
        : CreditTransactionSource.INTERVIEW;

      await tx.creditTransaction.create({
        data: {
          studentId: ctx.studentId,
          transactionType: CreditTransactionType.DEBIT,
          amount: 1,
          balanceAfter: updatedStudent.creditBalance,
          sourceType,
          sourceId: ctx.attemptId,
          description: `Voice session minute ${nextMinute}`,
        },
      });

      // Update minutes billed on the correct table
      if (ctx.table === 'simulationAttempt') {
        await tx.simulationAttempt.update({
          where: { id: ctx.attemptId },
          data: {
            minutesBilled: nextMinute,
            durationSeconds: nextMinute * 60,
          },
        });
      } else {
        await tx.interviewSimulationAttempt.update({
          where: { id: ctx.attemptId },
          data: {
            minutesBilled: nextMinute,
            durationSeconds: nextMinute * 60,
          },
        });
      }
    });

    this.log.info({ attemptId: ctx.attemptId, minute: nextMinute }, 'Heartbeat processed');
    return { status: 'ok' };
  }

  private async updateAttemptMinutes(
    table: 'simulationAttempt' | 'interviewSimulationAttempt',
    attemptId: string,
    minutes: number
  ): Promise<void> {
    const data = { minutesBilled: minutes, durationSeconds: minutes * 60 };
    if (table === 'simulationAttempt') {
      await this.prisma.simulationAttempt.update({ where: { id: attemptId }, data });
    } else {
      await this.prisma.interviewSimulationAttempt.update({ where: { id: attemptId }, data });
    }
  }

  async saveTranscript(body: SaveTranscriptBody): Promise<SaveTranscriptResponse> {
    const { correlationToken, caseType, transcript } = body;
    const now = new Date();

    if (caseType === 'simulation') {
      const attempt = await this.prisma.simulationAttempt.findUnique({
        where: { correlationToken },
      });
      if (!attempt) {
        throw new Error('SimulationAttempt not found');
      }
      await this.prisma.simulationAttempt.update({
        where: { id: attempt.id },
        data: {
          transcript: transcript as unknown as Prisma.JsonObject,
        },
      });
    } else {
      const attempt = await this.prisma.interviewSimulationAttempt.findUnique({
        where: { correlationToken },
      });
      if (!attempt) {
        throw new Error('InterviewSimulationAttempt not found');
      }
      await this.prisma.interviewSimulationAttempt.update({
        where: { id: attempt.id },
        data: {
          transcript: transcript as unknown as Prisma.JsonObject,
        },
      });
    }

    this.log.info({ correlationToken, caseType, messageCount: transcript.messages.length }, 'Transcript saved');
    return { success: true };
  }
}
