// src/entities/subscription/subscription.service.ts
import { PrismaClient, Prisma, PaymentStatus, CreditTransactionType, CreditTransactionSource } from '@prisma/client'
import { CreateSubscriptionInput } from './subscription.schema'

export class SubscriptionService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateSubscriptionInput) {
    // Verify the student exists and check if admin
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
      include: {
        user: true // Include user to check isAdmin
      }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Admin doesn't need subscriptions
    if (student.user.isAdmin) {
      throw new Error('Admin users do not require subscriptions')
    }

    // Verify the course exists and get pricing/credit info
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      include: {
        exam: true
      }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    if (!course.isPublished) {
      throw new Error('Course is not published')
    }

    // Check if student already has an active subscription to this course
    const existingActiveSubscription = await this.checkActiveSubscription(data.studentId, data.courseId)
    if (existingActiveSubscription) {
      throw new Error('Student already has an active subscription to this course')
    }

    // Get pricing and credits based on duration
    const pricing = this.getCoursePricing(course, data.durationMonths)
    
    // Calculate subscription dates
    const startDate = new Date()
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + data.durationMonths)

    // Create subscription with payment and complimentary credits in a transaction
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create mock payment record
      const payment = await tx.payment.create({
        data: {
          studentId: data.studentId,
          stripePaymentId: data.mockPaymentId,
          amount: pricing.price,
          currency: 'USD',
          paymentType: 'SUBSCRIPTION',
          paymentStatus: PaymentStatus.COMPLETED,
          courseId: data.courseId,
          subscriptionDuration: data.durationMonths,
          creditsAmount: null // Credits are tracked separately
        }
      })

      // Create subscription
      const subscription = await tx.subscription.create({
        data: {
          studentId: data.studentId,
          courseId: data.courseId,
          paymentId: payment.id,
          durationMonths: data.durationMonths,
          startDate: startDate,
          endDate: endDate,
          isActive: true
        },
        include: {
          course: {
            include: {
              exam: {
                select: {
                  id: true,
                  title: true,
                  slug: true
                }
              }
            }
          },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      })

      // Add complimentary credits
      await tx.student.update({
        where: { id: data.studentId },
        data: {
          creditBalance: {
            increment: pricing.credits
          }
        }
      })

      // Create credit transaction record
      await tx.creditTransaction.create({
        data: {
          studentId: data.studentId,
          transactionType: CreditTransactionType.CREDIT,
          amount: pricing.credits,
          balanceAfter: student.creditBalance + pricing.credits,
          sourceType: CreditTransactionSource.SUBSCRIPTION,
          sourceId: subscription.id,
          description: `Complimentary credits for ${data.durationMonths}-month subscription to ${course.title}`,
          expiresAt: endDate // Credits expire with subscription
        }
      })

      return subscription
    })
  }

  async findAll(query?: { active?: boolean; includeExpired?: boolean }) {
    const where: any = {}
    
    if (query?.active !== undefined) {
      where.isActive = query.active
    }
    
    if (!query?.includeExpired) {
      where.endDate = { gte: new Date() }
    }

    return await this.prisma.subscription.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        course: {
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                slug: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findById(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        course: {
          include: {
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
    })

    if (!subscription) {
      throw new Error('Subscription not found')
    }

    return subscription
  }

  async findByStudent(studentId: string, query?: { active?: boolean; includeExpired?: boolean }) {
    // Verify student exists and check if admin
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true
      }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Admin doesn't have subscriptions - return empty or virtual subscriptions
    if (student.user.isAdmin) {
      // Could optionally return virtual "all access" subscriptions for UI consistency
      return []
    }

    const where: any = { studentId }
    
    if (query?.active !== undefined) {
      where.isActive = query.active
    }
    
    if (!query?.includeExpired) {
      where.endDate = { gte: new Date() }
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where,
      include: {
        course: {
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                slug: true
              }
            }
          }
        }
      },
      orderBy: {
        endDate: 'desc'
      }
    })

    // Update isActive status based on dates
    return subscriptions.map((sub:any) => ({
      ...sub,
      isActive: this.isSubscriptionActive(sub)
    }))
  }

  async findByCourse(courseId: string, query?: { active?: boolean }) {
    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    const where: any = { courseId }
    
    if (query?.active !== undefined) {
      where.isActive = query.active
    } else {
      // Default to only active subscriptions
      where.endDate = { gte: new Date() }
    }

    return await this.prisma.subscription.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async checkSubscription(studentId: string, courseId: string) {
    // Check if student is admin
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Admin has access to everything
    if (student.user.isAdmin) {
      return {
        hasActiveSubscription: true,
        subscription: {
          id: 'admin-access',
          studentId: studentId,
          courseId: courseId,
          isActive: true,
          startDate: new Date(2020, 0, 1), // Arbitrary past date
          endDate: new Date(2099, 11, 31), // Far future date
          durationMonths: 999,
          isAdmin: true
        },
        daysRemaining: 99999,
        isExpired: false,
        isAdmin: true
      }
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        studentId,
        courseId,
        endDate: { gte: new Date() }
      },
      include: {
        course: {
          include: {
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
    })

    if (!subscription) {
      return {
        hasActiveSubscription: false,
        subscription: undefined,
        daysRemaining: 0,
        isExpired: true,
        isAdmin: false
      }
    }

    const daysRemaining = Math.ceil((subscription.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    const isActive = this.isSubscriptionActive(subscription)

    return {
      hasActiveSubscription: isActive,
      subscription: {
        ...subscription,
        isActive
      },
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isExpired: !isActive,
      isAdmin: false
    }
  }

  async checkActiveSubscription(studentId: string, courseId: string): Promise<boolean> {
    const result = await this.checkSubscription(studentId, courseId)
    return result.hasActiveSubscription
  }

  async getStudentStats(studentId: string) {
    // Verify student exists and check if admin
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Admin stats
    if (student.user.isAdmin) {
      return {
        studentId,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        expiredSubscriptions: 0,
        totalCreditsReceived: 999999,
        subscriptionsByDuration: {
          threeMonth: 0,
          sixMonth: 0,
          twelveMonth: 0
        },
        isAdmin: true,
        message: 'Admin has unlimited access to all courses'
      }
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where: { studentId }
    })

    const now = new Date()
    const activeSubscriptions = subscriptions.filter((sub:any) => 
      sub.endDate >= now && sub.startDate <= now
    )

    const expiredSubscriptions = subscriptions.filter((sub:any) => 
      sub.endDate < now
    )

    // Get total credits received from subscriptions
    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: {
        studentId,
        sourceType: CreditTransactionSource.SUBSCRIPTION,
        transactionType: CreditTransactionType.CREDIT
      }
    })

    const totalCreditsReceived = creditTransactions.reduce((sum:any, t:any) => sum + t.amount, 0)

    // Count by duration
    const subscriptionsByDuration = {
      threeMonth: subscriptions.filter((s:any) => s.durationMonths === 3).length,
      sixMonth: subscriptions.filter((s:any) => s.durationMonths === 6).length,
      twelveMonth: subscriptions.filter((s:any) => s.durationMonths === 12).length
    }

    return {
      studentId,
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: activeSubscriptions.length,
      expiredSubscriptions: expiredSubscriptions.length,
      totalCreditsReceived,
      subscriptionsByDuration,
      isAdmin: false
    }
  }

  async updateSubscriptionStatus() {
    // This method can be called periodically to update isActive status
    const now = new Date()
    
    // Deactivate expired subscriptions
    await this.prisma.subscription.updateMany({
      where: {
        endDate: { lt: now },
        isActive: true
      },
      data: {
        isActive: false
      }
    })

    // Activate subscriptions that should be active
    await this.prisma.subscription.updateMany({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
        isActive: false
      },
      data: {
        isActive: true
      }
    })
  }

  // Helper methods

  private getCoursePricing(course: any, durationMonths: number) {
    switch (durationMonths) {
      case 3:
        return {
          price: course.price3Months,
          credits: course.credits3Months
        }
      case 6:
        return {
          price: course.price6Months,
          credits: course.credits6Months
        }
      case 12:
        return {
          price: course.price12Months,
          credits: course.credits12Months
        }
      default:
        throw new Error('Invalid subscription duration')
    }
  }

  private isSubscriptionActive(subscription: any): boolean {
    const now = new Date()
    return subscription.startDate <= now && subscription.endDate >= now
  }

  // Method to check if student can access course content - UPDATED for admin
  async canAccessCourseContent(studentId: string, courseId: string): Promise<boolean> {
    // Check if student is admin
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })
    
    if (student?.user.isAdmin) {
      return true // Admin has access to everything
    }

    // Check if the course case is free first
    const courseCase = await this.prisma.courseCase.findFirst({
      where: { courseId }
    })

    if (courseCase?.isFree) {
      return true // Free content is always accessible
    }

    // Check subscription
    return await this.checkActiveSubscription(studentId, courseId)
  }

  // Method to get all courses a student has access to - UPDATED for admin
  async getAccessibleCourses(studentId: string) {
    // Check if student is admin
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (student?.user.isAdmin) {
      // Admin has access to all published courses
      const allPublishedCourses = await this.prisma.course.findMany({
        where: { isPublished: true },
        select: { id: true }
      })
      return allPublishedCourses.map((c:any) => c.id)
    }

    const activeSubscriptions = await this.findByStudent(studentId, { active: true })
    
    const subscribedCourseIds = activeSubscriptions.map((sub:any) => sub.courseId)
    
    // Also get courses with free content
    const coursesWithFreeContent = await this.prisma.course.findMany({
      where: {
        courseCases: {
          some: {
            isFree: true
          }
        },
        isPublished: true
      },
      select: {
        id: true
      }
    })

    const freeCourseIds = coursesWithFreeContent.map((c:any) => c.id)
    
    // Combine and deduplicate
    const accessibleCourseIds = [...new Set([...subscribedCourseIds, ...freeCourseIds])]
    
    return accessibleCourseIds
  }
}