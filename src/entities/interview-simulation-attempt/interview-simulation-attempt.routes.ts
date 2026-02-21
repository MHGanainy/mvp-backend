import { FastifyInstance } from "fastify";
import { InterviewSimulationAttemptService } from "./interview-simulation-attempt.service";
import { aiFeedbackService } from "../simulation-attempt/ai-feedback.service";
import {
  createInterviewSimulationAttemptSchema,
  completeInterviewSimulationAttemptSchema,
  updateInterviewSimulationAttemptSchema,
  interviewSimulationAttemptParamsSchema,
  interviewSimulationAttemptStudentParamsSchema,
  interviewSimulationAttemptInterviewSimulationParamsSchema,
  interviewSimulationAttemptQuerySchema,
  interviewSimulationAttemptStudentCaseParamsSchema,
} from "./interview-simulation-attempt.schema";

export default async function interviewSimulationAttemptRoutes(
  fastify: FastifyInstance
) {
  const interviewSimulationAttemptService = new InterviewSimulationAttemptService(
    fastify.prisma,
    fastify.log.child({ service: 'InterviewSimulationAttemptService' })
  );

  // GET /interview-simulation-attempts - Get all interview simulation attempts (with query filters)
  fastify.get("/interview-simulation-attempts", async (request, reply) => {
    try {
      const query = interviewSimulationAttemptQuerySchema.parse(request.query);
      const attempts = await interviewSimulationAttemptService.findAll(query);
      reply.send(attempts);
    } catch (error) {
      reply.status(500).send({ error: "Failed to fetch interview simulation attempts" });
    }
  });

  // GET /interview-simulation-attempts/student/:studentId - Get attempts by student
  fastify.get(
    "/interview-simulation-attempts/student/:studentId",
    async (request, reply) => {
      try {
        const { studentId } = interviewSimulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const query = interviewSimulationAttemptQuerySchema.parse(request.query);
        const attempts = await interviewSimulationAttemptService.findByStudent(
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
    "/interview-simulation-attempts/student/:studentId/case/:caseId",
    async (request, reply) => {
      try {
        const { studentId, caseId } =
          interviewSimulationAttemptStudentCaseParamsSchema.parse(request.params);
        const query = interviewSimulationAttemptQuerySchema.parse(request.query);
        const attempts = await interviewSimulationAttemptService.findByStudentAndCase(
          studentId,
          caseId,
          query
        );
        reply.send(attempts);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Student not found") {
            reply.status(404).send({ error: "Student not found" });
          } else if (error.message === "Interview case not found") {
            reply.status(404).send({ error: "Interview case not found" });
          } else if (error.message === "No interview simulation exists for this case") {
            reply
              .status(404)
              .send({ error: "No interview simulation exists for this case" });
          } else {
            reply.status(400).send({ error: "Invalid request" });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
        }
      }
    }
  );

  // GET /interview-simulation-attempts/interview-simulation/:interviewSimulationId - Get attempts by interview simulation
  fastify.get(
    "/interview-simulation-attempts/interview-simulation/:interviewSimulationId",
    async (request, reply) => {
      try {
        const { interviewSimulationId } = interviewSimulationAttemptInterviewSimulationParamsSchema.parse(
          request.params
        );
        const query = interviewSimulationAttemptQuerySchema.parse(request.query);
        const attempts = await interviewSimulationAttemptService.findByInterviewSimulation(
          interviewSimulationId,
          query
        );
        reply.send(attempts);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Interview simulation not found"
        ) {
          reply.status(404).send({ error: "Interview simulation not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /interview-simulation-attempts/student/:studentId/stats - Get student performance statistics
  fastify.get(
    "/interview-simulation-attempts/student/:studentId/stats",
    async (request, reply) => {
      try {
        const { studentId } = interviewSimulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const stats = await interviewSimulationAttemptService.getStudentStats(studentId);
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

  // GET /interview-simulation-attempts/student/:studentId/analytics - Get student comprehensive analytics
  fastify.get(
    "/interview-simulation-attempts/student/:studentId/analytics",
    async (request, reply) => {
      try {
        const { studentId } = interviewSimulationAttemptStudentParamsSchema.parse(
          request.params
        );
        const analytics = await interviewSimulationAttemptService.getStudentAnalytics(
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

  // GET /interview-simulation-attempts/interview-simulation/:interviewSimulationId/stats - Get interview simulation usage statistics
  fastify.get(
    "/interview-simulation-attempts/interview-simulation/:interviewSimulationId/stats",
    async (request, reply) => {
      try {
        const { interviewSimulationId } = interviewSimulationAttemptInterviewSimulationParamsSchema.parse(
          request.params
        );
        const stats = await interviewSimulationAttemptService.getInterviewSimulationStats(
          interviewSimulationId
        );
        reply.send(stats);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Interview simulation not found"
        ) {
          reply.status(404).send({ error: "Interview simulation not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /interview-simulation-attempts/:id - Get interview simulation attempt by ID
  fastify.get("/interview-simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);
      const attempt = await interviewSimulationAttemptService.findById(id);
      reply.send(attempt);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Interview simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Interview simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /interview-simulation-attempts/correlation/:token - Get attempt by correlation token
  fastify.get(
    "/interview-simulation-attempts/correlation/:token",
    async (request, reply) => {
      try {
        const { token } = request.params as { token: string };
        const attempt = await interviewSimulationAttemptService.findByCorrelationToken(
          token
        );
        reply.send(attempt);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Interview simulation attempt not found"
        ) {
          reply.status(404).send({ error: "Interview simulation attempt not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // POST /interview-simulation-attempts - Start new interview simulation attempt (NO upfront credit deduction)
  fastify.post("/interview-simulation-attempts", async (request, reply) => {
    try {
      const data = createInterviewSimulationAttemptSchema.parse(request.body);
      const attempt = await interviewSimulationAttemptService.create(data);
      // The attempt now includes voiceAssistantConfig from LiveKit service
      reply.status(201).send({
        message:
          "Interview simulation attempt started successfully. Credits will be charged per minute during conversation.",
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
        } else if (error.message === "Interview simulation not found") {
          reply.status(404).send({ error: "Interview simulation not found" });
        } else if (error.message.includes("Insufficient credits")) {
          reply.status(400).send({
            error: error.message,
            minimumRequired: 1,
          });
        } else {
          request.log.error({ err: error }, 'Validation error creating interview simulation attempt');
          reply.status(400).send({
            error: "Invalid data",
            details: error.message,
          });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // PATCH /interview-simulation-attempts/:id/complete - Complete interview simulation attempt (add feedback & score)
  fastify.patch("/interview-simulation-attempts/:id/complete", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);
      const data = completeInterviewSimulationAttemptSchema.parse(request.body);
      const attempt = await interviewSimulationAttemptService.complete(id, data);
      reply.send({
        message: "Interview simulation attempt completed successfully",
        attempt,
        duration: `${Math.floor(attempt.durationSeconds! / 60)}:${String(
          attempt.durationSeconds! % 60
        ).padStart(2, "0")}`,
        score: attempt.score,
        feedbackGenerated: !!attempt.aiFeedback,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Interview simulation attempt not found") {
          reply.status(404).send({ error: "Interview simulation attempt not found" });
        } else if (
          error.message === "Interview simulation attempt is already completed"
        ) {
          reply
            .status(400)
            .send({ error: "Interview simulation attempt is already completed" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // PUT /interview-simulation-attempts/:id - Update interview simulation attempt (admin only)
  fastify.put("/interview-simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);
      const data = updateInterviewSimulationAttemptSchema.parse(request.body);
      const attempt = await interviewSimulationAttemptService.update(id, data);
      reply.send({
        message: "Interview simulation attempt updated successfully",
        attempt,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Interview simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Interview simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // DELETE /interview-simulation-attempts/:id - Delete interview simulation attempt (refunds credits if incomplete)
  fastify.delete("/interview-simulation-attempts/:id", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);

      // Get attempt details before deletion for response
      const attempt = await interviewSimulationAttemptService.findById(id);
      const wasIncomplete = !attempt.isCompleted;
      const creditsToRefund = wasIncomplete ? attempt.interviewSimulation.creditCost : 0;

      await interviewSimulationAttemptService.delete(id);

      reply.send({
        message: "Interview simulation attempt deleted successfully",
        creditsRefunded: creditsToRefund,
        wasIncomplete,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Interview simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Interview simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /interview-simulation-attempts/:id/transcript - Get detailed transcript for an attempt
  fastify.get("/interview-simulation-attempts/:id/transcript", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);
      const attempt = await interviewSimulationAttemptService.findById(id);

      if (!attempt.transcript) {
        reply
          .status(404)
          .send({ error: "No transcript available for this attempt" });
        return;
      }

      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.interviewSimulation.interviewCase.title,
        startedAt: attempt.startedAt,
        endedAt: attempt.endedAt,
        isCompleted: attempt.isCompleted,
        transcript: attempt.transcript,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Interview simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Interview simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /interview-simulation-attempts/:id/feedback - Get detailed AI feedback for an attempt
  fastify.get("/interview-simulation-attempts/:id/feedback", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);
      const attempt = await interviewSimulationAttemptService.findById(id);

      if (!attempt.aiFeedback) {
        reply
          .status(404)
          .send({ error: "No AI feedback available for this attempt" });
        return;
      }

      reply.send({
        attemptId: attempt.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        caseTitle: attempt.interviewSimulation.interviewCase.title,
        score: attempt.score,
        isCompleted: attempt.isCompleted,
        feedback: attempt.aiFeedback,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Interview simulation attempt not found"
      ) {
        reply.status(404).send({ error: "Interview simulation attempt not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // PATCH /interview-simulation-attempts/:id/complete-with-transcript - Complete with automatic transcript fetch and AI feedback generation
  fastify.patch(
    "/interview-simulation-attempts/:id/complete-with-transcript",
    async (request, reply) => {
      try {
        const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);

        const existingAttempt = await interviewSimulationAttemptService.findById(id);

        if (!existingAttempt.correlationToken) {
          reply.status(400).send({
            error:
              "No correlation token found for this attempt. Cannot retrieve transcript.",
          });
          return;
        }

        const attempt = await interviewSimulationAttemptService.completeWithTranscript(
          id,
          existingAttempt.correlationToken
        );

        const aiFeedback = attempt.aiFeedback as any;
        const aiAnalysisSuccessful = aiFeedback?.analysisStatus !== "failed";

        reply.send({
          message: aiAnalysisSuccessful
            ? "Interview simulation completed successfully with AI-generated feedback"
            : "Interview simulation completed with transcript, but AI analysis failed",
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
        request.log.error({ err: error }, 'Error completing interview simulation with transcript');

        if (error instanceof Error) {
          if (error.message === "Interview simulation attempt not found") {
            reply.status(404).send({ error: "Interview simulation attempt not found" });
          } else if (
            error.message === "Interview simulation attempt is already completed"
          ) {
            reply
              .status(400)
              .send({ error: "Interview simulation attempt is already completed" });
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

  // POST /interview-simulation-attempts/test-ai-feedback - Test AI feedback generation
  fastify.post(
    "/interview-simulation-attempts/test-ai-feedback",
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

  // PATCH /interview-simulation-attempts/:id/cancel - Cancel and force close connection
  fastify.patch("/interview-simulation-attempts/:id/cancel", async (request, reply) => {
    try {
      const { id } = interviewSimulationAttemptParamsSchema.parse(request.params);

      // This will close the WebSocket connection and mark as incomplete
      await interviewSimulationAttemptService.cancel(id);

      reply.send({
        message: "Interview simulation attempt cancelled and connection closed",
        attemptId: id,
        connectionClosed: true,
        status: "cancelled",
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Interview simulation attempt not found") {
          reply.status(404).send({ error: "Interview simulation attempt not found" });
        } else if (
          error.message === "Cannot cancel a completed interview simulation attempt"
        ) {
          reply
            .status(400)
            .send({ error: "Cannot cancel a completed interview simulation attempt" });
        } else {
          request.log.error({ err: error }, 'Error cancelling interview simulation attempt');
          reply
            .status(400)
            .send({
              error: "Failed to cancel interview simulation attempt",
              details: error.message,
            });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });
}
