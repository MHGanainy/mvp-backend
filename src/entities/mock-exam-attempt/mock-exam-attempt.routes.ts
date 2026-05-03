// mock-exam-attempt.routes.ts
//
// Phase 3 — student-facing endpoints. All routes:
//   1. authenticate (any JWT)
//   2. require role === 'student' (admins do not take mocks)
//   3. ownership enforced inside service via studentId match
//
// 404 vs 403: students never see 403. Both "not found" and "not yours" return
// 404 to avoid leaking attempt existence across students.
import { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { MockExamAttemptService } from './mock-exam-attempt.service'
import {
  startCuratedSchema,
  completeSlotSchema,
  attemptIdParamSchema,
  myAttemptsQuerySchema,
  regenerateFeedbackParamsSchema
} from './mock-exam-attempt.schema'
import { authenticate, getCurrentStudentId } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

function mapServiceError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof z.ZodError) {
    reply.status(400).send({ error: 'Invalid request', details: error.errors })
    return true
  }
  if (!(error instanceof Error)) return false

  if (
    error.message === 'Mock exam attempt not found' ||
    error.message === 'Mock exam config not found' ||
    error.message === 'Simulation attempt not found'
  ) {
    reply.status(404).send({ error: error.message })
    return true
  }
  if (
    error.message.startsWith('AI feedback generation failed') ||
    error.message.startsWith('AI summary generation failed')
  ) {
    reply.status(502).send({ error: error.message })
    return true
  }
  if (
    error.message === 'Exam is already finished' ||
    error.message === 'Simulation attempt does not belong to the requesting student' ||
    error.message === 'Simulation attempt is for a different course case than this slot' ||
    error.message === 'No correlation token found for this attempt' ||
    error.message === 'Mock exam config has no stations' ||
    error.message === 'Mock exam config references archived course cases (data integrity)' ||
    error.message.startsWith('Attempt is not finished') ||
    error.message === 'Slot has no associated simulation attempt to regenerate'
  ) {
    reply.status(400).send({ error: error.message })
    return true
  }
  return false
}

function ensureStudent(request: any, reply: FastifyReply): string | null {
  const studentId = getCurrentStudentId(request)
  if (request.role !== 'student' || !studentId) {
    reply.status(403).send({ error: 'Student role required' })
    return null
  }
  return studentId
}

export default async function mockExamAttemptRoutes(fastify: FastifyInstance) {
  const service = new MockExamAttemptService(fastify.prisma, fastify.log)

  // POST /mock-exam-attempts/start-curated
  fastify.post(
    '/mock-exam-attempts/start-curated',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const data = startCuratedSchema.parse(request.body)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const attempt = await service.startCurated(data.mockExamConfigId, studentId)
        reply.status(201).send(attempt)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to start mock exam attempt')
      }
    }
  )

  // GET /mock-exam-attempts/:id  — full attempt detail (also powers resume)
  fastify.get(
    '/mock-exam-attempts/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const attempt = await service.findOne(id, studentId)
        reply.send(attempt)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to fetch mock exam attempt')
      }
    }
  )

  // POST /mock-exam-attempts/:id/complete-slot
  fastify.post(
    '/mock-exam-attempts/:id/complete-slot',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const data = completeSlotSchema.parse(request.body)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const result = await service.completeSlot(
          id,
          data.slotId,
          data.simulationAttemptId,
          studentId
        )
        reply.send(result)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to complete slot')
      }
    }
  )

  // POST /mock-exam-attempts/:id/finish
  fastify.post(
    '/mock-exam-attempts/:id/finish',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const result = await service.finish(id, studentId)
        reply.send(result)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to finish mock exam attempt')
      }
    }
  )

  // ===== Phase 4 endpoints =====

  // GET /mock-exam-attempts?examId=&limit=&offset=  — student's My Past Attempts list
  // Static path "/" must be registered BEFORE parametric "/:id" routes for Fastify
  // static-first matching. The Phase 3 routes register "/:id" later; we insert this
  // BEFORE in this function body — but Fastify route registration order within a
  // plugin is what matters. Since this handler is added below the Phase 3 routes
  // and Fastify uses registration order, we must ensure no path collision. The path
  // here is "/mock-exam-attempts" (no ":id"), so there's no collision with "/:id".
  fastify.get(
    '/mock-exam-attempts',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { examId, limit, offset } = myAttemptsQuerySchema.parse(request.query)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const result = await service.findMyAttempts(studentId, examId, limit, offset)
        reply.send(result)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to list mock exam attempts')
      }
    }
  )

  // GET /mock-exam-attempts/:id/results — full results, requires finish
  fastify.get(
    '/mock-exam-attempts/:id/results',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const results = await service.getResults(id, studentId)
        reply.send(results)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to fetch results')
      }
    }
  )

  // POST /mock-exam-attempts/:id/analysis — domain breakdown, idempotent (cached)
  fastify.post(
    '/mock-exam-attempts/:id/analysis',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const analysis = await service.getAnalysis(id, studentId)
        reply.send(analysis)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to fetch analysis')
      }
    }
  )

  // POST /mock-exam-attempts/:id/summary
  // Phase 6. AI examiner summary across all completed slots.
  // Idempotent (cached on first success). Returns:
  //  - 200 { available: true, summary, recommendations, generatedAt } on success or cache hit
  //  - 200 { available: false, reason: 'pre_phase_6' | 'insufficient_stations' } when not eligible
  //  - 400 if attempt isn't finished
  //  - 404 if attempt doesn't exist or isn't yours
  //  - 502 on AI failure (failed generation does NOT cache)
  fastify.post(
    '/mock-exam-attempts/:id/summary',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = attemptIdParamSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const result = await service.getSummary(id, studentId)
        reply.send(result)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to generate mock exam summary')
      }
    }
  )

  // POST /mock-exam-attempts/:id/slots/:slotId/regenerate-feedback
  // Re-runs AI feedback for a single slot. 502 on AI failure (this function throws,
  // unlike completeWithTranscript which returns a failed-state row).
  fastify.post(
    '/mock-exam-attempts/:id/slots/:slotId/regenerate-feedback',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id, slotId } = regenerateFeedbackParamsSchema.parse(request.params)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const result = await service.regenerateFeedback(id, slotId, studentId)
        reply.send(result)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to regenerate feedback')
      }
    }
  )
}
