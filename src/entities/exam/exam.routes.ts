// exam.routes.ts
import { FastifyInstance } from 'fastify'
import { ExamService } from './exam.service'
import { 
  createExamSchema, 
  updateExamSchema, 
  examParamsSchema,
  examInstructorParamsSchema,
  createCompleteExamSchema,
  updateCompleteExamSchema
} from './exam.schema'
import {
  assignExamSpecialtiesSchema,
  assignExamCurriculumsSchema,
  assignExamMarkingDomainsSchema,
  bulkConfigureExamSchema,
  examRemoveSpecialtyParamsSchema,
  examRemoveCurriculumParamsSchema,
  examRemoveMarkingDomainParamsSchema
} from '../../shared/junction-tables.schema'
import { z } from 'zod'

// Additional schema for examId parameter routes
const examIdParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID')
})

// Note: Using type assertions for request.params to resolve TypeScript 'unknown' type issues
// This is safe because Fastify will populate params according to route definitions

export default async function examRoutes(fastify: FastifyInstance) {
  const examService = new ExamService(fastify.prisma)

  // ===== BASIC EXAM CRUD OPERATIONS =====

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

  // POST /exams/create-complete - Create exam with all relations in one request
  fastify.post('/exams/create-complete', async (request, reply) => {
    try {
      const data = createCompleteExamSchema.parse(request.body)
      const result = await examService.createCompleteExam(data)
      
      reply.status(201).send({
        message: 'Exam created and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Exam with this slug already exists') {
          reply.status(400).send({ error: 'Exam with this slug already exists' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
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

  // PUT /exams/update-complete - Update exam with all relations in one request (examId in body)
  fastify.put('/exams/update-complete', async (request, reply) => {
    try {
      const data = updateCompleteExamSchema.parse(request.body)
      const { examId, ...updateData } = data
      const result = await examService.updateCompleteExam(examId, updateData)
      
      reply.send({
        message: 'Exam updated and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Exam with this slug already exists') {
          reply.status(400).send({ error: 'Exam with this slug already exists' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
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

  // ===== EXAM CONFIGURATION & JUNCTION TABLE OPERATIONS =====

  // GET /exams/:examId/configuration - Get complete exam configuration
  fastify.get('/exams/:examId/configuration', async (request, reply) => {
    try {
      // Alternative approach using dedicated schema validation
      const { examId } = examIdParamsSchema.parse(request.params)
      const configuration = await examService.getExamConfiguration(examId)
      reply.send(configuration)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examId/specialties - Get exam specialties
  fastify.get('/exams/:examId/specialties', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const specialties = await examService.getExamSpecialties(examId)
      reply.send(specialties)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examId/curriculums - Get exam curriculum items
  fastify.get('/exams/:examId/curriculums', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const curriculums = await examService.getExamCurriculums(examId)
      reply.send(curriculums)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examId/marking-domains - Get exam marking domains
  fastify.get('/exams/:examId/marking-domains', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const markingDomains = await examService.getExamMarkingDomains(examId)
      reply.send(markingDomains)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examId/usage-stats - Get exam usage statistics
  fastify.get('/exams/:examId/usage-stats', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const stats = await examService.getExamUsageStats(examId)
      reply.send(stats)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // ===== ASSIGNMENT OPERATIONS =====

  // POST /exams/assign-specialties - Assign specialties to exam
  fastify.post('/exams/assign-specialties', async (request, reply) => {
    try {
      const { examId, specialtyIds } = assignExamSpecialtiesSchema.parse(request.body)
      const result = await examService.assignSpecialties(examId, specialtyIds)
      reply.send({
        message: 'Specialties assigned to exam successfully',
        assignments: result,
        examId,
        specialtiesCount: specialtyIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'One or more specialties not found') {
          reply.status(404).send({ error: 'One or more specialties not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /exams/assign-curriculums - Assign curriculum items to exam
  fastify.post('/exams/assign-curriculums', async (request, reply) => {
    try {
      const { examId, curriculumIds } = assignExamCurriculumsSchema.parse(request.body)
      const result = await examService.assignCurriculums(examId, curriculumIds)
      reply.send({
        message: 'Curriculum items assigned to exam successfully',
        assignments: result,
        examId,
        curriculumsCount: curriculumIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'One or more curriculum items not found') {
          reply.status(404).send({ error: 'One or more curriculum items not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /exams/assign-marking-domains - Assign marking domains to exam
  fastify.post('/exams/assign-marking-domains', async (request, reply) => {
    try {
      const { examId, markingDomainIds } = assignExamMarkingDomainsSchema.parse(request.body)
      const result = await examService.assignMarkingDomains(examId, markingDomainIds)
      reply.send({
        message: 'Marking domains assigned to exam successfully',
        assignments: result,
        examId,
        markingDomainsCount: markingDomainIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'One or more marking domains not found') {
          reply.status(404).send({ error: 'One or more marking domains not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /exams/bulk-configure - Configure exam with all assignments at once
  fastify.post('/exams/bulk-configure', async (request, reply) => {
    try {
      const { examId, ...configuration } = bulkConfigureExamSchema.parse(request.body)
      const result = await examService.bulkConfigureExam(examId, configuration)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // ===== REMOVAL OPERATIONS =====

  // DELETE /exams/:examId/specialties/:specialtyId - Remove specialty from exam
  fastify.delete('/exams/:examId/specialties/:specialtyId', async (request, reply) => {
    try {
      const { examId, specialtyId } = examRemoveSpecialtyParamsSchema.parse(request.params)
      const result = await examService.removeSpecialty(examId, specialtyId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Specialty assignment not found') {
          reply.status(404).send({ error: 'Specialty assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /exams/:examId/curriculums/:curriculumId - Remove curriculum from exam
  fastify.delete('/exams/:examId/curriculums/:curriculumId', async (request, reply) => {
    try {
      const { examId, curriculumId } = examRemoveCurriculumParamsSchema.parse(request.params)
      const result = await examService.removeCurriculum(examId, curriculumId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Curriculum assignment not found') {
          reply.status(404).send({ error: 'Curriculum assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /exams/:examId/marking-domains/:markingDomainId - Remove marking domain from exam
  fastify.delete('/exams/:examId/marking-domains/:markingDomainId', async (request, reply) => {
    try {
      const { examId, markingDomainId } = examRemoveMarkingDomainParamsSchema.parse(request.params)
      const result = await examService.removeMarkingDomain(examId, markingDomainId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Marking domain assignment not found') {
          reply.status(404).send({ error: 'Marking domain assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // ===== ADDITIONAL UTILITY ROUTES =====

  // GET /exams/:examId/with-configuration - Get exam with all configuration details
  fastify.get('/exams/:examId/with-configuration', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const examWithConfig = await examService.getExamWithConfiguration(examId)
      reply.send(examWithConfig)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /exams/:examId/clear-configuration - Clear all exam configurations
  fastify.post('/exams/:examId/clear-configuration', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const result = await examService.clearExamConfiguration(examId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examId/is-configured - Check if exam is fully configured
  fastify.get('/exams/:examId/is-configured', async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      const isConfigured = await examService.isExamFullyConfigured(examId)
      reply.send({ 
        examId, 
        isFullyConfigured: isConfigured 
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}