import { z } from 'zod'

// Create Curriculum Schema
export const createCurriculumSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
})

// Update Curriculum Schema
export const updateCurriculumSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional()
})

// URL Params Schema
export const curriculumParamsSchema = z.object({
  id: z.string().uuid('Invalid curriculum ID')
})

// Response Schema (what we send back)
export const curriculumResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date()
})

// Type exports for TypeScript
export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>
export type UpdateCurriculumInput = z.infer<typeof updateCurriculumSchema>
export type CurriculumParams = z.infer<typeof curriculumParamsSchema>
export type CurriculumResponse = z.infer<typeof curriculumResponseSchema>