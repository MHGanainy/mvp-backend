import { FastifyInstance } from 'fastify'
import { InterviewSubsectionProgressService } from './interview-subsection-progress.service'
import {
  startInterviewSubsectionProgressSchema,
  updateInterviewSubsectionProgressSchema,
  completeInterviewSubsectionSchema,
  interviewSubsectionProgressParamsSchema,
  interviewSubsectionProgressEnrollmentParamsSchema
} from './interview-subsection-progress.schema'
import {
  authenticate,
  getCurrentStudentId,
  isAdmin
} from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

export default async function interviewSubsectionProgressRoutes(fastify: FastifyInstance) {
  const progressService = new InterviewSubsectionProgressService(fastify.prisma)

  // GET /interview-subsection-progress/:id
  fastify.get('/interview-subsection-progress/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewSubsectionProgressParamsSchema.parse(request.params)
      const progress = await progressService.findById(id)

      // Verify access
      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (progress.enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'Access denied' })
          return
        }
      }

      reply.send(progress)
    } catch (error) {
      if (error instanceof Error && error.message === 'Progress not found') {
        reply.status(404).send({ error: 'Progress not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch progress')
      }
    }
  })

  // GET /interview-subsection-progress/enrollment/:enrollmentId
  fastify.get('/interview-subsection-progress/enrollment/:enrollmentId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { enrollmentId } = interviewSubsectionProgressEnrollmentParamsSchema.parse(request.params)

      // Verify enrollment ownership
      const enrollment = await fastify.prisma.interviewCourseEnrollment.findUnique({
        where: { id: enrollmentId }
      })

      if (!enrollment) {
        reply.status(404).send({ error: 'Enrollment not found' })
        return
      }

      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'Access denied' })
          return
        }
      }

      const progress = await progressService.findByEnrollment(enrollmentId)
      reply.send(progress)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch progress')
    }
  })

  // POST /interview-subsection-progress - Start tracking a subsection
  fastify.post('/interview-subsection-progress', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = startInterviewSubsectionProgressSchema.parse(request.body)

      // Verify enrollment ownership
      const enrollment = await fastify.prisma.interviewCourseEnrollment.findUnique({
        where: { id: data.enrollmentId }
      })

      if (!enrollment) {
        reply.status(404).send({ error: 'Enrollment not found' })
        return
      }

      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'You can only track your own progress' })
          return
        }
      }

      const progress = await progressService.start(data)
      reply.status(201).send(progress)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Enrollment not found' ||
            error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to start subsection progress')
      }
    }
  })

  // PUT /interview-subsection-progress/:id - Update progress
  fastify.put('/interview-subsection-progress/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewSubsectionProgressParamsSchema.parse(request.params)
      const data = updateInterviewSubsectionProgressSchema.parse(request.body)

      const progress = await progressService.findById(id)
      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (progress.enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'You can only update your own progress' })
          return
        }
      }

      const updated = await progressService.update(id, data)
      reply.send(updated)
    } catch (error) {
      if (error instanceof Error && error.message === 'Progress not found') {
        reply.status(404).send({ error: 'Progress not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to update progress')
      }
    }
  })

  // PATCH /interview-subsection-progress/:id/complete - Mark subsection as complete
  fastify.patch('/interview-subsection-progress/:id/complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewSubsectionProgressParamsSchema.parse(request.params)
      const data = completeInterviewSubsectionSchema.parse(request.body || {})

      const progress = await progressService.findById(id)
      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (progress.enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'You can only complete your own progress' })
          return
        }
      }

      const completed = await progressService.complete(id, data)
      reply.send(completed)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Progress not found') {
          reply.status(404).send({ error: 'Progress not found' })
        } else if (error.message === 'Subsection already completed') {
          reply.status(400).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to complete subsection')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to complete subsection')
      }
    }
  })

  // PATCH /interview-subsection-progress/:id/uncomplete - Mark subsection as incomplete
  fastify.patch('/interview-subsection-progress/:id/uncomplete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewSubsectionProgressParamsSchema.parse(request.params)

      const progress = await progressService.findById(id)
      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (progress.enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'You can only uncomplete your own progress' })
          return
        }
      }

      const uncompleted = await progressService.uncomplete(id)
      reply.send(uncompleted)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Progress not found') {
          reply.status(404).send({ error: 'Progress not found' })
        } else if (error.message === 'Subsection is not completed') {
          reply.status(400).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to uncomplete subsection')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to uncomplete subsection')
      }
    }
  })

  // PATCH /interview-subsection-progress/:id/add-time - Add time spent
  fastify.patch('/interview-subsection-progress/:id/add-time', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewSubsectionProgressParamsSchema.parse(request.params)
      const { seconds } = request.body as { seconds: number }

      if (!seconds || seconds < 0) {
        reply.status(400).send({ error: 'Valid seconds required' })
        return
      }

      const progress = await progressService.findById(id)
      if (!isAdmin(request)) {
        const studentId = getCurrentStudentId(request)
        if (progress.enrollment.studentId !== studentId) {
          reply.status(403).send({ error: 'You can only update your own progress' })
          return
        }
      }

      const updated = await progressService.addTimeSpent(id, seconds)
      reply.send(updated)
    } catch (error) {
      if (error instanceof Error && error.message === 'Progress not found') {
        reply.status(404).send({ error: 'Progress not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to add time')
      }
    }
  })
}
