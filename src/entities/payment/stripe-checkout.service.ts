// src/entities/payment/stripe-checkout.service.ts
import { PrismaClient } from '@prisma/client';
import { StripeService } from '../../services/stripe.service';

export class StripeCheckoutService {
  private stripeService: StripeService;

  constructor(private prisma: PrismaClient) {
    this.stripeService = new StripeService();
  }

  /**
   * Create a Stripe Checkout Session for credit purchase
   */
  async createCreditCheckoutSession(studentId: string, packageId: string) {
    // 1. Fetch student
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // 2. Fetch credit package
    const creditPackage = await this.prisma.creditPackage.findUnique({
      where: { id: packageId },
    });

    if (!creditPackage) {
      throw new Error('Credit package not found');
    }

    if (!creditPackage.isActive) {
      throw new Error('This credit package is no longer available');
    }

    // 3. Get or create Stripe customer
    let stripeCustomerId = student.stripeCustomerId;

    // Validate existing customer ID (handles test/live mode mismatch)
    if (stripeCustomerId) {
      const existingCustomer = await this.stripeService.validateCustomer(stripeCustomerId);
      if (!existingCustomer) {
        // Customer doesn't exist in current Stripe environment (e.g., test vs live mode)
        // Clear the stale ID so we create a new one
        console.log(`⚠️ Stripe customer ${stripeCustomerId} not found in current environment, creating new customer`);
        stripeCustomerId = null;
      }
    }

    if (!stripeCustomerId) {
      // Create Stripe customer
      const stripeCustomer = await this.stripeService.createCustomer({
        email: student.user.email,
        name: `${student.firstName} ${student.lastName}`,
        metadata: {
          studentId: student.id,
          userId: student.userId.toString(),
        },
      });

      stripeCustomerId = stripeCustomer.id;

      // Save Stripe customer ID to database
      await this.prisma.student.update({
        where: { id: studentId },
        data: { stripeCustomerId },
      });
    }

    // 4. Calculate session expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 5. Create Stripe Checkout Session
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const checkoutSession = await this.stripeService.createCheckoutSession({
      customer: stripeCustomerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: creditPackage.name,
              description: creditPackage.description || `${creditPackage.credits} credits for your account`,
            },
            unit_amount: creditPackage.priceInCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout/cancel`,
      metadata: {
        studentId,
        creditPackageId: packageId,
        credits: creditPackage.credits.toString(),
      },
      expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp in seconds
    });

    // 6. Save checkout session to database
    const savedSession = await this.prisma.stripeCheckoutSession.create({
      data: {
        sessionId: checkoutSession.id,
        studentId,
        creditPackageId: packageId,
        status: 'PENDING',
        amountInCents: creditPackage.priceInCents,
        creditsQuantity: creditPackage.credits,
        expiresAt,
        metadata: {
          stripeCustomerId,
          checkoutUrl: checkoutSession.url,
        },
      },
    });

    return {
      sessionId: checkoutSession.id,
      sessionUrl: checkoutSession.url,
      expiresAt: savedSession.expiresAt,
      amount: creditPackage.priceInCents,
      credits: creditPackage.credits,
    };
  }

  /**
   * Get checkout session status
   */
  async getCheckoutSessionStatus(sessionId: string) {
    const session = await this.prisma.stripeCheckoutSession.findUnique({
      where: { sessionId },
      include: {
        creditPackage: {
          select: {
            name: true,
            description: true,
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
      creditsQuantity: session.creditsQuantity,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      package: session.creditPackage,
      createdAt: session.createdAt,
    };
  }

  /**
   * Get student's checkout sessions
   */
  async getStudentCheckoutSessions(studentId: string) {
    return await this.prisma.stripeCheckoutSession.findMany({
      where: { studentId },
      include: {
        creditPackage: {
          select: {
            name: true,
            credits: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
