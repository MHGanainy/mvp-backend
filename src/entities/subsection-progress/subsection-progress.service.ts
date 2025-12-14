import { PrismaClient } from '@prisma/client'
import {
  StartSubsectionProgressInput,
  UpdateSubsectionProgressInput,
  CompleteSubsectionInput
} from './subsection-progress.schema'

export class SubsectionProgressService {
  constructor(private prisma: PrismaClient) {}

  async start(data: StartSubsectionProgressInput) {
    // Verify enrollment exists
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { id: data.enrollmentId },
      include: {
        course: {
          include: {
            courseSections: {
              include: { subsections: true }
            }
          }
        }
      }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    // Verify subsection belongs to the enrolled course
    const allSubsections = enrollment.course.courseSections.flatMap(s => s.subsections)
    const subsection = allSubsections.find(s => s.id === data.subsectionId)

    if (!subsection) {
      throw new Error('Subsection not found in enrolled course')
    }

    // Check if progress already exists
    const existingProgress = await this.prisma.subsectionProgress.findUnique({
      where: {
        enrollmentId_subsectionId: {
          enrollmentId: data.enrollmentId,
          subsectionId: data.subsectionId
        }
      }
    })

    if (existingProgress) {
      // Update last accessed and return existing
      return await this.prisma.subsectionProgress.update({
        where: { id: existingProgress.id },
        data: { lastAccessedAt: new Date() },
        include: {
          subsection: true,
          enrollment: {
            select: { id: true, courseId: true, studentId: true }
          }
        }
      })
    }

    // Check sequential access (optional - can be enforced or not)
    // For now, we allow any subsection to be started

    // Create new progress
    return await this.prisma.subsectionProgress.create({
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
          select: { id: true, courseId: true, studentId: true }
        }
      }
    })
  }

  async findById(id: string) {
    const progress = await this.prisma.subsectionProgress.findUnique({
      where: { id },
      include: {
        subsection: {
          include: {
            section: {
              select: { id: true, title: true, courseId: true }
            }
          }
        },
        enrollment: {
          select: { id: true, courseId: true, studentId: true }
        }
      }
    })

    if (!progress) {
      throw new Error('Progress not found')
    }

    return progress
  }

  async findByEnrollment(enrollmentId: string) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { id: enrollmentId }
    })

    if (!enrollment) {
      throw new Error('Enrollment not found')
    }

    return await this.prisma.subsectionProgress.findMany({
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

  async update(id: string, data: UpdateSubsectionProgressInput) {
    await this.findById(id)

    return await this.prisma.subsectionProgress.update({
      where: { id },
      data: {
        timeSpentSeconds: data.timeSpentSeconds,
        quizScore: data.quizScore,
        lastAccessedAt: new Date()
      },
      include: {
        subsection: true,
        enrollment: {
          select: { id: true, courseId: true, studentId: true }
        }
      }
    })
  }

  async complete(id: string, data?: CompleteSubsectionInput) {
    const progress = await this.findById(id)

    if (progress.isCompleted) {
      throw new Error('Subsection already completed')
    }

    // Update progress to completed
    const updated = await this.prisma.subsectionProgress.update({
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
          select: { id: true, courseId: true, studentId: true }
        }
      }
    })

    // Recalculate enrollment progress
    await this.recalculateEnrollmentProgress(progress.enrollmentId)

    return updated
  }

  async recalculateEnrollmentProgress(enrollmentId: string) {
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
        completedAt: isCompleted ? new Date() : null,
        lastAccessedAt: new Date()
      }
    })
  }

  async addTimeSpent(id: string, seconds: number) {
    const progress = await this.findById(id)

    return await this.prisma.subsectionProgress.update({
      where: { id },
      data: {
        timeSpentSeconds: progress.timeSpentSeconds + seconds,
        lastAccessedAt: new Date()
      }
    })
  }
}
