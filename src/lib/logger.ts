// src/lib/logger.ts
// Centralized logging utility with request context propagation
// Sends logs directly to Elasticsearch on Railway

import pino from 'pino'
import { FastifyRequest } from 'fastify'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// TYPES
// ============================================================================

export interface RequestContext {
  requestId: string
  userId?: number
  userName?: string
  userEmail?: string
  userRole?: 'student' | 'instructor'
  isAdmin?: boolean
  method: string
  path: string
  ip?: string
  startTime: number
}

export interface EntityContext {
  simulationAttemptId?: string
  interviewSimulationAttemptId?: string
  courseId?: string
  courseCaseId?: string
  examId?: string
  studentId?: string
  instructorId?: string
  subscriptionId?: string
  paymentId?: string
  simulationId?: string
  [key: string]: string | undefined
}

export interface LogContext extends RequestContext {
  service?: string
  entity?: EntityContext
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const NODE_ENV = process.env.NODE_ENV || 'development'

// Environment name for filtering (staging, production, development)
// Set ENVIRONMENT explicitly, or it will derive from NODE_ENV or RAILWAY_ENVIRONMENT
const ENVIRONMENT = process.env.ENVIRONMENT
  || process.env.RAILWAY_ENVIRONMENT_NAME
  || NODE_ENV

// Elasticsearch configuration (Railway)
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL // e.g., http://elasticsearch.railway.internal:9200

// Index prefix - includes environment for easy separation
// Results in: api-logs-staging-2025-02-03, api-logs-production-2025-02-03
const ELASTICSEARCH_INDEX_PREFIX = process.env.ELASTICSEARCH_INDEX_PREFIX || `api-logs-${ENVIRONMENT}`

// Local file logging (fallback / development)
const LOG_DIR = process.env.LOG_DIR || './logs'
const LOG_FILE = process.env.LOG_FILE || 'app.log'

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

const logFilePath = path.join(LOG_DIR, LOG_FILE)

// ============================================================================
// ELASTICSEARCH TRANSPORT
// ============================================================================

interface LogEntry {
  '@timestamp': string
  level: string
  message: string
  environment: string  // staging, production, development - USE THIS FOR FILTERING
  app: string
  requestId?: string
  userId?: number
  userName?: string
  userEmail?: string
  userRole?: string
  isAdmin?: boolean
  method?: string
  path?: string
  ip?: string
  service?: string
  entity?: EntityContext
  // Flattened entity fields for easier Kibana filtering
  entity_simulationAttemptId?: string
  entity_interviewSimulationAttemptId?: string
  entity_courseId?: string
  entity_studentId?: string
  entity_instructorId?: string
  type?: string
  statusCode?: number
  durationMs?: number
  responseTimeCategory?: string
  error?: {
    message: string
    stack?: string
    code?: string
  }
  data?: unknown
}

class ElasticsearchTransport {
  private buffer: LogEntry[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly bufferSize = 50
  private readonly flushIntervalMs = 3000 // 3 seconds
  private isEnabled: boolean

  constructor() {
    this.isEnabled = !!ELASTICSEARCH_URL
    if (this.isEnabled) {
      this.startFlushInterval()
      console.log(`[Logger] Elasticsearch transport enabled: ${ELASTICSEARCH_URL}`)
      console.log(`[Logger] Environment: ${ENVIRONMENT}`)
      console.log(`[Logger] Index pattern: ${ELASTICSEARCH_INDEX_PREFIX}-YYYY-MM-DD`)
    } else {
      console.log('[Logger] Elasticsearch URL not configured, using local file logging only')
      console.log(`[Logger] Environment: ${ENVIRONMENT}`)
    }
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        console.error('[Logger] Flush error:', err.message)
      })
    }, this.flushIntervalMs)

    // Don't prevent process from exiting
    if (this.flushInterval.unref) {
      this.flushInterval.unref()
    }
  }

  async log(entry: LogEntry) {
    if (!this.isEnabled) return

    this.buffer.push(entry)

    if (this.buffer.length >= this.bufferSize) {
      await this.flush()
    }
  }

  async flush() {
    if (!this.isEnabled || this.buffer.length === 0) return

    const entries = [...this.buffer]
    this.buffer = []

    try {
      // Get today's index name
      const indexName = `${ELASTICSEARCH_INDEX_PREFIX}-${new Date().toISOString().slice(0, 10)}`

      // Build bulk request body (NDJSON format)
      const body = entries.flatMap((doc) => [
        JSON.stringify({ index: { _index: indexName } }),
        JSON.stringify(doc),
      ]).join('\n') + '\n'

      const response = await fetch(`${ELASTICSEARCH_URL}/_bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson',
        },
        body,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Logger] Elasticsearch bulk insert failed:', response.status, errorText.slice(0, 200))
        // Re-add failed entries (with limit)
        if (this.buffer.length < this.bufferSize * 2) {
          this.buffer.unshift(...entries)
        }
      }
    } catch (error: any) {
      console.error('[Logger] Failed to send logs to Elasticsearch:', error.message)
      // Re-add failed entries
      if (this.buffer.length < this.bufferSize * 2) {
        this.buffer.unshift(...entries)
      }
    }
  }

  async close() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    await this.flush()
  }
}

const esTransport = new ElasticsearchTransport()

// ============================================================================
// PINO LOGGER CONFIGURATION
// ============================================================================

const timestamp = () => `,"@timestamp":"${new Date().toISOString()}"`

const baseConfig: pino.LoggerOptions = {
  level: LOG_LEVEL,
  base: {
    environment: ENVIRONMENT,  // staging, production, development
    app: 'mvp-backend',
  },
  timestamp,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['password', 'token', 'accessToken', 'refreshToken', 'authorization', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
}

let logger: pino.Logger

if (NODE_ENV === 'development') {
  // Development: pretty console + JSON file
  const streams: pino.StreamEntry[] = [
    {
      level: LOG_LEVEL as pino.Level,
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }),
    },
    {
      level: LOG_LEVEL as pino.Level,
      stream: fs.createWriteStream(logFilePath, { flags: 'a' }),
    },
  ]
  logger = pino(baseConfig, pino.multistream(streams))
} else {
  // Production: JSON to stdout + file
  const streams: pino.StreamEntry[] = [
    { level: LOG_LEVEL as pino.Level, stream: process.stdout },
    { level: LOG_LEVEL as pino.Level, stream: fs.createWriteStream(logFilePath, { flags: 'a' }) },
  ]
  logger = pino(baseConfig, pino.multistream(streams))
}

// ============================================================================
// REQUEST CONTEXT LOGGER
// ============================================================================

export class RequestLogger {
  private context: LogContext
  private pinoLogger: pino.Logger

  constructor(context: LogContext) {
    this.context = context
    this.pinoLogger = logger.child({
      requestId: context.requestId,
      userId: context.userId,
      userName: context.userName,
      userEmail: context.userEmail,
      userRole: context.userRole,
      isAdmin: context.isAdmin,
      method: context.method,
      path: context.path,
      ip: context.ip,
    })
  }

  private buildLogEntry(level: string, message: string, extra?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      '@timestamp': new Date().toISOString(),
      level,
      message,
      environment: ENVIRONMENT,  // staging, production, development
      app: 'mvp-backend',
      requestId: this.context.requestId,
      userId: this.context.userId,
      userName: this.context.userName,
      userEmail: this.context.userEmail,
      userRole: this.context.userRole,
      isAdmin: this.context.isAdmin,
      method: this.context.method,
      path: this.context.path,
      ip: this.context.ip,
      service: this.context.service,
      entity: this.context.entity,
      ...extra,
    }

    // Flatten entity fields for easier Kibana filtering
    if (this.context.entity) {
      Object.entries(this.context.entity).forEach(([key, value]) => {
        if (value) {
          (entry as any)[`entity_${key}`] = value
        }
      })
    }

    return entry
  }

  /**
   * Set the service name for subsequent logs
   */
  setService(service: string): RequestLogger {
    this.context.service = service
    this.pinoLogger = this.pinoLogger.child({ service })
    return this
  }

  /**
   * Add entity context (simulationAttemptId, courseId, etc.)
   */
  setEntity(entity: EntityContext): RequestLogger {
    this.context.entity = { ...this.context.entity, ...entity }
    this.pinoLogger = this.pinoLogger.child({ entity: this.context.entity })
    return this
  }

  /**
   * Create a child logger for a specific service
   */
  child(bindings: { service?: string; entity?: EntityContext }): RequestLogger {
    const newContext = { ...this.context }
    if (bindings.service) newContext.service = bindings.service
    if (bindings.entity) newContext.entity = { ...newContext.entity, ...bindings.entity }
    return new RequestLogger(newContext)
  }

  // Logging methods
  info(message: string, data?: Record<string, unknown>) {
    this.pinoLogger.info(data, message)
    esTransport.log(this.buildLogEntry('info', message, data ? { data } : undefined))
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.pinoLogger.warn(data, message)
    esTransport.log(this.buildLogEntry('warn', message, data ? { data } : undefined))
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>) {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, code: (error as any).code }
      : error !== undefined
        ? { message: String(error) }
        : undefined

    this.pinoLogger.error({ error: errorDetails, ...data }, message)
    esTransport.log(this.buildLogEntry('error', message, { error: errorDetails, ...data }))
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.pinoLogger.debug(data, message)
    esTransport.log(this.buildLogEntry('debug', message, data ? { data } : undefined))
  }

  trace(message: string, data?: Record<string, unknown>) {
    this.pinoLogger.trace(data, message)
    esTransport.log(this.buildLogEntry('trace', message, data ? { data } : undefined))
  }

  /**
   * Log request entry with optional request body
   */
  requestEntry(requestBody?: unknown) {
    let message = `→ ${this.context.method} ${this.context.path}`
    const logData: Record<string, unknown> = { type: 'request_start' }

    if (requestBody !== undefined) {
      logData.requestBody = requestBody
      // Include body in message for easy viewing in Kibana
      const bodyStr = JSON.stringify(requestBody)
      message = `${message} | Body: ${bodyStr}`
    }

    this.pinoLogger.info(logData, message)
    esTransport.log(this.buildLogEntry('info', message, logData))
  }

  /**
   * Log request exit with optional response body
   */
  requestExit(statusCode: number, responseBody?: unknown) {
    const durationMs = Date.now() - this.context.startTime
    let message = `← ${this.context.method} ${this.context.path} ${statusCode} (${durationMs}ms)`

    const logData: Record<string, unknown> = {
      type: 'request_end',
      statusCode,
      durationMs,
      responseTimeCategory: durationMs < 100 ? 'fast' : durationMs < 500 ? 'normal' : durationMs < 2000 ? 'slow' : 'very_slow',
    }

    if (responseBody !== undefined) {
      logData.responseBody = responseBody
      // Include body in message for easy viewing in Kibana
      const bodyStr = JSON.stringify(responseBody)
      message = `${message} | Response: ${bodyStr}`
    }

    if (statusCode >= 500) {
      this.pinoLogger.error(logData, message)
    } else if (statusCode >= 400) {
      this.pinoLogger.warn(logData, message)
    } else {
      this.pinoLogger.info(logData, message)
    }

    esTransport.log(this.buildLogEntry(
      statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
      message,
      logData
    ))
  }

  getContext(): LogContext {
    return { ...this.context }
  }

  getRequestId(): string {
    return this.context.requestId
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}_${random}`
}

export function createRequestLogger(request: FastifyRequest): RequestLogger {
  const user = request.user as any

  const context: RequestContext = {
    requestId: generateRequestId(),
    userId: user?.userId,
    userName: user?.name,
    userEmail: user?.email,
    userRole: user?.role,
    isAdmin: user?.isAdmin,
    method: request.method,
    path: request.url,
    ip: request.ip,
    startTime: Date.now(),
  }

  return new RequestLogger(context)
}

export function createRequestLoggerWithContext(context: LogContext): RequestLogger {
  return new RequestLogger(context)
}

export function getRequestLogger(request: FastifyRequest): RequestLogger {
  return (request as any).log as RequestLogger
}

// ============================================================================
// STANDALONE LOGGER (startup, cron jobs)
// ============================================================================

export const appLogger = {
  info: (message: string, data?: Record<string, unknown>) => {
    logger.info(data, message)
    esTransport.log({
      '@timestamp': new Date().toISOString(),
      level: 'info',
      message,
      environment: ENVIRONMENT,
      app: 'mvp-backend',
      ...data,
    } as LogEntry)
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    logger.warn(data, message)
    esTransport.log({
      '@timestamp': new Date().toISOString(),
      level: 'warn',
      message,
      environment: ENVIRONMENT,
      app: 'mvp-backend',
      ...data,
    } as LogEntry)
  },
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error !== undefined
        ? { message: String(error) }
        : undefined
    logger.error({ error: errorDetails, ...data }, message)
    esTransport.log({
      '@timestamp': new Date().toISOString(),
      level: 'error',
      message,
      environment: ENVIRONMENT,
      app: 'mvp-backend',
      error: errorDetails,
      ...data,
    } as LogEntry)
  },
  debug: (message: string, data?: Record<string, unknown>) => {
    logger.debug(data, message)
    esTransport.log({
      '@timestamp': new Date().toISOString(),
      level: 'debug',
      message,
      environment: ENVIRONMENT,
      app: 'mvp-backend',
      ...data,
    } as LogEntry)
  },
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

export async function flushLogs(): Promise<void> {
  await esTransport.close()
}

export default logger
