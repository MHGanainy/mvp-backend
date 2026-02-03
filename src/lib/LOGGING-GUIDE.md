# Logging Guide for MVP Backend

This guide explains how to use the centralized logging system to achieve full request traceability from API entry to response, correlated by user and business entities.

## Quick Start

### In Route Handlers

```typescript
import { getLogger } from '../../middleware/request-logger.middleware'

fastify.post('/simulations/:id/start', async (request, reply) => {
  const logger = getLogger(request)

  // Set entity context for filtering in Kibana
  logger.setEntity({ simulationId: request.params.id })

  logger.info('Starting simulation', { simulationId: request.params.id })

  // ... your logic

  return result
})
```

### In Services

```typescript
import { RequestLogger } from '../../lib/logger'

export class SimulationAttemptService {
  async create(data: CreateInput, logger: RequestLogger) {
    // Create a child logger for this service
    const log = logger.child({
      service: 'SimulationAttemptService',
      entity: { simulationId: data.simulationId }
    })

    log.info('Creating simulation attempt')

    // ... your logic

    log.info('Simulation attempt created', { attemptId: attempt.id })

    return attempt
  }
}
```

## Log Context

Every log automatically includes:

| Field | Description | Source |
|-------|-------------|--------|
| `@timestamp` | ISO timestamp | Auto-generated |
| `requestId` | Unique request identifier (e.g., `req_lz8x9a_abc123`) | Auto-generated |
| `userId` | User's database ID | JWT token |
| `userEmail` | User's email | JWT token |
| `userRole` | `student` or `instructor` | JWT token |
| `isAdmin` | Whether user is admin | JWT token |
| `method` | HTTP method (GET, POST, etc.) | Request |
| `path` | API endpoint path | Request |
| `ip` | Client IP address | Request |
| `service` | Service name (when set) | Your code |
| `entity` | Business entity IDs (when set) | Your code |

## Setting Entity Context

**Always set entity context** when working with specific business objects. This enables filtering in Kibana by entity ID.

```typescript
// In route handler
const logger = getLogger(request)

// Set a single entity
logger.setEntity({ simulationAttemptId: 'abc-123' })

// Set multiple entities
logger.setEntity({
  simulationAttemptId: 'abc-123',
  courseId: 'course-456',
  studentId: 'student-789'
})
```

## Available Entity Fields

| Field | Use Case |
|-------|----------|
| `simulationAttemptId` | Simulation attempt operations |
| `interviewSimulationAttemptId` | Interview simulation operations |
| `courseId` | Course-related operations |
| `courseCaseId` | Course case operations |
| `examId` | Exam operations |
| `studentId` | Student-specific operations |
| `instructorId` | Instructor-specific operations |
| `subscriptionId` | Subscription operations |
| `paymentId` | Payment operations |
| `simulationId` | Simulation template operations |

## Log Levels

```typescript
logger.trace('Very detailed info')  // Most verbose
logger.debug('Debug information')   // Development details
logger.info('Normal operation')     // Standard operations
logger.warn('Warning condition')    // Potential issues
logger.error('Error occurred', error)  // Errors
```

## Error Logging

Always include the error object for stack traces:

```typescript
try {
  await riskyOperation()
} catch (error) {
  logger.error('Operation failed', error, {
    operationId: 'abc',
    additionalContext: 'value'
  })
  throw error
}
```

## Complete Example: Route + Service

### Route Handler (simulation-attempt.routes.ts)

```typescript
import { getLogger } from '../../middleware/request-logger.middleware'
import { SimulationAttemptService } from './simulation-attempt.service'

fastify.post('/simulation-attempts', async (request, reply) => {
  const logger = getLogger(request)
  const service = new SimulationAttemptService(fastify.prisma)

  const { simulationId, studentId } = request.body

  // Set entity context early
  logger.setEntity({ simulationId, studentId })

  logger.info('Creating new simulation attempt')

  const attempt = await service.create(request.body, logger)

  // Update entity context with the new attempt ID
  logger.setEntity({ simulationAttemptId: attempt.id })

  logger.info('Simulation attempt created successfully')

  return attempt
})
```

### Service (simulation-attempt.service.ts)

```typescript
import { RequestLogger } from '../../lib/logger'

export class SimulationAttemptService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInput, logger: RequestLogger) {
    const log = logger.child({ service: 'SimulationAttemptService' })

    log.info('Validating student credits')

    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId }
    })

    if (student.creditBalance < 1) {
      log.warn('Insufficient credits', {
        required: 1,
        available: student.creditBalance
      })
      throw new Error('Insufficient credits')
    }

    log.info('Creating attempt record')

    const attempt = await this.prisma.simulationAttempt.create({
      data: { ... }
    })

    // Update entity context
    log.setEntity({ simulationAttemptId: attempt.id })

    log.info('Creating LiveKit session')

    try {
      const livekit = await livekitService.createSession(...)
      log.info('LiveKit session created', { roomName: livekit.roomName })
    } catch (error) {
      log.error('Failed to create LiveKit session', error)
      throw error
    }

    log.info('Simulation attempt created successfully', {
      attemptId: attempt.id,
      correlationToken: attempt.correlationToken
    })

    return attempt
  }
}
```

## Kibana Queries

Once logs are in Elasticsearch, you can query them in Kibana:

### Find all logs for a specific user

```
userId: 42 AND @timestamp >= "2025-02-03T00:00:00Z"
```

### Find all logs for a simulation attempt

```
entity.simulationAttemptId: "abc-123"
```

### Find all errors for a user today

```
userId: 42 AND level: "error" AND @timestamp >= now-24h
```

### Find slow requests (>500ms)

```
durationMs > 500 AND type: "request_end"
```

### Trace a single request end-to-end

```
requestId: "req_lz8x9a_abc123"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | `info` |
| `LOG_DIR` | Directory for log files | `./logs` |
| `LOG_FILE` | Log file name | `app.log` |
| `NODE_ENV` | Environment (development/production) | `development` |

## Migration from console.log

Replace:

```typescript
// OLD
console.log(`[SimulationAttempt] Creating attempt for student ${studentId}`)
console.error('[SimulationAttempt] Failed:', error)
```

With:

```typescript
// NEW
log.info('Creating attempt', { studentId })
log.error('Failed to create attempt', error, { studentId })
```

## Sample Log Output

```json
{
  "@timestamp": "2025-02-03T14:23:45.123Z",
  "level": "info",
  "requestId": "req_lz8x9a_abc123",
  "userId": 42,
  "userEmail": "mohamed@example.com",
  "userRole": "student",
  "isAdmin": false,
  "method": "POST",
  "path": "/api/simulation-attempts",
  "ip": "192.168.1.100",
  "service": "SimulationAttemptService",
  "entity": {
    "simulationId": "sim_456",
    "studentId": "stu_789",
    "simulationAttemptId": "att_abc123"
  },
  "message": "Simulation attempt created successfully",
  "env": "production"
}
```
