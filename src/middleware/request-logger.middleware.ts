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

// Store the request start time, ID, and body before auth runs
interface RequestMeta {
  requestId: string
  startTime: number
  requestBody?: unknown
}
const requestMetadata = new WeakMap<FastifyRequest, RequestMeta>()

// Fields to redact from logs (case-insensitive)
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'credit_card', 'cvv', 'ssn']

/**
 * Redact sensitive fields from an object for logging
 */
function redactSensitiveData(obj: unknown, maxDepth = 5): unknown {
  if (maxDepth <= 0) return '[max depth reached]'
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, maxDepth - 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value, maxDepth - 1)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Truncate large payloads for logging
 */
function truncatePayload(obj: unknown, maxLength = 2000): unknown {
  if (obj === null || obj === undefined) return obj

  const str = JSON.stringify(obj)
  if (str.length <= maxLength) return obj

  return {
    _truncated: true,
    _originalLength: str.length,
    _preview: str.substring(0, maxLength) + '...'
  }
}

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
    request.requestLogger = logger
  })

  // Hook: preParsing - Capture raw body for logging (optional, for edge cases)
  // Most bodies are captured in preHandler after parsing

  // Hook: preHandler - Update logger with user context after auth runs
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (shouldSkipLogging(request.url)) return

    const metadata = requestMetadata.get(request)
    if (!metadata) return

    const user = request.user as JWTPayload | undefined

    // Capture request body (after parsing)
    if (request.body && Object.keys(request.body as object).length > 0) {
      const safeBody = redactSensitiveData(request.body)
      metadata.requestBody = truncatePayload(safeBody)
    }

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
    request.requestLogger = logger

    // Log request entry with body
    logger.requestEntry(metadata.requestBody)
  })

  // Hook: onSend - Capture response body before sending
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (shouldSkipLogging(request.url)) return payload

    // Store response body for logging in onResponse
    const metadata = requestMetadata.get(request)
    if (metadata) {
      try {
        // Parse JSON payload if it's a string
        let responseBody: unknown = payload
        if (typeof payload === 'string' && payload.startsWith('{')) {
          try {
            responseBody = JSON.parse(payload)
          } catch {
            responseBody = payload
          }
        }

        // Redact and truncate response
        if (responseBody && typeof responseBody === 'object') {
          const safeResponse = redactSensitiveData(responseBody)
          ;(metadata as any).responseBody = truncatePayload(safeResponse)
        }
      } catch {
        // Ignore errors in response capture
      }
    }

    return payload // Must return payload unchanged
  })

  // Hook: onResponse - Log request completion with response body
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (shouldSkipLogging(request.url)) return

    const logger = request.requestLogger
    if (!logger) return

    const metadata = requestMetadata.get(request)
    const responseBody = metadata ? (metadata as any).responseBody : undefined

    // Log request exit with status code, duration, and response body
    logger.requestExit(reply.statusCode, responseBody)
  })

  // Hook: onError - Log errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const logger = request.requestLogger
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
  return request.requestLogger
}
