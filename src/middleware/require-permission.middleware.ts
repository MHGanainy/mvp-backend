import { FastifyReply, FastifyRequest } from 'fastify'
import { authenticate, getCurrentUserId } from './auth.middleware'
import { Permission, ResourceTarget, userHasAnyPermission } from '../shared/permissions'

export function requirePermission(
  permissions: Permission | Permission[],
  resolveTarget: (request: FastifyRequest) => ResourceTarget | Promise<ResourceTarget>,
) {
  const list: Permission[] = Array.isArray(permissions) ? permissions : [permissions]

  return async function (request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply)
    if (reply.sent) {
      return
    }

    const userId = getCurrentUserId(request)
    if (userId === null) {
      reply.status(401).send({ error: 'Unauthorized' })
      return
    }

    const target = await resolveTarget(request)
    const allowed = await userHasAnyPermission(request.server.prisma, {
      userId,
      isAdmin: request.isAdmin === true,
      permissions: list,
      target,
    })

    if (!allowed) {
      reply.status(403).send({ error: 'Forbidden' })
      return
    }
  }
}
