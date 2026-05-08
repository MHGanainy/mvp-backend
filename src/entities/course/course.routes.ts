// src/entities/course/course.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CourseService } from './course.service'
import { 
  createCourseSchema, 
  updateCourseSchema, 
  courseParamsSchema,
  courseExamParamsSchema,
  courseInstructorParamsSchema,
  updateCourseInfoPointsSchema,
  updateStructuredCourseCompleteSchema,
  CourseStyleEnum
} from './course.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'
import { requirePermission } from '../../middleware/require-permission.middleware'
import { computeResourcePermissions, getBulkResourcePermissions, getResourcesWithPermissions, resolveViewerFromRequest, userHasPermission } from '../../shared/permissions'
import { replyInternalError } from '../../shared/route-error'

const styleParamsSchema = z.object({
  style: CourseStyleEnum
})

export default async function courseRoutes(fastify: FastifyInstance) {
  const courseService = new CourseService(fastify.prisma)

  // GET /courses - Get courses based on user role
  fastify.get('/courses', async (request, reply) => {
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
      
      let courses
      if (isUserAdmin) {
        // Admin sees ALL courses (published and unpublished)
        courses = await courseService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees their own courses + all published courses
        const instructorCourses = await courseService.findByInstructor(currentInstructorId)
        const publishedCourses = await courseService.findPublished()
        // Merge and deduplicate
        const courseMap = new Map()
        ;[...instructorCourses, ...publishedCourses].forEach(course => {
          courseMap.set(course.id, course)
        })
        courses = Array.from(courseMap.values())
      } else {
        // Public sees only published courses
        courses = await courseService.findPublished()
      }
      
      reply.send(courses)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch courses')
    }
  })

  // GET /courses/published - Get only published courses
  fastify.get('/courses/published', async (request, reply) => {
    try {
      const courses = await courseService.findPublished()
      reply.send(courses)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch published courses')
    }
  })

  // GET /courses/style/:style - Get courses by style
  fastify.get('/courses/style/:style', async (request, reply) => {
    try {
      const { style } = styleParamsSchema.parse(request.params)
      const courses = await courseService.findByStyle(style)
      reply.send(courses)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid course style' })
    }
  })

  // GET /courses/exam/:examId - Show courses visible to the instructor for this exam
  fastify.get('/courses/exam/:examId', async (request, reply) => {
    try {
      const { examId } = courseExamParamsSchema.parse(request.params)

      const exam = await fastify.prisma.exam.findUnique({ where: { id: examId } })
      if (!exam) {
        reply.status(404).send({ error: 'Exam not found' })
        return
      }

      const { userId, isAdmin } = resolveViewerFromRequest(request)

      let where: any = { examId, isPublished: true }
      if (isAdmin) {
        where = { examId }
      } else if (userId !== null) {
        const grantedExamIds = await getResourcesWithPermissions(fastify.prisma, {
          userId,
          resourceType: 'exam'
        })
        if (grantedExamIds.includes(examId)) {
          where = { examId }
        } else {
          const grantedCourseIds = await getResourcesWithPermissions(fastify.prisma, {
            userId,
            resourceType: 'course'
          })
          if (grantedCourseIds.length > 0) {
            where = {
              examId,
              OR: [{ isPublished: true }, { id: { in: grantedCourseIds } }]
            }
          }
        }
      }

      const courses = await fastify.prisma.course.findMany({
        where,
        include: {
          exam: { select: { id: true, title: true, slug: true, isActive: true } },
          instructor: { select: { id: true, firstName: true, lastName: true, bio: true } }
        },
        orderBy: { createdAt: 'desc' }
      })

      if (userId !== null) {
        const permMap = await getBulkResourcePermissions(fastify.prisma, {
          userId,
          isAdmin,
          resources: courses.map((c) => ({
            id: c.id,
            ancestorKeys: [
              { resourceType: 'course' as const, resourceId: c.id },
              { resourceType: 'exam' as const, resourceId: c.examId },
            ],
          })),
        })
        reply.send(courses.map((c) => ({ ...c, permissions: permMap.get(c.id) })))
      } else {
        reply.send(courses)
      }
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /courses/instructor/:instructorId - Show courses visible to the instructor (via permission grants)
  fastify.get('/courses/instructor/:instructorId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { instructorId } = courseInstructorParamsSchema.parse(request.params)

      if (!isAdmin(request) && getCurrentInstructorId(request) !== instructorId) {
        reply.status(403).send({ error: 'Forbidden' })
        return
      }

      const courses = isAdmin(request)
        ? await courseService.findAll()
        : await courseService.findVisibleToInstructor(instructorId)

      const viewer = resolveViewerFromRequest(request)
      if (viewer.userId !== null) {
        const permMap = await getBulkResourcePermissions(fastify.prisma, {
          userId: viewer.userId,
          isAdmin: viewer.isAdmin,
          resources: courses.map((c) => ({
            id: c.id,
            ancestorKeys: [
              { resourceType: 'course' as const, resourceId: c.id },
              { resourceType: 'exam' as const, resourceId: c.examId },
            ],
          })),
        })
        reply.send(courses.map((c) => ({ ...c, permissions: permMap.get(c.id) })))
      } else {
        reply.send(courses)
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /exams/:examSlug/courses/:courseSlug - Get course by slugs (public for published, permission required for drafts)
  fastify.get('/exams/:examSlug/courses/:courseSlug', async (request, reply) => {
    try {
      const { examSlug, courseSlug } = request.params as { examSlug: string; courseSlug: string }
      const course = await courseService.findBySlug(examSlug, courseSlug, true)

      const { userId, isAdmin: viewerIsAdmin } = resolveViewerFromRequest(request)

      if (!course.isPublished) {
        if (!viewerIsAdmin) {
          const allowed = userId !== null && await userHasPermission(fastify.prisma, {
            userId,
            isAdmin: false,
            permission: 'case.edit',
            target: { kind: 'course', id: course.id },
          })
          if (!allowed) {
            reply.status(404).send({ error: 'Course not found' })
            return
          }
        }
      }

      const permissions = userId !== null
        ? await computeResourcePermissions(fastify.prisma, {
            userId,
            isAdmin: viewerIsAdmin,
            target: { kind: 'course', id: course.id },
          })
        : undefined
      reply.send({ ...course, permissions })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /courses/:id - Get course by ID
  fastify.get('/courses/:id', async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const course = await courseService.findById(id)
      const viewer = resolveViewerFromRequest(request)
      const permissions = viewer.userId !== null
        ? await computeResourcePermissions(fastify.prisma, {
            userId: viewer.userId,
            isAdmin: viewer.isAdmin,
            target: { kind: 'course', id },
          })
        : undefined
      reply.send({ ...course, permissions })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /courses - Create new course
  fastify.post('/courses', {
    preHandler: requirePermission('case.create', (req) => {
      const body = createCourseSchema.parse(req.body)
      return { kind: 'exam', id: body.examId }
    })
  }, async (request, reply) => {
    try {
      const data = createCourseSchema.parse(request.body)
      const course = await courseService.create(data)
      reply.status(201).send(course)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Instructor can only create courses for their own exams') {
          reply.status(403).send({ error: 'Instructor can only create courses for their own exams' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create course')
      }
    }
  })

  // PUT /courses/:id - Update course
  fastify.put('/courses/:id', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseParamsSchema.parse(req.params)
      return { kind: 'course', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const data = updateCourseSchema.parse(request.body)
      const course = await courseService.update(id, data)
      reply.send(course)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /courses/:id/toggle - Toggle published status
  fastify.patch('/courses/:id/toggle', {
    preHandler: requirePermission('case.publish', (req) => {
      const { id } = courseParamsSchema.parse(req.params)
      return { kind: 'course', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const course = await courseService.togglePublished(id)
      reply.send({
        message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`,
        course
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /courses/:id/info-points - Update info points
  fastify.patch('/courses/:id/info-points', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseParamsSchema.parse(req.params)
      return { kind: 'course', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const { infoPoints } = updateCourseInfoPointsSchema.parse(request.body)
      const course = await courseService.update(id, { infoPoints })
      reply.send({
        message: 'Course info points updated successfully',
        course
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid info points data' })
      }
    }
  })

  // POST /courses/create-structured-complete - Create STRUCTURED course with sections and subsections
  fastify.post('/courses/create-structured-complete', {
    preHandler: requirePermission('case.create', (req) => {
      const body = req.body as { examId?: string }
      if (!body || typeof body.examId !== 'string') {
        throw new Error('examId is required')
      }
      return { kind: 'exam', id: body.examId }
    })
  }, async (request, reply) => {
    try {
      const data = request.body as any
      const result = await courseService.createStructuredComplete(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create structured complete course')
      }
    }
  })

  // PUT /courses/:id/update-structured-complete - Update STRUCTURED course with sections and subsections
  fastify.put('/courses/:id/update-structured-complete', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseParamsSchema.parse(req.params)
      return { kind: 'course', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const data = updateStructuredCourseCompleteSchema.parse(request.body)
      const result = await courseService.updateStructuredComplete(id, data)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'This endpoint can only be used for STRUCTURED style courses') {
          reply.status(400).send({ error: error.message })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to update structured complete course')
      }
    }
  })

  // DELETE /courses/:id - Delete course (admin only)
  fastify.delete('/courses/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Forbidden' })
        return
      }

      await courseService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}