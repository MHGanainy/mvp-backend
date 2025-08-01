import { FastifyInstance } from 'fastify'
import { SimulationAttemptService } from './simulation-attempt.service'
import { aiFeedbackService } from './ai-feedback.service'
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

  // GET /simulation-attempts/correlation/:token - Get attempt by correlation token
  fastify.get('/simulation-attempts/correlation/:token', async (request, reply) => {
    try {
      const { token } = request.params as { token: string }
      const attempt = await simulationAttemptService.findByCorrelationToken(token)
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
      
      // Build voice assistant configuration
      const voiceAssistantConfig = {
        correlationToken: attempt.correlationToken,
        wsEndpoint: process.env.VOICE_ASSISTANT_WS_URL || 'ws://localhost:8000/ws/conversation',
        sessionConfig: {
          // These can be customized based on the simulation settings
          stt_provider: 'deepgram',
          llm_provider: 'deepinfra',
          tts_provider: 'deepinfra',
          system_prompt: `You are a patient named ${attempt.simulation.courseCase.patientName}. 
            Age: ${attempt.simulation.courseCase.patientAge} years old.
            Gender: ${attempt.simulation.courseCase.patientGender}.
            Diagnosis: ${attempt.simulation.courseCase.diagnosis}. 
            ${attempt.simulation.casePrompt}
            
            Important: Stay in character as the patient. Only provide information that a patient would realistically know about their condition. Do not diagnose yourself or provide medical explanations beyond what a typical patient might understand from their doctor.`
        }
      }
      
      reply.status(201).send({
        message: 'Simulation attempt started successfully',
        attempt,
        creditsDeducted: attempt.simulation.creditCost,
        remainingCredits: attempt.student.creditBalance,
        voiceAssistantConfig // Include this for the frontend
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
          // Log the actual error for debugging
          console.error('Validation error:', error)
          reply.status(400).send({ 
            error: 'Invalid data',
            details: error.message // Add this to see the actual error
          })
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

// PATCH /simulation-attempts/:id/complete-with-transcript - Complete with automatic transcript fetch and AI feedback generation
fastify.patch('/simulation-attempts/:id/complete-with-transcript', async (request, reply) => {
  try {
    const { id } = simulationAttemptParamsSchema.parse(request.params)
    
    // Get the attempt to retrieve correlation token
    const existingAttempt = await simulationAttemptService.findById(id)
    
    if (!existingAttempt.correlationToken) {
      reply.status(400).send({ 
        error: 'No correlation token found for this attempt. Cannot retrieve transcript.' 
      })
      return
    }
    
    // Complete with transcript fetch and AI feedback generation
    const attempt = await simulationAttemptService.completeWithTranscript(
      id, 
      existingAttempt.correlationToken
    )
    
    // Check if AI analysis was successful
    const aiFeedback = attempt.aiFeedback as any;
    const aiAnalysisSuccessful = aiFeedback?.analysisStatus !== 'failed';
    
    reply.send({
      message: aiAnalysisSuccessful 
        ? 'Simulation completed successfully with AI-generated feedback' 
        : 'Simulation completed with transcript, but AI analysis failed',
      attempt,
      duration: `${Math.floor(attempt.durationSeconds! / 60)}:${String(attempt.durationSeconds! % 60).padStart(2, '0')}`,
      score: attempt.score,
      transcriptCaptured: !!attempt.transcript,
      aiAnalysisStatus: aiAnalysisSuccessful ? 'success' : 'failed',
      feedbackGenerated: aiAnalysisSuccessful,
      messagesCount: attempt.transcript ? (attempt.transcript as any).messages?.length : 0,
      processingSteps: {
        transcriptRetrieved: !!attempt.transcript,
        aiModelCalled: true,
        feedbackGenerated: aiAnalysisSuccessful,
        scoreCalculated: attempt.score !== null
      }
    })
  } catch (error) {
    console.error('Error completing simulation with transcript:', error)
    
    if (error instanceof Error) {
      if (error.message === 'Simulation attempt not found') {
        reply.status(404).send({ error: 'Simulation attempt not found' })
      } else if (error.message === 'Simulation attempt is already completed') {
        reply.status(400).send({ error: 'Simulation attempt is already completed' })
      } else if (error.message.includes('Failed to retrieve transcript')) {
        reply.status(502).send({ 
          error: 'Failed to retrieve transcript from voice assistant service',
          details: 'The voice assistant API is not responding or returned an error'
        })
      } else if (error.message.includes('Correlation token is required')) {
        reply.status(400).send({ error: 'Correlation token is required for transcript retrieval' })
      } else {
        reply.status(400).send({ error: 'Invalid request', details: error.message })
      }
    } else {
      reply.status(500).send({ error: 'Internal server error' })
    }
  }
})

// POST /simulation-attempts/test-ai-feedback - Test AI feedback generation
fastify.post('/simulation-attempts/test-ai-feedback', async (request, reply) => {
  try {
    // Sample test data
    const testTranscript = {
      messages: [
        {
          timestamp: "00:00:05",
          speaker: "student" as const,
          message: "Hello, I'm Dr. Smith. Thank you for coming in today. What brings you to see me?"
        },
        {
          timestamp: "00:00:12",
          speaker: "ai_patient" as const,
          message: "Hello doctor. I've been having chest pain for the past few days and I'm quite worried about it."
        },
        {
          timestamp: "00:00:25",
          speaker: "student" as const,
          message: "I understand your concern. Can you tell me more about when this chest pain started and what it feels like?"
        },
        {
          timestamp: "00:00:35",
          speaker: "ai_patient" as const,
          message: "It started about 3 days ago. It's a sharp pain on the left side of my chest, and it gets worse when I take deep breaths."
        },
        {
          timestamp: "00:00:50",
          speaker: "student" as const,
          message: "That must be uncomfortable. Have you noticed if anything specific triggers the pain, like physical activity or certain movements?"
        }
      ],
      duration: 120,
      totalMessages: 5
    };

    const testCaseInfo = {
      patientName: "Sarah Johnson",
      diagnosis: "Pleuritic chest pain",
      caseTitle: "Young adult with acute chest pain",
      patientAge: 28,
      patientGender: "Female"
    };

    const result = await aiFeedbackService.generateFeedback(
      testTranscript,
      testCaseInfo,
      120
    );

    reply.send({
      message: 'AI feedback generated successfully',
      result: result,
      testData: {
        transcript: testTranscript,
        caseInfo: testCaseInfo
      }
    });

  } catch (error) {
    console.error('Error testing AI feedback:', error);
    reply.status(500).send({ 
      error: 'Failed to generate test AI feedback',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
})
}