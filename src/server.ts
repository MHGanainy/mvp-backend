// src/server.ts
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import "./shared/types";
import { optionalAuth } from "./middleware/auth.middleware";
import { registerRequestLogging } from "./middleware/request-logger.middleware";
import { appLogger, flushLogs } from "./lib/logger";

// Add all imports
import authRoutes from "./entities/auth/auth.routes";
import subscriptionRoutes from "./entities/subscription/subscription.routes";
import specialtyRoutes from "./entities/specialty/specialty.routes";
import curriculumRoutes from "./entities/curriculum/curriculum.routes";
import markingDomainRoutes from "./entities/marking-domain/marking-domain.routes";
import instructorRoutes from "./entities/instructor/instructor.routes";
import studentRoutes from "./entities/student/student.routes";
import examRoutes from "./entities/exam/exam.routes";
import interviewRoutes from "./entities/interview/interview.routes";
import interviewCourseRoutes from "./entities/interview-course/interview-course.routes";
import courseRoutes from "./entities/course/course.routes";
import courseCaseRoutes from "./entities/course-case/course-case.routes";
import interviewCaseRoutes from "./entities/interview-case/interview-case.routes";
import caseTabRoutes from "./entities/case-tab/case-tab.routes";
import interviewCaseTabRoutes from "./entities/interview-case-tab/interview-case-tab.routes";
import simulationRoutes from "./entities/simulation/simulation.routes";
import simulationAttemptRoutes from "./entities/simulation-attempt/simulation-attempt.routes";
import interviewSimulationAttemptRoutes from "./entities/interview-simulation-attempt/interview-simulation-attempt.routes";
import paymentRoutes from "./entities/payment/payment.routes";
import markingCriterionRoutes from "./entities/marking-criterion/marking-criterion.routes";
import billingRoutes from "./entities/billing/billing.routes";
import creditPackageRoutes from "./entities/credit-package/credit-package.routes";
import webhookRoutes from "./entities/webhook/webhook.routes";
import courseSectionRoutes from "./entities/course-section/course-section.routes";
import courseSubsectionRoutes from "./entities/course-subsection/course-subsection.routes";
import courseEnrollmentRoutes from "./entities/course-enrollment/course-enrollment.routes";
import subsectionProgressRoutes from "./entities/subsection-progress/subsection-progress.routes";
import studentCasePracticeRoutes from "./entities/student-case-practice/student-case-practice.routes";
import studentInterviewPracticeRoutes from "./entities/student-interview-practice/student-interview-practice.routes";
import interviewCourseSectionRoutes from "./entities/interview-course-section/interview-course-section.routes";
import interviewCourseSubsectionRoutes from "./entities/interview-course-subsection/interview-course-subsection.routes";
import interviewCourseEnrollmentRoutes from "./entities/interview-course-enrollment/interview-course-enrollment.routes";
import interviewSubsectionProgressRoutes from "./entities/interview-subsection-progress/interview-subsection-progress.routes";
import affiliateRoutes from "./entities/affiliate/affiliate.routes";
import { seedAdminUser } from "./services/seed-admin";
import { CleanupService } from "./services/cleanup.service";

const fastify = Fastify({ logger: false });
const prisma = new PrismaClient();

// Register prisma on fastify instance
fastify.decorate("prisma", prisma);

// Register JWT plugin
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-this-in-production";
fastify.register(fastifyJwt, {
  secret: JWT_SECRET,
  sign: {
    expiresIn: "1h",
  },
});

// Register CORS plugin - Allow ALL origins
fastify.register(fastifyCors, {
  origin: true, // This allows ALL origins
  credentials: true, // Allow cookies/credentials
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // Allowed methods
});

// Register request logging middleware (must be after JWT plugin)
registerRequestLogging(fastify);

// Add raw body support for Stripe webhook signature verification
// MUST be added before any routes are registered
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  async (req: any, body: Buffer) => {
    // Store raw body for webhook signature verification
    if (req.url?.includes('/webhooks/stripe')) {
      req.rawBody = body.toString('utf-8');
    }
    return JSON.parse(body.toString('utf-8'));
  }
);

// GLOBAL AUTHENTICATION HOOK - Runs on EVERY request
// This attempts to authenticate but doesn't block if no token
// Ensures admin users are always identified
fastify.addHook("onRequest", async (request, reply) => {
  // Skip for health check, webhooks, and other system endpoints
  if (
    request.url === "/health" ||
    request.url === "/favicon.ico" ||
    request.url?.includes("/webhooks/")
  ) {
    return;
  }

  // Attempt to authenticate on every request
  await optionalAuth(request, reply);
});

// Health check
fastify.get("/health", async () => {
  return { status: "OK", timestamp: new Date().toISOString() };
});

// Health check with
fastify.get("/api/health", async () => {
  return { status: "OK", timestamp: new Date().toISOString() };
});

// Clean User routes
fastify.get("/users", async (request) => {
  // Admin check will work because of global hook
  if (!request.isAdmin) {
    throw new Error("Admin access required");
  }

  const users = await prisma.user.findMany({
    include: {
      instructor: true,
      student: true,
    },
  });
  return users;
});

fastify.post("/users", async (request, reply) => {
  // Admin check will work because of global hook
  if (!request.isAdmin) {
    reply.status(403).send({ error: "Admin access required" });
    return;
  }

  const { email, name } = request.body as { email: string; name?: string };

  const user = await prisma.user.create({
    data: { email, name },
  });
  return user;
});

fastify.get("/users/:id", async (request, reply) => {
  // Admin check will work because of global hook
  if (!request.isAdmin) {
    reply.status(403).send({ error: "Admin access required" });
    return;
  }

  const { id } = request.params as { id: string };

  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    include: {
      instructor: true,
      student: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
});

// Start server
const start = async () => {
  try {
    // Register webhook routes FIRST (needs raw body, no auth)
    await fastify.register(webhookRoutes, { prefix: "/api/webhooks" });

    // Register auth routes
    await fastify.register(authRoutes, { prefix: "/api" });

    // Register subscription routes (also at root level for easier access)
    await fastify.register(subscriptionRoutes, { prefix: "/api" });

    // Register all other route sets
    await fastify.register(specialtyRoutes, { prefix: "/api" });
    await fastify.register(curriculumRoutes, { prefix: "/api" });
    await fastify.register(markingDomainRoutes, { prefix: "/api" });
    await fastify.register(instructorRoutes, { prefix: "/api" });
    await fastify.register(studentRoutes, { prefix: "/api" });
    await fastify.register(examRoutes, { prefix: "/api" });
    await fastify.register(interviewRoutes, { prefix: "/api" });
    await fastify.register(interviewCourseRoutes, { prefix: "/api" });
    await fastify.register(courseRoutes, { prefix: "/api" });
    await fastify.register(courseSectionRoutes, { prefix: "/api" });
    await fastify.register(courseSubsectionRoutes, { prefix: "/api" });
    await fastify.register(courseEnrollmentRoutes, { prefix: "/api" });
    await fastify.register(subsectionProgressRoutes, { prefix: "/api" });
    await fastify.register(courseCaseRoutes, { prefix: "/api" });
    await fastify.register(interviewCaseRoutes, { prefix: "/api" });
    await fastify.register(caseTabRoutes, { prefix: "/api" });
    await fastify.register(interviewCaseTabRoutes, { prefix: "/api" });
    await fastify.register(simulationRoutes, { prefix: "/api" });
    await fastify.register(simulationAttemptRoutes, { prefix: "/api" });
    await fastify.register(interviewSimulationAttemptRoutes, { prefix: "/api" });
    await fastify.register(paymentRoutes, { prefix: "/api" });
    await fastify.register(markingCriterionRoutes, { prefix: "/api" });
    await fastify.register(billingRoutes, { prefix: "/api" });
    await fastify.register(creditPackageRoutes, { prefix: "/api/credit-packages" });
    await fastify.register(studentCasePracticeRoutes, { prefix: "/api" });
    await fastify.register(studentInterviewPracticeRoutes, { prefix: "/api" });
    await fastify.register(interviewCourseSectionRoutes, { prefix: "/api" });
    await fastify.register(interviewCourseSubsectionRoutes, { prefix: "/api" });
    await fastify.register(interviewCourseEnrollmentRoutes, { prefix: "/api" });
    await fastify.register(interviewSubsectionProgressRoutes, { prefix: "/api" });
    await fastify.register(affiliateRoutes, { prefix: "/api" });

    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    appLogger.info(`Server running on ${host}:${port}`, { host, port });
    appLogger.info('JWT authentication enabled with global auth hook');
    appLogger.info('Admin users automatically identified on all routes');
    appLogger.info('CORS enabled for ALL origins');

    // Start cleanup service for pending registrations
    const cleanupService = new CleanupService(prisma);

    // Run initial cleanup
    appLogger.info('Running initial cleanup');
    await cleanupService.cleanupExpiredOTPs();

    // Run cleanup every 6 hours
    setInterval(async () => {
      appLogger.info('Running scheduled cleanup');
      try {
        await cleanupService.cleanupExpiredOTPs();
        await cleanupService.cleanupExpiredPendingRegistrations();
      } catch (error) {
        appLogger.error('Cleanup failed', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    appLogger.info('Cleanup service started (runs every 6 hours)');
  } catch (err) {
    appLogger.error('Server startup failed', err);
    process.exit(1);
  }
};

start();

// Graceful shutdown handlers - flush logs before exit
process.on('SIGTERM', async () => {
  appLogger.info('SIGTERM received, shutting down gracefully');
  await flushLogs();
  process.exit(0);
});

process.on('SIGINT', async () => {
  appLogger.info('SIGINT received, shutting down gracefully');
  await flushLogs();
  process.exit(0);
});
