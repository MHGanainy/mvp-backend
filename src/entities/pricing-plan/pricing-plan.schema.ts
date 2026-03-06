import { z } from 'zod';

export const createPricingPlanSchema = z.object({
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']),
  resourceId: z.string().uuid('Invalid resource ID'),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable(),
  durationMonths: z.number()
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 month')
    .max(24, 'Duration cannot exceed 24 months')
    .optional()
    .nullable(),
  durationHours: z.number()
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 hour')
    .max(168, 'Duration cannot exceed 168 hours')
    .optional()
    .nullable(),
  priceInCents: z.number()
    .int('Price must be in pence (whole number)')
    .min(0, 'Price cannot be negative')
    .max(99999900, 'Price too high'),
  creditsIncluded: z.number()
    .int('Credits must be a whole number')
    .min(0, 'Credits cannot be negative')
    .optional()
    .nullable(),
  isFreeTrialPlan: z.boolean().default(false).optional(),
  featurePoints: z.array(z.string().max(200))
    .max(10, 'Maximum 10 feature points')
    .optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(0, 'Display order cannot be negative')
    .max(4, 'Display order cannot exceed 4'),
  isPopular: z.boolean().default(false).optional(),
}).refine(
  (data) => {
    if (data.isFreeTrialPlan) {
      return data.priceInCents === 0;
    }
    return true;
  },
  { message: 'Free trial plans must have a price of 0', path: ['priceInCents'] }
).refine(
  (data) => {
    if (data.isFreeTrialPlan) {
      return data.durationMonths != null || data.durationHours != null;
    }
    return true;
  },
  { message: 'Free trial plans must have a duration set', path: ['durationMonths'] }
).refine(
  (data) => {
    const hasMonths = data.durationMonths != null;
    const hasHours = data.durationHours != null;
    return !(hasMonths && hasHours);
  },
  { message: 'Cannot set both durationMonths and durationHours', path: ['durationHours'] }
);

export const updatePricingPlanSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable(),
  durationMonths: z.number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .nullable(),
  durationHours: z.number()
    .int()
    .min(1)
    .max(168)
    .optional()
    .nullable(),
  priceInCents: z.number()
    .int()
    .min(0)
    .max(99999900)
    .optional(),
  creditsIncluded: z.number()
    .int()
    .min(0)
    .optional()
    .nullable(),
  isFreeTrialPlan: z.boolean().optional(),
  featurePoints: z.array(z.string().max(200))
    .max(10)
    .optional(),
  displayOrder: z.number()
    .int()
    .min(0)
    .max(4)
    .optional(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const planIdParamsSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

export const resourceParamsSchema = z.object({
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']),
  resourceId: z.string().uuid('Invalid resource ID'),
});

export const listPlansQuerySchema = z.object({
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE', 'BUNDLE']).optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

export type CreatePricingPlanInput = z.infer<typeof createPricingPlanSchema>;
export type UpdatePricingPlanInput = z.infer<typeof updatePricingPlanSchema>;
export type PlanIdParams = z.infer<typeof planIdParamsSchema>;
export type ResourceParams = z.infer<typeof resourceParamsSchema>;
