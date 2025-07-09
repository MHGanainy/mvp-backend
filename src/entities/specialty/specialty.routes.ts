import { FastifyInstance } from 'fastify'
import { SpecialtyService } from './specialty.service'
import { 
  createSpecialtySchema, 
  updateSpecialtySchema, 
  specialtyParamsSchema 
} from './specialty.schema'

export default async function specialtyRoutes(fastify: FastifyInstance) {
  const specialtyService = new SpecialtyService(fastify.prisma)

  // GET /specialties - Get all specialties
  fastify.get('/specialties', async (request, reply) => {
    try {
      const specialties = await specialtyService.findAll()
      reply.send(specialties)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch specialties' })
    }
  })

  // GET /specialties/:id - Get specialty by ID
  fastify.get('/specialties/:id', async (request, reply) => {
    try {
      const { id } = specialtyParamsSchema.parse(request.params)
      const specialty = await specialtyService.findById(id)
      reply.send(specialty)
    } catch (error) {
      if (error instanceof Error && error.message === 'Specialty not found') {
        reply.status(404).send({ error: 'Specialty not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /specialties - Create new specialty
  fastify.post('/specialties', async (request, reply) => {
    try {
      const data = createSpecialtySchema.parse(request.body)
      const specialty = await specialtyService.create(data)
      reply.status(201).send(specialty)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid data or specialty already exists' })
    }
  })

  // PUT /specialties/:id - Update specialty
  fastify.put('/specialties/:id', async (request, reply) => {
    try {
      const { id } = specialtyParamsSchema.parse(request.params)
      const data = updateSpecialtySchema.parse(request.body)
      const specialty = await specialtyService.update(id, data)
      reply.send(specialty)
    } catch (error) {
      if (error instanceof Error && error.message === 'Specialty not found') {
        reply.status(404).send({ error: 'Specialty not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /specialties/:id - Delete specialty
  fastify.delete('/specialties/:id', async (request, reply) => {
    try {
      const { id } = specialtyParamsSchema.parse(request.params)
      await specialtyService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Specialty not found') {
        reply.status(404).send({ error: 'Specialty not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}