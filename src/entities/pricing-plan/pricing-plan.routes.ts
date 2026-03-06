import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ResourceType } from '@prisma/client';
import { PricingPlanService } from './pricing-plan.service';
import {
  createPricingPlanSchema,
  updatePricingPlanSchema,
  planIdParamsSchema,
  resourceParamsSchema,
  listPlansQuerySchema,
} from './pricing-plan.schema';
import { authenticate, isAdmin, getCurrentInstructorId } from '../../middleware/auth.middleware';
import { replyInternalError } from '../../shared/route-error';

export default async function pricingPlanRoutes(fastify: FastifyInstance) {
  const planService = new PricingPlanService(fastify.prisma);

  // GET /pricing-plans/resource/:resourceType/:resourceId - Public: get active plans for a resource
  fastify.get('/pricing-plans/resource/:resourceType/:resourceId', async (request, reply) => {
    try {
      const { resourceType, resourceId } = resourceParamsSchema.parse(request.params);
      const plans = await planService.findByResource(resourceType as ResourceType, resourceId);
      reply.send(plans);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid parameters', details: error.errors });
      } else if (error.message?.includes('not found')) {
        reply.status(404).send({ error: error.message });
      } else if (error.message?.includes('not currently available')) {
        reply.status(403).send({ error: error.message });
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch pricing plans');
      }
    }
  });

  // GET /pricing-plans - Admin: list all plans with optional filters
  fastify.get('/pricing-plans', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' });
        return;
      }

      const filters = listPlansQuerySchema.parse(request.query);
      const plans = await planService.findAll({
        resourceType: filters.resourceType as ResourceType | undefined,
        isActive: filters.isActive,
      });
      reply.send(plans);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch pricing plans');
      }
    }
  });

  // GET /pricing-plans/:planId - Public: get a single plan
  fastify.get('/pricing-plans/:planId', async (request, reply) => {
    try {
      const { planId } = planIdParamsSchema.parse(request.params);
      const plan = await planService.findById(planId);
      reply.send(plan);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid parameters', details: error.errors });
      } else if (error.message === 'Pricing plan not found') {
        reply.status(404).send({ error: error.message });
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch pricing plan');
      }
    }
  });

  // POST /pricing-plans - Instructor/Admin: create a plan
  fastify.post('/pricing-plans', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const data = createPricingPlanSchema.parse(request.body);

      // Ownership check: instructor must own the resource, admin bypasses
      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request);
        const resourceInstructorId = await planService.getResourceInstructorId(
          data.resourceType as ResourceType,
          data.resourceId
        );

        if (!currentInstructorId || resourceInstructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create pricing plans for your own resources' });
          return;
        }
      }

      const plan = await planService.create(data);
      reply.status(201).send(plan);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Validation error', details: error.errors });
      } else if (error.message === 'Course not found' || error.message === 'Interview course not found') {
        reply.status(404).send({ error: error.message });
      } else if (error.message.includes('Maximum') && error.message.includes('active plans')) {
        reply.status(400).send({ error: error.message });
      } else if (error.message === 'Unsupported resource type') {
        reply.status(400).send({ error: error.message });
      } else {
        replyInternalError(request, reply, error, 'Failed to create pricing plan');
      }
    }
  });

  // PUT /pricing-plans/:planId - Instructor/Admin: update a plan
  fastify.put('/pricing-plans/:planId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const { planId } = planIdParamsSchema.parse(request.params);
      const data = updatePricingPlanSchema.parse(request.body);

      // Ownership check
      if (!isAdmin(request)) {
        const plan = await planService.findById(planId);
        const currentInstructorId = getCurrentInstructorId(request);
        const resourceInstructorId = await planService.getResourceInstructorId(
          plan.resourceType,
          plan.resourceId
        );

        if (!currentInstructorId || resourceInstructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit pricing plans for your own resources' });
          return;
        }
      }

      const updated = await planService.update(planId, data);
      reply.send(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Validation error', details: error.errors });
      } else if (error.message === 'Pricing plan not found') {
        reply.status(404).send({ error: error.message });
      } else {
        replyInternalError(request, reply, error, 'Failed to update pricing plan');
      }
    }
  });

  // DELETE /pricing-plans/:planId - Instructor/Admin: deactivate a plan
  fastify.delete('/pricing-plans/:planId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const { planId } = planIdParamsSchema.parse(request.params);

      // Ownership check
      if (!isAdmin(request)) {
        const plan = await planService.findById(planId);
        const currentInstructorId = getCurrentInstructorId(request);
        const resourceInstructorId = await planService.getResourceInstructorId(
          plan.resourceType,
          plan.resourceId
        );

        if (!currentInstructorId || resourceInstructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only deactivate pricing plans for your own resources' });
          return;
        }
      }

      const deactivated = await planService.deactivate(planId);
      reply.send({ message: 'Pricing plan deactivated successfully', plan: deactivated });
    } catch (error: any) {
      if (error.message === 'Pricing plan not found') {
        reply.status(404).send({ error: error.message });
      } else {
        replyInternalError(request, reply, error, 'Failed to deactivate pricing plan');
      }
    }
  });
}
