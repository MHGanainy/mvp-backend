// src/server.ts
import 'dotenv/config';
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import { randomUUID } from "crypto";
import "./shared/types";
import { optionalAuth } from "./middleware/auth.middleware";
import { JWTPayload } from "./entities/auth/auth.schema";

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
import { seedAdminUser } from "./services/seed-admin";
import { CleanupService } from "./services/cleanup.service";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    })
  }
});
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

// REQUEST ID HOOK - Generate/propagate request ID for logging correlation
fastify.addHook("onRequest", async (request) => {
  const headerRequestId = request.headers['x-request-id'];
  request.requestId = (typeof headerRequestId === 'string' ? headerRequestId : headerRequestId?.[0]) || randomUUID();
});

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

// USER CONTEXT LOGGING HOOK - Add user info to logger after auth
fastify.addHook("preHandler", async (request) => {
  const user = request.user as JWTPayload | undefined;
  const context = {
    requestId: request.requestId,
    ...(user && {
      userId: user.userId,
      userEmail: user.email,
      userRole: user.role
    })
  };
  request.log = request.log.child({ context });
});

// REQUEST/RESPONSE LOGGING HOOK - Log every request with its result
fastify.addHook("onResponse", async (request, reply) => {
  const responseTime = reply.elapsedTime;
  const user = request.user as JWTPayload | undefined;

  const context = {
    requestId: request.requestId,
    ...(user && {
      userId: user.userId,
      userEmail: user.email,
      userRole: user.role
    })
  };

  const logData = {
    context,
    method: request.method,
    path: request.url,
    statusCode: reply.statusCode,
    responseTime: Math.round(responseTime)
  };

  if (reply.statusCode >= 500) {
    request.log.error(logData, 'Request failed');
  } else if (reply.statusCode >= 400) {
    request.log.warn(logData, 'Request error');
  } else {
    request.log.info(logData, 'Request completed');
  }
});

// GLOBAL ERROR HANDLER - Structured error logging
fastify.setErrorHandler((error, request, reply) => {
  const user = request.user as JWTPayload | undefined;
  const context = {
    requestId: request.requestId,
    ...(user && {
      userId: user.userId,
      userEmail: user.email,
      userRole: user.role
    })
  };

  request.log.error({
    context,
    err: error,
    method: request.method,
    path: request.url
  }, 'Unhandled error');

  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal server error'
  });
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

    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    fastify.log.info({ host, port }, 'Server running');
    fastify.log.info('JWT authentication enabled with global auth hook');
    fastify.log.info('Admin users automatically identified on all routes');
    fastify.log.info('CORS enabled for ALL origins');

    // Start cleanup service for pending registrations
    const cleanupService = new CleanupService(prisma, fastify.log);

    // Run initial cleanup
    fastify.log.info('Running initial cleanup');
    await cleanupService.cleanupExpiredOTPs();

    // Run cleanup every 6 hours
    setInterval(async () => {
      fastify.log.info('Running scheduled cleanup');
      try {
        await cleanupService.cleanupExpiredOTPs();
        await cleanupService.cleanupExpiredPendingRegistrations();
      } catch (error) {
        fastify.log.error({ err: error }, 'Cleanup failed');
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    fastify.log.info('Cleanup service started (runs every 6 hours)');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
