import { z } from 'zod'

// InterviewCourseStyle enum
export const InterviewCourseStyleEnum = z.enum(['RANDOM', 'STRUCTURED'])

// Create InterviewCourse Schema (includes business validation)
export const createInterviewCourseSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID'),
  instructorId: z.string().uuid('Invalid instructor ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  style: InterviewCourseStyleEnum.default('RANDOM'),

  // Info points - array of strings
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional()
    .default([]),

  isPublished: z.boolean().default(false).optional()
})

// Update InterviewCourse Schema
export const updateInterviewCourseSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional(),
  isPublished: z.boolean().optional()
})

// Add info points update schema for easier management
export const updateInterviewCourseInfoPointsSchema = z.object({
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
})

// Content Type Enum (for structured interview courses)
export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// Create Structured Interview Course Complete Schema
export const createStructuredInterviewCourseCompleteSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID'),
  instructorId: z.string().uuid('Invalid instructor ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional()
    .default([]),
  isPublished: z.boolean().default(false).optional(),
  sections: z.array(z.object({
    title: z.string()
      .min(1, 'Section title is required')
      .max(200, 'Section title must be less than 200 characters')
      .trim(),
    description: z.string()
      .max(1000, 'Section description must be less than 1000 characters')
      .optional(),
    displayOrder: z.number().int().min(1).optional(),
    isFree: z.boolean().default(false).optional(),
    subsections: z.array(z.object({
      title: z.string()
        .min(1, 'Subsection title is required')
        .max(200, 'Subsection title must be less than 200 characters')
        .trim(),
      description: z.string()
        .max(1000, 'Subsection description must be less than 1000 characters')
        .optional(),
      contentType: ContentTypeEnum,
      content: z.string().min(1, 'Content is required'),
      displayOrder: z.number().int().min(1).optional(),
      estimatedDuration: z.number().int().min(1).optional(),
      isFree: z.boolean().default(false).optional()
    })).optional().default([])
  })).optional().default([])
})

// Update Structured Interview Course Complete Schema
export const updateStructuredInterviewCourseCompleteSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional(),
  isPublished: z.boolean().optional(),
  sections: z.array(z.object({
    title: z.string()
      .min(1, 'Section title is required')
      .max(200, 'Section title must be less than 200 characters')
      .trim(),
    description: z.string()
      .max(1000, 'Section description must be less than 1000 characters')
      .optional(),
    displayOrder: z.number().int().min(1).optional(),
    isFree: z.boolean().default(false).optional(),
    subsections: z.array(z.object({
      title: z.string()
        .min(1, 'Subsection title is required')
        .max(200, 'Subsection title must be less than 200 characters')
        .trim(),
      description: z.string()
        .max(1000, 'Subsection description must be less than 1000 characters')
        .optional(),
      contentType: ContentTypeEnum,
      content: z.string().min(1, 'Content is required'),
      displayOrder: z.number().int().min(1).optional(),
      estimatedDuration: z.number().int().min(1).optional(),
      isFree: z.boolean().default(false).optional()
    })).optional().default([])
  })).optional().default([])
})

// URL Params Schemas
export const interviewCourseParamsSchema = z.object({
  id: z.string().uuid('Invalid interview course ID')
})

export const interviewCourseInterviewParamsSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID')
})

export const interviewCourseInstructorParamsSchema = z.object({
  instructorId: z.string().uuid('Invalid instructor ID')
})

// Response Schema
export const interviewCourseResponseSchema = z.object({
  id: z.string(),
  interviewId: z.string(),
  instructorId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  style: InterviewCourseStyleEnum,
  infoPoints: z.array(z.string()), // Added info points
  isPublished: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  interview: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    isActive: z.boolean()
  }),
  instructor: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    bio: z.string().nullable()
  })
})

// Type exports
export type CreateInterviewCourseInput = z.infer<typeof createInterviewCourseSchema>
export type UpdateInterviewCourseInput = z.infer<typeof updateInterviewCourseSchema>
export type UpdateInterviewCourseInfoPointsInput = z.infer<typeof updateInterviewCourseInfoPointsSchema>
export type InterviewCourseParams = z.infer<typeof interviewCourseParamsSchema>
export type InterviewCourseInterviewParams = z.infer<typeof interviewCourseInterviewParamsSchema>
export type InterviewCourseInstructorParams = z.infer<typeof interviewCourseInstructorParamsSchema>
export type InterviewCourseResponse = z.infer<typeof interviewCourseResponseSchema>
export type InterviewCourseStyle = z.infer<typeof InterviewCourseStyleEnum>
export type CreateStructuredInterviewCourseCompleteInput = z.infer<typeof createStructuredInterviewCourseCompleteSchema>
export type UpdateStructuredInterviewCourseCompleteInput = z.infer<typeof updateStructuredInterviewCourseCompleteSchema>
