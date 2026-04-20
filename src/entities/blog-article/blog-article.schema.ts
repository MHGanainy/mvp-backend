import { z } from 'zod'

// ─── Public Query Schemas ───────────────────────────────────

export const blogArticleSlugParamsSchema = z.object({
  slug: z.string().min(1),
})

export const blogArticleIdParamsSchema = z.object({
  id: z.string().uuid('Invalid article ID'),
})

export const blogArticlesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['published_date', 'updated_date', 'view_count']).default('published_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const topArticlesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

// ─── Admin Create/Update Schemas ────────────────────────────

export const createBlogArticleSchema = z.object({
  headline: z.string().min(1).max(110).trim(),
  subheadline: z.string().max(150).trim().optional(),
  metaDescription: z.string().min(1).max(160).trim(),
  metaKeywords: z.array(z.string().trim()).max(15).default([]),
  content: z.string().min(1),
  excerpt: z.string().min(1).trim(),
  tldr: z.string().trim().optional(),
  primaryCategoryId: z.string().uuid(),
  secondaryCategoryIds: z.array(z.string().uuid()).default([]),
  tagIds: z.array(z.string().uuid()).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  featuredImageUrl: z.string().url(),
  featuredImageAlt: z.string().min(1).trim(),
  featuredImageCaption: z.string().trim().optional(),
  blurDataUrl: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  faqs: z
    .array(
      z.object({
        question: z.string().min(1).trim(),
        answer: z.string().min(1).trim(),
        position: z.number().int().min(1),
      })
    )
    .default([]),
})

export const updateBlogArticleSchema = createBlogArticleSchema.partial()

export type BlogArticlesQuery = z.infer<typeof blogArticlesQuerySchema>
export type CreateBlogArticleInput = z.infer<typeof createBlogArticleSchema>
export type UpdateBlogArticleInput = z.infer<typeof updateBlogArticleSchema>
