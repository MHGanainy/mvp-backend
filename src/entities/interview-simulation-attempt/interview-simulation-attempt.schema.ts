import { z } from 'zod'

// Create InterviewSimulationAttempt Schema (start session)
export const createInterviewSimulationAttemptSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewSimulationId: z.string().uuid('Invalid interview simulation ID'),
  voiceId: z.string().optional()  // Optional voice ID from frontend
  // startedAt will be auto-set to now()
  // endedAt, score, feedback will be set when session completes
})

// Complete InterviewSimulationAttempt Schema (end session)
export const completeInterviewSimulationAttemptSchema = z.object({
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

// Update InterviewSimulationAttempt Schema (for admin edits)
export const updateInterviewSimulationAttemptSchema = z.object({
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
export const interviewSimulationAttemptParamsSchema = z.object({
  id: z.string().uuid('Invalid interview simulation attempt ID')
})

export const interviewSimulationAttemptStudentParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID')
})

export const interviewSimulationAttemptInterviewSimulationParamsSchema = z.object({
  interviewSimulationId: z.string().uuid('Invalid interview simulation ID')
})

// Query Params Schemas
export const interviewSimulationAttemptQuerySchema = z.object({
  completed: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100').optional(),
  offset: z.string().transform(val => parseInt(val)).refine(val => val >= 0, 'Offset must be non-negative').optional()
})

// Response Schema
export const interviewSimulationAttemptResponseSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  interviewSimulationId: z.string(),
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
  interviewSimulation: z.object({
    id: z.string(),
    timeLimitMinutes: z.number(),
    creditCost: z.number(),
    voiceModel: z.string(),
    interviewCase: z.object({
      id: z.string(),
      title: z.string(),
      diagnosis: z.string(),
      patientName: z.string(),
      interviewCourse: z.object({
        id: z.string(),
        title: z.string(),
        examId: z.string()
      })
    })
  })
})

export const interviewSimulationAttemptWithTokenResponseSchema = interviewSimulationAttemptResponseSchema.extend({
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

export const interviewSimulationAttemptStudentCaseParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  caseId: z.string().uuid('Invalid case ID')
})



// Type exports
export type CreateInterviewSimulationAttemptInput = z.infer<typeof createInterviewSimulationAttemptSchema>
export type CompleteInterviewSimulationAttemptInput = z.infer<typeof completeInterviewSimulationAttemptSchema>
export type UpdateInterviewSimulationAttemptInput = z.infer<typeof updateInterviewSimulationAttemptSchema>
export type InterviewSimulationAttemptParams = z.infer<typeof interviewSimulationAttemptParamsSchema>
export type InterviewSimulationAttemptStudentParams = z.infer<typeof interviewSimulationAttemptStudentParamsSchema>
export type InterviewSimulationAttemptInterviewSimulationParams = z.infer<typeof interviewSimulationAttemptInterviewSimulationParamsSchema>
export type InterviewSimulationAttemptQuery = z.infer<typeof interviewSimulationAttemptQuerySchema>
export type InterviewSimulationAttemptResponse = z.infer<typeof interviewSimulationAttemptResponseSchema>
export type InterviewSimulationAttemptWithTokenResponse = z.infer<typeof interviewSimulationAttemptWithTokenResponseSchema>
export type InterviewSimulationAttemptStudentCaseParams = z.infer<typeof interviewSimulationAttemptStudentCaseParamsSchema>

