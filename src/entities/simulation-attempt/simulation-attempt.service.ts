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

export class SimulationAttemptService {
  private aiFeedbackService: ReturnType<typeof createAIFeedbackService>;
  private studentCasePracticeService: StudentCasePracticeService;
  constructor(private prisma: PrismaClient) {
    this.aiFeedbackService = createAIFeedbackService({
      provider: AIProvider.GROQ,
      apiKey: process.env.GROQ_API_KEY,
      model: "openai/gpt-oss-120b",
    });
    this.studentCasePracticeService = new StudentCasePracticeService(prisma);
  }

  private generateCorrelationToken(): string {
    // Generate a URL-safe token
    return `sim_${randomBytes(16).toString("hex")}_${Date.now()}`;
  }

  async create(data: CreateSimulationAttemptInput) {
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

    // Verify the simulation exists
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

    if (!simulation) {
      throw new Error("Simulation not found");
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

    // Log the attempt creation for billing tracking
    if (student.user.isAdmin) {
      console.log(
        `[BILLING] Admin simulation attempt created. ID: ${attempt.id}, Token: ${correlationToken} - NO CHARGES APPLY`
      );
    } else {
      console.log(
        `[BILLING] Simulation attempt created without upfront charge. ID: ${attempt.id}, Token: ${correlationToken}`
      );
    }

    // Create LiveKit session
    try {
      // Use voiceId from frontend request, fallback to Ashley if not provided
      const voiceId = data.voiceId || "Ashley";

      console.log(`[SimulationAttempt] Voice requested: ${voiceId}`);
      console.log(`[SimulationAttempt] Correlation token: ${correlationToken}`);

      const livekitConfig = await livekitVoiceService.createSession(
        correlationToken,
        String(student.user.email || student.user.id),
        {
          systemPrompt: attempt.simulation.casePrompt,
          openingLine: attempt.simulation.openingLine,
          voiceId: voiceId,
        }
      );

      console.log(
        `[LiveKit] Session created for attempt ${attempt.id} with voice: ${voiceId}`
      );

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
      console.error(`[LiveKit] Failed to create session:`, error.message);
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
      console.log(
        `[SimulationAttempt] Closing LiveKit session for attempt ${id} (correlation: ${attempt.correlationToken})`
      );
      await livekitVoiceService.endSession(attempt.correlationToken);
      console.log(`[SimulationAttempt] LiveKit session end request sent`);
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
      console.log(
        `[SimulationAttempt] Cancelling attempt ${id}, closing LiveKit session ${attempt.correlationToken}`
      );
      await livekitVoiceService.endSession(attempt.correlationToken);
      console.log(`[SimulationAttempt] LiveKit session ended`);
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
        console.log(
          `[SimulationAttempt] Processing transcript to clean format...`
        );
        const voiceTranscript =
          attemptWithTranscript.transcript as unknown as VoiceAgentTranscript;
        const processedTranscript =
          TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
        cleanTranscript =
          processedTranscript as unknown as Prisma.InputJsonValue;
        console.log(
          `[SimulationAttempt] Transcript processed: ${processedTranscript.totalMessages} messages, ${processedTranscript.duration}s duration`
        );
      } catch (error) {
        console.error(
          `[SimulationAttempt] Failed to process transcript:`,
          error
        );
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

    console.log(`[SimulationAttempt] Attempt ${id} cancelled successfully`);
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
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                    examId: true,
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
      console.log(
        `[SimulationAttempt] Deleting attempt ${id}, closing LiveKit session ${attempt.correlationToken}`
      );
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

    console.log(`[SimulationAttempt] Attempt ${id} deleted successfully`);
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
    console.log(
      `[SimulationAttempt] Completing attempt ${attemptId} with transcript processing`
    );

    // Step 1: End the LiveKit session (this commits transcript to database)
    console.log(
      `[SimulationAttempt] Ending LiveKit session for correlation token: ${correlationToken}`
    );
    const endResult = await livekitVoiceService.endSession(correlationToken);

    if (endResult.status === "error") {
      console.warn(
        `[SimulationAttempt] Session end failed (${endResult.message}). Will check if transcript is already in database.`
      );
    } else {
      console.log(
        `[SimulationAttempt] LiveKit session ended successfully. Transcript should now be in database.`
      );
    }

    // Step 2: Fetch attempt with all necessary relations (transcript should now be present)
    const existingAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: {
          include: {
            user: true, // Include user to check isAdmin
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

    if (existingAttempt.isCompleted) {
      throw new Error("Simulation attempt is already completed");
    }

    // Step 3: Check if transcript was saved by orchestrator
    if (!existingAttempt.transcript) {
      throw new Error(
        "No transcript found in database after session end. The orchestrator may have failed to save the transcript."
      );
    }

    console.log(`[SimulationAttempt] Transcript found in database`);
    const voiceTranscript =
      existingAttempt.transcript as unknown as VoiceAgentTranscript;

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000
    );

    try {
      // Step 4: Process the transcript - transform and merge split messages
      console.log(`[SimulationAttempt] Processing transcript...`);
      const cleanTranscript =
        TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
      console.log(
        `[SimulationAttempt] Transcript processed: ${cleanTranscript.totalMessages} messages, ${cleanTranscript.duration}s duration`
      );

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

      existingAttempt.simulation.courseCase.markingCriteria.forEach(
        (criterion) => {
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
        patientName: existingAttempt.simulation.courseCase.patientName,
        diagnosis: existingAttempt.simulation.courseCase.diagnosis,
        caseTitle: existingAttempt.simulation.courseCase.title,
        patientAge: existingAttempt.simulation.courseCase.patientAge,
        patientGender: existingAttempt.simulation.courseCase.patientGender,
      };

      let aiFeedback: Prisma.InputJsonValue | null = null;
      let score: number | null = null;
      let aiPrompt: Prisma.InputJsonValue | null = null;

      // Generate AI feedback
      try {
        console.log(`[SimulationAttempt] Generating AI feedback...`);
        console.log(
          `[SimulationAttempt] Using ${markingDomainsWithCriteria.length} marking domains`
        );

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
            existingAttempt.simulation.courseCase.markingCriteria.length,
          markingDomainsCount: markingDomainsWithCriteria.length,
          markingStructure: markingStructure,
          isAdminAttempt: existingAttempt.student.user.isAdmin,
        } as unknown as Prisma.InputJsonValue;

        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;

        console.log(
          `[SimulationAttempt] AI feedback generated successfully with score: ${score}`
        );
      } catch (aiError) {
        console.error(
          "[SimulationAttempt] AI feedback generation failed:",
          aiError
        );
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

      // Update the simulation attempt with feedback
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

      console.log(
        `[SimulationAttempt] Attempt ${attemptId} completed successfully with AI feedback`
      );

      // Update student's practice status for this case
      try {
        await this.studentCasePracticeService.updatePracticeStatus(
          updatedAttempt.studentId,
          updatedAttempt.simulation.courseCaseId
        );
        console.log(
          `[SimulationAttempt] Updated practice status for student ${updatedAttempt.studentId} on case ${updatedAttempt.simulation.courseCaseId}`
        );
      } catch (practiceError) {
        // Log but don't fail the main operation
        console.error(
          "[SimulationAttempt] Failed to update practice status:",
          practiceError
        );
      }

      return updatedAttempt;
    } catch (error) {
      console.error(
        "[SimulationAttempt] Error processing transcript and generating feedback:",
        error
      );

      // ⭐ CRITICAL: Try to save the cleaned transcript even if AI feedback fails
      // This allows retroactive feedback generation later
      let transcriptToSave: Prisma.InputJsonValue | undefined;
      try {
        const voiceTranscript = existingAttempt.transcript as unknown as VoiceAgentTranscript;
        const cleanTranscript = TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
        transcriptToSave = cleanTranscript as unknown as Prisma.InputJsonValue;
        console.log(`[SimulationAttempt] Successfully saved cleaned transcript despite AI failure: ${cleanTranscript.totalMessages} messages`);
      } catch (transcriptError) {
        console.error(`[SimulationAttempt] Could not clean transcript, saving raw transcript:`, transcriptError);
        transcriptToSave = existingAttempt.transcript || undefined;
      }

      // Still mark as complete but with error status
      const fallbackAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: transcriptToSave,  // ⭐ CRITICAL FIX: Save transcript even when feedback fails!
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

      console.log(
        `[SimulationAttempt] Attempt ${attemptId} marked as complete with error`
      );

      // Still update practice status even for failed attempts
      try {
        await this.studentCasePracticeService.updatePracticeStatus(
          fallbackAttempt.studentId,
          fallbackAttempt.simulation.courseCaseId
        );
        console.log(
          `[SimulationAttempt] Updated practice status for student ${fallbackAttempt.studentId} on case ${fallbackAttempt.simulation.courseCaseId}`
        );
      } catch (practiceError) {
        console.error(
          "[SimulationAttempt] Failed to update practice status:",
          practiceError
        );
      }

      return fallbackAttempt;
    }
  }

  /**
   * ⭐ NEW METHOD: Regenerate feedback for an existing attempt that has a transcript
   * This is used when feedback generation initially failed or needs to be re-run
   */
  async generateFeedbackForExistingAttempt(attemptId: string): Promise<any> {
    console.log(`[SimulationAttempt] Regenerating feedback for attempt ${attemptId}`);

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

    console.log(`[SimulationAttempt] Transcript found, processing...`);
    const voiceTranscript = existingAttempt.transcript as unknown as VoiceAgentTranscript;

    // Process transcript to clean format
    const cleanTranscript = TranscriptProcessorService.transformToCleanFormat(voiceTranscript);
    console.log(
      `[SimulationAttempt] Transcript processed: ${cleanTranscript.totalMessages} messages, ${cleanTranscript.duration}s duration`
    );

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
      console.log(`[SimulationAttempt] Generating AI feedback...`);
      console.log(`[SimulationAttempt] Using ${markingDomainsWithCriteria.length} marking domains`);

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

      console.log(`[SimulationAttempt] AI feedback generated successfully with score: ${calculatedScore}`);

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

      console.log(`[SimulationAttempt] Feedback regenerated successfully for attempt ${attemptId}`);
      return updatedAttempt;
    } catch (error) {
      console.error(`[SimulationAttempt] Failed to regenerate feedback:`, error);
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
      console.log(
        `[Analytics] Exam "${examTitle}" - Classification: "${classification}" -> Normalized: "${normalizedClassification}"`
      );

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
        console.warn(
          `[Analytics] Unknown classification: "${classification}" (normalized: "${normalizedClassification}")`
        );
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

    // Overall summary
    const totalAttempts = attempts.length;
    console.log(
      `[Analytics] Processing ${totalAttempts} completed attempts with feedback`
    );

    const overallPassCount = attempts.filter((a) => {
      const label =
        (a.aiFeedback as any)?.overallResult?.classificationLabel || "";
      // Normalize and check if it contains "PASS" (case-insensitive)
      const normalizedLabel = label.toUpperCase().replace(/\s+/g, "_");
      const isPass = normalizedLabel.includes("PASS");
      console.log(
        `[Analytics] Attempt classification: "${label}" -> "${normalizedLabel}" -> ${
          isPass ? "PASS" : "FAIL"
        }`
      );
      return isPass;
    }).length;
    const overallFailCount = totalAttempts - overallPassCount;

    console.log(
      `[Analytics] Overall: ${overallPassCount} passes, ${overallFailCount} fails`
    );

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
    };
  }
}
