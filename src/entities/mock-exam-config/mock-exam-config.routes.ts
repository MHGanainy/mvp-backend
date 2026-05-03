// mock-exam-config.routes.ts
import { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { MockExamConfigService } from './mock-exam-config.service'
import {
  createMockExamConfigSchema,
  updateMockExamConfigSchema,
  mockExamConfigListQuerySchema,
  mockExamConfigPublishSchema,
  mockExamConfigParamsSchema
} from './mock-exam-config.schema'
import {
  authenticate,
  isAdmin,
  getCurrentInstructorId,
  getCurrentStudentId
} from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

/**
 * Map service-thrown errors to HTTP status codes by string-matching message prefixes.
 * Returns true if handled, false if the caller should fall through to a 500.
 */
function mapServiceError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof z.ZodError) {
    reply.status(400).send({ error: 'Invalid request', details: error.errors })
    return true
  }
  if (!(error instanceof Error)) return false

  if (error.message === 'Mock exam config not found') {
    reply.status(404).send({ error: error.message })
    return true
  }
  if (error.message.startsWith('Forbidden:')) {
    reply.status(403).send({ error: error.message.replace(/^Forbidden:\s*/, '') })
    return true
  }
  if (
    error.message.startsWith('Duplicate course case IDs') ||
    error.message.startsWith('Course cases not found') ||
    error.message.startsWith('Cannot use archived course cases') ||
    error.message.startsWith('Course cases do not belong to exam') ||
    error.message.startsWith('Course cases missing Simulation rows') ||
    error.message === 'Instructor ID is required to create a mock exam config' ||
    error.message === 'Instructor not found'
  ) {
    reply.status(400).send({ error: error.message })
    return true
  }
  return false
}

export default async function mockExamConfigRoutes(fastify: FastifyInstance) {
  const service = new MockExamConfigService(fastify.prisma)

  // 1) POST /mock-exam-configs — create
  fastify.post(
    '/mock-exam-configs',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const data = createMockExamConfigSchema.parse(request.body)
        const callerInstructorId = getCurrentInstructorId(request)
        const callerIsAdmin = isAdmin(request)

        if (!callerIsAdmin && !callerInstructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        // Phase 6.C: admins may target a specific instructor via body.instructorId.
        // Non-admins always author as themselves — body.instructorId is silently
        // ignored (not an error: the field is admin-only, not a hostile input).
        let resolvedInstructorId: string
        if (callerIsAdmin) {
          if (!data.instructorId) {
            reply.status(400).send({
              error: 'Admin must specify instructorId when creating a mock exam config'
            })
            return
          }
          resolvedInstructorId = data.instructorId
        } else {
          resolvedInstructorId = callerInstructorId!
        }

        const config = await service.create(data, resolvedInstructorId)
        reply.status(201).send(config)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to create mock exam config')
      }
    }
  )

  // 2) GET /mock-exam-configs?examId=  — public/student list (optional auth)
  fastify.get('/mock-exam-configs', async (request, reply) => {
    try {
      const { examId } = mockExamConfigListQuerySchema.parse(request.query)

      let studentId: string | undefined
      try {
        await request.jwtVerify()
        if (request.role === 'student') {
          studentId = getCurrentStudentId(request) ?? undefined
        }
      } catch {
        // Anonymous — leave studentId undefined
      }

      const configs = await service.findPublished(examId, studentId)
      reply.send(configs)
    } catch (error) {
      if (mapServiceError(reply, error)) return
      replyInternalError(request, reply, error, 'Failed to list mock exam configs')
    }
  })

  // 3) GET /mock-exam-configs/my-configs?examId= — instructor's own list
  // Static path — must be registered BEFORE the parametric /:id route below.
  fastify.get(
    '/mock-exam-configs/my-configs',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { examId } = mockExamConfigListQuerySchema.parse(request.query)
        const instructorId = getCurrentInstructorId(request)

        if (!isAdmin(request) && !instructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        const configs = await service.findMyConfigs(examId, instructorId, isAdmin(request))
        reply.send(configs)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to list my mock exam configs')
      }
    }
  )

  // 4) GET /mock-exam-configs/:id — instructor detail view (own only; admin bypass)
  fastify.get(
    '/mock-exam-configs/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = mockExamConfigParamsSchema.parse(request.params)
        const instructorId = getCurrentInstructorId(request)

        if (!isAdmin(request) && !instructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        const config = await service.findOne(id, instructorId, isAdmin(request))
        reply.send(config)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to fetch mock exam config')
      }
    }
  )

  // 5) PATCH /mock-exam-configs/:id — edit metadata + station replacement
  fastify.patch(
    '/mock-exam-configs/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = mockExamConfigParamsSchema.parse(request.params)
        const data = updateMockExamConfigSchema.parse(request.body)
        const instructorId = getCurrentInstructorId(request)

        if (!isAdmin(request) && !instructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        const config = await service.update(id, data, instructorId, isAdmin(request))
        reply.send(config)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to update mock exam config')
      }
    }
  )

  // 6) PATCH /mock-exam-configs/:id/publish — toggle isPublished
  fastify.patch(
    '/mock-exam-configs/:id/publish',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = mockExamConfigParamsSchema.parse(request.params)
        const { isPublished } = mockExamConfigPublishSchema.parse(request.body)
        const instructorId = getCurrentInstructorId(request)

        if (!isAdmin(request) && !instructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        const config = await service.togglePublish(id, isPublished, instructorId, isAdmin(request))
        reply.send(config)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to toggle publish state')
      }
    }
  )

  // 7) DELETE /mock-exam-configs/:id — soft-delete only (sets isActive: false)
  fastify.delete(
    '/mock-exam-configs/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = mockExamConfigParamsSchema.parse(request.params)
        const instructorId = getCurrentInstructorId(request)

        if (!isAdmin(request) && !instructorId) {
          reply.status(403).send({ error: 'Instructor role required' })
          return
        }

        const config = await service.softDelete(id, instructorId, isAdmin(request))
        reply.send({ message: 'Mock exam config archived', config })
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to archive mock exam config')
      }
    }
  )
}
