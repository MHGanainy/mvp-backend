import Fastify, { FastifyBaseLogger } from 'fastify';
import { PrismaClient } from '@prisma/client';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import './shared/types';
import { optionalAuth } from './middleware/auth.middleware';
import { registerRequestLogging } from './middleware/request-logger.middleware';

import authRoutes from './entities/auth/auth.routes';
import subscriptionRoutes from './entities/subscription/subscription.routes';
import specialtyRoutes from './entities/specialty/specialty.routes';
import curriculumRoutes from './entities/curriculum/curriculum.routes';
import markingDomainRoutes from './entities/marking-domain/marking-domain.routes';
import instructorRoutes from './entities/instructor/instructor.routes';
import studentRoutes from './entities/student/student.routes';
import examRoutes from './entities/exam/exam.routes';
import interviewRoutes from './entities/interview/interview.routes';
import interviewCourseRoutes from './entities/interview-course/interview-course.routes';
import courseRoutes from './entities/course/course.routes';
import courseCaseRoutes from './entities/course-case/course-case.routes';
import mockExamConfigRoutes from './entities/mock-exam-config/mock-exam-config.routes';
import mockExamAttemptRoutes from './entities/mock-exam-attempt/mock-exam-attempt.routes';
import interviewCaseRoutes from './entities/interview-case/interview-case.routes';
import caseTabRoutes from './entities/case-tab/case-tab.routes';
import interviewCaseTabRoutes from './entities/interview-case-tab/interview-case-tab.routes';
import simulationRoutes from './entities/simulation/simulation.routes';
import simulationAttemptRoutes from './entities/simulation-attempt/simulation-attempt.routes';
import interviewSimulationAttemptRoutes from './entities/interview-simulation-attempt/interview-simulation-attempt.routes';
import paymentRoutes from './entities/payment/payment.routes';
import markingCriterionRoutes from './entities/marking-criterion/marking-criterion.routes';
import billingRoutes from './entities/billing/billing.routes';
import creditPackageRoutes from './entities/credit-package/credit-package.routes';
import webhookRoutes from './entities/webhook/webhook.routes';
import courseSectionRoutes from './entities/course-section/course-section.routes';
import courseSubsectionRoutes from './entities/course-subsection/course-subsection.routes';
import courseEnrollmentRoutes from './entities/course-enrollment/course-enrollment.routes';
import subsectionProgressRoutes from './entities/subsection-progress/subsection-progress.routes';
import studentCasePracticeRoutes from './entities/student-case-practice/student-case-practice.routes';
import studentInterviewPracticeRoutes from './entities/student-interview-practice/student-interview-practice.routes';
import interviewCourseSectionRoutes from './entities/interview-course-section/interview-course-section.routes';
import interviewCourseSubsectionRoutes from './entities/interview-course-subsection/interview-course-subsection.routes';
import interviewCourseEnrollmentRoutes from './entities/interview-course-enrollment/interview-course-enrollment.routes';
import interviewSubsectionProgressRoutes from './entities/interview-subsection-progress/interview-subsection-progress.routes';
import affiliateRoutes from './entities/affiliate/affiliate.routes';
import permissionGrantRoutes from './entities/permission-grant/permission-grant.routes';
import pricingPlanRoutes from './entities/pricing-plan/pricing-plan.routes';
import promoCodeRoutes from './entities/promo-code/promo-code.routes';
import blogArticleRoutes from './entities/blog-article/blog-article.routes';
import blogCategoryRoutes from './entities/blog-category/blog-category.routes';
import tagRoutes from './entities/tag/tag.routes';
import blogUploadRoutes from './entities/blog-upload/blog-upload.routes';
import voiceSessionRoutes from './entities/voice-session/voice-session.routes';
import adminFinanceRoutes from './entities/admin-finance/admin-finance.routes';

export interface BuildAppOptions {
  prisma: PrismaClient;
  jwtSecret: string;
  logger?: false | FastifyBaseLogger | object;
  enableRateLimiting?: boolean;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function defaultLogger() {
  if (NODE_ENV !== 'production') {
    return {
      level: LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    };
  }
  return { level: LOG_LEVEL };
}

export async function buildApp(opts: BuildAppOptions) {
  const { prisma, jwtSecret, enableRateLimiting = true } = opts;
  const logger = opts.logger === undefined ? defaultLogger() : opts.logger;

  const app = Fastify({ logger: logger as never });

  app.decorate('prisma', prisma);

  app.register(fastifyJwt, { secret: jwtSecret, sign: { expiresIn: '1h' } });

  app.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.register(helmet, { contentSecurityPolicy: false });

  if (enableRateLimiting) {
    app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  }

  app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  // Register request logging middleware (must be after JWT plugin)
  registerRequestLogging(app);

  // Add raw body support for Stripe webhook signature verification
  // MUST be added before any routes are registered
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    async (req: { url?: string }, body: Buffer) => {
      if (req.url?.includes('/webhooks/stripe') || req.url?.includes('/webhooks/livekit')) {
        (req as { rawBody?: string }).rawBody = body.toString('utf-8');
      }
      const str = body.toString('utf-8');
      if (!str) {
        return null;
      }
      return JSON.parse(str);
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url === '/health' ||
      request.url === '/favicon.ico' ||
      request.url?.includes('/webhooks/')
    ) {
      return;
    }
    await optionalAuth(request, reply);
  });

  app.get('/health', async () => ({ status: 'OK', timestamp: new Date().toISOString() }));
  app.get('/api/health', async () => ({ status: 'OK', timestamp: new Date().toISOString() }));

  app.get('/users', async (request) => {
    if (!request.isAdmin) {
      throw new Error('Admin access required');
    }
    return prisma.user.findMany({ include: { instructor: true, student: true } });
  });

  app.post('/users', async (request, reply) => {
    if (!request.isAdmin) {
      reply.status(403).send({ error: 'Admin access required' });
      return;
    }
    const { email, name } = request.body as { email: string; name?: string };
    return prisma.user.create({ data: { email, name } });
  });

  app.get('/users/:id', async (request, reply) => {
    if (!request.isAdmin) {
      reply.status(403).send({ error: 'Admin access required' });
      return;
    }
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { instructor: true, student: true },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  });

  await app.register(webhookRoutes, { prefix: '/api/webhooks' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(subscriptionRoutes, { prefix: '/api' });
  await app.register(specialtyRoutes, { prefix: '/api' });
  await app.register(curriculumRoutes, { prefix: '/api' });
  await app.register(markingDomainRoutes, { prefix: '/api' });
  await app.register(instructorRoutes, { prefix: '/api' });
  await app.register(studentRoutes, { prefix: '/api' });
  await app.register(examRoutes, { prefix: '/api' });
  await app.register(interviewRoutes, { prefix: '/api' });
  await app.register(interviewCourseRoutes, { prefix: '/api' });
  await app.register(courseRoutes, { prefix: '/api' });
  await app.register(courseSectionRoutes, { prefix: '/api' });
  await app.register(courseSubsectionRoutes, { prefix: '/api' });
  await app.register(courseEnrollmentRoutes, { prefix: '/api' });
  await app.register(subsectionProgressRoutes, { prefix: '/api' });
  await app.register(courseCaseRoutes, { prefix: '/api' });
  await app.register(mockExamConfigRoutes, { prefix: '/api' });
  await app.register(mockExamAttemptRoutes, { prefix: '/api' });
  await app.register(interviewCaseRoutes, { prefix: '/api' });
  await app.register(caseTabRoutes, { prefix: '/api' });
  await app.register(interviewCaseTabRoutes, { prefix: '/api' });
  await app.register(simulationRoutes, { prefix: '/api' });
  await app.register(simulationAttemptRoutes, { prefix: '/api' });
  await app.register(interviewSimulationAttemptRoutes, { prefix: '/api' });
  await app.register(paymentRoutes, { prefix: '/api' });
  await app.register(pricingPlanRoutes, { prefix: '/api' });
  await app.register(promoCodeRoutes, { prefix: '/api' });
  await app.register(markingCriterionRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(creditPackageRoutes, { prefix: '/api/credit-packages' });
  await app.register(studentCasePracticeRoutes, { prefix: '/api' });
  await app.register(studentInterviewPracticeRoutes, { prefix: '/api' });
  await app.register(interviewCourseSectionRoutes, { prefix: '/api' });
  await app.register(interviewCourseSubsectionRoutes, { prefix: '/api' });
  await app.register(interviewCourseEnrollmentRoutes, { prefix: '/api' });
  await app.register(interviewSubsectionProgressRoutes, { prefix: '/api' });
  await app.register(affiliateRoutes, { prefix: '/api' });
  await app.register(permissionGrantRoutes, { prefix: '/api' });
  await app.register(voiceSessionRoutes, { prefix: '/api' });
  await app.register(blogArticleRoutes, { prefix: '/api' });
  await app.register(blogCategoryRoutes, { prefix: '/api' });
  await app.register(tagRoutes, { prefix: '/api' });
  await app.register(blogUploadRoutes, { prefix: '/api' });
  await app.register(adminFinanceRoutes, { prefix: '/api' });

  return app;
}
