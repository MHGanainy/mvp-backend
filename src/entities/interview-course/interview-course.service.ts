import { PrismaClient } from '@prisma/client'
import { CreateInterviewCourseInput, UpdateInterviewCourseInput, InterviewCourseStyle } from './interview-course.schema'
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
