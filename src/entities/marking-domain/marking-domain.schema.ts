import { z } from 'zod'

// Create MarkingDomain Schema
export const createMarkingDomainSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
})

// Update MarkingDomain Schema
export const updateMarkingDomainSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional()
})

// URL Params Schema
export const markingDomainParamsSchema = z.object({
  id: z.string().uuid('Invalid marking domain ID')
})

// Response Schema
export const markingDomainResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date()
})

// Type exports
export type CreateMarkingDomainInput = z.infer<typeof createMarkingDomainSchema>
export type UpdateMarkingDomainInput = z.infer<typeof updateMarkingDomainSchema>
export type MarkingDomainParams = z.infer<typeof markingDomainParamsSchema>
export type MarkingDomainResponse = z.infer<typeof markingDomainResponseSchema>