// src/entities/subscription/subscription.service.ts
import { PrismaClient, Prisma, PaymentStatus, CreditTransactionType, CreditTransactionSource, ResourceType } from '@prisma/client'
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
          isActive: true,
          resourceType: 'COURSE',
          resourceId: data.courseId,
          subscriptionSource: 'DIRECT_PURCHASE'
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
        },
        pricingPlan: true
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
    return this.checkSubscriptionByResource(studentId, 'COURSE', courseId)
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

  // Check if student can access course content (admin → case-level isFree → subscription)
  async canAccessCourseContent(studentId: string, courseId: string): Promise<boolean> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (student?.user.isAdmin) return true

    // Check isFree at case level (existing behavior)
    const courseCase = await this.prisma.courseCase.findFirst({
      where: { courseId }
    })
    if (courseCase?.isFree) return true

    // Delegate subscription check to unified method
    const result = await this.canAccessResource(studentId, 'COURSE', courseId)
    return result.hasAccess
  }

  // Check if student can access interview course content (admin → case-level isFree → subscription)
  async canAccessInterviewCourseContent(
    studentId: string,
    interviewCourseId: string,
    caseId?: string
  ): Promise<boolean> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (!student) throw new Error('Student not found')
    if (student.user.isAdmin) return true

    // Check isFree at case level
    if (caseId) {
      const interviewCase = await this.prisma.interviewCase.findFirst({
        where: { id: caseId, interviewCourseId, isFree: true }
      })
      if (interviewCase) return true
    } else {
      const freeCase = await this.prisma.interviewCase.findFirst({
        where: { interviewCourseId, isFree: true }
      })
      if (freeCase) return true
    }

    // Delegate subscription check to unified method
    const result = await this.canAccessResource(studentId, 'INTERVIEW_COURSE', interviewCourseId)
    return result.hasAccess
  }

  // Get all courses a student has an active subscription to
  async getAccessibleCourses(studentId: string): Promise<string[]> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (student?.user.isAdmin) {
      const courses = await this.prisma.course.findMany({
        where: { isPublished: true },
        select: { id: true }
      })
      return courses.map(c => c.id)
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where: { studentId, isActive: true, endDate: { gte: new Date() }, resourceType: 'COURSE' },
      select: { resourceId: true }
    })

    return subscriptions.map(s => s.resourceId)
  }

  // Get all resources (courses + interview courses) a student has active subscriptions to
  async getAccessibleResources(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })

    if (!student) throw new Error('Student not found')

    if (student.user.isAdmin) {
      const [courses, interviewCourses] = await Promise.all([
        this.prisma.course.findMany({ where: { isPublished: true }, select: { id: true } }),
        this.prisma.interviewCourse.findMany({ where: { isPublished: true }, select: { id: true } })
      ])
      return {
        courses: courses.map(c => c.id),
        interviewCourses: interviewCourses.map(ic => ic.id)
      }
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where: { studentId, isActive: true, endDate: { gte: new Date() } },
      select: { resourceType: true, resourceId: true }
    })

    return {
      courses: subscriptions.filter(s => s.resourceType === 'COURSE').map(s => s.resourceId),
      interviewCourses: subscriptions.filter(s => s.resourceType === 'INTERVIEW_COURSE').map(s => s.resourceId)
    }
  }

  // Core unified subscription check — all other check methods delegate to this
  async checkSubscriptionByResource(
    studentId: string,
    resourceType: string,
    resourceId: string
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })
    if (!student) throw new Error('Student not found')

    // Admin bypass
    if (student.user.isAdmin) {
      return {
        hasActiveSubscription: true,
        daysRemaining: 99999,
        hoursRemaining: null,
        isExpired: false,
        isAdmin: true,
        subscription: null
      }
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        studentId,
        resourceType: resourceType as ResourceType,
        resourceId,
        endDate: { gte: new Date() }
      },
      include: { pricingPlan: true },
      orderBy: { endDate: 'desc' }
    })

    if (!subscription) {
      return {
        hasActiveSubscription: false,
        daysRemaining: 0,
        hoursRemaining: null,
        isExpired: true,
        isAdmin: false,
        subscription: null
      }
    }

    const now = new Date()
    const daysRemaining = Math.ceil(
      (subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      hasActiveSubscription: this.isSubscriptionActive(subscription),
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      hoursRemaining: null,
      isExpired: !this.isSubscriptionActive(subscription),
      isAdmin: false,
      subscription: {
        id: subscription.id,
        resourceType: subscription.resourceType,
        resourceId: subscription.resourceId,
        startDate: subscription.startDate.toISOString(),
        endDate: subscription.endDate.toISOString(),
        durationMonths: subscription.durationMonths,
        isFreeTrial: subscription.isFreeTrial,
        subscriptionSource: subscription.subscriptionSource,
        pricingPlan: subscription.pricingPlan ? {
          id: subscription.pricingPlan.id,
          name: subscription.pricingPlan.name,
          priceInCents: subscription.pricingPlan.priceInCents
        } : null
      }
    }
  }

  // Unified resource-level access check — subscription + admin only, no isFree
  async canAccessResource(
    studentId: string,
    resourceType: string,
    resourceId: string
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })
    if (!student) throw new Error('Student not found')

    // Admin bypass
    if (student.user.isAdmin) {
      return { hasAccess: true, accessReason: 'ADMIN' as const, subscription: null }
    }

    // Check subscription
    const result = await this.checkSubscriptionByResource(studentId, resourceType, resourceId)
    if (result.hasActiveSubscription) {
      return { hasAccess: true, accessReason: 'SUBSCRIPTION' as const, subscription: result.subscription }
    }

    return { hasAccess: false, accessReason: null, subscription: null }
  }

  // Unified subscription list — returns all types with resource titles
  async findAllByStudent(studentId: string, query?: { active?: boolean; includeExpired?: boolean }) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })
    if (!student) throw new Error('Student not found')
    if (student.user.isAdmin) return []

    const where: any = { studentId }
    if (query?.active !== undefined) where.isActive = query.active
    if (!query?.includeExpired) where.endDate = { gte: new Date() }

    const subscriptions = await this.prisma.subscription.findMany({
      where,
      include: { pricingPlan: true },
      orderBy: { endDate: 'desc' }
    })

    // Batch-fetch resource titles (2 queries, no N+1)
    const courseIds = subscriptions
      .filter(s => s.resourceType === 'COURSE')
      .map(s => s.resourceId)
    const interviewCourseIds = subscriptions
      .filter(s => s.resourceType === 'INTERVIEW_COURSE')
      .map(s => s.resourceId)

    const [courses, interviewCourses] = await Promise.all([
      courseIds.length > 0
        ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [],
      interviewCourseIds.length > 0
        ? this.prisma.interviewCourse.findMany({ where: { id: { in: interviewCourseIds } }, select: { id: true, title: true } })
        : []
    ])

    const titleMap = new Map<string, string>()
    courses.forEach(c => titleMap.set(c.id, c.title))
    interviewCourses.forEach(ic => titleMap.set(ic.id, ic.title))

    const now = new Date()
    return subscriptions.map(sub => ({
      id: sub.id,
      resourceType: sub.resourceType,
      resourceId: sub.resourceId,
      resourceTitle: titleMap.get(sub.resourceId) || 'Unknown',
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
      durationMonths: sub.durationMonths,
      isActive: this.isSubscriptionActive(sub),
      isFreeTrial: sub.isFreeTrial,
      subscriptionSource: sub.subscriptionSource,
      daysRemaining: sub.endDate > now
        ? Math.ceil((sub.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      isExpired: sub.endDate < now,
      pricingPlan: sub.pricingPlan ? {
        id: sub.pricingPlan.id,
        name: sub.pricingPlan.name,
        priceInCents: sub.pricingPlan.priceInCents
      } : null
    }))
  }
}