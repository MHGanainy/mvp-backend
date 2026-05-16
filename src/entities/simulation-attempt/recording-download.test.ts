import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { loginAsStudent } from '../../../test/helpers/auth'
import { makeSimulation } from '../../../test/factories/course'

vi.mock('../../shared/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/s3')>()
  return {
    ...actual,
    presignDownloadUrl: vi.fn().mockResolvedValue({
      url: 'https://mock-s3.example.com/recording.ogg?signed=1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    }),
  }
})

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})

async function makeAttemptWithRecording(status: 'PENDING' | 'READY' | 'FAILED' = 'READY') {
  const { student, headers } = await loginAsStudent(app, prisma, { creditBalance: 10 })
  const simulation = await makeSimulation(prisma)
  const correlationToken = `rec_dl_test_${Date.now()}_${Math.random()}`
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
      status,
      s3Key: `simulation-recordings/case/${correlationToken}.ogg`,
      ...(status !== 'PENDING' ? { egressId: `egress-${Date.now()}-${Math.random()}` } : {}),
    },
  })
  return { student, headers, attempt, recording }
}

describe('GET /api/simulation-attempts/:id/recording (default include_url=false)', () => {
  it('returns 404 when attempt has no recording', async () => {
    const { student, headers } = await loginAsStudent(app, prisma, { creditBalance: 10 })
    const simulation = await makeSimulation(prisma)
    const attempt = await prisma.simulationAttempt.create({
      data: {
        studentId: student.id,
        simulationId: simulation.id,
        startedAt: new Date(),
        correlationToken: `no_rec_${Date.now()}`,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
      headers,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns status only when recording is PENDING (no URL by default)', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('PENDING')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'PENDING' })
    expect(body.url).toBeUndefined()
  })

  it('returns status only when recording is READY (does not presign by default)', async () => {
    const s3 = await import('../../shared/s3')
    const presignMock = vi.mocked(s3.presignDownloadUrl)
    presignMock.mockClear()

    const { attempt, headers } = await makeAttemptWithRecording('READY')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'READY' })
    expect(body.url).toBeUndefined()
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('returns status only when recording is FAILED', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('FAILED')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'FAILED' })
    expect(body.url).toBeUndefined()
  })
})

describe('GET /api/simulation-attempts/:id/recording?include_url=false', () => {
  it('returns 404 when attempt has no recording', async () => {
    const { student, headers } = await loginAsStudent(app, prisma, { creditBalance: 10 })
    const simulation = await makeSimulation(prisma)
    const attempt = await prisma.simulationAttempt.create({
      data: {
        studentId: student.id,
        simulationId: simulation.id,
        startedAt: new Date(),
        correlationToken: `no_rec_iu_${Date.now()}`,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=false`,
      headers,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns status only when recording is PENDING (no URL field)', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('PENDING')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=false`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'PENDING' })
    expect(body.url).toBeUndefined()
  })

  it('returns status only when recording is READY (does not presign)', async () => {
    const s3 = await import('../../shared/s3')
    const presignMock = vi.mocked(s3.presignDownloadUrl)
    presignMock.mockClear()

    const { attempt, headers } = await makeAttemptWithRecording('READY')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=false`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'READY' })
    expect(body.url).toBeUndefined()
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('returns status only when recording is FAILED', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('FAILED')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=false`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ status: 'FAILED' })
    expect(body.url).toBeUndefined()
  })
})

describe('GET /api/simulation-attempts/:id/recording?include_url=true', () => {
  it('returns presigned URL when recording is READY', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('READY')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=true`,
      headers,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toContain('mock-s3.example.com')
    expect(body.status).toBe('READY')
  })

  it('returns 404 when recording is PENDING', async () => {
    const { attempt, headers } = await makeAttemptWithRecording('PENDING')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording?include_url=true`,
      headers,
    })
    expect(res.statusCode).toBe(404)
  })
})
