import { PrismaClient } from '@prisma/client'
import { CreateSimulationInput, UpdateSimulationInput, VoiceModel } from './simulation.schema'

export class SimulationService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateSimulationInput) {
    // Verify the course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: data.courseCaseId },
      include: {
        course: {
          include: { exam: true }
        }
      }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    // Check if this course case already has a simulation
    const existingSimulation = await this.prisma.simulation.findUnique({
      where: { courseCaseId: data.courseCaseId }
    })

    if (existingSimulation) {
      throw new Error('This course case already has a simulation configured')
    }

    return await this.prisma.simulation.create({
      data: {
        courseCaseId: data.courseCaseId,
        casePrompt: data.casePrompt,
        openingLine: data.openingLine,
        timeLimitMinutes: data.timeLimitMinutes,
        voiceModel: data.voiceModel,
        warningTimeMinutes: data.warningTimeMinutes,
        creditCost: data.creditCost
      },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async findAll() {
    return await this.prisma.simulation.findMany({
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findById(id: string) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!simulation) {
      throw new Error('Simulation not found')
    }

    return simulation
  }

  async findByCourseCaseId(courseCaseId: string) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    const simulation = await this.prisma.simulation.findUnique({
      where: { courseCaseId },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!simulation) {
      throw new Error('No simulation configured for this course case')
    }

    return simulation
  }

  async findByCourse(courseId: string) {
    return await this.prisma.simulation.findMany({
      where: {
        courseCase: {
          courseId: courseId
        }
      },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        courseCase: {
          displayOrder: 'asc'
        }
      }
    })
  }

  async findByVoiceModel(voiceModel: VoiceModel) {
    return await this.prisma.simulation.findMany({
      where: { voiceModel },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findByCreditCost(creditCost: number) {
    return await this.prisma.simulation.findMany({
      where: { creditCost },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async update(id: string, data: UpdateSimulationInput) {
    // Check if simulation exists
    await this.findById(id)

    return await this.prisma.simulation.update({
      where: { id },
      data,
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
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
    // Check if simulation exists
    await this.findById(id)

    // Check if there are any simulation attempts
    const attemptCount = await this.prisma.simulationAttempt.count({
      where: { simulationId: id }
    })

    if (attemptCount > 0) {
      throw new Error('Cannot delete simulation with existing student attempts')
    }

    return await this.prisma.simulation.delete({
      where: { id }
    })
  }

  // BUSINESS LOGIC METHODS

  async updateCreditCost(id: string, creditCost: number) {
    if (creditCost < 1 || creditCost > 10) {
      throw new Error('Credit cost must be between 1 and 10')
    }

    const simulation = await this.findById(id)
    
    return await this.prisma.simulation.update({
      where: { id },
      data: { creditCost },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async updateTimeLimit(id: string, timeLimitMinutes: number, warningTimeMinutes?: number) {
    if (timeLimitMinutes < 1 || timeLimitMinutes > 120) {
      throw new Error('Time limit must be between 1 and 120 minutes')
    }

    if (warningTimeMinutes && warningTimeMinutes >= timeLimitMinutes) {
      throw new Error('Warning time must be less than time limit')
    }

    const simulation = await this.findById(id)
    
    return await this.prisma.simulation.update({
      where: { id },
      data: { 
        timeLimitMinutes,
        warningTimeMinutes
      },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async getSimulationStats(courseId?: string) {
    const whereClause = courseId ? {
      courseCase: { courseId }
    } : {}

    const totalSimulations = await this.prisma.simulation.count({
      where: whereClause
    })

    const voiceModelStats = await this.prisma.simulation.groupBy({
      by: ['voiceModel'],
      where: whereClause,
      _count: { voiceModel: true }
    })

    const creditCostStats = await this.prisma.simulation.groupBy({
      by: ['creditCost'],
      where: whereClause,
      _count: { creditCost: true }
    })

    const timeLimitStats = await this.prisma.simulation.aggregate({
      where: whereClause,
      _min: { timeLimitMinutes: true },
      _max: { timeLimitMinutes: true },
      _avg: { timeLimitMinutes: true }
    })

    return {
      courseId: courseId || 'all',
      totalSimulations,
      voiceModelDistribution: voiceModelStats.map((stat: { voiceModel: string; _count: { voiceModel: number } }) => ({
        voiceModel: stat.voiceModel,
        count: stat._count.voiceModel
      })),
      creditCostDistribution: creditCostStats.map((stat: { creditCost: number; _count: { creditCost: number } }) => ({
        creditCost: stat.creditCost,
        count: stat._count.creditCost
      })),
      timeLimitRange: {
        min: timeLimitStats._min.timeLimitMinutes,
        max: timeLimitStats._max.timeLimitMinutes,
        avg: timeLimitStats._avg.timeLimitMinutes ? Math.round(timeLimitStats._avg.timeLimitMinutes) : null
      }
    }
  }
}