import { FastifyInstance } from 'fastify'
import { CurriculumService } from './curriculum.service'
import { 
  createCurriculumSchema, 
  updateCurriculumSchema, 
  curriculumParamsSchema 
} from './curriculum.schema'

export default async function curriculumRoutes(fastify: FastifyInstance) {
  const curriculumService = new CurriculumService(fastify.prisma)

  // GET /curriculums - Get all curriculums
  fastify.get('/curriculums', async (request, reply) => {
    try {
      const curriculums = await curriculumService.findAll()
      reply.send(curriculums)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch curriculums' })
    }
  })

  // GET /curriculums/:id - Get curriculum by ID
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

  // POST /curriculums - Create new curriculum
  fastify.post('/curriculums', async (request, reply) => {
    try {
      const data = createCurriculumSchema.parse(request.body)
      const curriculum = await curriculumService.create(data)
      reply.status(201).send(curriculum)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid data or curriculum already exists' })
    }
  })

  // PUT /curriculums/:id - Update curriculum
  fastify.put('/curriculums/:id', async (request, reply) => {
    try {
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

  // DELETE /curriculums/:id - Delete curriculum
  fastify.delete('/curriculums/:id', async (request, reply) => {
    try {
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