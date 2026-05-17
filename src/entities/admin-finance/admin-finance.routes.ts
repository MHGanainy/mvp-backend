import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdminFinanceService } from './admin-finance.service';
import { requireAuth } from '../../middleware/auth.middleware';
import { replyInternalError } from '../../shared/route-error';

const MAX_RANGE_DAYS = 366;

// Dates must be valid ISO strings (YYYY-MM-DD or full ISO-8601).
const dateRangeSchema = z.object({
  startDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'startDate must be a valid date' })
    .optional(),
  endDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'endDate must be a valid date' })
    .optional(),
});

const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  paymentType: z.enum(['SUBSCRIPTION', 'CREDITS']).optional(),
});

function getDefaultDateRange(query: { startDate?: string; endDate?: string }) {
  const now = new Date();
  const endDate = query.endDate ? new Date(query.endDate) : now;
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);

  if (startDate > endDate) {
    throw new Error('startDate must not be after endDate');
  }

  const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range must not exceed ${MAX_RANGE_DAYS} days`);
  }

  return { startDate, endDate };
}

function parseDateRange(query: { startDate?: string; endDate?: string }, reply: FastifyReply) {
  try {
    return getDefaultDateRange(query);
  } catch (e: any) {
    reply.status(400).send({ error: e.message });
    return null;
  }
}

export default async function adminFinanceRoutes(fastify: FastifyInstance) {
  const service = new AdminFinanceService(fastify.prisma);

  // GET /admin/finances/overview
  fastify.get(
    '/admin/finances/overview',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const query = dateRangeSchema.parse(request.query);
        const range = parseDateRange(query, reply);
        if (!range) return;
        const data = await service.getOverview(range.startDate, range.endDate);
        return reply.send(data);
      } catch (error: any) {
        return replyInternalError(request, reply, error, 'Failed to fetch finance overview');
      }
    }
  );

  // GET /admin/finances/exam-revenue
  fastify.get(
    '/admin/finances/exam-revenue',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const query = dateRangeSchema.parse(request.query);
        const range = parseDateRange(query, reply);
        if (!range) return;
        const data = await service.getExamRevenue(range.startDate, range.endDate);
        return reply.send(data);
      } catch (error: any) {
        return replyInternalError(request, reply, error, 'Failed to fetch exam revenue');
      }
    }
  );

  // GET /admin/finances/user-stats
  fastify.get(
    '/admin/finances/user-stats',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const data = await service.getUserStats();
        return reply.send(data);
      } catch (error: any) {
        return replyInternalError(request, reply, error, 'Failed to fetch user stats');
      }
    }
  );

  // GET /admin/finances/transactions
  fastify.get(
    '/admin/finances/transactions',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const { page, limit, paymentType } = transactionsQuerySchema.parse(request.query);
        const data = await service.getTransactions(page, limit, paymentType);
        return reply.send(data);
      } catch (error: any) {
        return replyInternalError(request, reply, error, 'Failed to fetch transactions');
      }
    }
  );
}
