import { PrismaClient } from '@prisma/client'

export class StudentCasePracticeService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Toggle bookmark status for a case
   */
  async toggleBookmark(studentId: string, courseCaseId: string, isBookmarked: boolean) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })
    if (!student) {
      throw new Error('Student not found')
    }

    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })
    if (!courseCase) {
      throw new Error('Course case not found')
    }

    // Upsert the record
    const result = await this.prisma.studentCasePractice.upsert({
      where: {
        studentId_courseCaseId: { studentId, courseCaseId }
      },
      update: {
        isBookmarked,
        bookmarkedAt: isBookmarked ? new Date() : null
      },
      create: {
        studentId,
        courseCaseId,
        isBookmarked,
        bookmarkedAt: isBookmarked ? new Date() : null,
        isPracticed: false,
        practiceCount: 0
      }
    })

    return {
      message: isBookmarked ? 'Case bookmarked successfully' : 'Bookmark removed successfully',
      studentStatus: {
        isPracticed: result.isPracticed,
        practiceCount: result.practiceCount,
        firstPracticedAt: result.firstPracticedAt,
        lastPracticedAt: result.lastPracticedAt,
        isBookmarked: result.isBookmarked,
        bookmarkedAt: result.bookmarkedAt
      }
    }
  }

  /**
   * Update practice status when a simulation is completed
   */
  async updatePracticeStatus(studentId: string, courseCaseId: string) {
    const now = new Date()

    const result = await this.prisma.studentCasePractice.upsert({
      where: {
        studentId_courseCaseId: { studentId, courseCaseId }
      },
      update: {
        isPracticed: true,
        practiceCount: { increment: 1 },
        lastPracticedAt: now
      },
      create: {
        studentId,
        courseCaseId,
        isPracticed: true,
        practiceCount: 1,
        firstPracticedAt: now,
        lastPracticedAt: now,
        isBookmarked: false
      }
    })

    return result
  }

  /**
   * Get student status for a specific case
   */
  async getStudentStatus(studentId: string, courseCaseId: string) {
    const status = await this.prisma.studentCasePractice.findUnique({
      where: {
        studentId_courseCaseId: { studentId, courseCaseId }
      }
    })

    if (!status) {
      return null
    }

    return {
      isPracticed: status.isPracticed,
      practiceCount: status.practiceCount,
      firstPracticedAt: status.firstPracticedAt,
      lastPracticedAt: status.lastPracticedAt,
      isBookmarked: status.isBookmarked,
      bookmarkedAt: status.bookmarkedAt
    }
  }

  /**
   * Get all student statuses for cases in a course
   */
  async getStudentStatusesForCourse(studentId: string, courseId: string) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })
    if (!student) {
      throw new Error('Student not found')
    }

    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    })
    if (!course) {
      throw new Error('Course not found')
    }

    // Get all case IDs for this course
    const courseCases = await this.prisma.courseCase.findMany({
      where: { courseId },
      select: { id: true }
    })
    const courseCaseIds = courseCases.map(c => c.id)

    // Get all student statuses for these cases
    const statuses = await this.prisma.studentCasePractice.findMany({
      where: {
        studentId,
        courseCaseId: { in: courseCaseIds }
      }
    })

    // Return as a map keyed by courseCaseId
    const statusMap: Record<string, {
      isPracticed: boolean
      practiceCount: number
      firstPracticedAt: Date | null
      lastPracticedAt: Date | null
      isBookmarked: boolean
      bookmarkedAt: Date | null
    }> = {}

    for (const status of statuses) {
      statusMap[status.courseCaseId] = {
        isPracticed: status.isPracticed,
        practiceCount: status.practiceCount,
        firstPracticedAt: status.firstPracticedAt,
        lastPracticedAt: status.lastPracticedAt,
        isBookmarked: status.isBookmarked,
        bookmarkedAt: status.bookmarkedAt
      }
    }

    return statusMap
  }

  /**
   * Get all bookmarked cases for a student
   */
  async getBookmarkedCases(studentId: string, courseId?: string) {
    const whereCondition: any = {
      studentId,
      isBookmarked: true
    }

    if (courseId) {
      whereCondition.courseCase = {
        courseId
      }
    }

    const bookmarks = await this.prisma.studentCasePractice.findMany({
      where: whereCondition,
      include: {
        courseCase: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                exam: {
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
      orderBy: {
        bookmarkedAt: 'desc'
      }
    })

    return bookmarks
  }

  /**
   * Get practice statistics for a student
   */
  async getPracticeStats(studentId: string, courseId?: string) {
    const whereCondition: any = {
      studentId
    }

    if (courseId) {
      whereCondition.courseCase = {
        courseId
      }
    }

    const [total, practiced, bookmarked] = await Promise.all([
      this.prisma.studentCasePractice.count({ where: whereCondition }),
      this.prisma.studentCasePractice.count({
        where: { ...whereCondition, isPracticed: true }
      }),
      this.prisma.studentCasePractice.count({
        where: { ...whereCondition, isBookmarked: true }
      })
    ])

    return {
      total,
      practiced,
      notPracticed: total - practiced,
      bookmarked
    }
  }
}
