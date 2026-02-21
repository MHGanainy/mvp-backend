// src/entities/interview-simulation-attempt/interview-simulation-attempt.service.ts
import { PrismaClient, Prisma } from "@prisma/client";
import {
  CreateInterviewSimulationAttemptInput,
  CompleteInterviewSimulationAttemptInput,
  UpdateInterviewSimulationAttemptInput,
} from "./interview-simulation-attempt.schema";
import { randomBytes } from "crypto";
import { createAIFeedbackService, AIProvider } from "../simulation-attempt/ai-feedback.service";
import { livekitVoiceService } from "../../services/livekit-voice.service";
import {
  TranscriptProcessorService,
  VoiceAgentTranscript,
} from "../../services/transcript-processor.service";
import { StudentInterviewPracticeService } from "../student-interview-practice/student-interview-practice.service";
import { FastifyBaseLogger } from 'fastify';

export class InterviewSimulationAttemptService {
  private aiFeedbackService: ReturnType<typeof createAIFeedbackService>;
  private studentInterviewPracticeService: StudentInterviewPracticeService;
  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {
    this.aiFeedbackService = createAIFeedbackService({
      provider: AIProvider.GROQ,
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-120b',
      log: this.log,
    });
    this.studentInterviewPracticeService = new StudentInterviewPracticeService(prisma);
  }

  private generateCorrelationToken(): string {
    // Generate a URL-safe token
    return `int_${randomBytes(16).toString("hex")}_${Date.now()}`;
  }

  async create(data: CreateInterviewSimulationAttemptInput) {
    // Verify the student exists and check if admin
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
      include: {
        user: true, // Include user to check isAdmin
      },
    });

    if (!student) {
      throw new Error("Student not found");
    }

    // Verify the interview simulation exists
    const interviewSimulation = await this.prisma.interviewSimulation.findUnique({
      where: { id: data.interviewSimulationId },
      include: {
        interviewCase: {
          include: {
            interviewCourse: true,
          },
        },
      },
    });

    if (!interviewSimulation) {
      throw new Error("Interview simulation not found");
    }

    // Check if student has at least 1 credit to start
    // Admin bypasses credit check
    if (!student.user.isAdmin) {
      if (student.creditBalance < 1) {
        throw new Error(
          `Insufficient credits. You need at least 1 credit to start. Current balance: ${student.creditBalance}`
        );
      }
    }

    const correlationToken = this.generateCorrelationToken();

    // Create attempt WITHOUT deducting credits
    // Credits will be deducted per-minute by the billing webhook (except for admin)
    const attempt = await this.prisma.interviewSimulationAttempt.create({
      data: {
        studentId: data.studentId,
        interviewSimulationId: data.interviewSimulationId,
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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

    // Log the attempt creation for billing tracking
    if (student.user.isAdmin) {
      this.log.info({ attemptId: attempt.id, correlationToken }, '[BILLING] Admin interview simulation attempt created - NO CHARGES APPLY');
    } else {
      this.log.info({ attemptId: attempt.id, correlationToken }, '[BILLING] Interview simulation attempt created without upfront charge');
    }

    // Create LiveKit session
    try {
      // Use voiceId from frontend request, fallback to Ashley if not provided
      const voiceId = data.voiceId || "Ashley";

      this.log.info({ voiceId }, '[InterviewSimulationAttempt] Voice requested');
      this.log.info({ correlationToken }, '[InterviewSimulationAttempt] Correlation token');

      const livekitConfig = await livekitVoiceService.createSession(
        correlationToken,
        String(student.user.email || student.user.id),
        {
          systemPrompt: attempt.interviewSimulation.casePrompt,
          openingLine: attempt.interviewSimulation.openingLine,
          voiceId: voiceId,
        }
      );

      this.log.info({ attemptId: attempt.id, voiceId }, '[LiveKit] Session created for attempt');

      return {
        ...attempt,
        voiceAssistantConfig: {
          token: livekitConfig.token, // LiveKit JWT
          correlationToken: correlationToken, // Our correlation token
          wsEndpoint: livekitConfig.serverUrl, // LiveKit server URL
          roomName: livekitConfig.roomName, // LiveKit room name (from Python orchestrator)
        },
        isAdmin: student.user.isAdmin,
      };
    } catch (error: any) {
      this.log.error({ err: error }, '[LiveKit] Failed to create session');
      throw new Error(`Failed to start voice session: ${error.message}`);
    }
  }

  async complete(id: string, data: CompleteInterviewSimulationAttemptInput) {
    // Check if attempt exists and is not already completed
    const attempt = await this.prisma.interviewSimulationAttempt.findUnique({
      where: { id },
      include: {
        interviewSimulation: true,
      },
    });

    if (!attempt) {
      throw new Error("Interview simulation attempt not found");
    }

    if (attempt.isCompleted) {
      throw new Error("Interview simulation attempt is already completed");
    }

    // Close the LiveKit session if it exists
    if (attempt.correlationToken) {
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[InterviewSimulationAttempt] Closing LiveKit session for attempt');
      await livekitVoiceService.endSession(attempt.correlationToken);
      this.log.info('[InterviewSimulationAttempt] LiveKit session end request sent');
    }

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - attempt.startedAt.getTime()) / 1000
    );

    const updatedAttempt = await this.prisma.interviewSimulationAttempt.update({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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

    // Update student's interview practice status (non-critical)
    try {
      await this.studentInterviewPracticeService.updatePracticeStatus(
        updatedAttempt.studentId,
        updatedAttempt.interviewSimulation.interviewCase.id
      );
    } catch (practiceError) {
      this.log.error({ err: practiceError }, 'Interview practice status update failed (non-critical)');
    }

    return updatedAttempt;
  }

  async cancel(id: string): Promise<void> {
    const attempt = await this.prisma.interviewSimulationAttempt.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        interviewSimulation: true,
      },
    });

    if (!attempt) {
      throw new Error("Interview simulation attempt not found");
    }

    if (attempt.isCompleted) {
      throw new Error("Cannot cancel a completed interview simulation attempt");
    }

    // Force close the LiveKit session (this commits transcript to database)
    if (attempt.correlationToken) {
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[InterviewSimulationAttempt] Cancelling attempt, closing LiveKit session');
      await livekitVoiceService.endSession(attempt.correlationToken);
      this.log.info('[InterviewSimulationAttempt] LiveKit session ended');
    }

    // Fetch the attempt again to get the transcript that was just saved by session end
    const attemptWithTranscript =
      await this.prisma.interviewSimulationAttempt.findUnique({
        where: { id },
      });

    // Process transcript to clean format for consistency (same as completeWithTranscript)
    let cleanTranscript: Prisma.InputJsonValue | null = null;

    if (attemptWithTranscript?.transcript) {
      try {
        this.log.info('[InterviewSimulationAttempt] Processing transcript to clean format...');
        const voiceTranscript =
          attemptWithTranscript.transcript as unknown as VoiceAgentTranscript;
        const processedTranscript =
          TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
        cleanTranscript =
          processedTranscript as unknown as Prisma.InputJsonValue;
        this.log.info({ totalMessages: processedTranscript.totalMessages, duration: processedTranscript.duration }, '[InterviewSimulationAttempt] Transcript processed');
      } catch (error) {
        this.log.error({ err: error }, '[InterviewSimulationAttempt] Failed to process transcript');
        // Keep original transcript if processing fails
        cleanTranscript = attemptWithTranscript.transcript;
      }
    }

    // Mark as ended but not completed
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - attempt.startedAt.getTime()) / 1000
    );

    await this.prisma.interviewSimulationAttempt.update({
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

    this.log.info({ attemptId: id }, '[InterviewSimulationAttempt] Attempt cancelled successfully');
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

    return await this.prisma.interviewSimulationAttempt.findMany({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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
    const attempt = await this.prisma.interviewSimulationAttempt.findUnique({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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
      throw new Error("Interview simulation attempt not found");
    }

    return attempt;
  }

  async findByCorrelationToken(correlationToken: string) {
    const attempt = await this.prisma.interviewSimulationAttempt.findUnique({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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
      throw new Error("Interview simulation attempt not found");
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

    return await this.prisma.interviewSimulationAttempt.findMany({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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

  async findByInterviewSimulation(
    interviewSimulationId: string,
    query?: { completed?: boolean; limit?: number; offset?: number }
  ) {
    // Verify interview simulation exists
    const interviewSimulation = await this.prisma.interviewSimulation.findUnique({
      where: { id: interviewSimulationId },
    });

    if (!interviewSimulation) {
      throw new Error("Interview simulation not found");
    }

    const where: any = { interviewSimulationId };
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    return await this.prisma.interviewSimulationAttempt.findMany({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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

  async update(id: string, data: UpdateInterviewSimulationAttemptInput) {
    // Check if attempt exists
    await this.findById(id);

    return await this.prisma.interviewSimulationAttempt.update({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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
      this.log.info({ attemptId: id, correlationToken: attempt.correlationToken }, '[InterviewSimulationAttempt] Deleting attempt, closing LiveKit session');
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
                currentStudent.creditBalance + attempt.interviewSimulation.creditCost,
            },
          });
        }

        // Delete the attempt
        await tx.interviewSimulationAttempt.delete({
          where: { id },
        });
      });
    } else {
      // Just delete if completed or admin (no refund)
      await this.prisma.interviewSimulationAttempt.delete({
        where: { id },
      });
    }

    this.log.info({ attemptId: id }, '[InterviewSimulationAttempt] Attempt deleted successfully');
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

    const totalAttempts = await this.prisma.interviewSimulationAttempt.count({
      where: { studentId },
    });

    const completedAttempts = await this.prisma.interviewSimulationAttempt.count({
      where: { studentId, isCompleted: true },
    });

    const incompleteAttempts = totalAttempts - completedAttempts;

    const scoreStats = await this.prisma.interviewSimulationAttempt.aggregate({
      where: { studentId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true },
    });

    const durationStats = await this.prisma.interviewSimulationAttempt.aggregate({
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

  async getInterviewSimulationStats(interviewSimulationId: string) {
    const interviewSimulation = await this.prisma.interviewSimulation.findUnique({
      where: { id: interviewSimulationId },
      include: {
        interviewCase: true,
      },
    });

    if (!interviewSimulation) {
      throw new Error("Interview simulation not found");
    }

    const totalAttempts = await this.prisma.interviewSimulationAttempt.count({
      where: { interviewSimulationId },
    });

    const completedAttempts = await this.prisma.interviewSimulationAttempt.count({
      where: { interviewSimulationId, isCompleted: true },
    });

    const uniqueStudents = await this.prisma.interviewSimulationAttempt.findMany({
      where: { interviewSimulationId },
      select: { studentId: true },
      distinct: ["studentId"],
    });

    const scoreStats = await this.prisma.interviewSimulationAttempt.aggregate({
      where: { interviewSimulationId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true },
    });

    return {
      interviewSimulationId,
      caseTitle: interviewSimulation.interviewCase.title,
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
    this.log.info({ attemptId }, '[InterviewSimulationAttempt] Completing attempt with transcript processing');

    // Step 1: End the LiveKit session (this commits transcript to database)
    this.log.info({ correlationToken }, '[InterviewSimulationAttempt] Ending LiveKit session for correlation token');
    const endResult = await livekitVoiceService.endSession(correlationToken) as { status: string; message?: string };

    if (endResult.status === "error") {
      this.log.warn({ message: endResult.message }, '[InterviewSimulationAttempt] Session end failed. Will check if transcript is already in database.');
    } else {
      this.log.info('[InterviewSimulationAttempt] LiveKit session ended successfully. Transcript should now be in database.');
    }

    // Step 2: Poll for transcript with retry logic (defense in depth)
    // The orchestrator should wait for the agent to save the transcript,
    // but we add retries here as a fallback in case of timing issues.
    const maxRetries = 5;
    const retryDelayMs = 1000; // 1 second between retries
    let existingAttempt: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      existingAttempt = await this.prisma.interviewSimulationAttempt.findUnique({
        where: { id: attemptId },
        include: {
          student: {
            include: {
              user: true, // Include user to check isAdmin
            },
          },
          interviewSimulation: {
            include: {
              interviewCase: {
                include: {
                  interviewCourse: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                  interviewCaseTabs: true,
                  interviewMarkingCriteria: {
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
        throw new Error("Interview simulation attempt not found");
      }

      if (existingAttempt.isCompleted) {
        throw new Error("Interview simulation attempt is already completed");
      }

      // Check if transcript exists
      if (existingAttempt.transcript) {
        this.log.info({ attempt, maxRetries }, '[InterviewSimulationAttempt] Transcript found in database');
        break;
      }

      // Transcript not found yet, wait and retry
      if (attempt < maxRetries) {
        this.log.info({ retryDelayMs, nextAttempt: attempt + 1, maxRetries }, '[InterviewSimulationAttempt] Transcript not found yet, waiting before retry...');
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    // Step 3: Final check after all retries
    if (!existingAttempt.transcript) {
      throw new Error(
        `No transcript found in database after ${maxRetries} attempts (${(maxRetries * retryDelayMs) / 1000}s). The orchestrator may have failed to save the transcript.`
      );
    }

    this.log.info('[InterviewSimulationAttempt] Transcript found in database');
    const voiceTranscript =
      existingAttempt.transcript as unknown as VoiceAgentTranscript;

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000
    );

    try {
      // Step 4: Process the transcript - transform and merge split messages
      this.log.info('[InterviewSimulationAttempt] Processing transcript...');
      const cleanTranscript =
        TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
      this.log.info({ totalMessages: cleanTranscript.totalMessages, duration: cleanTranscript.duration }, '[InterviewSimulationAttempt] Transcript processed');

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

      existingAttempt.interviewSimulation.interviewCase.interviewCaseTabs.forEach(
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

      existingAttempt.interviewSimulation.interviewCase.interviewMarkingCriteria.forEach(
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

      // Prepare case info
      const caseInfo = {
        patientName: existingAttempt.interviewSimulation.interviewCase.patientName,
        diagnosis: existingAttempt.interviewSimulation.interviewCase.diagnosis,
        caseTitle: existingAttempt.interviewSimulation.interviewCase.title,
        patientAge: existingAttempt.interviewSimulation.interviewCase.patientAge,
        patientGender: existingAttempt.interviewSimulation.interviewCase.patientGender,
      };

      let aiFeedback: Prisma.InputJsonValue | null = null;
      let score: number | null = null;
      let aiPrompt: Prisma.InputJsonValue | null = null;

      // Generate AI feedback
      try {
        this.log.info('[InterviewSimulationAttempt] Generating AI feedback...');
        this.log.info({ domainsCount: markingDomainsWithCriteria.length }, '[InterviewSimulationAttempt] Using marking domains');

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
            existingAttempt.interviewSimulation.interviewCase.interviewMarkingCriteria.length,
          markingDomainsCount: markingDomainsWithCriteria.length,
          markingStructure: markingStructure,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
        } as unknown as Prisma.InputJsonValue;

        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;

        this.log.info({ score }, '[InterviewSimulationAttempt] AI feedback generated successfully');
      } catch (aiError) {
        this.log.error({ err: aiError }, '[InterviewSimulationAttempt] AI feedback generation failed');
        aiFeedback = {
          analysisStatus: "failed",
          error:
            aiError instanceof Error ? aiError.message : "Unknown AI error",
          generatedAt: new Date().toISOString(),
          markingStructure: markingDomainsWithCriteria,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
          fallbackFeedback: this.generateFallbackFeedback(),
        } as unknown as Prisma.InputJsonValue;
      }

      // Update the interview simulation attempt with feedback
      const updatedAttempt = await this.prisma.interviewSimulationAttempt.update({
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
          interviewSimulation: {
            include: {
              interviewCase: {
                include: {
                  interviewCourse: true,
                },
              },
            },
          },
        },
      });

      this.log.info({ attemptId }, '[InterviewSimulationAttempt] Attempt completed successfully with AI feedback');

      // Update student's interview practice status (non-critical)
      try {
        await this.studentInterviewPracticeService.updatePracticeStatus(
          updatedAttempt.studentId,
          updatedAttempt.interviewSimulation.interviewCase.id
        );
      } catch (practiceError) {
        this.log.error({ err: practiceError }, 'Interview practice status update failed (non-critical)');
      }

      return updatedAttempt;
    } catch (error) {
      this.log.error({ err: error }, '[InterviewSimulationAttempt] Error processing transcript and generating feedback');

      // Still mark as complete but with error status
      const fallbackAttempt = await this.prisma.interviewSimulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          aiFeedback: {
            analysisStatus: "failed",
            error: "Transcript processing or feedback generation failed",
            errorDetails:
              error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
            fallbackFeedback: this.generateFallbackFeedback(),
          } as unknown as Prisma.InputJsonValue,
        },
        include: {
          student: true,
          interviewSimulation: {
            include: {
              interviewCase: {
                include: {
                  interviewCourse: true,
                },
              },
            },
          },
        },
      });

      this.log.info({ attemptId }, '[InterviewSimulationAttempt] Attempt marked as complete with error');

      // Update student's interview practice status even on AI failure (non-critical)
      try {
        await this.studentInterviewPracticeService.updatePracticeStatus(
          fallbackAttempt.studentId,
          fallbackAttempt.interviewSimulation.interviewCase.id
        );
      } catch (practiceError) {
        this.log.error({ err: practiceError }, 'Interview practice status update failed (non-critical)');
      }

      return fallbackAttempt;
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
      console.log(`[InterviewSimulationAttempt] Fetching transcript from voice assistant`);
      const transcriptData = await voiceAgentService.getTranscript(correlationToken);

      const transcript: TranscriptClean = this.transformTranscript(transcriptData);

      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);

      console.log(`[InterviewSimulationAttempt] Transcript fetched successfully with ${transcript.totalMessages} messages`);

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

      existingAttempt.interviewSimulation.interviewCase.caseTabs.forEach(tab => {
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

      existingAttempt.interviewSimulation.interviewCase.interviewMarkingCriteria.forEach(criterion => {
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
        patientName: existingAttempt.interviewSimulation.interviewCase.patientName,
        diagnosis: existingAttempt.interviewSimulation.interviewCase.diagnosis,
        caseTitle: existingAttempt.interviewSimulation.interviewCase.title,
        patientAge: existingAttempt.interviewSimulation.interviewCase.patientAge,
        patientGender: existingAttempt.interviewSimulation.interviewCase.patientGender
      };

      let aiFeedback: Prisma.InputJsonValue | null = null;
      let score: number | null = null;
      let aiPrompt: Prisma.InputJsonValue | null = null;

      try {
        console.log(`[InterviewSimulationAttempt] Generating AI feedback...`);
        console.log(`[InterviewSimulationAttempt] Using ${markingDomainsWithCriteria.length} marking domains`);

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
          totalMarkingCriteria: existingAttempt.interviewSimulation.interviewCase.markingCriteria.length,
          markingDomainsCount: markingDomainsWithCriteria.length,
          markingStructure: markingStructure,
          isAdminAttempt: existingAttempt.student.user.isAdmin // Add admin flag
        } as unknown as Prisma.InputJsonValue;

        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;

        console.log(`[InterviewSimulationAttempt] AI feedback generated successfully with score: ${score}`);

      } catch (aiError) {
        console.error('[InterviewSimulationAttempt] AI feedback generation failed:', aiError);
        aiFeedback = {
          analysisStatus: 'failed',
          error: aiError instanceof Error ? aiError.message : 'Unknown AI error',
          generatedAt: new Date().toISOString(),
          markingStructure: markingDomainsWithCriteria,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
          fallbackFeedback: this.generateFallbackFeedback()
        } as unknown as Prisma.InputJsonValue;
      }

      // 6. Update the interview simulation attempt
      const updatedAttempt = await this.prisma.interviewSimulationAttempt.update({
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
          interviewSimulation: {
            include: {
              interviewCase: {
                include: {
                  interviewCourse: true
                }
              }
            }
          }
        }
      });

      console.log(`[InterviewSimulationAttempt] Attempt ${attemptId} completed successfully`);
      return updatedAttempt;

    } catch (error) {
      console.error('[InterviewSimulationAttempt] Error in completeWithTranscript:', error);

      // Still try to complete the attempt even if transcript fetch fails
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);

      const fallbackAttempt = await this.prisma.interviewSimulationAttempt.update({
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
          interviewSimulation: {
            include: {
              interviewCase: {
                include: {
                  interviewCourse: true
                }
              }
            }
          }
        }
      });

      console.log(`[InterviewSimulationAttempt] Attempt ${attemptId} completed with errors`);
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

    // Verify interview case exists and has an interview simulation
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: caseId },
      include: {
        interviewSimulation: true,
      },
    });

    if (!interviewCase) {
      throw new Error("Interview case not found");
    }

    if (!interviewCase.interviewSimulation) {
      throw new Error("No interview simulation exists for this case");
    }

    const where: any = {
      studentId,
      interviewSimulationId: interviewCase.interviewSimulation.id,
    };

    if (query?.completed !== undefined) {
      where.isCompleted = query.completed;
    }

    const attempts = await this.prisma.interviewSimulationAttempt.findMany({
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
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
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
      totalAttempts: await this.prisma.interviewSimulationAttempt.count({ where }),
      completedAttempts: await this.prisma.interviewSimulationAttempt.count({
        where: { ...where, isCompleted: true },
      }),
      averageScore: await this.prisma.interviewSimulationAttempt
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
        id: interviewCase.id,
        title: interviewCase.title,
        diagnosis: interviewCase.diagnosis,
        patientName: interviewCase.patientName,
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
    const allAttempts = await this.prisma.interviewSimulationAttempt.findMany({
      where: {
        studentId,
        isCompleted: true,
      },
      include: {
        interviewSimulation: {
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
                  include: {
                    interview: true,
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

    // Interview-level analytics
    interface InterviewStats {
      interviewId: string;
      interviewTitle: string;
      totalAttempts: number;
      passCount: number;
      failCount: number;
      borderlinePassCount: number;
      borderlineFailCount: number;
      clearPassCount: number;
      clearFailCount: number;
      averagePercentage: number;
    }

    const interviewStatsMap = new Map<string, InterviewStats>();

    // Domain-level analytics
    interface DomainStats {
      interviewId: string;
      interviewTitle: string;
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
      if (!attempt.interviewSimulation?.interviewCase?.interviewCourse?.interview) {
        return; // Skip attempts without complete interview data
      }

      const interviewId = attempt.interviewSimulation.interviewCase.interviewCourse.interview.id;
      const interviewTitle = attempt.interviewSimulation.interviewCase.interviewCourse.interview.title;
      const feedback = attempt.aiFeedback as any;

      // Initialize interview stats if not exists
      if (!interviewStatsMap.has(interviewId)) {
        interviewStatsMap.set(interviewId, {
          interviewId,
          interviewTitle,
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

      const interviewStats = interviewStatsMap.get(interviewId)!;
      interviewStats.totalAttempts++;

      // Count pass/fail classifications
      const classification = feedback?.overallResult?.classificationLabel || "";
      // Normalize classification: convert to uppercase and replace spaces with underscores
      const normalizedClassification = classification
        .toUpperCase()
        .replace(/\s+/g, "_");
      this.log.info({ interviewTitle, classification, normalizedClassification }, '[Analytics] Interview classification');

      if (normalizedClassification === "CLEAR_PASS") {
        interviewStats.clearPassCount++;
        interviewStats.passCount++;
      } else if (normalizedClassification === "BORDERLINE_PASS") {
        interviewStats.borderlinePassCount++;
        interviewStats.passCount++;
      } else if (normalizedClassification === "CLEAR_FAIL") {
        interviewStats.clearFailCount++;
        interviewStats.failCount++;
      } else if (normalizedClassification === "BORDERLINE_FAIL") {
        interviewStats.borderlineFailCount++;
        interviewStats.failCount++;
      } else if (normalizedClassification !== "") {
        this.log.warn({ classification, normalizedClassification }, '[Analytics] Unknown classification');
      }

      // Add to percentage sum for averaging later
      const percentage = feedback?.overallResult?.percentageMet || 0;
      interviewStats.averagePercentage += percentage;

      // Process domain-level data
      if (feedback?.markingDomains && Array.isArray(feedback.markingDomains)) {
        feedback.markingDomains.forEach((domain: any) => {
          const domainName = domain.domainName;
          // Use interviewId-domainName as key to separate domains by interview
          const domainKey = `${interviewId}-${domainName}`;

          if (!domainStatsMap.has(domainKey)) {
            domainStatsMap.set(domainKey, {
              interviewId,
              interviewTitle,
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

    // Calculate averages for interviews
    interviewStatsMap.forEach((stats) => {
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

    // Sort domains by interview first, then by performance within each interview
    domainStats.sort((a, b) => {
      // First sort by interview title
      if (a.interviewTitle !== b.interviewTitle) {
        return a.interviewTitle.localeCompare(b.interviewTitle);
      }
      // Then sort by performance (worst to best)
      return a.averagePercentage - b.averagePercentage;
    });

    // Overall summary
    const totalAttempts = attempts.length;
    this.log.info({ totalAttempts }, '[Analytics] Processing completed attempts with feedback');

    const overallPassCount = attempts.filter((a) => {
      const label =
        (a.aiFeedback as any)?.overallResult?.classificationLabel || "";
      // Normalize and check if it contains "PASS" (case-insensitive)
      const normalizedLabel = label.toUpperCase().replace(/\s+/g, "_");
      const isPass = normalizedLabel.includes("PASS");
      this.log.info({ label, normalizedLabel, result: isPass ? 'PASS' : 'FAIL' }, '[Analytics] Attempt classification');
      return isPass;
    }).length;
    const overallFailCount = totalAttempts - overallPassCount;

    this.log.info({ overallPassCount, overallFailCount }, '[Analytics] Overall pass/fail counts');

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
      interviewBreakdown: Array.from(interviewStatsMap.values()),
      domainPerformance: domainStats,
      weakestDomains: domainStats.slice(0, 3),
      strongestDomains: domainStats.slice(-3).reverse(),
    };
  }
}
