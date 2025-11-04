// src/entities/credit-package/credit-package.routes.ts
import { FastifyInstance } from 'fastify';
import { CreditPackageService } from './credit-package.service';
import {
  createPackageSchema,
  updatePackageSchema,
  packageIdParamSchema,
} from './credit-package.schema';
import { authenticate, isAdmin } from '../../middleware/auth.middleware';

export default async function creditPackageRoutes(fastify: FastifyInstance) {
  const packageService = new CreditPackageService(fastify.prisma);

  // GET /credit-packages - List packages (active for public, all for admin)
  fastify.get('/', async (request, reply) => {
    try {
      // Check if user is admin (optionalAuth already ran globally)
      const userIsAdmin = isAdmin(request);

      const packages = await packageService.getAllPackages(userIsAdmin);
      reply.send(packages);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch credit packages' });
    }
  });

  // GET /credit-packages/:id - Get single package (public)
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = packageIdParamSchema.parse(request.params);
      const pkg = await packageService.getPackageById(id);
      reply.send(pkg);
    } catch (error: any) {
      fastify.log.error(error);
      if (error.message === 'Credit package not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to fetch credit package' });
      }
    }
  });

  // POST /credit-packages - Create package (admin only)
  fastify.post('/', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      // Check if user is admin
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' });
        return;
      }

      const data = createPackageSchema.parse(request.body);
      const pkg = await packageService.createPackage(data);
      reply.status(201).send(pkg);
    } catch (error: any) {
      fastify.log.error(error);
      if (error.message === 'A credit package with this name already exists') {
        reply.status(409).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to create credit package' });
      }
    }
  });

  // PATCH /credit-packages/:id - Update package (admin only)
  fastify.patch('/:id', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      // Check if user is admin
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' });
        return;
      }

      const { id } = packageIdParamSchema.parse(request.params);
      const data = updatePackageSchema.parse(request.body);
      const pkg = await packageService.updatePackage(id, data);
      reply.send(pkg);
    } catch (error: any) {
      fastify.log.error(error);
      if (error.message === 'Credit package not found') {
        reply.status(404).send({ error: error.message });
      } else if (error.message === 'A credit package with this name already exists') {
        reply.status(409).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to update credit package' });
      }
    }
  });

  // DELETE /credit-packages/:id - Deactivate package (admin only)
  fastify.delete('/:id', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      // Check if user is admin
      if (!isAdmin(request)) {
        reply.status(403).send({ error: 'Admin access required' });
        return;
      }

      const { id } = packageIdParamSchema.parse(request.params);
      const pkg = await packageService.deactivatePackage(id);
      reply.send({ message: 'Credit package deactivated successfully', package: pkg });
    } catch (error: any) {
      fastify.log.error(error);
      if (error.message === 'Credit package not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to deactivate credit package' });
      }
    }
  });
}
