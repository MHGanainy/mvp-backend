import { FastifyInstance } from 'fastify'
import { InterviewCourseSubsectionService } from './interview-course-subsection.service'
import {
  createInterviewCourseSubsectionSchema,
  updateInterviewCourseSubsectionSchema,
  interviewCourseSubsectionParamsSchema,
  interviewCourseSubsectionSectionParamsSchema
} from './interview-course-subsection.schema'
import {
  authenticate,
  getCurrentInstructorId,
  isAdmin
} from '../../middleware/auth.middleware'

export default async function interviewCourseSubsectionRoutes(fastify: FastifyInstance) {
  const subsectionService = new InterviewCourseSubsectionService(fastify.prisma)

  // GET /interview-course-subsections/:id
  fastify.get('/interview-course-subsections/:id', async (request, reply) => {
    try {
      const { id } = interviewCourseSubsectionParamsSchema.parse(request.params)
      const subsection = await subsectionService.findById(id)
      reply.send(subsection)
    } catch (error) {
      if (error instanceof Error && error.message === 'Subsection not found') {
        reply.status(404).send({ error: 'Subsection not found' })
      } else {
        reply.status(500).send({ error: 'Failed to fetch subsection' })
      }
    }
  })

  // GET /interview-course-subsections/section/:sectionId
  fastify.get('/interview-course-subsections/section/:sectionId', async (request, reply) => {
    try {
      const { sectionId } = interviewCourseSubsectionSectionParamsSchema.parse(request.params)
      const subsections = await subsectionService.findBySection(sectionId)
      reply.send(subsections)
    } catch (error) {
      if (error instanceof Error && error.message === 'Section not found') {
        reply.status(404).send({ error: 'Section not found' })
      } else {
        reply.status(500).send({ error: 'Failed to fetch subsections' })
      }
    }
  })

  // POST /interview-course-subsections
  fastify.post('/interview-course-subsections', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCourseSubsectionSchema.parse(request.body)

      // Verify ownership
      const section = await fastify.prisma.interviewCourseSection.findUnique({
        where: { id: data.sectionId },
        include: { interviewCourse: true }
      })

      if (!section) {
        reply.status(404).send({ error: 'Section not found' })
        return
      }

      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add subsections to your own interview courses' })
          return
        }
      }

      const subsection = await subsectionService.create(data)
      reply.status(201).send(subsection)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Section not found') {
          reply.status(404).send({ error: 'Section not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interview-course-subsections/:id
  fastify.put('/interview-course-subsections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseSubsectionParamsSchema.parse(request.params)
      const data = updateInterviewCourseSubsectionSchema.parse(request.body)

      const subsection = await subsectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (subsection.section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only update your own subsections' })
          return
        }
      }

      const updated = await subsectionService.update(id, data)
      reply.send(updated)
    } catch (error) {
      if (error instanceof Error && error.message === 'Subsection not found') {
        reply.status(404).send({ error: 'Subsection not found' })
      } else {
        reply.status(500).send({ error: 'Failed to update subsection' })
      }
    }
  })

  // DELETE /interview-course-subsections/:id
  fastify.delete('/interview-course-subsections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseSubsectionParamsSchema.parse(request.params)

      const subsection = await subsectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (subsection.section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only delete your own subsections' })
          return
        }
      }

      const result = await subsectionService.delete(id)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Subsection not found') {
        reply.status(404).send({ error: 'Subsection not found' })
      } else {
        reply.status(500).send({ error: 'Failed to delete subsection' })
      }
    }
  })

  // PATCH /interview-course-subsections/reorder
  fastify.patch('/interview-course-subsections/reorder', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { sectionId, subsectionIds } = request.body as {
        sectionId: string
        subsectionIds: string[]
      }

      const section = await fastify.prisma.interviewCourseSection.findUnique({
        where: { id: sectionId },
        include: { interviewCourse: true }
      })

      if (!section) {
        reply.status(404).send({ error: 'Section not found' })
        return
      }

      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.interviewCourse.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only reorder subsections in your own interview courses' })
          return
        }
      }

      const subsections = await subsectionService.reorderSubsections(sectionId, subsectionIds)
      reply.send(subsections)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid subsection IDs')) {
        reply.status(400).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Failed to reorder subsections' })
      }
    }
  })
}
