import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CourseCaseService } from './course-case.service'
import { 
  createCourseCaseSchema, 
  updateCourseCaseSchema, 
  courseCaseParamsSchema,
  courseCaseCourseParamsSchema,
  reorderCourseCaseSchema,
  PatientGenderEnum
} from './course-case.schema'

// Additional schemas for query parameters
const genderParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  gender: PatientGenderEnum
})

export default async function courseCaseRoutes(fastify: FastifyInstance) {
  const courseCaseService = new CourseCaseService(fastify.prisma)

  // GET /course-cases - Get all course cases
  fastify.get('/course-cases', async (request, reply) => {
    try {
      const courseCases = await courseCaseService.findAll()
      reply.send(courseCases)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch course cases' })
    }
  })

  // GET /course-cases/course/:courseId - Get cases by course
  fastify.get('/course-cases/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findByCourse(courseId)
      reply.send(courseCases)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /course-cases/course/:courseId/free - Get free cases by course
  fastify.get('/course-cases/course/:courseId/free', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findFreeCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/paid - Get paid cases by course
  fastify.get('/course-cases/course/:courseId/paid', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findPaidCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/gender/:gender - Get cases by patient gender
  fastify.get('/course-cases/course/:courseId/gender/:gender', async (request, reply) => {
    try {
      const { courseId, gender } = genderParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findByGender(courseId, gender)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/stats - Get course case statistics
  fastify.get('/course-cases/course/:courseId/stats', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const stats = await courseCaseService.getCaseStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/age-range - Get age range statistics
  fastify.get('/course-cases/course/:courseId/age-range', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const ageRange = await courseCaseService.getAgeRange(courseId)
      reply.send(ageRange)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/:id - Get course case by ID
  fastify.get('/course-cases/:id', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const courseCase = await courseCaseService.findById(id)
      reply.send(courseCase)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /course-cases - Create new course case
  fastify.post('/course-cases', async (request, reply) => {
    try {
      const data = createCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.create(data)
      reply.status(201).send(courseCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Cases can only be added to RANDOM style courses') {
          reply.status(400).send({ error: 'Cases can only be added to RANDOM style courses' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /course-cases/:id - Update course case
  fastify.put('/course-cases/:id', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const data = updateCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.update(id, data)
      reply.send(courseCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /course-cases/:id/toggle-free - Toggle case free status
  fastify.patch('/course-cases/:id/toggle-free', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const courseCase = await courseCaseService.toggleFree(id)
      reply.send({
        message: `Case ${courseCase.isFree ? 'marked as free' : 'marked as paid'} successfully`,
        courseCase
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /course-cases/:id/reorder - Reorder course case
  fastify.patch('/course-cases/:id/reorder', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { newOrder } = reorderCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.reorder(id, newOrder)
      reply.send({
        message: `Case reordered to position ${newOrder} successfully`,
        courseCase
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:id - Delete course case
  fastify.delete('/course-cases/:id', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      await courseCaseService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}