import { PrismaClient } from '@prisma/client'

export class PaymentService {
  constructor(private prisma: PrismaClient) {}

  // Get payment by ID
  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })

    if (!payment) {
      throw new Error('Payment not found')
    }

    return payment
  }

  async findByStudent(studentId: string, query?: {
    paymentType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query?.page || 1;
    const limit = query?.limit || 20;

    // Credit purchases live in StripeCheckoutSession, subscription purchases in Payment.
    // Fetch both, merge into a unified list sorted by date.

    const wantSubscriptions = !query?.paymentType || query.paymentType === 'SUBSCRIPTION';
    const wantCredits = !query?.paymentType || query.paymentType === 'CREDITS';

    const [subscriptionPayments, creditSessions] = await Promise.all([
      wantSubscriptions
        ? this.prisma.payment.findMany({
            where: { studentId },
            include: {
              pricingPlan: {
                select: {
                  id: true,
                  name: true,
                  priceInCents: true,
                  resourceType: true,
                  resourceId: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      wantCredits
        ? this.prisma.stripeCheckoutSession.findMany({
            where: { studentId, status: 'COMPLETED' },
            include: {
              creditPackage: {
                select: { id: true, name: true, priceInCents: true },
              },
            },
            orderBy: { completedAt: 'desc' },
          })
        : [],
    ]);

    // Normalize both into a unified shape
    type UnifiedPayment = {
      id: string;
      amount: string;
      currency: string;
      paymentType: string;
      paymentStatus: string;
      pricingPlan: { id: string; name: string; priceInCents: number; resourceType: string; resourceId: string } | null;
      createdAt: string;
      _sortDate: number;
    };

    const unified: UnifiedPayment[] = [];

    for (const p of subscriptionPayments) {
      unified.push({
        id: p.id,
        amount: p.amount.toString(),
        currency: p.currency,
        paymentType: p.paymentType,
        paymentStatus: p.paymentStatus,
        pricingPlan: p.pricingPlan
          ? {
              id: p.pricingPlan.id,
              name: p.pricingPlan.name,
              priceInCents: p.pricingPlan.priceInCents,
              resourceType: p.pricingPlan.resourceType,
              resourceId: p.pricingPlan.resourceId,
            }
          : null,
        createdAt: p.createdAt.toISOString(),
        _sortDate: p.createdAt.getTime(),
      });
    }

    for (const s of creditSessions) {
      unified.push({
        id: s.id,
        amount: (s.amountInCents / 100).toFixed(2),
        currency: 'GBP',
        paymentType: 'CREDITS',
        paymentStatus: 'COMPLETED',
        pricingPlan: s.creditPackage
          ? {
              id: s.creditPackage.id,
              name: s.creditPackage.name,
              priceInCents: s.creditPackage.priceInCents,
              resourceType: 'CREDITS',
              resourceId: s.creditPackage.id,
            }
          : null,
        createdAt: (s.completedAt || s.createdAt).toISOString(),
        _sortDate: (s.completedAt || s.createdAt).getTime(),
      });
    }

    // Sort by date descending
    unified.sort((a, b) => b._sortDate - a._sortDate);

    const total = unified.length;
    const skip = (page - 1) * limit;
    const paginated = unified.slice(skip, skip + limit);

    return {
      data: paginated.map(({ _sortDate, ...rest }) => rest),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }
}