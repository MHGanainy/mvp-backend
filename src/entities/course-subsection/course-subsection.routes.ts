import { FastifyInstance } from 'fastify'
import { CourseSubsectionService } from './course-subsection.service'
import {
  createCourseSubsectionSchema,
  updateCourseSubsectionSchema,
  courseSubsectionParamsSchema,
  courseSubsectionSectionParamsSchema
} from './course-subsection.schema'
import {
  authenticate,
  getCurrentInstructorId,
  isAdmin
} from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

export default async function courseSubsectionRoutes(fastify: FastifyInstance) {
  const subsectionService = new CourseSubsectionService(fastify.prisma)

  // GET /course-subsections/:id
  fastify.get('/course-subsections/:id', async (request, reply) => {
    try {
      const { id } = courseSubsectionParamsSchema.parse(request.params)
      const subsection = await subsectionService.findById(id)
      reply.send(subsection)
    } catch (error) {
      if (error instanceof Error && error.message === 'Subsection not found') {
        reply.status(404).send({ error: 'Subsection not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch subsection')
      }
    }
  })

  // GET /course-subsections/section/:sectionId
  fastify.get('/course-subsections/section/:sectionId', async (request, reply) => {
    try {
      const { sectionId } = courseSubsectionSectionParamsSchema.parse(request.params)
      const subsections = await subsectionService.findBySection(sectionId)
      reply.send(subsections)
    } catch (error) {
      if (error instanceof Error && error.message === 'Section not found') {
        reply.status(404).send({ error: 'Section not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch subsections')
      }
    }
  })

  // POST /course-subsections
  fastify.post('/course-subsections', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseSubsectionSchema.parse(request.body)

      // Verify ownership
      const section = await fastify.prisma.courseSection.findUnique({
        where: { id: data.sectionId },
        include: { course: true }
      })

      if (!section) {
        reply.status(404).send({ error: 'Section not found' })
        return
      }

      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.course.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add subsections to your own courses' })
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
        replyInternalError(request, reply, error, 'Failed to create subsection')
      }
    }
  })

  // PUT /course-subsections/:id
  fastify.put('/course-subsections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseSubsectionParamsSchema.parse(request.params)
      const data = updateCourseSubsectionSchema.parse(request.body)

      const subsection = await subsectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (subsection.section.course.instructorId !== instructorId) {
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
        replyInternalError(request, reply, error, 'Failed to update subsection')
      }
    }
  })

  // DELETE /course-subsections/:id
  fastify.delete('/course-subsections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseSubsectionParamsSchema.parse(request.params)

      const subsection = await subsectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (subsection.section.course.instructorId !== instructorId) {
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
        replyInternalError(request, reply, error, 'Failed to delete subsection')
      }
    }
  })

  // PATCH /course-subsections/reorder
  fastify.patch('/course-subsections/reorder', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { sectionId, subsectionIds } = request.body as {
        sectionId: string
        subsectionIds: string[]
      }

      const section = await fastify.prisma.courseSection.findUnique({
        where: { id: sectionId },
        include: { course: true }
      })

      if (!section) {
        reply.status(404).send({ error: 'Section not found' })
        return
      }

      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.course.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only reorder subsections in your own courses' })
          return
        }
      }

      const subsections = await subsectionService.reorderSubsections(sectionId, subsectionIds)
      reply.send(subsections)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid subsection IDs')) {
        reply.status(400).send({ error: error.message })
      } else {
        replyInternalError(request, reply, error, 'Failed to reorder subsections')
      }
    }
  })
}
