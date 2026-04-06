import { z } from 'zod'

export const blogCategoryParamsSchema = z.object({
  slug: z.string().min(1),
})

export const blogCategoryIdParamsSchema = z.object({
  id: z.string().uuid('Invalid category ID'),
})

export const blogCategoryQuerySchema = z.object({
  includeInactive: z.string().optional().transform((val) => val === 'true'),
})

export const paginatedArticlesByCategoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['published_date', 'view_count']).default('published_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const createBlogCategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().optional(),
  metaDescription: z.string().max(160).trim().optional(),
  featuredImageUrl: z.string().url().max(500).optional(),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const updateBlogCategorySchema = createBlogCategorySchema.partial()

export type BlogCategoryParams = z.infer<typeof blogCategoryParamsSchema>
export type PaginatedArticlesByCategoryQuery = z.infer<typeof paginatedArticlesByCategoryQuerySchema>
export type CreateBlogCategoryInput = z.infer<typeof createBlogCategorySchema>
export type UpdateBlogCategoryInput = z.infer<typeof updateBlogCategorySchema>
