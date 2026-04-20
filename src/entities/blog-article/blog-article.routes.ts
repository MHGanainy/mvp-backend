import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BlogArticleService } from './blog-article.service'
import {
  blogArticlesQuerySchema,
  blogArticleSlugParamsSchema,
  blogArticleIdParamsSchema,
  topArticlesQuerySchema,
  createBlogArticleSchema,
  updateBlogArticleSchema,
} from './blog-article.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

const CACHE_PUBLIC = 'public, s-maxage=3600, stale-while-revalidate=86400'

export default async function blogArticleRoutes(fastify: FastifyInstance) {
  const service = new BlogArticleService(fastify.prisma)

  // ─── Public ─────────────────────────────────────────────

  // GET /blog/articles
  fastify.get('/blog/articles', async (request, reply) => {
    try {
      const query = blogArticlesQuerySchema.parse(request.query)
      // Non-admins can only see published articles
      if (!request.isAdmin) query.status = 'PUBLISHED'
      const result = await service.findAllPublished(query)
      reply.header('Cache-Control', CACHE_PUBLIC).send(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to fetch articles')
    }
  })

  // GET /blog/articles/:slug
  fastify.get('/blog/articles/:slug', async (request, reply) => {
    try {
      const { slug } = blogArticleSlugParamsSchema.parse(request.params)
      const article = await service.findBySlug(slug)
      // Non-admins must not see draft or archived articles
      if (!request.isAdmin && article.status !== 'PUBLISHED') {
        return reply.status(404).send({ error: 'Article not found' })
      }
      reply.header('Cache-Control', CACHE_PUBLIC).send(article)
    } catch (error) {
      if (error instanceof Error && error.message === 'Article not found') {
        return reply.status(404).send({ error: 'Article not found' })
      }
      replyInternalError(request, reply, error, 'Failed to fetch article')
    }
  })

  // GET /blog/top-articles
  fastify.get('/blog/top-articles', async (request, reply) => {
    try {
      const { limit } = topArticlesQuerySchema.parse(request.query)
      const articles = await service.findTopArticles(limit)
      reply.header('Cache-Control', CACHE_PUBLIC).send(articles)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch top articles')
    }
  })

  // POST /blog/articles/:id/views (public, rate-limited)
  fastify.post(
    '/blog/articles/:id/views',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        const { id } = blogArticleIdParamsSchema.parse(request.params)
        await service.incrementViews(id)
        reply.status(204).send()
      } catch (error) {
        reply.status(204).send() // fail silently for view tracking
      }
    }
  )

  // ─── Admin ──────────────────────────────────────────────

  // POST /blog/articles
  fastify.post('/blog/articles', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const data = createBlogArticleSchema.parse(request.body)
      const article = await service.create(data, request.user.userId)
      reply.status(201).send(article)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to create article')
    }
  })

  // PUT /blog/articles/:id
  fastify.put('/blog/articles/:id', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const { id } = blogArticleIdParamsSchema.parse(request.params)
      const data = updateBlogArticleSchema.parse(request.body)
      const article = await service.update(id, data)
      reply.send(article)
    } catch (error) {
      if (error instanceof Error && error.message === 'Article not found') {
        return reply.status(404).send({ error: 'Article not found' })
      }
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to update article')
    }
  })

  // DELETE /blog/articles/:id
  fastify.delete('/blog/articles/:id', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const { id } = blogArticleIdParamsSchema.parse(request.params)
      await service.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Article not found') {
        return reply.status(404).send({ error: 'Article not found' })
      }
      replyInternalError(request, reply, error, 'Failed to delete article')
    }
  })
}
