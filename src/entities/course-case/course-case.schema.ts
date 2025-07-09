import { z } from 'zod'

// PatientGender enum
export const PatientGenderEnum = z.enum(['MALE', 'FEMALE', 'OTHER'])

// Create CourseCase Schema
export const createCourseCaseSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  diagnosis: z.string()
    .min(1, 'Diagnosis is required')
    .max(200, 'Diagnosis must be less than 200 characters')
    .trim(),
  patientName: z.string()
    .min(1, 'Patient name is required')
    .max(100, 'Patient name must be less than 100 characters')
    .trim(),
  patientAge: z.number()
    .int('Age must be a whole number')
    .min(0, 'Age cannot be negative')
    .max(150, 'Age must be realistic'),
  patientGender: PatientGenderEnum,
  description: z.string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be less than 2000 characters')
    .trim(),
  isFree: z.boolean().default(false).optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
    .optional() // Will be auto-assigned if not provided
})

// Update CourseCase Schema
export const updateCourseCaseSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  diagnosis: z.string()
    .min(1, 'Diagnosis is required')
    .max(200, 'Diagnosis must be less than 200 characters')
    .trim()
    .optional(),
  patientName: z.string()
    .min(1, 'Patient name is required')
    .max(100, 'Patient name must be less than 100 characters')
    .trim()
    .optional(),
  patientAge: z.number()
    .int('Age must be a whole number')
    .min(0, 'Age cannot be negative')
    .max(150, 'Age must be realistic')
    .optional(),
  patientGender: PatientGenderEnum.optional(),
  description: z.string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be less than 2000 characters')
    .trim()
    .optional(),
  isFree: z.boolean().optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
    .optional()
})

// URL Params Schemas
export const courseCaseParamsSchema = z.object({
  id: z.string().uuid('Invalid course case ID')
})

export const courseCaseCourseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

// Reorder Schema
export const reorderCourseCaseSchema = z.object({
  newOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
})

// Response Schema
export const courseCaseResponseSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  diagnosis: z.string(),
  patientName: z.string(),
  patientAge: z.number(),
  patientGender: PatientGenderEnum,
  description: z.string(),
  isFree: z.boolean(),
  displayOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  course: z.object({
    id: z.string(),
    title: z.string(),
    style: z.string(),
    isPublished: z.boolean(),
    exam: z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string()
    })
  })
})

// Type exports
export type CreateCourseCaseInput = z.infer<typeof createCourseCaseSchema>
export type UpdateCourseCaseInput = z.infer<typeof updateCourseCaseSchema>
export type CourseCaseParams = z.infer<typeof courseCaseParamsSchema>
export type CourseCaseCourseParams = z.infer<typeof courseCaseCourseParamsSchema>
export type ReorderCourseCaseInput = z.infer<typeof reorderCourseCaseSchema>
export type CourseCaseResponse = z.infer<typeof courseCaseResponseSchema>
export type PatientGender = z.infer<typeof PatientGenderEnum>