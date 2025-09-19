import { PrismaClient, Prisma } from '@prisma/client'
import { CreateSimulationAttemptInput, CompleteSimulationAttemptInput, UpdateSimulationAttemptInput } from './simulation-attempt.schema'
import { randomBytes } from 'crypto'
import {
  VoiceAssistantTranscriptApi,
  TranscriptClean,
  } from '../../shared/types';
import { aiFeedbackService } from './ai-feedback.service' 
import { voiceTokenService } from '../../services/voice-token.service';

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

      const voiceToken = voiceTokenService.generateToken({
        attemptId: attempt.id,
        studentId: attempt.studentId,
        correlationToken: attempt.correlationToken || ''
      });

      return {
        ...attempt,
        voiceToken
      }
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
      speaker: speaker === 'participant' ? 'student' : 'ai_patient', // Map speakers properly
      message,
    })),
    duration: api.duration_seconds ?? 0,
    totalMessages: api.total_messages,
  });
  

  async completeWithTranscript(
    attemptId: string, 
    correlationToken: string
  ): Promise<any> {
    // Fetch attempt with all necessary relations
    const existingAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: true,
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: true
                  }
                },
                // Include ALL case tabs (not just MARKING_CRITERIA)
                caseTabs: true,
                // Include the new separate marking criteria
                markingCriteria: {
                  include: {
                    markingDomain: true
                  },
                  orderBy: [
                    { markingDomain: { name: 'asc' } },
                    { displayOrder: 'asc' }
                  ]
                }
              }
            }
          }
        }
      }
    });
  
    if (!existingAttempt) {
      throw new Error('Simulation attempt not found');
    }
  
    if (existingAttempt.isCompleted) {
      throw new Error('Simulation attempt is already completed');
    }
  
    try {
      // 1. Fetch transcript from voice assistant API
      const transcriptResponse = await fetch(
        `${process.env.VOICE_ASSISTANT_API_URL}/api/transcripts/correlation/${correlationToken}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
  
      if (!transcriptResponse.ok) {
        throw new Error(`Failed to retrieve transcript: ${transcriptResponse.statusText}`);
      }
  
      const apiResponse = await transcriptResponse.json() as VoiceAssistantTranscriptApi;
      const transcriptData: TranscriptClean = this.transformTranscript(apiResponse);
      
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(existingAttempt.startedAt).getTime()) / 1000);
  
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
        // Generate AI feedback with the new structure
        const { 
          feedback, 
          score: calculatedScore, 
          prompts,
          markingStructure 
        } = await aiFeedbackService.generateFeedback(
          transcriptData,
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
          markingStructure: markingStructure // Include the original structure
        } as unknown as Prisma.InputJsonValue;
        
        score = calculatedScore;
        aiPrompt = prompts as unknown as Prisma.InputJsonValue;
        
      } catch (aiError) {
        console.error('AI feedback generation failed:', aiError);
        aiFeedback = {
          analysisStatus: 'failed',
          error: aiError instanceof Error ? aiError.message : 'Unknown AI error',
          generatedAt: new Date().toISOString(),
          markingStructure: markingDomainsWithCriteria // Include even on failure
        } as unknown as Prisma.InputJsonValue;
      }
  
      // 6. Update the simulation attempt
      const updatedAttempt = await this.prisma.simulationAttempt.update({
        where: { id: attemptId },
        data: {
          endedAt: endTime,
          durationSeconds,
          isCompleted: true,
          transcript: transcriptData as unknown as Prisma.InputJsonValue,
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
  
      return updatedAttempt;
  
    } catch (error) {
      console.error('Error in completeWithTranscript:', error);
      throw error;
    }
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

  async findByStudentAndCase(
    studentId: string, 
    caseId: string, 
    query?: { completed?: boolean; limit?: number; offset?: number }
  ) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })
  
    if (!student) {
      throw new Error('Student not found')
    }
  
    // Verify course case exists and has a simulation
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: caseId },
      include: {
        simulation: true
      }
    })
  
    if (!courseCase) {
      throw new Error('Course case not found')
    }
  
    if (!courseCase.simulation) {
      throw new Error('No simulation exists for this case')
    }
  
    const where: any = { 
      studentId,
      simulationId: courseCase.simulation.id
    }
    
    if (query?.completed !== undefined) {
      where.isCompleted = query.completed
    }
  
    const attempts = await this.prisma.simulationAttempt.findMany({
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
  
    // Add summary statistics
    const stats = {
      totalAttempts: await this.prisma.simulationAttempt.count({ where }),
      completedAttempts: await this.prisma.simulationAttempt.count({ 
        where: { ...where, isCompleted: true } 
      }),
      averageScore: await this.prisma.simulationAttempt.aggregate({
        where: { ...where, isCompleted: true, score: { not: null } },
        _avg: { score: true }
      }).then(result => result._avg.score ? Number(result._avg.score.toFixed(1)) : null)
    }
  
    return {
      attempts,
      stats,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        creditBalance: student.creditBalance
      },
      case: {
        id: courseCase.id,
        title: courseCase.title,
        diagnosis: courseCase.diagnosis,
        patientName: courseCase.patientName
      }
    }
  }
}