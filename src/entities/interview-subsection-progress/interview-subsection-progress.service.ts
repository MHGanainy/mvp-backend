import { PrismaClient } from '@prisma/client'
import {
  StartInterviewSubsectionProgressInput,
  UpdateInterviewSubsectionProgressInput,
  CompleteInterviewSubsectionInput
} from './interview-subsection-progress.schema'

export class InterviewSubsectionProgressService {
  constructor(private prisma: PrismaClient) {}

  async start(data: StartInterviewSubsectionProgressInput) {
    // Verify enrollment exists
    const enrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: { id: data.enrollmentId },
      include: {
        interviewCourse: {
          include: {
            interviewCourseSections: {
              include: { subsections: true }
            }
          }
        }
      }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    // Verify subsection belongs to the enrolled interview course
    const allSubsections = enrollment.interviewCourse.interviewCourseSections.flatMap(s => s.subsections)
    const subsection = allSubsections.find(s => s.id === data.subsectionId)

    if (!subsection) {
      throw new Error('Subsection not found in enrolled interview course')
    }

    // Check if progress already exists
    const existingProgress = await this.prisma.interviewSubsectionProgress.findUnique({
      where: {
        enrollmentId_subsectionId: {
          enrollmentId: data.enrollmentId,
          subsectionId: data.subsectionId
        }
      }
    })

    if (existingProgress) {
      // Update last accessed and return existing
      return await this.prisma.interviewSubsectionProgress.update({
        where: { id: existingProgress.id },
        data: { lastAccessedAt: new Date() },
        include: {
          subsection: true,
          enrollment: {
            select: { id: true, interviewCourseId: true, studentId: true }
          }
        }
      })
    }

    // Create new progress
    return await this.prisma.interviewSubsectionProgress.create({
      data: {
        enrollmentId: data.enrollmentId,
        subsectionId: data.subsectionId,
        isStarted: true,
        startedAt: new Date(),
        lastAccessedAt: new Date()
      },
      include: {
        subsection: true,
        enrollment: {
          select: { id: true, interviewCourseId: true, studentId: true }
        }
      }
    })
  }

  async findById(id: string) {
    const progress = await this.prisma.interviewSubsectionProgress.findUnique({
      where: { id },
      include: {
        subsection: {
          include: {
            section: {
              select: { id: true, title: true, interviewCourseId: true }
            }
          }
        },
        enrollment: {
          select: { id: true, interviewCourseId: true, studentId: true }
        }
      }
    })

    if (!progress) {
      throw new Error('Progress not found')
    }

    return progress
  }

  async findByEnrollment(enrollmentId: string) {
    const enrollment = await this.prisma.interviewCourseEnrollment.findUnique({
      where: { id: enrollmentId }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    return await this.prisma.interviewSubsectionProgress.findMany({
      where: { enrollmentId },
      include: {
        subsection: {
          include: {
            section: {
              select: { id: true, title: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  }

  async update(id: string, data: UpdateInterviewSubsectionProgressInput) {
    await this.findById(id)

    return await this.prisma.interviewSubsectionProgress.update({
      where: { id },
      data: {
        timeSpentSeconds: data.timeSpentSeconds,
        quizScore: data.quizScore,
        lastAccessedAt: new Date()
      },
      include: {
        subsection: true,
        enrollment: {
          select: { id: true, interviewCourseId: true, studentId: true }
        }
      }
    })
  }

  async complete(id: string, data?: CompleteInterviewSubsectionInput) {
    const progress = await this.findById(id)

    if (progress.isCompleted) {
      throw new Error('Subsection already completed')
    }

    // Update progress to completed
    const updated = await this.prisma.interviewSubsectionProgress.update({
      where: { id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        timeSpentSeconds: data?.timeSpentSeconds ?? progress.timeSpentSeconds,
        quizScore: data?.quizScore,
        lastAccessedAt: new Date()
      },
      include: {
        subsection: true,
        enrollment: {
          select: { id: true, interviewCourseId: true, studentId: true }
        }
      }
    })

    // Recalculate enrollment progress
    await this.recalculateEnrollmentProgress(progress.enrollmentId)

    return updated
  }

  async uncomplete(id: string) {
    const progress = await this.findById(id)

    if (!progress.isCompleted) {
      throw new Error('Subsection is not completed')
    }

    // Update progress to uncompleted
    const updated = await this.prisma.interviewSubsectionProgress.update({
      where: { id },
      data: {
        isCompleted: false,
        completedAt: null,
        lastAccessedAt: new Date()
      },
      include: {
        subsection: true,
        enrollment: {
          select: { id: true, interviewCourseId: true, studentId: true }
        }
      }
    })

    // Recalculate enrollment progress
    await this.recalculateEnrollmentProgress(progress.enrollmentId)

    return updated
  }

  async recalculateEnrollmentProgress(enrollmentId: string) {
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
        completedAt: isCompleted ? new Date() : null,
        lastAccessedAt: new Date()
      }
    })
  }

  async addTimeSpent(id: string, seconds: number) {
    const progress = await this.findById(id)

    return await this.prisma.interviewSubsectionProgress.update({
      where: { id },
      data: {
        timeSpentSeconds: progress.timeSpentSeconds + seconds,
        lastAccessedAt: new Date()
      }
    })
  }
}
