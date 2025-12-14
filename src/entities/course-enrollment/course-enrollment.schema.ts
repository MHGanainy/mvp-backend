import { z } from 'zod'

// ============================================
// CREATE SCHEMAS
// ============================================

export const createCourseEnrollmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseId: z.string().uuid('Invalid course ID')
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const courseEnrollmentParamsSchema = z.object({
  id: z.string().uuid('Invalid enrollment ID')
})

export const courseEnrollmentStudentParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID')
})

export const courseEnrollmentCourseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

// ============================================
// QUERY SCHEMAS
// ============================================

export const courseEnrollmentQuerySchema = z.object({
  includeProgress: z.enum(['true', 'false']).optional().default('false'),
  completedOnly: z.enum(['true', 'false']).optional().default('false')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateCourseEnrollmentInput = z.infer<typeof createCourseEnrollmentSchema>
export type CourseEnrollmentParams = z.infer<typeof courseEnrollmentParamsSchema>
export type CourseEnrollmentStudentParams = z.infer<typeof courseEnrollmentStudentParamsSchema>
export type CourseEnrollmentCourseParams = z.infer<typeof courseEnrollmentCourseParamsSchema>
