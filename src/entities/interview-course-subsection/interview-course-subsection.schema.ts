import { z } from 'zod'

export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// ============================================
// CREATE SCHEMAS
// ============================================

export const createInterviewCourseSubsectionSchema = z.object({
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

export const updateInterviewCourseSubsectionSchema = z.object({
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

export const interviewCourseSubsectionParamsSchema = z.object({
  id: z.string().uuid('Invalid subsection ID')
})

export const interviewCourseSubsectionSectionParamsSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateInterviewCourseSubsectionInput = z.infer<typeof createInterviewCourseSubsectionSchema>
export type UpdateInterviewCourseSubsectionInput = z.infer<typeof updateInterviewCourseSubsectionSchema>
export type InterviewCourseSubsectionParams = z.infer<typeof interviewCourseSubsectionParamsSchema>
export type ContentType = z.infer<typeof ContentTypeEnum>
