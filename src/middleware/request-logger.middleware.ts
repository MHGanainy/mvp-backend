// src/middleware/request-logger.middleware.ts
// Request logging middleware - attaches logger to request and logs entry/exit

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  RequestLogger,
  generateRequestId,
  createRequestLoggerWithContext,
  LogContext,
} from '../lib/logger'
import { JWTPayload } from '../entities/auth/auth.schema'

// Store the request start time and ID before auth runs
const requestMetadata = new WeakMap<FastifyRequest, { requestId: string; startTime: number }>()

/**
 * Register request logging hooks on the Fastify instance
 * This must be called AFTER JWT plugin is registered
 */
export function registerRequestLogging(fastify: FastifyInstance) {
  // Hook: onRequest - Generate request ID and start timer (before auth)
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Generate request ID and store start time
    const requestId = generateRequestId()
    const startTime = Date.now()
    requestMetadata.set(request, { requestId, startTime })

    // Create initial logger (without user context yet)
    const context: LogContext = {
      requestId,
      startTime,
      method: request.method,
      path: request.url,
      ip: request.ip,
    }

    const logger = createRequestLoggerWithContext(context)
    ;(request as any).log = logger
  })

  // Hook: preHandler - Update logger with user context after auth runs
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (shouldSkipLogging(request.url)) return

    const metadata = requestMetadata.get(request)
    if (!metadata) return

    const user = request.user as JWTPayload | undefined

    // Create updated logger with full user context
    const context: LogContext = {
      requestId: metadata.requestId,
      startTime: metadata.startTime,
      userId: user?.userId,
      userEmail: user?.email,
      userRole: user?.role,
      isAdmin: user?.isAdmin,
      method: request.method,
      path: request.url,
      ip: request.ip,
    }

    const logger = createRequestLoggerWithContext(context)
    ;(request as any).log = logger

    // Log request entry
    logger.requestEntry()
  })

  // Hook: onResponse - Log request completion
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (shouldSkipLogging(request.url)) return

    const logger = (request as any).log as RequestLogger
    if (!logger) return

    // Log request exit with status code and duration
    logger.requestExit(reply.statusCode)
  })

  // Hook: onError - Log errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const logger = (request as any).log as RequestLogger
    if (!logger) return

    logger.error('Request error occurred', error, {
      statusCode: reply.statusCode,
    })
  })
}

/**
 * Endpoints to skip logging (health checks, static assets, etc.)
 */
function shouldSkipLogging(url: string): boolean {
  const skipPatterns = ['/health', '/api/health', '/favicon.ico', '/robots.txt']

  return skipPatterns.some((pattern) => url === pattern || url.startsWith(pattern))
}

/**
 * Helper to get logger from request in route handlers
 * Use this in your route handlers and services
 */
export function getLogger(request: FastifyRequest): RequestLogger {
  return (request as any).log as RequestLogger
}
