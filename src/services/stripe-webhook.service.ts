// src/services/stripe-webhook.service.ts
import { PrismaClient, CreditTransactionType, CreditTransactionSource } from '@prisma/client';
import { StripeService } from './stripe.service';
import { emailService } from './email.service';
import Stripe from 'stripe';

export class StripeWebhookService {
  private stripeService: StripeService;

  constructor(private prisma: PrismaClient) {
    this.stripeService = new StripeService();
  }

  /**
   * Verify webhook signature
   * Throws error if signature is invalid
   */
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

  /**
   * Check if webhook event has already been processed (idempotency)
   */
  async checkIdempotency(eventId: string): Promise<boolean> {
    const existingEvent = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId },
    });

    return existingEvent !== null;
  }

  /**
   * Record webhook event for idempotency and audit trail
   */
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

  /**
   * Fulfill credits after successful payment
   * Uses Prisma transaction for atomicity
   */
  async fulfillCredits(sessionId: string): Promise<void> {
    // Retrieve checkout session
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

    // Check if already fulfilled
    if (checkoutSession.status === 'COMPLETED') {
      console.log(`⏩ Session ${sessionId} already fulfilled, skipping`);
      return;
    }

    // Verify session is in PENDING status
    if (checkoutSession.status !== 'PENDING') {
      throw new Error(`Session ${sessionId} has status ${checkoutSession.status}, cannot fulfill`);
    }

    const creditsToAdd = checkoutSession.creditsQuantity;
    const studentId = checkoutSession.studentId;

    console.log(`💰 Fulfilling ${creditsToAdd} credits for student ${studentId}`);

    // Use transaction to ensure atomicity
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

      console.log(`✅ Successfully added ${creditsToAdd} credits. New balance: ${newBalance}`);
    });

    // 5. Send confirmation email (async, don't wait)
    try {
      const studentName = `${checkoutSession.student.firstName} ${checkoutSession.student.lastName}`;
      await emailService.sendCreditPurchaseConfirmation(
        checkoutSession.student.user.email,
        studentName,
        creditsToAdd,
        checkoutSession.amountInCents,
        checkoutSession.creditPackage.name
      );
      console.log(`📧 Confirmation email sent to ${checkoutSession.student.user.email}`);
    } catch (emailError: any) {
      // Log but don't fail - email is not critical
      console.error(`⚠️  Failed to send confirmation email: ${emailError.message}`);
    }
  }

  /**
   * Handle expired checkout session
   */
  async handleExpiredSession(sessionId: string): Promise<void> {
    const checkoutSession = await this.prisma.stripeCheckoutSession.findUnique({
      where: { sessionId },
    });

    if (!checkoutSession) {
      console.warn(`⚠️  Checkout session not found: ${sessionId}`);
      return;
    }

    // Only update if still in PENDING status
    if (checkoutSession.status === 'PENDING') {
      await this.prisma.stripeCheckoutSession.update({
        where: { sessionId },
        data: { status: 'EXPIRED' },
      });

      console.log(`⏰ Session ${sessionId} marked as expired`);
    }
  }

  /**
   * Process Stripe webhook event
   */
  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    console.log(`📥 Processing webhook event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`✅ Checkout session completed: ${session.id}`);
        await this.fulfillCredits(session.id);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`⏰ Checkout session expired: ${session.id}`);
        await this.handleExpiredSession(session.id);
        break;
      }

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }
  }
}
