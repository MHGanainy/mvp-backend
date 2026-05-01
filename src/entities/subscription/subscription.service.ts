// src/entities/subscription/subscription.service.ts
import { PrismaClient, CreditTransactionType, CreditTransactionSource, ResourceType } from '@prisma/client'

export class SubscriptionService {
  constructor(private prisma: PrismaClient) {}

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

  private isSubscriptionActive(subscription: any): boolean {
    const now = new Date()
    return subscription.startDate <= now && subscription.endDate >= now
  }

  // Get all courses a student has an active subscription to (direct or via bundle)
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

    const now = new Date()

    const [courseSubscriptions, bundleSubscriptions] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { studentId, isActive: true, endDate: { gte: now }, resourceType: 'COURSE' },
        select: { resourceId: true }
      }),
      this.prisma.subscription.findMany({
        where: { studentId, isActive: true, endDate: { gte: now }, resourceType: 'BUNDLE' },
        select: { resourceId: true }
      })
    ])

    const directCourseIds = courseSubscriptions.map(s => s.resourceId)

    if (bundleSubscriptions.length === 0) return directCourseIds

    const examIds = bundleSubscriptions.map(s => s.resourceId)
    const bundleCourses = await this.prisma.course.findMany({
      where: { examId: { in: examIds }, isPublished: true },
      select: { id: true }
    })

    return [...new Set([...directCourseIds, ...bundleCourses.map(c => c.id)])]
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

    const now = new Date()
    const subscriptions = await this.prisma.subscription.findMany({
      where: { studentId, isActive: true, endDate: { gte: now } },
      select: { resourceType: true, resourceId: true }
    })

    const directCourseIds = subscriptions.filter(s => s.resourceType === 'COURSE').map(s => s.resourceId)
    const interviewCourseIds = subscriptions.filter(s => s.resourceType === 'INTERVIEW_COURSE').map(s => s.resourceId)
    const bundleExamIds = subscriptions.filter(s => s.resourceType === 'BUNDLE').map(s => s.resourceId)

    if (bundleExamIds.length === 0) {
      return { courses: directCourseIds, interviewCourses: interviewCourseIds }
    }

    const bundleCourses = await this.prisma.course.findMany({
      where: { examId: { in: bundleExamIds }, isPublished: true },
      select: { id: true }
    })

    return {
      courses: [...new Set([...directCourseIds, ...bundleCourses.map(c => c.id)])],
      interviewCourses: interviewCourseIds
    }
  }

  async checkTrialEligibility(studentId: string, resourceType: string, resourceId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    })
    if (!student) throw new Error('Student not found')

    if (student.user.isAdmin) {
      return { eligible: false, reason: 'Admin users have full access' }
    }

    // Any subscription row = not eligible (first-touch only)
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        studentId,
        resourceType: resourceType as ResourceType,
        resourceId,
      }
    })

    if (existingSubscription) {
      if (existingSubscription.isFreeTrial && existingSubscription.endDate >= new Date()) {
        return { eligible: false, reason: 'You already have an active free trial for this resource' }
      }
      if (existingSubscription.isFreeTrial) {
        return { eligible: false, reason: 'You have already used your free trial for this resource' }
      }
      if (existingSubscription.endDate >= new Date()) {
        return { eligible: false, reason: 'You already have an active subscription for this resource' }
      }
      return { eligible: false, reason: 'Free trials are only available for first-time access' }
    }

    // Check if a free trial plan exists for this resource
    const trialPlan = await this.prisma.pricingPlan.findFirst({
      where: {
        resourceType: resourceType as ResourceType,
        resourceId,
        isFreeTrialPlan: true,
        isActive: true,
      }
    })

    if (!trialPlan) {
      return { eligible: false, reason: 'No free trial available for this resource' }
    }

    return {
      eligible: true,
      trialPlan: {
        id: trialPlan.id,
        name: trialPlan.name,
        durationMonths: trialPlan.durationMonths,
        durationHours: trialPlan.durationHours,
        creditsIncluded: trialPlan.creditsIncluded,
      }
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

    // PRIMARY: check exam-level bundle subscription first
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { examId: true }
      })

      if (course?.examId) {
        const bundleSubscription = await this.prisma.subscription.findFirst({
          where: {
            studentId,
            resourceType: 'BUNDLE' as ResourceType,
            resourceId: course.examId,
            endDate: { gte: new Date() }
          },
          include: { pricingPlan: true },
          orderBy: { endDate: 'desc' }
        })

        if (bundleSubscription && this.isSubscriptionActive(bundleSubscription)) {
          const now = new Date()
          const daysRemaining = Math.ceil(
            (bundleSubscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
          return {
            hasActiveSubscription: true,
            daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
            hoursRemaining: null,
            isExpired: false,
            isAdmin: false,
            subscription: {
              id: bundleSubscription.id,
              resourceType: bundleSubscription.resourceType,
              resourceId: bundleSubscription.resourceId,
              startDate: bundleSubscription.startDate.toISOString(),
              endDate: bundleSubscription.endDate.toISOString(),
              durationMonths: bundleSubscription.durationMonths,
              isFreeTrial: bundleSubscription.isFreeTrial,
              subscriptionSource: bundleSubscription.subscriptionSource,
              pricingPlan: bundleSubscription.pricingPlan ? {
                id: bundleSubscription.pricingPlan.id,
                name: bundleSubscription.pricingPlan.name,
                priceInCents: bundleSubscription.pricingPlan.priceInCents
              } : null
            }
          }
        }
      }
    }

    // FALLBACK: check granular course/resource-level subscription
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
      // Check if user ever had a subscription for this resource (including expired ones)
      const anyPastSubscription = await this.prisma.subscription.findFirst({
        where: {
          studentId,
          resourceType: resourceType as ResourceType,
          resourceId,
        },
        orderBy: { endDate: 'desc' }
      })

      return {
        hasActiveSubscription: false,
        daysRemaining: 0,
        hoursRemaining: null,
        isExpired: !!anyPastSubscription,
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

    // Batch-fetch resource titles (3 queries in parallel, no N+1)
    const courseIds = subscriptions
      .filter(s => s.resourceType === 'COURSE')
      .map(s => s.resourceId)
    const interviewCourseIds = subscriptions
      .filter(s => s.resourceType === 'INTERVIEW_COURSE')
      .map(s => s.resourceId)
    const examIds = subscriptions
      .filter(s => s.resourceType === 'BUNDLE')
      .map(s => s.resourceId)

    const [courses, interviewCourses, exams] = await Promise.all([
      courseIds.length > 0
        ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [],
      interviewCourseIds.length > 0
        ? this.prisma.interviewCourse.findMany({ where: { id: { in: interviewCourseIds } }, select: { id: true, title: true } })
        : [],
      examIds.length > 0
        ? this.prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true } })
        : []
    ])

    const titleMap = new Map<string, string>()
    courses.forEach(c => titleMap.set(c.id, c.title))
    interviewCourses.forEach(ic => titleMap.set(ic.id, ic.title))
    exams.forEach(e => titleMap.set(e.id, e.title))

    const now = new Date()
    return subscriptions.map(sub => ({
      id: sub.id,
      resourceType: sub.resourceType,
      resourceId: sub.resourceId,
      resourceTitle: titleMap.get(sub.resourceId) || 'Unknown',
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
      durationMonths: sub.durationMonths,
      durationHours: sub.durationHours,
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