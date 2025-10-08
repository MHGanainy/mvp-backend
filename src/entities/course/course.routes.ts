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
  CourseStyleEnum
} from './course.schema'
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
      reply.status(500).send({ error: 'Failed to fetch courses' })
    }
  })

  // GET /courses/published - Get only published courses
  fastify.get('/courses/published', async (request, reply) => {
    try {
      const courses = await courseService.findPublished()
      reply.send(courses)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch published courses' })
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

  // GET /courses/exam/:examId - Get courses by exam
  fastify.get('/courses/exam/:examId', async (request, reply) => {
    try {
      const { examId } = courseExamParamsSchema.parse(request.params)
      const courses = await courseService.findByExam(examId)
      reply.send(courses)
    } catch (error) {
      if (error instanceof Error && error.message === 'Exam not found') {
        reply.status(404).send({ error: 'Exam not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /courses/instructor/:instructorId - Get courses by instructor
  fastify.get('/courses/instructor/:instructorId', async (request, reply) => {
    try {
      const { instructorId } = courseInstructorParamsSchema.parse(request.params)
      
      let canViewAll = false
      try {
        await request.jwtVerify()
        canViewAll = isAdmin(request) || getCurrentInstructorId(request) === instructorId
      } catch {
        // Not authenticated - can only see published
      }
      
      const allCourses = await courseService.findByInstructor(instructorId)
      const courses = canViewAll ? allCourses : allCourses.filter(course => course.isPublished)
      
      reply.send(courses)
    } catch (error) {
      if (error instanceof Error && error.message === 'Instructor not found') {
        reply.status(404).send({ error: 'Instructor not found' })
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
      reply.send(course)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /courses/:id/pricing - Get pricing information
  fastify.get('/courses/:id/pricing', async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const pricingInfo = await courseService.getPricingInfo(id)
      reply.send(pricingInfo)
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
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.instructorId) {
          reply.status(403).send({ error: 'You can only create courses for yourself' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /courses/:id - Update course
  fastify.put('/courses/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const data = updateCourseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own courses' })
          return
        }
      }
      
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
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only toggle your own courses' })
          return
        }
      }
      
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

  // PATCH /courses/:id/pricing - Update pricing
  fastify.patch('/courses/:id/pricing', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const pricing = pricingUpdateSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update pricing for your own courses' })
          return
        }
      }
      
      const course = await courseService.updatePricing(id, pricing)
      reply.send({
        message: 'Course pricing updated successfully',
        course
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid pricing data' })
      }
    }
  })

  // PATCH /courses/:id/credits - Update credits
  fastify.patch('/courses/:id/credits', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const credits = creditsUpdateSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update credits for your own courses' })
          return
        }
      }
      
      const course = await courseService.updateCredits(id, credits)
      reply.send({
        message: 'Course credit allocation updated successfully',
        course
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid credits data' })
      }
    }
  })

  // PATCH /courses/:id/info-points - Update info points
  fastify.patch('/courses/:id/info-points', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      const { infoPoints } = updateCourseInfoPointsSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update info points for your own courses' })
          return
        }
      }
      
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

  // DELETE /courses/:id - Delete course
  fastify.delete('/courses/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete your own courses' })
          return
        }
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