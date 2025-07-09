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

  // POST /marking-domains - Create new marking domain
  fastify.post('/marking-domains', async (request, reply) => {
    try {
      const data = createMarkingDomainSchema.parse(request.body)
      const markingDomain = await markingDomainService.create(data)
      reply.status(201).send(markingDomain)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid data or marking domain already exists' })
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
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}