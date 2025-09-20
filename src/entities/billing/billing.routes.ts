import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from './billing.service';
import {
  BillingWebhookSchema,
  SessionEndSchema,
  type BillingWebhookInput,
  type SessionEndInput,
  BILLING_CONFIG
} from './billing.schema';

export default async function billingRoutes(fastify: FastifyInstance) {
  const billingService = new BillingService(fastify.prisma, fastify.log);

  // Middleware to verify internal secret
  const verifyInternalSecret = async (
    request: FastifyRequest, 
    reply: FastifyReply
  ): Promise<boolean> => {
    const requestId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const secret = request.headers['x-internal-secret'] as string;
    const expectedSecret = process.env.VOICE_AGENT_SHARED_SECRET || BILLING_CONFIG.DEFAULT_INTERNAL_SECRET;
    
    // Log authentication attempt
    fastify.log.info({
      requestId,
      action: 'verify_internal_secret',
      has_secret: !!secret,
      ip: request.ip,
      url: request.url,
      method: request.method,
      user_agent: request.headers['user-agent']
    });
    
    if (!secret) {
      fastify.log.error({
        requestId,
        action: 'missing_internal_secret',
        ip: request.ip,
        url: request.url
      });
      
      reply.status(401).send({ 
        error: 'Missing authentication',
        message: 'X-Internal-Secret header is required',
        requestId 
      });
      return false;
    }
    
    if (secret !== expectedSecret) {
      fastify.log.error({
        requestId,
        action: 'invalid_internal_secret',
        ip: request.ip,
        url: request.url
      });
      
      reply.status(401).send({ 
        error: 'Invalid authentication',
        message: 'Invalid internal secret provided',
        requestId 
      });
      return false;
    }
    
    fastify.log.debug({
      requestId,
      action: 'secret_verified_successfully',
      ip: request.ip
    });
    
    return true;
  };

  // Main billing webhook endpoint - called every minute during conversation
  fastify.post('/billing/voice-minute', async (
    request: FastifyRequest<{ Body: BillingWebhookInput }>,
    reply: FastifyReply
  ) => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log incoming request with full details
    fastify.log.info({
      requestId,
      action: 'billing_request_received',
      method: request.method,
      url: request.url,
      body: request.body,
      headers: {
        'content-type': request.headers['content-type'],
        'content-length': request.headers['content-length'],
        'x-internal-secret': 'REDACTED',
        'x-request-id': request.headers['x-request-id']
      },
      ip: request.ip,
      timestamp: new Date().toISOString()
    });

    // Verify authentication
    if (!await verifyInternalSecret(request, reply)) {
      const duration = Date.now() - startTime;
      fastify.log.warn({
        requestId,
        action: 'billing_request_rejected_auth',
        reason: 'invalid_or_missing_secret',
        duration_ms: duration
      });
      return;
    }

    try {
      // Validate request body against schema
      const validatedData = BillingWebhookSchema.parse(request.body);
      
      fastify.log.debug({
        requestId,
        action: 'request_body_validated',
        validated_data: validatedData
      });
      
      // Process billing through service
      const result = await billingService.handleMinuteBilling(validatedData);
      
      const duration = Date.now() - startTime;
      
      // Log successful completion
      fastify.log.info({
        requestId,
        action: 'billing_request_completed',
        duration_ms: duration,
        result,
        conversation_id: validatedData.conversation_id,
        minute: validatedData.minute,
        status: result.status,
        credits_remaining: result.creditsRemaining,
        should_terminate: result.shouldTerminate
      });
      
      // Add response headers for tracking
      reply.header('X-Request-ID', requestId);
      reply.header('X-Processing-Time-MS', duration.toString());
      reply.header('X-Credits-Remaining', result.creditsRemaining.toString());
      
      reply.status(200).send(result);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle validation errors
      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as any;
        fastify.log.error({
          requestId,
          action: 'validation_failed',
          duration_ms: duration,
          errors: zodError.errors,
          body: request.body
        });
        
        reply.status(400).send({
          status: 'error',
          message: 'Invalid request data',
          errors: zodError.errors,
          requestId
        });
      } else {
        // Handle other errors
        fastify.log.error({
          requestId,
          action: 'billing_request_failed',
          duration_ms: duration,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          body: request.body
        });
        
        reply.status(500).send({ 
          status: 'error', 
          message: error instanceof Error ? error.message : 'Billing failed',
          requestId
        });
      }
    }
  });

  // Session end endpoint - called when conversation ends
  fastify.post('/billing/end-session', async (
    request: FastifyRequest<{ Body: SessionEndInput }>,
    reply: FastifyReply
  ) => {
    const startTime = Date.now();
    const requestId = `end_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    fastify.log.info({
      requestId,
      action: 'session_end_request_received',
      body: request.body,
      ip: request.ip,
      timestamp: new Date().toISOString()
    });
    
    // Verify authentication
    if (!await verifyInternalSecret(request, reply)) {
      const duration = Date.now() - startTime;
      fastify.log.warn({
        requestId,
        action: 'session_end_rejected_auth',
        reason: 'invalid_or_missing_secret',
        duration_ms: duration
      });
      return;
    }

    try {
      // Validate request body
      const validatedData = SessionEndSchema.parse(request.body);
      
      // Process session end
      const result = await billingService.handleSessionEnd(validatedData);
      
      const duration = Date.now() - startTime;
      
      fastify.log.info({
        requestId,
        action: 'session_end_completed',
        duration_ms: duration,
        result,
        conversation_id: validatedData.conversation_id,
        total_minutes: validatedData.total_minutes,
        attempt_found: result.attemptFound
      });
      
      // Add response headers
      reply.header('X-Request-ID', requestId);
      reply.header('X-Processing-Time-MS', duration.toString());
      
      reply.status(200).send(result);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      fastify.log.error({
        requestId,
        action: 'session_end_failed',
        duration_ms: duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      reply.status(500).send({ 
        error: 'Failed to end billing session',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      });
    }
  });

  // Metrics endpoint - get billing statistics
  fastify.get('/billing/metrics', async (request, reply) => {
    const requestId = `metrics_${Date.now()}`;
    
    try {
      const metrics = billingService.getMetrics();
      
      fastify.log.info({
        requestId,
        action: 'metrics_requested',
        metrics,
        ip: request.ip
      });
      
      reply.send({
        requestId,
        timestamp: new Date().toISOString(),
        metrics
      });
      
    } catch (error) {
      fastify.log.error({
        requestId,
        action: 'metrics_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      reply.status(500).send({
        error: 'Failed to get metrics',
        requestId
      });
    }
  });

  // Reset metrics endpoint
  fastify.post('/billing/metrics/reset', async (request, reply) => {
    // Verify authentication for sensitive operation
    if (!await verifyInternalSecret(request, reply)) {
      return;
    }
    
    const requestId = `metrics_reset_${Date.now()}`;
    
    try {
      billingService.resetMetrics();
      
      fastify.log.info({
        requestId,
        action: 'metrics_reset',
        ip: request.ip
      });
      
      reply.send({
        success: true,
        message: 'Metrics reset successfully',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      fastify.log.error({
        requestId,
        action: 'metrics_reset_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      reply.status(500).send({
        error: 'Failed to reset metrics',
        requestId
      });
    }
  });

  // Health check endpoint for billing service
  fastify.get('/billing/health', async (request, reply) => {
    const metrics = billingService.getMetrics();
    
    const health = {
      status: 'healthy',
      service: 'billing',
      timestamp: new Date().toISOString(),
      uptime_seconds: metrics.uptime,
      requests_processed: metrics.totalRequests,
      success_rate: metrics.totalRequests > 0 
        ? ((metrics.successfulBillings / metrics.totalRequests) * 100).toFixed(2) + '%'
        : 'N/A'
    };
    
    reply.send(health);
  });

  fastify.log.info('Billing routes registered successfully', {
    endpoints: [
      'POST /billing/voice-minute',
      'POST /billing/end-session',
      'GET /billing/metrics',
      'POST /billing/metrics/reset',
      'GET /billing/health'
    ]
  });
  
  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    await billingService.cleanup();
  });
}