import { PrismaClient } from '@prisma/client'
import { CreateCourseInput, UpdateCourseInput, UpdateStructuredCourseCompleteInput, CourseStyle } from './course.schema'
import { generateSlug, generateUniqueSlug } from '../../shared/slug'

export class CourseService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCourseInput) {
    // Verify the instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    // Verify the exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    // Ownership validation is handled at the route layer
    // Routes check: admin can create anywhere, instructors only for their own exams

    // Generate unique slug for this exam
    const slug = await generateUniqueSlug(data.title, async (testSlug) => {
      const existing = await this.prisma.course.findFirst({
        where: { examId: data.examId, slug: testSlug }
      })
      return existing !== null
    })

    return await this.prisma.course.create({
      data: {
        examId: data.examId,
        instructorId: data.instructorId,
        slug,
        title: data.title,
        description: data.description,
        style: data.style,
        infoPoints: data.infoPoints || [],
        isPublished: data.isPublished ?? false
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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
    return await this.prisma.course.findMany({
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  async findPublished() {
    return await this.prisma.course.findMany({
      where: { 
        isPublished: true,
        exam: { isActive: true } // Only show courses for active exams
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  async findByStyle(style: CourseStyle) {
    return await this.prisma.course.findMany({
      where: { 
        style,
        isPublished: true,
        exam: { isActive: true }
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

    if (!course) {
      throw new Error('Course not found')
    }

    return course
  }

  /**
   * Find a course by its slug within a specific exam.
   * @param examSlug - The slug of the exam
   * @param courseSlug - The slug of the course
   */
  async findBySlug(examSlug: string, courseSlug: string, includeUnpublished = false) {
    // First find the exam by slug
    const exam = await this.prisma.exam.findUnique({
      where: { slug: examSlug }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    const course = await this.prisma.course.findFirst({
      where: {
        examId: exam.id,
        slug: courseSlug,
        ...(!includeUnpublished && { isPublished: true })
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

    if (!course) {
      throw new Error('Course not found')
    }

    return course
  }

  async findByExam(examId: string, includeUnpublished = false) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return await this.prisma.course.findMany({
      where: { examId, ...(!includeUnpublished && { isPublished: true }) },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  async findByInstructor(instructorId: string) {
    // Verify instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    return await this.prisma.course.findMany({
      where: { instructorId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  async update(id: string, data: UpdateCourseInput) {
    // Check if course exists
    const course = await this.findById(id)

    return await this.prisma.course.update({
      where: { id },
      data,  // This already includes infoPoints if provided
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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
    // Check if course exists
    await this.findById(id)

    return await this.prisma.$transaction(async (tx) => {
      // Clean up non-cascading references that use resourceId
      await tx.subscriptionCheckoutSession.deleteMany({
        where: { resourceType: 'COURSE', resourceId: id }
      })
      await tx.subscription.deleteMany({
        where: { resourceType: 'COURSE', resourceId: id }
      })
      await tx.pricingPlan.deleteMany({
        where: { resourceType: 'COURSE', resourceId: id }
      })
      // Also clean up legacy courseId references
      await tx.subscription.deleteMany({
        where: { courseId: id }
      })
      await tx.payment.updateMany({
        where: { courseId: id },
        data: { courseId: null }
      })
      // Now delete the course (cascading relations handle the rest)
      return await tx.course.delete({
        where: { id }
      })
    })
  }

  async togglePublished(id: string) {
    const course = await this.findById(id)
    
    return await this.prisma.course.update({
      where: { id },
      data: { isPublished: !course.isPublished },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  // BUSINESS LOGIC METHODS

  async updateInfoPoints(id: string, infoPoints: string[]) {
    const course = await this.findById(id)
    
    return await this.prisma.course.update({
      where: { id },
      data: { infoPoints },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            isActive: true
          }
        },
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

  async createStructuredComplete(data: {
    examId: string
    instructorId: string
    title: string
    description?: string
    infoPoints?: string[]
    isPublished?: boolean
    sections: Array<{
      title: string
      description?: string
      displayOrder?: number
      isFree?: boolean
      subsections: Array<{
        title: string
        description?: string
        contentType: 'VIDEO' | 'PDF' | 'TEXT' | 'QUIZ'
        content: string
        displayOrder?: number
        estimatedDuration?: number
        isFree?: boolean
      }>
    }>
  }) {
    // Verify instructor and exam
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })
    if (!instructor) {
      throw new Error('Instructor not found')
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId }
    })
    if (!exam) {
      throw new Error('Exam not found')
    }

    // Ownership validation is handled at the route layer
    // Routes check: admin can create anywhere, instructors only for their own exams

    // Generate unique slug for this exam
    const slug = await generateUniqueSlug(data.title, async (testSlug) => {
      const existing = await this.prisma.course.findFirst({
        where: { examId: data.examId, slug: testSlug }
      })
      return existing !== null
    })

    return await this.prisma.$transaction(async (tx) => {
      // Create course with STRUCTURED style
      const course = await tx.course.create({
        data: {
          examId: data.examId,
          instructorId: data.instructorId,
          slug,
          title: data.title,
          description: data.description,
          style: 'STRUCTURED',
          infoPoints: data.infoPoints || [],
          isPublished: data.isPublished || false
        }
      })

      // Create sections with subsections
      const createdSections = []
      for (let sIdx = 0; sIdx < data.sections.length; sIdx++) {
        const sectionData = data.sections[sIdx]
        const sectionIsFree = sectionData.isFree ?? false

        const section = await tx.courseSection.create({
          data: {
            courseId: course.id,
            title: sectionData.title,
            description: sectionData.description,
            displayOrder: sectionData.displayOrder || (sIdx + 1),
            isFree: sectionIsFree
          }
        })

        const createdSubsections = []
        for (let subIdx = 0; subIdx < sectionData.subsections.length; subIdx++) {
          const subData = sectionData.subsections[subIdx]

          const subsection = await tx.courseSubsection.create({
            data: {
              sectionId: section.id,
              title: subData.title,
              description: subData.description,
              contentType: subData.contentType,
              content: subData.content,
              displayOrder: subData.displayOrder || (subIdx + 1),
              estimatedDuration: subData.estimatedDuration,
              // If section is locked, subsection must be locked too
              isFree: sectionIsFree ? (subData.isFree ?? false) : false
            }
          })
          createdSubsections.push(subsection)
        }

        createdSections.push({
          ...section,
          subsections: createdSubsections
        })
      }

      return {
        course,
        sections: createdSections,
        summary: {
          sectionsCreated: createdSections.length,
          totalSubsections: createdSections.reduce(
            (sum, s) => sum + s.subsections.length, 0
          )
        }
      }
    })
  }

  async updateStructuredComplete(id: string, data: UpdateStructuredCourseCompleteInput) {
    // Verify course exists and is STRUCTURED style
    const course = await this.findById(id)
    
    if (course.style !== 'STRUCTURED') {
      throw new Error('This endpoint can only be used for STRUCTURED style courses')
    }

    return await this.prisma.$transaction(async (tx) => {
      // Build update object with only provided fields
      const courseUpdateData: any = {}
      if (data.title !== undefined) courseUpdateData.title = data.title
      if (data.description !== undefined) courseUpdateData.description = data.description
      if (data.infoPoints !== undefined) courseUpdateData.infoPoints = data.infoPoints
      if (data.isPublished !== undefined) courseUpdateData.isPublished = data.isPublished

      // Update course entity (only if there are fields to update)
      if (Object.keys(courseUpdateData).length > 0) {
        await tx.course.update({
          where: { id },
          data: courseUpdateData
        })
      }

      // Delete all existing sections (this will cascade delete subsections)
      await tx.courseSection.deleteMany({
        where: { courseId: id }
      })

      // Create new sections with subsections
      const createdSections = []
      const sections = data.sections || []

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sectionData = sections[sIdx]
        const sectionIsFree = sectionData.isFree ?? false

        const section = await tx.courseSection.create({
          data: {
            courseId: id,
            title: sectionData.title,
            description: sectionData.description,
            displayOrder: sectionData.displayOrder || (sIdx + 1),
            isFree: sectionIsFree
          }
        })

        const createdSubsections = []
        const subsections = sectionData.subsections || []

        for (let subIdx = 0; subIdx < subsections.length; subIdx++) {
          const subData = subsections[subIdx]

          const subsection = await tx.courseSubsection.create({
            data: {
              sectionId: section.id,
              title: subData.title,
              description: subData.description,
              contentType: subData.contentType,
              content: subData.content,
              displayOrder: subData.displayOrder || (subIdx + 1),
              estimatedDuration: subData.estimatedDuration,
              // If section is locked, subsection must be locked too
              isFree: sectionIsFree ? (subData.isFree ?? false) : false
            }
          })
          createdSubsections.push(subsection)
        }

        createdSections.push({
          ...section,
          subsections: createdSubsections
        })
      }

      return {
        course: await tx.course.findUnique({
          where: { id },
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                slug: true,
                isActive: true
              }
            },
            instructor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                bio: true
              }
            }
          }
        }),
        sections: createdSections,
        summary: {
          sectionsUpdated: createdSections.length,
          totalSubsections: createdSections.reduce(
            (sum, s) => sum + s.subsections.length, 0
          )
        }
      }
    })
  }
}