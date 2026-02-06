import { z } from 'zod'

// Toggle Bookmark Schema
export const toggleBookmarkSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewCaseId: z.string().uuid('Invalid interview case ID'),
  isBookmarked: z.boolean()
})

// Get Student Status Schema
export const getStudentStatusSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewCaseId: z.string().uuid('Invalid interview case ID')
})

// Get Student Status for Course Schema
export const getStudentStatusForCourseSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewCourseId: z.string().uuid('Invalid interview course ID')
})

// URL Params Schemas
export const studentInterviewPracticeParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  interviewCaseId: z.string().uuid('Invalid interview case ID')
})

// Response Schema
export const studentStatusResponseSchema = z.object({
  isPracticed: z.boolean(),
  practiceCount: z.number(),
  firstPracticedAt: z.date().nullable(),
  lastPracticedAt: z.date().nullable(),
  isBookmarked: z.boolean(),
  bookmarkedAt: z.date().nullable()
})

// Type exports
export type ToggleBookmarkInput = z.infer<typeof toggleBookmarkSchema>
export type GetStudentStatusInput = z.infer<typeof getStudentStatusSchema>
export type GetStudentStatusForCourseInput = z.infer<typeof getStudentStatusForCourseSchema>
export type StudentInterviewPracticeParams = z.infer<typeof studentInterviewPracticeParamsSchema>
export type StudentStatusResponse = z.infer<typeof studentStatusResponseSchema>
