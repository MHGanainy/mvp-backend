import { z } from 'zod'

export const tagIdParamsSchema = z.object({
  id: z.string().uuid('Invalid tag ID'),
})

export const createTagSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().trim().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
})

export type CreateTagInput = z.infer<typeof createTagSchema>
