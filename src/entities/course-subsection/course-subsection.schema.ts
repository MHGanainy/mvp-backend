import { z } from 'zod'

export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// ============================================
// CREATE SCHEMAS
// ============================================

export const createCourseSubsectionSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  contentType: ContentTypeEnum,
  content: z.string().min(1, 'Content is required'),
  displayOrder: z.number().int().min(1).optional(),
  estimatedDuration: z.number().int().min(1).optional()
})

// ============================================
// UPDATE SCHEMAS
// ============================================

export const updateCourseSubsectionSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).optional().nullable(),
  contentType: ContentTypeEnum.optional(),
  content: z.string().min(1).optional(),
  displayOrder: z.number().int().min(1).optional(),
  estimatedDuration: z.number().int().min(1).optional().nullable()
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const courseSubsectionParamsSchema = z.object({
  id: z.string().uuid('Invalid subsection ID')
})

export const courseSubsectionSectionParamsSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateCourseSubsectionInput = z.infer<typeof createCourseSubsectionSchema>
export type UpdateCourseSubsectionInput = z.infer<typeof updateCourseSubsectionSchema>
export type CourseSubsectionParams = z.infer<typeof courseSubsectionParamsSchema>
export type ContentType = z.infer<typeof ContentTypeEnum>
