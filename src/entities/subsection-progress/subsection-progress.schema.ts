import { z } from 'zod'

// ============================================
// CREATE/START SCHEMAS
// ============================================

export const startSubsectionProgressSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID'),
  subsectionId: z.string().uuid('Invalid subsection ID')
})

// ============================================
// UPDATE SCHEMAS
// ============================================

export const updateSubsectionProgressSchema = z.object({
  timeSpentSeconds: z.number().int().min(0).optional(),
  quizScore: z.number().int().min(0).max(100).optional()
})

export const completeSubsectionSchema = z.object({
  timeSpentSeconds: z.number().int().min(0).optional(),
  quizScore: z.number().int().min(0).max(100).optional()
})

// ============================================
// PARAMS SCHEMAS
// ============================================

export const subsectionProgressParamsSchema = z.object({
  id: z.string().uuid('Invalid progress ID')
})

export const subsectionProgressEnrollmentParamsSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID')
})

// ============================================
// TYPE EXPORTS
// ============================================

export type StartSubsectionProgressInput = z.infer<typeof startSubsectionProgressSchema>
export type UpdateSubsectionProgressInput = z.infer<typeof updateSubsectionProgressSchema>
export type CompleteSubsectionInput = z.infer<typeof completeSubsectionSchema>
export type SubsectionProgressParams = z.infer<typeof subsectionProgressParamsSchema>
