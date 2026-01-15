import { z } from 'zod'

// Toggle Bookmark Schema
export const toggleBookmarkSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseCaseId: z.string().uuid('Invalid course case ID'),
  isBookmarked: z.boolean()
})

// Get Student Status Schema
export const getStudentStatusSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseCaseId: z.string().uuid('Invalid course case ID')
})

// Get Student Status for Course Schema
export const getStudentStatusForCourseSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseId: z.string().uuid('Invalid course ID')
})

// URL Params Schemas
export const studentCasePracticeParamsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseCaseId: z.string().uuid('Invalid course case ID')
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
export type StudentCasePracticeParams = z.infer<typeof studentCasePracticeParamsSchema>
export type StudentStatusResponse = z.infer<typeof studentStatusResponseSchema>
