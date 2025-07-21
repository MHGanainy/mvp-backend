import { z } from 'zod'

// Helper function to generate slug from title
const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Create Exam Schema
export const createExamSchema = z.object({
  instructorId: z.string().uuid('Invalid instructor ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  slug: z.string()
    .min(1, 'Slug is required')
    .max(200, 'Slug must be less than 200 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  isActive: z.boolean().default(true).optional()
}).transform((data) => ({
  ...data,
  // Auto-generate slug from title if not provided
  slug: data.slug || generateSlug(data.title)
}))

// Update Exam Schema
export const updateExamSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  slug: z.string()
    .min(1, 'Slug is required')
    .max(200, 'Slug must be less than 200 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  isActive: z.boolean().optional()
})

// URL Params Schema
export const examParamsSchema = z.object({
  id: z.string().uuid('Invalid exam ID')
})

// Instructor Params Schema (for instructor-specific queries)
export const examInstructorParamsSchema = z.object({
  instructorId: z.string().uuid('Invalid instructor ID')
})

// Basic Response Schema (without relations)
export const examResponseSchema = z.object({
  id: z.string(),
  instructorId: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  instructor: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    bio: z.string().nullable()
  })
})

// Comprehensive Response Schema (with all relations)
export const examWithRelationsResponseSchema = z.object({
  id: z.string(),
  instructorId: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  instructor: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    bio: z.string().nullable()
  }),
  specialties: z.array(z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date()
  })),
  curriculums: z.array(z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date()
  })),
  markingDomains: z.array(z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date()
  })),
  _count: z.object({
    courses: z.number(),
    examSpecialties: z.number(),
    examCurriculums: z.number(),
    examMarkingDomains: z.number()
  }).optional()
})

// Schema for creating complete exam with all relations
export const createCompleteExamSchema = z.object({
  // Basic exam info
  exam: z.object({
    instructorId: z.string().uuid('Invalid instructor ID'),
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title must be less than 200 characters')
      .trim(),
    slug: z.string()
      .min(1, 'Slug is required')
      .max(200, 'Slug must be less than 200 characters')
      .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
      .optional(),
    description: z.string()
      .max(1000, 'Description must be less than 1000 characters')
      .optional(),
    isActive: z.boolean().default(true).optional()
  }),
  
  // Existing entities (by ID)
  existing: z.object({
    specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).default([]),
    curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).default([]),
    markingDomainIds: z.array(z.string().uuid('Invalid marking domain ID')).default([])
  }).optional(),
  
  // New entities to create
  new: z.object({
    specialties: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([]),
    curriculums: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([]),
    markingDomains: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([])
  }).optional()
})

// Schema for updating complete exam with all relations
export const updateCompleteExamSchema = z.object({
  // Basic exam info updates
  exam: z.object({
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title must be less than 200 characters')
      .trim()
      .optional(),
    slug: z.string()
      .min(1, 'Slug is required')
      .max(200, 'Slug must be less than 200 characters')
      .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
      .optional(),
    description: z.string()
      .max(1000, 'Description must be less than 1000 characters')
      .optional(),
    isActive: z.boolean().optional()
  }).optional(),
  
  // Existing entities (by ID) - these will replace current assignments
  existing: z.object({
    specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).default([]),
    curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).default([]),
    markingDomainIds: z.array(z.string().uuid('Invalid marking domain ID')).default([])
  }).optional(),
  
  // New entities to create
  new: z.object({
    specialties: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([]),
    curriculums: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([]),
    markingDomains: z.array(z.object({
      name: z.string().min(1).max(100).trim()
    })).default([])
  }).optional()
})

// Response schema for complete exam creation
export const completeExamResponseSchema = z.object({
  exam: z.object({
    id: z.string(),
    instructorId: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean()
  }),
  created: z.object({
    specialties: z.array(z.object({
      id: z.string(),
      name: z.string()
    })),
    curriculums: z.array(z.object({
      id: z.string(),
      name: z.string()
    })),
    markingDomains: z.array(z.object({
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
    })),
    markingDomains: z.array(z.object({
      id: z.string(),
      name: z.string()
    }))
  }),
  summary: z.object({
    totalSpecialties: z.number(),
    totalCurriculums: z.number(),
    totalMarkingDomains: z.number(),
    newEntitiesCreated: z.number()
  })
})

// Type exports
export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
export type ExamParams = z.infer<typeof examParamsSchema>
export type ExamInstructorParams = z.infer<typeof examInstructorParamsSchema>
export type ExamResponse = z.infer<typeof examResponseSchema>
export type ExamWithRelationsResponse = z.infer<typeof examWithRelationsResponseSchema>
export type CreateCompleteExamInput = z.infer<typeof createCompleteExamSchema>
export type UpdateCompleteExamInput = z.infer<typeof updateCompleteExamSchema>
export type CompleteExamResponse = z.infer<typeof completeExamResponseSchema>