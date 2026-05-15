import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'
import { makeInstructor } from '../../../test/factories/instructor'

vi.mock('../../services/livekit-voice.service', () => ({
  livekitVoiceService: {
    createSession: vi.fn().mockResolvedValue({
      token: 'mock-lk-token',
      serverUrl: 'wss://mock.livekit.cloud',
      roomName: 'mock-room',
    }),
    endSession: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
  useVoiceAgentV2: vi.fn().mockReturnValue(true),
}))

vi.mock('../simulation-attempt/ai-feedback.service', () => ({
  createAIFeedbackService: vi.fn().mockReturnValue({
    generateFeedback: vi.fn().mockResolvedValue({
      feedback: {},
      score: 80,
      prompts: {},
      markingStructure: [],
    }),
  }),
  AIProvider: { GROQ: 'groq' },
}))

let app: FastifyInstance

async function makeInterviewSimulation(prisma: Parameters<typeof makeInstructor>[0]) {
  const { instructor } = await makeInstructor(prisma)
  const interview = await prisma.interview.create({
    data: {
      instructorId: instructor.id,
      title: 'Test Interview',
      slug: `test-interview-${Date.now()}`,
    },
  })
  const interviewCourse = await prisma.interviewCourse.create({
    data: {
      interviewId: interview.id,
      instructorId: instructor.id,
      title: 'Test Interview Course',
    },
  })
  const interviewCase = await prisma.interviewCase.create({
    data: {
      interviewCourseId: interviewCourse.id,
      title: 'Test Case',
      diagnosis: 'Test Diagnosis',
      patientName: 'Test Patient',
      patientAge: 40,
      patientGender: 'FEMALE',
      description: 'Test description',
      displayOrder: 1,
    },
  })
  const interviewSimulation = await prisma.interviewSimulation.create({
    data: {
      interviewCaseId: interviewCase.id,
      casePrompt: 'You are an interviewer.',
      openingLine: 'Tell me about yourself.',
      timeLimitMinutes: 15,
      voiceModel: 'VOICE_1',
    },
  })
  return { interviewSimulation }
}

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})

describe('Recording row creation when starting an interview simulation attempt', () => {
  it('creates a PENDING Recording row when student has recordingEnabled=true', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: true } })
    const { interviewSimulation } = await makeInterviewSimulation(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interview-simulation-attempts',
      payload: { studentId: student.id, interviewSimulationId: interviewSimulation.id },
    })

    expect(res.statusCode).toBe(201)
    const attempt = res.json().attempt
    const recording = await prisma.recording.findUnique({
      where: { attemptType_attemptId: { attemptType: 'INTERVIEW', attemptId: attempt.id } },
    })
    expect(recording).not.toBeNull()
    expect(recording!.status).toBe('PENDING')
    expect(recording!.s3Key).toContain('simulation-recordings/interview/')
    expect(recording!.s3Key).toContain('.ogg')
  })

  it('does not create a Recording row when student has recordingEnabled=false', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: false } })
    const { interviewSimulation } = await makeInterviewSimulation(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interview-simulation-attempts',
      payload: { studentId: student.id, interviewSimulationId: interviewSimulation.id },
    })

    expect(res.statusCode).toBe(201)
    const attempt = res.json().attempt
    const recording = await prisma.recording.findUnique({
      where: { attemptType_attemptId: { attemptType: 'INTERVIEW', attemptId: attempt.id } },
    })
    expect(recording).toBeNull()
  })
})
