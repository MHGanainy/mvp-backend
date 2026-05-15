import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'
import { makeCourse } from '../../../test/factories/course'

vi.mock('../../shared/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/s3')>()
  return {
    ...actual,
    presignRecordingDownload: vi.fn().mockResolvedValue({
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
  const { student } = await makeStudent(prisma, { creditBalance: 10 })
  const course = await makeCourse(prisma)
  const courseCase = await prisma.courseCase.create({
    data: {
      courseId: course.id,
      title: 'Recording Download Test',
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
  const correlationToken = `rec_dl_test_${Date.now()}`
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
      ...(status !== 'PENDING' ? { egressId: `egress-${Date.now()}` } : {}),
    },
  })
  return { student, attempt, recording }
}

describe('GET /api/simulation-attempts/:id/recording', () => {
  it('returns 404 when attempt has no recording', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    const course = await makeCourse(prisma)
    const courseCase = await prisma.courseCase.create({
      data: {
        courseId: course.id,
        title: 'No Recording Case',
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
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when recording is PENDING', async () => {
    const { attempt } = await makeAttemptWithRecording('PENDING')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns presigned URL when recording is READY', async () => {
    const { attempt } = await makeAttemptWithRecording('READY')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toContain('mock-s3.example.com')
    expect(body.expiresAt).toBeDefined()
    expect(body.status).toBe('READY')
  })

  it('returns 404 when recording is FAILED', async () => {
    const { attempt } = await makeAttemptWithRecording('FAILED')
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(404)
  })
})
