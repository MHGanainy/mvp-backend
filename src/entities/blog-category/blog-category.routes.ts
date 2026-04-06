import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BlogCategoryService } from './blog-category.service'
import {
  blogCategoryParamsSchema,
  blogCategoryIdParamsSchema,
  blogCategoryQuerySchema,
  paginatedArticlesByCategoryQuerySchema,
  createBlogCategorySchema,
  updateBlogCategorySchema,
} from './blog-category.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

const CACHE_PUBLIC = 'public, s-maxage=3600, stale-while-revalidate=86400'

export default async function blogCategoryRoutes(fastify: FastifyInstance) {
  const service = new BlogCategoryService(fastify.prisma)

  // ─── Public ─────────────────────────────────────────────

  // GET /blog/categories
  fastify.get('/blog/categories', async (request, reply) => {
    try {
      const { includeInactive } = blogCategoryQuerySchema.parse(request.query)
      const categories = await service.findAll(includeInactive && request.isAdmin)
      reply.header('Cache-Control', CACHE_PUBLIC).send(categories)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch categories')
    }
  })

  // GET /blog/categories/:slug
  fastify.get('/blog/categories/:slug', async (request, reply) => {
    try {
      const { slug } = blogCategoryParamsSchema.parse(request.params)
      const query = paginatedArticlesByCategoryQuerySchema.parse(request.query)
      const result = await service.findArticlesByCategory(slug, query)
      reply.header('Cache-Control', CACHE_PUBLIC).send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Category not found') {
        return reply.status(404).send({ error: 'Category not found' })
      }
      replyInternalError(request, reply, error, 'Failed to fetch category')
    }
  })

  // ─── Admin ──────────────────────────────────────────────

  // POST /blog/categories (admin)
  fastify.post('/blog/categories', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const data = createBlogCategorySchema.parse(request.body)
      const category = await service.create(data)
      reply.status(201).send(category)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to create category')
    }
  })

  // PUT /blog/categories/:id (admin)
  fastify.put('/blog/categories/:id', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const { id } = blogCategoryIdParamsSchema.parse(request.params)
      const data = updateBlogCategorySchema.parse(request.body)
      const category = await service.update(id, data)
      reply.send(category)
    } catch (error) {
      if (error instanceof Error && error.message === 'Category not found') {
        return reply.status(404).send({ error: 'Category not found' })
      }
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to update category')
    }
  })

  // DELETE /blog/categories/:id (admin)
  fastify.delete('/blog/categories/:id', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const { id } = blogCategoryIdParamsSchema.parse(request.params)
      await service.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Category not found') {
        return reply.status(404).send({ error: 'Category not found' })
      }
      if (error instanceof Error && error.message.includes('Cannot delete')) {
        return reply.status(400).send({ error: error.message })
      }
      replyInternalError(request, reply, error, 'Failed to delete category')
    }
  })
}
