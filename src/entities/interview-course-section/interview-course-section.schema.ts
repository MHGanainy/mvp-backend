import { z } from 'zod'

// Content Type Enum
export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// ============================================
// CREATE SCHEMAS
// ============================================

// Create single section
export const createInterviewCourseSectionSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID'),
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
export const createInterviewCourseSectionCompleteSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID'),
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

export const updateInterviewCourseSectionSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).optional().nullable(),
  displayOrder: z.number().int().min(1).optional(),
  isFree: z.boolean().optional()
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const interviewCourseSectionParamsSchema = z.object({
  id: z.string().uuid('Invalid section ID')
})

export const interviewCourseSectionCourseParamsSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// ============================================
// QUERY SCHEMAS
// ============================================

export const interviewCourseSectionQuerySchema = z.object({
  includeSubsections: z.enum(['true', 'false']).optional().default('true')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateInterviewCourseSectionInput = z.infer<typeof createInterviewCourseSectionSchema>
export type CreateInterviewCourseSectionCompleteInput = z.infer<typeof createInterviewCourseSectionCompleteSchema>
export type UpdateInterviewCourseSectionInput = z.infer<typeof updateInterviewCourseSectionSchema>
export type InterviewCourseSectionParams = z.infer<typeof interviewCourseSectionParamsSchema>
export type InterviewCourseSectionCourseParams = z.infer<typeof interviewCourseSectionCourseParamsSchema>
export type ContentType = z.infer<typeof ContentTypeEnum>
