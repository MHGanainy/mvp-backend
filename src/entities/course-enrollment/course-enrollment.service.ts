import { PrismaClient } from '@prisma/client'
import { CreateCourseEnrollmentInput } from './course-enrollment.schema'

export class CourseEnrollmentService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCourseEnrollmentInput) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
      include: { user: true }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Admin users don't need enrollment
    if (student.user.isAdmin) {
      throw new Error('Admin users do not need enrollment')
    }

    // Verify course exists and is STRUCTURED
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    if (course.style !== 'STRUCTURED') {
      throw new Error('Enrollment is only for STRUCTURED style courses')
    }

    if (!course.isPublished) {
      throw new Error('Cannot enroll in unpublished course')
    }

    // Check for existing enrollment
    const existingEnrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: data.studentId,
          courseId: data.courseId
        }
      }
    })

    if (existingEnrollment) {
      throw new Error('Student is already enrolled in this course')
    }

    // REMOVED: Subscription requirement check
    // Enrollment is for progress tracking - access control is handled at section/subsection level
    // Users can enroll in courses to track their progress on free sections
    // Subscription is only required to access locked (non-free) sections

    return await this.prisma.courseEnrollment.create({
      data: {
        studentId: data.studentId,
        courseId: data.courseId,
        progressPercent: 0,
        isCompleted: false
      },
      include: {
        course: {
          select: { id: true, title: true, style: true }
        },
        student: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })
  }

  async findById(id: string, includeProgress: boolean = false) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, title: true, style: true }
        },
        student: {
          select: { id: true, firstName: true, lastName: true }
        },
        subsectionProgress: includeProgress ? {
          include: {
            subsection: {
              select: { id: true, title: true, contentType: true }
            }
          }
        } : false
      }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    return enrollment
  }

  async findByStudent(studentId: string, options: {
    includeProgress?: boolean
    completedOnly?: boolean
  } = {}) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    return await this.prisma.courseEnrollment.findMany({
      where: {
        studentId,
        ...(options.completedOnly ? { isCompleted: true } : {})
      },
      include: {
        course: {
          select: { id: true, title: true, style: true, description: true }
        },
        subsectionProgress: options.includeProgress ? {
          include: {
            subsection: {
              select: { id: true, title: true, contentType: true }
            }
          }
        } : false
      },
      orderBy: { enrolledAt: 'desc' }
    })
  }

  async findByStudentAndCourse(studentId: string, courseId: string) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId }
      },
      include: {
        course: {
          include: {
            courseSections: {
              include: {
                subsections: {
                  orderBy: { displayOrder: 'asc' }
                }
              },
              orderBy: { displayOrder: 'asc' }
            }
          }
        },
        subsectionProgress: {
          include: {
            subsection: true
          }
        }
      }
    })

    if (!enrollment) {
      return null
    }

    // Check if student has active subscription to this course
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        studentId,
        courseId,
        isActive: true,
        endDate: { gte: new Date() }
      }
    })

    // Calculate detailed progress
    const totalSubsections = enrollment.course.courseSections.reduce(
      (sum, section) => sum + section.subsections.length, 0
    )
    const completedSubsections = enrollment.subsectionProgress.filter(
      p => p.isCompleted
    ).length

    return {
      ...enrollment,
      hasActiveSubscription: !!activeSubscription,
      progressDetails: {
        totalSubsections,
        completedSubsections,
        progressPercent: totalSubsections > 0
          ? Math.round((completedSubsections / totalSubsections) * 100)
          : 0
      }
    }
  }

  async updateLastAccessed(id: string) {
    return await this.prisma.courseEnrollment.update({
      where: { id },
      data: { lastAccessedAt: new Date() }
    })
  }

  async recalculateProgress(enrollmentId: string) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        course: {
          include: {
            courseSections: {
              include: { subsections: true }
            }
          }
        },
        subsectionProgress: true
      }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    const totalSubsections = enrollment.course.courseSections.reduce(
      (sum, section) => sum + section.subsections.length, 0
    )
    const completedSubsections = enrollment.subsectionProgress.filter(
      p => p.isCompleted
    ).length

    const progressPercent = totalSubsections > 0
      ? Math.round((completedSubsections / totalSubsections) * 100)
      : 0
    const isCompleted = progressPercent === 100

    return await this.prisma.courseEnrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPercent,
        isCompleted,
        completedAt: isCompleted ? new Date() : null
      }
    })
  }

  async delete(id: string) {
    const enrollment = await this.findById(id)

    await this.prisma.courseEnrollment.delete({
      where: { id }
    })

    return { success: true, deletedEnrollment: enrollment }
  }
}
