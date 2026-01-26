import { PrismaClient, Prisma } from '@prisma/client'
import { CreateStudentInput, UpdateStudentInput } from './student.schema'

export class StudentService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateStudentInput) {
    // Create User and Student in a transaction
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First, create the User
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name
        }
      })

      // Then, create the Student linked to the User
      // Note: dateOfBirth is removed from the model
      const student = await tx.student.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          creditBalance: 0 // Always start with 0 credits
        },
        include: {
          user: true
        }
      })

      return student
    })
  }

  async findAll() {
    return await this.prisma.student.findMany({
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findById(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        user: true
      }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    return student
  }

  async findByUserId(userId: number) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      include: {
        user: true
      }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    return student
  }

  async update(id: string, data: UpdateStudentInput) {
    // Check if exists first
    await this.findById(id)

    // Filter out dateOfBirth if it's provided (for backward compatibility)
    const updateData: any = {
      firstName: data.firstName,
      lastName: data.lastName
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })

    return await this.prisma.student.update({
      where: { id },
      data: updateData,
      include: {
        user: true
      }
    })
  }

  async delete(id: string) {
    // Check if exists first
    const student = await this.findById(id)

    // Delete in transaction (Student first, then User)
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.student.delete({
        where: { id }
      })

      await tx.user.delete({
        where: { id: student.userId }
      })
    })
  }

  // CREDIT MANAGEMENT BUSINESS LOGIC

  async addCredits(userId: number, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive')
    }

    const student = await this.findByUserId(userId)
    
    return await this.prisma.student.update({
      where: { userId },
      data: {
        creditBalance: student.creditBalance + amount
      },
      include: {
        user: true
      }
    })
  }

  async deductCredits(userId: number, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive')
    }

    const student = await this.findByUserId(userId)
    
    if (student.creditBalance < amount) {
      throw new Error('Insufficient credits')
    }

    return await this.prisma.student.update({
      where: { userId },
      data: {
        creditBalance: student.creditBalance - amount
      },
      include: {
        user: true
      }
    })
  }

  // NEW METHOD: Set credits to a specific value
  async setCredits(userId: number, amount: number, reason?: string) {
    if (amount < 0) {
      throw new Error('Credit amount cannot be negative')
    }

    // Verify student exists
    await this.findByUserId(userId)
    
    return await this.prisma.student.update({
      where: { userId },
      data: {
        creditBalance: amount
      },
      include: {
        user: true
      }
    })
  }

  async getCreditBalance(userId: number): Promise<number> {
    const student = await this.findByUserId(userId)
    return student.creditBalance
  }

  async checkSufficientCredits(userId: number, requiredAmount: number): Promise<boolean> {
    const balance = await this.getCreditBalance(userId)
    return balance >= requiredAmount
  }

  // QUICK ACCESS: Get recently used exams and courses (last 6 months)
  async getQuickAccess(studentId: string) {
    // Calculate date 6 months ago
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    // Get all simulation attempts from the last 6 months
    const recentAttempts = await this.prisma.simulationAttempt.findMany({
      where: {
        studentId,
        startedAt: {
          gte: sixMonthsAgo
        }
      },
      include: {
        simulation: {
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      }
    })

    // Get all course enrollments accessed in last 6 months
    const recentEnrollments = await this.prisma.courseEnrollment.findMany({
      where: {
        studentId,
        lastAccessedAt: {
          gte: sixMonthsAgo
        }
      },
      include: {
        course: {
          include: {
            exam: true
          }
        }
      },
      orderBy: {
        lastAccessedAt: 'desc'
      }
    })

    // Extract unique exams
    const examMap = new Map()
    const courseMap = new Map()

    // Process simulation attempts
    recentAttempts.forEach(attempt => {
      const exam = attempt.simulation.courseCase.course.exam
      const course = attempt.simulation.courseCase.course

      // Add exam if not already in map
      if (!examMap.has(exam.id)) {
        examMap.set(exam.id, {
          id: exam.id,
          title: exam.title,
          slug: exam.slug,
          lastUsed: attempt.startedAt,
          usageCount: 1
        })
      } else {
        // Increment usage count
        const existingExam = examMap.get(exam.id)
        existingExam.usageCount += 1
      }

      // Add course if not already in map
      if (!courseMap.has(course.id)) {
        // Generate courseSlug from title
        const courseSlug = course.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        courseMap.set(course.id, {
          id: course.id,
          title: course.title,
          slug: courseSlug,
          style: course.style,
          examId: course.examId,
          examTitle: exam.title,
          examSlug: exam.slug,
          lastUsed: attempt.startedAt,
          usageCount: 1
        })
      } else {
        // Increment usage count
        const existingCourse = courseMap.get(course.id)
        existingCourse.usageCount += 1
      }
    })

    // Process course enrollments (for structured courses or courses browsed without simulations)
    recentEnrollments.forEach(enrollment => {
      const exam = enrollment.course.exam
      const course = enrollment.course

      // Add exam if not already in map
      if (!examMap.has(exam.id)) {
        examMap.set(exam.id, {
          id: exam.id,
          title: exam.title,
          slug: exam.slug,
          lastUsed: enrollment.lastAccessedAt!,
          usageCount: 1
        })
      }
      // Note: Don't increment count if already exists from simulations

      // Add course if not already in map
      if (!courseMap.has(course.id)) {
        // Generate courseSlug from title
        const courseSlug = course.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        courseMap.set(course.id, {
          id: course.id,
          title: course.title,
          slug: courseSlug,
          style: course.style,
          examId: course.examId,
          examTitle: exam.title,
          examSlug: exam.slug,
          lastUsed: enrollment.lastAccessedAt!,
          usageCount: 1
        })
      }
      // Note: Don't increment count if already exists from simulations
    })

    // Convert maps to arrays and sort by last used (most recent first)
    const topExams = Array.from(examMap.values()).sort((a, b) =>
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    )

    const topCourses = Array.from(courseMap.values()).sort((a, b) =>
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    )

    return {
      topExams,
      topCourses
    }
  }
}