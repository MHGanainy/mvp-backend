// course-case.service.ts
import { PrismaClient, PatientGender } from '@prisma/client'
import { CreateCourseCaseInput, UpdateCourseCaseInput, CreateCompleteCourseCaseInput, UpdateCompleteCourseCaseInput } from './course-case.schema'

// Define CaseTabType - should match your Prisma schema enum
type CaseTabType = 'DOCTORS_NOTE' | 'PATIENT_SCRIPT' | 'MARKING_CRITERIA' | 'MEDICAL_NOTES'

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

  // Helper function to get standard include object for course cases
  private getStandardInclude() {
    return {
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
  }

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
      include: this.getStandardInclude()
    })
  }

  async findAll() {
    return await this.prisma.courseCase.findMany({
      include: this.getStandardInclude(),
      orderBy: [
        { courseId: 'asc' },
        { displayOrder: 'asc' }
      ]
    })
  }

  async findById(id: string) {
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id },
      include: this.getStandardInclude()
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
      include: this.getStandardInclude(),
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
      include: this.getStandardInclude(),
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
      include: this.getStandardInclude(),
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
      include: this.getStandardInclude(),
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
      include: this.getStandardInclude()
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
      include: this.getStandardInclude()
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
      include: this.getStandardInclude()
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
      include: this.getStandardInclude(),
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
      course: caseItem.course,
      simulation: caseItem.simulation,
      caseTabs: caseItem.caseTabs
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
  // ===== COMPLETE COURSE CASE OPERATIONS =====

async createCompleteCourseCase(data: CreateCompleteCourseCaseInput) {
  // Use transaction to ensure atomicity
  return await this.prisma.$transaction(async (tx) => {
    // Step 1: Verify course exists and get course data
    const course = await tx.course.findUnique({
      where: { id: data.courseCase.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    // Check if course style allows adding cases
    if (course.style !== 'RANDOM') {
      throw new Error('Cases can only be added to RANDOM style courses')
    }

    // Auto-assign display order if not provided
    if (!data.courseCase.displayOrder) {
      const maxOrder = await tx.courseCase.aggregate({
        where: { courseId: data.courseCase.courseId },
        _max: { displayOrder: true }
      })
      data.courseCase.displayOrder = (maxOrder._max.displayOrder || 0) + 1
    } else {
      // Check if display order is already taken
      const existingCase = await tx.courseCase.findFirst({
        where: {
          courseId: data.courseCase.courseId,
          displayOrder: data.courseCase.displayOrder
        }
      })

      if (existingCase) {
        throw new Error(`Display order ${data.courseCase.displayOrder} is already taken for this course`)
      }
    }

    // Step 2: Create the course case
    const courseCase = await tx.courseCase.create({
      data: {
        courseId: data.courseCase.courseId,
        title: data.courseCase.title,
        diagnosis: data.courseCase.diagnosis,
        patientName: data.courseCase.patientName,
        patientAge: data.courseCase.patientAge,
        patientGender: data.courseCase.patientGender,
        description: data.courseCase.description,
        isFree: data.courseCase.isFree ?? false,
        displayOrder: data.courseCase.displayOrder
      }
    })

    // Step 3: Create all 4 tabs
    const tabTypes: CaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MARKING_CRITERIA', 'MEDICAL_NOTES']
    const createdTabs: any = {}
    
    for (const tabType of tabTypes) {
      const content = data.tabs?.[tabType] || ''
      const tab = await tx.caseTab.create({
        data: {
          courseCaseId: courseCase.id,
          tabType,
          content
        }
      })
      createdTabs[tabType] = {
        id: tab.id,
        content: tab.content,
        hasContent: tab.content.trim().length > 0
      }
    }

    // Step 4: Create new entities
    const createdEntities = {
      specialties: [] as any[],
      curriculums: [] as any[]
    }

    // Create new specialties
    if (data.new?.specialties && data.new.specialties.length > 0) {
      for (const specialty of data.new.specialties) {
        // Check if already exists (case-insensitive)
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

    // Create new curriculums
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

    // Step 5: Collect all IDs (existing + newly created)
    const allSpecialtyIds = [
      ...(data.existing?.specialtyIds || []),
      ...createdEntities.specialties.map(s => s.id)
    ]

    const allCurriculumIds = [
      ...(data.existing?.curriculumIds || []),
      ...createdEntities.curriculums.map(c => c.id)
    ]

    // Step 6: Verify existing entities exist
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

    // Step 7: Create all junction table entries
    if (allSpecialtyIds.length > 0) {
      await tx.caseSpecialty.createMany({
        data: allSpecialtyIds.map(specialtyId => ({
          courseCaseId: courseCase.id,
          specialtyId
        }))
      })
    }

    if (allCurriculumIds.length > 0) {
      await tx.caseCurriculum.createMany({
        data: allCurriculumIds.map(curriculumId => ({
          courseCaseId: courseCase.id,
          curriculumId
        }))
      })
    }

    // Step 8: Create simulation if provided
    let simulation = null
    if (data.simulation) {
      // Validate warning time
      if (data.simulation.warningTimeMinutes && 
          data.simulation.warningTimeMinutes >= data.simulation.timeLimitMinutes) {
        throw new Error('Warning time must be less than time limit')
      }

      simulation = await tx.simulation.create({
        data: {
          courseCaseId: courseCase.id,
          casePrompt: data.simulation.casePrompt,
          openingLine: data.simulation.openingLine,
          timeLimitMinutes: data.simulation.timeLimitMinutes,
          voiceModel: data.simulation.voiceModel,
          warningTimeMinutes: data.simulation.warningTimeMinutes,
          creditCost: data.simulation.creditCost
        }
      })
    }

    // Step 9: Fetch all assigned entities for response
    const assignedSpecialties = await tx.specialty.findMany({
      where: { id: { in: allSpecialtyIds } }
    })

    const assignedCurriculums = await tx.curriculum.findMany({
      where: { id: { in: allCurriculumIds } }
    })

    // Count truly new entities created
    const newSpecialtiesCount = createdEntities.specialties.filter(s => 
      !data.existing?.specialtyIds?.includes(s.id) &&
      data.new?.specialties?.some(ns => ns.name === s.name)
    ).length

    const newCurriculumsCount = createdEntities.curriculums.filter(c => 
      !data.existing?.curriculumIds?.includes(c.id) &&
      data.new?.curriculums?.some(nc => nc.name === c.name)
    ).length

    // Return comprehensive response
    return {
      courseCase,
      tabs: createdTabs,
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
      simulation,
      summary: {
        totalSpecialties: assignedSpecialties.length,
        totalCurriculums: assignedCurriculums.length,
        newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount,
        simulationCreated: !!simulation,
        tabsCreated: 4,
        tabsUpdated: 0
      }
    }
  })
}

async updateCompleteCourseCase(data: UpdateCompleteCourseCaseInput) {
  // Use transaction to ensure atomicity
  return await this.prisma.$transaction(async (tx) => {
    // Step 1: Verify course case exists
    const existingCourseCase = await tx.courseCase.findUnique({
      where: { id: data.courseCaseId },
      include: {
        course: true,
        simulation: true,
        caseTabs: true
      }
    })

    if (!existingCourseCase) {
      throw new Error('Course case not found')
    }

    // Step 2: Update course case if data provided
    let updatedCourseCase = existingCourseCase
    if (data.courseCase) {
      // Check display order if updating
      if (data.courseCase.displayOrder && 
          data.courseCase.displayOrder !== existingCourseCase.displayOrder) {
        const conflictingCase = await tx.courseCase.findFirst({
          where: {
            courseId: existingCourseCase.courseId,
            displayOrder: data.courseCase.displayOrder,
            id: { not: data.courseCaseId }
          }
        })

        if (conflictingCase) {
          throw new Error(`Display order ${data.courseCase.displayOrder} is already taken`)
        }
      }

      updatedCourseCase = await tx.courseCase.update({
        where: { id: data.courseCaseId },
        data: data.courseCase,
        include: {
          course: true,
          simulation: true,
          caseTabs: true
        }
      })
    }

    // Step 3: Update tabs if provided
    const tabsResponse: any = {}
    let tabsUpdated = 0
    
    if (data.tabs) {
      const tabTypes: CaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MARKING_CRITERIA', 'MEDICAL_NOTES']
      
      for (const tabType of tabTypes) {
        const existingTab = existingCourseCase.caseTabs.find(t => t.tabType === tabType)
        
        if (data.tabs[tabType] !== undefined) {
          if (existingTab) {
            // Update existing tab
            const updatedTab = await tx.caseTab.update({
              where: { id: existingTab.id },
              data: { content: data.tabs[tabType] || '' }
            })
            tabsResponse[tabType] = {
              id: updatedTab.id,
              content: updatedTab.content,
              hasContent: updatedTab.content.trim().length > 0
            }
            tabsUpdated++
          } else {
            // Create new tab if doesn't exist
            const newTab = await tx.caseTab.create({
              data: {
                courseCaseId: data.courseCaseId,
                tabType,
                content: data.tabs[tabType] || ''
              }
            })
            tabsResponse[tabType] = {
              id: newTab.id,
              content: newTab.content,
              hasContent: newTab.content.trim().length > 0
            }
          }
        } else if (existingTab) {
          // Include existing tab in response
          tabsResponse[tabType] = {
            id: existingTab.id,
            content: existingTab.content,
            hasContent: existingTab.content.trim().length > 0
          }
        }
      }
    } else {
      // Include all existing tabs in response
      for (const tab of existingCourseCase.caseTabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.trim().length > 0
        }
      }
    }

    // Step 4: Handle specialties and curriculums
    const createdEntities = {
      specialties: [] as any[],
      curriculums: [] as any[]
    }

    // Create new specialties
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

    // Create new curriculums
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

    // Update specialties if provided
    if (data.existing?.specialtyIds !== undefined || createdEntities.specialties.length > 0) {
      // Remove existing assignments
      await tx.caseSpecialty.deleteMany({
        where: { courseCaseId: data.courseCaseId }
      })

      // Create new assignments
      const allSpecialtyIds = [
        ...(data.existing?.specialtyIds || []),
        ...createdEntities.specialties.map(s => s.id)
      ]

      if (allSpecialtyIds.length > 0) {
        await tx.caseSpecialty.createMany({
          data: allSpecialtyIds.map(specialtyId => ({
            courseCaseId: data.courseCaseId,
            specialtyId
          }))
        })
      }
    }

    // Update curriculums if provided
    if (data.existing?.curriculumIds !== undefined || createdEntities.curriculums.length > 0) {
      // Remove existing assignments
      await tx.caseCurriculum.deleteMany({
        where: { courseCaseId: data.courseCaseId }
      })

      // Create new assignments
      const allCurriculumIds = [
        ...(data.existing?.curriculumIds || []),
        ...createdEntities.curriculums.map(c => c.id)
      ]

      if (allCurriculumIds.length > 0) {
        await tx.caseCurriculum.createMany({
          data: allCurriculumIds.map(curriculumId => ({
            courseCaseId: data.courseCaseId,
            curriculumId
          }))
        })
      }
    }

    // Step 5: Update or create simulation
    let simulation = existingCourseCase.simulation
    if (data.simulation) {
      // Validate warning time
      if (data.simulation.warningTimeMinutes && 
          data.simulation.timeLimitMinutes &&
          data.simulation.warningTimeMinutes >= data.simulation.timeLimitMinutes) {
        throw new Error('Warning time must be less than time limit')
      }

      if (simulation) {
        // Update existing simulation
        simulation = await tx.simulation.update({
          where: { id: simulation.id },
          data: data.simulation
        })
      } else {
        // Create new simulation
        simulation = await tx.simulation.create({
          data: {
            courseCaseId: data.courseCaseId,
            casePrompt: data.simulation.casePrompt!,
            openingLine: data.simulation.openingLine!,
            timeLimitMinutes: data.simulation.timeLimitMinutes!,
            voiceModel: data.simulation.voiceModel!,
            warningTimeMinutes: data.simulation.warningTimeMinutes,
            creditCost: data.simulation.creditCost || 1
          }
        })
      }
    }

    // Step 6: Fetch all current relations for response
    const currentSpecialties = await tx.caseSpecialty.findMany({
      where: { courseCaseId: data.courseCaseId },
      include: { specialty: true }
    })

    const currentCurriculums = await tx.caseCurriculum.findMany({
      where: { courseCaseId: data.courseCaseId },
      include: { curriculum: true }
    })

    // Count new entities created
    const newSpecialtiesCount = createdEntities.specialties.filter(s => 
      data.new?.specialties?.some(ns => ns.name === s.name)
    ).length

    const newCurriculumsCount = createdEntities.curriculums.filter(c => 
      data.new?.curriculums?.some(nc => nc.name === c.name)
    ).length

    // Return comprehensive response
    return {
      courseCase: updatedCourseCase,
      tabs: tabsResponse,
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
      simulation,
      summary: {
        totalSpecialties: currentSpecialties.length,
        totalCurriculums: currentCurriculums.length,
        newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount,
        simulationCreated: !existingCourseCase.simulation && !!simulation,
        tabsCreated: 0,
        tabsUpdated
      }
    }
  })
}
  
}