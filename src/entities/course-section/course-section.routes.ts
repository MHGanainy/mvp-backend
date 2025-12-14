import { FastifyInstance } from 'fastify'
import { CourseSectionService } from './course-section.service'
import {
  createCourseSectionSchema,
  createCourseSectionCompleteSchema,
  updateCourseSectionSchema,
  courseSectionParamsSchema,
  courseSectionCourseParamsSchema,
  courseSectionQuerySchema
} from './course-section.schema'
import {
  authenticate,
  getCurrentInstructorId,
  isAdmin
} from '../../middleware/auth.middleware'

export default async function courseSectionRoutes(fastify: FastifyInstance) {
  const sectionService = new CourseSectionService(fastify.prisma)

  // ============================================
  // GET ENDPOINTS
  // ============================================

  // GET /course-sections - Get all sections (admin only)
  fastify.get('/course-sections', {
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

  // GET /course-sections/:id - Get section by ID
  fastify.get('/course-sections/:id', async (request, reply) => {
    try {
      const { id } = courseSectionParamsSchema.parse(request.params)
      const query = courseSectionQuerySchema.parse(request.query)

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

  // GET /course-sections/course/:courseId - Get sections by course
  fastify.get('/course-sections/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseSectionCourseParamsSchema.parse(request.params)
      const query = courseSectionQuerySchema.parse(request.query)

      const sections = await sectionService.findByCourse(
        courseId,
        query.includeSubsections === 'true'
      )
      reply.send(sections)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(500).send({ error: 'Failed to fetch sections' })
      }
    }
  })

  // ============================================
  // POST ENDPOINTS
  // ============================================

  // POST /course-sections - Create section
  fastify.post('/course-sections', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseSectionSchema.parse(request.body)

      // Verify ownership (admin bypass)
      if (!isAdmin(request)) {
        const course = await fastify.prisma.course.findUnique({
          where: { id: data.courseId }
        })
        const instructorId = getCurrentInstructorId(request)
        if (!course || course.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add sections to your own courses' })
          return
        }
      }

      const section = await sectionService.create(data)
      reply.status(201).send(section)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
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

  // POST /course-sections/create-complete - Create section with subsections
  fastify.post('/course-sections/create-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseSectionCompleteSchema.parse(request.body)

      // Verify ownership (admin bypass)
      if (!isAdmin(request)) {
        const course = await fastify.prisma.course.findUnique({
          where: { id: data.courseId }
        })
        const instructorId = getCurrentInstructorId(request)
        if (!course || course.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only add sections to your own courses' })
          return
        }
      }

      const result = await sectionService.createComplete(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
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

  // PUT /course-sections/:id - Update section
  fastify.put('/course-sections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseSectionParamsSchema.parse(request.params)
      const data = updateCourseSectionSchema.parse(request.body)

      // Verify ownership
      const section = await sectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.course.instructorId !== instructorId) {
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

  // PATCH /course-sections/reorder - Reorder sections
  fastify.patch('/course-sections/reorder', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseId, sectionIds } = request.body as { courseId: string; sectionIds: string[] }

      // Verify ownership
      const course = await fastify.prisma.course.findUnique({
        where: { id: courseId }
      })
      if (!course) {
        reply.status(404).send({ error: 'Course not found' })
        return
      }
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (course.instructorId !== instructorId) {
          reply.status(403).send({ error: 'You can only reorder sections in your own courses' })
          return
        }
      }

      const sections = await sectionService.reorderSections(courseId, sectionIds)
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

  // DELETE /course-sections/:id - Delete section
  fastify.delete('/course-sections/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseSectionParamsSchema.parse(request.params)

      // Verify ownership
      const section = await sectionService.findById(id)
      if (!isAdmin(request)) {
        const instructorId = getCurrentInstructorId(request)
        if (section.course.instructorId !== instructorId) {
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
