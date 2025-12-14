import { FastifyInstance } from 'fastify'
import { SubsectionProgressService } from './subsection-progress.service'
import {
  startSubsectionProgressSchema,
  updateSubsectionProgressSchema,
  completeSubsectionSchema,
  subsectionProgressParamsSchema,
  subsectionProgressEnrollmentParamsSchema
} from './subsection-progress.schema'
import {
  authenticate,
  getCurrentStudentId,
  isAdmin
} from '../../middleware/auth.middleware'

export default async function subsectionProgressRoutes(fastify: FastifyInstance) {
  const progressService = new SubsectionProgressService(fastify.prisma)

  // GET /subsection-progress/:id
  fastify.get('/subsection-progress/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = subsectionProgressParamsSchema.parse(request.params)
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
        reply.status(500).send({ error: 'Failed to fetch progress' })
      }
    }
  })

  // GET /subsection-progress/enrollment/:enrollmentId
  fastify.get('/subsection-progress/enrollment/:enrollmentId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { enrollmentId } = subsectionProgressEnrollmentParamsSchema.parse(request.params)

      // Verify enrollment ownership
      const enrollment = await fastify.prisma.courseEnrollment.findUnique({
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
      reply.status(500).send({ error: 'Failed to fetch progress' })
    }
  })

  // POST /subsection-progress - Start tracking a subsection
  fastify.post('/subsection-progress', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = startSubsectionProgressSchema.parse(request.body)

      // Verify enrollment ownership
      const enrollment = await fastify.prisma.courseEnrollment.findUnique({
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /subsection-progress/:id - Update progress
  fastify.put('/subsection-progress/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = subsectionProgressParamsSchema.parse(request.params)
      const data = updateSubsectionProgressSchema.parse(request.body)

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
        reply.status(500).send({ error: 'Failed to update progress' })
      }
    }
  })

  // PATCH /subsection-progress/:id/complete - Mark subsection as complete
  fastify.patch('/subsection-progress/:id/complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = subsectionProgressParamsSchema.parse(request.params)
      const data = completeSubsectionSchema.parse(request.body || {})

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
          reply.status(500).send({ error: 'Failed to complete subsection' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /subsection-progress/:id/add-time - Add time spent
  fastify.patch('/subsection-progress/:id/add-time', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = subsectionProgressParamsSchema.parse(request.params)
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
        reply.status(500).send({ error: 'Failed to add time' })
      }
    }
  })
}
