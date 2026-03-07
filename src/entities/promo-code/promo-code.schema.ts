import { z } from 'zod';

export const createPromoCodeSchema = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Za-z0-9-]+$/, 'Code must be alphanumeric (hyphens allowed)'),
  description: z.string().max(500).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.number().int().positive(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']).optional(),
  resourceId: z.string().uuid().optional(),
}).refine(
  (data) => {
    if (data.discountType === 'PERCENTAGE') {
      return data.discountValue >= 1 && data.discountValue <= 100;
    }
    return true;
  },
  { message: 'Percentage discount must be between 1 and 100', path: ['discountValue'] }
);

export const updatePromoCodeSchema = z.object({
  description: z.string().max(500).optional().nullable(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().int().positive().optional(),
  maxUses: z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']).optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
});

export const promoCodeIdParamsSchema = z.object({
  id: z.string().uuid('Invalid promo code ID'),
});

export const validatePromoCodeSchema = z.object({
  code: z.string().min(1).max(30),
  pricingPlanId: z.string().uuid('Invalid pricing plan ID'),
});

export const listPromoCodesQuerySchema = z.object({
  isActive: z.string().optional().transform((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']).optional(),
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;
export type PromoCodeIdParams = z.infer<typeof promoCodeIdParamsSchema>;
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>;
