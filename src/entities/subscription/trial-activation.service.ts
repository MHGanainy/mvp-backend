import { PrismaClient, ResourceType, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
import { randomUUID } from 'crypto';
import { emailService } from '../../services/email.service';

export class TrialActivationService {
  constructor(private prisma: PrismaClient) {}

  async activateTrial(studentId: string, pricingPlanId: string) {
    // 1. Fetch student
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });
    if (!student) throw new Error('Student not found');

    // 2. Fetch plan — must be active free trial
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id: pricingPlanId },
    });
    if (!plan) throw new Error('Pricing plan not found');
    if (!plan.isActive) throw new Error('This pricing plan is no longer available');
    if (!plan.isFreeTrialPlan) throw new Error('This plan is not a free trial plan');
    if (!plan.durationMonths && !plan.durationHours) throw new Error('Free trial plan must have a duration');

    // 3. Verify resource exists and is published
    const resourceTitle = await this.getResourceTitle(plan.resourceType, plan.resourceId);

    // 4. Check eligibility — any existing subscription = not eligible
    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        studentId,
        resourceType: plan.resourceType,
        resourceId: plan.resourceId,
      },
    });
    if (existingSub) {
      throw new Error('Free trials are only available for first-time access');
    }

    // 5. Calculate dates
    const now = new Date();
    const startDate = now;
    let endDate: Date;
    if (plan.durationHours) {
      endDate = new Date(now.getTime() + plan.durationHours * 60 * 60 * 1000);
    } else {
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + (plan.durationMonths || 1));
    }

    // 6. Transaction: Payment + Subscription + Credits
    const result = await this.prisma.$transaction(async (tx) => {
      // 6a. Create Payment (amount=0, synthetic stripePaymentId)
      const payment = await tx.payment.create({
        data: {
          studentId,
          stripePaymentId: `free-trial-${randomUUID()}`,
          amount: 0,
          currency: 'GBP',
          paymentType: 'SUBSCRIPTION',
          paymentStatus: 'COMPLETED',
          pricingPlanId: plan.id,
          courseId: plan.resourceType === 'COURSE' ? plan.resourceId : undefined,
        },
      });

      // 6b. Create Subscription
      const subscription = await tx.subscription.create({
        data: {
          studentId,
          courseId: plan.resourceType === 'COURSE' ? plan.resourceId : null,
          paymentId: payment.id,
          durationMonths: plan.durationMonths || null,
          durationHours: plan.durationHours || null,
          startDate,
          endDate,
          isActive: true,
          resourceType: plan.resourceType,
          resourceId: plan.resourceId,
          pricingPlanId: plan.id,
          subscriptionSource: 'FREE_TRIAL',
          isFreeTrial: true,
        },
      });

      // 6c. Grant credits if included
      if (plan.creditsIncluded && plan.creditsIncluded > 0) {
        const currentStudent = await tx.student.findUnique({
          where: { id: studentId },
          select: { creditBalance: true },
        });

        if (currentStudent) {
          const newBalance = currentStudent.creditBalance + plan.creditsIncluded;

          await tx.creditTransaction.create({
            data: {
              studentId,
              transactionType: CreditTransactionType.CREDIT,
              amount: plan.creditsIncluded,
              balanceAfter: newBalance,
              sourceType: CreditTransactionSource.SUBSCRIPTION,
              sourceId: subscription.id,
              description: `${plan.name} — ${plan.creditsIncluded} credits included`,
              expiresAt: endDate,
              metadata: {
                pricingPlanId: plan.id,
                planName: plan.name,
                isFreeTrial: true,
              },
            },
          });

          await tx.student.update({
            where: { id: studentId },
            data: { creditBalance: newBalance },
          });
        }
      }

      return { payment, subscription };
    });

    // 7. Auto-enroll (non-critical)
    try {
      await this.autoEnroll(studentId, plan.resourceType, plan.resourceId);
    } catch (err) {
      console.error('Failed to auto-enroll (non-critical):', err);
    }

    // 8. Send confirmation email (non-critical)
    try {
      const studentName = `${student.firstName} ${student.lastName}`;
      await emailService.sendSubscriptionConfirmation(
        student.user.email,
        studentName,
        plan.name,
        0,
        plan.durationMonths,
        plan.creditsIncluded || 0,
        startDate,
        endDate,
        plan.durationHours,
      );
    } catch (err) {
      console.error('Failed to send trial confirmation email (non-critical):', err);
    }

    return {
      message: 'Free trial activated successfully',
      subscription: {
        id: result.subscription.id,
        resourceType: plan.resourceType,
        resourceId: plan.resourceId,
        resourceTitle,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isFreeTrial: true,
        durationMonths: plan.durationMonths,
        durationHours: plan.durationHours,
      },
      trialPlan: {
        id: plan.id,
        name: plan.name,
        creditsIncluded: plan.creditsIncluded,
      },
    };
  }

  private async getResourceTitle(resourceType: ResourceType, resourceId: string): Promise<string> {
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { title: true, isPublished: true },
      });
      if (!course) throw new Error('Course not found');
      if (!course.isPublished) throw new Error('This course is not currently available');
      return course.title;
    }

    if (resourceType === 'INTERVIEW_COURSE') {
      const ic = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { title: true, isPublished: true },
      });
      if (!ic) throw new Error('Interview course not found');
      if (!ic.isPublished) throw new Error('This interview course is not currently available');
      return ic.title;
    }

    if (resourceType === 'BUNDLE') {
      const exam = await this.prisma.exam.findUnique({
        where: { id: resourceId },
        select: { title: true, isActive: true },
      });
      if (!exam) throw new Error('Exam not found');
      if (!exam.isActive) throw new Error('This exam is not currently available');
      return exam.title;
    }

    throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  private async autoEnroll(studentId: string, resourceType: ResourceType, resourceId: string): Promise<void> {
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { style: true },
      });

      if (course?.style === 'STRUCTURED') {
        const existing = await this.prisma.courseEnrollment.findUnique({
          where: { studentId_courseId: { studentId, courseId: resourceId } },
        });

        if (!existing) {
          await this.prisma.courseEnrollment.create({
            data: { studentId, courseId: resourceId },
          });
        }
      }
    } else if (resourceType === 'INTERVIEW_COURSE') {
      const ic = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { style: true },
      });

      if (ic?.style === 'STRUCTURED') {
        const existing = await this.prisma.interviewCourseEnrollment.findUnique({
          where: { studentId_interviewCourseId: { studentId, interviewCourseId: resourceId } },
        });

        if (!existing) {
          await this.prisma.interviewCourseEnrollment.create({
            data: { studentId, interviewCourseId: resourceId },
          });
        }
      }
    } else if (resourceType === 'BUNDLE') {
      const structuredCourses = await this.prisma.course.findMany({
        where: { examId: resourceId, style: 'STRUCTURED', isPublished: true },
        select: { id: true },
      });

      if (structuredCourses.length > 0) {
        const courseIds = structuredCourses.map(c => c.id);
        const existingEnrollments = await this.prisma.courseEnrollment.findMany({
          where: { studentId, courseId: { in: courseIds } },
          select: { courseId: true },
        });
        const enrolledIds = new Set(existingEnrollments.map(e => e.courseId));
        const toEnroll = courseIds.filter(id => !enrolledIds.has(id));

        if (toEnroll.length > 0) {
          await this.prisma.courseEnrollment.createMany({
            data: toEnroll.map(courseId => ({ studentId, courseId })),
            skipDuplicates: true,
          });
        }
      }
    }
  }
}
