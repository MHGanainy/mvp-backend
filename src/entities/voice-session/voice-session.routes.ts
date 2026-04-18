import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceSessionService } from './voice-session.service';
import {
  sessionConfigParamsSchema,
  heartbeatBodySchema,
  saveTranscriptBodySchema,
  type SessionConfigParams,
  type HeartbeatBody,
  type SaveTranscriptBody,
} from './voice-session.schema';

const BACKEND_SERVICE_TOKEN = process.env.BACKEND_SERVICE_TOKEN;

async function verifyServiceToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!BACKEND_SERVICE_TOKEN) {
    request.log.error('BACKEND_SERVICE_TOKEN is not configured');
    reply.status(500).send({ error: 'Service token not configured' });
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== BACKEND_SERVICE_TOKEN) {
    reply.status(401).send({ error: 'Invalid service token' });
    return;
  }
}

export default async function voiceSessionRoutes(fastify: FastifyInstance) {
  const service = new VoiceSessionService(
    fastify.prisma,
    fastify.log.child({ service: 'VoiceSessionService' })
  );

  // All routes in this plugin require service token auth
  fastify.addHook('preHandler', verifyServiceToken);

  // GET /voice/session/config/:correlationToken
  fastify.get(
    '/voice/session/config/:correlationToken',
    async (request: FastifyRequest<{ Params: SessionConfigParams }>, reply: FastifyReply) => {
      try {
        const { correlationToken } = sessionConfigParamsSchema.parse(request.params);
        const config = await service.getSessionConfig(correlationToken);
        reply.send(config);
      } catch (error) {
        if (error instanceof Error && error.message === 'Attempt not found for correlationToken') {
          reply.status(404).send({ error: 'Session not found' });
        } else {
          request.log.error({ err: error }, 'Failed to get session config');
          reply.status(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // POST /voice/session/heartbeat
  fastify.post(
    '/voice/session/heartbeat',
    async (request: FastifyRequest<{ Body: HeartbeatBody }>, reply: FastifyReply) => {
      try {
        const body = heartbeatBodySchema.parse(request.body);
        const result = await service.handleHeartbeat(body);
        reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'Heartbeat processing failed');
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /voice/session/transcript
  fastify.post(
    '/voice/session/transcript',
    async (request: FastifyRequest<{ Body: SaveTranscriptBody }>, reply: FastifyReply) => {
      try {
        const body = saveTranscriptBodySchema.parse(request.body);
        const result = await service.saveTranscript(body);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error && (
          error.message === 'SimulationAttempt not found' ||
          error.message === 'InterviewSimulationAttempt not found'
        )) {
          reply.status(404).send({ error: 'Session not found' });
        } else {
          request.log.error({ err: error }, 'Failed to save transcript');
          reply.status(500).send({ error: 'Internal server error' });
        }
      }
    }
  );
}
