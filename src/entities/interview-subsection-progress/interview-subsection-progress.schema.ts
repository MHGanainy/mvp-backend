import { z } from 'zod'

// ============================================
// CREATE/START SCHEMAS
// ============================================

export const startInterviewSubsectionProgressSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID'),
  subsectionId: z.string().uuid('Invalid subsection ID')
})

// ============================================
// UPDATE SCHEMAS
// ============================================

export const updateInterviewSubsectionProgressSchema = z.object({
  timeSpentSeconds: z.number().int().min(0).optional(),
  quizScore: z.number().int().min(0).max(100).optional()
})

export const completeInterviewSubsectionSchema = z.object({
  timeSpentSeconds: z.number().int().min(0).optional(),
  quizScore: z.number().int().min(0).max(100).optional()
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const interviewSubsectionProgressParamsSchema = z.object({
  id: z.string().uuid('Invalid progress ID')
})

export const interviewSubsectionProgressEnrollmentParamsSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type StartInterviewSubsectionProgressInput = z.infer<typeof startInterviewSubsectionProgressSchema>
export type UpdateInterviewSubsectionProgressInput = z.infer<typeof updateInterviewSubsectionProgressSchema>
export type CompleteInterviewSubsectionInput = z.infer<typeof completeInterviewSubsectionSchema>
export type InterviewSubsectionProgressParams = z.infer<typeof interviewSubsectionProgressParamsSchema>
