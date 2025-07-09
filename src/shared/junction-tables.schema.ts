// junction-tables.schema.ts
import { z } from 'zod'
import { PatientGenderEnum } from '../entities/course-case/course-case.schema'

// ===== COURSE CASE JUNCTION SCHEMAS =====

// Assign Specialties Schema
export const assignSpecialtiesSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  specialtyIds: z.array(z.string().uuid('Invalid specialty ID'))
    .min(1, 'At least one specialty is required')
    .max(10, 'Cannot assign more than 10 specialties')
})

// Assign Curriculums Schema  
export const assignCurriculumsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  curriculumIds: z.array(z.string().uuid('Invalid curriculum ID'))
    .min(1, 'At least one curriculum item is required')
    .max(15, 'Cannot assign more than 15 curriculum items')
})

// Filter Cases Schema
export const filterCasesSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).optional(),
  curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).optional(),
  isFree: z.boolean().optional(),
  patientGender: PatientGenderEnum.optional()
})

// Bulk Assignment Schema
export const bulkAssignFiltersSchema = z.object({
  assignments: z.array(z.object({
    courseCaseId: z.string().uuid('Invalid course case ID'),
    specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).optional(),
    curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).optional()
  })).min(1, 'At least one assignment is required').max(50, 'Cannot process more than 50 assignments at once')
})

// Remove Assignment Schemas
export const removeSpecialtySchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  specialtyId: z.string().uuid('Invalid specialty ID')
})

export const removeCurriculumSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  curriculumId: z.string().uuid('Invalid curriculum ID')
})

// URL Params Schemas
export const courseCaseParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID')
})

export const courseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

export const specialtyRemoveParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  specialtyId: z.string().uuid('Invalid specialty ID')
})

export const curriculumRemoveParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  curriculumId: z.string().uuid('Invalid curriculum ID')
})

// Query Params Schema (for filtering)
export const filterQuerySchema = z.object({
  specialtyIds: z.string().optional().transform((val) => 
    val ? val.split(',').filter(id => id.trim().length > 0) : undefined
  ),
  curriculumIds: z.string().optional().transform((val) => 
    val ? val.split(',').filter(id => id.trim().length > 0) : undefined
  ),
  isFree: z.string().optional().transform((val) => 
    val === 'true' ? true : val === 'false' ? false : undefined
  ),
  patientGender: z.string().optional().refine((val) => 
    !val || ['MALE', 'FEMALE', 'OTHER'].includes(val), 'Invalid patient gender'
  ).transform((val) => val as 'MALE' | 'FEMALE' | 'OTHER' | undefined)
})

// Response Schemas
export const caseWithFiltersResponseSchema = z.object({
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
  specialties: z.array(z.object({
    id: z.string(),
    name: z.string()
  })),
  curriculums: z.array(z.object({
    id: z.string(),
    name: z.string()
  })),
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

export const filteringStatsResponseSchema = z.object({
  courseId: z.string(),
  totalCases: z.number(),
  specialtyDistribution: z.array(z.object({
    specialtyId: z.string(),
    count: z.number(),
    specialty: z.object({
      id: z.string(),
      name: z.string()
    })
  })),
  curriculumDistribution: z.array(z.object({
    curriculumId: z.string(),
    count: z.number(),
    curriculum: z.object({
      id: z.string(),
      name: z.string()
    })
  }))
})

// ===== EXAM JUNCTION SCHEMAS =====

// Assign Specialties to Exam Schema
export const assignExamSpecialtiesSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  specialtyIds: z.array(z.string().uuid('Invalid specialty ID'))
    .min(1, 'At least one specialty is required')
    .max(20, 'Cannot assign more than 20 specialties')
})

// Assign Curriculums to Exam Schema  
export const assignExamCurriculumsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  curriculumIds: z.array(z.string().uuid('Invalid curriculum ID'))
    .min(1, 'At least one curriculum item is required')
    .max(30, 'Cannot assign more than 30 curriculum items')
})

// Assign Marking Domains to Exam Schema
export const assignExamMarkingDomainsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  markingDomainIds: z.array(z.string().uuid('Invalid marking domain ID'))
    .min(1, 'At least one marking domain is required')
    .max(15, 'Cannot assign more than 15 marking domains')
})

// Bulk Configuration Schema
export const bulkConfigureExamSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  specialtyIds: z.array(z.string().uuid('Invalid specialty ID')).optional(),
  curriculumIds: z.array(z.string().uuid('Invalid curriculum ID')).optional(),
  markingDomainIds: z.array(z.string().uuid('Invalid marking domain ID')).optional()
}).refine(
  (data) => data.specialtyIds || data.curriculumIds || data.markingDomainIds,
  { message: 'At least one assignment type must be provided' }
)

// URL Params Schemas for Exam Removal Operations
export const examRemoveSpecialtyParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  specialtyId: z.string().uuid('Invalid specialty ID')
})

export const examRemoveCurriculumParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  curriculumId: z.string().uuid('Invalid curriculum ID')
})

export const examRemoveMarkingDomainParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  markingDomainId: z.string().uuid('Invalid marking domain ID')
})

// Exam Response Schemas
export const examConfigurationResponseSchema = z.object({
  exam: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean()
  }),
  configuration: z.object({
    specialties: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional()
    })),
    curriculums: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional()
    })),
    markingDomains: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional()
    }))
  }),
  summary: z.object({
    specialtiesCount: z.number(),
    curriculumsCount: z.number(),
    markingDomainsCount: z.number(),
    isFullyConfigured: z.boolean()
  })
})

export const examUsageStatsResponseSchema = z.object({
  examId: z.string(),
  examTitle: z.string(),
  usage: z.object({
    coursesCount: z.number(),
    casesCount: z.number(),
    simulationsCount: z.number()
  }),
  configuration: z.object({
    specialtiesCount: z.number(),
    curriculumsCount: z.number(),
    markingDomainsCount: z.number()
  })
})

// ===== TYPE EXPORTS =====

// Course Case Types
export type AssignSpecialtiesInput = z.infer<typeof assignSpecialtiesSchema>
export type AssignCurriculumsInput = z.infer<typeof assignCurriculumsSchema>
export type FilterCasesInput = z.infer<typeof filterCasesSchema>
export type BulkAssignFiltersInput = z.infer<typeof bulkAssignFiltersSchema>
export type RemoveSpecialtyInput = z.infer<typeof removeSpecialtySchema>
export type RemoveCurriculumInput = z.infer<typeof removeCurriculumSchema>
export type CourseCaseParams = z.infer<typeof courseCaseParamsSchema>
export type CourseParams = z.infer<typeof courseParamsSchema>
export type SpecialtyRemoveParams = z.infer<typeof specialtyRemoveParamsSchema>
export type CurriculumRemoveParams = z.infer<typeof curriculumRemoveParamsSchema>
export type FilterQuery = z.infer<typeof filterQuerySchema>
export type CaseWithFiltersResponse = z.infer<typeof caseWithFiltersResponseSchema>
export type FilteringStatsResponse = z.infer<typeof filteringStatsResponseSchema>

// Exam Types
export type AssignExamSpecialtiesInput = z.infer<typeof assignExamSpecialtiesSchema>
export type AssignExamCurriculumsInput = z.infer<typeof assignExamCurriculumsSchema>
export type AssignExamMarkingDomainsInput = z.infer<typeof assignExamMarkingDomainsSchema>
export type BulkConfigureExamInput = z.infer<typeof bulkConfigureExamSchema>
export type ExamRemoveSpecialtyParams = z.infer<typeof examRemoveSpecialtyParamsSchema>
export type ExamRemoveCurriculumParams = z.infer<typeof examRemoveCurriculumParamsSchema>
export type ExamRemoveMarkingDomainParams = z.infer<typeof examRemoveMarkingDomainParamsSchema>
export type ExamConfigurationResponse = z.infer<typeof examConfigurationResponseSchema>
export type ExamUsageStatsResponse = z.infer<typeof examUsageStatsResponseSchema>