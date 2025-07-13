// course-case.service.ts
import { PrismaClient, PatientGender } from '@prisma/client'
import { CreateCourseCaseInput, UpdateCourseCaseInput } from './course-case.schema'
import { any } from 'zod'

// Filter input interface
interface FilterInput {
  specialtyIds?: string[]
  curriculumIds?: string[]
  isFree?: boolean
  patientGender?: PatientGender
}

// Bulk assignment interface
interface BulkAssignmentInput {
  courseCaseId: string
  specialtyIds?: string[]
  curriculumIds?: string[]
}

export class CourseCaseService {
  constructor(private prisma: PrismaClient) {}

  // ===== BASIC CRUD OPERATIONS =====

  async create(data: CreateCourseCaseInput) {
    // Verify course exists and get course data
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    // Check if course style allows adding cases
    if (course.style !== 'RANDOM') {
      throw new Error('Cases can only be added to RANDOM style courses')
    }

    // Check if display order is already taken
    if (data.displayOrder) {
      const existingCase = await this.prisma.courseCase.findFirst({
        where: {
          courseId: data.courseId,
          displayOrder: data.displayOrder
        }
      })

      if (existingCase) {
        throw new Error(`Display order ${data.displayOrder} is already taken for this course`)
      }
    } else {
      // Auto-assign next display order
      const maxOrder = await this.prisma.courseCase.aggregate({
        where: { courseId: data.courseId },
        _max: { displayOrder: true }
      })
      data.displayOrder = (maxOrder._max.displayOrder || 0) + 1
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
        displayOrder: data.displayOrder
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
        },
        simulation: true,
        caseTabs: true,
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
      }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    return courseCase
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
        },
        simulation: {
          select: {
            id: true,
            timeLimitMinutes: true,
            creditCost: true
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
      orderBy: {
        displayOrder: 'asc'
      }
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
      orderBy: {
        displayOrder: 'asc'
      }
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
      orderBy: {
        displayOrder: 'asc'
      }
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
      orderBy: {
        displayOrder: 'asc'
      }
    })
  }

  async update(id: string, data: UpdateCourseCaseInput) {
    // Check if course case exists
    const existingCase = await this.findById(id)

    // If updating display order, check it's not taken by another case
    if (data.displayOrder && data.displayOrder !== existingCase.displayOrder) {
      const conflictingCase = await this.prisma.courseCase.findFirst({
        where: {
          courseId: existingCase.courseId,
          displayOrder: data.displayOrder,
          id: { not: id }
        }
      })

      if (conflictingCase) {
        throw new Error(`Display order ${data.displayOrder} is already taken for this course`)
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
    // Check if course case exists
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

    // Check if new order is taken by another case
    const conflictingCase = await this.prisma.courseCase.findFirst({
      where: {
        courseId: courseCase.courseId,
        displayOrder: newOrder,
        id: { not: id }
      }
    })

    if (conflictingCase) {
      throw new Error(`Display order ${newOrder} is already taken for this course`)
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

  // ===== STATISTICS & ANALYTICS =====

  async getCaseStats(courseId: string) {
    const totalCases = await this.prisma.courseCase.count({
      where: { courseId }
    })

    const freeCases = await this.prisma.courseCase.count({
      where: { courseId, isFree: true }
    })

    const paidCases = await this.prisma.courseCase.count({
      where: { courseId, isFree: false }
    })

    const genderDistribution = await this.prisma.courseCase.groupBy({
      by: ['patientGender'],
      where: { courseId },
      _count: {
        patientGender: true
      }
    })

    const casesWithSimulations = await this.prisma.courseCase.count({
      where: {
        courseId,
        simulation: {
          isNot: null
        }
      }
    })

    return {
      courseId,
      totalCases,
      freeCases,
      paidCases,
      casesWithSimulations,
      genderDistribution: genderDistribution.map((item: { patientGender: PatientGender; _count: { patientGender: number } }) => ({
        gender: item.patientGender,
        count: item._count.patientGender
      }))
    }
  }

  async getAgeRange(courseId: string) {
    const ageStats = await this.prisma.courseCase.aggregate({
      where: { courseId },
      _min: { patientAge: true },
      _max: { patientAge: true },
      _avg: { patientAge: true }
    })

    return {
      courseId,
      minAge: ageStats._min.patientAge,
      maxAge: ageStats._max.patientAge,
      avgAge: ageStats._avg.patientAge ? Math.round(ageStats._avg.patientAge * 10) / 10 : null
    }
  }

  // ===== JUNCTION TABLE OPERATIONS (User Stories #4, #42, #43) =====

  // Filter cases by specialties, curriculums, gender, and free status (User Story #4)
  async findByFilters(courseId: string, filters: FilterInput) {
    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    // Build the filter conditions
    const whereConditions: any = {
      courseId: courseId
    }

    // Add gender filter
    if (filters.patientGender) {
      whereConditions.patientGender = filters.patientGender
    }

    // Add free status filter
    if (filters.isFree !== undefined) {
      whereConditions.isFree = filters.isFree
    }

    // Add specialty filter (cases that have ALL specified specialties)
    if (filters.specialtyIds && filters.specialtyIds.length > 0) {
      whereConditions.caseSpecialties = {
        some: {
          specialtyId: { in: filters.specialtyIds }
        }
      }
    }

    // Add curriculum filter (cases that have ALL specified curriculums)
    if (filters.curriculumIds && filters.curriculumIds.length > 0) {
      whereConditions.caseCurriculums = {
        some: {
          curriculumId: { in: filters.curriculumIds }
        }
      }
    }

    const cases = await this.prisma.courseCase.findMany({
      where: whereConditions,
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
            specialty: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        caseCurriculums: {
          include: {
            curriculum: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        displayOrder: 'asc'
      }
    })

    // Transform the response to include specialties and curriculums directly
    return cases.map((caseItem: any) => ({
      id: caseItem.id,
      courseId: caseItem.courseId,
      title: caseItem.title,
      diagnosis: caseItem.diagnosis,
      patientName: caseItem.patientName,
      patientAge: caseItem.patientAge,
      patientGender: caseItem.patientGender,
      description: caseItem.description,
      isFree: caseItem.isFree,
      displayOrder: caseItem.displayOrder,
      createdAt: caseItem.createdAt,
      updatedAt: caseItem.updatedAt,
      specialties: caseItem.caseSpecialties.map((cs: any) => cs.specialty),
      curriculums: caseItem.caseCurriculums.map((cc: any) => cc.curriculum),
      course: caseItem.course
    }))
  }

  // Assign specialties to a course case (User Story #42)
  async assignSpecialties(courseCaseId: string, specialtyIds: string[]) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

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

  // Assign curriculum items to a course case (User Story #43)
  async assignCurriculums(courseCaseId: string, curriculumIds: string[]) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

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

  // Bulk assign filters to multiple course cases
  async bulkAssignFilters(assignments: BulkAssignmentInput[]) {
    const results = []

    for (const assignment of assignments) {
      const operations = []

      if (assignment.specialtyIds && assignment.specialtyIds.length > 0) {
        operations.push(
          this.assignSpecialties(assignment.courseCaseId, assignment.specialtyIds)
        )
      }

      if (assignment.curriculumIds && assignment.curriculumIds.length > 0) {
        operations.push(
          this.assignCurriculums(assignment.courseCaseId, assignment.curriculumIds)
        )
      }

      if (operations.length > 0) {
        await Promise.all(operations)
        results.push({
          courseCaseId: assignment.courseCaseId,
          specialtiesAssigned: assignment.specialtyIds?.length || 0,
          curriculumsAssigned: assignment.curriculumIds?.length || 0
        })
      }
    }

    return results
  }

  // ===== RETRIEVAL OPERATIONS =====

  // Get specialties assigned to a course case
  async getCaseSpecialties(courseCaseId: string) {
    // Verify course case exists
    await this.findById(courseCaseId)

    const caseSpecialties = await this.prisma.caseSpecialty.findMany({
      where: { courseCaseId },
      include: {
        specialty: true
      }
    })

    return caseSpecialties.map((cs:any) => cs.specialty)
  }

  // Get curriculum items assigned to a course case
  async getCaseCurriculums(courseCaseId: string) {
    // Verify course case exists
    await this.findById(courseCaseId)

    const caseCurriculums = await this.prisma.caseCurriculum.findMany({
      where: { courseCaseId },
      include: {
        curriculum: true
      }
    })

    return caseCurriculums.map((cc: any) => cc.curriculum)
  }

  // ===== REMOVAL OPERATIONS =====

  // Remove specialty from course case
  async removeSpecialty(courseCaseId: string, specialtyId: string) {
    // Verify course case exists
    await this.findById(courseCaseId)

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
    // Verify course case exists
    await this.findById(courseCaseId)

    const deleted = await this.prisma.caseCurriculum.deleteMany({
      where: { courseCaseId, curriculumId }
    })

    if (deleted.count === 0) {
      throw new Error('Curriculum assignment not found')
    }

    return { message: 'Curriculum removed successfully' }
  }

  // ===== FILTERING STATISTICS =====

  // Get filtering statistics for a course
  async getFilteringStats(courseId: string) {
    const totalCases = await this.prisma.courseCase.count({
      where: { courseId }
    })

    // Get specialty distribution
    const specialtyDistribution = await this.prisma.caseSpecialty.groupBy({
      by: ['specialtyId'],
      where: {
        courseCase: { courseId }
      },
      _count: {
        specialtyId: true
      }
    })

    // Get curriculum distribution
    const curriculumDistribution = await this.prisma.caseCurriculum.groupBy({
      by: ['curriculumId'],
      where: {
        courseCase: { courseId }
      },
      _count: {
        curriculumId: true
      }
    })

    // Enrich with specialty and curriculum details
    const enrichedSpecialtyDistribution = await Promise.all(
      specialtyDistribution.map(async (item: { specialtyId: string; _count: { specialtyId: number } }) => {
        const specialty = await this.prisma.specialty.findUnique({
          where: { id: item.specialtyId }
        })
        return {
          specialtyId: item.specialtyId,
          count: item._count.specialtyId,
          specialty: {
            id: specialty?.id || '',
            name: specialty?.name || ''
          }
        }
      })
    )

    const enrichedCurriculumDistribution = await Promise.all(
      curriculumDistribution.map(async (item: { curriculumId: string; _count: { curriculumId: number } }) => {
        const curriculum = await this.prisma.curriculum.findUnique({
          where: { id: item.curriculumId }
        })
        return {
          curriculumId: item.curriculumId,
          count: item._count.curriculumId,
          curriculum: {
            id: curriculum?.id || '',
            name: curriculum?.name || ''
          }
        }
      })
    )

    return {
      courseId,
      totalCases,
      specialtyDistribution: enrichedSpecialtyDistribution,
      curriculumDistribution: enrichedCurriculumDistribution
    }
  }
}