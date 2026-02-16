import { z } from 'zod'

export const createAffiliateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).trim(),
  email: z.string().email('Invalid email').optional(),
  code: z.string()
    .min(3, 'Code must be at least 3 characters')
    .max(30, 'Code must be less than 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Code must be lowercase alphanumeric with hyphens only')
    .trim(),
})

export const updateAffiliateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  email: z.string().email('Invalid email').optional(),
  isActive: z.boolean().optional(),
})

export const affiliateParamsSchema = z.object({
  code: z.string().min(1),
})

export const referralListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  affiliateCode: z.string().optional(),
})

export type CreateAffiliateInput = z.infer<typeof createAffiliateSchema>
export type UpdateAffiliateInput = z.infer<typeof updateAffiliateSchema>
