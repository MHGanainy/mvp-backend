// src/entities/marking-criterion/marking-criterion.schema.ts
import { z } from 'zod'

// Create Marking Criterion Schema
export const createMarkingCriterionSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  markingDomainId: z.string().uuid('Invalid marking domain ID'),
  text: z.string()
    .min(1, 'Text is required')
    .max(500, 'Text must be less than 500 characters')
    .trim(),
  points: z.number()
    .int('Points must be a whole number')
    .min(0, 'Points cannot be negative')
    .max(100, 'Points cannot exceed 100'),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(0, 'Display order cannot be negative')
})

// Update Marking Criterion Schema
export const updateMarkingCriterionSchema = z.object({
  markingDomainId: z.string().uuid('Invalid marking domain ID').optional(),
  text: z.string()
    .min(1, 'Text is required')
    .max(500, 'Text must be less than 500 characters')
    .trim()
    .optional(),
  points: z.number()
    .int('Points must be a whole number')
    .min(0, 'Points cannot be negative')
    .max(100, 'Points cannot exceed 100')
    .optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(0, 'Display order cannot be negative')
    .optional()
})

// Bulk Update Schema
export const bulkUpdateMarkingCriteriaSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  criteria: z.array(z.object({
    id: z.string().uuid().optional(),
    markingDomainId: z.string().uuid('Invalid marking domain ID'),
    text: z.string()
      .min(1, 'Text is required')
      .max(500, 'Text must be less than 500 characters')
      .trim(),
    points: z.number()
      .int('Points must be a whole number')
      .min(0, 'Points cannot be negative')
      .max(100, 'Points cannot exceed 100'),
    displayOrder: z.number()
      .int('Display order must be a whole number')
      .min(0, 'Display order cannot be negative')
  }))
})

// Params Schema
export const markingCriterionParamsSchema = z.object({
  id: z.string().uuid('Invalid marking criterion ID')
})

export const markingCriterionCourseCaseParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID')
})

// Type exports
export type CreateMarkingCriterionInput = z.infer<typeof createMarkingCriterionSchema>
export type UpdateMarkingCriterionInput = z.infer<typeof updateMarkingCriterionSchema>
export type BulkUpdateMarkingCriteriaInput = z.infer<typeof bulkUpdateMarkingCriteriaSchema>
export type MarkingCriterionParams = z.infer<typeof markingCriterionParamsSchema>
export type MarkingCriterionCourseCaseParams = z.infer<typeof markingCriterionCourseCaseParamsSchema>