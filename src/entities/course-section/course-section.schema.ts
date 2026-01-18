import { z } from 'zod'

// Content Type Enum
export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// ============================================
// CREATE SCHEMAS
// ============================================

// Create single section
export const createCourseSectionSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  displayOrder: z.number().int().min(1).optional(), // Auto-assigned if not provided
  isFree: z.boolean().default(false).optional()
})

// Create section with subsections (one-shot creation)
export const createCourseSectionCompleteSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  displayOrder: z.number().int().min(1).optional(),
  isFree: z.boolean().default(false).optional(),
  subsections: z.array(z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(1000).optional(),
    contentType: ContentTypeEnum,
    content: z.string().min(1, 'Content is required'),
    displayOrder: z.number().int().min(1).optional(),
    estimatedDuration: z.number().int().min(1).optional(),
    isFree: z.boolean().default(false).optional()
  })).optional().default([])
})

// ============================================
// UPDATE SCHEMAS
// ============================================

export const updateCourseSectionSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).optional().nullable(),
  displayOrder: z.number().int().min(1).optional(),
  isFree: z.boolean().optional()
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const courseSectionParamsSchema = z.object({
  id: z.string().uuid('Invalid section ID')
})

export const courseSectionCourseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

// ============================================
// QUERY SCHEMAS
// ============================================

export const courseSectionQuerySchema = z.object({
  includeSubsections: z.enum(['true', 'false']).optional().default('true')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateCourseSectionInput = z.infer<typeof createCourseSectionSchema>
export type CreateCourseSectionCompleteInput = z.infer<typeof createCourseSectionCompleteSchema>
export type UpdateCourseSectionInput = z.infer<typeof updateCourseSectionSchema>
export type CourseSectionParams = z.infer<typeof courseSectionParamsSchema>
export type CourseSectionCourseParams = z.infer<typeof courseSectionCourseParamsSchema>
export type ContentType = z.infer<typeof ContentTypeEnum>
