import { z } from 'zod'
import { PatientGenderEnum } from '../course-case/course-case.schema'

// InterviewCaseTabType enum - ADJUSTED: 'MARKING_CRITERIA' has been removed.
export const InterviewCaseTabTypeEnum = z.enum(['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES'])
export type InterviewCaseTabType = z.infer<typeof InterviewCaseTabTypeEnum>

// Create InterviewCaseTab Schema
export const createInterviewCaseTabSchema = z.object({
  interviewCaseId: z.string().uuid('Invalid interview case ID'),
  tabType: InterviewCaseTabTypeEnum,
  content: z.array(z.string())
    .default([])
    .refine(arr => arr.every(item => item.length <= 10000),
      'Each content item must be less than 10,000 characters')
})

// Update InterviewCaseTab Schema
export const updateInterviewCaseTabSchema = z.object({
  content: z.array(z.string())
    .optional()
    .refine(arr => !arr || arr.every(item => item.length <= 10000),
      'Each content item must be less than 10,000 characters')
})

// URL Params Schemas
export const interviewCaseTabParamsSchema = z.object({
  id: z.string().uuid('Invalid interview case tab ID')
})

export const interviewCaseTabInterviewCaseParamsSchema = z.object({
  interviewCaseId: z.string().uuid('Invalid interview case ID')
})

export const interviewCaseTabTypeParamsSchema = z.object({
  interviewCaseId: z.string().uuid('Invalid interview case ID'),
  tabType: InterviewCaseTabTypeEnum
})

export const interviewCourseParamsSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// Bulk update schema - ADJUSTED: Max tabs is now 3
export const bulkUpdateInterviewCaseTabSchema = z.object({
  tabUpdates: z.array(z.object({
    tabType: InterviewCaseTabTypeEnum,
    content: z.array(z.string())
      .refine(arr => arr.every(item => item.length <= 10000),
        'Each content item must be less than 10,000 characters')
  })).min(1, 'At least one tab update is required').max(3, 'Cannot update more than 3 tabs')
})

// Create all tabs schema
export const createAllTabsSchema = z.object({
  interviewCaseId: z.string().uuid('Invalid interview case ID')
})

// Response Schema
export const interviewCaseTabResponseSchema = z.object({
  id: z.string(),
  interviewCaseId: z.string(),
  tabType: InterviewCaseTabTypeEnum,
  content: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
  interviewCase: z.object({
    id: z.string(),
    title: z.string(),
    diagnosis: z.string(),
    patientName: z.string(),
    interviewCourse: z.object({
      id: z.string(),
      title: z.string(),
      interview: z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string()
      })
    })
  })
})

// Stats response schemas
export const interviewCaseTabStatsResponseSchema = z.object({
  interviewCaseId: z.string(),
  totalTabs: z.number(),
  completedTabs: z.number(),
  emptyTabs: z.number(),
  tabDetails: z.array(z.object({
    tabType: InterviewCaseTabTypeEnum,
    hasContent: z.boolean(),
    contentItems: z.number(),
    totalContentLength: z.number(),
    lastUpdated: z.date()
  }))
})

export const interviewCourseTabsOverviewResponseSchema = z.object({
  interviewCourseId: z.string(),
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
export type CreateInterviewCaseTabInput = z.infer<typeof createInterviewCaseTabSchema>
export type UpdateInterviewCaseTabInput = z.infer<typeof updateInterviewCaseTabSchema>
export type InterviewCaseTabParams = z.infer<typeof interviewCaseTabParamsSchema>
export type InterviewCaseTabInterviewCaseParams = z.infer<typeof interviewCaseTabInterviewCaseParamsSchema>
export type InterviewCaseTabTypeParams = z.infer<typeof interviewCaseTabTypeParamsSchema>
export type InterviewCourseParams = z.infer<typeof interviewCourseParamsSchema>
export type BulkUpdateInterviewCaseTabInput = z.infer<typeof bulkUpdateInterviewCaseTabSchema>
export type CreateAllTabsInput = z.infer<typeof createAllTabsSchema>
export type InterviewCaseTabResponse = z.infer<typeof interviewCaseTabResponseSchema>
export type InterviewCaseTabStatsResponse = z.infer<typeof interviewCaseTabStatsResponseSchema>
export type InterviewCourseTabsOverviewResponse = z.infer<typeof interviewCourseTabsOverviewResponseSchema>
