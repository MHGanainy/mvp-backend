import { PrismaClient, Prisma } from '@prisma/client'
import { CreateSimulationAttemptInput, CompleteSimulationAttemptInput, UpdateSimulationAttemptInput } from './simulation-attempt.schema'

export class SimulationAttemptService {
  constructor(private prisma: PrismaClient) {}

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
          startedAt: new Date()
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
}