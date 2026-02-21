// src/entities/simulation-attempt/simulation-attempt.service.ts
import { PrismaClient, Prisma } from "@prisma/client";
import {
  CreateSimulationAttemptInput,
  CompleteSimulationAttemptInput,
  UpdateSimulationAttemptInput,
} from "./simulation-attempt.schema";
import { randomBytes } from "crypto";
import { createAIFeedbackService, AIProvider } from "./ai-feedback.service";
import { livekitVoiceService } from "../../services/livekit-voice.service";
import {
  TranscriptProcessorService,
  VoiceAgentTranscript,
} from "../../services/transcript-processor.service";
import { StudentCasePracticeService } from "../student-case-practice/student-case-practice.service";
import { FastifyBaseLogger } from 'fastify';

export class SimulationAttemptService {
  private aiFeedbackService: ReturnType<typeof createAIFeedbackService>;
  private studentCasePracticeService: StudentCasePracticeService;
  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {
    this.aiFeedbackService = createAIFeedbackService({
      provider: AIProvider.GROQ,
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-120b',
      log: this.log,
    });
    this.studentCasePracticeService = new StudentCasePracticeService(prisma);
  }

  private generateCorrelationToken(): string {
    // Generate a URL-safe token
    return `sim_${randomBytes(16).toString("hex")}_${Date.now()}`;
  }

  async create(data: CreateSimulationAttemptInput) {
    const createStartTime = Date.now();

    // =========================================================================
    // SIMULATION CREATE - INIT
    // =========================================================================
    this.log.info({
      studentId: data.studentId,
      simulationId: data.simulationId,
      voiceId: data.voiceId || 'Ashley (default)',
      lifecycle: 'SIMULATION_CREATE',
      stage: 'INIT',
      step: 'START',
      action: 'CREATE_STARTED',
    }, '=== SIMULATION CREATE STARTED ===');

    // =========================================================================
    // STEP 1: Validate Student
    // =========================================================================
    this.log.info({
      studentId: data.studentId,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'VALIDATION',
      step: '1/4',
      action: 'STUDENT_VALIDATION_START',
    }, '[STEP 1/4] Validating student');

    const studentQueryStart = Date.now();
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
      include: {
        user: true,
      },
    });
    const studentQueryDurationMs = Date.now() - studentQueryStart;

    if (!student) {
      this.log.error({
        studentId: data.studentId,
        queryDurationMs: studentQueryDurationMs,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'VALIDATION',
        step: '1/4',
        action: 'STUDENT_NOT_FOUND',
      }, '[STEP 1/4] Student not found');
      throw new Error("Student not found");
    }

    const studentEmail = student.user.email || 'unknown';

    this.log.info({
      studentId: student.id,
      studentEmail,
      studentName: `${student.firstName} ${student.lastName}`,
      isAdmin: student.user.isAdmin,
      creditBalance: student.creditBalance,
      userId: student.user.id,
      queryDurationMs: studentQueryDurationMs,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'VALIDATION',
      step: '1/4',
      action: 'STUDENT_VALIDATED',
    }, '[STEP 1/4] Student validated successfully');

    // =========================================================================
    // STEP 2: Validate Simulation & Case
    // =========================================================================
    this.log.info({
      simulationId: data.simulationId,
      studentEmail,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'VALIDATION',
      step: '2/4',
      action: 'SIMULATION_VALIDATION_START',
    }, '[STEP 2/4] Validating simulation and case');

    const simulationQueryStart = Date.now();
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: data.simulationId },
      include: {
        courseCase: {
          include: {
            course: true,
          },
        },
      },
    });
    const simulationQueryDurationMs = Date.now() - simulationQueryStart;

    if (!simulation) {
      this.log.error({
        simulationId: data.simulationId,
        studentEmail,
        queryDurationMs: simulationQueryDurationMs,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'VALIDATION',
        step: '2/4',
        action: 'SIMULATION_NOT_FOUND',
      }, '[STEP 2/4] Simulation not found');
      throw new Error("Simulation not found");
    }

    this.log.info({
      simulationId: simulation.id,
      studentEmail,
      caseId: simulation.courseCase.id,
      caseTitle: simulation.courseCase.title,
      patientName: simulation.courseCase.patientName,
      diagnosis: simulation.courseCase.diagnosis,
      courseId: simulation.courseCase.course.id,
      courseTitle: simulation.courseCase.course.title,
      hasSystemPrompt: !!simulation.casePrompt,
      systemPromptLength: simulation.casePrompt?.length || 0,
      hasOpeningLine: !!simulation.openingLine,
      openingLineLength: simulation.openingLine?.length || 0,
      queryDurationMs: simulationQueryDurationMs,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'VALIDATION',
      step: '2/4',
      action: 'SIMULATION_VALIDATED',
    }, '[STEP 2/4] Simulation validated successfully');

    // Credit check
    if (!student.user.isAdmin) {
      this.log.debug({
        studentEmail,
        creditBalance: student.creditBalance,
        required: 1,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'VALIDATION',
        step: '2/4',
        action: 'CREDIT_CHECK_START',
      }, '[STEP 2/4] Checking student credits');

      if (student.creditBalance < 1) {
        this.log.error({
          studentId: student.id,
          studentEmail,
          creditBalance: student.creditBalance,
          required: 1,
          lifecycle: 'SIMULATION_CREATE',
          stage: 'VALIDATION',
          step: '2/4',
          action: 'INSUFFICIENT_CREDITS',
        }, '[STEP 2/4] Insufficient credits');
        throw new Error(
          `Insufficient credits. You need at least 1 credit to start. Current balance: ${student.creditBalance}`
        );
      }

      this.log.info({
        studentEmail,
        creditBalance: student.creditBalance,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'VALIDATION',
        step: '2/4',
        action: 'CREDIT_CHECK_PASSED',
      }, '[STEP 2/4] Credit check passed');
    } else {
      this.log.info({
        studentEmail,
        isAdmin: true,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'VALIDATION',
        step: '2/4',
        action: 'CREDIT_CHECK_BYPASSED',
      }, '[STEP 2/4] Admin user - bypassing credit check');
    }

    // =========================================================================
    // STEP 3: Create Simulation Attempt Record
    // =========================================================================
    const correlationToken = this.generateCorrelationToken();

    this.log.info({
      studentEmail,
      studentId: data.studentId,
      simulationId: data.simulationId,
      correlationToken,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'DATABASE',
      step: '3/4',
      action: 'ATTEMPT_CREATE_START',
    }, '[STEP 3/4] Creating simulation attempt record');

    const attemptCreateStart = Date.now();
    const attempt = await this.prisma.simulationAttempt.create({
      data: {
        studentId: data.studentId,
        simulationId: data.simulationId,
        startedAt: new Date(),
        correlationToken: correlationToken,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const attemptCreateDurationMs = Date.now() - attemptCreateStart;

    this.log.info({
      attemptId: attempt.id,
      studentEmail,
      correlationToken,
      studentId: attempt.studentId,
      simulationId: attempt.simulationId,
      startedAt: attempt.startedAt,
      isAdmin: student.user.isAdmin,
      billingMode: student.user.isAdmin ? 'NO_CHARGE' : 'PER_MINUTE',
      dbInsertDurationMs: attemptCreateDurationMs,
      lifecycle: 'SIMULATION_CREATE',
      stage: 'DATABASE',
      step: '3/4',
      action: 'ATTEMPT_CREATED',
    }, '[STEP 3/4] Simulation attempt record created');

    // =========================================================================
    // STEP 4: Create LiveKit Voice Session
    // =========================================================================
    try {
      const voiceId = data.voiceId || "Ashley";

      this.log.info({
        attemptId: attempt.id,
        studentEmail,
        correlationToken,
        voiceId,
        userIdentifier: student.user.email || student.user.id,
        hasSystemPrompt: !!attempt.simulation.casePrompt,
        systemPromptLength: attempt.simulation.casePrompt?.length || 0,
        hasOpeningLine: !!attempt.simulation.openingLine,
        openingLinePreview: attempt.simulation.openingLine?.substring(0, 100) || null,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'LIVEKIT',
        step: '4/4',
        action: 'LIVEKIT_CREATE_START',
      }, '[STEP 4/4] Creating LiveKit voice session');

      const livekitCreateStart = Date.now();
      const livekitConfig = await livekitVoiceService.createSession(
        correlationToken,
        String(student.user.email || student.user.id),
        {
          systemPrompt: attempt.simulation.casePrompt,
          openingLine: attempt.simulation.openingLine,
          voiceId: voiceId,
        }
      );
      const livekitCreateDurationMs = Date.now() - livekitCreateStart;

      this.log.info({
        attemptId: attempt.id,
        studentEmail,
        correlationToken,
        roomName: livekitConfig.roomName,
        serverUrl: livekitConfig.serverUrl,
        voiceId,
        tokenLength: livekitConfig.token?.length || 0,
        livekitApiDurationMs: livekitCreateDurationMs,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'LIVEKIT',
        step: '4/4',
        action: 'LIVEKIT_CREATE_SUCCESS',
      }, '[STEP 4/4] LiveKit voice session created successfully');

      const result = {
        ...attempt,
        voiceAssistantConfig: {
          token: livekitConfig.token, // LiveKit JWT
          correlationToken: correlationToken, // Our correlation token
          wsEndpoint: livekitConfig.serverUrl, // LiveKit server URL
          roomName: livekitConfig.roomName, // LiveKit room name (from Python orchestrator)
        },
        isAdmin: student.user.isAdmin,
      };

      const totalCreateDurationMs = Date.now() - createStartTime;

      this.log.info({
        attemptId: attempt.id,
        studentEmail,
        correlationToken,
        roomName: livekitConfig.roomName,
        studentId: attempt.studentId,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        simulationId: attempt.simulationId,
        caseTitle: attempt.simulation.courseCase.title,
        voiceId,
        isAdmin: student.user.isAdmin,
        billingMode: student.user.isAdmin ? 'NO_CHARGE' : 'PER_MINUTE',
        totalDurationMs: totalCreateDurationMs,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'COMPLETE',
        step: 'COMPLETE',
        action: 'CREATE_SUCCESS',
      }, '=== SIMULATION CREATE COMPLETED SUCCESSFULLY ===');

      return result;
    } catch (error: any) {
      const totalCreateDurationMs = Date.now() - createStartTime;

      this.log.error({
        err: error,
        attemptId: attempt.id,
        studentEmail,
        correlationToken,
        errorType: error.constructor?.name || 'Unknown',
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, 500),
        totalDurationMs: totalCreateDurationMs,
        lifecycle: 'SIMULATION_CREATE',
        stage: 'LIVEKIT',
        step: '4/4',
        action: 'LIVEKIT_CREATE_ERROR',
      }, '[STEP 4/4] Failed to create LiveKit session');
      throw new Error(`Failed to start voice session: ${error.message}`);
    }
  }

  async complete(id: string, data: CompleteSimulationAttemptInput) {
    // Check if attempt exists and is not already completed
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { id },
      include: {
        simulation: true,
      },
    });

    if (!attempt) {
      throw new Error("Simulation attempt not found");
    }

    if (attempt.isCompleted) {
      throw new Error("Simulation attempt is already completed");
    }

    // Close the LiveKit session if it exists
    if (attempt.correlationToken) {
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[SimulationAttempt] Closing LiveKit session for attempt');
      await livekitVoiceService.endSession(attempt.correlationToken);
      this.log.info({ attemptId: id }, '[SimulationAttempt] LiveKit session end request sent');
    }

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - attempt.startedAt.getTime()) / 1000
    );

    return await this.prisma.simulationAttempt.update({
      where: { id },
      data: {
        endedAt: endTime,
        durationSeconds: durationSeconds,
        isCompleted: true,
        score: data.score,
        aiFeedback: data.aiFeedback,
        transcript: data.transcript,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async cancel(id: string): Promise<void> {
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        simulation: true,
      },
    });

    if (!attempt) {
      throw new Error("Simulation attempt not found");
    }

    if (attempt.isCompleted) {
      throw new Error("Cannot cancel a completed simulation attempt");
    }

    // Force close the LiveKit session (this commits transcript to database)
    if (attempt.correlationToken) {
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[SimulationAttempt] Cancelling attempt, closing LiveKit session');
      await livekitVoiceService.endSession(attempt.correlationToken);
      this.log.info({ attemptId: id }, '[SimulationAttempt] LiveKit session ended');
    }

    // Fetch the attempt again to get the transcript that was just saved by session end
    const attemptWithTranscript =
      await this.prisma.simulationAttempt.findUnique({
        where: { id },
      });

    // Process transcript to clean format for consistency (same as completeWithTranscript)
    let cleanTranscript: Prisma.InputJsonValue | null = null;

    if (attemptWithTranscript?.transcript) {
      try {
        this.log.info({ attemptId: id }, '[SimulationAttempt] Processing transcript to clean format...');
        const voiceTranscript =
          attemptWithTranscript.transcript as unknown as VoiceAgentTranscript;
        const processedTranscript =
          TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
        cleanTranscript =
          processedTranscript as unknown as Prisma.InputJsonValue;
        this.log.info({ totalMessages: processedTranscript.totalMessages, duration: processedTranscript.duration }, '[SimulationAttempt] Transcript processed');
      } catch (error) {
        this.log.error({ err: error }, '[SimulationAttempt] Failed to process transcript');
        // Keep original transcript if processing fails
        cleanTranscript = attemptWithTranscript.transcript;
      }
    }

    // Mark as ended but not completed
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - attempt.startedAt.getTime()) / 1000
    );

    await this.prisma.simulationAttempt.update({
      where: { id },
      data: {
        endedAt,
        durationSeconds,
        isCompleted: false,
        transcript: cleanTranscript || undefined, // Save clean transcript format (undefined if no transcript)
        aiFeedback: {
          cancelled: true,
          reason: "Manually cancelled",
          timestamp: endedAt.toISOString(),
          isAdminAttempt: attempt.student.user.isAdmin,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.log.info({ attemptId: id }, '[SimulationAttempt] Attempt cancelled successfully');
  }

  async findAll(query?: {
    completed?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });
  }

  async findById(id: string) {
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new Error("Simulation attempt not found");
    }

    return attempt;
  }

  async findByCorrelationToken(correlationToken: string) {
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { correlationToken },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new Error("Simulation attempt not found");
    }

    return attempt;
  }

  async findByStudent(
    studentId: string,
    query?: { completed?: boolean; limit?: number; offset?: number }
  ) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new Error("Student not found");
    }

    const where: any = { studentId };
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              select: {
                id: true,
                slug: true,
                title: true,
                diagnosis: true,
                patientName: true,
                patientAge: true,
                patientGender: true,
                course: {
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    examId: true,
                    exam: {
                      select: {
                        id: true,
                        slug: true,
                        title: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });
  }

  async findBySimulation(
    simulationId: string,
    query?: { completed?: boolean; limit?: number; offset?: number }
  ) {
    // Verify simulation exists
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: simulationId },
    });

    if (!simulation) {
      throw new Error("Simulation not found");
    }

    const where: any = { simulationId };
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });
  }

  async update(id: string, data: UpdateSimulationAttemptInput) {
    // Check if attempt exists
    await this.findById(id);

    return await this.prisma.simulationAttempt.update({
      where: { id },
      data,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async delete(id: string) {
    // Check if attempt exists
    const attempt = await this.findById(id);

    // Check if student is admin
    const student = await this.prisma.student.findUnique({
      where: { id: attempt.studentId },
      include: { user: true },
    });

    // Close the LiveKit session if it exists
    if (attempt.correlationToken) {
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[SimulationAttempt] Deleting attempt, closing LiveKit session');
      await livekitVoiceService.endSession(attempt.correlationToken);
    }

    // If attempt was not completed and student is not admin, refund credits
    if (!attempt.isCompleted && !student?.user.isAdmin) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Get current student credit balance
        const currentStudent = await tx.student.findUnique({
          where: { id: attempt.studentId },
        });

        if (currentStudent) {
          // Refund credits
          await tx.student.update({
            where: { id: attempt.studentId },
            data: {
              creditBalance:
                currentStudent.creditBalance + attempt.simulation.creditCost,
            },
          });
        }

        // Delete the attempt
        await tx.simulationAttempt.delete({
          where: { id },
        });
      });
    } else {
      // Just delete if completed or admin (no refund)
      await this.prisma.simulationAttempt.delete({
        where: { id },
      });
    }

    this.log.info({ attemptId: id }, '[SimulationAttempt] Attempt deleted successfully');
  }

  // BUSINESS LOGIC METHODS

  async getStudentStats(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new Error("Student not found");
    }

    const totalAttempts = await this.prisma.simulationAttempt.count({
      where: { studentId },
    });

    const completedAttempts = await this.prisma.simulationAttempt.count({
      where: { studentId, isCompleted: true },
    });

    const incompleteAttempts = totalAttempts - completedAttempts;

    const scoreStats = await this.prisma.simulationAttempt.aggregate({
      where: { studentId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true },
    });

    const durationStats = await this.prisma.simulationAttempt.aggregate({
      where: { studentId, isCompleted: true },
      _avg: { durationSeconds: true },
      _min: { durationSeconds: true },
      _max: { durationSeconds: true },
    });

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      currentCreditBalance: student.user.isAdmin
        ? 999999
        : student.creditBalance,
      isAdmin: student.user.isAdmin,
      totalAttempts,
      completedAttempts,
      incompleteAttempts,
      completionRate:
        totalAttempts > 0
          ? Math.round((completedAttempts / totalAttempts) * 100)
          : 0,
      scoreStats: {
        average: scoreStats._avg.score
          ? Number(scoreStats._avg.score.toFixed(1))
          : null,
        minimum: scoreStats._min.score ? Number(scoreStats._min.score) : null,
        maximum: scoreStats._max.score ? Number(scoreStats._max.score) : null,
      },
      durationStats: {
        averageSeconds: durationStats._avg.durationSeconds
          ? Math.round(durationStats._avg.durationSeconds)
          : null,
        minimumSeconds: durationStats._min.durationSeconds,
        maximumSeconds: durationStats._max.durationSeconds,
      },
    };
  }

  async getSimulationStats(simulationId: string) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: simulationId },
      include: {
        courseCase: true,
      },
    });

    if (!simulation) {
      throw new Error("Simulation not found");
    }

    const totalAttempts = await this.prisma.simulationAttempt.count({
      where: { simulationId },
    });

    const completedAttempts = await this.prisma.simulationAttempt.count({
      where: { simulationId, isCompleted: true },
    });

    const uniqueStudents = await this.prisma.simulationAttempt.findMany({
      where: { simulationId },
      select: { studentId: true },
      distinct: ["studentId"],
    });

    const scoreStats = await this.prisma.simulationAttempt.aggregate({
      where: { simulationId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true },
    });

    return {
      simulationId,
      caseTitle: simulation.courseCase.title,
      totalAttempts,
      completedAttempts,
      incompleteAttempts: totalAttempts - completedAttempts,
      uniqueStudents: uniqueStudents.length,
      completionRate:
        totalAttempts > 0
          ? Math.round((completedAttempts / totalAttempts) * 100)
          : 0,
      scoreStats: {
        average: scoreStats._avg.score
          ? Number(scoreStats._avg.score.toFixed(1))
          : null,
        minimum: scoreStats._min.score ? Number(scoreStats._min.score) : null,
        maximum: scoreStats._max.score ? Number(scoreStats._max.score) : null,
      },
    };
  }

  // DEPRECATED: Now using TranscriptProcessorService.transformToCleanFormat()
  // This method was used with the old API-based transcript fetching
  /*
  private transformTranscript = (
    api: VoiceAssistantTranscriptApi,
  ): TranscriptClean => ({
    messages: api.messages.map(({ timestamp, speaker, message }) => ({
      timestamp,
      speaker: speaker === 'participant' ? 'student' : 'ai_patient',
      message,
    })),
    duration: api.duration_seconds ?? 0,
    totalMessages: api.total_messages,
  });
  */

  async completeWithTranscript(
    attemptId: string,
    correlationToken: string
  ): Promise<any> {
    const startTime = Date.now();

    this.log.info({
      attemptId,
      correlationToken,
      operation: 'completeWithTranscript',
      lifecycle: 'SIMULATION_COMPLETE',
      stage: 'INIT',
    }, '=== SIMULATION COMPLETION STARTED ===');

    // =========================================================================
    // STEP 1: End the LiveKit voice session
    // =========================================================================
    this.log.info({
      attemptId,
      correlationToken,
      lifecycle: 'SIMULATION_COMPLETE',
      stage: 'LIVEKIT',
      step: '1/6',
      action: 'LIVEKIT_END_SESSION',
    }, '[STEP 1/6] Ending LiveKit voice session');

    let livekitEndTime: number;
    try {
      const livekitStartTime = Date.now();
      const endResult = await livekitVoiceService.endSession(correlationToken) as { status: string; message?: string };
      livekitEndTime = Date.now() - livekitStartTime;

      if (endResult.status === "error") {
        this.log.warn({
          attemptId,
          correlationToken,
          livekitStatus: endResult.status,
          livekitMessage: endResult.message,
          durationMs: livekitEndTime,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'LIVEKIT',
          step: '1/6',
          action: 'LIVEKIT_END_SESSION_WARNING',
        }, '[STEP 1/6] LiveKit returned error - will check for existing transcript');
      } else {
        this.log.info({
          attemptId,
          correlationToken,
          livekitStatus: endResult.status,
          durationMs: livekitEndTime,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'LIVEKIT',
          step: '1/6',
          action: 'LIVEKIT_END_SESSION_SUCCESS',
        }, '[STEP 1/6] LiveKit session ended successfully');
      }
    } catch (livekitError) {
      this.log.error({
        err: livekitError,
        attemptId,
        correlationToken,
        errorType: livekitError instanceof Error ? livekitError.constructor.name : 'Unknown',
        errorMessage: livekitError instanceof Error ? livekitError.message : String(livekitError),
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'LIVEKIT',
        step: '1/6',
        action: 'LIVEKIT_END_SESSION_ERROR',
      }, '[STEP 1/6] LiveKit session end failed - will attempt to continue');
      // Continue anyway - transcript might already be saved
    }

    // =========================================================================
    // STEP 2: Poll database for transcript with retry logic
    // =========================================================================
    const maxRetries = 5;
    const retryDelayMs = 1000;
    let existingAttempt: any = null;
    let transcriptFound = false;

    this.log.info({
      attemptId,
      maxRetries,
      retryDelayMs,
      totalWaitTimeMs: maxRetries * retryDelayMs,
      lifecycle: 'SIMULATION_COMPLETE',
      stage: 'TRANSCRIPT',
      step: '2/6',
      action: 'TRANSCRIPT_POLL_START',
    }, '[STEP 2/6] Polling for transcript in database');

    for (let retryAttempt = 1; retryAttempt <= maxRetries; retryAttempt++) {
      const pollStartTime = Date.now();

      this.log.debug({
        attemptId,
        retryAttempt,
        maxRetries,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'TRANSCRIPT',
        step: '2/6',
        action: 'TRANSCRIPT_POLL_ATTEMPT',
      }, `[STEP 2/6] Transcript poll attempt ${retryAttempt}/${maxRetries}`);

      existingAttempt = await this.prisma.simulationAttempt.findUnique({
        where: { id: attemptId },
        include: {
          student: {
            include: {
              user: true,
            },
          },
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: {
                    include: {
                      exam: true,
                    },
                  },
                  caseTabs: true,
                  markingCriteria: {
                    include: {
                      markingDomain: true,
                    },
                    orderBy: [
                      { markingDomain: { name: "asc" } },
                      { displayOrder: "asc" },
                    ],
                  },
                },
              },
            },
          },
        },
      });

      const pollDurationMs = Date.now() - pollStartTime;

      if (!existingAttempt) {
        this.log.error({
          attemptId,
          retryAttempt,
          pollDurationMs,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'TRANSCRIPT',
          step: '2/6',
          action: 'ATTEMPT_NOT_FOUND',
        }, '[STEP 2/6] FATAL: Simulation attempt not found in database');
        throw new Error(`Simulation attempt not found: ${attemptId}`);
      }

      if (existingAttempt.isCompleted) {
        this.log.error({
          attemptId,
          completedAt: existingAttempt.endedAt,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'TRANSCRIPT',
          step: '2/6',
          action: 'ATTEMPT_ALREADY_COMPLETED',
        }, '[STEP 2/6] FATAL: Attempt already marked as completed');
        throw new Error(`Simulation attempt is already completed: ${attemptId}`);
      }

      // Check if transcript exists
      if (existingAttempt.transcript) {
        transcriptFound = true;
        this.log.info({
          attemptId,
          retryAttempt,
          maxRetries,
          pollDurationMs,
          hasTranscript: true,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'TRANSCRIPT',
          step: '2/6',
          action: 'TRANSCRIPT_FOUND',
        }, '[STEP 2/6] Transcript found in database');
        break;
      }

      // Transcript not found yet, wait and retry
      if (retryAttempt < maxRetries) {
        this.log.debug({
          attemptId,
          retryAttempt,
          nextRetryIn: retryDelayMs,
          remainingRetries: maxRetries - retryAttempt,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'TRANSCRIPT',
          step: '2/6',
          action: 'TRANSCRIPT_POLL_WAIT',
        }, `[STEP 2/6] Transcript not found, waiting ${retryDelayMs}ms before retry`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    // Final check after all retries
    if (!transcriptFound) {
      this.log.error({
        attemptId,
        correlationToken,
        maxRetries,
        totalWaitTimeMs: maxRetries * retryDelayMs,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'TRANSCRIPT',
        step: '2/6',
        action: 'TRANSCRIPT_NOT_FOUND',
      }, '[STEP 2/6] FATAL: Transcript not found after all retries');
      throw new Error(
        `Transcript not found after ${maxRetries} attempts (${(maxRetries * retryDelayMs) / 1000}s). ` +
        `AttemptId: ${attemptId}, CorrelationToken: ${correlationToken}. ` +
        `The LiveKit orchestrator may have failed to save the transcript.`
      );
    }
    const voiceTranscript =
      existingAttempt.transcript as unknown as VoiceAgentTranscript;

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000
    );

    // Extract student email for logging (available after fetching attempt)
    const studentEmail = existingAttempt.student.user.email || 'unknown';

    this.log.info({
      attemptId,
      studentId: existingAttempt.studentId,
      studentEmail,
      studentName: `${existingAttempt.student.firstName} ${existingAttempt.student.lastName}`,
      isAdmin: existingAttempt.student.user.isAdmin,
      simulationId: existingAttempt.simulationId,
      caseTitle: existingAttempt.simulation.courseCase.title,
      startedAt: existingAttempt.startedAt,
      durationSeconds,
      lifecycle: 'SIMULATION_COMPLETE',
      stage: 'TRANSCRIPT',
      step: '2/6',
      action: 'TRANSCRIPT_DATA_LOADED',
    }, '[STEP 2/6] Transcript data retrieved');

    try {
      // =========================================================================
      // STEP 3: Process and clean the transcript
      // =========================================================================
      this.log.info({
        attemptId,
        studentEmail,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'TRANSCRIPT',
        step: '3/6',
        action: 'TRANSCRIPT_PROCESSING_START',
      }, '[STEP 3/6] Processing transcript - transforming to clean format');

      const transcriptProcessStartTime = Date.now();
      const cleanTranscript =
        TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
      const transcriptProcessDurationMs = Date.now() - transcriptProcessStartTime;

      this.log.info({
        attemptId,
        studentEmail,
        totalMessages: cleanTranscript.totalMessages,
        transcriptDurationSeconds: cleanTranscript.duration,
        sessionDurationSeconds: durationSeconds,
        processingTimeMs: transcriptProcessDurationMs,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'TRANSCRIPT',
        step: '3/6',
        action: 'TRANSCRIPT_PROCESSING_SUCCESS',
      }, '[STEP 3/6] Transcript processed successfully');

      // =========================================================================
      // STEP 4: Extract case data and marking criteria
      // =========================================================================
      this.log.info({
        attemptId,
        studentEmail,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'CASE_DATA',
        step: '4/6',
        action: 'CASE_DATA_EXTRACTION_START',
      }, '[STEP 4/6] Extracting case data and marking criteria');

      // Extract case tabs (doctor's notes, patient script, medical notes)
      interface CaseTabs {
        doctorsNote: string[];
        patientScript: string[];
        medicalNotes: string[];
      }

      const caseTabs: CaseTabs = {
        doctorsNote: [],
        patientScript: [],
        medicalNotes: [],
      };

      existingAttempt.simulation.courseCase.caseTabs.forEach(
        (tab: { tabType: string; content: string[] }) => {
          switch (tab.tabType) {
            case "DOCTORS_NOTE":
              caseTabs.doctorsNote = tab.content;
              break;
            case "PATIENT_SCRIPT":
              caseTabs.patientScript = tab.content;
              break;
            case "MEDICAL_NOTES":
              caseTabs.medicalNotes = tab.content;
              break;
          }
        }
      );

      // Group marking criteria by domain
      interface MarkingDomainWithCriteria {
        domainId: string;
        domainName: string;
        criteria: {
          id: string;
          text: string;
          points: number;
          displayOrder: number;
        }[];
      }

      const domainsMap = new Map<string, MarkingDomainWithCriteria>();

      existingAttempt.simulation.courseCase.markingCriteria.forEach(
        (criterion: {
          id: string;
          text: string;
          points: number;
          displayOrder: number;
          markingDomain: { id: string; name: string };
        }) => {
          const domainId = criterion.markingDomain.id;

          if (!domainsMap.has(domainId)) {
            domainsMap.set(domainId, {
              domainId: criterion.markingDomain.id,
              domainName: criterion.markingDomain.name,
              criteria: [],
            });
          }

          domainsMap.get(domainId)!.criteria.push({
            id: criterion.id,
            text: criterion.text,
            points: criterion.points,
            displayOrder: criterion.displayOrder,
          });
        }
      );

      const markingDomainsWithCriteria = Array.from(domainsMap.values());
      const totalCriteria = markingDomainsWithCriteria.reduce((sum, d) => sum + d.criteria.length, 0);
      const totalPossiblePoints = markingDomainsWithCriteria.reduce(
        (sum, d) => sum + d.criteria.reduce((cs, c) => cs + c.points, 0), 0
      );

      // Prepare case info
      const caseInfo = {
        patientName: existingAttempt.simulation.courseCase.patientName,
        diagnosis: existingAttempt.simulation.courseCase.diagnosis,
        caseTitle: existingAttempt.simulation.courseCase.title,
        patientAge: existingAttempt.simulation.courseCase.patientAge,
        patientGender: existingAttempt.simulation.courseCase.patientGender,
      };

      this.log.info({
        attemptId,
        studentEmail,
        caseTitle: caseInfo.caseTitle,
        patientName: caseInfo.patientName,
        diagnosis: caseInfo.diagnosis,
        markingDomainsCount: markingDomainsWithCriteria.length,
        totalCriteria,
        totalPossiblePoints,
        hasDoctorsNote: caseTabs.doctorsNote.length > 0,
        hasPatientScript: caseTabs.patientScript.length > 0,
        hasMedicalNotes: caseTabs.medicalNotes.length > 0,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'CASE_DATA',
        step: '4/6',
        action: 'CASE_DATA_EXTRACTION_SUCCESS',
      }, '[STEP 4/6] Case data extracted successfully');

      let aiFeedback: Prisma.InputJsonValue | null = null;
      let score: number | null = null;
      let aiPrompt: Prisma.InputJsonValue | null = null;

      // =========================================================================
      // STEP 5: Generate AI feedback using Groq/OpenAI
      // =========================================================================
      this.log.info({
        attemptId,
        studentEmail,
        provider: 'Groq',
        model: 'openai/gpt-oss-120b',
        transcriptMessages: cleanTranscript.totalMessages,
        markingDomainsCount: markingDomainsWithCriteria.length,
        totalCriteria,
        totalPossiblePoints,
        durationSeconds,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'AI_FEEDBACK',
        step: '5/6',
        action: 'AI_FEEDBACK_START',
      }, '[STEP 5/6] Starting AI feedback generation');

      try {
        const aiStartTime = Date.now();

        const {
          feedback,
          score: calculatedScore,
          prompts,
          markingStructure,
        } = await this.aiFeedbackService.generateFeedback(
          cleanTranscript,
          caseInfo,
          caseTabs,
          durationSeconds,
          markingDomainsWithCriteria
        );

        const aiDurationMs = Date.now() - aiStartTime;

        // Include full marking structure in the feedback
        aiFeedback = {
          ...feedback,
          analysisStatus: "success",
          generatedAt: new Date().toISOString(),
          caseTabsProvided: {
            doctorsNote: caseTabs.doctorsNote.length > 0,
            patientScript: caseTabs.patientScript.length > 0,
            medicalNotes: caseTabs.medicalNotes.length > 0,
          },
          totalMarkingCriteria:
            existingAttempt.simulation.courseCase.markingCriteria.length,
          markingDomainsCount: markingDomainsWithCriteria.length,
          markingStructure: markingStructure,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
        } as unknown as Prisma.InputJsonValue;

        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;

        this.log.info({
          attemptId,
          studentEmail,
          score,
          classification: feedback.overallResult?.classificationLabel,
          criteriaMet: feedback.overallResult?.criteriaMet,
          criteriaNotMet: feedback.overallResult?.criteriaNotMet,
          criteriaTotal: feedback.overallResult?.totalCriteria,
          percentageMet: feedback.overallResult?.percentageMet,
          aiDurationMs,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'AI_FEEDBACK',
          step: '5/6',
          action: 'AI_FEEDBACK_SUCCESS',
        }, '[STEP 5/6] AI feedback generated successfully');
      } catch (aiError) {
        const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
        const aiErrorStack = aiError instanceof Error ? aiError.stack : undefined;

        this.log.error({
          err: aiError,
          attemptId,
          studentEmail,
          correlationToken,
          errorType: aiError instanceof Error ? aiError.constructor.name : 'Unknown',
          errorMessage: aiErrorMessage,
          errorStack: aiErrorStack,
          markingDomainsCount: markingDomainsWithCriteria.length,
          totalCriteria,
          transcriptMessages: cleanTranscript.totalMessages,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'AI_FEEDBACK',
          step: '5/6',
          action: 'AI_FEEDBACK_ERROR',
        }, '[STEP 5/6] AI feedback generation FAILED - will save attempt with fallback feedback');

        aiFeedback = {
          analysisStatus: "failed",
          error: aiErrorMessage,
          errorType: aiError instanceof Error ? aiError.constructor.name : 'Unknown',
          generatedAt: new Date().toISOString(),
          markingStructure: markingDomainsWithCriteria,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
          fallbackFeedback: this.generateFallbackFeedback(),
        } as unknown as Prisma.InputJsonValue;
      }

      // =========================================================================
      // STEP 6: Save completed attempt to database
      // =========================================================================
      this.log.info({
        attemptId,
        studentEmail,
        score,
        durationSeconds,
        hasAiFeedback: !!aiFeedback,
        aiFeedbackStatus: (aiFeedback as any)?.analysisStatus || 'unknown',
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'SAVE',
        step: '6/6',
        action: 'DATABASE_SAVE_START',
      }, '[STEP 6/6] Saving completed attempt to database');

      const dbSaveStartTime = Date.now();
      const updatedAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: cleanTranscript as unknown as Prisma.InputJsonValue,
          aiFeedback,
          aiPrompt: aiPrompt || undefined,
          score,
        },
        include: {
          student: true,
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
      });
      const dbSaveDurationMs = Date.now() - dbSaveStartTime;

      this.log.info({
        attemptId,
        studentEmail,
        score,
        durationSeconds,
        isCompleted: true,
        dbSaveDurationMs,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'SAVE',
        step: '6/6',
        action: 'DATABASE_SAVE_SUCCESS',
      }, '[STEP 6/6] Attempt saved to database successfully');

      // Update student's practice status for this case (non-critical)
      try {
        this.log.debug({
          attemptId,
          studentId: updatedAttempt.studentId,
          courseCaseId: updatedAttempt.simulation.courseCaseId,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'FINALIZE',
          step: '6/6',
          action: 'PRACTICE_STATUS_UPDATE_START',
        }, 'Updating student practice status');

        await this.studentCasePracticeService.updatePracticeStatus(
          updatedAttempt.studentId,
          updatedAttempt.simulation.courseCaseId
        );

        this.log.info({
          attemptId,
          studentId: updatedAttempt.studentId,
          courseCaseId: updatedAttempt.simulation.courseCaseId,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'FINALIZE',
          step: '6/6',
          action: 'PRACTICE_STATUS_UPDATE_SUCCESS',
        }, 'Practice status updated successfully');
      } catch (practiceError) {
        // Log but don't fail the main operation
        this.log.error({
          err: practiceError,
          attemptId,
          studentId: updatedAttempt.studentId,
          courseCaseId: updatedAttempt.simulation.courseCaseId,
          errorType: practiceError instanceof Error ? practiceError.constructor.name : 'Unknown',
          errorMessage: practiceError instanceof Error ? practiceError.message : String(practiceError),
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'FINALIZE',
          step: '6/6',
          action: 'PRACTICE_STATUS_UPDATE_ERROR',
        }, 'Practice status update failed (non-critical)');
      }

      const totalDurationMs = Date.now() - startTime;

      this.log.info({
        attemptId,
        studentEmail,
        correlationToken,
        studentId: updatedAttempt.studentId,
        studentName: `${updatedAttempt.student.firstName} ${updatedAttempt.student.lastName}`,
        caseTitle: updatedAttempt.simulation.courseCase.title,
        score,
        durationSeconds,
        totalProcessingTimeMs: totalDurationMs,
        aiFeedbackStatus: (aiFeedback as any)?.analysisStatus || 'unknown',
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'FINALIZE',
        step: 'COMPLETE',
        action: 'COMPLETION_SUCCESS',
      }, '=== SIMULATION COMPLETION FINISHED SUCCESSFULLY ===');

      return updatedAttempt;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';

      this.log.error({
        err: error,
        attemptId,
        studentEmail,
        correlationToken,
        errorType,
        errorMessage,
        errorStack,
        durationSeconds,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'ERROR_RECOVERY',
        step: 'ERROR_RECOVERY',
        action: 'COMPLETION_ERROR_RECOVERY_START',
      }, '=== SIMULATION COMPLETION ERROR - ENTERING RECOVERY MODE ===');

      // =========================================================================
      // ERROR RECOVERY: Try to save transcript even if AI feedback fails
      // =========================================================================
      let transcriptToSave: Prisma.InputJsonValue | undefined;
      let transcriptRecoverySuccess = false;

      try {
        this.log.info({
          attemptId,
          hasRawTranscript: !!existingAttempt?.transcript,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'ERROR_RECOVERY',
          step: 'ERROR_RECOVERY',
          action: 'TRANSCRIPT_RECOVERY_START',
        }, 'Attempting transcript recovery - cleaning raw transcript');

        const voiceTranscript = existingAttempt.transcript as unknown as VoiceAgentTranscript;
        const cleanTranscript = TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
        transcriptToSave = cleanTranscript as unknown as Prisma.InputJsonValue;
        transcriptRecoverySuccess = true;

        this.log.info({
          attemptId,
          transcriptMessages: cleanTranscript.totalMessages,
          transcriptDuration: cleanTranscript.duration,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'ERROR_RECOVERY',
          step: 'ERROR_RECOVERY',
          action: 'TRANSCRIPT_RECOVERY_SUCCESS',
        }, 'Transcript recovery successful');
      } catch (transcriptError) {
        this.log.error({
          err: transcriptError,
          attemptId,
          errorType: transcriptError instanceof Error ? transcriptError.constructor.name : 'Unknown',
          errorMessage: transcriptError instanceof Error ? transcriptError.message : String(transcriptError),
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'ERROR_RECOVERY',
          step: 'ERROR_RECOVERY',
          action: 'TRANSCRIPT_RECOVERY_ERROR',
        }, 'Transcript recovery FAILED - saving raw transcript as fallback');
        transcriptToSave = existingAttempt?.transcript || undefined;
      }

      // Save attempt with error status
      this.log.info({
        attemptId,
        hasTranscript: !!transcriptToSave,
        transcriptRecoverySuccess,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'ERROR_RECOVERY',
        step: 'ERROR_RECOVERY',
        action: 'ERROR_STATE_SAVE_START',
      }, 'Saving attempt with ERROR status to database');

      const fallbackAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: transcriptToSave,
          aiFeedback: {
            analysisStatus: "failed",
            error: "Simulation completion failed during processing",
            errorType,
            errorDetails: errorMessage,
            errorStack: errorStack?.substring(0, 1000), // Truncate stack trace
            timestamp: new Date().toISOString(),
            transcriptRecovered: transcriptRecoverySuccess,
            fallbackFeedback: this.generateFallbackFeedback(),
          } as unknown as Prisma.InputJsonValue,
        },
        include: {
          student: true,
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
      });

      this.log.warn({
        attemptId,
        durationSeconds,
        hasTranscript: !!transcriptToSave,
        transcriptRecoverySuccess,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'ERROR_RECOVERY',
        step: 'ERROR_RECOVERY',
        action: 'ERROR_STATE_SAVE_SUCCESS',
      }, 'Attempt saved with ERROR status');

      // Still try to update practice status even for failed attempts
      try {
        await this.studentCasePracticeService.updatePracticeStatus(
          fallbackAttempt.studentId,
          fallbackAttempt.simulation.courseCaseId
        );
        this.log.info({
          attemptId,
          studentId: fallbackAttempt.studentId,
          courseCaseId: fallbackAttempt.simulation.courseCaseId,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'ERROR_RECOVERY',
          step: 'ERROR_RECOVERY',
          action: 'PRACTICE_STATUS_UPDATE_ON_ERROR',
        }, 'Practice status updated despite completion error');
      } catch (practiceError) {
        this.log.error({
          err: practiceError,
          attemptId,
          studentId: fallbackAttempt.studentId,
          courseCaseId: fallbackAttempt.simulation.courseCaseId,
          lifecycle: 'SIMULATION_COMPLETE',
          stage: 'ERROR_RECOVERY',
          step: 'ERROR_RECOVERY',
          action: 'PRACTICE_STATUS_ERROR_ON_RECOVERY',
        }, 'Practice status update failed (during error recovery)');
      }

      const totalDurationMs = Date.now() - startTime;

      this.log.error({
        attemptId,
        correlationToken,
        originalError: errorMessage,
        originalErrorType: errorType,
        transcriptRecovered: transcriptRecoverySuccess,
        hasTranscript: !!transcriptToSave,
        durationSeconds,
        totalProcessingTimeMs: totalDurationMs,
        lifecycle: 'SIMULATION_COMPLETE',
        stage: 'ERROR_RECOVERY',
        step: 'ERROR_RECOVERY',
        action: 'COMPLETION_ERROR_FINISHED',
      }, '=== SIMULATION COMPLETION FINISHED WITH ERRORS ===');

      return fallbackAttempt;
    }
  }

  /**
   * ⭐ NEW METHOD: Regenerate feedback for an existing attempt that has a transcript
   * This is used when feedback generation initially failed or needs to be re-run
   */
  async generateFeedbackForExistingAttempt(attemptId: string): Promise<any> {
    this.log.info({ attemptId }, '[SimulationAttempt] Regenerating feedback for attempt');

    // Fetch attempt with all necessary relations
    const existingAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: true,
                  },
                },
                caseTabs: true,
                markingCriteria: {
                  include: {
                    markingDomain: true,
                  },
                  orderBy: [
                    { markingDomain: { name: "asc" } },
                    { displayOrder: "asc" },
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!existingAttempt) {
      throw new Error("Simulation attempt not found");
    }

    // Check if transcript exists
    if (!existingAttempt.transcript) {
      throw new Error(
        "No transcript available for this attempt. Cannot generate feedback without a transcript."
      );
    }

    this.log.info({ attemptId }, '[SimulationAttempt] Transcript found, processing...');
    const voiceTranscript = existingAttempt.transcript as unknown as VoiceAgentTranscript;

    // Process transcript to clean format
    const cleanTranscript = TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
    this.log.info({ totalMessages: cleanTranscript.totalMessages, duration: cleanTranscript.duration }, '[SimulationAttempt] Transcript processed');

    // Calculate duration
    const durationSeconds = existingAttempt.durationSeconds ||
      Math.floor((new Date(existingAttempt.endedAt || new Date()).getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);

    // Extract case tabs
    interface CaseTabs {
      doctorsNote: string[];
      patientScript: string[];
      medicalNotes: string[];
    }

    const caseTabs: CaseTabs = {
      doctorsNote: [],
      patientScript: [],
      medicalNotes: [],
    };

    existingAttempt.simulation.courseCase.caseTabs.forEach((tab) => {
      switch (tab.tabType) {
        case "DOCTORS_NOTE":
          caseTabs.doctorsNote = tab.content;
          break;
        case "PATIENT_SCRIPT":
          caseTabs.patientScript = tab.content;
          break;
        case "MEDICAL_NOTES":
          caseTabs.medicalNotes = tab.content;
          break;
      }
    });

    // Group marking criteria by domain
    interface MarkingDomainWithCriteria {
      domainId: string;
      domainName: string;
      criteria: {
        id: string;
        text: string;
        points: number;
        displayOrder: number;
      }[];
    }

    const domainsMap = new Map<string, MarkingDomainWithCriteria>();

    existingAttempt.simulation.courseCase.markingCriteria.forEach((criterion) => {
      const domainId = criterion.markingDomain.id;

      if (!domainsMap.has(domainId)) {
        domainsMap.set(domainId, {
          domainId: criterion.markingDomain.id,
          domainName: criterion.markingDomain.name,
          criteria: [],
        });
      }

      domainsMap.get(domainId)!.criteria.push({
        id: criterion.id,
        text: criterion.text,
        points: criterion.points,
        displayOrder: criterion.displayOrder,
      });
    });

    const markingDomainsWithCriteria = Array.from(domainsMap.values());

    // Prepare case info
    const caseInfo = {
      patientName: existingAttempt.simulation.courseCase.patientName,
      diagnosis: existingAttempt.simulation.courseCase.diagnosis,
      caseTitle: existingAttempt.simulation.courseCase.title,
      patientAge: existingAttempt.simulation.courseCase.patientAge,
      patientGender: existingAttempt.simulation.courseCase.patientGender,
    };

    // Generate AI feedback
    try {
      this.log.info({ attemptId, markingDomainsCount: markingDomainsWithCriteria.length }, '[SimulationAttempt] Generating AI feedback...');

      const { feedback, score: calculatedScore, prompts, markingStructure } =
        await this.aiFeedbackService.generateFeedback(
          cleanTranscript,
          caseInfo,
          caseTabs,
          durationSeconds,
          markingDomainsWithCriteria
        );

      // Include full marking structure in the feedback
      const aiFeedback = {
        ...feedback,
        analysisStatus: "success",
        generatedAt: new Date().toISOString(),
        regenerated: true, // Flag to indicate this was regenerated
        caseTabsProvided: {
          doctorsNote: caseTabs.doctorsNote.length > 0,
          patientScript: caseTabs.patientScript.length > 0,
          medicalNotes: caseTabs.medicalNotes.length > 0,
        },
        totalMarkingCriteria: existingAttempt.simulation.courseCase.markingCriteria.length,
        markingDomainsCount: markingDomainsWithCriteria.length,
        markingStructure: markingStructure,
        isAdminAttempt: existingAttempt.student.user.isAdmin,
      } as unknown as Prisma.InputJsonValue;

      const aiPrompt = prompts as unknown as Prisma.InputJsonValue;

      this.log.info({ attemptId, score: calculatedScore }, '[SimulationAttempt] AI feedback generated successfully');

      // Update the attempt with new feedback
      const updatedAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          aiFeedback,
          aiPrompt: aiPrompt || undefined,
          score: calculatedScore,
          transcript: cleanTranscript as unknown as Prisma.InputJsonValue, // Update to clean format if needed
          isCompleted: true, // Ensure it's marked as completed
          endedAt: existingAttempt.endedAt || new Date(),
          durationSeconds: durationSeconds,
        },
        include: {
          student: true,
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
      });

      this.log.info({ attemptId }, '[SimulationAttempt] Feedback regenerated successfully');
      return updatedAttempt;
    } catch (error) {
      this.log.error({ err: error, attemptId }, '[SimulationAttempt] Failed to regenerate feedback');
      throw new Error(`Failed to regenerate feedback: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // COMMENTED OUT - Will re-enable in Phase 2 with LiveKit transcript integration
  /*
  async completeWithTranscript_LEGACY(
    attemptId: string,
    correlationToken: string
  ): Promise<any> {
    try {
      // OLD CODE - Fetch transcript from voice assistant API
      console.log(`[SimulationAttempt] Fetching transcript from voice assistant`);
      const transcriptData = await voiceAgentService.getTranscript(correlationToken);
      
      const transcript: TranscriptClean = this.transformTranscript(transcriptData);
      
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);
  
      console.log(`[SimulationAttempt] Transcript fetched successfully with ${transcript.totalMessages} messages`);
      
      // 2. Extract case tabs (doctor's notes, patient script, medical notes)
      interface CaseTabs {
        doctorsNote: string[];
        patientScript: string[];
        medicalNotes: string[];
      }
  
      const caseTabs: CaseTabs = {
        doctorsNote: [],
        patientScript: [],
        medicalNotes: []
      };
  
      existingAttempt.simulation.courseCase.caseTabs.forEach(tab => {
        switch(tab.tabType) {
          case 'DOCTORS_NOTE':
            caseTabs.doctorsNote = tab.content;
            break;
          case 'PATIENT_SCRIPT':
            caseTabs.patientScript = tab.content;
            break;
          case 'MEDICAL_NOTES':
            caseTabs.medicalNotes = tab.content;
            break;
        }
      });
  
      // 3. Group marking criteria by domain
      interface MarkingDomainWithCriteria {
        domainId: string;
        domainName: string;
        criteria: {
          id: string;
          text: string;
          points: number;
          displayOrder: number;
        }[];
      }
  
      const domainsMap = new Map<string, MarkingDomainWithCriteria>();
      
      existingAttempt.simulation.courseCase.markingCriteria.forEach(criterion => {
        const domainId = criterion.markingDomain.id;
        
        if (!domainsMap.has(domainId)) {
          domainsMap.set(domainId, {
            domainId: criterion.markingDomain.id,
            domainName: criterion.markingDomain.name,
            criteria: []
          });
        }
        
        domainsMap.get(domainId)!.criteria.push({
          id: criterion.id,
          text: criterion.text,
          points: criterion.points,
          displayOrder: criterion.displayOrder
        });
      });
  
      const markingDomainsWithCriteria = Array.from(domainsMap.values());
  
      // 4. Prepare case info
      const caseInfo = {
        patientName: existingAttempt.simulation.courseCase.patientName,
        diagnosis: existingAttempt.simulation.courseCase.diagnosis,
        caseTitle: existingAttempt.simulation.courseCase.title,
        patientAge: existingAttempt.simulation.courseCase.patientAge,
        patientGender: existingAttempt.simulation.courseCase.patientGender
      };
  
      let aiFeedback: Prisma.InputJsonValue | null = null;
      let score: number | null = null;
      let aiPrompt: Prisma.InputJsonValue | null = null;
    
      try {
        console.log(`[SimulationAttempt] Generating AI feedback...`);
        console.log(`[SimulationAttempt] Using ${markingDomainsWithCriteria.length} marking domains`);
        
        // Generate AI feedback with the new structure
        const { 
          feedback, 
          score: calculatedScore, 
          prompts,
          markingStructure 
        } = await this.aiFeedbackService.generateFeedback(
          transcript,
          caseInfo,
          caseTabs,
          durationSeconds,
          markingDomainsWithCriteria
        );
    
        // Include full marking structure in the feedback
        aiFeedback = {
          ...feedback,
          analysisStatus: 'success',
          generatedAt: new Date().toISOString(),
          caseTabsProvided: {
            doctorsNote: caseTabs.doctorsNote.length > 0,
            patientScript: caseTabs.patientScript.length > 0,
            medicalNotes: caseTabs.medicalNotes.length > 0
          },
          totalMarkingCriteria: existingAttempt.simulation.courseCase.markingCriteria.length,
          markingDomainsCount: markingDomainsWithCriteria.length,
          markingStructure: markingStructure,
          isAdminAttempt: existingAttempt.student.user.isAdmin // Add admin flag
        } as unknown as Prisma.InputJsonValue;
        
        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;
        
        console.log(`[SimulationAttempt] AI feedback generated successfully with score: ${score}`);
        
      } catch (aiError) {
        console.error('[SimulationAttempt] AI feedback generation failed:', aiError);
        aiFeedback = {
          analysisStatus: 'failed',
          error: aiError instanceof Error ? aiError.message : 'Unknown AI error',
          generatedAt: new Date().toISOString(),
          markingStructure: markingDomainsWithCriteria,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
          fallbackFeedback: this.generateFallbackFeedback()
        } as unknown as Prisma.InputJsonValue;
      }
  
      // 6. Update the simulation attempt
      const updatedAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: transcript as unknown as Prisma.InputJsonValue,
          aiFeedback,
          aiPrompt: aiPrompt || undefined,
          score
        },
        include: {
          student: true,
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: true
                }
              }
            }
          }
        }
      });
  
      console.log(`[SimulationAttempt] Attempt ${attemptId} completed successfully`);
      return updatedAttempt;
  
    } catch (error) {
      console.error('[SimulationAttempt] Error in completeWithTranscript:', error);
      
      // Still try to complete the attempt even if transcript fetch fails
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);
      
      const fallbackAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: {
            error: 'Failed to retrieve transcript',
            errorDetails: error instanceof Error ? error.message : 'Unknown error',
            correlationToken,
            timestamp: new Date().toISOString()
          } as unknown as Prisma.InputJsonValue,
          aiFeedback: {
            analysisStatus: 'failed',
            error: 'Transcript retrieval failed',
            fallbackFeedback: this.generateFallbackFeedback(),
            isAdminAttempt: existingAttempt.student.user.isAdmin
          } as unknown as Prisma.InputJsonValue
        },
        include: {
          student: true,
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: true
                }
              }
            }
          }
        }
      });
      
      console.log(`[SimulationAttempt] Attempt ${attemptId} completed with errors`);
      return fallbackAttempt;
    }
  }
  */

  // Helper method for fallback feedback when AI model fails
  private generateFallbackFeedback() {
    return {
      overallFeedback:
        "Technical issue occurred during AI analysis. Please contact support for manual review.",
      strengths: [
        "Session completed successfully",
        "Transcript captured for review",
      ],
      improvements: [
        "AI analysis temporarily unavailable",
        "Manual review may be provided",
      ],
      score: null,
      markingDomains: [
        {
          domain: "Communication Skills",
          score: 0,
          feedback: "Analysis pending due to technical issue",
        },
        {
          domain: "Clinical Assessment",
          score: 0,
          feedback: "Analysis pending due to technical issue",
        },
        {
          domain: "Professionalism",
          score: 0,
          feedback: "Analysis pending due to technical issue",
        },
      ],
      analysisStatus: "failed",
    };
  }

  async findByStudentAndCase(
    studentId: string,
    caseId: string,
    query?: { completed?: boolean; limit?: number; offset?: number }
  ) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new Error("Student not found");
    }

    // Verify course case exists and has a simulation
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: caseId },
      include: {
        simulation: true,
      },
    });

    if (!courseCase) {
      throw new Error("Course case not found");
    }

    if (!courseCase.simulation) {
      throw new Error("No simulation exists for this case");
    }

    const where: any = {
      studentId,
      simulationId: courseCase.simulation.id,
    };

    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    const attempts = await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true,
          },
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });

    // Add summary statistics
    const stats = {
      totalAttempts: await this.prisma.simulationAttempt.count({ where }),
      completedAttempts: await this.prisma.simulationAttempt.count({
        where: { ...where, isCompleted: true },
      }),
      averageScore: await this.prisma.simulationAttempt
        .aggregate({
          where: { ...where, isCompleted: true, score: { not: null } },
          _avg: { score: true },
        })
        .then((result) =>
          result._avg.score ? Number(result._avg.score.toFixed(1)) : null
        ),
    };

    return {
      attempts,
      stats,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        creditBalance: student.user.isAdmin ? 999999 : student.creditBalance,
        isAdmin: student.user.isAdmin,
      },
      case: {
        id: courseCase.id,
        title: courseCase.title,
        diagnosis: courseCase.diagnosis,
        patientName: courseCase.patientName,
      },
    };
  }

  async getStudentAnalytics(studentId: string) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new Error("Student not found");
    }

    // Fetch all completed attempts with feedback
    const allAttempts = await this.prisma.simulationAttempt.findMany({
      where: {
        studentId,
        isCompleted: true,
      },
      include: {
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: true,
                  },
                },
                caseSpecialties: {
                  include: {
                    specialty: true,
                  },
                },
                caseCurriculums: {
                  include: {
                    curriculum: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    // Filter attempts that have feedback (client-side filter for JSON field)
    const attempts = allAttempts.filter(
      (attempt) => attempt.aiFeedback !== null
    );

    // Exam-level analytics
    interface ExamStats {
      examId: string;
      examTitle: string;
      totalAttempts: number;
      passCount: number;
      failCount: number;
      borderlinePassCount: number;
      borderlineFailCount: number;
      clearPassCount: number;
      clearFailCount: number;
      averagePercentage: number;
    }

    const examStatsMap = new Map<string, ExamStats>();

    // Domain-level analytics
    interface DomainStats {
      examId: string;
      examTitle: string;
      domainName: string;
      totalCriteria: number;
      criteriaMetCount: number;
      criteriaNotMetCount: number;
      averagePercentage: number;
      appearances: number;
    }

    const domainStatsMap = new Map<string, DomainStats>();

    // Process each attempt
    attempts.forEach((attempt) => {
      // TypeScript needs explicit check for included relations
      if (!attempt.simulation?.courseCase?.course?.exam) {
        return; // Skip attempts without complete exam data
      }

      const examId = attempt.simulation.courseCase.course.exam.id;
      const examTitle = attempt.simulation.courseCase.course.exam.title;
      const feedback = attempt.aiFeedback as any;

      // Initialize exam stats if not exists
      if (!examStatsMap.has(examId)) {
        examStatsMap.set(examId, {
          examId,
          examTitle,
          totalAttempts: 0,
          passCount: 0,
          failCount: 0,
          borderlinePassCount: 0,
          borderlineFailCount: 0,
          clearPassCount: 0,
          clearFailCount: 0,
          averagePercentage: 0,
        });
      }

      const examStats = examStatsMap.get(examId)!;
      examStats.totalAttempts++;

      // Count pass/fail classifications
      const classification = feedback?.overallResult?.classificationLabel || "";
      // Normalize classification: convert to uppercase and replace spaces with underscores
      const normalizedClassification = classification
        .toUpperCase()
        .replace(/\s+/g, "_");
      this.log.debug({ examTitle, classification, normalizedClassification }, '[Analytics] Classification');

      if (normalizedClassification === "CLEAR_PASS") {
        examStats.clearPassCount++;
        examStats.passCount++;
      } else if (normalizedClassification === "BORDERLINE_PASS") {
        examStats.borderlinePassCount++;
        examStats.passCount++;
      } else if (normalizedClassification === "CLEAR_FAIL") {
        examStats.clearFailCount++;
        examStats.failCount++;
      } else if (normalizedClassification === "BORDERLINE_FAIL") {
        examStats.borderlineFailCount++;
        examStats.failCount++;
      } else if (normalizedClassification !== "") {
        this.log.warn({ classification, normalizedClassification }, '[Analytics] Unknown classification');
      }

      // Add to percentage sum for averaging later
      const percentage = feedback?.overallResult?.percentageMet || 0;
      examStats.averagePercentage += percentage;

      // Process domain-level data
      if (feedback?.markingDomains && Array.isArray(feedback.markingDomains)) {
        feedback.markingDomains.forEach((domain: any) => {
          const domainName = domain.domainName;
          // Use examId-domainName as key to separate domains by exam
          const domainKey = `${examId}-${domainName}`;

          if (!domainStatsMap.has(domainKey)) {
            domainStatsMap.set(domainKey, {
              examId,
              examTitle,
              domainName,
              totalCriteria: 0,
              criteriaMetCount: 0,
              criteriaNotMetCount: 0,
              averagePercentage: 0,
              appearances: 0,
            });
          }

          const domainStats = domainStatsMap.get(domainKey)!;
          domainStats.appearances++;

          if (domain.criteria && Array.isArray(domain.criteria)) {
            domain.criteria.forEach((criterion: any) => {
              domainStats.totalCriteria++;
              if (criterion.met) {
                domainStats.criteriaMetCount++;
              } else {
                domainStats.criteriaNotMetCount++;
              }
            });
          }
        });
      }
    });

    // Calculate averages for exams
    examStatsMap.forEach((stats) => {
      if (stats.totalAttempts > 0) {
        stats.averagePercentage = Math.round(
          stats.averagePercentage / stats.totalAttempts
        );
      }
    });

    // Calculate averages and percentages for domains
    const domainStats = Array.from(domainStatsMap.values()).map((stats) => {
      const percentage =
        stats.totalCriteria > 0
          ? Math.round((stats.criteriaMetCount / stats.totalCriteria) * 100)
          : 0;

      return {
        ...stats,
        averagePercentage: percentage,
      };
    });

    // Sort domains by exam first, then by performance within each exam
    domainStats.sort((a, b) => {
      // First sort by exam title
      if (a.examTitle !== b.examTitle) {
        return a.examTitle.localeCompare(b.examTitle);
      }
      // Then sort by performance (worst to best)
      return a.averagePercentage - b.averagePercentage;
    });

    // Specialty-level analytics
    interface SpecialtyStats {
      examId: string;
      examTitle: string;
      specialtyName: string;
      totalPercentage: number;
      appearances: number;
      averagePercentage: number;
    }

    const specialtyStatsMap = new Map<string, SpecialtyStats>();

    // Curriculum-level analytics
    interface CurriculumStats {
      examId: string;
      examTitle: string;
      curriculumName: string;
      totalPercentage: number;
      appearances: number;
      averagePercentage: number;
    }

    const curriculumStatsMap = new Map<string, CurriculumStats>();

    // Process specialties and curriculums from each attempt
    attempts.forEach((attempt) => {
      if (!attempt.simulation?.courseCase?.course?.exam) {
        return;
      }

      const examId = attempt.simulation.courseCase.course.exam.id;
      const examTitle = attempt.simulation.courseCase.course.exam.title;
      const feedback = attempt.aiFeedback as any;
      const overallPercentage = feedback?.overallResult?.percentageMet || 0;

      // Process specialties
      if (attempt.simulation.courseCase.caseSpecialties) {
        attempt.simulation.courseCase.caseSpecialties.forEach((cs: any) => {
          const specialtyKey = `${examId}-${cs.specialty.name}`;

          if (!specialtyStatsMap.has(specialtyKey)) {
            specialtyStatsMap.set(specialtyKey, {
              examId,
              examTitle,
              specialtyName: cs.specialty.name,
              totalPercentage: 0,
              appearances: 0,
              averagePercentage: 0,
            });
          }

          const stats = specialtyStatsMap.get(specialtyKey)!;
          stats.totalPercentage += overallPercentage;
          stats.appearances++;
        });
      }

      // Process curriculums
      if (attempt.simulation.courseCase.caseCurriculums) {
        attempt.simulation.courseCase.caseCurriculums.forEach((cc: any) => {
          const curriculumKey = `${examId}-${cc.curriculum.name}`;

          if (!curriculumStatsMap.has(curriculumKey)) {
            curriculumStatsMap.set(curriculumKey, {
              examId,
              examTitle,
              curriculumName: cc.curriculum.name,
              totalPercentage: 0,
              appearances: 0,
              averagePercentage: 0,
            });
          }

          const stats = curriculumStatsMap.get(curriculumKey)!;
          stats.totalPercentage += overallPercentage;
          stats.appearances++;
        });
      }
    });

    // Calculate averages for specialties
    const specialtyStats = Array.from(specialtyStatsMap.values()).map((stats) => {
      stats.averagePercentage = Math.round(stats.totalPercentage / stats.appearances);
      return stats;
    }).sort((a, b) => a.averagePercentage - b.averagePercentage); // Sort worst to best

    // Calculate averages for curriculums
    const curriculumStats = Array.from(curriculumStatsMap.values()).map((stats) => {
      stats.averagePercentage = Math.round(stats.totalPercentage / stats.appearances);
      return stats;
    }).sort((a, b) => a.averagePercentage - b.averagePercentage); // Sort worst to best

    // Overall summary
    const totalAttempts = attempts.length;
    this.log.debug({ totalAttempts }, '[Analytics] Processing completed attempts with feedback');

    const overallPassCount = attempts.filter((a) => {
      const label =
        (a.aiFeedback as any)?.overallResult?.classificationLabel || "";
      // Normalize and check if it contains "PASS" (case-insensitive)
      const normalizedLabel = label.toUpperCase().replace(/\s+/g, "_");
      const isPass = normalizedLabel.includes("PASS");
      return isPass;
    }).length;
    const overallFailCount = totalAttempts - overallPassCount;

    this.log.debug({ overallPassCount, overallFailCount }, '[Analytics] Overall pass/fail counts');

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      totalAttempts,
      overallSummary: {
        totalPasses: overallPassCount,
        totalFails: overallFailCount,
        passRate:
          totalAttempts > 0
            ? Math.round((overallPassCount / totalAttempts) * 100)
            : 0,
      },
      examBreakdown: Array.from(examStatsMap.values()),
      domainPerformance: domainStats,
      weakestDomains: domainStats.slice(0, 3),
      strongestDomains: domainStats.slice(-3).reverse(),
      // New specialty and curriculum performance data
      specialtyPerformance: specialtyStats,
      curriculumPerformance: curriculumStats,
      weakestSpecialties: specialtyStats.slice(0, 5),
      strongestSpecialties: specialtyStats.slice(-5).reverse(),
      weakestCurriculums: curriculumStats.slice(0, 5),
      strongestCurriculums: curriculumStats.slice(-5).reverse(),
    };
  }
}
