import { z } from 'zod'
import { PatientGenderEnum } from '../course-case/course-case.schema'

// CaseTabType enum - ADJUSTED: 'MARKING_CRITERIA' has been removed.
export const CaseTabTypeEnum = z.enum(['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES'])
export type CaseTabType = z.infer<typeof CaseTabTypeEnum>

// Create CaseTab Schema
export const createCaseTabSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  tabType: CaseTabTypeEnum,
  content: z.array(z.string())
    .default([])
    .refine(arr => arr.every(item => item.length <= 10000), 
      'Each content item must be less than 10,000 characters')
})

// Update CaseTab Schema
export const updateCaseTabSchema = z.object({
  content: z.array(z.string())
    .optional()
    .refine(arr => !arr || arr.every(item => item.length <= 10000), 
      'Each content item must be less than 10,000 characters')
})

// URL Params Schemas
export const caseTabParamsSchema = z.object({
  id: z.string().uuid('Invalid case tab ID')
})

export const caseTabCourseCaseParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID')
})

export const caseTabTypeParamsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID'),
  tabType: CaseTabTypeEnum
})

export const courseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

// Bulk update schema - ADJUSTED: Max tabs is now 3
export const bulkUpdateCaseTabSchema = z.object({
  tabUpdates: z.array(z.object({
    tabType: CaseTabTypeEnum,
    content: z.array(z.string())
      .refine(arr => arr.every(item => item.length <= 10000), 
        'Each content item must be less than 10,000 characters')
  })).min(1, 'At least one tab update is required').max(3, 'Cannot update more than 3 tabs')
})

// Create all tabs schema
export const createAllTabsSchema = z.object({
  courseCaseId: z.string().uuid('Invalid course case ID')
})

// Response Schema
export const caseTabResponseSchema = z.object({
  id: z.string(),
  courseCaseId: z.string(),
  tabType: CaseTabTypeEnum,
  content: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
  courseCase: z.object({
    id: z.string(),
    title: z.string(),
    diagnosis: z.string(),
    patientName: z.string(),
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

// Stats response schemas
export const caseTabStatsResponseSchema = z.object({
  courseCaseId: z.string(),
  totalTabs: z.number(),
  completedTabs: z.number(),
  emptyTabs: z.number(),
  tabDetails: z.array(z.object({
    tabType: CaseTabTypeEnum,
    hasContent: z.boolean(),
    contentItems: z.number(),
    totalContentLength: z.number(),
    lastUpdated: z.date()
  }))
})

export const courseTabsOverviewResponseSchema = z.object({
  courseId: z.string(),
  totalCases: z.number(),
  casesWithAllTabs: z.number(),
  casesWithCompletedContent: z.number(),
  averageCompletion: z.number(),
  caseDetails: z.array(z.object({
    caseId: z.string(),
    caseTitle: z.string(),
    totalTabs: z.number(),
    completedTabs: z.number(),
    completionPercentage: z.number()
  }))
})

// Type exports
export type CreateCaseTabInput = z.infer<typeof createCaseTabSchema>
export type UpdateCaseTabInput = z.infer<typeof updateCaseTabSchema>
export type CaseTabParams = z.infer<typeof caseTabParamsSchema>
export type CaseTabCourseCaseParams = z.infer<typeof caseTabCourseCaseParamsSchema>
export type CaseTabTypeParams = z.infer<typeof caseTabTypeParamsSchema>
export type CourseParams = z.infer<typeof courseParamsSchema>
export type BulkUpdateCaseTabInput = z.infer<typeof bulkUpdateCaseTabSchema>
export type CreateAllTabsInput = z.infer<typeof createAllTabsSchema>
export type CaseTabResponse = z.infer<typeof caseTabResponseSchema>
export type CaseTabStatsResponse = z.infer<typeof caseTabStatsResponseSchema>
export type CourseTabsOverviewResponse = z.infer<typeof courseTabsOverviewResponseSchema>