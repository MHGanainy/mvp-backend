import { z } from 'zod'

// Create SimulationAttempt Schema (start session)
export const createSimulationAttemptSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  simulationId: z.string().uuid('Invalid simulation ID'),
  voiceId: z.string().optional()  // Optional voice ID from frontend
  // startedAt will be auto-set to now()
  // endedAt, score, feedback will be set when session completes
})

// Complete SimulationAttempt Schema (end session)
export const completeSimulationAttemptSchema = z.object({
  score: z.number()
    .min(0, 'Score cannot be negative')
    .max(100, 'Score cannot exceed 100')
    .optional(),
  aiFeedback: z.object({
    overallFeedback: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    score: z.number().min(0).max(100).optional(),
    markingDomains: z.array(z.object({
      domain: z.string(),
      score: z.number().min(0).max(100),
      feedback: z.string()
    })).optional()
  }).optional(),
  transcript: z.object({
    messages: z.array(z.object({
      timestamp: z.string(),
      speaker: z.enum(['student', 'ai_patient']),
      message: z.string()
    })),
    duration: z.number(),
    totalMessages: z.number()
  }).optional()
})

// Update SimulationAttempt Schema (for admin edits)
export const updateSimulationAttemptSchema = z.object({
  score: z.number()
    .min(0, 'Score cannot be negative')
    .max(100, 'Score cannot exceed 100')
    .optional(),
  aiFeedback: z.object({
    overallFeedback: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    score: z.number().min(0).max(100).optional(),
    markingDomains: z.array(z.object({
      domain: z.string(),
      score: z.number().min(0).max(100),
      feedback: z.string()
    })).optional()
  }).optional(),
  transcript: z.object({
    messages: z.array(z.object({
      timestamp: z.string(),
      speaker: z.enum(['student', 'ai_patient']),
      message: z.string()
    })),
    duration: z.number(),
    totalMessages: z.number()
  }).optional()
})

// URL Params Schemas
export const simulationAttemptParamsSchema = z.object({
  id: z.string().uuid('Invalid simulation attempt ID')
})

export const simulationAttemptStudentParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID')
})

export const simulationAttemptSimulationParamsSchema = z.object({
  simulationId: z.string().uuid('Invalid simulation ID')
})

// Query Params Schemas
export const simulationAttemptQuerySchema = z.object({
  completed: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100').optional(),
  offset: z.string().transform(val => parseInt(val)).refine(val => val >= 0, 'Offset must be non-negative').optional()
})

// Response Schema
export const simulationAttemptResponseSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  simulationId: z.string(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationSeconds: z.number().nullable(),
  isCompleted: z.boolean(),
  score: z.number().nullable(),
  aiFeedback: z.any().nullable(), // JSON field
  aiPrompt: z.any().nullable(), 
  transcript: z.any().nullable(), // JSON field
  correlationToken: z.string().nullable(),
  createdAt: z.date(),
  student: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    creditBalance: z.number()
  }),
  simulation: z.object({
    id: z.string(),
    timeLimitMinutes: z.number(),
    creditCost: z.number(),
    voiceModel: z.string(),
    courseCase: z.object({
      id: z.string(),
      title: z.string(),
      diagnosis: z.string(),
      patientName: z.string(),
      course: z.object({
        id: z.string(),
        title: z.string()
      })
    })
  })
})

export const simulationAttemptWithTokenResponseSchema = simulationAttemptResponseSchema.extend({
  voiceAssistantConfig: z.object({
    correlationToken: z.string(),
    wsEndpoint: z.string(),
    sessionConfig: z.object({
      stt_provider: z.string().optional(),
      llm_provider: z.string().optional(),
      tts_provider: z.string().optional(),
      system_prompt: z.string().optional()
    }).optional()
  }).optional()
})

export const simulationAttemptStudentCaseParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  caseId: z.string().uuid('Invalid case ID')
})



// Type exports
export type CreateSimulationAttemptInput = z.infer<typeof createSimulationAttemptSchema>
export type CompleteSimulationAttemptInput = z.infer<typeof completeSimulationAttemptSchema>
export type UpdateSimulationAttemptInput = z.infer<typeof updateSimulationAttemptSchema>
export type SimulationAttemptParams = z.infer<typeof simulationAttemptParamsSchema>
export type SimulationAttemptStudentParams = z.infer<typeof simulationAttemptStudentParamsSchema>
export type SimulationAttemptSimulationParams = z.infer<typeof simulationAttemptSimulationParamsSchema>
export type SimulationAttemptQuery = z.infer<typeof simulationAttemptQuerySchema>
export type SimulationAttemptResponse = z.infer<typeof simulationAttemptResponseSchema>
export type SimulationAttemptWithTokenResponse = z.infer<typeof simulationAttemptWithTokenResponseSchema>
export type SimulationAttemptStudentCaseParams = z.infer<typeof simulationAttemptStudentCaseParamsSchema>

