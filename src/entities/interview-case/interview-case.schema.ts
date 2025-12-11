import { z } from 'zod'
import { VoiceModelEnum } from '../simulation/simulation.schema'

// PatientGender enum
export const PatientGenderEnum = z.enum(['MALE', 'FEMALE', 'OTHER'])

// Create InterviewCase Schema
export const createInterviewCaseSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  diagnosis: z.string()
    .min(1, 'Diagnosis is required')
    .max(100000, 'Diagnosis must be less than 100000 characters')
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
    .max(100000, 'Description must be less than 100000 characters')
    .trim(),
  isFree: z.boolean().default(false).optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
    .optional()
})

// Update InterviewCase Schema
export const updateInterviewCaseSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  diagnosis: z.string()
    .min(1, 'Diagnosis is required')
    .max(100000, 'Diagnosis must be less than 100000 characters')
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
    .max(100000, 'Description must be less than 100000 characters')
    .trim()
    .optional(),
  isFree: z.boolean().optional(),
  displayOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
    .optional()
})

// URL Params Schemas
export const interviewCaseParamsSchema = z.object({
  id: z.string().uuid('Invalid interview case ID')
})

export const interviewCaseInterviewCourseParamsSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// Reorder Schema
export const reorderInterviewCaseSchema = z.object({
  newOrder: z.number()
    .int('Display order must be a whole number')
    .min(1, 'Display order must be positive')
})

// Response Schema
export const interviewCaseResponseSchema = z.object({
  id: z.string(),
  interviewCourseId: z.string(),
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
  interviewCourse: z.object({
    id: z.string(),
    title: z.string(),
    style: z.string(),
    isPublished: z.boolean(),
    interview: z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string()
    })
  })
})

// Complete Interview Case Schemas
export const createCompleteInterviewCaseSchema = z.object({
  // Basic interview case info
  interviewCase: z.object({
    interviewCourseId: z.string().uuid('Invalid interview course ID'),
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title must be less than 200 characters')
      .trim(),
    diagnosis: z.string()
      .min(1, 'Diagnosis is required')
      .max(100000, 'Diagnosis must be less than 100000 characters')
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
      .max(100000, 'Description must be less than 100000 characters')
      .trim(),
    isFree: z.boolean().default(false).optional(),
    displayOrder: z.number()
      .int('Display order must be a whole number')
      .min(1, 'Display order must be positive')
      .optional()
  }),

  // Tabs content - only 3 types now
  tabs: z.object({
    DOCTORS_NOTE: z.union([
      z.string(),
      z.array(z.string())
    ]).default('').transform(val => Array.isArray(val) ? val : [val]).optional(),
    PATIENT_SCRIPT: z.union([
      z.string(),
      z.array(z.string())
    ]).default('').transform(val => Array.isArray(val) ? val : [val]).optional(),
    MEDICAL_NOTES: z.union([
      z.string(),
      z.array(z.string())
    ]).default('').transform(val => Array.isArray(val) ? val : [val]).optional()
  }).optional(),

  // Marking criteria as separate entities
  markingCriteria: z.array(z.object({
    markingDomainId: z.string().uuid('Invalid marking domain ID'),
    text: z.string().min(1).max(500),
    points: z.number().int().min(0),
    displayOrder: z.number().int().min(0)
  })).optional(),

  // Existing entities (by ID)
  existing: z.object({
    specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).default([]),
    curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).default([])
  }).optional(),

  // New entities to create
  new: z.object({
    specialties: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([]),
    curriculums: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([])
  }).optional(),

  // Simulation configuration - Updated with provider keys
  interviewSimulation: z.object({
    casePrompt: z.string()
      .min(10, 'Case prompt must be at least 10 characters')
      .max(100000, 'Case prompt must be less than 100000 characters')
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
      .default(1),

    // Voice assistant configuration - accept either provider keys or full config
    sttProviderKey: z.string().optional(),
    llmProviderKey: z.string().optional(),
    ttsProviderKey: z.string().optional(),

    // Also accept the full config from frontend (will extract provider keys in service)
    voiceAssistantConfig: z.object({
      sttProvider: z.string().optional(),
      sttModel: z.string().optional(),
      llmProvider: z.string().optional(),
      llmModel: z.string().optional(),
      ttsProvider: z.string().optional(),
      ttsModel: z.string().optional(),
      ttsVoice: z.string().optional(),
      ttsSpeed: z.number().optional(),
    }).optional()
  }).optional()
})

// Update complete interview case schema
export const updateCompleteInterviewCaseSchema = z.object({
  interviewCaseId: z.string().uuid('Invalid interview case ID'),

  interviewCase: z.object({
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title must be less than 200 characters')
      .trim()
      .optional(),
    diagnosis: z.string()
      .min(1, 'Diagnosis is required')
      .max(100000, 'Diagnosis must be less than 100000 characters')
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
      .max(100000, 'Description must be less than 100000 characters')
      .trim()
      .optional(),
    isFree: z.boolean().optional(),
    displayOrder: z.number()
      .int('Display order must be a whole number')
      .min(1, 'Display order must be positive')
      .optional()
  }).optional(),

  // Tabs content - only 3 types
  tabs: z.object({
    DOCTORS_NOTE: z.union([
      z.string(),
      z.array(z.string())
    ]).transform(val => Array.isArray(val) ? val : [val]).optional(),
    PATIENT_SCRIPT: z.union([
      z.string(),
      z.array(z.string())
    ]).transform(val => Array.isArray(val) ? val : [val]).optional(),
    MEDICAL_NOTES: z.union([
      z.string(),
      z.array(z.string())
    ]).transform(val => Array.isArray(val) ? val : [val]).optional()
  }).optional(),

  // Marking criteria
  interviewMarkingCriteria: z.array(z.object({
    id: z.string().uuid().optional(),
    markingDomainId: z.string().uuid(),
    text: z.string().min(1).max(500),
    points: z.number().int().min(0),
    displayOrder: z.number().int().min(0)
  })).optional(),

  existing: z.object({
    specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).optional(),
    curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).optional()
  }).optional(),

  new: z.object({
    specialties: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).optional(),
    curriculums: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).optional()
  }).optional(),

  // Simulation configuration - Updated with provider keys
  interviewSimulation: z.object({
    casePrompt: z.string()
      .min(10, 'Case prompt must be at least 10 characters')
      .max(100000, 'Case prompt must be less than 100000 characters')
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
      .optional(),

    // Voice assistant configuration - accept either provider keys or full config
    sttProviderKey: z.string().optional(),
    llmProviderKey: z.string().optional(),
    ttsProviderKey: z.string().optional(),

    // Also accept the full config from frontend (will extract provider keys in service)
    voiceAssistantConfig: z.object({
      sttProvider: z.string().optional(),
      sttModel: z.string().optional(),
      llmProvider: z.string().optional(),
      llmModel: z.string().optional(),
      ttsProvider: z.string().optional(),
      ttsModel: z.string().optional(),
      ttsVoice: z.string().optional(),
      ttsSpeed: z.number().optional(),
    }).optional()
  }).optional()
})

// Response schema for complete interview case - Updated to include provider keys
export const completeInterviewCaseResponseSchema = z.object({
  interviewCase: z.object({
    id: z.string(),
    interviewCourseId: z.string(),
    title: z.string(),
    diagnosis: z.string(),
    patientName: z.string(),
    patientAge: z.number(),
    patientGender: PatientGenderEnum,
    description: z.string(),
    isFree: z.boolean(),
    displayOrder: z.number()
  }),
  tabs: z.object({
    DOCTORS_NOTE: z.object({
      id: z.string(),
      content: z.array(z.string()),
      hasContent: z.boolean()
    }).optional(),
    PATIENT_SCRIPT: z.object({
      id: z.string(),
      content: z.array(z.string()),
      hasContent: z.boolean()
    }).optional(),
    MEDICAL_NOTES: z.object({
      id: z.string(),
      content: z.array(z.string()),
      hasContent: z.boolean()
    }).optional()
  }),
  interviewMarkingCriteria: z.array(z.object({
    domainId: z.string(),
    domainName: z.string(),
    criteria: z.array(z.object({
      id: z.string(),
      text: z.string(),
      points: z.number(),
      displayOrder: z.number()
    }))
  })),
  created: z.object({
    specialties: z.array(z.object({
      id: z.string(),
      name: z.string()
    })),
    curriculums: z.array(z.object({
      id: z.string(),
      name: z.string()
    }))
  }),
  assigned: z.object({
    specialties: z.array(z.object({
      id: z.string(),
      name: z.string()
    })),
    curriculums: z.array(z.object({
      id: z.string(),
      name: z.string()
    }))
  }),
  interviewSimulation: z.object({
    id: z.string(),
    casePrompt: z.string(),
    openingLine: z.string(),
    timeLimitMinutes: z.number(),
    voiceModel: z.string(),
    warningTimeMinutes: z.number().nullable(),
    creditCost: z.number(),
    // Include provider keys in response
    sttProviderKey: z.string().nullable().optional(),
    llmProviderKey: z.string().nullable().optional(),
    ttsProviderKey: z.string().nullable().optional()
  }).nullable(),
  summary: z.object({
    totalSpecialties: z.number(),
    totalCurriculums: z.number(),
    newEntitiesCreated: z.number(),
    simulationCreated: z.boolean(),
    tabsCreated: z.number(),
    tabsUpdated: z.number(),
    markingCriteriaCreated: z.number()
  })
})

// Type exports
export type CreateInterviewCaseInput = z.infer<typeof createInterviewCaseSchema>
export type UpdateInterviewCaseInput = z.infer<typeof updateInterviewCaseSchema>
export type InterviewCaseParams = z.infer<typeof interviewCaseParamsSchema>
export type InterviewCaseInterviewCourseParams = z.infer<typeof interviewCaseInterviewCourseParamsSchema>
export type ReorderInterviewCaseInput = z.infer<typeof reorderInterviewCaseSchema>
export type InterviewCaseResponse = z.infer<typeof interviewCaseResponseSchema>
export type PatientGender = z.infer<typeof PatientGenderEnum>
export type CreateCompleteInterviewCaseInput = z.infer<typeof createCompleteInterviewCaseSchema>
export type UpdateCompleteInterviewCaseInput = z.infer<typeof updateCompleteInterviewCaseSchema>
export type CompleteInterviewCaseResponse = z.infer<typeof completeInterviewCaseResponseSchema>
