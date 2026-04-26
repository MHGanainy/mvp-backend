import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate, getCurrentUserId, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'
import {
  createPermissionGrantSchema,
  listPermissionGrantsQuerySchema,
  permissionGrantParamsSchema,
} from './permission-grant.schema'
import { PermissionGrantService } from './permission-grant.service'

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  if (reply.sent) {
    return
  }
  if (!isAdmin(request)) {
    reply.status(403).send({ error: 'Forbidden' })
  }
}

export default async function permissionGrantRoutes(fastify: FastifyInstance) {
  const service = new PermissionGrantService(fastify.prisma)

  // POST /api/admin/grants
  fastify.post('/admin/grants', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const data = createPermissionGrantSchema.parse(request.body)
      const grantedById = getCurrentUserId(request)
      if (grantedById === null) {
        reply.status(401).send({ error: 'Unauthorized' })
        return
      }
      const grant = await service.create(data, grantedById)
      reply.status(201).send(grant)
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.errors })
      } else if (error instanceof Error) {
        if (error.message.endsWith(' not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create permission grant')
      }
    }
  })

  // DELETE /api/admin/grants/:id
  fastify.delete('/admin/grants/:id', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const { id } = permissionGrantParamsSchema.parse(request.params)
      await service.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Permission grant not found') {
        reply.status(404).send({ error: 'Permission grant not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /api/admin/grants?userId=...
  // GET /api/admin/grants?resourceType=exam&resourceId=...
  fastify.get('/admin/grants', { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const query = listPermissionGrantsQuerySchema.parse(request.query)
      let grants
      if (query.resourceType && query.resourceId) {
        grants = await service.listByResource(query.resourceType, query.resourceId)
      } else if (query.userId !== undefined) {
        grants = await service.listByUser(query.userId)
      } else {
        reply.status(400).send({ error: 'Provide either userId, or both resourceType and resourceId' })
        return
      }
      reply.send(grants)
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid query', details: error.errors })
      } else {
        replyInternalError(request, reply, error, 'Failed to list permission grants')
      }
    }
  })
}
