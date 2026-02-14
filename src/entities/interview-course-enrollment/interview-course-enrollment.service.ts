import { PrismaClient } from '@prisma/client'
import { CreateInterviewCourseEnrollmentInput } from './interview-course-enrollment.schema'

export class InterviewCourseEnrollmentService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInterviewCourseEnrollmentInput) {
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

    // Verify interview course exists and is STRUCTURED
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: data.interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    if (interviewCourse.style !== 'STRUCTURED') {
      throw new Error('Enrollment is only for STRUCTURED style interview courses')
    }

    if (!interviewCourse.isPublished) {
      throw new Error('Cannot enroll in unpublished interview course')
    }

    // Check for existing enrollment
    const existingEnrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: {
        studentId_interviewCourseId: {
          studentId: data.studentId,
          interviewCourseId: data.interviewCourseId
        }
      }
    })

    if (existingEnrollment) {
      throw new Error('Student is already enrolled in this interview course')
    }

    return await this.prisma.interviewCourseEnrollment.create({
      data: {
        studentId: data.studentId,
        interviewCourseId: data.interviewCourseId,
        progressPercent: 0,
        isCompleted: false
      },
      include: {
        interviewCourse: {
          select: { id: true, title: true, style: true }
        },
        student: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })
  }

  async findById(id: string, includeProgress: boolean = false) {
    const enrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: { id },
      include: {
        interviewCourse: {
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

    return await this.prisma.interviewCourseEnrollment.findMany({
      where: {
        studentId,
        ...(options.completedOnly ? { isCompleted: true } : {})
      },
      include: {
        interviewCourse: {
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

  async findByStudentAndInterviewCourse(studentId: string, interviewCourseId: string) {
    const enrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: {
        studentId_interviewCourseId: { studentId, interviewCourseId }
      },
      include: {
        interviewCourse: {
          include: {
            interviewCourseSections: {
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

    // Check if student has active interview subscription to this course
    const activeSubscription = await this.prisma.interviewSubscription.findFirst({
      where: {
        studentId,
        interviewCourseId,
        isActive: true,
        endDate: { gte: new Date() }
      }
    })

    // Calculate detailed progress
    const totalSubsections = enrollment.interviewCourse.interviewCourseSections.reduce(
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
    return await this.prisma.interviewCourseEnrollment.update({
      where: { id },
      data: { lastAccessedAt: new Date() }
    })
  }

  async recalculateProgress(enrollmentId: string) {
    const enrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        interviewCourse: {
          include: {
            interviewCourseSections: {
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

    const totalSubsections = enrollment.interviewCourse.interviewCourseSections.reduce(
      (sum, section) => sum + section.subsections.length, 0
    )
    const completedSubsections = enrollment.subsectionProgress.filter(
      p => p.isCompleted
    ).length

    const progressPercent = totalSubsections > 0
      ? Math.round((completedSubsections / totalSubsections) * 100)
      : 0
    const isCompleted = progressPercent === 100

    return await this.prisma.interviewCourseEnrollment.update({
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

    await this.prisma.interviewCourseEnrollment.delete({
      where: { id }
    })

    return { success: true, deletedEnrollment: enrollment }
  }
}
