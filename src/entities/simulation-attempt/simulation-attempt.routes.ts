import { FastifyInstance } from 'fastify'
import { SimulationAttemptService } from './simulation-attempt.service'
import { 
  createSimulationAttemptSchema, 
  completeSimulationAttemptSchema,
  updateSimulationAttemptSchema,
  simulationAttemptParamsSchema,
  simulationAttemptStudentParamsSchema,
  simulationAttemptSimulationParamsSchema,
  simulationAttemptQuerySchema
} from './simulation-attempt.schema'

export default async function simulationAttemptRoutes(fastify: FastifyInstance) {
  const simulationAttemptService = new SimulationAttemptService(fastify.prisma)

  // GET /simulation-attempts - Get all simulation attempts (with query filters)
  fastify.get('/simulation-attempts', async (request, reply) => {
    try {
      const query = simulationAttemptQuerySchema.parse(request.query)
      const attempts = await simulationAttemptService.findAll(query)
      reply.send(attempts)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch simulation attempts' })
    }
  })

  // GET /simulation-attempts/student/:studentId - Get attempts by student
  fastify.get('/simulation-attempts/student/:studentId', async (request, reply) => {
    try {
      const { studentId } = simulationAttemptStudentParamsSchema.parse(request.params)
      const query = simulationAttemptQuerySchema.parse(request.query)
      const attempts = await simulationAttemptService.findByStudent(studentId, query)
      reply.send(attempts)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/simulation/:simulationId - Get attempts by simulation
  fastify.get('/simulation-attempts/simulation/:simulationId', async (request, reply) => {
    try {
      const { simulationId } = simulationAttemptSimulationParamsSchema.parse(request.params)
      const query = simulationAttemptQuerySchema.parse(request.query)
      const attempts = await simulationAttemptService.findBySimulation(simulationId, query)
      reply.send(attempts)
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation not found') {
        reply.status(404).send({ error: 'Simulation not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/student/:studentId/stats - Get student performance statistics
  fastify.get('/simulation-attempts/student/:studentId/stats', async (request, reply) => {
    try {
      const { studentId } = simulationAttemptStudentParamsSchema.parse(request.params)
      const stats = await simulationAttemptService.getStudentStats(studentId)
      reply.send(stats)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/simulation/:simulationId/stats - Get simulation usage statistics
  fastify.get('/simulation-attempts/simulation/:simulationId/stats', async (request, reply) => {
    try {
      const { simulationId } = simulationAttemptSimulationParamsSchema.parse(request.params)
      const stats = await simulationAttemptService.getSimulationStats(simulationId)
      reply.send(stats)
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation not found') {
        reply.status(404).send({ error: 'Simulation not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/:id - Get simulation attempt by ID
  fastify.get('/simulation-attempts/:id', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      const attempt = await simulationAttemptService.findById(id)
      reply.send(attempt)
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /simulation-attempts - Start new simulation attempt (deducts credits)
  fastify.post('/simulation-attempts', async (request, reply) => {
    try {
      const data = createSimulationAttemptSchema.parse(request.body)
      const attempt = await simulationAttemptService.create(data)
      reply.status(201).send({
        message: 'Simulation attempt started successfully',
        attempt,
        creditsDeducted: attempt.simulation.creditCost,
        remainingCredits: attempt.student.creditBalance
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Student not found') {
          reply.status(404).send({ error: 'Student not found' })
        } else if (error.message === 'Simulation not found') {
          reply.status(404).send({ error: 'Simulation not found' })
        } else if (error.message.includes('Insufficient credits')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /simulation-attempts/:id/complete - Complete simulation attempt (add feedback & score)
  fastify.patch('/simulation-attempts/:id/complete', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      const data = completeSimulationAttemptSchema.parse(request.body)
      const attempt = await simulationAttemptService.complete(id, data)
      reply.send({
        message: 'Simulation attempt completed successfully',
        attempt,
        duration: `${Math.floor(attempt.durationSeconds! / 60)}:${String(attempt.durationSeconds! % 60).padStart(2, '0')}`,
        score: attempt.score,
        feedbackGenerated: !!attempt.aiFeedback
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Simulation attempt not found') {
          reply.status(404).send({ error: 'Simulation attempt not found' })
        } else if (error.message === 'Simulation attempt is already completed') {
          reply.status(400).send({ error: 'Simulation attempt is already completed' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /simulation-attempts/:id - Update simulation attempt (admin only)
  fastify.put('/simulation-attempts/:id', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      const data = updateSimulationAttemptSchema.parse(request.body)
      const attempt = await simulationAttemptService.update(id, data)
      reply.send({
        message: 'Simulation attempt updated successfully',
        attempt
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /simulation-attempts/:id - Delete simulation attempt (refunds credits if incomplete)
  fastify.delete('/simulation-attempts/:id', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      
      // Get attempt details before deletion for response
      const attempt = await simulationAttemptService.findById(id)
      const wasIncomplete = !attempt.isCompleted
      const creditsToRefund = wasIncomplete ? attempt.simulation.creditCost : 0
      
      await simulationAttemptService.delete(id)
      
      reply.send({
        message: 'Simulation attempt deleted successfully',
        creditsRefunded: creditsToRefund,
        wasIncomplete
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/:id/transcript - Get detailed transcript for an attempt
  fastify.get('/simulation-attempts/:id/transcript', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      const attempt = await simulationAttemptService.findById(id)
      
      if (!attempt.transcript) {
        reply.status(404).send({ error: 'No transcript available for this attempt' })
        return
      }
      
      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.simulation.courseCase.title,
        startedAt: attempt.startedAt,
        endedAt: attempt.endedAt,
        isCompleted: attempt.isCompleted,
        transcript: attempt.transcript
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /simulation-attempts/:id/feedback - Get detailed AI feedback for an attempt
  fastify.get('/simulation-attempts/:id/feedback', async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params)
      const attempt = await simulationAttemptService.findById(id)
      
      if (!attempt.aiFeedback) {
        reply.status(404).send({ error: 'No AI feedback available for this attempt' })
        return
      }
      
      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.simulation.courseCase.title,
        score: attempt.score,
        isCompleted: attempt.isCompleted,
        feedback: attempt.aiFeedback
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}