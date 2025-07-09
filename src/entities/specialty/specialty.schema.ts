import { z } from 'zod'

// Create Specialty Schema
export const createSpecialtySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
})

// Update Specialty Schema
export const updateSpecialtySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional()
})

// URL Params Schema
export const specialtyParamsSchema = z.object({
  id: z.string().uuid('Invalid specialty ID')
})

// Response Schema (what we send back)
export const specialtyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date()
})

// Type exports for TypeScript
export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>
export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>
export type SpecialtyParams = z.infer<typeof specialtyParamsSchema>
export type SpecialtyResponse = z.infer<typeof specialtyResponseSchema>