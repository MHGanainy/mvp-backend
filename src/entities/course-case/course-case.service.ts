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

  async assignSpecialties(courseCaseId: string, specialtyIds: string[]) {
    // Verify course case exists
    await this.findById(courseCaseId)

    // Verify all specialties exist
    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: specialtyIds } }
    })

    if (specialties.length !== specialtyIds.length) {
      throw new Error('One or more specialties not found')
    }

    // Remove existing assignments
    await this.prisma.caseSpecialty.deleteMany({
      where: { courseCaseId }
    })

    // Create new assignments
    const assignments = await this.prisma.caseSpecialty.createMany({
      data: specialtyIds.map((specialtyId: string) => ({
        courseCaseId,
        specialtyId
      }))
    })

    return assignments
  }

  // Assign curriculum items to a course case
  async assignCurriculums(courseCaseId: string, curriculumIds: string[]) {
    // Verify course case exists
    await this.findById(courseCaseId)

    // Verify all curriculum items exist
    const curriculums = await this.prisma.curriculum.findMany({
      where: { id: { in: curriculumIds } }
    })

    if (curriculums.length !== curriculumIds.length) {
      throw new Error('One or more curriculum items not found')
    }

    // Remove existing assignments
    await this.prisma.caseCurriculum.deleteMany({
      where: { courseCaseId }
    })

    // Create new assignments
    const assignments = await this.prisma.caseCurriculum.createMany({
      data: curriculumIds.map((curriculumId: string) => ({
        courseCaseId,
        curriculumId
      }))
    })

    return assignments
  }

  // Get cases filtered by specialties and/or curriculum items
  async findByFilters(courseId: string, filters: {
    specialtyIds?: string[]
    curriculumIds?: string[]
    isFree?: boolean
    patientGender?: PatientGender
  }) {
    let whereClause: any = { courseId }

    // Add free/paid filter
    if (filters.isFree !== undefined) {
      whereClause.isFree = filters.isFree
    }

    // Add gender filter
    if (filters.patientGender) {
      whereClause.patientGender = filters.patientGender
    }

    // Add specialty filter
    if (filters.specialtyIds && filters.specialtyIds.length > 0) {
      whereClause.caseSpecialties = {
        some: {
          specialtyId: { in: filters.specialtyIds }
        }
      }
    }

    // Add curriculum filter
    if (filters.curriculumIds && filters.curriculumIds.length > 0) {
      whereClause.caseCurriculums = {
        some: {
          curriculumId: { in: filters.curriculumIds }
        }
      }
    }

    return await this.prisma.courseCase.findMany({
      where: whereClause,
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
        },
        caseSpecialties: {
          include: {
            specialty: true
          }
        },
        caseCurriculums: {
          include: {
            curriculum: true
          }
        }
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  // Get specialties assigned to a course case
  async getCaseSpecialties(courseCaseId: string) {
    const caseSpecialties = await this.prisma.caseSpecialty.findMany({
      where: { courseCaseId },
      include: {
        specialty: true
      }
    })

    return caseSpecialties.map((cs: { specialty: any }) => cs.specialty)
  }

  // Get curriculum items assigned to a course case
  async getCaseCurriculums(courseCaseId: string) {
    const caseCurriculums = await this.prisma.caseCurriculum.findMany({
      where: { courseCaseId },
      include: {
        curriculum: true
      }
    })

    return caseCurriculums.map((cc: { curriculum: any }) => cc.curriculum)
  }

  // Remove specialty from course case
  async removeSpecialty(courseCaseId: string, specialtyId: string) {
    const deleted = await this.prisma.caseSpecialty.deleteMany({
      where: { courseCaseId, specialtyId }
    })

    if (deleted.count === 0) {
      throw new Error('Specialty assignment not found')
    }

    return { message: 'Specialty removed successfully' }
  }

  // Remove curriculum from course case
  async removeCurriculum(courseCaseId: string, curriculumId: string) {
    const deleted = await this.prisma.caseCurriculum.deleteMany({
      where: { courseCaseId, curriculumId }
    })

    if (deleted.count === 0) {
      throw new Error('Curriculum assignment not found')
    }

    return { message: 'Curriculum removed successfully' }
  }

  // Get filtering statistics for a course
  async getFilteringStats(courseId: string) {
    // Get all cases for this course
    const totalCases = await this.prisma.courseCase.count({
      where: { courseId }
    })

    // Get specialty distribution
    const specialtyStats = await this.prisma.caseSpecialty.groupBy({
      by: ['specialtyId'],
      where: {
        courseCase: { courseId }
      },
      _count: { specialtyId: true },
      include: {
        specialty: true
      }
    })

    // Get curriculum distribution
    const curriculumStats = await this.prisma.caseCurriculum.groupBy({
      by: ['curriculumId'],
      where: {
        courseCase: { courseId }
      },
      _count: { curriculumId: true }
    })

    return {
      courseId,
      totalCases,
      specialtyDistribution: specialtyStats,
      curriculumDistribution: curriculumStats
    }
  }

  // Bulk assign specialties and curriculums to multiple cases
  async bulkAssignFilters(assignments: Array<{
    courseCaseId: string
    specialtyIds?: string[]
    curriculumIds?: string[]
  }>) {
    const results = await this.prisma.$transaction(
      assignments.map((assignment: {
        courseCaseId: string
        specialtyIds?: string[]
        curriculumIds?: string[]
      }) => {
        const operations = []

        if (assignment.specialtyIds && assignment.specialtyIds.length > 0) {
          operations.push(
            this.prisma.caseSpecialty.deleteMany({
              where: { courseCaseId: assignment.courseCaseId }
            }),
            this.prisma.caseSpecialty.createMany({
              data: assignment.specialtyIds.map((specialtyId: string) => ({
                courseCaseId: assignment.courseCaseId,
                specialtyId
              }))
            })
          )
        }

        if (assignment.curriculumIds && assignment.curriculumIds.length > 0) {
          operations.push(
            this.prisma.caseCurriculum.deleteMany({
              where: { courseCaseId: assignment.courseCaseId }
            }),
            this.prisma.caseCurriculum.createMany({
              data: assignment.curriculumIds.map((curriculumId: string) => ({
                courseCaseId: assignment.courseCaseId,
                curriculumId
              }))
            })
          )
        }

        return operations
      }).flat()
    )

    return {
      message: 'Bulk assignment completed',
      processedCases: assignments.length
    }
  }
}