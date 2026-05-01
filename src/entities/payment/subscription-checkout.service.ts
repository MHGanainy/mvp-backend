import { PrismaClient, ResourceType, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
import { StripeService } from '../../services/stripe.service';
import { PromoCodeService } from '../promo-code/promo-code.service';
import { randomUUID } from 'crypto';
import { emailService } from '../../services/email.service';

export class SubscriptionCheckoutService {
  private stripeService: StripeService;
  private promoCodeService: PromoCodeService;

  constructor(private prisma: PrismaClient) {
    this.stripeService = new StripeService();
    this.promoCodeService = new PromoCodeService(prisma);
  }

  async createSubscriptionCheckoutSession(studentId: string, pricingPlanId: string, promoCode?: string) {
    // 1. Fetch student + user
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // 2. Fetch pricing plan
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id: pricingPlanId },
    });

    if (!plan) {
      throw new Error('Pricing plan not found');
    }

    if (!plan.isActive) {
      throw new Error('This pricing plan is no longer available');
    }

    if (plan.isFreeTrialPlan) {
      throw new Error('Free trial plans cannot be purchased through checkout');
    }

    if (!plan.durationMonths && !plan.durationHours) {
      throw new Error('Pricing plan must have a duration');
    }

    // 3. Validate resource exists and is published — get title
    const resourceTitle = await this.getResourceTitle(plan.resourceType, plan.resourceId);

    // 4. Promo code validation (if provided)
    let promoValidation: { promoCodeId: string; finalPriceInCents: number; discountAmountInCents: number } | null = null;
    if (promoCode) {
      const result = await this.promoCodeService.validate(promoCode, pricingPlanId, studentId);
      if (!result.valid) {
        throw new Error(`Promo code invalid: ${result.reason}`);
      }
      promoValidation = {
        promoCodeId: result.promoCodeId!,
        finalPriceInCents: result.finalPriceInCents!,
        discountAmountInCents: result.discountAmountInCents!,
      };
    }

    const unitAmount = promoValidation ? promoValidation.finalPriceInCents : plan.priceInCents;

    // 5. If 100% discount, bypass Stripe and fulfill directly
    if (unitAmount === 0 && promoValidation) {
      return this.fulfillFreePromoCheckout(student, plan, resourceTitle, promoValidation);
    }

    // 6. Get or create Stripe customer (same pattern as stripe-checkout.service.ts)
    let stripeCustomerId = student.stripeCustomerId;

    if (stripeCustomerId) {
      const existingCustomer = await this.stripeService.validateCustomer(stripeCustomerId);
      if (!existingCustomer) {
        console.log(`Stripe customer ${stripeCustomerId} not found in current environment, creating new customer`);
        stripeCustomerId = null;
      }
    }

    if (!stripeCustomerId) {
      const stripeCustomer = await this.stripeService.createCustomer({
        email: student.user.email,
        name: `${student.firstName} ${student.lastName}`,
        metadata: {
          studentId: student.id,
          userId: student.userId.toString(),
        },
      });

      stripeCustomerId = stripeCustomer.id;

      await this.prisma.student.update({
        where: { id: studentId },
        data: { stripeCustomerId },
      });
    }

    // 7. Calculate session expiry (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 8. Create Stripe Checkout Session
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const checkoutSession = await this.stripeService.createCheckoutSession({
      customer: stripeCustomerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `${resourceTitle} — ${plan.name}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
      cancel_url: `${frontendUrl}/checkout/cancel?type=subscription`,
      metadata: {
        type: 'subscription',
        studentId,
        pricingPlanId,
        resourceType: plan.resourceType,
        resourceId: plan.resourceId,
        ...(promoValidation && { promoCodeId: promoValidation.promoCodeId }),
      },
      allow_promotion_codes: promoValidation ? false : true,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });

    // 9. Save checkout session to database
    const savedSession = await this.prisma.subscriptionCheckoutSession.create({
      data: {
        sessionId: checkoutSession.id,
        studentId,
        pricingPlanId,
        resourceType: plan.resourceType,
        resourceId: plan.resourceId,
        status: 'PENDING',
        amountInCents: plan.priceInCents,
        durationMonths: plan.durationMonths || null,
        durationHours: plan.durationHours || null,
        creditsIncluded: plan.creditsIncluded || 0,
        expiresAt,
        metadata: {
          stripeCustomerId,
          checkoutUrl: checkoutSession.url,
        },
        ...(promoValidation && {
          promoCodeId: promoValidation.promoCodeId,
          discountAmountInCents: promoValidation.discountAmountInCents,
          finalAmountInCents: promoValidation.finalPriceInCents,
        }),
      },
    });

    return {
      sessionId: checkoutSession.id,
      sessionUrl: checkoutSession.url,
      expiresAt: savedSession.expiresAt,
      amount: plan.priceInCents,
      durationMonths: plan.durationMonths || null,
      durationHours: plan.durationHours || null,
      creditsIncluded: plan.creditsIncluded || 0,
      resourceType: plan.resourceType,
      resourceTitle,
    };
  }

  // 100% discount: bypass Stripe entirely, fulfill subscription directly.
  // Uses the same subscription upsert pattern as fulfillSubscription in stripe-webhook.service.ts.
  private async fulfillFreePromoCheckout(
    student: { id: string; firstName: string; lastName: string; user: { email: string } },
    plan: {
      id: string; name: string; resourceType: ResourceType; resourceId: string;
      durationMonths: number | null; durationHours: number | null;
      creditsIncluded: number | null; priceInCents: number;
    },
    resourceTitle: string,
    promo: { promoCodeId: string; discountAmountInCents: number; finalPriceInCents: number },
  ) {
    const studentId = student.id;
    const now = new Date();

    // Check for existing subscription (same upsert logic as webhook's fulfillSubscription)
    const existingSub = await this.prisma.subscription.findFirst({
      where: { studentId, resourceType: plan.resourceType, resourceId: plan.resourceId },
      orderBy: { endDate: 'desc' },
    });

    const extendDate = (base: Date) => {
      const d = new Date(base);
      if (plan.durationMonths) {
        d.setMonth(d.getMonth() + plan.durationMonths);
      } else if (plan.durationHours) {
        d.setTime(d.getTime() + plan.durationHours * 60 * 60 * 1000);
      }
      return d;
    };

    let startDate: Date;
    let endDate: Date;

    if (existingSub && existingSub.endDate >= now) {
      // Active subscription — extend from existing endDate
      startDate = existingSub.startDate;
      endDate = extendDate(existingSub.endDate);
    } else {
      // No subscription or expired — start fresh
      startDate = now;
      endDate = extendDate(now);
    }

    const syntheticSessionId = `promo-free-${randomUUID()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment (amount=0, synthetic stripePaymentId)
      const payment = await tx.payment.create({
        data: {
          studentId,
          stripePaymentId: syntheticSessionId,
          amount: 0,
          currency: 'GBP',
          paymentType: 'SUBSCRIPTION',
          paymentStatus: 'COMPLETED',
          pricingPlanId: plan.id,
          courseId: plan.resourceType === 'COURSE' ? plan.resourceId : undefined,
        },
      });

      // 2. Create or update subscription (upsert pattern from webhook fulfillSubscription)
      if (existingSub) {
        const durationMonths = plan.durationMonths;
        const durationHours = plan.durationHours;
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            endDate,
            startDate,
            durationMonths: durationMonths
              ? (existingSub.endDate >= now
                  ? (existingSub.durationMonths || 0) + durationMonths
                  : durationMonths)
              : null,
            durationHours: durationHours
              ? (existingSub.endDate >= now
                  ? (existingSub.durationHours || 0) + durationHours
                  : durationHours)
              : null,
            isActive: true,
            pricingPlanId: plan.id,
            resourceType: plan.resourceType,
            resourceId: plan.resourceId,
            subscriptionSource: 'DIRECT_PURCHASE',
          },
        });
      } else {
        await tx.subscription.create({
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
            subscriptionSource: 'DIRECT_PURCHASE',
          },
        });
      }

      // 3. Grant credits if included
      const creditsIncluded = plan.creditsIncluded || 0;
      if (creditsIncluded > 0) {
        const currentStudent = await tx.student.findUnique({
          where: { id: studentId },
          select: { creditBalance: true },
        });

        if (currentStudent) {
          const newBalance = currentStudent.creditBalance + creditsIncluded;

          await tx.creditTransaction.create({
            data: {
              studentId,
              transactionType: CreditTransactionType.CREDIT,
              amount: creditsIncluded,
              balanceAfter: newBalance,
              sourceType: CreditTransactionSource.SUBSCRIPTION,
              sourceId: syntheticSessionId,
              description: `${plan.name} — ${creditsIncluded} credits included`,
              expiresAt: endDate,
              metadata: {
                pricingPlanId: plan.id,
                planName: plan.name,
                isPromoFree: true,
              },
            },
          });

          await tx.student.update({
            where: { id: studentId },
            data: { creditBalance: newBalance },
          });
        }
      }

      // 4. Create checkout session record (status = COMPLETED immediately)
      await tx.subscriptionCheckoutSession.create({
        data: {
          sessionId: syntheticSessionId,
          studentId,
          pricingPlanId: plan.id,
          resourceType: plan.resourceType,
          resourceId: plan.resourceId,
          status: 'COMPLETED',
          amountInCents: plan.priceInCents,
          durationMonths: plan.durationMonths || null,
          durationHours: plan.durationHours || null,
          creditsIncluded: plan.creditsIncluded || 0,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          completedAt: now,
          promoCodeId: promo.promoCodeId,
          discountAmountInCents: promo.discountAmountInCents,
          finalAmountInCents: 0,
        },
      });

      // 5. Record promo code redemption + increment usage
      await tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promo.promoCodeId,
          studentId,
          paymentId: payment.id,
          amountSaved: promo.discountAmountInCents,
        },
      });
      await tx.promoCode.update({
        where: { id: promo.promoCodeId },
        data: { currentUses: { increment: 1 } },
      });

      return { payment };
    });

    // Auto-enroll (non-critical)
    try {
      await this.autoEnroll(studentId, plan.resourceType, plan.resourceId);
    } catch (err) {
      console.error('Failed to auto-enroll (non-critical):', err);
    }

    // Send confirmation email (non-critical)
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
      console.error('Failed to send promo confirmation email (non-critical):', err);
    }

    return {
      sessionId: null,
      sessionUrl: null,
      subscriptionActivated: true,
      expiresAt: null,
      amount: 0,
      durationMonths: plan.durationMonths || null,
      durationHours: plan.durationHours || null,
      creditsIncluded: plan.creditsIncluded || 0,
      resourceType: plan.resourceType,
      resourceTitle,
    };
  }

  async getSubscriptionCheckoutStatus(sessionId: string) {
    const session = await this.prisma.subscriptionCheckoutSession.findUnique({
      where: { sessionId },
      include: {
        pricingPlan: {
          select: {
            name: true,
            description: true,
            durationMonths: true,
            durationHours: true,
            creditsIncluded: true,
            resourceType: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Checkout session not found');
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      amountInCents: session.amountInCents,
      durationMonths: session.durationMonths,
      durationHours: session.durationHours,
      creditsIncluded: session.creditsIncluded,
      resourceType: session.resourceType,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      plan: session.pricingPlan,
      createdAt: session.createdAt,
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
      const interviewCourse = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { title: true, isPublished: true },
      });
      if (!interviewCourse) throw new Error('Interview course not found');
      if (!interviewCourse.isPublished) throw new Error('This interview course is not currently available');
      return interviewCourse.title;
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
      // Enroll in all published STRUCTURED courses under this exam
      const structuredCourses = await this.prisma.course.findMany({
        where: { examId: resourceId, isPublished: true, style: 'STRUCTURED' },
        select: { id: true },
      });

      if (structuredCourses.length === 0) return;

      // Fetch existing enrollments in one query to avoid N+1
      const existingEnrollments = await this.prisma.courseEnrollment.findMany({
        where: {
          studentId,
          courseId: { in: structuredCourses.map(c => c.id) },
        },
        select: { courseId: true },
      });

      const alreadyEnrolled = new Set(existingEnrollments.map(e => e.courseId));
      const toEnroll = structuredCourses.filter(c => !alreadyEnrolled.has(c.id));

      if (toEnroll.length > 0) {
        await this.prisma.courseEnrollment.createMany({
          data: toEnroll.map(c => ({ studentId, courseId: c.id })),
        });
      }
    }
  }
}
