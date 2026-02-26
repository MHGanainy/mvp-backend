import { z } from 'zod'
import { FastifyInstance } from 'fastify'
import { InstructorService } from './instructor.service'
import { 
  createInstructorSchema, 
  updateInstructorSchema 
} from './instructor.schema'
import { replyInternalError } from '../../shared/route-error'

// Updated params schema for userId (integer)
const instructorUserParamsSchema = z.object({
  userId: z.string().transform(val => parseInt(val)).refine(val => !isNaN(val), 'Invalid user ID')
})

export default async function instructorRoutes(fastify: FastifyInstance) {
  const instructorService = new InstructorService(fastify.prisma)

  // GET /instructors - Get all instructors
  fastify.get('/instructors', async (request, reply) => {
    try {
      const instructors = await instructorService.findAll()
      reply.send(instructors)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch instructors')
    }
  })

  // GET /instructors/:userId - Get instructor by User ID
  fastify.get('/instructors/:userId', async (request, reply) => {
    try {
      const { userId } = instructorUserParamsSchema.parse(request.params)
      const instructor = await instructorService.findByUserId(userId)
      reply.send(instructor)
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /instructors - Create new instructor (creates User + Instructor)
  fastify.post('/instructors', async (request, reply) => {
    try {
      const data = createInstructorSchema.parse(request.body)
      const instructor = await instructorService.create(data)
      reply.status(201).send(instructor)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint failed')) {
        reply.status(400).send({ error: 'Email already exists' })
      } else {
        reply.status(400).send({ error: 'Invalid data' })
      }
    }
  })

  // PUT /instructors/:userId - Update instructor by User ID
  fastify.put('/instructors/:userId', async (request, reply) => {
    try {
      const { userId } = instructorUserParamsSchema.parse(request.params)
      const data = updateInstructorSchema.parse(request.body)
      
      // Get instructor by userId first to get the UUID for update
      const existingInstructor = await instructorService.findByUserId(userId)
      const instructor = await instructorService.update(existingInstructor.id, data)
      reply.send(instructor)
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /instructors/:userId - Delete instructor by User ID
  fastify.delete('/instructors/:userId', async (request, reply) => {
    try {
      const { userId } = instructorUserParamsSchema.parse(request.params)
      
      // Get instructor by userId first to get the UUID for deletion
      const existingInstructor = await instructorService.findByUserId(userId)
      await instructorService.delete(existingInstructor.id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}