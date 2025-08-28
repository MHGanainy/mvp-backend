import { FastifyInstance } from 'fastify'
import { MarkingDomainService } from './marking-domain.service'
import { 
  createMarkingDomainSchema, 
  updateMarkingDomainSchema, 
  markingDomainParamsSchema 
} from './marking-domain.schema'

export default async function markingDomainRoutes(fastify: FastifyInstance) {
  const markingDomainService = new MarkingDomainService(fastify.prisma)

  // GET /marking-domains - Get all marking domains
  fastify.get('/marking-domains', async (request, reply) => {
    try {
      const markingDomains = await markingDomainService.findAll()
      reply.send(markingDomains)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch marking domains' })
    }
  })

  // GET /marking-domains/:id - Get marking domain by ID
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

  // GET /marking-domains/:id/marking-criteria - Get all marking criteria for a domain
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

  // GET /marking-domains/:id/usage-stats - Get usage statistics for a marking domain
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

  // POST /marking-domains - Create new marking domain
  fastify.post('/marking-domains', async (request, reply) => {
    try {
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

  // PUT /marking-domains/:id - Update marking domain
  fastify.put('/marking-domains/:id', async (request, reply) => {
    try {
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

  // DELETE /marking-domains/:id - Delete marking domain
  fastify.delete('/marking-domains/:id', async (request, reply) => {
    try {
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