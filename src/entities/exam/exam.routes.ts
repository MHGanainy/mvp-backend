import { FastifyInstance } from 'fastify'
import { ExamService } from './exam.service'
import { 
  createExamSchema, 
  updateExamSchema, 
  examParamsSchema,
  examInstructorParamsSchema
} from './exam.schema'

export default async function examRoutes(fastify: FastifyInstance) {
  const examService = new ExamService(fastify.prisma)

  // GET /exams - Get all exams
  fastify.get('/exams', async (request, reply) => {
    try {
      const exams = await examService.findAll()
      reply.send(exams)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch exams' })
    }
  })

  // GET /exams/active - Get only active exams
  fastify.get('/exams/active', async (request, reply) => {
    try {
      const exams = await examService.findActive()
      reply.send(exams)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch active exams' })
    }
  })

  // GET /exams/instructor/:instructorId - Get exams by instructor
  fastify.get('/exams/instructor/:instructorId', async (request, reply) => {
    try {
      const { instructorId } = examInstructorParamsSchema.parse(request.params)
      const exams = await examService.findByInstructor(instructorId)
      reply.send(exams)
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/slug/:slug - Get exam by slug (SEO-friendly URLs)
  fastify.get('/exams/slug/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string }
      const exam = await examService.findBySlug(slug)
      reply.send(exam)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:id - Get exam by ID
  fastify.get('/exams/:id', async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      const exam = await examService.findById(id)
      reply.send(exam)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /exams - Create new exam
  fastify.post('/exams', async (request, reply) => {
    try {
      const data = createExamSchema.parse(request.body)
      const exam = await examService.create(data)
      reply.status(201).send(exam)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Exam with this slug already exists') {
          reply.status(400).send({ error: 'Exam with this slug already exists' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /exams/:id - Update exam
  fastify.put('/exams/:id', async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      const data = updateExamSchema.parse(request.body)
      const exam = await examService.update(id, data)
      reply.send(exam)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Exam with this slug already exists') {
          reply.status(400).send({ error: 'Exam with this slug already exists' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /exams/:id/toggle - Toggle exam active status
  fastify.patch('/exams/:id/toggle', async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      const exam = await examService.toggleActive(id)
      reply.send({
        message: `Exam ${exam.isActive ? 'activated' : 'deactivated'} successfully`,
        exam
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /exams/:id - Delete exam
  fastify.delete('/exams/:id', async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      await examService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}