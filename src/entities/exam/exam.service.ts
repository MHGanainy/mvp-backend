// exam.service.ts
import { PrismaClient } from '@prisma/client'
import { CreateExamInput, UpdateExamInput, CreateCompleteExamInput, UpdateCompleteExamInput, ExamMarkingDomainsDetailedResponse } from './exam.schema'
import { autoGrantOnCreate } from '../../shared/permissions'

export class ExamService {
  constructor(private prisma: PrismaClient) {}

  // ===== HELPER METHODS FOR FULL RELATIONS =====

  // Get the full include object for queries with all relations
  private getFullInclude() {
    return {
      instructor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          bio: true
        }
      },
      examSpecialties: {
        include: {
          specialty: true
        },
        orderBy: {
          specialty: {
            name: 'asc' as const
          }
        }
      },
      examCurriculums: {
        include: {
          curriculum: true
        },
        orderBy: {
          curriculum: {
            name: 'asc' as const
          }
        }
      },
      examMarkingDomains: {
        include: {
          markingDomain: true
        },
        orderBy: {
          markingDomain: {
            name: 'asc' as const
          }
        }
      },
      _count: {
        select: {
          courses: true,
          examSpecialties: true,
          examCurriculums: true,
          examMarkingDomains: true
        }
      }
    }
  }

  // Transform the exam response to include flattened relations
  private transformExamWithRelations(exam: any) {
    return {
      ...exam,
      specialties: exam.examSpecialties?.map((es: any) => es.specialty) || [],
      curriculums: exam.examCurriculums?.map((ec: any) => ec.curriculum) || [],
      markingDomains: exam.examMarkingDomains?.map((emd: any) => emd.markingDomain) || [],
      examSpecialties: undefined,
      examCurriculums: undefined,
      examMarkingDomains: undefined
    }
  }

  // ===== BASIC EXAM CRUD OPERATIONS =====

  async create(data: CreateExamInput) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    const existingExam = await this.prisma.exam.findUnique({
      where: { slug: data.slug }
    })

    if (existingExam) {
      throw new Error('Exam with this slug already exists')
    }

    const exam = await this.prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          instructorId: data.instructorId,
          title: data.title,
          slug: data.slug,
          description: data.description,
          isActive: data.isActive ?? true
        },
        include: this.getFullInclude()
      })

      await autoGrantOnCreate(tx, {
        instructorId: data.instructorId,
        role: 'case_editor',
        resourceType: 'exam',
        resourceId: created.id
      })

      return created
    })

    return this.transformExamWithRelations(exam)
  }

  async findAll() {
    const exams = await this.prisma.exam.findMany({
      include: this.getFullInclude(),
      orderBy: {
        createdAt: 'desc'
      }
    })

    return exams.map(exam => this.transformExamWithRelations(exam))
  }

  async findActive() {
    const exams = await this.prisma.exam.findMany({
      where: { isActive: true },
      include: this.getFullInclude(),
      orderBy: {
        title: 'asc'
      }
    })

    return exams.map(exam => this.transformExamWithRelations(exam))
  }

  async findById(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: this.getFullInclude()
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return this.transformExamWithRelations(exam)
  }

  async findBySlug(slug: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { slug },
      include: this.getFullInclude()
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return this.transformExamWithRelations(exam)
  }

  async findByInstructor(instructorId: string) {
    // Verify instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    const exams = await this.prisma.exam.findMany({
      where: { instructorId },
      include: this.getFullInclude(),
      orderBy: {
        createdAt: 'desc'
      }
    })

    return exams.map(exam => this.transformExamWithRelations(exam))
  }

  async update(id: string, data: UpdateExamInput) {
    // Check if exam exists
    const existingExam = await this.prisma.exam.findUnique({
      where: { id }
    })

    if (!existingExam) {
      throw new Error('Exam not found')
    }

    // If updating slug, check it's unique
    if (data.slug) {
      const examWithSlug = await this.prisma.exam.findUnique({
        where: { slug: data.slug }
      })

      if (examWithSlug && examWithSlug.id !== id) {
        throw new Error('Exam with this slug already exists')
      }
    }

    const exam = await this.prisma.exam.update({
      where: { id },
      data,
      include: this.getFullInclude()
    })

    return this.transformExamWithRelations(exam)
  }

  async delete(id: string) {
    // Check if exam exists
    await this.findById(id)

    return await this.prisma.exam.delete({
      where: { id }
    })
  }

  async toggleActive(id: string) {
    const currentExam = await this.prisma.exam.findUnique({
      where: { id }
    })

    if (!currentExam) {
      throw new Error('Exam not found')
    }
    
    const exam = await this.prisma.exam.update({
      where: { id },
      data: { isActive: !currentExam.isActive },
      include: this.getFullInclude()
    })

    return this.transformExamWithRelations(exam)
  }

  // ===== JUNCTION TABLE OPERATIONS =====

  // Assign specialties to an exam (User Story #36)
  async assignSpecialties(examId: string, specialtyIds: string[]) {
    // Verify exam exists
    await this.findById(examId)

    // Verify all specialties exist
    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: specialtyIds } }
    })

    if (specialties.length !== specialtyIds.length) {
      throw new Error('One or more specialties not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.examSpecialty.deleteMany({
      where: { examId }
    })

    // Create new assignments
    const assignments = await this.prisma.examSpecialty.createMany({
      data: specialtyIds.map(specialtyId => ({
        examId,
        specialtyId
      }))
    })

    return assignments
  }

  // Assign curriculum items to an exam (User Story #37)
  async assignCurriculums(examId: string, curriculumIds: string[]) {
    // Verify exam exists
    await this.findById(examId)

    // Verify all curriculum items exist
    const curriculums = await this.prisma.curriculum.findMany({
      where: { id: { in: curriculumIds } }
    })

    if (curriculums.length !== curriculumIds.length) {
      throw new Error('One or more curriculum items not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.examCurriculum.deleteMany({
      where: { examId }
    })

    // Create new assignments
    const assignments = await this.prisma.examCurriculum.createMany({
      data: curriculumIds.map(curriculumId => ({
        examId,
        curriculumId
      }))
    })

    return assignments
  }

  // Assign marking domains to an exam (User Story #38)
  async assignMarkingDomains(examId: string, markingDomainIds: string[]) {
    // Verify exam exists
    await this.findById(examId)

    // Verify all marking domains exist
    const markingDomains = await this.prisma.markingDomain.findMany({
      where: { id: { in: markingDomainIds } }
    })

    if (markingDomains.length !== markingDomainIds.length) {
      throw new Error('One or more marking domains not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.examMarkingDomain.deleteMany({
      where: { examId }
    })

    // Create new assignments
    const assignments = await this.prisma.examMarkingDomain.createMany({
      data: markingDomainIds.map(markingDomainId => ({
        examId,
        markingDomainId
      }))
    })

    return assignments
  }

  // ===== RETRIEVAL OPERATIONS =====

  // Get specialties assigned to an exam
  async getExamSpecialties(examId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const examSpecialties = await this.prisma.examSpecialty.findMany({
      where: { examId },
      include: {
        specialty: true
      },
      orderBy: {
        specialty: {
          name: 'asc'
        }
      }
    })

    return examSpecialties.map(es => es.specialty)
  }

  // Get curriculum items assigned to an exam
  async getExamCurriculums(examId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const examCurriculums = await this.prisma.examCurriculum.findMany({
      where: { examId },
      include: {
        curriculum: true
      },
      orderBy: {
        curriculum: {
          name: 'asc'
        }
      }
    })

    return examCurriculums.map(ec => ec.curriculum)
  }

  // Get marking domains assigned to an exam
  async getExamMarkingDomains(examId: string): Promise<ExamMarkingDomainsDetailedResponse> {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const examMarkingDomains = await this.prisma.examMarkingDomain.findMany({
      where: { examId },
      include: {
        markingDomain: {
          include: {
            markingCriteria: {
              include: {
                courseCase: {
                  select: {
                    id: true,
                    title: true,
                    diagnosis: true,
                    patientName: true,
                    patientAge: true,
                    patientGender: true,
                    displayOrder: true,
                    course: {
                      select: {
                        id: true,
                        title: true,
                        examId: true,
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
              // Only include marking criteria from courses that belong to this exam
              where: {
                courseCase: {
                  course: {
                    examId: examId
                  }
                }
              },
              orderBy: [
                {
                  courseCase: {
                    course: {
                      title: 'asc' as const
                    }
                  }
                },
                {
                  courseCase: {
                    displayOrder: 'asc' as const
                  }
                },
                {
                  displayOrder: 'asc' as const
                }
              ]
            },
            _count: {
              select: {
                markingCriteria: true
              }
            }
          }
        }
      },
      orderBy: {
        markingDomain: {
          name: 'asc' as const
        }
      }
    })

    // Transform the response to include statistics and organized data
    return examMarkingDomains.map(emd => {
      // Group marking criteria by course and case for better organization
      const criteriaByCourseCaseMap = new Map<string, any[]>()
      
      emd.markingDomain.markingCriteria.forEach(criterion => {
        const key = `${criterion.courseCase.course.id}:${criterion.courseCase.id}`
        if (!criteriaByCourseCaseMap.has(key)) {
          criteriaByCourseCaseMap.set(key, [])
        }
        criteriaByCourseCaseMap.get(key)!.push(criterion)
      })

      // Convert map to structured array
      const criteriaByCase = Array.from(criteriaByCourseCaseMap.entries()).map(([key, criteria]) => {
        const [courseId, caseId] = key.split(':')
        const firstCriterion = criteria[0]
        return {
          courseId,
          courseTitle: firstCriterion.courseCase.course.title,
          caseId,
          caseTitle: firstCriterion.courseCase.title,
          caseDisplayOrder: firstCriterion.courseCase.displayOrder,
          criteria: criteria.map(c => ({
            id: c.id,
            text: c.text,
            points: c.points,
            displayOrder: c.displayOrder,
            createdAt: c.createdAt
          })),
          totalPoints: criteria.reduce((sum, c) => sum + c.points, 0),
          criteriaCount: criteria.length
        }
      })

      // Calculate domain statistics
      const totalPoints = emd.markingDomain.markingCriteria.reduce((sum, c) => sum + c.points, 0)
      const totalCriteria = emd.markingDomain.markingCriteria.length
      const uniqueCases = new Set(emd.markingDomain.markingCriteria.map(c => c.courseCaseId)).size
      const uniqueCourses = new Set(emd.markingDomain.markingCriteria.map(c => c.courseCase.course.id)).size

      return {
        id: emd.markingDomain.id,
        name: emd.markingDomain.name,
        createdAt: emd.markingDomain.createdAt,
        associatedAt: emd.createdAt, // When it was linked to this exam
        
        // Statistics for this domain within this exam
        statistics: {
          totalCriteria,
          totalPoints,
          uniqueCases,
          uniqueCourses,
          averagePointsPerCriterion: totalCriteria > 0 ? (totalPoints / totalCriteria).toFixed(2) : '0'
        },
        
        // All marking criteria (flat list)
        markingCriteria: emd.markingDomain.markingCriteria,
        
        // Organized by course and case for UI display
        criteriaByCase,
        
        // Count including criteria from other exams (total in the domain)
        _count: emd.markingDomain._count
      }
    })
  }

  // ===== REMOVAL OPERATIONS =====

  // Remove specialty from exam
  async removeSpecialty(examId: string, specialtyId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const deleted = await this.prisma.examSpecialty.deleteMany({
      where: { examId, specialtyId }
    })

    if (deleted.count === 0) {
      throw new Error('Specialty assignment not found')
    }

    return { message: 'Specialty removed successfully' }
  }

  // Remove curriculum from exam
  async removeCurriculum(examId: string, curriculumId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const deleted = await this.prisma.examCurriculum.deleteMany({
      where: { examId, curriculumId }
    })

    if (deleted.count === 0) {
      throw new Error('Curriculum assignment not found')
    }

    return { message: 'Curriculum removed successfully' }
  }

  // Remove marking domain from exam
  async removeMarkingDomain(examId: string, markingDomainId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const deleted = await this.prisma.examMarkingDomain.deleteMany({
      where: { examId, markingDomainId }
    })

    if (deleted.count === 0) {
      throw new Error('Marking domain assignment not found')
    }

    return { message: 'Marking domain removed successfully' }
  }

  // ===== CONFIGURATION & STATISTICS =====

  // Get exam configuration summary
  async getExamConfiguration(examId: string) {
    const exam = await this.findById(examId)
    
    const specialties = await this.getExamSpecialties(examId)
    const curriculums = await this.getExamCurriculums(examId)
    const markingDomains = await this.getExamMarkingDomains(examId)

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        slug: exam.slug,
        description: exam.description,
        isActive: exam.isActive
      },
      configuration: {
        specialties: specialties,
        curriculums: curriculums,
        markingDomains: markingDomains
      },
      summary: {
        specialtiesCount: specialties.length,
        curriculumsCount: curriculums.length,
        markingDomainsCount: markingDomains.length,
        isFullyConfigured: specialties.length > 0 && curriculums.length > 0 && markingDomains.length > 0
      }
    }
  }

  // Bulk configure exam (assign all at once)
  async bulkConfigureExam(examId: string, configuration: {
    specialtyIds?: string[]
    curriculumIds?: string[]
    markingDomainIds?: string[]
  }) {
    // Verify exam exists
    await this.findById(examId)

    const operations = []

    if (configuration.specialtyIds && configuration.specialtyIds.length > 0) {
      operations.push(
        this.assignSpecialties(examId, configuration.specialtyIds)
      )
    }

    if (configuration.curriculumIds && configuration.curriculumIds.length > 0) {
      operations.push(
        this.assignCurriculums(examId, configuration.curriculumIds)
      )
    }

    if (configuration.markingDomainIds && configuration.markingDomainIds.length > 0) {
      operations.push(
        this.assignMarkingDomains(examId, configuration.markingDomainIds)
      )
    }

    if (operations.length > 0) {
      await Promise.all(operations)
    }

    return {
      message: 'Exam configuration completed successfully',
      examId,
      configured: {
        specialties: configuration.specialtyIds?.length || 0,
        curriculums: configuration.curriculumIds?.length || 0,
        markingDomains: configuration.markingDomainIds?.length || 0
      }
    }
  }

  // Get exam statistics (how many courses/cases use this exam configuration)
  async getExamUsageStats(examId: string) {
    const exam = await this.findById(examId)

    // Get usage counts
    const coursesCount = await this.prisma.course.count({
      where: { examId }
    })

    const casesCount = await this.prisma.courseCase.count({
      where: { course: { examId } }
    })

    const simulationsCount = await this.prisma.simulation.count({
      where: { courseCase: { course: { examId } } }
    })

    // Get configuration counts by querying junction tables directly
    const specialtiesCount = await this.prisma.examSpecialty.count({
      where: { examId }
    })

    const curriculumsCount = await this.prisma.examCurriculum.count({
      where: { examId }
    })

    const markingDomainsCount = await this.prisma.examMarkingDomain.count({
      where: { examId }
    })

    return {
      examId,
      examTitle: exam.title,
      usage: {
        coursesCount,
        casesCount,
        simulationsCount
      },
      configuration: {
        specialtiesCount,
        curriculumsCount,
        markingDomainsCount
      }
    }
  }

  // ===== ADDITIONAL UTILITY METHODS =====

  // Check if exam is fully configured
  async isExamFullyConfigured(examId: string): Promise<boolean> {
    const specialtiesCount = await this.prisma.examSpecialty.count({
      where: { examId }
    })

    const curriculumsCount = await this.prisma.examCurriculum.count({
      where: { examId }
    })

    const markingDomainsCount = await this.prisma.examMarkingDomain.count({
      where: { examId }
    })

    return specialtiesCount > 0 && curriculumsCount > 0 && markingDomainsCount > 0
  }

  // Get exam with all configuration details (including junction data)
  async getExamWithConfiguration(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: this.getFullInclude()
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return this.transformExamWithRelations(exam)
  }

  // Clear all exam configurations
  async clearExamConfiguration(examId: string) {
    // Verify exam exists
    await this.findById(examId)

    await Promise.all([
      this.prisma.examSpecialty.deleteMany({ where: { examId } }),
      this.prisma.examCurriculum.deleteMany({ where: { examId } }),
      this.prisma.examMarkingDomain.deleteMany({ where: { examId } })
    ])

    return { message: 'Exam configuration cleared successfully' }
  }

  // ===== COMPLETE EXAM CREATION =====

  async createCompleteExam(data: CreateCompleteExamInput) {
    // Use transaction to ensure atomicity
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify instructor exists
      const instructor = await tx.instructor.findUnique({
        where: { id: data.exam.instructorId }
      })

      if (!instructor) {
        throw new Error('Instructor not found')
      }

      // Generate slug if not provided
      const slug = data.exam.slug || this.generateSlug(data.exam.title)

      // Check if slug already exists
      const existingExam = await tx.exam.findUnique({
        where: { slug }
      })

      if (existingExam) {
        throw new Error('Exam with this slug already exists')
      }

      // Step 2: Create the exam
      const exam = await tx.exam.create({
        data: {
          instructorId: data.exam.instructorId,
          title: data.exam.title,
          slug: slug,
          description: data.exam.description,
          isActive: data.exam.isActive ?? true
        }
      })

      await autoGrantOnCreate(tx, {
        instructorId: data.exam.instructorId,
        role: 'case_editor',
        resourceType: 'exam',
        resourceId: exam.id
      })

      // Step 3: Create new entities
      const createdEntities = {
        specialties: [] as any[],
        curriculums: [] as any[],
        markingDomains: [] as any[]
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

      // Create new marking domains
      if (data.new?.markingDomains && data.new.markingDomains.length > 0) {
        for (const markingDomain of data.new.markingDomains) {
          const existing = await tx.markingDomain.findFirst({
            where: { 
              name: {
                equals: markingDomain.name,
                mode: 'insensitive'
              }
            }
          })
          
          if (existing) {
            createdEntities.markingDomains.push(existing)
          } else {
            const created = await tx.markingDomain.create({
              data: { name: markingDomain.name }
            })
            createdEntities.markingDomains.push(created)
          }
        }
      }

      // Step 4: Collect all IDs (existing + newly created)
      const allSpecialtyIds = [
        ...(data.existing?.specialtyIds || []),
        ...createdEntities.specialties.map(s => s.id)
      ]

      const allCurriculumIds = [
        ...(data.existing?.curriculumIds || []),
        ...createdEntities.curriculums.map(c => c.id)
      ]

      const allMarkingDomainIds = [
        ...(data.existing?.markingDomainIds || []),
        ...createdEntities.markingDomains.map(md => md.id)
      ]

      // Step 5: Verify existing entities exist
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

      if (data.existing?.markingDomainIds && data.existing.markingDomainIds.length > 0) {
        const count = await tx.markingDomain.count({
          where: { id: { in: data.existing.markingDomainIds } }
        })
        if (count !== data.existing.markingDomainIds.length) {
          throw new Error('One or more marking domains not found')
        }
      }

      // Step 6: Create all junction table entries
      if (allSpecialtyIds.length > 0) {
        await tx.examSpecialty.createMany({
          data: allSpecialtyIds.map(specialtyId => ({
            examId: exam.id,
            specialtyId
          }))
        })
      }

      if (allCurriculumIds.length > 0) {
        await tx.examCurriculum.createMany({
          data: allCurriculumIds.map(curriculumId => ({
            examId: exam.id,
            curriculumId
          }))
        })
      }

      if (allMarkingDomainIds.length > 0) {
        await tx.examMarkingDomain.createMany({
          data: allMarkingDomainIds.map(markingDomainId => ({
            examId: exam.id,
            markingDomainId
          }))
        })
      }

      // Step 7: Fetch all assigned entities for response
      const assignedSpecialties = await tx.specialty.findMany({
        where: { id: { in: allSpecialtyIds } }
      })

      const assignedCurriculums = await tx.curriculum.findMany({
        where: { id: { in: allCurriculumIds } }
      })

      const assignedMarkingDomains = await tx.markingDomain.findMany({
        where: { id: { in: allMarkingDomainIds } }
      })

      // Count truly new entities created (not including existing ones that were found)
      const newSpecialtiesCount = createdEntities.specialties.filter(s => 
        !data.existing?.specialtyIds?.includes(s.id) &&
        data.new?.specialties?.some(ns => ns.name === s.name)
      ).length

      const newCurriculumsCount = createdEntities.curriculums.filter(c => 
        !data.existing?.curriculumIds?.includes(c.id) &&
        data.new?.curriculums?.some(nc => nc.name === c.name)
      ).length

      const newMarkingDomainsCount = createdEntities.markingDomains.filter(md => 
        !data.existing?.markingDomainIds?.includes(md.id) &&
        data.new?.markingDomains?.some(nmd => nmd.name === md.name)
      ).length

      // Return comprehensive response
      return {
        exam,
        created: {
          specialties: createdEntities.specialties.filter(s => 
            data.new?.specialties?.some(ns => ns.name === s.name)
          ),
          curriculums: createdEntities.curriculums.filter(c => 
            data.new?.curriculums?.some(nc => nc.name === c.name)
          ),
          markingDomains: createdEntities.markingDomains.filter(md => 
            data.new?.markingDomains?.some(nmd => nmd.name === md.name)
          )
        },
        assigned: {
          specialties: assignedSpecialties,
          curriculums: assignedCurriculums,
          markingDomains: assignedMarkingDomains
        },
        summary: {
          totalSpecialties: assignedSpecialties.length,
          totalCurriculums: assignedCurriculums.length,
          totalMarkingDomains: assignedMarkingDomains.length,
          newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount + newMarkingDomainsCount
        }
      }
    })
  }

  // ===== COMPLETE EXAM UPDATE =====

  async updateCompleteExam(examId: string, data: Omit<UpdateCompleteExamInput, 'examId'>) {
    // Use transaction to ensure atomicity
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify exam exists
      const existingExam = await tx.exam.findUnique({
        where: { id: examId }
      })

      if (!existingExam) {
        throw new Error('Exam not found')
      }

      // Step 2: Update exam basic info if provided
      let updatedExam = existingExam
      if (data.exam && Object.keys(data.exam).length > 0) {
        // If updating slug, check it's unique
        if (data.exam.slug) {
          const examWithSlug = await tx.exam.findUnique({
            where: { slug: data.exam.slug }
          })

          if (examWithSlug && examWithSlug.id !== examId) {
            throw new Error('Exam with this slug already exists')
          }
        }

        updatedExam = await tx.exam.update({
          where: { id: examId },
          data: data.exam
        })
      }

      // Step 3: Create new entities
      const createdEntities = {
        specialties: [] as any[],
        curriculums: [] as any[],
        markingDomains: [] as any[]
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

      // Create new marking domains
      if (data.new?.markingDomains && data.new.markingDomains.length > 0) {
        for (const markingDomain of data.new.markingDomains) {
          const existing = await tx.markingDomain.findFirst({
            where: { 
              name: {
                equals: markingDomain.name,
                mode: 'insensitive'
              }
            }
          })
          
          if (existing) {
            createdEntities.markingDomains.push(existing)
          } else {
            const created = await tx.markingDomain.create({
              data: { name: markingDomain.name }
            })
            createdEntities.markingDomains.push(created)
          }
        }
      }

      // Step 4: Collect all IDs (existing + newly created)
      const allSpecialtyIds = [
        ...(data.existing?.specialtyIds || []),
        ...createdEntities.specialties.map(s => s.id)
      ]

      const allCurriculumIds = [
        ...(data.existing?.curriculumIds || []),
        ...createdEntities.curriculums.map(c => c.id)
      ]

      const allMarkingDomainIds = [
        ...(data.existing?.markingDomainIds || []),
        ...createdEntities.markingDomains.map(md => md.id)
      ]

      // Step 5: Verify existing entities exist
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

      if (data.existing?.markingDomainIds && data.existing.markingDomainIds.length > 0) {
        const count = await tx.markingDomain.count({
          where: { id: { in: data.existing.markingDomainIds } }
        })
        if (count !== data.existing.markingDomainIds.length) {
          throw new Error('One or more marking domains not found')
        }
      }

      // Step 6: Clear existing assignments and create new ones
      // Only update if new assignments are provided
      if (data.existing || data.new) {
        // Clear and reassign specialties
        if (allSpecialtyIds.length > 0 || (data.existing && 'specialtyIds' in data.existing)) {
          await tx.examSpecialty.deleteMany({ where: { examId } })
          if (allSpecialtyIds.length > 0) {
            await tx.examSpecialty.createMany({
              data: allSpecialtyIds.map(specialtyId => ({
                examId,
                specialtyId
              }))
            })
          }
        }

        // Clear and reassign curriculums
        if (allCurriculumIds.length > 0 || (data.existing && 'curriculumIds' in data.existing)) {
          await tx.examCurriculum.deleteMany({ where: { examId } })
          if (allCurriculumIds.length > 0) {
            await tx.examCurriculum.createMany({
              data: allCurriculumIds.map(curriculumId => ({
                examId,
                curriculumId
              }))
            })
          }
        }

        // Clear and reassign marking domains
        if (allMarkingDomainIds.length > 0 || (data.existing && 'markingDomainIds' in data.existing)) {
          await tx.examMarkingDomain.deleteMany({ where: { examId } })
          if (allMarkingDomainIds.length > 0) {
            await tx.examMarkingDomain.createMany({
              data: allMarkingDomainIds.map(markingDomainId => ({
                examId,
                markingDomainId
              }))
            })
          }
        }
      }

      // Step 7: Fetch all assigned entities for response
      const assignedSpecialties = await tx.specialty.findMany({
        where: { id: { in: allSpecialtyIds } }
      })

      const assignedCurriculums = await tx.curriculum.findMany({
        where: { id: { in: allCurriculumIds } }
      })

      const assignedMarkingDomains = await tx.markingDomain.findMany({
        where: { id: { in: allMarkingDomainIds } }
      })

      // Count truly new entities created (not including existing ones that were found)
      const newSpecialtiesCount = createdEntities.specialties.filter(s => 
        !data.existing?.specialtyIds?.includes(s.id) &&
        data.new?.specialties?.some(ns => ns.name === s.name)
      ).length

      const newCurriculumsCount = createdEntities.curriculums.filter(c => 
        !data.existing?.curriculumIds?.includes(c.id) &&
        data.new?.curriculums?.some(nc => nc.name === c.name)
      ).length

      const newMarkingDomainsCount = createdEntities.markingDomains.filter(md => 
        !data.existing?.markingDomainIds?.includes(md.id) &&
        data.new?.markingDomains?.some(nmd => nmd.name === md.name)
      ).length

      // Return comprehensive response
      return {
        exam: updatedExam,
        created: {
          specialties: createdEntities.specialties.filter(s => 
            data.new?.specialties?.some(ns => ns.name === s.name)
          ),
          curriculums: createdEntities.curriculums.filter(c => 
            data.new?.curriculums?.some(nc => nc.name === c.name)
          ),
          markingDomains: createdEntities.markingDomains.filter(md => 
            data.new?.markingDomains?.some(nmd => nmd.name === md.name)
          )
        },
        assigned: {
          specialties: assignedSpecialties,
          curriculums: assignedCurriculums,
          markingDomains: assignedMarkingDomains
        },
        summary: {
          totalSpecialties: assignedSpecialties.length,
          totalCurriculums: assignedCurriculums.length,
          totalMarkingDomains: assignedMarkingDomains.length,
          newEntitiesCreated: newSpecialtiesCount + newCurriculumsCount + newMarkingDomainsCount,
          examUpdated: data.exam && Object.keys(data.exam).length > 0
        }
      }
    })
  }

  

  // ===== DUPLICATE EXAM =====

  async duplicateExam(
    sourceExamId: string,
    data: { title: string; instructorId: string; description?: string; slug?: string }
  ) {
    const instructor = await this.prisma.instructor.findUnique({ where: { id: data.instructorId } })
    if (!instructor) throw new Error('Instructor not found')

    // Fetch exam metadata + junctions only (no nested content yet)
    const source = await this.prisma.exam.findUnique({
      where: { id: sourceExamId },
      include: {
        examSpecialties: true,
        examCurriculums: true,
        examMarkingDomains: true,
        courses: {
          select: { id: true }
        }
      }
    })
    if (!source) throw new Error('Source exam not found')

    const slug = data.slug || this.generateSlug(data.title)
    const existing = await this.prisma.exam.findUnique({ where: { slug } })
    if (existing) throw new Error('Exam with this slug already exists')

    return this.prisma.$transaction(async (tx) => {
      const newExam = await tx.exam.create({
        data: {
          instructorId: data.instructorId,
          title: data.title,
          slug,
          description: data.description ?? source.description,
          isActive: false,
        }
      })

      await autoGrantOnCreate(tx, {
        instructorId: data.instructorId,
        role: 'case_editor',
        resourceType: 'exam',
        resourceId: newExam.id
      })

      if (source.examSpecialties.length > 0) {
        await tx.examSpecialty.createMany({
          data: source.examSpecialties.map(e => ({ examId: newExam.id, specialtyId: e.specialtyId }))
        })
      }
      if (source.examCurriculums.length > 0) {
        await tx.examCurriculum.createMany({
          data: source.examCurriculums.map(e => ({ examId: newExam.id, curriculumId: e.curriculumId }))
        })
      }
      if (source.examMarkingDomains.length > 0) {
        await tx.examMarkingDomain.createMany({
          data: source.examMarkingDomains.map(e => ({ examId: newExam.id, markingDomainId: e.markingDomainId }))
        })
      }

      for (const { id: sourceCourseId } of source.courses) {
        // Fetch one course at a time to avoid loading everything into memory at once
        const course = await tx.course.findUniqueOrThrow({
          where: { id: sourceCourseId },
          include: {
            courseCases: {
              include: {
                caseTabs: true,
                simulation: true,
                markingCriteria: true,
                caseSpecialties: true,
                caseCurriculums: true,
              }
            },
            courseSections: {
              include: { subsections: true }
            }
          }
        })

        const newCourse = await tx.course.create({
          data: {
            examId: newExam.id,
            instructorId: data.instructorId,
            title: course.title,
            slug: course.slug,
            description: course.description,
            style: course.style,
            isPublished: false,
            infoPoints: course.infoPoints,
          }
        })

        for (const section of course.courseSections) {
          const newSection = await tx.courseSection.create({
            data: {
              courseId: newCourse.id,
              title: section.title,
              description: section.description,
              displayOrder: section.displayOrder,
              isFree: section.isFree,
            }
          })
          if (section.subsections.length > 0) {
            await tx.courseSubsection.createMany({
              data: section.subsections.map(s => ({
                sectionId: newSection.id,
                title: s.title,
                description: s.description,
                contentType: s.contentType,
                content: s.content,
                displayOrder: s.displayOrder,
                estimatedDuration: s.estimatedDuration,
                isFree: s.isFree,
              }))
            })
          }
        }

        for (const ccase of course.courseCases) {
          const newCase = await tx.courseCase.create({
            data: {
              courseId: newCourse.id,
              title: ccase.title,
              slug: ccase.slug,
              diagnosis: ccase.diagnosis,
              patientName: ccase.patientName,
              patientAge: ccase.patientAge,
              patientGender: ccase.patientGender,
              description: ccase.description,
              isFree: ccase.isFree,
              displayOrder: ccase.displayOrder,
            }
          })

          if (ccase.caseTabs.length > 0) {
            await tx.caseTab.createMany({
              data: ccase.caseTabs.map(t => ({
                courseCaseId: newCase.id,
                tabType: t.tabType,
                content: t.content,
              }))
            })
          }

          if (ccase.simulation) {
            await tx.simulation.create({
              data: {
                courseCaseId: newCase.id,
                casePrompt: ccase.simulation.casePrompt,
                openingLine: ccase.simulation.openingLine,
                timeLimitMinutes: ccase.simulation.timeLimitMinutes,
                voiceModel: ccase.simulation.voiceModel,
                warningTimeMinutes: ccase.simulation.warningTimeMinutes,
                creditCost: ccase.simulation.creditCost,
                llmProviderKey: ccase.simulation.llmProviderKey,
                sttProviderKey: ccase.simulation.sttProviderKey,
                ttsProviderKey: ccase.simulation.ttsProviderKey,
              }
            })
          }

          if (ccase.markingCriteria.length > 0) {
            await tx.markingCriterion.createMany({
              data: ccase.markingCriteria.map(m => ({
                courseCaseId: newCase.id,
                markingDomainId: m.markingDomainId,
                text: m.text,
                points: m.points,
                displayOrder: m.displayOrder,
              }))
            })
          }

          if (ccase.caseSpecialties.length > 0) {
            await tx.caseSpecialty.createMany({
              data: ccase.caseSpecialties.map(s => ({
                courseCaseId: newCase.id,
                specialtyId: s.specialtyId,
              }))
            })
          }

          if (ccase.caseCurriculums.length > 0) {
            await tx.caseCurriculum.createMany({
              data: ccase.caseCurriculums.map(c => ({
                courseCaseId: newCase.id,
                curriculumId: c.curriculumId,
              }))
            })
          }
        }
      }

      return newExam
    }, { timeout: 120000 })
  }

  // Helper method
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }



}