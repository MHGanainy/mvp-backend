import { z } from 'zod'

// CourseStyle enum
export const CourseStyleEnum = z.enum(['RANDOM', 'STRUCTURED'])

// Create Course Schema (includes business validation)
export const createCourseSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  instructorId: z.string().uuid('Invalid instructor ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  style: CourseStyleEnum.default('RANDOM'),
  
  // Info points - array of strings
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional()
    .default([]),
  
  isPublished: z.boolean().default(false).optional()
})

// Update Course Schema
export const updateCourseSchema = z.object({
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
export const updateCourseInfoPointsSchema = z.object({
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
})

// Content Type Enum (for structured courses)
export const ContentTypeEnum = z.enum(['VIDEO', 'PDF', 'TEXT', 'QUIZ'])

// Update Structured Course Complete Schema
export const updateStructuredCourseCompleteSchema = z.object({
  // Course fields (all optional, same as updateCourseSchema)
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
  // Sections with subsections
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
export const courseParamsSchema = z.object({
  id: z.string().uuid('Invalid course ID')
})

export const courseExamParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID')
})

export const courseInstructorParamsSchema = z.object({
  instructorId: z.string().uuid('Invalid instructor ID')
})

// Response Schema
export const courseResponseSchema = z.object({
  id: z.string(),
  examId: z.string(),
  instructorId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  style: CourseStyleEnum,
  infoPoints: z.array(z.string()), // Added info points
  isPublished: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  exam: z.object({
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
export type CreateCourseInput = z.infer<typeof createCourseSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>
export type UpdateCourseInfoPointsInput = z.infer<typeof updateCourseInfoPointsSchema>
export type UpdateStructuredCourseCompleteInput = z.infer<typeof updateStructuredCourseCompleteSchema>
export type CourseParams = z.infer<typeof courseParamsSchema>
export type CourseExamParams = z.infer<typeof courseExamParamsSchema>
export type CourseInstructorParams = z.infer<typeof courseInstructorParamsSchema>
export type CourseResponse = z.infer<typeof courseResponseSchema>
export type CourseStyle = z.infer<typeof CourseStyleEnum>
export type ContentType = z.infer<typeof ContentTypeEnum>