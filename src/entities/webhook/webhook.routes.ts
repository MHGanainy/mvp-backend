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
        fastify.log.error('Missing raw body for webhook');
        reply.status(400).send({ error: 'Missing request body' });
        return;
      }

      if (!signature || typeof signature !== 'string') {
        fastify.log.error('Missing Stripe signature header');
        reply.status(400).send({ error: 'Missing stripe-signature header' });
        return;
      }

      // 2. Verify webhook signature
      let event;
      try {
        event = webhookService.verifyWebhookSignature(rawBody, signature);
      } catch (error: any) {
        fastify.log.error(`Webhook signature verification failed: ${error.message}`);
        reply.status(400).send({ error: 'Invalid signature' });
        return;
      }

      console.log(`📥 Webhook received: ${event.type} (${event.id})`);

      // 3. Check idempotency - have we already processed this event?
      const alreadyProcessed = await webhookService.checkIdempotency(event.id);
      if (alreadyProcessed) {
        console.log(`⏩ Event ${event.id} already processed, returning success`);
        reply.status(200).send({ received: true, message: 'Event already processed' });
        return;
      }

      // 4. Process the webhook event
      try {
        await webhookService.processWebhookEvent(event);
      } catch (error: any) {
        fastify.log.error(`Error processing webhook event: ${error.message}`);
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
      console.log(`✅ Webhook processed successfully in ${processingTime}ms`);

      // 6. Return 200 OK to Stripe (critical!)
      reply.status(200).send({ received: true });
    } catch (error: any) {
      fastify.log.error('Unexpected webhook error:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
