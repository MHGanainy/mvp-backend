import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TagService } from './tag.service'
import { createTagSchema } from './tag.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

const CACHE_PUBLIC = 'public, s-maxage=3600, stale-while-revalidate=86400'

export default async function tagRoutes(fastify: FastifyInstance) {
  const service = new TagService(fastify.prisma)

  // GET /blog/tags (public)
  fastify.get('/blog/tags', async (request, reply) => {
    try {
      const tags = await service.findAll()
      reply.header('Cache-Control', CACHE_PUBLIC).send(tags)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch tags')
    }
  })

  // POST /blog/tags (admin)
  fastify.post('/blog/tags', { preHandler: authenticate }, async (request, reply) => {
    try {
      if (!isAdmin(request)) return reply.status(403).send({ error: 'Admin access required' })
      const data = createTagSchema.parse(request.body)
      const tag = await service.create(data)
      reply.status(201).send(tag)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: error.errors })
      }
      replyInternalError(request, reply, error, 'Failed to create tag')
    }
  })
}
