import { FastifyInstance } from 'fastify'
import { InterviewCourseSectionService } from './interview-course-section.service'
import {
  createInterviewCourseSectionSchema,
  createInterviewCourseSectionCompleteSchema,
  updateInterviewCourseSectionSchema,
  interviewCourseSectionParamsSchema,
  interviewCourseSectionCourseParamsSchema,
  interviewCourseSectionQuerySchema
} from './interview-course-section.schema'
import {
  authenticate,
  getCurrentInstructorId,
  isAdmin
} from '../../middleware/auth.middleware'

export default async function interviewCourseSectionRoutes(fastify: FastifyInstance) {
  const sectionService = new InterviewCourseSectionService(fastify.prisma)

  // ============================================
  // GET ENDPOINTS
  // ============================================

  // GET /interview-course-sections - Get all sections (admin only)
  fastify.get('/interview-course-sections', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' })
        return
      }

      const sections = await sectionService.findAll()
      reply.send(sections)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch sections' })
    }
  })

  // GET /interview-course-sections/:id - Get section by ID
  fastify.get('/interview-course-sections/:id', async (request, reply) => {
    try {
      const { id } = interviewCourseSectionParamsSchema.parse(request.params)
      const query = interviewCourseSectionQuerySchema.parse(request.query)

      const section = await sectionService.findById(
        id,
        query.includeSubsections === 'true'
      )
      reply.send(section)
    } catch (error) {
      if (error instanceof Error && error.message === 'Section not found') {
        reply.status(404).send({ error: 'Section not found' })
      } else {
        reply.status(500).send({ error: 'Failed to fetch section' })
      }
    }
  })

  // GET /interview-course-sections/interview-course/:interviewCourseId - Get sections by interview course
  fastify.get('/interview-course-sections/interview-course/:interviewCourseId', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCourseSectionCourseParamsSchema.parse(request.params)
      const query = interviewCourseSectionQuerySchema.parse(request.query)

      const sections = await sectionService.findByInterviewCourse(
        interviewCourseId,
        query.includeSubsections === 'true'
      )
      reply.send(sections)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(500).send({ error: 'Failed to fetch sections' })
      }
    }
  })

  // ============================================
  // POST ENDPOINTS
  // ============================================

  // POST /interview-course-sections - Create section
  fastify.post('/interview-course-sections', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCourseSectionSchema.parse(request.body)

      // Verify ownership (admin bypass)
      if (!isAdmin(request)) {
        const interviewCourse = await fastify.prisma.interviewCourse.findUnique({
          where: { id: data.interviewCourseId }
        })
        const instructorId = getCurrentInstructorId(request)
        if (!interviewCourse || interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add sections to your own interview courses' })
          return
        }
      }

      const section = await sectionService.create(data)
      reply.status(201).send(section)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message.includes('STRUCTURED')) {
          reply.status(400).send({ error: error.message })
        } else if (error.message.includes('Display order')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interview-course-sections/create-complete - Create section with subsections
  fastify.post('/interview-course-sections/create-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCourseSectionCompleteSchema.parse(request.body)

      // Verify ownership (admin bypass)
      if (!isAdmin(request)) {
        const interviewCourse = await fastify.prisma.interviewCourse.findUnique({
          where: { id: data.interviewCourseId }
        })
        const instructorId = getCurrentInstructorId(request)
        if (!interviewCourse || interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add sections to your own interview courses' })
          return
        }
      }

      const result = await sectionService.createComplete(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message.includes('STRUCTURED')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // ============================================
  // PUT/PATCH ENDPOINTS
  // ============================================

  // PUT /interview-course-sections/:id - Update section
  fastify.put('/interview-course-sections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseSectionParamsSchema.parse(request.params)
      const data = updateInterviewCourseSectionSchema.parse(request.body)

      // Verify ownership
      const section = await sectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only update your own sections' })
          return
        }
      }

      const updated = await sectionService.update(id, data)
      reply.send(updated)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Section not found') {
          reply.status(404).send({ error: 'Section not found' })
        } else if (error.message.includes('Display order')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /interview-course-sections/reorder - Reorder sections
  fastify.patch('/interview-course-sections/reorder', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewCourseId, sectionIds } = request.body as { interviewCourseId: string; sectionIds: string[] }

      // Verify ownership
      const interviewCourse = await fastify.prisma.interviewCourse.findUnique({
        where: { id: interviewCourseId }
      })
      if (!interviewCourse) {
        reply.status(404).send({ error: 'Interview course not found' })
        return
      }
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only reorder sections in your own interview courses' })
          return
        }
      }

      const sections = await sectionService.reorderSections(interviewCourseId, sectionIds)
      reply.send(sections)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid section IDs')) {
        reply.status(400).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Failed to reorder sections' })
      }
    }
  })

  // ============================================
  // DELETE ENDPOINTS
  // ============================================

  // DELETE /interview-course-sections/:id - Delete section
  fastify.delete('/interview-course-sections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseSectionParamsSchema.parse(request.params)

      // Verify ownership
      const section = await sectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only delete your own sections' })
          return
        }
      }

      const result = await sectionService.delete(id)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Section not found') {
        reply.status(404).send({ error: 'Section not found' })
      } else {
        reply.status(500).send({ error: 'Failed to delete section' })
      }
    }
  })
}
