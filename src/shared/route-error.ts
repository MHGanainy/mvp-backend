import { FastifyRequest, FastifyReply } from 'fastify';

export function replyInternalError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  message: string,
  context: Record<string, unknown> = {}
): void {
  request.log.error({ err: error, ...context }, message);
  reply.status(500).send({ error: message });
}
