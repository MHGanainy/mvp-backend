import { z } from 'zod'

// VoiceModel enum
export const VoiceModelEnum = z.enum(['VOICE_1', 'VOICE_2'])

// Create Simulation Schema
export const createSimulationSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  casePrompt: z.string()
    .min(10, 'Case prompt must be at least 10 characters')
    .max(100000, 'Case prompt must be less than 100,000 characters') // Increased to 100k characters
    .trim(),
  openingLine: z.string()
    .min(5, 'Opening line must be at least 5 characters')
    .max(500, 'Opening line must be less than 500 characters')
    .trim(),
  timeLimitMinutes: z.number()
    .int('Time limit must be a whole number')
    .min(1, 'Time limit must be at least 1 minute')
    .max(120, 'Time limit cannot exceed 120 minutes'),
  voiceModel: VoiceModelEnum,
  warningTimeMinutes: z.number()
    .int('Warning time must be a whole number')
    .min(1, 'Warning time must be at least 1 minute')
    .optional(),
  creditCost: z.number()
    .int('Credit cost must be a whole number')
    .min(1, 'Credit cost must be at least 1')
    .max(10, 'Credit cost cannot exceed 10')
    .default(1)
}).refine((data) => {
  // Business rule: Warning time should be less than total time limit
  if (data.warningTimeMinutes && data.warningTimeMinutes >= data.timeLimitMinutes) {
    return false
  }
  return true
}, {
  message: 'Warning time must be less than time limit',
  path: ['warningTimeMinutes']
})

// Update Simulation Schema
export const updateSimulationSchema = z.object({
  casePrompt: z.string()
    .min(10, 'Case prompt must be at least 10 characters')
    .max(100000, 'Case prompt must be less than 100,000 characters') // Increased to 100k characters
    .trim()
    .optional(),
  openingLine: z.string()
    .min(5, 'Opening line must be at least 5 characters')
    .max(500, 'Opening line must be less than 500 characters')
    .trim()
    .optional(),
  timeLimitMinutes: z.number()
    .int('Time limit must be a whole number')
    .min(1, 'Time limit must be at least 1 minute')
    .max(120, 'Time limit cannot exceed 120 minutes')
    .optional(),
  voiceModel: VoiceModelEnum.optional(),
  warningTimeMinutes: z.number()
    .int('Warning time must be a whole number')
    .min(1, 'Warning time must be at least 1 minute')
    .optional(),
  creditCost: z.number()
    .int('Credit cost must be a whole number')
    .min(1, 'Credit cost must be at least 1')
    .max(10, 'Credit cost cannot exceed 10')
    .optional()
})

// URL Params Schemas
export const simulationParamsSchema = z.object({
  id: z.string().uuid('Invalid simulation ID')
})

export const simulationCourseCaseParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID')
})

// Response Schema
export const simulationResponseSchema = z.object({
  id: z.string(),
  courseCaseId: z.string(),
  casePrompt: z.string(),
  openingLine: z.string(),
  timeLimitMinutes: z.number(),
  voiceModel: VoiceModelEnum,
  warningTimeMinutes: z.number().nullable(),
  creditCost: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  courseCase: z.object({
    id: z.string(),
    title: z.string(),
    diagnosis: z.string(),
    patientName: z.string(),
    patientAge: z.number(),
    patientGender: z.string(),
    description: z.string(),
    course: z.object({
      id: z.string(),
      title: z.string(),
      exam: z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string()
      })
    })
  })
})

// Type exports
export type CreateSimulationInput = z.infer<typeof createSimulationSchema>
export type UpdateSimulationInput = z.infer<typeof updateSimulationSchema>
export type SimulationParams = z.infer<typeof simulationParamsSchema>
export type SimulationCourseCaseParams = z.infer<typeof simulationCourseCaseParamsSchema>
export type SimulationResponse = z.infer<typeof simulationResponseSchema>
export type VoiceModel = z.infer<typeof VoiceModelEnum>