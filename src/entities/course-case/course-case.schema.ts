import { z } from 'zod'
import { VoiceModelEnum } from '../simulation/simulation.schema'

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

// Update CourseCase Schema
export const updateCourseCaseSchema = z.object({
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

// Pagination Query Schema for course cases
export const paginatedCourseCasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  specialtyIds: z.string().optional().transform(val =>
    val ? val.split(',').filter(id => id.length > 0) : undefined
  ),
  curriculumIds: z.string().optional().transform(val =>
    val ? val.split(',').filter(id => id.length > 0) : undefined
  ),
  search: z.string().optional()
})

// Paginated response schema
export const paginatedCourseCasesResponseSchema = z.object({
  data: z.array(courseCaseResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean()
  })
})

// Complete Course Case Schemas
export const createCompleteCourseCaseSchema = z.object({
  // Basic course case info
  courseCase: z.object({
    courseId: z.string().uuid('Invalid course ID'),
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
  simulation: z.object({
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

// Update complete course case schema
export const updateCompleteCourseCaseSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  
  courseCase: z.object({
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
  markingCriteria: z.array(z.object({
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
  simulation: z.object({
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

// Response schema for complete course case - Updated to include provider keys
export const completeCourseCaseResponseSchema = z.object({
  courseCase: z.object({
    id: z.string(),
    courseId: z.string(),
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
  markingCriteria: z.array(z.object({
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
  simulation: z.object({
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
export type CreateCourseCaseInput = z.infer<typeof createCourseCaseSchema>
export type UpdateCourseCaseInput = z.infer<typeof updateCourseCaseSchema>
export type CourseCaseParams = z.infer<typeof courseCaseParamsSchema>
export type CourseCaseCourseParams = z.infer<typeof courseCaseCourseParamsSchema>
export type ReorderCourseCaseInput = z.infer<typeof reorderCourseCaseSchema>
export type CourseCaseResponse = z.infer<typeof courseCaseResponseSchema>
export type PatientGender = z.infer<typeof PatientGenderEnum>
export type CreateCompleteCourseCaseInput = z.infer<typeof createCompleteCourseCaseSchema>
export type UpdateCompleteCourseCaseInput = z.infer<typeof updateCompleteCourseCaseSchema>
export type CompleteCourseCaseResponse = z.infer<typeof completeCourseCaseResponseSchema>
export type PaginatedCourseCasesQuery = z.infer<typeof paginatedCourseCasesQuerySchema>
export type PaginatedCourseCasesResponse = z.infer<typeof paginatedCourseCasesResponseSchema>