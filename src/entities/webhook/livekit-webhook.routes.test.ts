import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'
import { makeCourse } from '../../../test/factories/course'

vi.mock('livekit-server-sdk', () => {
  class WebhookReceiver {
    receive = vi.fn().mockImplementation(async (body: string) => JSON.parse(body))
  }
  return { WebhookReceiver }
})

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})

async function makeAttemptWithRecording(prisma: Parameters<typeof makeStudent>[0]) {
  const { student } = await makeStudent(prisma, { creditBalance: 10 })
  const course = await makeCourse(prisma)
  const courseCase = await prisma.courseCase.create({
    data: {
      courseId: course.id,
      title: 'Webhook Test Case',
      diagnosis: 'Test',
      patientName: 'Pat',
      patientAge: 30,
      patientGender: 'MALE',
      description: 'Test',
      isFree: false,
      isActive: true,
      displayOrder: 1,
    },
  })
  const simulation = await prisma.simulation.create({
    data: {
      courseCaseId: courseCase.id,
      casePrompt: 'prompt',
      openingLine: 'hello',
      timeLimitMinutes: 10,
      voiceModel: 'VOICE_1',
    },
  })
  const correlationToken = `sim_test_${Date.now()}`
  const attempt = await prisma.simulationAttempt.create({
    data: {
      studentId: student.id,
      simulationId: simulation.id,
      startedAt: new Date(),
      correlationToken,
    },
  })
  const recording = await prisma.recording.create({
    data: {
      attemptType: 'CASE',
      attemptId: attempt.id,
      status: 'PENDING',
      s3Key: `simulation-recordings/case/${attempt.correlationToken}.ogg`,
    },
  })
  return { student, attempt, recording }
}

function postWebhook(app: FastifyInstance, event: object) {
  const body = JSON.stringify(event)
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/livekit',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer mock-livekit-token',
    },
    body,
  })
}

describe('POST /api/webhooks/livekit', () => {
  it('returns 400 when authorization header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/livekit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'egress_started' }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 200 and ignores unknown events', async () => {
    const res = await postWebhook(app, { event: 'room_started', roomInfo: {} })
    expect(res.statusCode).toBe(200)
  })

  it('updates egressId on egress_started', async () => {
    const { attempt, recording } = await makeAttemptWithRecording(prisma)
    const res = await postWebhook(app, {
      event: 'egress_started',
      egressInfo: {
        egressId: 'egress-abc-123',
        roomName: attempt.correlationToken,
        status: 1,
      },
    })
    expect(res.statusCode).toBe(200)
    const updated = await prisma.recording.findUnique({ where: { id: recording.id } })
    expect(updated!.egressId).toBe('egress-abc-123')
    expect(updated!.status).toBe('PENDING')
  })

  it('flips status to READY on egress_ended with EGRESS_COMPLETE', async () => {
    const { attempt, recording } = await makeAttemptWithRecording(prisma)
    await prisma.recording.update({
      where: { id: recording.id },
      data: { egressId: 'egress-ready-456' },
    })

    const res = await postWebhook(app, {
      event: 'egress_ended',
      egressInfo: {
        egressId: 'egress-ready-456',
        roomName: attempt.correlationToken,
        status: 3, // EGRESS_COMPLETE
        fileResults: [{ filename: 'test.ogg', duration: 120, size: 4096000 }],
      },
    })
    expect(res.statusCode).toBe(200)
    const updated = await prisma.recording.findUnique({ where: { id: recording.id } })
    expect(updated!.status).toBe('READY')
    expect(updated!.durationSeconds).toBe(120)
  })

  it('flips status to FAILED on egress_ended with EGRESS_FAILED', async () => {
    const { attempt, recording } = await makeAttemptWithRecording(prisma)
    await prisma.recording.update({
      where: { id: recording.id },
      data: { egressId: 'egress-fail-789' },
    })

    const res = await postWebhook(app, {
      event: 'egress_ended',
      egressInfo: {
        egressId: 'egress-fail-789',
        roomName: attempt.correlationToken,
        status: 5, // EGRESS_FAILED
        error: 'S3 upload failed',
      },
    })
    expect(res.statusCode).toBe(200)
    const updated = await prisma.recording.findUnique({ where: { id: recording.id } })
    expect(updated!.status).toBe('FAILED')
    expect(updated!.failureReason).toBe('S3 upload failed')
  })

  it('is idempotent: ignores egress_ended when recording is already READY', async () => {
    const { attempt, recording } = await makeAttemptWithRecording(prisma)
    await prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'READY', egressId: 'egress-idempotent-1' },
    })
    const readyRecording = await prisma.recording.findUnique({ where: { id: recording.id } })

    const res = await postWebhook(app, {
      event: 'egress_ended',
      egressInfo: {
        egressId: 'egress-idempotent-1',
        roomName: attempt.correlationToken,
        status: 5, // EGRESS_FAILED would flip to FAILED if not idempotent
        error: 'Late failure',
      },
    })
    expect(res.statusCode).toBe(200)
    const unchanged = await prisma.recording.findUnique({ where: { id: readyRecording.id } })
    expect(unchanged!.status).toBe('READY')
  })
})
