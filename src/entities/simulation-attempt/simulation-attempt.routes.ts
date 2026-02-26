import { FastifyInstance } from "fastify";
import { SimulationAttemptService } from "./simulation-attempt.service";
import { aiFeedbackService } from "./ai-feedback.service";
import {
  createSimulationAttemptSchema,
  completeSimulationAttemptSchema,
  updateSimulationAttemptSchema,
  simulationAttemptParamsSchema,
  simulationAttemptStudentParamsSchema,
  simulationAttemptSimulationParamsSchema,
  simulationAttemptQuerySchema,
  simulationAttemptStudentCaseParamsSchema,
} from "./simulation-attempt.schema";
import { replyInternalError } from "../../shared/route-error";
export default async function simulationAttemptRoutes(
  fastify: FastifyInstance
) {
  const simulationAttemptService = new SimulationAttemptService(
    fastify.prisma,
    fastify.log.child({ service: 'SimulationAttemptService' })
  );

  // GET /simulation-attempts - Get all simulation attempts (with query filters)
  fastify.get("/simulation-attempts", async (request, reply) => {
    try {
      const query = simulationAttemptQuerySchema.parse(request.query);
      const attempts = await simulationAttemptService.findAll(query);
      reply.send(attempts);
    } catch (error) {
      replyInternalError(request, reply, error, "Failed to fetch simulation attempts");
    }
  });

  // GET /simulation-attempts/student/:studentId - Get attempts by student
  fastify.get(
    "/simulation-attempts/student/:studentId",
    async (request, reply) => {
      try {
        const { studentId } = simulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const query = simulationAttemptQuerySchema.parse(request.query);
        const attempts = await simulationAttemptService.findByStudent(
          studentId,
          query
        );
        reply.send(attempts);
      } catch (error) {
        if (error instanceof Error && error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  fastify.get(
    "/simulation-attempts/student/:studentId/case/:caseId",
    async (request, reply) => {
      try {
        const { studentId, caseId } =
          simulationAttemptStudentCaseParamsSchema.parse(request.params);
        const query = simulationAttemptQuerySchema.parse(request.query);
        const attempts = await simulationAttemptService.findByStudentAndCase(
          studentId,
          caseId,
          query
        );
        reply.send(attempts);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Student not found") {
            reply.status(404).send({ error: "Student not found" });
          } else if (error.message === "Course case not found") {
            reply.status(404).send({ error: "Course case not found" });
          } else if (error.message === "No simulation exists for this case") {
            reply
              .status(404)
              .send({ error: "No simulation exists for this case" });
          } else {
            reply.status(400).send({ error: "Invalid request" });
          }
        } else {
          replyInternalError(request, reply, error, "Failed to fetch simulation attempts by student and case");
        }
      }
    }
  );

  // GET /simulation-attempts/simulation/:simulationId - Get attempts by simulation
  fastify.get(
    "/simulation-attempts/simulation/:simulationId",
    async (request, reply) => {
      try {
        const { simulationId } = simulationAttemptSimulationParamsSchema.parse(
          request.params
        );
        const query = simulationAttemptQuerySchema.parse(request.query);
        const attempts = await simulationAttemptService.findBySimulation(
          simulationId,
          query
        );
        reply.send(attempts);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Simulation not found"
        ) {
          reply.status(404).send({ error: "Simulation not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /simulation-attempts/student/:studentId/stats - Get student performance statistics
  fastify.get(
    "/simulation-attempts/student/:studentId/stats",
    async (request, reply) => {
      try {
        const { studentId } = simulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const stats = await simulationAttemptService.getStudentStats(studentId);
        reply.send(stats);
      } catch (error) {
        if (error instanceof Error && error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /simulation-attempts/student/:studentId/analytics - Get student comprehensive analytics
  fastify.get(
    "/simulation-attempts/student/:studentId/analytics",
    async (request, reply) => {
      try {
        const { studentId } = simulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const analytics = await simulationAttemptService.getStudentAnalytics(
          studentId
        );
        reply.send(analytics);
      } catch (error) {
        if (error instanceof Error && error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /simulation-attempts/simulation/:simulationId/stats - Get simulation usage statistics
  fastify.get(
    "/simulation-attempts/simulation/:simulationId/stats",
    async (request, reply) => {
      try {
        const { simulationId } = simulationAttemptSimulationParamsSchema.parse(
          request.params
        );
        const stats = await simulationAttemptService.getSimulationStats(
          simulationId
        );
        reply.send(stats);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Simulation not found"
        ) {
          reply.status(404).send({ error: "Simulation not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /simulation-attempts/:id - Get simulation attempt by ID
  fastify.get("/simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);
      const attempt = await simulationAttemptService.findById(id);
      reply.send(attempt);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /simulation-attempts/correlation/:token - Get attempt by correlation token
  fastify.get(
    "/simulation-attempts/correlation/:token",
    async (request, reply) => {
      try {
        const { token } = request.params as { token: string };
        const attempt = await simulationAttemptService.findByCorrelationToken(
          token
        );
        reply.send(attempt);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Simulation attempt not found"
        ) {
          reply.status(404).send({ error: "Simulation attempt not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // POST /simulation-attempts - Start new simulation attempt (NO upfront credit deduction)
  fastify.post("/simulation-attempts", async (request, reply) => {
    try {
      const data = createSimulationAttemptSchema.parse(request.body);

      request.log.info({
        studentId: data.studentId,
        simulationId: data.simulationId,
      }, 'Creating new simulation attempt');

      const attempt = await simulationAttemptService.create(data);

      request.log.info({
        attemptId: attempt.id,
        correlationToken: attempt.voiceAssistantConfig?.correlationToken,
      }, 'Simulation attempt created successfully');

      // The attempt now includes voiceAssistantConfig from LiveKit service
      reply.status(201).send({
        message:
          "Simulation attempt started successfully. Credits will be charged per minute during conversation.",
        attempt,
        billingInfo: {
          creditsWillBeCharged: "per_minute",
          currentBalance: attempt.student.creditBalance,
          chargeRate: "1 credit per minute",
          minimumRequired: 1,
        },
        voiceAssistantConfig: attempt.voiceAssistantConfig,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else if (error.message === "Simulation not found") {
          reply.status(404).send({ error: "Simulation not found" });
        } else if (error.message.includes("Insufficient credits")) {
          reply.status(400).send({
            error: error.message,
            minimumRequired: 1,
          });
        } else {
          request.log.error({ err: error }, 'Validation error creating simulation attempt');
          reply.status(400).send({
            error: "Invalid data",
            details: error.message,
          });
        }
      } else {
        request.log.error({ err: error }, 'Internal server error creating simulation attempt');
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // PATCH /simulation-attempts/:id/complete - Complete simulation attempt (add feedback & score)
  fastify.patch("/simulation-attempts/:id/complete", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);
      const data = completeSimulationAttemptSchema.parse(request.body);
      const attempt = await simulationAttemptService.complete(id, data);
      reply.send({
        message: "Simulation attempt completed successfully",
        attempt,
        duration: `${Math.floor(attempt.durationSeconds! / 60)}:${String(
          attempt.durationSeconds! % 60
        ).padStart(2, "0")}`,
        score: attempt.score,
        feedbackGenerated: !!attempt.aiFeedback,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Simulation attempt not found") {
          reply.status(404).send({ error: "Simulation attempt not found" });
        } else if (
          error.message === "Simulation attempt is already completed"
        ) {
          reply
            .status(400)
            .send({ error: "Simulation attempt is already completed" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      } else {
        replyInternalError(request, reply, error, "Failed to complete simulation attempt");
      }
    }
  });

  // PUT /simulation-attempts/:id - Update simulation attempt (admin only)
  fastify.put("/simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);
      const data = updateSimulationAttemptSchema.parse(request.body);
      const attempt = await simulationAttemptService.update(id, data);
      reply.send({
        message: "Simulation attempt updated successfully",
        attempt,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // DELETE /simulation-attempts/:id - Delete simulation attempt (refunds credits if incomplete)
  fastify.delete("/simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);

      // Get attempt details before deletion for response
      const attempt = await simulationAttemptService.findById(id);
      const wasIncomplete = !attempt.isCompleted;
      const creditsToRefund = wasIncomplete ? attempt.simulation.creditCost : 0;

      await simulationAttemptService.delete(id);

      reply.send({
        message: "Simulation attempt deleted successfully",
        creditsRefunded: creditsToRefund,
        wasIncomplete,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /simulation-attempts/:id/transcript - Get detailed transcript for an attempt
  fastify.get("/simulation-attempts/:id/transcript", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);
      const attempt = await simulationAttemptService.findById(id);

      if (!attempt.transcript) {
        reply
          .status(404)
          .send({ error: "No transcript available for this attempt" });
        return;
      }

      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.simulation.courseCase.title,
        startedAt: attempt.startedAt,
        endedAt: attempt.endedAt,
        isCompleted: attempt.isCompleted,
        transcript: attempt.transcript,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /simulation-attempts/:id/feedback - Get detailed AI feedback for an attempt
  fastify.get("/simulation-attempts/:id/feedback", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);
      const attempt = await simulationAttemptService.findById(id);

      if (!attempt.aiFeedback) {
        reply
          .status(404)
          .send({ error: "No AI feedback available for this attempt" });
        return;
      }

      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.simulation.courseCase.title,
        score: attempt.score,
        isCompleted: attempt.isCompleted,
        feedback: attempt.aiFeedback,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // PATCH /simulation-attempts/:id/complete-with-transcript - Complete with automatic transcript fetch and AI feedback generation
  fastify.patch(
    "/simulation-attempts/:id/complete-with-transcript",
    async (request, reply) => {
      try {
        const { id } = simulationAttemptParamsSchema.parse(request.params);

        request.log.info({ attemptId: id }, 'Completing simulation with transcript');

        const existingAttempt = await simulationAttemptService.findById(id);

        if (!existingAttempt.correlationToken) {
          reply.status(400).send({
            error:
              "No correlation token found for this attempt. Cannot retrieve transcript.",
          });
          return;
        }

        request.log.info({
          attemptId: id,
          correlationToken: existingAttempt.correlationToken,
        }, 'Found correlation token, starting completion process');

        const attempt = await simulationAttemptService.completeWithTranscript(
          id,
          existingAttempt.correlationToken
        );

        const aiFeedback = attempt.aiFeedback as any;
        const aiAnalysisSuccessful = aiFeedback?.analysisStatus !== "failed";

        request.log.info({
          attemptId: id,
          score: attempt.score,
          aiAnalysisSuccessful,
          transcriptCaptured: !!attempt.transcript,
          messagesCount: attempt.transcript ? (attempt.transcript as any).messages?.length : 0,
        }, 'Simulation completion finished');

        reply.send({
          message: aiAnalysisSuccessful
            ? "Simulation completed successfully with AI-generated feedback"
            : "Simulation completed with transcript, but AI analysis failed",
          attempt: {
            ...attempt,
            // Ensure the marking domains are visible in the response
            aiFeedback: aiFeedback
              ? {
                  ...aiFeedback,
                  // The markingDomains should now include all details
                }
              : null,
          },
          duration: `${Math.floor(attempt.durationSeconds! / 60)}:${String(
            attempt.durationSeconds! % 60
          ).padStart(2, "0")}`,
          score: attempt.score,
          transcriptCaptured: !!attempt.transcript,
          aiAnalysisStatus: aiAnalysisSuccessful ? "success" : "failed",
          feedbackGenerated: aiAnalysisSuccessful,
          messagesCount: attempt.transcript
            ? (attempt.transcript as any).messages?.length
            : 0,
          // Include marking summary
          markingSummary: aiFeedback?.markingStructure
            ? {
                totalDomains: aiFeedback.markingStructure.length,
                totalCriteria: aiFeedback.overallResult?.totalCriteria,
                criteriaMet: aiFeedback.overallResult?.criteriaMet,
                criteriaNotMet: aiFeedback.overallResult?.criteriaNotMet,
                classification: aiFeedback.overallResult?.classificationLabel,
              }
            : null,
          processingSteps: {
            transcriptRetrieved: !!attempt.transcript,
            aiModelCalled: true,
            feedbackGenerated: aiAnalysisSuccessful,
            scoreCalculated: attempt.score !== null,
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Error completing simulation with transcript');

        if (error instanceof Error) {
          if (error.message === "Simulation attempt not found") {
            reply.status(404).send({ error: "Simulation attempt not found" });
          } else if (
            error.message === "Simulation attempt is already completed"
          ) {
            reply
              .status(400)
              .send({ error: "Simulation attempt is already completed" });
          } else if (error.message.includes("Failed to retrieve transcript")) {
            reply.status(502).send({
              error:
                "Failed to retrieve transcript from voice assistant service",
              details:
                "The voice assistant API is not responding or returned an error",
            });
          } else if (error.message.includes("Correlation token is required")) {
            reply
              .status(400)
              .send({
                error: "Correlation token is required for transcript retrieval",
              });
          } else {
            reply
              .status(400)
              .send({ error: "Invalid request", details: error.message });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
        }
      }
    }
  );

  // PATCH /simulation-attempts/:id/generate-feedback - Regenerate feedback for existing attempt
  fastify.patch(
    "/simulation-attempts/:id/generate-feedback",
    async (request, reply) => {
      try {
        const { id } = simulationAttemptParamsSchema.parse(request.params);

        const updatedAttempt = await simulationAttemptService.generateFeedbackForExistingAttempt(id);

        const aiFeedback = updatedAttempt.aiFeedback as any;
        const aiAnalysisSuccessful = aiFeedback?.analysisStatus === "success";

        reply.send({
          message: aiAnalysisSuccessful
            ? "Feedback regenerated successfully"
            : "Feedback regeneration failed",
          attempt: updatedAttempt,
          duration: `${Math.floor(updatedAttempt.durationSeconds! / 60)}:${String(
            updatedAttempt.durationSeconds! % 60
          ).padStart(2, "0")}`,
          score: updatedAttempt.score,
          aiAnalysisStatus: aiAnalysisSuccessful ? "success" : "failed",
          feedbackGenerated: aiAnalysisSuccessful,
          markingSummary: aiFeedback?.markingStructure
            ? {
                totalDomains: aiFeedback.markingStructure.length,
                totalCriteria: aiFeedback.overallResult?.totalCriteria,
                criteriaMet: aiFeedback.overallResult?.criteriaMet,
                criteriaNotMet: aiFeedback.overallResult?.criteriaNotMet,
                classification: aiFeedback.overallResult?.classificationLabel,
              }
            : null,
        });
      } catch (error) {
        request.log.error({ err: error }, 'Error regenerating feedback');

        if (error instanceof Error) {
          if (error.message === "Simulation attempt not found") {
            reply.status(404).send({ error: "Simulation attempt not found" });
          } else if (error.message.includes("No transcript available")) {
            reply.status(400).send({
              error: "No transcript available",
              details: "Cannot generate feedback without a transcript",
            });
          } else {
            reply.status(400).send({
              error: "Failed to regenerate feedback",
              details: error.message,
            });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
        }
      }
    }
  );

  // POST /simulation-attempts/test-ai-feedback - Test AI feedback generation
  fastify.post(
    "/simulation-attempts/test-ai-feedback",
    async (request, reply) => {
      try {
        // Sample test data
        const testTranscript = {
          messages: [
            {
              timestamp: "00:00:05",
              speaker: "student" as const,
              message:
                "Hello, I'm Dr. Smith. Thank you for coming in today. What brings you to see me?",
            },
            {
              timestamp: "00:00:12",
              speaker: "ai_patient" as const,
              message:
                "Hello doctor. I've been having chest pain for the past few days and I'm quite worried about it.",
            },
            // ... rest of messages
          ],
          duration: 180,
          totalMessages: 9,
        };

        const testCaseInfo = {
          patientName: "Sarah Johnson",
          diagnosis: "Pleuritic chest pain - possible pulmonary embolism",
          caseTitle: "Young adult with acute chest pain post-travel",
          patientAge: 28,
          patientGender: "Female",
        };

        // Sample case tabs
        const testCaseTabs = {
          doctorsNote: [
            "Patient presents with acute chest pain",
            "Recent long-haul flight history",
            "Consider PE in differential",
          ],
          patientScript: [
            "I have sharp chest pain that started 3 days ago",
            "The pain gets worse when I breathe deeply",
            "I flew from Europe last week",
          ],
          medicalNotes: [
            "Risk factors: Recent travel, OCP use",
            "Wells criteria assessment indicated",
            "Consider D-dimer and CTPA if indicated",
          ],
        };

        // Sample marking domains with criteria
        const testMarkingDomainsWithCriteria = [
          {
            domainId: "domain-1",
            domainName: "Communication Skills",
            criteria: [
              {
                id: "crit-1",
                text: "Introduces self appropriately",
                points: 5,
                displayOrder: 1,
              },
              {
                id: "crit-2",
                text: "Uses open-ended questions",
                points: 5,
                displayOrder: 2,
              },
            ],
          },
          {
            domainId: "domain-2",
            domainName: "Clinical History Taking",
            criteria: [
              {
                id: "crit-3",
                text: "Asks about recent travel history",
                points: 10,
                displayOrder: 1,
              },
              {
                id: "crit-4",
                text: "Explores pain characteristics",
                points: 8,
                displayOrder: 2,
              },
            ],
          },
        ];

        // Call with correct parameter order
        const result = await aiFeedbackService(request.log).generateFeedback(
          testTranscript,
          testCaseInfo,
          testCaseTabs, // CaseTabs object (3rd parameter)
          180, // duration in seconds (4th parameter)
          testMarkingDomainsWithCriteria // marking domains (5th parameter)
        );

        reply.send({
          message: "Enhanced AI feedback generated successfully",
          result: result,
          testData: {
            transcript: testTranscript,
            caseInfo: testCaseInfo,
            caseTabs: testCaseTabs,
            markingDomainsWithCriteria: testMarkingDomainsWithCriteria,
            enhancedFeatures: {
              domainsUsed: testMarkingDomainsWithCriteria.length,
              totalPossiblePoints: testMarkingDomainsWithCriteria.reduce(
                (sum, domain) =>
                  sum + domain.criteria.reduce((cSum, c) => cSum + c.points, 0),
                0
              ),
              structureImprovement:
                "Now using structured marking criteria grouped by domain",
            },
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Error testing enhanced AI feedback');
        reply.status(500).send({
          error: "Failed to generate test AI feedback",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // PATCH /simulation-attempts/:id/cancel - Cancel and force close connection
  fastify.patch("/simulation-attempts/:id/cancel", async (request, reply) => {
    try {
      const { id } = simulationAttemptParamsSchema.parse(request.params);

      // This will close the WebSocket connection and mark as incomplete
      await simulationAttemptService.cancel(id);

      reply.send({
        message: "Simulation attempt cancelled and connection closed",
        attemptId: id,
        connectionClosed: true,
        status: "cancelled",
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Simulation attempt not found") {
          reply.status(404).send({ error: "Simulation attempt not found" });
        } else if (
          error.message === "Cannot cancel a completed simulation attempt"
        ) {
          reply
            .status(400)
            .send({ error: "Cannot cancel a completed simulation attempt" });
        } else {
          request.log.error({ err: error }, 'Error cancelling simulation attempt');
          reply
            .status(400)
            .send({
              error: "Failed to cancel simulation attempt",
              details: error.message,
            });
        }
      } else {
        replyInternalError(request, reply, error, "Failed to cancel simulation attempt");
      }
    }
  });
}
