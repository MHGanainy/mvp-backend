import { z } from 'zod'

export const startCuratedSchema = z.object({
  mockExamConfigId: z.string().uuid('Invalid mock exam config ID')
})

export const generateRandomSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  stationCount: z.number().int().min(1).max(20),
  specialtyIds: z.array(z.string().uuid()).optional(),
  curriculumIds: z.array(z.string().uuid()).optional(),
  courseIds: z.array(z.string().uuid()).optional(),
  onlyUnpracticed: z.boolean().optional()
})

export const completeSlotSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID'),
  simulationAttemptId: z.string().uuid('Invalid simulation attempt ID')
})

// Empty body for /finish — defined for consistency with other endpoints
export const finishSchema = z.object({}).strict()

export const attemptIdParamSchema = z.object({
  id: z.string().uuid('Invalid mock exam attempt ID')
})

// Phase 4: my-attempts list query (student — examId required)
export const myAttemptsQuerySchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})

// Admin: query any student's attempts (examId optional, targetStudentId required)
export const adminAttemptsQuerySchema = z.object({
  targetStudentId: z.string().uuid('Invalid student ID'),
  examId: z.string().uuid('Invalid exam ID').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})

// Phase 4: regenerate-feedback path params (attempt id + slot id)
export const regenerateFeedbackParamsSchema = z.object({
  id: z.string().uuid('Invalid mock exam attempt ID'),
  slotId: z.string().uuid('Invalid slot ID')
})

export type StartCuratedInput = z.infer<typeof startCuratedSchema>
export type CompleteSlotInput = z.infer<typeof completeSlotSchema>
export type AttemptIdParam = z.infer<typeof attemptIdParamSchema>
export type MyAttemptsQuery = z.infer<typeof myAttemptsQuerySchema>
export type RegenerateFeedbackParams = z.infer<typeof regenerateFeedbackParamsSchema>
export type GenerateRandomInput = z.infer<typeof generateRandomSchema>
