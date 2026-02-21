# Logging Guide for MVP Backend

This guide explains how to use the pino-based logging system.

## Quick Start

### In Route Handlers

```typescript
// Use request.log directly - it already has requestId, ip, userId, userRole set
fastify.post('/simulations/:id/start', async (request, reply) => {
  request.log.info({ simulationId: request.params.id }, 'Starting simulation')

  // Pass to service as child logger
  const service = new SimulationAttemptService(
    fastify.prisma,
    request.log.child({ service: 'SimulationAttemptService' })
  )

  const result = await service.create(data)
  return result
})
```

### In Services

```typescript
import { FastifyBaseLogger } from 'fastify'

export class SimulationAttemptService {
  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {}

  async create(data: CreateInput) {
    this.log.info({ simulationId: data.simulationId }, 'Creating simulation attempt')

    // ... your logic

    this.log.info({ attemptId: attempt.id }, 'Simulation attempt created')
    return attempt
  }
}
```

### In server.ts (no request context)

```typescript
const cleanupService = new CleanupService(
  prisma,
  fastify.log.child({ service: 'CleanupService' })
)
```

## Log Levels

- `trace` — very detailed diagnostics
- `debug` — developer diagnostics
- `info` — normal operations
- `warn` — recoverable issues
- `error` — errors that need attention

## Context

Per-request context (requestId, ip, userId, userEmail, userRole) is automatically set in
the `preHandler` hook by `registerRequestLogging()` in `src/middleware/request-logger.middleware.ts`.

All subsequent logs on `request.log` inherit this context via pino child loggers.

## Output

- **Development**: pino-pretty colored output to stdout
- **Production**: JSON to stdout (for Filebeat or any log aggregator)

Control log level with the `LOG_LEVEL` environment variable (default: `info`).
