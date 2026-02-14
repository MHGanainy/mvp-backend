import { z } from 'zod'

// ============================================
// CREATE SCHEMAS
// ============================================

export const createInterviewCourseEnrollmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const interviewCourseEnrollmentParamsSchema = z.object({
  id: z.string().uuid('Invalid enrollment ID')
})

export const interviewCourseEnrollmentStudentParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID')
})

export const interviewCourseEnrollmentCourseParamsSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// ============================================
// QUERY SCHEMAS
// ============================================

export const interviewCourseEnrollmentQuerySchema = z.object({
  includeProgress: z.enum(['true', 'false']).optional().default('false'),
  completedOnly: z.enum(['true', 'false']).optional().default('false')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateInterviewCourseEnrollmentInput = z.infer<typeof createInterviewCourseEnrollmentSchema>
export type InterviewCourseEnrollmentParams = z.infer<typeof interviewCourseEnrollmentParamsSchema>
export type InterviewCourseEnrollmentStudentParams = z.infer<typeof interviewCourseEnrollmentStudentParamsSchema>
export type InterviewCourseEnrollmentCourseParams = z.infer<typeof interviewCourseEnrollmentCourseParamsSchema>
