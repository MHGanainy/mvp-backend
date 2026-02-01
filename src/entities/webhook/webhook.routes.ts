// src/entities/webhook/webhook.routes.ts
import { FastifyInstance, FastifyRequest } from 'fastify';
import { StripeWebhookService } from '../../services/stripe-webhook.service';

export default async function webhookRoutes(fastify: FastifyInstance) {
  const webhookService = new StripeWebhookService(fastify.prisma);

  // POST /webhooks/stripe - Stripe webhook endpoint
  // CRITICAL: No authentication - Stripe needs direct access
  // Security is handled via signature verification
  fastify.post('/stripe', async (request: FastifyRequest, reply) => {
    const startTime = Date.now();

    try {
      // 1. Get raw body and signature
      const rawBody = request.rawBody;
      const signature = request.headers['stripe-signature'];

      if (!rawBody) {
        request.log.error('Missing raw body for webhook');
        reply.status(400).send({ error: 'Missing request body' });
        return;
      }

      if (!signature || typeof signature !== 'string') {
        request.log.error('Missing Stripe signature header');
        reply.status(400).send({ error: 'Missing stripe-signature header' });
        return;
      }

      // 2. Verify webhook signature
      let event;
      try {
        event = webhookService.verifyWebhookSignature(rawBody, signature);
      } catch (error: any) {
        request.log.error({ err: error }, 'Webhook signature verification failed');
        reply.status(400).send({ error: 'Invalid signature' });
        return;
      }

      request.log.info({ eventType: event.type, eventId: event.id }, 'Webhook received');

      // 3. Check idempotency - have we already processed this event?
      const alreadyProcessed = await webhookService.checkIdempotency(event.id);
      if (alreadyProcessed) {
        request.log.info({ eventId: event.id }, 'Event already processed, returning success');
        reply.status(200).send({ received: true, message: 'Event already processed' });
        return;
      }

      // 4. Process the webhook event
      try {
        await webhookService.processWebhookEvent(event);
      } catch (error: any) {
        request.log.error({ err: error, eventId: event.id }, 'Error processing webhook event');
        // Still record the event but mark as failed
        await webhookService.recordWebhookEvent(event.id, event.type, {
          ...event,
          processingError: error.message,
        });
        // Return 500 so Stripe retries
        reply.status(500).send({ error: 'Event processing failed' });
        return;
      }

      // 5. Record successful webhook event
      await webhookService.recordWebhookEvent(event.id, event.type, event);

      const processingTime = Date.now() - startTime;
      request.log.info({ eventId: event.id, processingTime }, 'Webhook processed successfully');

      // 6. Return 200 OK to Stripe (critical!)
      reply.status(200).send({ received: true });
    } catch (error: any) {
      request.log.error({ err: error }, 'Unexpected webhook error');
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
