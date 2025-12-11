// interview.service.ts
import { PrismaClient } from '@prisma/client'
import { CreateInterviewInput, UpdateInterviewInput, CreateCompleteInterviewInput, UpdateCompleteInterviewInput, InterviewMarkingDomainsDetailedResponse } from './interview.schema'

export class InterviewService {
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
      interviewSpecialties: {
        include: {
          specialty: true
        },
        orderBy: {
          specialty: {
            name: 'asc' as const
          }
        }
      },
      interviewCurriculums: {
        include: {
          curriculum: true
        },
        orderBy: {
          curriculum: {
            name: 'asc' as const
          }
        }
      },
      interviewMarkingDomains: {
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
          interviewCourses: true,
          interviewSpecialties: true,
          interviewCurriculums: true,
          interviewMarkingDomains: true
        }
      }
    }
  }

  // Transform the interview response to include flattened relations
  private transformInterviewWithRelations(interview: any) {
    return {
      ...interview,
      specialties: interview.interviewSpecialties?.map((es: any) => es.specialty) || [],
      curriculums: interview.interviewCurriculums?.map((ec: any) => ec.curriculum) || [],
      markingDomains: interview.interviewMarkingDomains?.map((emd: any) => emd.markingDomain) || [],
      interviewSpecialties: undefined,
      interviewCurriculums: undefined,
      interviewMarkingDomains: undefined
    }
  }

  // ===== BASIC INTERVIEW CRUD OPERATIONS =====

  async create(data: CreateInterviewInput) {
    // First, verify the instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    // Check if slug already exists
    const existingInterview = await this.prisma.interview.findUnique({
      where: { slug: data.slug }
    })

    if (existingInterview) {
      throw new Error('Interview with this slug already exists')
    }

    const interview = await this.prisma.interview.create({
      data: {
        instructorId: data.instructorId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        isActive: data.isActive ?? true
      },
      include: this.getFullInclude()
    })

    return this.transformInterviewWithRelations(interview)
  }

  async findAll() {
    const interviews = await this.prisma.interview.findMany({
      include: this.getFullInclude(),
      orderBy: {
        createdAt: 'desc'
      }
    })

    return interviews.map(interview => this.transformInterviewWithRelations(interview))
  }

  async findActive() {
    const interviews = await this.prisma.interview.findMany({
      where: { isActive: true },
      include: this.getFullInclude(),
      orderBy: {
        title: 'asc'
      }
    })

    return interviews.map(interview => this.transformInterviewWithRelations(interview))
  }

  async findById(id: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: this.getFullInclude()
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    return this.transformInterviewWithRelations(interview)
  }

  async findBySlug(slug: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { slug },
      include: this.getFullInclude()
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    return this.transformInterviewWithRelations(interview)
  }

  async findByInstructor(instructorId: string) {
    // Verify instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    const interviews = await this.prisma.interview.findMany({
      where: { instructorId },
      include: this.getFullInclude(),
      orderBy: {
        createdAt: 'desc'
      }
    })

    return interviews.map(interview => this.transformInterviewWithRelations(interview))
  }

  async update(id: string, data: UpdateInterviewInput) {
    // Check if interview exists
    const existingInterview = await this.prisma.interview.findUnique({
      where: { id }
    })

    if (!existingInterview) {
      throw new Error('Interview not found')
    }

    // If updating slug, check it's unique
    if (data.slug) {
      const interviewWithSlug = await this.prisma.interview.findUnique({
        where: { slug: data.slug }
      })

      if (interviewWithSlug && interviewWithSlug.id !== id) {
        throw new Error('Interview with this slug already exists')
      }
    }

    const interview = await this.prisma.interview.update({
      where: { id },
      data,
      include: this.getFullInclude()
    })

    return this.transformInterviewWithRelations(interview)
  }

  async delete(id: string) {
    // Check if interview exists
    await this.findById(id)

    return await this.prisma.interview.delete({
      where: { id }
    })
  }

  async toggleActive(id: string) {
    const currentInterview = await this.prisma.interview.findUnique({
      where: { id }
    })

    if (!currentInterview) {
      throw new Error('Interview not found')
    }

    const interview = await this.prisma.interview.update({
      where: { id },
      data: { isActive: !currentInterview.isActive },
      include: this.getFullInclude()
    })

    return this.transformInterviewWithRelations(interview)
  }

  // ===== JUNCTION TABLE OPERATIONS =====

  // Assign specialties to an interview (User Story #36)
  async assignSpecialties(interviewId: string, specialtyIds: string[]) {
    // Verify interview exists
    await this.findById(interviewId)

    // Verify all specialties exist
    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: specialtyIds } }
    })

    if (specialties.length !== specialtyIds.length) {
      throw new Error('One or more specialties not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.interviewSpecialty.deleteMany({
      where: { interviewId }
    })

    // Create new assignments
    const assignments = await this.prisma.interviewSpecialty.createMany({
      data: specialtyIds.map(specialtyId => ({
        interviewId,
        specialtyId
      }))
    })

    return assignments
  }

  // Assign curriculum items to an interview (User Story #37)
  async assignCurriculums(interviewId: string, curriculumIds: string[]) {
    // Verify interview exists
    await this.findById(interviewId)

    // Verify all curriculum items exist
    const curriculums = await this.prisma.curriculum.findMany({
      where: { id: { in: curriculumIds } }
    })

    if (curriculums.length !== curriculumIds.length) {
      throw new Error('One or more curriculum items not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.interviewCurriculum.deleteMany({
      where: { interviewId }
    })

    // Create new assignments
    const assignments = await this.prisma.interviewCurriculum.createMany({
      data: curriculumIds.map(curriculumId => ({
        interviewId,
        curriculumId
      }))
    })

    return assignments
  }

  // Assign marking domains to an interview (User Story #38)
  async assignMarkingDomains(interviewId: string, markingDomainIds: string[]) {
    // Verify interview exists
    await this.findById(interviewId)

    // Verify all marking domains exist
    const markingDomains = await this.prisma.markingDomain.findMany({
      where: { id: { in: markingDomainIds } }
    })

    if (markingDomains.length !== markingDomainIds.length) {
      throw new Error('One or more marking domains not found')
    }

    // Remove existing assignments to prevent duplicates
    await this.prisma.interviewMarkingDomain.deleteMany({
      where: { interviewId }
    })

    // Create new assignments
    const assignments = await this.prisma.interviewMarkingDomain.createMany({
      data: markingDomainIds.map(markingDomainId => ({
        interviewId,
        markingDomainId
      }))
    })

    return assignments
  }

  // ===== RETRIEVAL OPERATIONS =====

  // Get specialties assigned to an interview
  async getInterviewSpecialties(interviewId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const interviewSpecialties = await this.prisma.interviewSpecialty.findMany({
      where: { interviewId },
      include: {
        specialty: true
      },
      orderBy: {
        specialty: {
          name: 'asc'
        }
      }
    })

    return interviewSpecialties.map(es => es.specialty)
  }

  // Get curriculum items assigned to an interview
  async getInterviewCurriculums(interviewId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const interviewCurriculums = await this.prisma.interviewCurriculum.findMany({
      where: { interviewId },
      include: {
        curriculum: true
      },
      orderBy: {
        curriculum: {
          name: 'asc'
        }
      }
    })

    return interviewCurriculums.map(ec => ec.curriculum)
  }

  // Get marking domains assigned to an interview
  async getInterviewMarkingDomains(interviewId: string): Promise<InterviewMarkingDomainsDetailedResponse> {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const interviewMarkingDomains = await this.prisma.interviewMarkingDomain.findMany({
      where: { interviewId },
      include: {
        markingDomain: {
          include: {
            interviewMarkingCriteria: {
              include: {
                interviewCase: {
                  select: {
                    id: true,
                    title: true,
                    diagnosis: true,
                    patientName: true,
                    patientAge: true,
                    patientGender: true,
                    displayOrder: true,
                    interviewCourse: {
                      select: {
                        id: true,
                        title: true,
                        interviewId: true,
                        interview: {
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
              // Only include marking criteria from interviewCourses that belong to this interview
              where: {
                interviewCase: {
                  interviewCourse: {
                    interviewId: interviewId
                  }
                }
              },
              orderBy: [
                {
                  interviewCase: {
                    interviewCourse: {
                      title: 'asc' as const
                    }
                  }
                },
                {
                  interviewCase: {
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
                interviewMarkingCriteria: true
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
    return interviewMarkingDomains.map(emd => {
      // Group marking criteria by course and case for better organization
      const criteriaByCourseCaseMap = new Map<string, any[]>()

      emd.markingDomain.interviewMarkingCriteria.forEach(criterion => {
        const key = `${criterion.interviewCase.interviewCourse.id}:${criterion.interviewCase.id}`
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
          courseTitle: firstCriterion.interviewCase.interviewCourse.title,
          caseId,
          caseTitle: firstCriterion.interviewCase.title,
          caseDisplayOrder: firstCriterion.interviewCase.displayOrder,
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
      const totalPoints = emd.markingDomain.interviewMarkingCriteria.reduce((sum, c) => sum + c.points, 0)
      const totalCriteria = emd.markingDomain.interviewMarkingCriteria.length
      const uniqueCases = new Set(emd.markingDomain.interviewMarkingCriteria.map(c => c.interviewCaseId)).size
      const uniqueCourses = new Set(emd.markingDomain.interviewMarkingCriteria.map(c => c.interviewCase.interviewCourse.id)).size

      return {
        id: emd.markingDomain.id,
        name: emd.markingDomain.name,
        createdAt: emd.markingDomain.createdAt,
        associatedAt: emd.createdAt, // When it was linked to this interview

        // Statistics for this domain within this interview
        statistics: {
          totalCriteria,
          totalPoints,
          uniqueCases,
          uniqueCourses,
          averagePointsPerCriterion: totalCriteria > 0 ? (totalPoints / totalCriteria).toFixed(2) : '0'
        },

        // All marking criteria (flat list)
        markingCriteria: emd.markingDomain.interviewMarkingCriteria,

        // Organized by course and case for UI display
        criteriaByCase,

        // Count including criteria from other interviews (total in the domain)
        _count: {
          markingCriteria: emd.markingDomain._count.interviewMarkingCriteria
        }
      }
    })
  }

  // ===== REMOVAL OPERATIONS =====

  // Remove specialty from interview
  async removeSpecialty(interviewId: string, specialtyId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const deleted = await this.prisma.interviewSpecialty.deleteMany({
      where: { interviewId, specialtyId }
    })

    if (deleted.count === 0) {
      throw new Error('Specialty assignment not found')
    }

    return { message: 'Specialty removed successfully' }
  }

  // Remove curriculum from interview
  async removeCurriculum(interviewId: string, curriculumId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const deleted = await this.prisma.interviewCurriculum.deleteMany({
      where: { interviewId, curriculumId }
    })

    if (deleted.count === 0) {
      throw new Error('Curriculum assignment not found')
    }

    return { message: 'Curriculum removed successfully' }
  }

  // Remove marking domain from interview
  async removeMarkingDomain(interviewId: string, markingDomainId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    const deleted = await this.prisma.interviewMarkingDomain.deleteMany({
      where: { interviewId, markingDomainId }
    })

    if (deleted.count === 0) {
      throw new Error('Marking domain assignment not found')
    }

    return { message: 'Marking domain removed successfully' }
  }

  // ===== CONFIGURATION & STATISTICS =====

  // Get interview configuration summary
  async getInterviewConfiguration(interviewId: string) {
    const interview = await this.findById(interviewId)

    const specialties = await this.getInterviewSpecialties(interviewId)
    const curriculums = await this.getInterviewCurriculums(interviewId)
    const markingDomains = await this.getInterviewMarkingDomains(interviewId)

    return {
      interview: {
        id: interview.id,
        title: interview.title,
        slug: interview.slug,
        description: interview.description,
        isActive: interview.isActive
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

  // Bulk configure interview (assign all at once)
  async bulkConfigureInterview(interviewId: string, configuration: {
    specialtyIds?: string[]
    curriculumIds?: string[]
    markingDomainIds?: string[]
  }) {
    // Verify interview exists
    await this.findById(interviewId)

    const operations = []

    if (configuration.specialtyIds && configuration.specialtyIds.length > 0) {
      operations.push(
        this.assignSpecialties(interviewId, configuration.specialtyIds)
      )
    }

    if (configuration.curriculumIds && configuration.curriculumIds.length > 0) {
      operations.push(
        this.assignCurriculums(interviewId, configuration.curriculumIds)
      )
    }

    if (configuration.markingDomainIds && configuration.markingDomainIds.length > 0) {
      operations.push(
        this.assignMarkingDomains(interviewId, configuration.markingDomainIds)
      )
    }

    if (operations.length > 0) {
      await Promise.all(operations)
    }

    return {
      message: 'Interview configuration completed successfully',
      interviewId,
      configured: {
        specialties: configuration.specialtyIds?.length || 0,
        curriculums: configuration.curriculumIds?.length || 0,
        markingDomains: configuration.markingDomainIds?.length || 0
      }
    }
  }

  // Get interview statistics (how many interviewCourses/cases use this interview configuration)
  async getInterviewUsageStats(interviewId: string) {
    const interview = await this.findById(interviewId)

    // Get usage counts
    const coursesCount = await this.prisma.interviewCourse.count({
      where: { interviewId }
    })

    const casesCount = await this.prisma.interviewCase.count({
      where: { interviewCourse: { interviewId } }
    })

    const simulationsCount = await this.prisma.interviewSimulation.count({
      where: { interviewCase: { interviewCourse: { interviewId } } }
    })

    // Get configuration counts by querying junction tables directly
    const specialtiesCount = await this.prisma.interviewSpecialty.count({
      where: { interviewId }
    })

    const curriculumsCount = await this.prisma.interviewCurriculum.count({
      where: { interviewId }
    })

    const markingDomainsCount = await this.prisma.interviewMarkingDomain.count({
      where: { interviewId }
    })

    return {
      interviewId,
      interviewTitle: interview.title,
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

  // Check if interview is fully configured
  async isInterviewFullyConfigured(interviewId: string): Promise<boolean> {
    const specialtiesCount = await this.prisma.interviewSpecialty.count({
      where: { interviewId }
    })

    const curriculumsCount = await this.prisma.interviewCurriculum.count({
      where: { interviewId }
    })

    const markingDomainsCount = await this.prisma.interviewMarkingDomain.count({
      where: { interviewId }
    })

    return specialtiesCount > 0 && curriculumsCount > 0 && markingDomainsCount > 0
  }

  // Get interview with all configuration details (including junction data)
  async getInterviewWithConfiguration(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: this.getFullInclude()
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    return this.transformInterviewWithRelations(interview)
  }

  // Clear all interview configurations
  async clearInterviewConfiguration(interviewId: string) {
    // Verify interview exists
    await this.findById(interviewId)

    await Promise.all([
      this.prisma.interviewSpecialty.deleteMany({ where: { interviewId } }),
      this.prisma.interviewCurriculum.deleteMany({ where: { interviewId } }),
      this.prisma.interviewMarkingDomain.deleteMany({ where: { interviewId } })
    ])

    return { message: 'Interview configuration cleared successfully' }
  }

  // ===== COMPLETE INTERVIEW CREATION =====

  async createCompleteInterview(data: CreateCompleteInterviewInput) {
    // Use transaction to ensure atomicity
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify instructor exists
      const instructor = await tx.instructor.findUnique({
        where: { id: data.interview.instructorId }
      })

      if (!instructor) {
        throw new Error('Instructor not found')
      }

      // Generate slug if not provided
      const slug = data.interview.slug || this.generateSlug(data.interview.title)

      // Check if slug already exists
      const existingInterview = await tx.interview.findUnique({
        where: { slug }
      })

      if (existingInterview) {
        throw new Error('Interview with this slug already exists')
      }

      // Step 2: Create the interview
      const interview = await tx.interview.create({
        data: {
          instructorId: data.interview.instructorId,
          title: data.interview.title,
          slug: slug,
          description: data.interview.description,
          isActive: data.interview.isActive ?? true
        }
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
        await tx.interviewSpecialty.createMany({
          data: allSpecialtyIds.map(specialtyId => ({
            interviewId: interview.id,
            specialtyId
          }))
        })
      }

      if (allCurriculumIds.length > 0) {
        await tx.interviewCurriculum.createMany({
          data: allCurriculumIds.map(curriculumId => ({
            interviewId: interview.id,
            curriculumId
          }))
        })
      }

      if (allMarkingDomainIds.length > 0) {
        await tx.interviewMarkingDomain.createMany({
          data: allMarkingDomainIds.map(markingDomainId => ({
            interviewId: interview.id,
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
        interview,
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

  // ===== COMPLETE INTERVIEW UPDATE =====

  async updateCompleteInterview(interviewId: string, data: Omit<UpdateCompleteInterviewInput, 'interviewId'>) {
    // Use transaction to ensure atomicity
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Verify interview exists
      const existingInterview = await tx.interview.findUnique({
        where: { id: interviewId }
      })

      if (!existingInterview) {
        throw new Error('Interview not found')
      }

      // Step 2: Update interview basic info if provided
      let updatedInterview = existingInterview
      if (data.interview && Object.keys(data.interview).length > 0) {
        // If updating slug, check it's unique
        if (data.interview.slug) {
          const interviewWithSlug = await tx.interview.findUnique({
            where: { slug: data.interview.slug }
          })

          if (interviewWithSlug && interviewWithSlug.id !== interviewId) {
            throw new Error('Interview with this slug already exists')
          }
        }

        updatedInterview = await tx.interview.update({
          where: { id: interviewId },
          data: data.interview
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
          await tx.interviewSpecialty.deleteMany({ where: { interviewId } })
          if (allSpecialtyIds.length > 0) {
            await tx.interviewSpecialty.createMany({
              data: allSpecialtyIds.map(specialtyId => ({
                interviewId,
                specialtyId
              }))
            })
          }
        }

        // Clear and reassign curriculums
        if (allCurriculumIds.length > 0 || (data.existing && 'curriculumIds' in data.existing)) {
          await tx.interviewCurriculum.deleteMany({ where: { interviewId } })
          if (allCurriculumIds.length > 0) {
            await tx.interviewCurriculum.createMany({
              data: allCurriculumIds.map(curriculumId => ({
                interviewId,
                curriculumId
              }))
            })
          }
        }

        // Clear and reassign marking domains
        if (allMarkingDomainIds.length > 0 || (data.existing && 'markingDomainIds' in data.existing)) {
          await tx.interviewMarkingDomain.deleteMany({ where: { interviewId } })
          if (allMarkingDomainIds.length > 0) {
            await tx.interviewMarkingDomain.createMany({
              data: allMarkingDomainIds.map(markingDomainId => ({
                interviewId,
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
        interview: updatedInterview,
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
          interviewUpdated: data.interview && Object.keys(data.interview).length > 0
        }
      }
    })
  }



  // Helper method
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }



}
