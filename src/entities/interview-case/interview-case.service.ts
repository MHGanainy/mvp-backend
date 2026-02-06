// interview-case.service.ts
import { PrismaClient, PatientGender, Prisma } from '@prisma/client'
import { CreateInterviewCaseInput, UpdateInterviewCaseInput, CreateCompleteInterviewCaseInput, UpdateCompleteInterviewCaseInput } from './interview-case.schema'
import { generateSlug, generateUniqueSlug } from '../../shared/slug'

// Define InterviewCaseTabType - should match your Prisma schema enum
type InterviewCaseTabType = 'DOCTORS_NOTE' | 'PATIENT_SCRIPT' | 'MEDICAL_NOTES'

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

// Add type for marking criterion with domain
interface InterviewMarkingCriterionWithDomain {
  id: string
  interviewCaseId: string
  markingDomainId: string
  text: string
  points: number
  displayOrder: number
  createdAt: Date
  markingDomain: {
    id: string
    name: string
  }
}

// Add type for grouped criteria
interface GroupedCriteria {
  domainId: string
  domainName: string
  criteria: {
    id: string
    text: string
    points: number
    displayOrder: number
  }[]
}

export class InterviewCaseService {
  constructor(private prisma: PrismaClient) {}

  // Helper function to get standard include object for interview cases
  public getStandardInclude() {
    return {
      interviewCourse: {
        include: {
          interview: {
            select: {
              id: true,
              title: true,
              slug: true
            }
          }
        }
      },
      interviewSimulation: true,
      interviewCaseTabs: true,
      interviewMarkingCriteria: {
        include: {
          markingDomain: true
        },
        orderBy: [
          { markingDomain: { name: Prisma.SortOrder.asc } },
          { displayOrder: Prisma.SortOrder.asc }
        ]
      },
      interviewCaseSpecialties: {
        include: {
          specialty: true
        }
      },
      interviewCaseCurriculums: {
        include: {
          curriculum: true
        }
      }
    }
  }

  // ===== BASIC CRUD OPERATIONS =====

  async create(data: CreateInterviewCaseInput) {
    // Verify interview course exists and get interview course data
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: data.interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    // Check if interview course style allows adding cases
    if (interviewCourse.style !== 'RANDOM') {
      throw new Error('Cases can only be added to RANDOM style interview courses')
    }

    // Check if display order is already taken
    if (data.displayOrder) {
      const existingCase = await this.prisma.interviewCase.findFirst({
        where: {
          interviewCourseId: data.interviewCourseId,
          displayOrder: data.displayOrder
        }
      })

      if (existingCase) {
        throw new Error(`Display order ${data.displayOrder} is already taken for this interview course`)
      }
    } else {
      // Auto-assign next display order
      const maxOrder = await this.prisma.interviewCase.aggregate({
        where: { interviewCourseId: data.interviewCourseId },
        _max: { displayOrder: true }
      })
      data.displayOrder = (maxOrder._max.displayOrder || 0) + 1
    }

    // Generate unique slug for this interview course
    const slug = await generateUniqueSlug(data.title, async (testSlug) => {
      const existing = await this.prisma.interviewCase.findFirst({
        where: { interviewCourseId: data.interviewCourseId, slug: testSlug }
      })
      return existing !== null
    })

    return await this.prisma.interviewCase.create({
      data: {
        interviewCourseId: data.interviewCourseId,
        slug,
        title: data.title,
        diagnosis: data.diagnosis,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        description: data.description,
        isFree: data.isFree ?? false,
        displayOrder: data.displayOrder
      },
      include: this.getStandardInclude()
    })
  }

  async findAll() {
    return await this.prisma.interviewCase.findMany({
      include: this.getStandardInclude(),
      orderBy: [
        { interviewCourseId: 'asc' },
        { displayOrder: 'asc' }
      ]
    })
  }

  async findById(id: string) {
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id },
      include: this.getStandardInclude()
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    return interviewCase
  }

  async findBySlug(interviewSlug: string, courseSlug: string, caseSlug: string) {
    // Step 1: Find interview by slug
    const interview = await this.prisma.interview.findUnique({
      where: { slug: interviewSlug }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    // Step 2: Find interview course by slug within interview
    const interviewCourse = await this.prisma.interviewCourse.findFirst({
      where: {
        interviewId: interview.id,
        slug: courseSlug
      }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    // Step 3: Find interview case by slug within interview course
    const interviewCase = await this.prisma.interviewCase.findFirst({
      where: {
        interviewCourseId: interviewCourse.id,
        slug: caseSlug
      },
      include: this.getStandardInclude()
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    return interviewCase
  }

  async findByInterviewCourse(interviewCourseId: string) {
    // Verify interview course exists
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    return await this.prisma.interviewCase.findMany({
      where: { interviewCourseId },
      include: this.getStandardInclude(),
      orderBy: {
        displayOrder: 'asc'
      }
    })
  }

  async findByInterviewCoursePaginated(
    interviewCourseId: string,
    options: {
      page: number
      limit: number
      specialtyIds?: string[]
      curriculumIds?: string[]
      search?: string
      studentId?: string
      notPracticed?: boolean
      bookmarked?: boolean
    }
  ) {
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    const skip = (options.page - 1) * options.limit

    const whereConditions: any = {
      interviewCourseId
    }

    if (options.specialtyIds && options.specialtyIds.length > 0) {
      whereConditions.interviewCaseSpecialties = {
        some: {
          specialtyId: { in: options.specialtyIds }
        }
      }
    }

    if (options.curriculumIds && options.curriculumIds.length > 0) {
      whereConditions.interviewCaseCurriculums = {
        some: {
          curriculumId: { in: options.curriculumIds }
        }
      }
    }

    const andConditions: any[] = []

    if (options.search && options.search.trim()) {
      const searchTerm = options.search.trim()
      andConditions.push({
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { diagnosis: { contains: searchTerm, mode: 'insensitive' } }
        ]
      })
    }

    if (options.studentId) {
      if (options.notPracticed && options.bookmarked) {
        andConditions.push({
          studentPractice: {
            some: {
              studentId: options.studentId,
              isBookmarked: true,
              isPracticed: false
            }
          }
        })
      } else if (options.notPracticed) {
        andConditions.push({
          NOT: {
            studentPractice: {
              some: {
                studentId: options.studentId,
                isPracticed: true
              }
            }
          }
        })
      } else if (options.bookmarked) {
        andConditions.push({
          studentPractice: {
            some: {
              studentId: options.studentId,
              isBookmarked: true
            }
          }
        })
      }
    }

    if (andConditions.length > 0) {
      whereConditions.AND = andConditions
    }

    const total = await this.prisma.interviewCase.count({
      where: whereConditions
    })

    const include: any = {
      ...this.getStandardInclude()
    }

    if (options.studentId) {
      include.studentPractice = {
        where: {
          studentId: options.studentId
        },
        select: {
          isPracticed: true,
          practiceCount: true,
          firstPracticedAt: true,
          lastPracticedAt: true,
          isBookmarked: true,
          bookmarkedAt: true
        }
      }
    }

    const rawData = await this.prisma.interviewCase.findMany({
      where: whereConditions,
      include,
      orderBy: {
        displayOrder: 'asc'
      },
      skip,
      take: options.limit
    })

    const data = rawData.map((caseItem: any) => {
      const { studentPractice, ...rest } = caseItem
      const status = studentPractice?.[0] || null

      return {
        ...rest,
        studentStatus: status ? {
          isPracticed: status.isPracticed,
          practiceCount: status.practiceCount,
          firstPracticedAt: status.firstPracticedAt,
          lastPracticedAt: status.lastPracticedAt,
          isBookmarked: status.isBookmarked,
          bookmarkedAt: status.bookmarkedAt
        } : null
      }
    })

    const totalPages = Math.ceil(total / options.limit)

    return {
      data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages,
        hasNextPage: options.page < totalPages,
        hasPreviousPage: options.page > 1
      }
    }
  }

  async findFreeCases(interviewCourseId: string) {
    return await this.prisma.interviewCase.findMany({
      where: {
        interviewCourseId,
        isFree: true
      },
      include: this.getStandardInclude(),
      orderBy: {
        displayOrder: 'asc'
      }
    })
  }

  async findPaidCases(interviewCourseId: string) {
    return await this.prisma.interviewCase.findMany({
      where: {
        interviewCourseId,
        isFree: false
      },
      include: this.getStandardInclude(),
      orderBy: {
        displayOrder: 'asc'
      }
    })
  }

  async findByGender(interviewCourseId: string, gender: PatientGender) {
    return await this.prisma.interviewCase.findMany({
      where: {
        interviewCourseId,
        patientGender: gender
      },
      include: this.getStandardInclude(),
      orderBy: {
        displayOrder: 'asc'
      }
    })
  }

  async update(id: string, data: UpdateInterviewCaseInput) {
    // Check if interview case exists
    const existingCase = await this.findById(id)

    // If updating display order, check it's not taken by another case
    if (data.displayOrder && data.displayOrder !== existingCase.displayOrder) {
      const conflictingCase = await this.prisma.interviewCase.findFirst({
        where: {
          interviewCourseId: existingCase.interviewCourseId,
          displayOrder: data.displayOrder,
          id: { not: id }
        }
      })

      if (conflictingCase) {
        throw new Error(`Display order ${data.displayOrder} is already taken for this interview course`)
      }
    }

    return await this.prisma.interviewCase.update({
      where: { id },
      data,
      include: this.getStandardInclude()
    })
  }

  async delete(id: string) {
    // Check if interview case exists
    await this.findById(id)

    return await this.prisma.interviewCase.delete({
      where: { id }
    })
  }

  async toggleFree(id: string) {
    const interviewCase = await this.findById(id)

    return await this.prisma.interviewCase.update({
      where: { id },
      data: { isFree: !interviewCase.isFree },
      include: this.getStandardInclude()
    })
  }

  async reorder(id: string, newOrder: number) {
    const interviewCase = await this.findById(id)

    // Check if new order is taken by another case
    const conflictingCase = await this.prisma.interviewCase.findFirst({
      where: {
        interviewCourseId: interviewCase.interviewCourseId,
        displayOrder: newOrder,
        id: { not: id }
      }
    })

    if (conflictingCase) {
      throw new Error(`Display order ${newOrder} is already taken for this interview course`)
    }

    return await this.prisma.interviewCase.update({
      where: { id },
      data: { displayOrder: newOrder },
      include: this.getStandardInclude()
    })
  }

  // ===== STATISTICS & ANALYTICS =====

  async getCaseStats(interviewCourseId: string) {
    const totalCases = await this.prisma.interviewCase.count({
      where: { interviewCourseId }
    })

    const freeCases = await this.prisma.interviewCase.count({
      where: { interviewCourseId, isFree: true }
    })

    const paidCases = await this.prisma.interviewCase.count({
      where: { interviewCourseId, isFree: false }
    })

    const genderDistribution = await this.prisma.interviewCase.groupBy({
      by: ['patientGender'],
      where: { interviewCourseId },
      _count: {
        patientGender: true
      }
    })

    const casesWithSimulations = await this.prisma.interviewCase.count({
      where: {
        interviewCourseId,
        interviewSimulation: {
          isNot: null
        }
      }
    })

    return {
      interviewCourseId,
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

  async getAgeRange(interviewCourseId: string) {
    const ageStats = await this.prisma.interviewCase.aggregate({
      where: { interviewCourseId },
      _min: { patientAge: true },
      _max: { patientAge: true },
      _avg: { patientAge: true }
    })

    return {
      interviewCourseId,
      minAge: ageStats._min.patientAge,
      maxAge: ageStats._max.patientAge,
      avgAge: ageStats._avg.patientAge ? Math.round(ageStats._avg.patientAge * 10) / 10 : null
    }
  }

  // ===== JUNCTION TABLE OPERATIONS =====

  async findByFilters(interviewCourseId: string, filters: FilterInput) {
    // Verify interview course exists
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    // Build the filter conditions
    const whereConditions: any = {
      interviewCourseId: interviewCourseId
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
      whereConditions.interviewCaseSpecialties = {
        some: {
          specialtyId: { in: filters.specialtyIds }
        }
      }
    }

    // Add curriculum filter (cases that have ALL specified curriculums)
    if (filters.curriculumIds && filters.curriculumIds.length > 0) {
      whereConditions.interviewCaseCurriculums = {
        some: {
          curriculumId: { in: filters.curriculumIds }
        }
      }
    }

    const cases = await this.prisma.interviewCase.findMany({
      where: whereConditions,
      include: this.getStandardInclude(),
      orderBy: {
        displayOrder: 'asc'
      }
    })

    // Transform the response to include specialties and curriculums directly
    return cases.map((caseItem: any) => ({
      id: caseItem.id,
      interviewCourseId: caseItem.interviewCourseId,
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
      specialties: caseItem.interviewCaseSpecialties.map((cs: any) => cs.specialty),
      curriculums: caseItem.interviewCaseCurriculums.map((cc: any) => cc.curriculum),
      interviewCourse: caseItem.interviewCourse,
      interviewSimulation: caseItem.interviewSimulation,
      interviewCaseTabs: caseItem.interviewCaseTabs
    }))
  }

  async assignSpecialties(interviewCaseId: string, specialtyIds: string[]) {
    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Verify all specialties exist
    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: specialtyIds } }
    })

    if (specialties.length !== specialtyIds.length) {
      throw new Error('One or more specialties not found')
    }

    // Remove existing assignments
    await this.prisma.interviewCaseSpecialty.deleteMany({
      where: { interviewCaseId }
    })

    // Create new assignments
    const assignments = await this.prisma.interviewCaseSpecialty.createMany({
      data: specialtyIds.map((specialtyId: string) => ({
        interviewCaseId,
        specialtyId
      }))
    })

    return assignments
  }

  async assignCurriculums(interviewCaseId: string, curriculumIds: string[]) {
    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Verify all curriculum items exist
    const curriculums = await this.prisma.curriculum.findMany({
      where: { id: { in: curriculumIds } }
    })

    if (curriculums.length !== curriculumIds.length) {
      throw new Error('One or more curriculum items not found')
    }

    // Remove existing assignments
    await this.prisma.interviewCaseCurriculum.deleteMany({
      where: { interviewCaseId }
    })

    // Create new assignments
    const assignments = await this.prisma.interviewCaseCurriculum.createMany({
      data: curriculumIds.map((curriculumId: string) => ({
        interviewCaseId,
        curriculumId
      }))
    })

    return assignments
  }

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
          interviewCaseId: assignment.courseCaseId,
          specialtiesAssigned: assignment.specialtyIds?.length || 0,
          curriculumsAssigned: assignment.curriculumIds?.length || 0
        })
      }
    }

    return results
  }

  // ===== RETRIEVAL OPERATIONS =====

  async getCaseSpecialties(interviewCaseId: string) {
    // Verify interview case exists
    await this.findById(interviewCaseId)

    const interviewCaseSpecialties = await this.prisma.interviewCaseSpecialty.findMany({
      where: { interviewCaseId },
      include: {
        specialty: true
      }
    })

    return interviewCaseSpecialties.map((cs:any) => cs.specialty)
  }

  async getCaseCurriculums(interviewCaseId: string) {
    // Verify interview case exists
    await this.findById(interviewCaseId)

    const interviewCaseCurriculums = await this.prisma.interviewCaseCurriculum.findMany({
      where: { interviewCaseId },
      include: {
        curriculum: true
      }
    })

    return interviewCaseCurriculums.map((cc: any) => cc.curriculum)
  }

  // ===== REMOVAL OPERATIONS =====

  async removeSpecialty(interviewCaseId: string, specialtyId: string) {
    // Verify interview case exists
    await this.findById(interviewCaseId)

    const deleted = await this.prisma.interviewCaseSpecialty.deleteMany({
      where: { interviewCaseId, specialtyId }
    })

    if (deleted.count === 0) {
      throw new Error('Specialty assignment not found')
    }

    return { message: 'Specialty removed successfully' }
  }

  async removeCurriculum(interviewCaseId: string, curriculumId: string) {
    // Verify interview case exists
    await this.findById(interviewCaseId)

    const deleted = await this.prisma.interviewCaseCurriculum.deleteMany({
      where: { interviewCaseId, curriculumId }
    })

    if (deleted.count === 0) {
      throw new Error('Curriculum assignment not found')
    }

    return { message: 'Curriculum removed successfully' }
  }

  // ===== FILTERING STATISTICS =====

  async getFilteringStats(interviewCourseId: string) {
    const totalCases = await this.prisma.interviewCase.count({
      where: { interviewCourseId }
    })

    // Get specialty distribution
    const specialtyDistribution = await this.prisma.interviewCaseSpecialty.groupBy({
      by: ['specialtyId'],
      where: {
        interviewCase: { interviewCourseId }
      },
      _count: {
        specialtyId: true
      }
    })

    // Get curriculum distribution
    const curriculumDistribution = await this.prisma.interviewCaseCurriculum.groupBy({
      by: ['curriculumId'],
      where: {
        interviewCase: { interviewCourseId }
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
      interviewCourseId,
      totalCases,
      specialtyDistribution: enrichedSpecialtyDistribution,
      curriculumDistribution: enrichedCurriculumDistribution
    }
  }

  // ===== COMPLETE INTERVIEW CASE OPERATIONS =====

  async createCompleteInterviewCase(data: CreateCompleteInterviewCaseInput) {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify interview course exists and get interview course data
      const interviewCourse = await tx.interviewCourse.findUnique({
        where: { id: data.interviewCase.interviewCourseId }
      })

      if (!interviewCourse) {
        throw new Error('Interview course not found')
      }

      if (interviewCourse.style !== 'RANDOM') {
        throw new Error('Cases can only be added to RANDOM style interview courses')
      }

      if (!data.interviewCase.displayOrder) {
        const maxOrder = await tx.interviewCase.aggregate({
          where: { interviewCourseId: data.interviewCase.interviewCourseId },
          _max: { displayOrder: true }
        })
        data.interviewCase.displayOrder = (maxOrder._max.displayOrder || 0) + 1
      } else {
        const existingCase = await tx.interviewCase.findFirst({
          where: {
            interviewCourseId: data.interviewCase.interviewCourseId,
            displayOrder: data.interviewCase.displayOrder
          }
        })

        if (existingCase) {
          throw new Error(`Display order ${data.interviewCase.displayOrder} is already taken for this interview course`)
        }
      }

      // Generate unique slug for this interview course
      const baseSlug = generateSlug(data.interviewCase.title)
      let slug = baseSlug
      let counter = 1
      while (true) {
        const existing = await tx.interviewCase.findFirst({
          where: { interviewCourseId: data.interviewCase.interviewCourseId, slug }
        })
        if (!existing) break
        slug = `${baseSlug}-${counter}`
        counter++
      }

      // Step 2: Create the interview case
      const interviewCase = await tx.interviewCase.create({
        data: {
          interviewCourseId: data.interviewCase.interviewCourseId,
          slug,
          title: data.interviewCase.title,
          diagnosis: data.interviewCase.diagnosis,
          patientName: data.interviewCase.patientName,
          patientAge: data.interviewCase.patientAge,
          patientGender: data.interviewCase.patientGender,
          description: data.interviewCase.description,
          isFree: data.interviewCase.isFree ?? false,
          displayOrder: data.interviewCase.displayOrder
        }
      })

      // Step 3: Create only 3 tabs
      const tabTypes: InterviewCaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES']
      const createdTabs: any = {}

      for (const tabType of tabTypes) {
        const content = data.tabs?.[tabType] || []

        const tab = await tx.interviewCaseTab.create({
          data: {
            interviewCaseId: interviewCase.id,
            tabType,
            content
          }
        })

        createdTabs[tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.length > 0
        }
      }

      // Step 4: Create marking criteria if provided
      let markingCriteriaResponse: GroupedCriteria[] = []
      if (data.markingCriteria && data.markingCriteria.length > 0) {
        const createdCriteria = await Promise.all(
          data.markingCriteria.map(criterion =>
            tx.interviewMarkingCriterion.create({
              data: {
                interviewCaseId: interviewCase.id,
                markingDomainId: criterion.markingDomainId,
                text: criterion.text,
                points: criterion.points,
                displayOrder: criterion.displayOrder
              },
              include: {
                markingDomain: true
              }
            })
          )
        ) as InterviewMarkingCriterionWithDomain[]

        // Group by domain for response with proper typing
        markingCriteriaResponse = createdCriteria.reduce((acc: GroupedCriteria[], criterion: InterviewMarkingCriterionWithDomain) => {
          const domainId = criterion.markingDomain.id
          const domainName = criterion.markingDomain.name

          let group = acc.find(g => g.domainId === domainId)
          if (!group) {
            group = { domainId, domainName, criteria: [] }
            acc.push(group)
          }

          group.criteria.push({
            id: criterion.id,
            text: criterion.text,
            points: criterion.points,
            displayOrder: criterion.displayOrder
          })

          return acc
        }, [])
      }

      // Step 5: Create new entities
      const createdEntities = {
        specialties: [] as any[],
        curriculums: [] as any[]
      }

      if (data.new?.specialties && data.new.specialties.length > 0) {
        for (const specialty of data.new.specialties) {
          const existing = await tx.specialty.findFirst({
            where: {
              name: {
                equals: specialty.name,
                mode: 'insensitive'
              }
            }
          })

          if (existing) {
            createdEntities.specialties.push(existing)
          } else {
            const created = await tx.specialty.create({
              data: { name: specialty.name }
            })
            createdEntities.specialties.push(created)
          }
        }
      }

      if (data.new?.curriculums && data.new.curriculums.length > 0) {
        for (const curriculum of data.new.curriculums) {
          const existing = await tx.curriculum.findFirst({
            where: {
              name: {
                equals: curriculum.name,
                mode: 'insensitive'
              }
            }
          })

          if (existing) {
            createdEntities.curriculums.push(existing)
          } else {
            const created = await tx.curriculum.create({
              data: { name: curriculum.name }
            })
            createdEntities.curriculums.push(created)
          }
        }
      }

      // Step 6: Collect all IDs
      const allSpecialtyIds = [
        ...(data.existing?.specialtyIds || []),
        ...createdEntities.specialties.map(s => s.id)
      ]

      const allCurriculumIds = [
        ...(data.existing?.curriculumIds || []),
        ...createdEntities.curriculums.map(c => c.id)
      ]

      // Step 7: Verify existing entities
      if (data.existing?.specialtyIds && data.existing.specialtyIds.length > 0) {
        const count = await tx.specialty.count({
          where: { id: { in: data.existing.specialtyIds } }
        })
        if (count !== data.existing.specialtyIds.length) {
          throw new Error('One or more specialties not found')
        }
      }

      if (data.existing?.curriculumIds && data.existing.curriculumIds.length > 0) {
        const count = await tx.curriculum.count({
          where: { id: { in: data.existing.curriculumIds } }
        })
        if (count !== data.existing.curriculumIds.length) {
          throw new Error('One or more curriculums not found')
        }
      }

      // Step 8: Create junction table entries
      if (allSpecialtyIds.length > 0) {
        await tx.interviewCaseSpecialty.createMany({
          data: allSpecialtyIds.map(specialtyId => ({
            interviewCaseId: interviewCase.id,
            specialtyId
          }))
        })
      }

      if (allCurriculumIds.length > 0) {
        await tx.interviewCaseCurriculum.createMany({
          data: allCurriculumIds.map(curriculumId => ({
            interviewCaseId: interviewCase.id,
            curriculumId
          }))
        })
      }

      // Step 9: Create interviewSimulation if provided - UPDATED
      let interviewSimulation = null
      if (data.interviewSimulation) {
        if (data.interviewSimulation.warningTimeMinutes &&
            data.interviewSimulation.warningTimeMinutes >= data.interviewSimulation.timeLimitMinutes) {
          throw new Error('Warning time must be less than time limit')
        }

        // Extract provider keys - prioritize direct keys, fall back to extracting from voiceAssistantConfig
        let sttProviderKey = data.interviewSimulation.sttProviderKey
        let llmProviderKey = data.interviewSimulation.llmProviderKey
        let ttsProviderKey = data.interviewSimulation.ttsProviderKey

        // If voiceAssistantConfig is provided (from frontend sending full config), extract provider keys
        // This is for backward compatibility
        if (data.interviewSimulation.voiceAssistantConfig && !sttProviderKey && !llmProviderKey && !ttsProviderKey) {
          // You could add logic here to map from full config to provider keys if needed
          // For now, we'll just use the direct provider keys
        }

        interviewSimulation = await tx.interviewSimulation.create({
          data: {
            interviewCaseId: interviewCase.id,
            casePrompt: data.interviewSimulation.casePrompt,
            openingLine: data.interviewSimulation.openingLine,
            timeLimitMinutes: data.interviewSimulation.timeLimitMinutes,
            voiceModel: data.interviewSimulation.voiceModel,
            warningTimeMinutes: data.interviewSimulation.warningTimeMinutes,
            creditCost: data.interviewSimulation.creditCost,
            // Store provider keys
            sttProviderKey: sttProviderKey,
            llmProviderKey: llmProviderKey,
            ttsProviderKey: ttsProviderKey
          }
        })
      }

      // Step 10: Fetch all assigned entities for response
      const assignedSpecialties = await tx.specialty.findMany({
        where: { id: { in: allSpecialtyIds } }
      })

      const assignedCurriculums = await tx.curriculum.findMany({
        where: { id: { in: allCurriculumIds } }
      })

      const newSpecialtiesCount = createdEntities.specialties.filter(s =>
        !data.existing?.specialtyIds?.includes(s.id) &&
        data.new?.specialties?.some(ns => ns.name === s.name)
      ).length

      const newCurriculumsCount = createdEntities.curriculums.filter(c =>
        !data.existing?.curriculumIds?.includes(c.id) &&
        data.new?.curriculums?.some(nc => nc.name === c.name)
      ).length

      return {
        interviewCase,
        tabs: createdTabs,
        markingCriteria: markingCriteriaResponse,
        created: {
          specialties: createdEntities.specialties.filter(s =>
            data.new?.specialties?.some(ns => ns.name === s.name)
          ),
          curriculums: createdEntities.curriculums.filter(c =>
            data.new?.curriculums?.some(nc => nc.name === c.name)
          )
        },
        assigned: {
          specialties: assignedSpecialties,
          curriculums: assignedCurriculums
        },
        interviewSimulation,
        summary: {
          totalSpecialties: assignedSpecialties.length,
          totalCurriculums: assignedCurriculums.length,
          newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount,
          simulationCreated: !!interviewSimulation,
          tabsCreated: 3,
          tabsUpdated: 0,
          markingCriteriaCreated: data.markingCriteria?.length || 0
        }
      }
    })
  }

  async updateCompleteInterviewCase(data: UpdateCompleteInterviewCaseInput) {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify interview case exists
      const existingInterviewCase = await tx.interviewCase.findUnique({
        where: { id: data.interviewCaseId },
        include: {
          interviewCourse: true,
          interviewSimulation: true,
          interviewCaseTabs: true
        }
      })

      if (!existingInterviewCase) {
        throw new Error('Interview case not found')
      }

      // Step 2: Update interview case if data provided
      let updatedInterviewCase = existingInterviewCase
      if (data.interviewCase) {
        if (data.interviewCase.displayOrder &&
            data.interviewCase.displayOrder !== existingInterviewCase.displayOrder) {
          const conflictingCase = await tx.interviewCase.findFirst({
            where: {
              interviewCourseId: existingInterviewCase.interviewCourseId,
              displayOrder: data.interviewCase.displayOrder,
              id: { not: data.interviewCaseId }
            }
          })

          if (conflictingCase) {
            throw new Error(`Display order ${data.interviewCase.displayOrder} is already taken`)
          }
        }

        updatedInterviewCase = await tx.interviewCase.update({
          where: { id: data.interviewCaseId },
          data: data.interviewCase,
          include: {
            interviewCourse: true,
            interviewSimulation: true,
            interviewCaseTabs: true
          }
        })
      }

      // Step 3: Update tabs if provided
      const tabsResponse: any = {}
      let tabsUpdated = 0

      if (data.tabs) {
        const tabTypes: InterviewCaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES']

        for (const tabType of tabTypes) {
          const existingTab = existingInterviewCase.interviewCaseTabs.find(t => t.tabType === tabType)

          if (data.tabs[tabType] !== undefined) {
            if (existingTab) {
              const updatedTab = await tx.interviewCaseTab.update({
                where: { id: existingTab.id },
                data: { content: data.tabs[tabType] }
              })
              tabsResponse[tabType] = {
                id: updatedTab.id,
                content: updatedTab.content,
                hasContent: updatedTab.content.length > 0
              }
              tabsUpdated++
            } else {
              const newTab = await tx.interviewCaseTab.create({
                data: {
                  interviewCaseId: data.interviewCaseId,
                  tabType,
                  content: data.tabs[tabType]!
                }
              })
              tabsResponse[tabType] = {
                id: newTab.id,
                content: newTab.content,
                hasContent: newTab.content.length > 0
              }
            }
          } else if (existingTab) {
            tabsResponse[tabType] = {
              id: existingTab.id,
              content: existingTab.content,
              hasContent: existingTab.content.length > 0
            }
          }
        }
      } else {
        for (const tab of existingInterviewCase.interviewCaseTabs) {
          tabsResponse[tab.tabType] = {
            id: tab.id,
            content: tab.content,
            hasContent: tab.content.length > 0
          }
        }
      }

      // Step 4: Handle marking criteria updates
      let markingCriteriaResponse: GroupedCriteria[] = []
      if (data.interviewMarkingCriteria) {
        const existingCriteria = await tx.interviewMarkingCriterion.findMany({
          where: { interviewCaseId: data.interviewCaseId }
        })
        const existingIds = existingCriteria.map(c => c.id)
        const incomingIds = data.interviewMarkingCriteria.map((c: any) => c.id).filter(Boolean) as string[]

        // Delete removed criteria
        const idsToDelete = existingIds.filter(id => !incomingIds.includes(id))
        if (idsToDelete.length > 0) {
          await tx.interviewMarkingCriterion.deleteMany({
            where: { id: { in: idsToDelete } }
          })
        }

        // Update/create criteria
        const updatedCriteria: InterviewMarkingCriterionWithDomain[] = []
        for (const item of data.interviewMarkingCriteria) {
          if (item.id && existingIds.includes(item.id)) {
            const updated = await tx.interviewMarkingCriterion.update({
              where: { id: item.id },
              data: {
                markingDomainId: item.markingDomainId,
                text: item.text,
                points: item.points,
                displayOrder: item.displayOrder
              },
              include: {
                markingDomain: true
              }
            }) as InterviewMarkingCriterionWithDomain
            updatedCriteria.push(updated)
          } else {
            const created = await tx.interviewMarkingCriterion.create({
              data: {
                interviewCaseId: data.interviewCaseId,
                markingDomainId: item.markingDomainId,
                text: item.text,
                points: item.points,
                displayOrder: item.displayOrder
              },
              include: {
                markingDomain: true
              }
            }) as InterviewMarkingCriterionWithDomain
            updatedCriteria.push(created)
          }
        }

        // Group by domain for response with proper typing
        markingCriteriaResponse = updatedCriteria.reduce((acc: GroupedCriteria[], criterion: InterviewMarkingCriterionWithDomain) => {
          const domainId = criterion.markingDomain.id
          const domainName = criterion.markingDomain.name

          let group = acc.find(g => g.domainId === domainId)
          if (!group) {
            group = { domainId, domainName, criteria: [] }
            acc.push(group)
          }

          group.criteria.push({
            id: criterion.id,
            text: criterion.text,
            points: criterion.points,
            displayOrder: criterion.displayOrder
          })

          return acc
        }, [])
      } else {
        // Fetch existing marking criteria
        const existingCriteria = await tx.interviewMarkingCriterion.findMany({
          where: { interviewCaseId: data.interviewCaseId },
          include: { markingDomain: true }
        }) as InterviewMarkingCriterionWithDomain[]

        markingCriteriaResponse = existingCriteria.reduce((acc: GroupedCriteria[], criterion: InterviewMarkingCriterionWithDomain) => {
          const domainId = criterion.markingDomain.id
          const domainName = criterion.markingDomain.name

          let group = acc.find(g => g.domainId === domainId)
          if (!group) {
            group = { domainId, domainName, criteria: [] }
            acc.push(group)
          }

          group.criteria.push({
            id: criterion.id,
            text: criterion.text,
            points: criterion.points,
            displayOrder: criterion.displayOrder
          })

          return acc
        }, [])
      }

      // Step 5: Handle specialties and curriculums
      const createdEntities = {
        specialties: [] as any[],
        curriculums: [] as any[]
      }

      if (data.new?.specialties && data.new.specialties.length > 0) {
        for (const specialty of data.new.specialties) {
          const existing = await tx.specialty.findFirst({
            where: {
              name: {
                equals: specialty.name,
                mode: 'insensitive'
              }
            }
          })

          if (existing) {
            createdEntities.specialties.push(existing)
          } else {
            const created = await tx.specialty.create({
              data: { name: specialty.name }
            })
            createdEntities.specialties.push(created)
          }
        }
      }

      if (data.new?.curriculums && data.new.curriculums.length > 0) {
        for (const curriculum of data.new.curriculums) {
          const existing = await tx.curriculum.findFirst({
            where: {
              name: {
                equals: curriculum.name,
                mode: 'insensitive'
              }
            }
          })

          if (existing) {
            createdEntities.curriculums.push(existing)
          } else {
            const created = await tx.curriculum.create({
              data: { name: curriculum.name }
            })
            createdEntities.curriculums.push(created)
          }
        }
      }

      if (data.existing?.specialtyIds !== undefined || createdEntities.specialties.length > 0) {
        await tx.interviewCaseSpecialty.deleteMany({
          where: { interviewCaseId: data.interviewCaseId }
        })

        const allSpecialtyIds = [
          ...(data.existing?.specialtyIds || []),
          ...createdEntities.specialties.map(s => s.id)
        ]

        if (allSpecialtyIds.length > 0) {
          await tx.interviewCaseSpecialty.createMany({
            data: allSpecialtyIds.map(specialtyId => ({
              interviewCaseId: data.interviewCaseId,
              specialtyId
            }))
          })
        }
      }

      if (data.existing?.curriculumIds !== undefined || createdEntities.curriculums.length > 0) {
        await tx.interviewCaseCurriculum.deleteMany({
          where: { interviewCaseId: data.interviewCaseId }
        })

        const allCurriculumIds = [
          ...(data.existing?.curriculumIds || []),
          ...createdEntities.curriculums.map(c => c.id)
        ]

        if (allCurriculumIds.length > 0) {
          await tx.interviewCaseCurriculum.createMany({
            data: allCurriculumIds.map(curriculumId => ({
              interviewCaseId: data.interviewCaseId,
              curriculumId
            }))
          })
        }
      }

      // Step 6: Update or create interviewSimulation - UPDATED
      let interviewSimulation = existingInterviewCase.interviewSimulation
      if (data.interviewSimulation) {
        if (data.interviewSimulation.warningTimeMinutes &&
            data.interviewSimulation.timeLimitMinutes &&
            data.interviewSimulation.warningTimeMinutes >= data.interviewSimulation.timeLimitMinutes) {
          throw new Error('Warning time must be less than time limit')
        }

        // Extract provider keys - prioritize direct keys, fall back to extracting from voiceAssistantConfig
        let sttProviderKey = data.interviewSimulation.sttProviderKey
        let llmProviderKey = data.interviewSimulation.llmProviderKey
        let ttsProviderKey = data.interviewSimulation.ttsProviderKey

        // If voiceAssistantConfig is provided (from frontend sending full config), extract provider keys
        // This is for backward compatibility
        if (data.interviewSimulation.voiceAssistantConfig && !sttProviderKey && !llmProviderKey && !ttsProviderKey) {
          // You could add logic here to map from full config to provider keys if needed
          // For now, we'll just use the direct provider keys
        }

        if (interviewSimulation) {
          interviewSimulation = await tx.interviewSimulation.update({
            where: { id: interviewSimulation.id },
            data: {
              ...data.interviewSimulation,
              // Ensure we use the extracted provider keys
              sttProviderKey: sttProviderKey,
              llmProviderKey: llmProviderKey,
              ttsProviderKey: ttsProviderKey
            }
          })
        } else {
          interviewSimulation = await tx.interviewSimulation.create({
            data: {
              interviewCaseId: data.interviewCaseId,
              casePrompt: data.interviewSimulation.casePrompt!,
              openingLine: data.interviewSimulation.openingLine!,
              timeLimitMinutes: data.interviewSimulation.timeLimitMinutes!,
              voiceModel: data.interviewSimulation.voiceModel!,
              warningTimeMinutes: data.interviewSimulation.warningTimeMinutes,
              creditCost: data.interviewSimulation.creditCost || 1,
              // Store provider keys
              sttProviderKey: sttProviderKey,
              llmProviderKey: llmProviderKey,
              ttsProviderKey: ttsProviderKey
            }
          })
        }
      }

      // Step 7: Fetch all current relations for response
      const currentSpecialties = await tx.interviewCaseSpecialty.findMany({
        where: { interviewCaseId: data.interviewCaseId },
        include: { specialty: true }
      })

      const currentCurriculums = await tx.interviewCaseCurriculum.findMany({
        where: { interviewCaseId: data.interviewCaseId },
        include: { curriculum: true }
      })

      const newSpecialtiesCount = createdEntities.specialties.filter(s =>
        data.new?.specialties?.some(ns => ns.name === s.name)
      ).length

      const newCurriculumsCount = createdEntities.curriculums.filter(c =>
        data.new?.curriculums?.some(nc => nc.name === c.name)
      ).length

      return {
        interviewCase: updatedInterviewCase,
        tabs: tabsResponse,
        markingCriteria: markingCriteriaResponse,
        created: {
          specialties: createdEntities.specialties.filter(s =>
            data.new?.specialties?.some(ns => ns.name === s.name)
          ),
          curriculums: createdEntities.curriculums.filter(c =>
            data.new?.curriculums?.some(nc => nc.name === c.name)
          )
        },
        assigned: {
          specialties: currentSpecialties.map(cs => cs.specialty),
          curriculums: currentCurriculums.map(cc => cc.curriculum)
        },
        interviewSimulation,
        summary: {
          totalSpecialties: currentSpecialties.length,
          totalCurriculums: currentCurriculums.length,
          newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount,
          simulationCreated: !existingInterviewCase.interviewSimulation && !!interviewSimulation,
          tabsCreated: 0,
          tabsUpdated,
          markingCriteriaCreated: data.interviewMarkingCriteria?.filter((c: any) => !c.id).length || 0
        }
      }
    })
  }
}
