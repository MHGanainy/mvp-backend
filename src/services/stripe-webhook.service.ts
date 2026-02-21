import { PrismaClient, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
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

  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    this.log.info({ eventType: event.type, eventId: event.id }, 'Processing webhook event');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        this.log.info({ sessionId: session.id }, 'Checkout session completed');
        await this.fulfillCredits(session.id);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        this.log.info({ sessionId: session.id }, 'Checkout session expired');
        await this.handleExpiredSession(session.id);
        break;
      }

      default:
        this.log.info({ eventType: event.type }, 'Unhandled webhook event type');
    }
  }
}
