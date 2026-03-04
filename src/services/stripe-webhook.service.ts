import { PrismaClient, CreditTransactionType, CreditTransactionSource, ResourceType } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import { StripeService } from './stripe.service';
import { emailService } from './email.service';
import Stripe from 'stripe';

export class StripeWebhookService {
  private stripeService: StripeService;

  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {
    this.stripeService = new StripeService();
  }

  verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    try {
      return this.stripeService.constructWebhookEvent(payload, signature, webhookSecret);
    } catch (error) {
      throw new Error(`Webhook signature verification failed: ${error}`);
    }
  }

  async checkIdempotency(eventId: string): Promise<boolean> {
    const existingEvent = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId },
    });

    return existingEvent !== null;
  }

  async recordWebhookEvent(eventId: string, eventType: string, payload: any): Promise<void> {
    await this.prisma.stripeWebhookEvent.create({
      data: {
        eventId,
        eventType,
        payload,
        processed: true,
      },
    });
  }

  async fulfillCredits(sessionId: string): Promise<void> {
    const checkoutSession = await this.prisma.stripeCheckoutSession.findUnique({
      where: { sessionId },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        creditPackage: true,
      },
    });

    if (!checkoutSession) {
      throw new Error(`Checkout session not found: ${sessionId}`);
    }

    if (checkoutSession.status === 'COMPLETED') {
      this.log.info({ sessionId }, 'Session already fulfilled, skipping');
      return;
    }

    if (checkoutSession.status !== 'PENDING') {
      throw new Error(`Session ${sessionId} has status ${checkoutSession.status}, cannot fulfill`);
    }

    const creditsToAdd = checkoutSession.creditsQuantity;
    const studentId = checkoutSession.studentId;

    this.log.info({ creditsToAdd, studentId }, 'Fulfilling credits');

    await this.prisma.$transaction(async (tx) => {
      // 1. Get current student balance
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: { creditBalance: true },
      });

      if (!student) {
        throw new Error(`Student not found: ${studentId}`);
      }

      const newBalance = student.creditBalance + creditsToAdd;

      // 2. Create credit transaction record
      await tx.creditTransaction.create({
        data: {
          studentId,
          transactionType: CreditTransactionType.CREDIT,
          amount: creditsToAdd,
          balanceAfter: newBalance,
          sourceType: CreditTransactionSource.PURCHASE,
          sourceId: sessionId,
          description: `Purchased ${checkoutSession.creditPackage.name} (${creditsToAdd} credits)`,
          metadata: {
            stripeSessionId: sessionId,
            creditPackageId: checkoutSession.creditPackageId,
            packageName: checkoutSession.creditPackage.name,
            amountPaid: checkoutSession.amountInCents,
            currency: 'GBP',
          },
        },
      });

      // 3. Update student credit balance
      await tx.student.update({
        where: { id: studentId },
        data: { creditBalance: newBalance },
      });

      // 4. Update checkout session status
      await tx.stripeCheckoutSession.update({
        where: { sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      this.log.info({ creditsToAdd, newBalance, studentId }, 'Credits added successfully');
    });

    try {
      const studentName = `${checkoutSession.student.firstName} ${checkoutSession.student.lastName}`;
      await emailService.sendCreditPurchaseConfirmation(
        checkoutSession.student.user.email,
        studentName,
        creditsToAdd,
        checkoutSession.amountInCents,
        checkoutSession.creditPackage.name
      );
      this.log.info({ email: checkoutSession.student.user.email }, 'Confirmation email sent');
    } catch (emailError) {
      this.log.error({ err: emailError }, 'Failed to send confirmation email (non-critical)');
    }
  }

  async handleExpiredSession(sessionId: string): Promise<void> {
    const checkoutSession = await this.prisma.stripeCheckoutSession.findUnique({
      where: { sessionId },
    });

    if (!checkoutSession) {
      this.log.warn({ sessionId }, 'Checkout session not found for expiry');
      return;
    }

    if (checkoutSession.status === 'PENDING') {
      await this.prisma.stripeCheckoutSession.update({
        where: { sessionId },
        data: { status: 'EXPIRED' },
      });

      this.log.info({ sessionId }, 'Session marked as expired');
    }
  }

  async fulfillSubscription(sessionId: string): Promise<void> {
    const checkoutSession = await this.prisma.subscriptionCheckoutSession.findUnique({
      where: { sessionId },
      include: {
        student: {
          include: { user: true },
        },
        pricingPlan: true,
      },
    });

    if (!checkoutSession) {
      throw new Error(`Subscription checkout session not found: ${sessionId}`);
    }

    if (checkoutSession.status === 'COMPLETED') {
      this.log.info({ sessionId }, 'Subscription session already fulfilled, skipping');
      return;
    }

    if (checkoutSession.status !== 'PENDING') {
      throw new Error(`Session ${sessionId} has status ${checkoutSession.status}, cannot fulfill`);
    }

    const { studentId, resourceType, resourceId, durationMonths, creditsIncluded, pricingPlanId } = checkoutSession;
    const now = new Date();

    this.log.info({ studentId, resourceType, resourceId, durationMonths }, 'Fulfilling subscription');

    // Check for existing subscription
    const existingSub = await this.prisma.subscription.findFirst({
      where: { studentId, resourceType, resourceId },
      orderBy: { endDate: 'desc' },
    });

    let startDate: Date;
    let endDate: Date;

    if (existingSub && existingSub.endDate >= now) {
      // Active subscription — extend from existing endDate
      startDate = existingSub.startDate;
      endDate = new Date(existingSub.endDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
    } else {
      // No subscription or expired — start fresh
      startDate = now;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + durationMonths);
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Create payment record
      await tx.payment.create({
        data: {
          studentId,
          stripePaymentId: sessionId,
          amount: checkoutSession.amountInCents / 100,
          currency: 'GBP',
          paymentType: 'SUBSCRIPTION',
          paymentStatus: 'COMPLETED',
          pricingPlanId,
          courseId: resourceType === 'COURSE' ? resourceId : undefined,
        },
      });

      // 2. Create or update subscription
      if (existingSub && existingSub.endDate >= now) {
        // Extend active subscription
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            endDate,
            durationMonths: existingSub.durationMonths + durationMonths,
            isActive: true,
            pricingPlanId,
            resourceType,
            resourceId,
            subscriptionSource: 'DIRECT_PURCHASE',
          },
        });
      } else {
        // Create new subscription — need a unique paymentId, use the payment we just created
        const payment = await tx.payment.findUnique({
          where: { stripePaymentId: sessionId },
        });

        await tx.subscription.create({
          data: {
            studentId,
            courseId: resourceType === 'COURSE' ? resourceId : null,
            paymentId: payment!.id,
            durationMonths,
            startDate,
            endDate,
            isActive: true,
            resourceType,
            resourceId,
            pricingPlanId,
            subscriptionSource: 'DIRECT_PURCHASE',
          },
        });
      }

      // 3. Add credits if included
      if (creditsIncluded > 0) {
        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: { creditBalance: true },
        });

        if (student) {
          const newBalance = student.creditBalance + creditsIncluded;

          await tx.creditTransaction.create({
            data: {
              studentId,
              transactionType: CreditTransactionType.CREDIT,
              amount: creditsIncluded,
              balanceAfter: newBalance,
              sourceType: CreditTransactionSource.SUBSCRIPTION,
              sourceId: sessionId,
              description: `${checkoutSession.pricingPlan.name} — ${creditsIncluded} credits included`,
              expiresAt: endDate,
              metadata: {
                stripeSessionId: sessionId,
                pricingPlanId,
                planName: checkoutSession.pricingPlan.name,
                currency: 'GBP',
              },
            },
          });

          await tx.student.update({
            where: { id: studentId },
            data: { creditBalance: newBalance },
          });
        }
      }

      // 4. Update checkout session status
      await tx.subscriptionCheckoutSession.update({
        where: { sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      this.log.info({ studentId, resourceType, resourceId, durationMonths, endDate }, 'Subscription fulfilled successfully');
    });

    // Auto-enroll (non-critical)
    try {
      await this.autoEnroll(studentId, resourceType, resourceId);
    } catch (enrollError) {
      this.log.error({ err: enrollError }, 'Failed to auto-enroll (non-critical)');
    }

    // Send confirmation email (non-critical)
    try {
      const studentName = `${checkoutSession.student.firstName} ${checkoutSession.student.lastName}`;
      await emailService.sendSubscriptionConfirmation(
        checkoutSession.student.user.email,
        studentName,
        checkoutSession.pricingPlan.name,
        checkoutSession.amountInCents,
        durationMonths,
        creditsIncluded,
        startDate,
        endDate,
      );
      this.log.info({ email: checkoutSession.student.user.email }, 'Subscription confirmation email sent');
    } catch (emailError) {
      this.log.error({ err: emailError }, 'Failed to send subscription confirmation email (non-critical)');
    }
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
          this.log.info({ studentId, courseId: resourceId }, 'Auto-enrolled in course');
        }
      }
    } else if (resourceType === 'INTERVIEW_COURSE') {
      const interviewCourse = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { style: true },
      });

      if (interviewCourse?.style === 'STRUCTURED') {
        const existing = await this.prisma.interviewCourseEnrollment.findUnique({
          where: { studentId_interviewCourseId: { studentId, interviewCourseId: resourceId } },
        });

        if (!existing) {
          await this.prisma.interviewCourseEnrollment.create({
            data: { studentId, interviewCourseId: resourceId },
          });
          this.log.info({ studentId, interviewCourseId: resourceId }, 'Auto-enrolled in interview course');
        }
      }
    }
  }

  async handleExpiredSubscriptionSession(sessionId: string): Promise<void> {
    const checkoutSession = await this.prisma.subscriptionCheckoutSession.findUnique({
      where: { sessionId },
    });

    if (!checkoutSession) {
      this.log.warn({ sessionId }, 'Subscription checkout session not found for expiry');
      return;
    }

    if (checkoutSession.status === 'PENDING') {
      await this.prisma.subscriptionCheckoutSession.update({
        where: { sessionId },
        data: { status: 'EXPIRED' },
      });

      this.log.info({ sessionId }, 'Subscription session marked as expired');
    }
  }

  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    this.log.info({ eventType: event.type, eventId: event.id }, 'Processing webhook event');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        this.log.info({ sessionId: session.id, metadata: session.metadata }, 'Checkout session completed');

        if (session.metadata?.type === 'subscription') {
          await this.fulfillSubscription(session.id);
        } else {
          await this.fulfillCredits(session.id);
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        this.log.info({ sessionId: session.id, metadata: session.metadata }, 'Checkout session expired');

        if (session.metadata?.type === 'subscription') {
          await this.handleExpiredSubscriptionSession(session.id);
        } else {
          await this.handleExpiredSession(session.id);
        }
        break;
      }

      default:
        this.log.info({ eventType: event.type }, 'Unhandled webhook event type');
    }
  }
}
