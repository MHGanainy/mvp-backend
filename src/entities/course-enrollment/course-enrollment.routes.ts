import { FastifyInstance } from 'fastify'
import { CourseEnrollmentService } from './course-enrollment.service'
import {
  createCourseEnrollmentSchema,
  courseEnrollmentParamsSchema,
  courseEnrollmentStudentParamsSchema,
  courseEnrollmentCourseParamsSchema,
  courseEnrollmentQuerySchema
} from './course-enrollment.schema'
import {
  authenticate,
  getCurrentStudentId,
  isAdmin,
  canAccessStudentResource
} from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

export default async function courseEnrollmentRoutes(fastify: FastifyInstance) {
  const enrollmentService = new CourseEnrollmentService(fastify.prisma)

  // GET /course-enrollments/:id
  fastify.get('/course-enrollments/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseEnrollmentParamsSchema.parse(request.params)
      const query = courseEnrollmentQuerySchema.parse(request.query)

      const enrollment = await enrollmentService.findById(
        id,
        query.includeProgress === 'true'
      )

      // Verify access
      if (!isAdmin(request) && !canAccessStudentResource(request, enrollment.student.id)) {
        reply.status(403).send({ error: 'Access denied' })
        return
      }

      reply.send(enrollment)
    } catch (error) {
      if (error instanceof Error && error.message === 'Enrollment not found') {
        reply.status(404).send({ error: 'Enrollment not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch enrollment')
      }
    }
  })

  // GET /course-enrollments/student/:studentId
  fastify.get('/course-enrollments/student/:studentId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { studentId } = courseEnrollmentStudentParamsSchema.parse(request.params)
      const query = courseEnrollmentQuerySchema.parse(request.query)

      // Verify access
      if (!isAdmin(request) && !canAccessStudentResource(request, studentId)) {
        reply.status(403).send({ error: 'Access denied' })
        return
      }

      const enrollments = await enrollmentService.findByStudent(studentId, {
        includeProgress: query.includeProgress === 'true',
        completedOnly: query.completedOnly === 'true'
      })
      reply.send(enrollments)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch enrollments')
      }
    }
  })

  // GET /course-enrollments/my - Get current student's enrollments
  fastify.get('/course-enrollments/my', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)
      if (!studentId) {
        reply.status(403).send({ error: 'Student access required' })
        return
      }

      const query = courseEnrollmentQuerySchema.parse(request.query)
      const enrollments = await enrollmentService.findByStudent(studentId, {
        includeProgress: query.includeProgress === 'true',
        completedOnly: query.completedOnly === 'true'
      })
      reply.send(enrollments)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch enrollments')
    }
  })

  // GET /course-enrollments/my/:courseId - Get enrollment for specific course
  fastify.get('/course-enrollments/my/:courseId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)
      if (!studentId) {
        reply.status(403).send({ error: 'Student access required' })
        return
      }

      const { courseId } = courseEnrollmentCourseParamsSchema.parse(request.params)
      const enrollment = await enrollmentService.findByStudentAndCourse(studentId, courseId)

      if (!enrollment) {
        reply.status(404).send({ error: 'Not enrolled in this course' })
        return
      }

      reply.send(enrollment)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch enrollment')
    }
  })

  // POST /course-enrollments
  fastify.post('/course-enrollments', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseEnrollmentSchema.parse(request.body)

      // Students can only enroll themselves
      if (!isAdmin(request)) {
        const currentStudentId = getCurrentStudentId(request)
        if (data.studentId !== currentStudentId) {
          reply.status(403).send({ error: 'You can only enroll yourself' })
          return
        }
      }

      const enrollment = await enrollmentService.create(data)
      reply.status(201).send(enrollment)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Student not found' || error.message === 'Course not found') {
          reply.status(404).send({ error: error.message })
        } else if (error.message.includes('already enrolled')) {
          reply.status(409).send({ error: error.message })
        } else if (error.message.includes('STRUCTURED') ||
                   error.message.includes('subscription') ||
                   error.message.includes('unpublished') ||
                   error.message.includes('Admin users')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create enrollment')
      }
    }
  })

  // PUT /course-enrollments/:id/track-access - Update lastAccessedAt
  fastify.put('/course-enrollments/:id/track-access', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseEnrollmentParamsSchema.parse(request.params)

      // Get enrollment to verify access
      const enrollment = await enrollmentService.findById(id, false)

      // Verify access - student can only update their own enrollments
      if (!isAdmin(request) && !canAccessStudentResource(request, enrollment.student.id)) {
        reply.status(403).send({ error: 'Access denied' })
        return
      }

      const updatedEnrollment = await enrollmentService.updateLastAccessed(id)
      reply.send(updatedEnrollment)
    } catch (error) {
      if (error instanceof Error && error.message === 'Enrollment not found') {
        reply.status(404).send({ error: 'Enrollment not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to update access time')
      }
    }
  })

  // DELETE /course-enrollments/:id (admin only)
  fastify.delete('/course-enrollments/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' })
        return
      }

      const { id } = courseEnrollmentParamsSchema.parse(request.params)
      const result = await enrollmentService.delete(id)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Enrollment not found') {
        reply.status(404).send({ error: 'Enrollment not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to delete enrollment')
      }
    }
  })
}
