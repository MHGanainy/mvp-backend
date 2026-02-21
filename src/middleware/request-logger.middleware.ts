import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { JWTPayload } from '../entities/auth/auth.schema';

const SKIP_PATHS = new Set(['/health', '/api/health', '/favicon.ico', '/robots.txt']);

export function registerRequestLogging(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request) => {
    const headerId = request.headers['x-request-id'];
    request.requestId = (typeof headerId === 'string' ? headerId : headerId?.[0]) || randomUUID();
  });

  fastify.addHook('preHandler', async (request) => {
    if (SKIP_PATHS.has(request.url)) { return; }
    const user = request.user as JWTPayload | undefined;
    request.log = request.log.child({
      requestId: request.requestId,
      ip: request.ip,
      ...(user && { userId: user.userId, userEmail: user.email, userRole: user.role }),
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (SKIP_PATHS.has(request.url)) { return; }
    const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';
    request.log[level]({
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      responseTime: Math.round(reply.elapsedTime),
    }, 'Request completed');
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, method: request.method, path: request.url }, 'Unhandled error');
    reply.status(error.statusCode || 500).send({ error: error.message || 'Internal server error' });
  });
}
