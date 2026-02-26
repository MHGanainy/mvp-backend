// src/entities/curriculum/curriculum.routes.ts
import { FastifyInstance } from 'fastify'
import { CurriculumService } from './curriculum.service'
import { 
  createCurriculumSchema, 
  updateCurriculumSchema, 
  curriculumParamsSchema 
} from './curriculum.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

export default async function curriculumRoutes(fastify: FastifyInstance) {
  const curriculumService = new CurriculumService(fastify.prisma)

  // GET /curriculums - Get all curriculums (PUBLIC)
  fastify.get('/curriculums', async (request, reply) => {
    try {
      const curriculums = await curriculumService.findAll()
      reply.send(curriculums)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch curriculums')
    }
  })

  // GET /curriculums/:id - Get curriculum by ID (PUBLIC)
  fastify.get('/curriculums/:id', async (request, reply) => {
    try {
      const { id } = curriculumParamsSchema.parse(request.params)
      const curriculum = await curriculumService.findById(id)
      reply.send(curriculum)
    } catch (error) {
      if (error instanceof Error && error.message === 'Curriculum not found') {
        reply.status(404).send({ error: 'Curriculum not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /curriculums - Create new curriculum (ADMIN ONLY)
  fastify.post('/curriculums', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to create curriculum items' })
        return
      }
      
      const data = createCurriculumSchema.parse(request.body)
      const curriculum = await curriculumService.create(data)
      reply.status(201).send(curriculum)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid data or curriculum already exists' })
    }
  })

  // PUT /curriculums/:id - Update curriculum (ADMIN ONLY)
  fastify.put('/curriculums/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to update curriculum items' })
        return
      }
      
      const { id } = curriculumParamsSchema.parse(request.params)
      const data = updateCurriculumSchema.parse(request.body)
      const curriculum = await curriculumService.update(id, data)
      reply.send(curriculum)
    } catch (error) {
      if (error instanceof Error && error.message === 'Curriculum not found') {
        reply.status(404).send({ error: 'Curriculum not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /curriculums/:id - Delete curriculum (ADMIN ONLY)
  fastify.delete('/curriculums/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required to delete curriculum items' })
        return
      }
      
      const { id } = curriculumParamsSchema.parse(request.params)
      await curriculumService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Curriculum not found') {
        reply.status(404).send({ error: 'Curriculum not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}