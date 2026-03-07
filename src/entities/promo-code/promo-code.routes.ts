import { FastifyInstance } from 'fastify';
import { PromoCodeService } from './promo-code.service';
import {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  promoCodeIdParamsSchema,
  validatePromoCodeSchema,
  listPromoCodesQuerySchema,
} from './promo-code.schema';
import { requireAuth, getCurrentStudentId } from '../../middleware/auth.middleware';
import { replyInternalError } from '../../shared/route-error';
import { ZodError } from 'zod';

export default async function promoCodeRoutes(fastify: FastifyInstance) {
  const promoCodeService = new PromoCodeService(fastify.prisma);

  // POST /promo-codes — admin, create
  fastify.post(
    '/promo-codes',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const data = createPromoCodeSchema.parse(request.body);
        const promoCode = await promoCodeService.create({
          ...data,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        });
        return reply.status(201).send(promoCode);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        if (error.message === 'A promo code with this code already exists') {
          return reply.status(400).send({ error: error.message });
        }
        if (error.message?.includes('discount must be')) {
          return reply.status(400).send({ error: error.message });
        }
        return replyInternalError(request, reply, error, 'Failed to create promo code');
      }
    }
  );

  // GET /promo-codes — admin, list
  fastify.get(
    '/promo-codes',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const filters = listPromoCodesQuerySchema.parse(request.query);
        const promoCodes = await promoCodeService.findAll(filters);
        return reply.send(promoCodes);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return replyInternalError(request, reply, error, 'Failed to fetch promo codes');
      }
    }
  );

  // GET /promo-codes/:id — admin, get with stats
  fastify.get(
    '/promo-codes/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const { id } = promoCodeIdParamsSchema.parse(request.params);
        const promoCode = await promoCodeService.findById(id);
        return reply.send(promoCode);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        if (error.message === 'Promo code not found') {
          return reply.status(404).send({ error: error.message });
        }
        return replyInternalError(request, reply, error, 'Failed to fetch promo code');
      }
    }
  );

  // PATCH /promo-codes/:id — admin, update
  fastify.patch(
    '/promo-codes/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const { id } = promoCodeIdParamsSchema.parse(request.params);
        const data = updatePromoCodeSchema.parse(request.body);
        const updated = await promoCodeService.update(id, {
          ...data,
          expiresAt: data.expiresAt === null ? null : data.expiresAt ? new Date(data.expiresAt) : undefined,
        });
        return reply.send(updated);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        if (error.message === 'Promo code not found') {
          return reply.status(404).send({ error: error.message });
        }
        return replyInternalError(request, reply, error, 'Failed to update promo code');
      }
    }
  );

  // DELETE /promo-codes/:id — admin, deactivate
  fastify.delete(
    '/promo-codes/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      try {
        if (!request.user?.isAdmin) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        const { id } = promoCodeIdParamsSchema.parse(request.params);
        const deactivated = await promoCodeService.deactivate(id);
        return reply.send({ message: 'Promo code deactivated successfully', promoCode: deactivated });
      } catch (error: any) {
        if (error.message === 'Promo code not found') {
          return reply.status(404).send({ error: error.message });
        }
        return replyInternalError(request, reply, error, 'Failed to deactivate promo code');
      }
    }
  );

  // POST /promo-codes/validate — student, validate code for a plan
  fastify.post(
    '/promo-codes/validate',
    { preHandler: [requireAuth('student')] },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request);
        if (!studentId) {
          return reply.status(401).send({ error: 'Student ID not found' });
        }
        const { code, pricingPlanId } = validatePromoCodeSchema.parse(request.body);
        const result = await promoCodeService.validate(code, pricingPlanId, studentId);
        return reply.send(result);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return replyInternalError(request, reply, error, 'Failed to validate promo code');
      }
    }
  );
}
