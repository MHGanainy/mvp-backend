import { PrismaClient } from '@prisma/client'
import { CreateCourseInput, UpdateCourseInput, CourseStyle } from './course.schema'

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

    // Verify the exam exists and belongs to the instructor
    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    if (exam.instructorId !== data.instructorId) {
      throw new Error('Instructor can only create courses for their own exams')
    }

    return await this.prisma.course.create({
      data: {
        examId: data.examId,
        instructorId: data.instructorId,
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

  async findByExam(examId: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return await this.prisma.course.findMany({
      where: { examId },
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

    return await this.prisma.course.delete({
      where: { id }
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

  async updatePricing(id: string, pricing: {
    price3Months?: number
    price6Months?: number
    price12Months?: number
  }) {
    const course = await this.findById(id)
    
    return await this.prisma.course.update({
      where: { id },
      data: pricing,
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

  async updateCredits(id: string, credits: {
    credits3Months?: number
    credits6Months?: number
    credits12Months?: number
  }) {
    const course = await this.findById(id)
    
    return await this.prisma.course.update({
      where: { id },
      data: credits,
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

  async getPricingInfo(id: string) {
    const course = await this.findById(id)

    return {
      courseId: course.id,
      title: course.title,
      infoPoints: course.infoPoints || [],  // Include info points in pricing info
      pricing: {
        threeMonths: {
          price: course.price3Months,
          credits: course.credits3Months,
          pricePerMonth: Number((Number(course.price3Months) / 3).toFixed(2))
        },
        sixMonths: {
          price: course.price6Months,
          credits: course.credits6Months,
          pricePerMonth: Number((Number(course.price6Months) / 6).toFixed(2))
        },
        twelveMonths: {
          price: course.price12Months,
          credits: course.credits12Months,
          pricePerMonth: Number((Number(course.price12Months) / 12).toFixed(2))
        }
      }
    }
  }

  async createStructuredComplete(data: {
    examId: string
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
      subsections: Array<{
        title: string
        description?: string
        contentType: 'VIDEO' | 'PDF' | 'TEXT' | 'QUIZ'
        content: string
        displayOrder?: number
        estimatedDuration?: number
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

    if (exam.instructorId !== data.instructorId) {
      throw new Error('Instructor can only create courses for their own exams')
    }

    return await this.prisma.$transaction(async (tx) => {
      // Create course with STRUCTURED style
      const course = await tx.course.create({
        data: {
          examId: data.examId,
          instructorId: data.instructorId,
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

        const section = await tx.courseSection.create({
          data: {
            courseId: course.id,
            title: sectionData.title,
            description: sectionData.description,
            displayOrder: sectionData.displayOrder || (sIdx + 1)
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
              estimatedDuration: subData.estimatedDuration
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
}