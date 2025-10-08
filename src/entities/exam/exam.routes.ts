// src/entities/exam/exam.routes.ts
import { z } from 'zod'
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
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

const examIdParamsSchema = z.object({
  examId: z.string().uuid('Invalid exam ID')
})

export default async function examRoutes(fastify: FastifyInstance) {
  const examService = new ExamService(fastify.prisma)

  // GET /exams - Get exams based on user role
  fastify.get('/exams', async (request, reply) => {
    try {
      let isUserAdmin = false
      let currentInstructorId = null
      
      try {
        await request.jwtVerify()
        isUserAdmin = isAdmin(request)
        currentInstructorId = getCurrentInstructorId(request)
      } catch {
        // Not authenticated - public access
      }
      
      let exams
      if (isUserAdmin) {
        // Admin sees ALL exams
        exams = await examService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees their own exams plus active exams
        const instructorExams = await examService.findByInstructor(currentInstructorId)
        const activeExams = await examService.findActive()
        // Merge and deduplicate
        const examMap = new Map()
        ;[...instructorExams, ...activeExams].forEach(exam => {
          examMap.set(exam.id, exam)
        })
        exams = Array.from(examMap.values())
      } else {
        // Public sees only active exams
        exams = await examService.findActive()
      }
      
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
      
      // Check if user can see this instructor's exams
      let canView = false
      try {
        await request.jwtVerify()
        canView = isAdmin(request) || getCurrentInstructorId(request) === instructorId
      } catch {
        // Not authenticated - can only see if exams are active
      }
      
      const allExams = await examService.findByInstructor(instructorId)
      const exams = canView ? allExams : allExams.filter(exam => exam.isActive)
      
      reply.send(exams)
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/slug/:slug - Get exam by slug
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
  fastify.post('/exams', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createExamSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.instructorId) {
          reply.status(403).send({ error: 'You can only create exams for yourself' })
          return
        }
      }
      
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

  // POST /exams/create-complete - Create exam with all relations
  fastify.post('/exams/create-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCompleteExamSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.exam.instructorId) {
          reply.status(403).send({ error: 'You can only create exams for yourself' })
          return
        }
      }
      
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
  fastify.put('/exams/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      const data = updateExamSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own exams' })
          return
        }
      }
      
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

  // PUT /exams/update-complete - Update exam with all relations
  fastify.put('/exams/update-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = updateCompleteExamSchema.parse(request.body)
      const { examId, ...updateData } = data
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own exams' })
          return
        }
      }
      
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
  fastify.patch('/exams/:id/toggle', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only toggle your own exams' })
          return
        }
      }
      
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
  fastify.delete('/exams/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = examParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete your own exams' })
          return
        }
      }
      
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

  // GET /exams/:examId/configuration
  fastify.get('/exams/:examId/configuration', async (request, reply) => {
    try {
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

  // GET /exams/:examId/specialties
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

  // GET /exams/:examId/curriculums
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

  // GET /exams/:examId/marking-domains
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

  // GET /exams/:examId/usage-stats
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

  // POST /exams/assign-specialties
  fastify.post('/exams/assign-specialties', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, specialtyIds } = assignExamSpecialtiesSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // POST /exams/assign-curriculums
  fastify.post('/exams/assign-curriculums', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, curriculumIds } = assignExamCurriculumsSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // POST /exams/assign-marking-domains
  fastify.post('/exams/assign-marking-domains', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, markingDomainIds } = assignExamMarkingDomainsSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // POST /exams/bulk-configure
  fastify.post('/exams/bulk-configure', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, ...configuration } = bulkConfigureExamSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // DELETE /exams/:examId/specialties/:specialtyId
  fastify.delete('/exams/:examId/specialties/:specialtyId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, specialtyId } = examRemoveSpecialtyParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // DELETE /exams/:examId/curriculums/:curriculumId
  fastify.delete('/exams/:examId/curriculums/:curriculumId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, curriculumId } = examRemoveCurriculumParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // DELETE /exams/:examId/marking-domains/:markingDomainId
  fastify.delete('/exams/:examId/marking-domains/:markingDomainId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId, markingDomainId } = examRemoveMarkingDomainParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // GET /exams/:examId/with-configuration
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

  // POST /exams/:examId/clear-configuration
  fastify.post('/exams/:examId/clear-configuration', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { examId } = examIdParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const exam = await examService.findById(examId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || exam.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own exams' })
          return
        }
      }
      
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

  // GET /exams/:examId/is-configured
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