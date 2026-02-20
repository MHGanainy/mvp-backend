// src/entities/interview-course/interview-course.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InterviewCourseService } from './interview-course.service'
import {
  createInterviewCourseSchema,
  updateInterviewCourseSchema,
  interviewCourseParamsSchema,
  interviewCourseInterviewParamsSchema,
  interviewCourseInstructorParamsSchema,
  updateInterviewCourseInfoPointsSchema,
  updateStructuredInterviewCourseCompleteSchema,
  InterviewCourseStyleEnum
} from './interview-course.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

const pricingUpdateSchema = z.object({
  price3Months: z.number().positive().max(99999.99).transform(val => Number(val.toFixed(2))).optional(),
  price6Months: z.number().positive().max(99999.99).transform(val => Number(val.toFixed(2))).optional(),
  price12Months: z.number().positive().max(99999.99).transform(val => Number(val.toFixed(2))).optional()
})

const creditsUpdateSchema = z.object({
  credits3Months: z.number().int().min(0).max(1000).optional(),
  credits6Months: z.number().int().min(0).max(1000).optional(),
  credits12Months: z.number().int().min(0).max(1000).optional()
})

const styleParamsSchema = z.object({
  style: InterviewCourseStyleEnum
})

export default async function interviewCourseRoutes(fastify: FastifyInstance) {
  const interviewCourseService = new InterviewCourseService(fastify.prisma)

  // GET /interview-courses - Get interview courses based on user role
  fastify.get('/interview-courses', async (request, reply) => {
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

      let interviewCourses
      if (isUserAdmin) {
        // Admin sees ALL interview courses (published and unpublished)
        interviewCourses = await interviewCourseService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees their own interview courses + all published interview courses
        const instructorInterviewCourses = await interviewCourseService.findByInstructor(currentInstructorId)
        const publishedInterviewCourses = await interviewCourseService.findPublished()
        // Merge and deduplicate
        const interviewCourseMap = new Map()
        ;[...instructorInterviewCourses, ...publishedInterviewCourses].forEach(interviewCourse => {
          interviewCourseMap.set(interviewCourse.id, interviewCourse)
        })
        interviewCourses = Array.from(interviewCourseMap.values())
      } else {
        // Public sees only published interview courses
        interviewCourses = await interviewCourseService.findPublished()
      }

      reply.send(interviewCourses)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch interview courses' })
    }
  })

  // GET /interviews/:interviewSlug/courses/:courseSlug - Get interview course by slugs (clean URL)
  fastify.get('/interviews/:interviewSlug/courses/:courseSlug', async (request, reply) => {
    try {
      const { interviewSlug, courseSlug } = request.params as { interviewSlug: string; courseSlug: string }
      const interviewCourse = await interviewCourseService.findBySlug(interviewSlug, courseSlug)
      reply.send(interviewCourse)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-courses/published - Get only published interview courses
  fastify.get('/interview-courses/published', async (request, reply) => {
    try {
      const interviewCourses = await interviewCourseService.findPublished()
      reply.send(interviewCourses)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch published interview courses' })
    }
  })

  // GET /interview-courses/style/:style - Get interview courses by style
  fastify.get('/interview-courses/style/:style', async (request, reply) => {
    try {
      const { style } = styleParamsSchema.parse(request.params)
      const interviewCourses = await interviewCourseService.findByStyle(style)
      reply.send(interviewCourses)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid interview course style' })
    }
  })

  // GET /interview-courses/interview/:interviewId - Get interview courses by interview
  fastify.get('/interview-courses/interview/:interviewId', async (request, reply) => {
    try {
      const { interviewId } = interviewCourseInterviewParamsSchema.parse(request.params)

      // Check user role to determine what they can see
      let isUserAdmin = false
      let currentInstructorId = null

      try {
        await request.jwtVerify()
        isUserAdmin = isAdmin(request)
        currentInstructorId = getCurrentInstructorId(request)
      } catch {
        // Not authenticated - can only see published
      }

      // Get all courses for this interview
      const allInterviewCourses = await interviewCourseService.findByInterview(interviewId)

      // Filter based on user role
      let interviewCourses
      if (isUserAdmin) {
        // Admin sees ALL courses (published and drafts)
        interviewCourses = allInterviewCourses
      } else if (currentInstructorId) {
        // Instructor sees their own drafts + all published courses
        interviewCourses = allInterviewCourses.filter(course =>
          course.isPublished || course.instructorId === currentInstructorId
        )
      } else {
        // Public/students see only published courses
        interviewCourses = allInterviewCourses.filter(course => course.isPublished)
      }

      reply.send(interviewCourses)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

// GET /interview-courses/instructor/:instructorId - Get interview courses by instructor
fastify.get('/interview-courses/instructor/:instructorId', async (request, reply) => {
  try {
    const { instructorId } = interviewCourseInstructorParamsSchema.parse(request.params)

    let isUserAdmin = false
    let canViewAll = false
    try {
      await request.jwtVerify()
      isUserAdmin = isAdmin(request)
      canViewAll = isUserAdmin || getCurrentInstructorId(request) === instructorId
    } catch {
      // Not authenticated - can only see published
    }

    // FIXED: Admin gets ALL interview courses, not filtered by instructor
    let interviewCourses
    if (isUserAdmin) {
      // Admin sees ALL interview courses from all instructors
      interviewCourses = await interviewCourseService.findAll()
    } else if (canViewAll) {
      // Instructor sees all their own interview courses
      interviewCourses = await interviewCourseService.findByInstructor(instructorId)
    } else {
      // Public/other users see only published interview courses from this instructor
      const instructorInterviewCourses = await interviewCourseService.findByInstructor(instructorId)
      interviewCourses = instructorInterviewCourses.filter(interviewCourse => interviewCourse.isPublished)
    }

    reply.send(interviewCourses)
  } catch (error) {
    if (error instanceof Error && error.message === 'Instructor not found') {
      reply.status(404).send({ error: 'Instructor not found' })
    } else {
      reply.status(400).send({ error: 'Invalid request' })
    }
  }
})

  // GET /interview-courses/:id - Get interview course by ID
  fastify.get('/interview-courses/:id', async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const interviewCourse = await interviewCourseService.findById(id)
      reply.send(interviewCourse)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-courses/:id/pricing - Get pricing information
  fastify.get('/interview-courses/:id/pricing', async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const pricingInfo = await interviewCourseService.getPricingInfo(id)
      reply.send(pricingInfo)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interview-courses - Create new interview course
  fastify.post('/interview-courses', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCourseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.instructorId) {
          reply.status(403).send({ error: 'You can only create interview courses for yourself' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.create(data)
      reply.status(201).send(interviewCourse)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Instructor can only create interview courses for their own interviews') {
          reply.status(403).send({ error: 'Instructor can only create interview courses for their own interviews' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interview-courses/:id - Update interview course
  fastify.put('/interview-courses/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const data = updateInterviewCourseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own interview courses' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.update(id, data)
      reply.send(interviewCourse)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /interview-courses/:id/toggle - Toggle published status
  fastify.patch('/interview-courses/:id/toggle', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only toggle your own interview courses' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.togglePublished(id)
      reply.send({
        message: `Interview course ${interviewCourse.isPublished ? 'published' : 'unpublished'} successfully`,
        interviewCourse
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /interview-courses/:id/pricing - Update pricing
  fastify.patch('/interview-courses/:id/pricing', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const pricing = pricingUpdateSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update pricing for your own interview courses' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.updatePricing(id, pricing)
      reply.send({
        message: 'Interview course pricing updated successfully',
        interviewCourse
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid pricing data' })
      }
    }
  })

  // PATCH /interview-courses/:id/credits - Update credits
  fastify.patch('/interview-courses/:id/credits', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const credits = creditsUpdateSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update credits for your own interview courses' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.updateCredits(id, credits)
      reply.send({
        message: 'Interview course credit allocation updated successfully',
        interviewCourse
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid credits data' })
      }
    }
  })

  // PATCH /interview-courses/:id/info-points - Update info points
  fastify.patch('/interview-courses/:id/info-points', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const { infoPoints } = updateInterviewCourseInfoPointsSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update info points for your own interview courses' })
          return
        }
      }

      const interviewCourse = await interviewCourseService.update(id, { infoPoints })
      reply.send({
        message: 'Interview course info points updated successfully',
        interviewCourse
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid info points data' })
      }
    }
  })

  // POST /interview-courses/create-structured-complete - Create STRUCTURED interview course with sections and subsections
  fastify.post('/interview-courses/create-structured-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = request.body as any

      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.instructorId) {
          reply.status(403).send({ error: 'You can only create interview courses for yourself' })
          return
        }
      }

      const result = await interviewCourseService.createStructuredComplete(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interview-courses/:id/update-structured-complete - Update STRUCTURED interview course with sections and subsections
  fastify.put('/interview-courses/:id/update-structured-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)
      const data = updateStructuredInterviewCourseCompleteSchema.parse(request.body)

      // Verify ownership
      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own interview courses' })
          return
        }
      }

      const result = await interviewCourseService.updateStructuredComplete(id, data)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message.includes('STRUCTURED')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interview-courses/:id - Delete interview course
  fastify.delete('/interview-courses/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete your own interview courses' })
          return
        }
      }

      await interviewCourseService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}
