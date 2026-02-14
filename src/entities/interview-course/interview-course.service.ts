import { PrismaClient } from '@prisma/client'
import {
  CreateInterviewCourseInput,
  UpdateInterviewCourseInput,
  InterviewCourseStyle,
  UpdateStructuredInterviewCourseCompleteInput
} from './interview-course.schema'
import { generateUniqueSlug } from '../../shared/slug'

export class InterviewCourseService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInterviewCourseInput) {
    // Verify the instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    // Verify the interview exists and belongs to the instructor
    const interview = await this.prisma.interview.findUnique({
      where: { id: data.interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    if (interview.instructorId !== data.instructorId) {
      throw new Error('Instructor can only create interview courses for their own interviews')
    }

    // Generate unique slug for this interview
    const slug = await generateUniqueSlug(data.title, async (testSlug) => {
      const existing = await this.prisma.interviewCourse.findFirst({
        where: { interviewId: data.interviewId, slug: testSlug }
      })
      return existing !== null
    })

    return await this.prisma.interviewCourse.create({
      data: {
        interviewId: data.interviewId,
        instructorId: data.instructorId,
        slug,
        title: data.title,
        description: data.description,
        style: data.style,
        infoPoints: data.infoPoints || [],  // ADDED THIS LINE
        price3Months: data.price3Months,
        price6Months: data.price6Months,
        price12Months: data.price12Months,
        credits3Months: data.credits3Months,
        credits6Months: data.credits6Months,
        credits12Months: data.credits12Months,
        isPublished: data.isPublished ?? false
      },
      include: {
        interview: {
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
    return await this.prisma.interviewCourse.findMany({
      include: {
        interview: {
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
    return await this.prisma.interviewCourse.findMany({
      where: {
        isPublished: true,
        interview: { isActive: true } // Only show interview courses for active interviews
      },
      include: {
        interview: {
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

  async findByStyle(style: InterviewCourseStyle) {
    return await this.prisma.interviewCourse.findMany({
      where: {
        style,
        isPublished: true,
        interview: { isActive: true }
      },
      include: {
        interview: {
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
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id },
      include: {
        interview: {
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

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    return interviewCourse
  }

  async findBySlug(interviewSlug: string, courseSlug: string) {
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
      },
      include: {
        interview: {
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

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    return interviewCourse
  }

  async findByInterview(interviewId: string) {
    // Verify interview exists
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId }
    })

    if (!interview) {
      throw new Error('Interview not found')
    }

    return await this.prisma.interviewCourse.findMany({
      where: { interviewId },
      include: {
        interview: {
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

    return await this.prisma.interviewCourse.findMany({
      where: { instructorId },
      include: {
        interview: {
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

  async update(id: string, data: UpdateInterviewCourseInput) {
    // Check if interview course exists
    const interviewCourse = await this.findById(id)

    return await this.prisma.interviewCourse.update({
      where: { id },
      data,  // This already includes infoPoints if provided
      include: {
        interview: {
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
    // Check if interview course exists
    await this.findById(id)

    return await this.prisma.interviewCourse.delete({
      where: { id }
    })
  }

  async togglePublished(id: string) {
    const interviewCourse = await this.findById(id)

    return await this.prisma.interviewCourse.update({
      where: { id },
      data: { isPublished: !interviewCourse.isPublished },
      include: {
        interview: {
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

  async updatePricing(id: string, pricing: {
    price3Months?: number
    price6Months?: number
    price12Months?: number
  }) {
    const interviewCourse = await this.findById(id)

    return await this.prisma.interviewCourse.update({
      where: { id },
      data: pricing,
      include: {
        interview: {
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

  async updateCredits(id: string, credits: {
    credits3Months?: number
    credits6Months?: number
    credits12Months?: number
  }) {
    const interviewCourse = await this.findById(id)

    return await this.prisma.interviewCourse.update({
      where: { id },
      data: credits,
      include: {
        interview: {
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

  async updateInfoPoints(id: string, infoPoints: string[]) {
    const interviewCourse = await this.findById(id)

    return await this.prisma.interviewCourse.update({
      where: { id },
      data: { infoPoints },
      include: {
        interview: {
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
    interviewId: string
    instructorId: string
    title: string
    description?: string
    price3Months: number
    price6Months: number
    price12Months: number
    credits3Months: number
    credits6Months: number
    credits12Months: number
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
    // Verify instructor and interview
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })
    if (!instructor) {
      throw new Error('Instructor not found')
    }

    const interview = await this.prisma.interview.findUnique({
      where: { id: data.interviewId }
    })
    if (!interview) {
      throw new Error('Interview not found')
    }

    if (interview.instructorId !== data.instructorId) {
      throw new Error('Instructor can only create interview courses for their own interviews')
    }

    // Generate unique slug for this interview
    const slug = await generateUniqueSlug(data.title, async (testSlug) => {
      const existing = await this.prisma.interviewCourse.findFirst({
        where: { interviewId: data.interviewId, slug: testSlug }
      })
      return existing !== null
    })

    return await this.prisma.$transaction(async (tx) => {
      // Create interview course with STRUCTURED style
      const interviewCourse = await tx.interviewCourse.create({
        data: {
          interviewId: data.interviewId,
          instructorId: data.instructorId,
          slug,
          title: data.title,
          description: data.description,
          style: 'STRUCTURED',
          price3Months: data.price3Months,
          price6Months: data.price6Months,
          price12Months: data.price12Months,
          credits3Months: data.credits3Months,
          credits6Months: data.credits6Months,
          credits12Months: data.credits12Months,
          infoPoints: data.infoPoints || [],
          isPublished: data.isPublished || false
        }
      })

      // Create sections with subsections
      const createdSections = []
      for (let sIdx = 0; sIdx < data.sections.length; sIdx++) {
        const sectionData = data.sections[sIdx]
        const sectionIsFree = sectionData.isFree ?? false

        const section = await tx.interviewCourseSection.create({
          data: {
            interviewCourseId: interviewCourse.id,
            title: sectionData.title,
            description: sectionData.description,
            displayOrder: sectionData.displayOrder || (sIdx + 1),
            isFree: sectionIsFree
          }
        })

        const createdSubsections = []
        for (let subIdx = 0; subIdx < sectionData.subsections.length; subIdx++) {
          const subData = sectionData.subsections[subIdx]

          const subsection = await tx.interviewCourseSubsection.create({
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
        interviewCourse,
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

  async updateStructuredComplete(id: string, data: UpdateStructuredInterviewCourseCompleteInput) {
    // Verify interview course exists and is STRUCTURED style
    const interviewCourse = await this.findById(id)

    if (interviewCourse.style !== 'STRUCTURED') {
      throw new Error('This endpoint can only be used for STRUCTURED style interview courses')
    }

    return await this.prisma.$transaction(async (tx) => {
      // Build update object with only provided fields
      const courseUpdateData: any = {}
      if (data.title !== undefined) courseUpdateData.title = data.title
      if (data.description !== undefined) courseUpdateData.description = data.description
      if (data.infoPoints !== undefined) courseUpdateData.infoPoints = data.infoPoints
      if (data.price3Months !== undefined) courseUpdateData.price3Months = data.price3Months
      if (data.price6Months !== undefined) courseUpdateData.price6Months = data.price6Months
      if (data.price12Months !== undefined) courseUpdateData.price12Months = data.price12Months
      if (data.credits3Months !== undefined) courseUpdateData.credits3Months = data.credits3Months
      if (data.credits6Months !== undefined) courseUpdateData.credits6Months = data.credits6Months
      if (data.credits12Months !== undefined) courseUpdateData.credits12Months = data.credits12Months
      if (data.isPublished !== undefined) courseUpdateData.isPublished = data.isPublished

      // Update interview course entity (only if there are fields to update)
      if (Object.keys(courseUpdateData).length > 0) {
        await tx.interviewCourse.update({
          where: { id },
          data: courseUpdateData
        })
      }

      // Delete all existing sections (this will cascade delete subsections)
      await tx.interviewCourseSection.deleteMany({
        where: { interviewCourseId: id }
      })

      // Create new sections with subsections
      const createdSections = []
      const sections = data.sections || []

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sectionData = sections[sIdx]
        const sectionIsFree = sectionData.isFree ?? false

        const section = await tx.interviewCourseSection.create({
          data: {
            interviewCourseId: id,
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

          const subsection = await tx.interviewCourseSubsection.create({
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
        interviewCourse: await tx.interviewCourse.findUnique({
          where: { id },
          include: {
            interview: {
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

  async getPricingInfo(id: string) {
    const interviewCourse = await this.findById(id)

    return {
      interviewCourseId: interviewCourse.id,
      title: interviewCourse.title,
      infoPoints: interviewCourse.infoPoints || [],  // Include info points in pricing info
      pricing: {
        threeMonths: {
          price: interviewCourse.price3Months,
          credits: interviewCourse.credits3Months,
          pricePerMonth: Number((Number(interviewCourse.price3Months) / 3).toFixed(2))
        },
        sixMonths: {
          price: interviewCourse.price6Months,
          credits: interviewCourse.credits6Months,
          pricePerMonth: Number((Number(interviewCourse.price6Months) / 6).toFixed(2))
        },
        twelveMonths: {
          price: interviewCourse.price12Months,
          credits: interviewCourse.credits12Months,
          pricePerMonth: Number((Number(interviewCourse.price12Months) / 12).toFixed(2))
        }
      }
    }
  }
}
