import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'
import { makeInstructor } from '../../../test/factories/instructor'

vi.mock('../../shared/s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/s3')>()
  return {
    ...actual,
    presignRecordingDownload: vi.fn().mockResolvedValue({
      url: 'https://mock-s3.example.com/interview-recording.ogg?signed=1',
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

async function makeInterviewAttemptWithRecording(status: 'PENDING' | 'READY' | 'FAILED' = 'READY') {
  const { student } = await makeStudent(prisma, { creditBalance: 10 })
  const { instructor } = await makeInstructor(prisma)
  const interview = await prisma.interview.create({
    data: {
      instructorId: instructor.id,
      title: 'Recording DL Test Interview',
      slug: `rec-dl-interview-${Date.now()}`,
    },
  })
  const interviewCourse = await prisma.interviewCourse.create({
    data: { interviewId: interview.id, instructorId: instructor.id, title: 'Test Course' },
  })
  const interviewCase = await prisma.interviewCase.create({
    data: {
      interviewCourseId: interviewCourse.id,
      title: 'Test Case',
      diagnosis: 'Diag',
      patientName: 'Pat',
      patientAge: 30,
      patientGender: 'MALE',
      description: 'Desc',
      displayOrder: 1,
    },
  })
  const interviewSimulation = await prisma.interviewSimulation.create({
    data: {
      interviewCaseId: interviewCase.id,
      casePrompt: 'prompt',
      openingLine: 'hello',
      timeLimitMinutes: 10,
      voiceModel: 'VOICE_1',
    },
  })
  const correlationToken = `irec_dl_${Date.now()}`
  const attempt = await prisma.interviewSimulationAttempt.create({
    data: {
      studentId: student.id,
      interviewSimulationId: interviewSimulation.id,
      startedAt: new Date(),
      correlationToken,
    },
  })
  const recording = await prisma.recording.create({
    data: {
      attemptType: 'INTERVIEW',
      attemptId: attempt.id,
      status,
      s3Key: `simulation-recordings/interview/${correlationToken}.ogg`,
      ...(status !== 'PENDING' ? { egressId: `iegress-${Date.now()}` } : {}),
    },
  })
  return { student, attempt, recording }
}

describe('GET /api/interview-simulation-attempts/:id/recording', () => {
  it('returns 404 when attempt has no recording', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    const { instructor } = await makeInstructor(prisma)
    const interview = await prisma.interview.create({
      data: {
        instructorId: instructor.id,
        title: 'No Rec Interview',
        slug: `no-rec-interview-${Date.now()}`,
      },
    })
    const interviewCourse = await prisma.interviewCourse.create({
      data: { interviewId: interview.id, instructorId: instructor.id, title: 'Course' },
    })
    const interviewCase = await prisma.interviewCase.create({
      data: {
        interviewCourseId: interviewCourse.id,
        title: 'Case',
        diagnosis: 'Diag',
        patientName: 'Pat',
        patientAge: 30,
        patientGender: 'MALE',
        description: 'Desc',
        displayOrder: 1,
      },
    })
    const interviewSimulation = await prisma.interviewSimulation.create({
      data: {
        interviewCaseId: interviewCase.id,
        casePrompt: 'prompt',
        openingLine: 'hello',
        timeLimitMinutes: 10,
        voiceModel: 'VOICE_1',
      },
    })
    const attempt = await prisma.interviewSimulationAttempt.create({
      data: {
        studentId: student.id,
        interviewSimulationId: interviewSimulation.id,
        startedAt: new Date(),
        correlationToken: `no_irec_${Date.now()}`,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/interview-simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when recording is PENDING', async () => {
    const { attempt } = await makeInterviewAttemptWithRecording('PENDING')
    const res = await app.inject({
      method: 'GET',
      url: `/api/interview-simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns presigned URL when recording is READY', async () => {
    const { attempt } = await makeInterviewAttemptWithRecording('READY')
    const res = await app.inject({
      method: 'GET',
      url: `/api/interview-simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toContain('mock-s3.example.com')
    expect(body.expiresAt).toBeDefined()
    expect(body.status).toBe('READY')
  })

  it('returns 404 when recording is FAILED', async () => {
    const { attempt } = await makeInterviewAttemptWithRecording('FAILED')
    const res = await app.inject({
      method: 'GET',
      url: `/api/interview-simulation-attempts/${attempt.id}/recording`,
    })
    expect(res.statusCode).toBe(404)
  })
})
