import { PrismaClient, DiscountType } from '@prisma/client';

interface ValidateResult {
  valid: boolean;
  reason?: string;
  promoCodeId?: string;
  originalPriceInCents?: number;
  discountAmountInCents?: number;
  finalPriceInCents?: number;
  discountType?: DiscountType;
  discountValue?: number;
}

export class PromoCodeService {
  constructor(private prisma: PrismaClient) {}

  async create(data: {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    maxUses?: number;
    expiresAt?: Date;
    isActive?: boolean;
    resourceType?: 'COURSE' | 'INTERVIEW_COURSE';
    resourceId?: string;
  }) {
    const code = data.code.toUpperCase().trim();

    if (data.discountType === 'PERCENTAGE') {
      if (data.discountValue < 1 || data.discountValue > 100) {
        throw new Error('Percentage discount must be between 1 and 100');
      }
    } else {
      if (data.discountValue < 1) {
        throw new Error('Fixed discount must be at least 1 pence');
      }
    }

    try {
      return await this.prisma.promoCode.create({
        data: {
          code,
          description: data.description || null,
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxUses: data.maxUses || null,
          expiresAt: data.expiresAt || null,
          isActive: data.isActive ?? true,
          resourceType: data.resourceType || null,
          resourceId: data.resourceId || null,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('A promo code with this code already exists');
      }
      throw error;
    }
  }

  async findAll(filters?: { isActive?: boolean; resourceType?: string }) {
    const where: any = {};
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.resourceType) where.resourceType = filters.resourceType;

    return this.prisma.promoCode.findMany({
      where,
      include: {
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: {
          include: {
            student: {
              include: { user: { select: { email: true } } },
            },
          },
          orderBy: { usedAt: 'desc' },
        },
      },
    });
    if (!promoCode) throw new Error('Promo code not found');
    return promoCode;
  }

  async update(id: string, data: {
    description?: string | null;
    discountType?: DiscountType;
    discountValue?: number;
    maxUses?: number | null;
    expiresAt?: Date | null;
    isActive?: boolean;
    resourceType?: 'COURSE' | 'INTERVIEW_COURSE' | null;
    resourceId?: string | null;
  }) {
    await this.findById(id);

    const updateData: any = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.discountType !== undefined) updateData.discountType = data.discountType;
    if (data.discountValue !== undefined) updateData.discountValue = data.discountValue;
    if (data.maxUses !== undefined) updateData.maxUses = data.maxUses;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.resourceType !== undefined) updateData.resourceType = data.resourceType;
    if (data.resourceId !== undefined) updateData.resourceId = data.resourceId;

    return this.prisma.promoCode.update({
      where: { id },
      data: updateData,
    });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.promoCode.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Core validation: checks code validity for a specific plan + student.
  // Returns { valid: false, reason } on any failure, never throws.
  // Design decision: @@unique([promoCodeId, studentId]) means one use per student
  // per code GLOBALLY, regardless of resource. This is intentional for MVP simplicity.
  async validate(code: string, pricingPlanId: string, studentId: string): Promise<ValidateResult> {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase().trim() },
    });
    if (!promoCode) return { valid: false, reason: 'Promo code not found' };

    if (!promoCode.isActive) return { valid: false, reason: 'This promo code is no longer active' };

    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      return { valid: false, reason: 'This promo code has expired' };
    }

    if (promoCode.maxUses !== null && promoCode.currentUses >= promoCode.maxUses) {
      return { valid: false, reason: 'This promo code has reached its maximum number of uses' };
    }

    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id: pricingPlanId },
    });
    if (!plan) return { valid: false, reason: 'Pricing plan not found' };

    if (promoCode.resourceType) {
      if (promoCode.resourceType !== plan.resourceType) {
        return { valid: false, reason: 'This promo code is not valid for this resource type' };
      }
      if (promoCode.resourceId && promoCode.resourceId !== plan.resourceId) {
        return { valid: false, reason: 'This promo code is not valid for this resource' };
      }
    }

    const existingRedemption = await this.prisma.promoCodeRedemption.findUnique({
      where: {
        promoCodeId_studentId: {
          promoCodeId: promoCode.id,
          studentId,
        },
      },
    });
    if (existingRedemption) {
      return { valid: false, reason: 'You have already used this promo code' };
    }

    // Calculate discount — matches client-side calculation exactly
    let discountAmountInCents: number;
    if (promoCode.discountType === 'PERCENTAGE') {
      discountAmountInCents = Math.round(plan.priceInCents * promoCode.discountValue / 100);
    } else {
      discountAmountInCents = promoCode.discountValue;
    }

    // Cap discount at plan price (FIXED_AMOUNT may exceed plan price)
    if (discountAmountInCents > plan.priceInCents) {
      discountAmountInCents = plan.priceInCents;
    }

    const finalPriceInCents = Math.max(0, plan.priceInCents - discountAmountInCents);

    return {
      valid: true,
      promoCodeId: promoCode.id,
      originalPriceInCents: plan.priceInCents,
      discountAmountInCents,
      finalPriceInCents,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
    };
  }

  async recordRedemption(promoCodeId: string, studentId: string, paymentId: string | null, amountSaved: number) {
    await this.prisma.$transaction([
      this.prisma.promoCodeRedemption.create({
        data: {
          promoCodeId,
          studentId,
          paymentId,
          amountSaved,
        },
      }),
      this.prisma.promoCode.update({
        where: { id: promoCodeId },
        data: { currentUses: { increment: 1 } },
      }),
    ]);
  }
}
