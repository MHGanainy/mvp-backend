// exam.service.ts
import { PrismaClient } from '@prisma/client'
import { CreateExamInput, UpdateExamInput } from './exam.schema'

export class ExamService {
  constructor(private prisma: PrismaClient) {}

  // ===== BASIC EXAM CRUD OPERATIONS =====

  async create(data: CreateExamInput) {
    // First, verify the instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    // Check if slug already exists
    const existingExam = await this.prisma.exam.findUnique({
      where: { slug: data.slug }
    })

    if (existingExam) {
      throw new Error('Exam with this slug already exists')
    }

    return await this.prisma.exam.create({
      data: {
        instructorId: data.instructorId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        isActive: data.isActive ?? true
      },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
  }

  async findAll() {
    return await this.prisma.exam.findMany({
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findActive() {
    return await this.prisma.exam.findMany({
      where: { isActive: true },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        title: 'asc'
      }
    })
  }

  async findById(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return exam
  }

  async findBySlug(slug: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { slug },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return exam
  }

  async findByInstructor(instructorId: string) {
    // Verify instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    return await this.prisma.exam.findMany({
      where: { instructorId },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async update(id: string, data: UpdateExamInput) {
    // Check if exam exists
    await this.findById(id)

    // If updating slug, check it's unique
    if (data.slug) {
      const existingExam = await this.prisma.exam.findUnique({
        where: { slug: data.slug }
      })

      if (existingExam && existingExam.id !== id) {
        throw new Error('Exam with this slug already exists')
      }
    }

    return await this.prisma.exam.update({
      where: { id },
      data,
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
  }

  async delete(id: string) {
    // Check if exam exists
    await this.findById(id)

    return await this.prisma.exam.delete({
      where: { id }
    })
  }

  async toggleActive(id: string) {
    const exam = await this.findById(id)
    
    return await this.prisma.exam.update({
      where: { id },
      data: { isActive: !exam.isActive },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
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
    await this.findById(examId)

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
    await this.findById(examId)

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
  async getExamMarkingDomains(examId: string) {
    // Verify exam exists
    await this.findById(examId)

    const examMarkingDomains = await this.prisma.examMarkingDomain.findMany({
      where: { examId },
      include: {
        markingDomain: true
      },
      orderBy: {
        markingDomain: {
          name: 'asc'
        }
      }
    })

    return examMarkingDomains.map(emd => emd.markingDomain)
  }

  // ===== REMOVAL OPERATIONS =====

  // Remove specialty from exam
  async removeSpecialty(examId: string, specialtyId: string) {
    // Verify exam exists
    await this.findById(examId)

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
    await this.findById(examId)

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
    await this.findById(examId)

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
      include: {
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
              name: 'asc'
            }
          }
        },
        examCurriculums: {
          include: {
            curriculum: true
          },
          orderBy: {
            curriculum: {
              name: 'asc'
            }
          }
        },
        examMarkingDomains: {
          include: {
            markingDomain: true
          },
          orderBy: {
            markingDomain: {
              name: 'asc'
            }
          }
        }
      }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return {
      ...exam,
      specialties: exam.examSpecialties.map(es => es.specialty),
      curriculums: exam.examCurriculums.map(ec => ec.curriculum),
      markingDomains: exam.examMarkingDomains.map(emd => emd.markingDomain)
    }
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
}