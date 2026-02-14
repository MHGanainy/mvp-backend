import { FastifyInstance } from 'fastify'
import { InterviewCourseEnrollmentService } from './interview-course-enrollment.service'
import {
  createInterviewCourseEnrollmentSchema,
  interviewCourseEnrollmentParamsSchema,
  interviewCourseEnrollmentStudentParamsSchema,
  interviewCourseEnrollmentCourseParamsSchema,
  interviewCourseEnrollmentQuerySchema
} from './interview-course-enrollment.schema'
import {
  authenticate,
  getCurrentStudentId,
  isAdmin,
  canAccessStudentResource
} from '../../middleware/auth.middleware'

export default async function interviewCourseEnrollmentRoutes(fastify: FastifyInstance) {
  const enrollmentService = new InterviewCourseEnrollmentService(fastify.prisma)

  // GET /interview-course-enrollments/:id
  fastify.get('/interview-course-enrollments/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseEnrollmentParamsSchema.parse(request.params)
      const query = interviewCourseEnrollmentQuerySchema.parse(request.query)

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
        reply.status(500).send({ error: 'Failed to fetch enrollment' })
      }
    }
  })

  // GET /interview-course-enrollments/student/:studentId
  fastify.get('/interview-course-enrollments/student/:studentId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { studentId } = interviewCourseEnrollmentStudentParamsSchema.parse(request.params)
      const query = interviewCourseEnrollmentQuerySchema.parse(request.query)

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
        reply.status(500).send({ error: 'Failed to fetch enrollments' })
      }
    }
  })

  // GET /interview-course-enrollments/my - Get current student's enrollments
  fastify.get('/interview-course-enrollments/my', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)
      if (!studentId) {
        reply.status(403).send({ error: 'Student access required' })
        return
      }

      const query = interviewCourseEnrollmentQuerySchema.parse(request.query)
      const enrollments = await enrollmentService.findByStudent(studentId, {
        includeProgress: query.includeProgress === 'true',
        completedOnly: query.completedOnly === 'true'
      })
      reply.send(enrollments)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch enrollments' })
    }
  })

  // GET /interview-course-enrollments/my/:interviewCourseId - Get enrollment for specific interview course
  fastify.get('/interview-course-enrollments/my/:interviewCourseId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)
      if (!studentId) {
        reply.status(403).send({ error: 'Student access required' })
        return
      }

      const { interviewCourseId } = interviewCourseEnrollmentCourseParamsSchema.parse(request.params)
      const enrollment = await enrollmentService.findByStudentAndInterviewCourse(studentId, interviewCourseId)

      if (!enrollment) {
        reply.status(404).send({ error: 'Not enrolled in this interview course' })
        return
      }

      reply.send(enrollment)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch enrollment' })
    }
  })

  // POST /interview-course-enrollments
  fastify.post('/interview-course-enrollments', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCourseEnrollmentSchema.parse(request.body)

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
        if (error.message === 'Student not found' || error.message === 'Interview course not found') {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interview-course-enrollments/:id/track-access - Update lastAccessedAt
  fastify.put('/interview-course-enrollments/:id/track-access', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCourseEnrollmentParamsSchema.parse(request.params)

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
        reply.status(500).send({ error: 'Failed to update access time' })
      }
    }
  })

  // DELETE /interview-course-enrollments/:id (admin only)
  fastify.delete('/interview-course-enrollments/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' })
        return
      }

      const { id } = interviewCourseEnrollmentParamsSchema.parse(request.params)
      const result = await enrollmentService.delete(id)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Enrollment not found') {
        reply.status(404).send({ error: 'Enrollment not found' })
      } else {
        reply.status(500).send({ error: 'Failed to delete enrollment' })
      }
    }
  })
}
