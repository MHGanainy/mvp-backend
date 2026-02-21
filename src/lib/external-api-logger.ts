// src/lib/external-api-logger.ts
// PRESERVED FOR REFERENCE - No longer used after logging revamp.
// Previously provided logExternalApiCall, logDatabaseQuery, logFunctionEntry/Exit
// helpers that wrapped operations with structured logs sent to RequestLogger/appLogger.
// These were removed in favour of inline structured pino logging via request.log.

/*
// Simple logger interface that both RequestLogger and appLogger satisfy
export interface SimpleLogger {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => void
  debug: (message: string, data?: Record<string, unknown>) => void
}

export interface ExternalApiLogOptions {
  service: string
  operation: string
  request?: unknown
  maxLength?: number
}

export interface ExternalApiResult<T> {
  success: boolean
  data?: T
  error?: Error
  durationMs: number
}

export async function logExternalApiCall<T>(
  logger: SimpleLogger,
  options: ExternalApiLogOptions,
  apiCall: () => Promise<T>
): Promise<T> {
  const { service, operation, request, maxLength = 500 } = options
  const startTime = Date.now()

  // Log request start
  logger.info(`External API call started: ${service}.${operation}`, {
    externalService: service,
    externalOperation: operation,
    externalRequest: request ? truncateForLogging(request, maxLength) : undefined,
  })

  try {
    const result = await apiCall()
    const durationMs = Date.now() - startTime

    // Log successful response
    logger.info(`External API call completed: ${service}.${operation}`, {
      externalService: service,
      externalOperation: operation,
      externalDurationMs: durationMs,
      externalSuccess: true,
      externalResponse: truncateForLogging(result, maxLength),
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime

    // Log error
    logger.error(`External API call failed: ${service}.${operation}`, error, {
      externalService: service,
      externalOperation: operation,
      externalDurationMs: durationMs,
      externalSuccess: false,
    })

    throw error
  }
}

function truncateForLogging(obj: unknown, maxLength: number): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string') {
    return obj.length > maxLength ? obj.substring(0, maxLength) + '...[truncated]' : obj
  }

  if (typeof obj !== 'object') {
    return obj
  }

  // For objects, stringify and truncate
  try {
    const str = JSON.stringify(obj)
    if (str.length <= maxLength) {
      return obj
    }
    return JSON.parse(str.substring(0, maxLength) + '"}') // Try to keep it valid JSON
  } catch {
    return '[Object - truncation failed]'
  }
}

export async function logDatabaseQuery<T>(
  logger: SimpleLogger,
  operation: string,
  table: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()

  logger.debug(`DB query started: ${operation} on ${table}`, {
    dbOperation: operation,
    dbTable: table,
  })

  try {
    const result = await queryFn()
    const durationMs = Date.now() - startTime

    logger.debug(`DB query completed: ${operation} on ${table}`, {
      dbOperation: operation,
      dbTable: table,
      dbDurationMs: durationMs,
      dbSuccess: true,
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime

    logger.error(`DB query failed: ${operation} on ${table}`, error, {
      dbOperation: operation,
      dbTable: table,
      dbDurationMs: durationMs,
      dbSuccess: false,
    })

    throw error
  }
}

export function logFunctionEntry(
  logger: SimpleLogger,
  functionName: string,
  params?: Record<string, unknown>
) {
  logger.info(`Function entry: ${functionName}`, {
    function: functionName,
    functionParams: params,
  })
}

export function logFunctionExit(
  logger: SimpleLogger,
  functionName: string,
  result?: { success: boolean; data?: unknown }
) {
  logger.info(`Function exit: ${functionName}`, {
    function: functionName,
    functionSuccess: result?.success ?? true,
    functionResult: result?.data ? truncateForLogging(result.data, 200) : undefined,
  })
}
*/
