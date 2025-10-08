// src/entities/marking-domain/marking-domain.routes.ts
import { FastifyInstance } from 'fastify'
import { MarkingDomainService } from './marking-domain.service'
import { 
  createMarkingDomainSchema, 
  updateMarkingDomainSchema, 
  markingDomainParamsSchema 
} from './marking-domain.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'

export default async function markingDomainRoutes(fastify: FastifyInstance) {
  const markingDomainService = new MarkingDomainService(fastify.prisma)

  // GET /marking-domains - Get all marking domains (PUBLIC)
  fastify.get('/marking-domains', async (request, reply) => {
    try {
      const markingDomains = await markingDomainService.findAll()
      reply.send(markingDomains)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch marking domains' })
    }
  })

  // GET /marking-domains/:id - Get marking domain by ID (PUBLIC)
  fastify.get('/marking-domains/:id', async (request, reply) => {
    try {
      const { id } = markingDomainParamsSchema.parse(request.params)
      const markingDomain = await markingDomainService.findById(id)
      reply.send(markingDomain)
    } catch (error) {
      if (error instanceof Error && error.message === 'MarkingDomain not found') {
        reply.status(404).send({ error: 'MarkingDomain not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /marking-domains/:id/marking-criteria - Get all marking criteria for a domain (PUBLIC)
  fastify.get('/marking-domains/:id/marking-criteria', async (request, reply) => {
    try {
      const { id } = markingDomainParamsSchema.parse(request.params)
      const markingCriteria = await markingDomainService.getMarkingCriteria(id)
      reply.send(markingCriteria)
    } catch (error) {
      if (error instanceof Error && error.message === 'MarkingDomain not found') {
        reply.status(404).send({ error: 'MarkingDomain not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /marking-domains/:id/usage-stats - Get usage statistics for a marking domain (PUBLIC)
  fastify.get('/marking-domains/:id/usage-stats', async (request, reply) => {
    try {
      const { id } = markingDomainParamsSchema.parse(request.params)
      const stats = await markingDomainService.getUsageStats(id)
      reply.send(stats)
    } catch (error) {
      if (error instanceof Error && error.message === 'MarkingDomain not found') {
        reply.status(404).send({ error: 'MarkingDomain not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /marking-domains - Create new marking domain (ADMIN ONLY)
  fastify.post('/marking-domains', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to create marking domains' })
        return
      }
      
      const data = createMarkingDomainSchema.parse(request.body)
      const markingDomain = await markingDomainService.create(data)
      reply.status(201).send(markingDomain)
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        reply.status(409).send({ error: 'Marking domain with this name already exists' })
      } else {
        reply.status(400).send({ error: 'Invalid data' })
      }
    }
  })

  // PUT /marking-domains/:id - Update marking domain (ADMIN ONLY)
  fastify.put('/marking-domains/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to update marking domains' })
        return
      }
      
      const { id } = markingDomainParamsSchema.parse(request.params)
      const data = updateMarkingDomainSchema.parse(request.body)
      const markingDomain = await markingDomainService.update(id, data)
      reply.send(markingDomain)
    } catch (error) {
      if (error instanceof Error && error.message === 'MarkingDomain not found') {
        reply.status(404).send({ error: 'MarkingDomain not found' })
      } else if (error instanceof Error && error.message.includes('already exists')) {
        reply.status(409).send({ error: 'Marking domain with this name already exists' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /marking-domains/:id - Delete marking domain (ADMIN ONLY)
  fastify.delete('/marking-domains/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to delete marking domains' })
        return
      }
      
      const { id } = markingDomainParamsSchema.parse(request.params)
      await markingDomainService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'MarkingDomain not found') {
        reply.status(404).send({ error: 'MarkingDomain not found' })
      } else if (error instanceof Error && error.message.includes('Cannot delete')) {
        reply.status(409).send({ error: error.message })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}