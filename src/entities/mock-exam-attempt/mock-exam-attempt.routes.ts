// mock-exam-attempt.routes.ts
//
// Student-facing endpoints require role === 'student' via ensureStudent().
// Admins can read results/analysis/summary for any attempt (ownership resolved
// by fetching the attempt's studentId first via getAttemptStudentId).
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
  adminAttemptsQuerySchema,
  regenerateFeedbackParamsSchema,
  generateRandomSchema
} from './mock-exam-attempt.schema'
import { authenticate, getCurrentStudentId, isAdmin } from '../../middleware/auth.middleware'
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
    error.message === 'Slot has no associated simulation attempt to regenerate' ||
    error.message.startsWith('Not enough cases available')
  ) {
    reply.status(400).send({ error: error.message })
    return true
  }
  if (error.message === 'Exam not found') {
    reply.status(404).send({ error: error.message })
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

  // POST /mock-exam-attempts/generate-random
  fastify.post(
    '/mock-exam-attempts/generate-random',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const data = generateRandomSchema.parse(request.body)
        const studentId = ensureStudent(request, reply)
        if (!studentId) return

        const attempt = await service.generateRandom(
          data.examId,
          studentId,
          data.stationCount,
          data.specialtyIds,
          data.curriculumIds,
          data.courseIds,
          data.onlyUnpracticed
        )
        reply.status(201).send(attempt)
      } catch (error) {
        if (mapServiceError(reply, error)) return
        replyInternalError(request, reply, error, 'Failed to generate random mock exam')
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
  // Admin variant: pass targetStudentId to view any student's attempts (examId optional).
  fastify.get(
    '/mock-exam-attempts',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        if (isAdmin(request)) {
          const { targetStudentId, examId, limit, offset } = adminAttemptsQuerySchema.parse(request.query)
          const result = await service.findMyAttempts(targetStudentId, examId, limit, offset)
          return reply.send(result)
        }

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
        let studentId: string
        if (isAdmin(request)) {
          studentId = await service.getAttemptStudentId(id)
        } else {
          const sid = ensureStudent(request, reply)
          if (!sid) return
          studentId = sid
        }

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
        let studentId: string
        if (isAdmin(request)) {
          studentId = await service.getAttemptStudentId(id)
        } else {
          const sid = ensureStudent(request, reply)
          if (!sid) return
          studentId = sid
        }

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
        let studentId: string
        if (isAdmin(request)) {
          studentId = await service.getAttemptStudentId(id)
        } else {
          const sid = ensureStudent(request, reply)
          if (!sid) return
          studentId = sid
        }

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
