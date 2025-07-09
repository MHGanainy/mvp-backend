import { PrismaClient } from '@prisma/client'
import { CreateCourseCaseInput, UpdateCourseCaseInput, PatientGender } from './course-case.schema'

export class CourseCaseService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCourseCaseInput) {
    // Verify the course exists
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      include: { exam: true }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    // Ensure it's a RANDOM style course (only RANDOM courses have cases)
    if (course.style !== 'RANDOM') {
      throw new Error('Cases can only be added to RANDOM style courses')
    }

    // Auto-assign display order if not provided
    let displayOrder = data.displayOrder
    if (!displayOrder) {
      const lastCase = await this.prisma.courseCase.findFirst({
        where: { courseId: data.courseId },
        orderBy: { displayOrder: 'desc' }
      })
      displayOrder = lastCase ? lastCase.displayOrder + 1 : 1
    }

    // Check if display order conflicts
    const existingCase = await this.prisma.courseCase.findFirst({
      where: { 
        courseId: data.courseId,
        displayOrder: displayOrder
      }
    })

    if (existingCase) {
      throw new Error(`Display order ${displayOrder} is already taken`)
    }

    return await this.prisma.courseCase.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        diagnosis: data.diagnosis,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        description: data.description,
        isFree: data.isFree ?? false,
        displayOrder: displayOrder
      },
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
    })
  }

  async findAll() {
    return await this.prisma.courseCase.findMany({
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
      },
      orderBy: [
        { courseId: 'asc' },
        { displayOrder: 'asc' }
      ]
    })
  }

  async findByCourse(courseId: string) {
    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    return await this.prisma.courseCase.findMany({
      where: { courseId },
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
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findFreeCases(courseId: string) {
    return await this.prisma.courseCase.findMany({
      where: { 
        courseId,
        isFree: true 
      },
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
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findPaidCases(courseId: string) {
    return await this.prisma.courseCase.findMany({
      where: { 
        courseId,
        isFree: false 
      },
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
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findByGender(courseId: string, gender: PatientGender) {
    return await this.prisma.courseCase.findMany({
      where: { 
        courseId,
        patientGender: gender 
      },
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
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findById(id: string) {
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id },
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
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    return courseCase
  }

  async update(id: string, data: UpdateCourseCaseInput) {
    // Check if case exists
    await this.findById(id)

    // If updating display order, check for conflicts
    if (data.displayOrder) {
      const caseToUpdate = await this.findById(id)
      const existingCase = await this.prisma.courseCase.findFirst({
        where: { 
          courseId: caseToUpdate.courseId,
          displayOrder: data.displayOrder,
          id: { not: id } // Exclude current case
        }
      })

      if (existingCase) {
        throw new Error(`Display order ${data.displayOrder} is already taken`)
      }
    }

    return await this.prisma.courseCase.update({
      where: { id },
      data,
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
    })
  }

  async delete(id: string) {
    // Check if case exists
    await this.findById(id)

    return await this.prisma.courseCase.delete({
      where: { id }
    })
  }

  async toggleFree(id: string) {
    const courseCase = await this.findById(id)
    
    return await this.prisma.courseCase.update({
      where: { id },
      data: { isFree: !courseCase.isFree },
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
    })
  }

  async reorder(id: string, newOrder: number) {
    const courseCase = await this.findById(id)
    const courseId = courseCase.courseId

    // Check if new order conflicts
    const existingCase = await this.prisma.courseCase.findFirst({
      where: { 
        courseId,
        displayOrder: newOrder,
        id: { not: id }
      }
    })

    if (existingCase) {
      throw new Error(`Display order ${newOrder} is already taken`)
    }

    return await this.prisma.courseCase.update({
      where: { id },
      data: { displayOrder: newOrder },
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
    })
  }

  // BUSINESS LOGIC METHODS

  async getCaseStats(courseId: string) {
    const totalCases = await this.prisma.courseCase.count({
      where: { courseId }
    })

    const freeCases = await this.prisma.courseCase.count({
      where: { courseId, isFree: true }
    })

    const paidCases = totalCases - freeCases

    const genderStats = await this.prisma.courseCase.groupBy({
      by: ['patientGender'],
      where: { courseId },
      _count: { patientGender: true }
    })

    return {
      courseId,
      totalCases,
      freeCases,
      paidCases,
      genderDistribution: genderStats.map((stat: { patientGender: string; _count: { patientGender: number } }) => ({
        gender: stat.patientGender,
        count: stat._count.patientGender
      }))
    }
  }

  async getAgeRange(courseId: string) {
    const result = await this.prisma.courseCase.aggregate({
      where: { courseId },
      _min: { patientAge: true },
      _max: { patientAge: true },
      _avg: { patientAge: true }
    })

    return {
      courseId,
      minAge: result._min.patientAge,
      maxAge: result._max.patientAge,
      avgAge: result._avg.patientAge ? Math.round(result._avg.patientAge) : null
    }
  }
}