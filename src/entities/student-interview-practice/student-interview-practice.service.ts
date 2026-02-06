import { PrismaClient } from '@prisma/client'

export class StudentInterviewPracticeService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Toggle bookmark status for an interview case
   */
  async toggleBookmark(studentId: string, interviewCaseId: string, isBookmarked: boolean) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })
    if (!student) {
      throw new Error('Student not found')
    }

    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })
    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Upsert the record
    const result = await this.prisma.studentInterviewPractice.upsert({
      where: {
        studentId_interviewCaseId: { studentId, interviewCaseId }
      },
      update: {
        isBookmarked,
        bookmarkedAt: isBookmarked ? new Date() : null
      },
      create: {
        studentId,
        interviewCaseId,
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
   * Update practice status when an interview simulation is completed
   */
  async updatePracticeStatus(studentId: string, interviewCaseId: string) {
    const now = new Date()

    const result = await this.prisma.studentInterviewPractice.upsert({
      where: {
        studentId_interviewCaseId: { studentId, interviewCaseId }
      },
      update: {
        isPracticed: true,
        practiceCount: { increment: 1 },
        lastPracticedAt: now
      },
      create: {
        studentId,
        interviewCaseId,
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
   * Get student status for a specific interview case
   */
  async getStudentStatus(studentId: string, interviewCaseId: string) {
    const status = await this.prisma.studentInterviewPractice.findUnique({
      where: {
        studentId_interviewCaseId: { studentId, interviewCaseId }
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
   * Get all student statuses for interview cases in an interview course
   */
  async getStudentStatusesForCourse(studentId: string, interviewCourseId: string) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId }
    })
    if (!student) {
      throw new Error('Student not found')
    }

    // Verify interview course exists
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: interviewCourseId }
    })
    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    // Get all interview case IDs for this course
    const interviewCases = await this.prisma.interviewCase.findMany({
      where: { interviewCourseId },
      select: { id: true }
    })
    const interviewCaseIds = interviewCases.map(c => c.id)

    // Get all student statuses for these cases
    const statuses = await this.prisma.studentInterviewPractice.findMany({
      where: {
        studentId,
        interviewCaseId: { in: interviewCaseIds }
      }
    })

    // Return as a map keyed by interviewCaseId
    const statusMap: Record<string, {
      isPracticed: boolean
      practiceCount: number
      firstPracticedAt: Date | null
      lastPracticedAt: Date | null
      isBookmarked: boolean
      bookmarkedAt: Date | null
    }> = {}

    for (const status of statuses) {
      statusMap[status.interviewCaseId] = {
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
   * Get all bookmarked interview cases for a student
   */
  async getBookmarkedCases(studentId: string, interviewCourseId?: string) {
    const whereCondition: any = {
      studentId,
      isBookmarked: true
    }

    if (interviewCourseId) {
      whereCondition.interviewCase = {
        interviewCourseId
      }
    }

    const bookmarks = await this.prisma.studentInterviewPractice.findMany({
      where: whereCondition,
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              select: {
                id: true,
                title: true,
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            },
            interviewCaseSpecialties: {
              include: {
                specialty: true
              }
            },
            interviewCaseCurriculums: {
              include: {
                curriculum: true
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
  async getPracticeStats(studentId: string, interviewCourseId?: string) {
    const whereCondition: any = {
      studentId
    }

    if (interviewCourseId) {
      whereCondition.interviewCase = {
        interviewCourseId
      }
    }

    const [total, practiced, bookmarked] = await Promise.all([
      this.prisma.studentInterviewPractice.count({ where: whereCondition }),
      this.prisma.studentInterviewPractice.count({
        where: { ...whereCondition, isPracticed: true }
      }),
      this.prisma.studentInterviewPractice.count({
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
