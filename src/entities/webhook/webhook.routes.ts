import { FastifyInstance, FastifyRequest } from 'fastify';
import { StripeWebhookService } from '../../services/stripe-webhook.service';
import { LiveKitWebhookService } from '../../services/livekit-webhook.service';

export default async function webhookRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser('application/webhook+json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body.toString('utf-8');
    done(null, body);
  });
  // POST /webhooks/stripe - Stripe webhook endpoint
  // CRITICAL: No authentication - Stripe needs direct access
  // Security is handled via signature verification
  fastify.post('/stripe', async (request: FastifyRequest, reply) => {
    const log = request.log.child({ service: 'StripeWebhookService' });
    const webhookService = new StripeWebhookService(fastify.prisma, log);
    const startTime = Date.now();

    try {
      const rawBody = request.rawBody;
      const signature = request.headers['stripe-signature'];

      if (!rawBody) {
        log.error('Missing raw body for webhook');
        reply.status(400).send({ error: 'Missing request body' });
        return;
      }

      if (!signature || typeof signature !== 'string') {
        log.error('Missing Stripe signature header');
        reply.status(400).send({ error: 'Missing stripe-signature header' });
        return;
      }

      let event;
      try {
        event = webhookService.verifyWebhookSignature(rawBody, signature);
      } catch (error) {
        log.error({ err: error }, 'Webhook signature verification failed');
        reply.status(400).send({ error: 'Invalid signature' });
        return;
      }

      log.info({ eventType: event.type, eventId: event.id }, 'Webhook received');

      const alreadyProcessed = await webhookService.checkIdempotency(event.id);
      if (alreadyProcessed) {
        log.info({ eventId: event.id }, 'Event already processed, returning success');
        reply.status(200).send({ received: true, message: 'Event already processed' });
        return;
      }

      try {
        await webhookService.processWebhookEvent(event);
      } catch (error) {
        log.error({ err: error, eventId: event.id }, 'Error processing webhook event');
        // Do NOT record the event on failure — let Stripe retry
        reply.status(500).send({ error: 'Event processing failed' });
        return;
      }

      await webhookService.recordWebhookEvent(event.id, event.type, event);

      const processingTime = Date.now() - startTime;
      log.info({ processingTime }, 'Webhook processed successfully');

      reply.status(200).send({ received: true });
    } catch (error) {
      log.error({ err: error }, 'Unexpected webhook error');
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/livekit', async (request: FastifyRequest, reply) => {
    const log = request.log.child({ service: 'LiveKitWebhookService' });
    const svc = new LiveKitWebhookService(fastify.prisma, log);
    const rawBody = request.rawBody;
    const auth = request.headers['authorization'];

    if (!rawBody || typeof auth !== 'string') {
      reply.status(400).send({ error: 'Missing body or authorization' });
      return;
    }

    let event;
    try {
      event = await svc.verify(rawBody, auth);
    } catch (err) {
      log.error({ err }, 'LiveKit webhook signature verification failed');
      reply.status(400).send({ error: 'Invalid signature' });
      return;
    }

    try {
      await svc.handle(event);
      reply.status(200).send({ ok: true });
    } catch (err) {
      log.error({ err, event: event.event }, 'LiveKit webhook handler error');
      reply.status(500).send({ error: 'Handler failed' });
    }
  });
}
