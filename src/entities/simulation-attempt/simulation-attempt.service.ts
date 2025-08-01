import { PrismaClient, Prisma } from '@prisma/client'
import { CreateSimulationAttemptInput, CompleteSimulationAttemptInput, UpdateSimulationAttemptInput } from './simulation-attempt.schema'
import { randomBytes } from 'crypto'
import {
  VoiceAssistantTranscriptApi,
  TranscriptClean,
} from '../../shared/types';
import { aiFeedbackService } from './ai-feedback.service' 

export class SimulationAttemptService {
  constructor(private prisma: PrismaClient) {}

  private generateCorrelationToken(): string {
    // Generate a URL-safe token
    return `sim_${randomBytes(16).toString('hex')}_${Date.now()}`
  }

  async create(data: CreateSimulationAttemptInput) {
    // Verify the student exists
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Verify the simulation exists
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: data.simulationId },
      include: {
        courseCase: {
          include: {
            course: true
          }
        }
      }
    })

    if (!simulation) {
      throw new Error('Simulation not found')
    }

    // Check if student has sufficient credits
    if (student.creditBalance < simulation.creditCost) {
      throw new Error(`Insufficient credits. Required: ${simulation.creditCost}, Available: ${student.creditBalance}`)
    }

    const correlationToken = this.generateCorrelationToken()

    // Start transaction to deduct credits and create attempt
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Deduct credits from student
      await tx.student.update({
        where: { id: data.studentId },
        data: {
          creditBalance: student.creditBalance - simulation.creditCost
        }
      })

      // Create simulation attempt
      const attempt = await tx.simulationAttempt.create({
        data: {
          studentId: data.studentId,
          simulationId: data.simulationId,
          startedAt: new Date(),
          correlationToken: correlationToken
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              creditBalance: true
            }
          },
          simulation: {
            include: {
              courseCase: {
                include: {
                  course: {
                    select: {
                      id: true,
                      title: true
                    }
                  }
                }
              }
            }
          }
        }
      })

      return attempt
    })
  }

  async complete(id: string, data: CompleteSimulationAttemptInput) {
    // Check if attempt exists and is not already completed
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { id },
      include: {
        simulation: true
      }
    })

    if (!attempt) {
      throw new Error('Simulation attempt not found')
    }

    if (attempt.isCompleted) {
      throw new Error('Simulation attempt is already completed')
    }

    const endTime = new Date()
    const durationSeconds = Math.floor((endTime.getTime() - attempt.startedAt.getTime()) / 1000)

    return await this.prisma.simulationAttempt.update({
      where: { id },
      data: {
        endedAt: endTime,
        durationSeconds: durationSeconds,
        isCompleted: true,
        score: data.score,
        aiFeedback: data.aiFeedback,
        transcript: data.transcript
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async findAll(query?: { completed?: boolean; limit?: number; offset?: number }) {
    const where: any = {}
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: query?.limit || 50,
      skip: query?.offset || 0
    })
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
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!attempt) {
      throw new Error('Simulation attempt not found')
    }

    return attempt
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
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!attempt) {
      throw new Error('Simulation attempt not found')
    }

    return attempt
  }

  async findByStudent(studentId: string, query?: { completed?: boolean; limit?: number; offset?: number }) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    const where: any = { studentId }
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: query?.limit || 50,
      skip: query?.offset || 0
    })
  }

  async findBySimulation(simulationId: string, query?: { completed?: boolean; limit?: number; offset?: number }) {
    // Verify simulation exists
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: simulationId }
    })

    if (!simulation) {
      throw new Error('Simulation not found')
    }

    const where: any = { simulationId }
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed
    }

    return await this.prisma.simulationAttempt.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: query?.limit || 50,
      skip: query?.offset || 0
    })
  }

  async update(id: string, data: UpdateSimulationAttemptInput) {
    // Check if attempt exists
    await this.findById(id)

    return await this.prisma.simulationAttempt.update({
      where: { id },
      data,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            creditBalance: true
          }
        },
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async delete(id: string) {
    // Check if attempt exists
    const attempt = await this.findById(id)

    // If attempt was not completed, refund credits to student
    if (!attempt.isCompleted) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Get current student credit balance
        const student = await tx.student.findUnique({
          where: { id: attempt.studentId }
        })

        if (student) {
          // Refund credits
          await tx.student.update({
            where: { id: attempt.studentId },
            data: {
              creditBalance: student.creditBalance + attempt.simulation.creditCost
            }
          })
        }

        // Delete the attempt
        await tx.simulationAttempt.delete({
          where: { id }
        })
      })
    } else {
      // Just delete if completed (no refund)
      await this.prisma.simulationAttempt.delete({
        where: { id }
      })
    }
  }

  // BUSINESS LOGIC METHODS

  async getStudentStats(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    const totalAttempts = await this.prisma.simulationAttempt.count({
      where: { studentId }
    })

    const completedAttempts = await this.prisma.simulationAttempt.count({
      where: { studentId, isCompleted: true }
    })

    const incompleteAttempts = totalAttempts - completedAttempts

    const scoreStats = await this.prisma.simulationAttempt.aggregate({
      where: { studentId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true }
    })

    const durationStats = await this.prisma.simulationAttempt.aggregate({
      where: { studentId, isCompleted: true },
      _avg: { durationSeconds: true },
      _min: { durationSeconds: true },
      _max: { durationSeconds: true }
    })

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      currentCreditBalance: student.creditBalance,
      totalAttempts,
      completedAttempts,
      incompleteAttempts,
      completionRate: totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0,
      scoreStats: {
        average: scoreStats._avg.score ? Number(scoreStats._avg.score.toFixed(1)) : null,
        minimum: scoreStats._min.score ? Number(scoreStats._min.score) : null,
        maximum: scoreStats._max.score ? Number(scoreStats._max.score) : null
      },
      durationStats: {
        averageSeconds: durationStats._avg.durationSeconds ? Math.round(durationStats._avg.durationSeconds) : null,
        minimumSeconds: durationStats._min.durationSeconds,
        maximumSeconds: durationStats._max.durationSeconds
      }
    }
  }

  async getSimulationStats(simulationId: string) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id: simulationId },
      include: {
        courseCase: true
      }
    })

    if (!simulation) {
      throw new Error('Simulation not found')
    }

    const totalAttempts = await this.prisma.simulationAttempt.count({
      where: { simulationId }
    })

    const completedAttempts = await this.prisma.simulationAttempt.count({
      where: { simulationId, isCompleted: true }
    })

    const uniqueStudents = await this.prisma.simulationAttempt.findMany({
      where: { simulationId },
      select: { studentId: true },
      distinct: ['studentId']
    })

    const scoreStats = await this.prisma.simulationAttempt.aggregate({
      where: { simulationId, isCompleted: true, score: { not: null } },
      _avg: { score: true },
      _min: { score: true },
      _max: { score: true }
    })

    return {
      simulationId,
      caseTitle: simulation.courseCase.title,
      totalAttempts,
      completedAttempts,
      incompleteAttempts: totalAttempts - completedAttempts,
      uniqueStudents: uniqueStudents.length,
      completionRate: totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0,
      scoreStats: {
        average: scoreStats._avg.score ? Number(scoreStats._avg.score.toFixed(1)) : null,
        minimum: scoreStats._min.score ? Number(scoreStats._min.score) : null,
        maximum: scoreStats._max.score ? Number(scoreStats._max.score) : null
      }
    }
  }
  private transformTranscript = (
    api: VoiceAssistantTranscriptApi,
  ): TranscriptClean => ({
    messages: api.messages.map(({ timestamp, speaker, message }) => ({
      timestamp,
      speaker,
      message,
    })),
    duration: api.duration_seconds ?? 0,
    totalMessages: api.total_messages,
  });
  

  async completeWithTranscript(
    id: string,
    correlationToken: string,
  ) {
    // 1️⃣ Fetch attempt and guard rails
    const attempt = await this.prisma.simulationAttempt.findUnique({
      where: { id },
      include: { 
        simulation: {
          include: {
            courseCase: true
          }
        }
      },
    });
  
    if (!attempt) throw new Error('Simulation attempt not found');
    if (attempt.isCompleted) throw new Error('Simulation attempt is already completed');
  
    /* ------------------------------------------------------------------ */
    /* 2️⃣ STEP 1: Retrieve transcript from Voice Assistant API           */
    /* ------------------------------------------------------------------ */
    let transcript: TranscriptClean | null = null;
  
    if (correlationToken) {
      try {
        const voiceAssistantUrl =
          process.env.VOICE_ASSISTANT_API_URL ?? 'http://localhost:8000';
  
        console.log(`Fetching transcript for correlation token: ${correlationToken}`);
        
        const res = await fetch(
          `${voiceAssistantUrl}/api/transcripts/correlation/${correlationToken}`,
          { headers: { Accept: 'application/json' } },
        );
  
        if (res.ok) {
          const apiData = (await res.json()) as VoiceAssistantTranscriptApi;
          transcript = this.transformTranscript(apiData);
          console.log(`Successfully retrieved transcript with ${transcript.messages.length} messages`);
        } else {
          console.warn(`Failed to fetch transcript: ${res.status} ${res.statusText}`);
          throw new Error(`Failed to fetch transcript: ${res.status}`);
        }
      } catch (err) {
        console.error('Error fetching transcript from voice assistant:', err);
        throw new Error('Failed to retrieve transcript from voice assistant');
      }
    } else {
      throw new Error('Correlation token is required for transcript retrieval');
    }
  
    /* ------------------------------------------------------------------ */
    /* 3️⃣ STEP 2: Call AI Service to generate feedback                   */
    /* ------------------------------------------------------------------ */
    let aiFeedback: any = null;
    let calculatedScore: number | null = null;
    let aiPrompts: any = null;
  
    if (transcript) {
      try {
        console.log(`Calling AI feedback service to generate feedback...`);
        
        // Prepare case info for AI analysis
        const caseInfo = {
          patientName: attempt.simulation.courseCase.patientName,
          diagnosis: attempt.simulation.courseCase.diagnosis,
          caseTitle: attempt.simulation.courseCase.title,
          patientAge: attempt.simulation.courseCase.patientAge,
          patientGender: attempt.simulation.courseCase.patientGender,
        };
  
        const aiResult = await aiFeedbackService.generateFeedback(
          transcript,
          caseInfo,
          Math.floor((new Date().getTime() - attempt.startedAt.getTime()) / 1000)
        );
  
        aiFeedback = aiResult.feedback;
        calculatedScore = aiResult.score;
        aiPrompts = aiResult.prompts;
        console.log(`AI service generated feedback with score: ${calculatedScore}`);
  
      } catch (err) {
        console.error('Error calling AI feedback service:', err);
        // Fall back to placeholder feedback if AI service fails
        aiFeedback = this.generateFallbackFeedback();
        calculatedScore = null;
        aiPrompts = null;
      }
    }
  
    /* ------------------------------------------------------------------ */
    /* 4️⃣ Calculate duration and complete the attempt                    */
    /* ------------------------------------------------------------------ */
    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - attempt.startedAt.getTime()) / 1000,
    );
  
    const completedAttempt = await this.prisma.simulationAttempt.update({
      where: { id },
      data: {
        endedAt: endTime,
        durationSeconds,
        isCompleted: true,
        score: calculatedScore,
        aiFeedback: aiFeedback as unknown as Prisma.InputJsonValue,
        aiPrompt: aiPrompts as unknown as Prisma.InputJsonValue,
        transcript: transcript as unknown as Prisma.InputJsonValue,
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
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });
  
    console.log(`Simulation attempt ${id} completed with transcript and AI-generated feedback`);
    
    return completedAttempt;
  }
  
  // Helper method for fallback feedback when AI model fails
  private generateFallbackFeedback() {
    return {
      overallFeedback: "Technical issue occurred during AI analysis. Please contact support for manual review.",
      strengths: [
        "Session completed successfully",
        "Transcript captured for review"
      ],
      improvements: [
        "AI analysis temporarily unavailable",
        "Manual review may be provided"
      ],
      score: null,
      markingDomains: [
        {
          domain: "Communication Skills",
          score: 0,
          feedback: "Analysis pending due to technical issue"
        },
        {
          domain: "Clinical Assessment", 
          score: 0,
          feedback: "Analysis pending due to technical issue"
        },
        {
          domain: "Professionalism",
          score: 0,
          feedback: "Analysis pending due to technical issue"
        }
      ],
      analysisStatus: "failed" // Flag to indicate AI analysis failed
    };
  }
}