import { z } from 'zod'

export const difficultyEnum = z.enum(['Beginner', 'Intermediate', 'Advanced'])

export const createMockExamConfigSchema = z.object({
  examId: z.string().uuid('Invalid exam ID'),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer').trim(),
  description: z.string().max(1000, 'Description must be 1000 characters or fewer').trim().optional(),
  difficulty: difficultyEnum.default('Intermediate'),
  stationCaseIds: z
    .array(z.string().uuid('Invalid course case ID'))
    .min(1, 'At least one station required')
    .max(50, 'Too many stations (max 50)'),
  isPublished: z.boolean().default(false),
  // Phase 6.C: admin-only override. Admins authoring on behalf of an instructor
  // (e.g. when the admin doesn't have their own instructor profile, or when
  // ghost-authoring) supply the target instructor here. The route layer
  // ignores this field for non-admin callers — they always author as themselves.
  instructorId: z.string().uuid('Invalid instructor ID').optional()
})

export const updateMockExamConfigSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).trim().optional(),
  difficulty: difficultyEnum.optional(),
  stationCaseIds: z
    .array(z.string().uuid('Invalid course case ID'))
    .min(1)
    .max(50)
    .optional(),
  isPublished: z.boolean().optional(),
  // Stage 6 (closes Stage 2 OQ #1): Restore support. Setting `isActive: true`
  // un-archives a previously soft-deleted config; setting `isActive: false`
  // is equivalent to a soft-delete (the existing DELETE route remains the
  // canonical archive path; this is for restore via the same update endpoint).
  isActive: z.boolean().optional()
})

export const mockExamConfigListQuerySchema = z.object({
  examId: z.string().uuid('Invalid exam ID')
})

export const mockExamConfigPublishSchema = z.object({
  isPublished: z.boolean()
})

export const mockExamConfigParamsSchema = z.object({
  id: z.string().uuid('Invalid mock exam config ID')
})

export type CreateMockExamConfigInput = z.infer<typeof createMockExamConfigSchema>
export type UpdateMockExamConfigInput = z.infer<typeof updateMockExamConfigSchema>
export type MockExamConfigListQuery = z.infer<typeof mockExamConfigListQuerySchema>
export type MockExamConfigPublishInput = z.infer<typeof mockExamConfigPublishSchema>
export type MockExamConfigParams = z.infer<typeof mockExamConfigParamsSchema>
