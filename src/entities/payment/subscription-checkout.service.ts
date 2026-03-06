import { PrismaClient, ResourceType } from '@prisma/client';
import { StripeService } from '../../services/stripe.service';

export class SubscriptionCheckoutService {
  private stripeService: StripeService;

  constructor(private prisma: PrismaClient) {
    this.stripeService = new StripeService();
  }

  async createSubscriptionCheckoutSession(studentId: string, pricingPlanId: string) {
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

    // 4. Get or create Stripe customer (same pattern as stripe-checkout.service.ts)
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

    // 5. Calculate session expiry (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 6. Create Stripe Checkout Session
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
            unit_amount: plan.priceInCents,
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
      },
      allow_promotion_codes: true,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });

    // 7. Save checkout session to database
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

    throw new Error(`Unsupported resource type: ${resourceType}`);
  }
}
