import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'
import { makeCourse } from '../../../test/factories/course'

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

vi.mock('../../services/transcript-processor.service', () => ({
  TranscriptProcessorService: {
    transformToCleanFormat: vi.fn().mockReturnValue({
      messages: [],
      duration: 0,
      totalMessages: 0,
    }),
  },
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

async function makeSimulation(prisma: Parameters<typeof makeCourse>[0]) {
  const course = await makeCourse(prisma)
  const courseCase = await prisma.courseCase.create({
    data: {
      courseId: course.id,
      title: 'Test Case',
      diagnosis: 'Test Diagnosis',
      patientName: 'Test Patient',
      patientAge: 45,
      patientGender: 'MALE',
      description: 'Test description',
      isFree: false,
      isActive: true,
      displayOrder: 1,
    },
  })
  const simulation = await prisma.simulation.create({
    data: {
      courseCaseId: courseCase.id,
      casePrompt: 'You are a patient.',
      openingLine: 'Hello doctor.',
      timeLimitMinutes: 10,
      voiceModel: 'VOICE_1',
    },
  })
  return { course, courseCase, simulation }
}

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})

describe('Recording row creation when starting a simulation attempt', () => {
  it('creates a PENDING Recording row when student has recordingEnabled=true and voice-agent v2 is active', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: true } })
    const { simulation } = await makeSimulation(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation-attempts',
      payload: { studentId: student.id, simulationId: simulation.id },
    })

    expect(res.statusCode).toBe(201)
    const attempt = res.json().attempt
    const recording = await prisma.recording.findUnique({
      where: { attemptType_attemptId: { attemptType: 'CASE', attemptId: attempt.id } },
    })
    expect(recording).not.toBeNull()
    expect(recording!.status).toBe('PENDING')
    expect(recording!.s3Key).toContain('simulation-recordings/case/')
    expect(recording!.s3Key).toContain('.ogg')
  })

  it('does not create a Recording row when student has recordingEnabled=false', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: false } })
    const { simulation } = await makeSimulation(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation-attempts',
      payload: { studentId: student.id, simulationId: simulation.id },
    })

    expect(res.statusCode).toBe(201)
    const attempt = res.json().attempt
    const recording = await prisma.recording.findUnique({
      where: { attemptType_attemptId: { attemptType: 'CASE', attemptId: attempt.id } },
    })
    expect(recording).toBeNull()
  })

  it('the Recording s3Key uses the correlationToken as filename', async () => {
    const { student } = await makeStudent(prisma, { creditBalance: 10 })
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: true } })
    const { simulation } = await makeSimulation(prisma)

    const res = await app.inject({
      method: 'POST',
      url: '/api/simulation-attempts',
      payload: { studentId: student.id, simulationId: simulation.id },
    })

    const attempt = res.json().attempt
    const correlationToken = attempt.voiceAssistantConfig?.correlationToken
    const recording = await prisma.recording.findUnique({
      where: { attemptType_attemptId: { attemptType: 'CASE', attemptId: attempt.id } },
    })
    expect(recording!.s3Key).toBe(`simulation-recordings/case/${correlationToken}.ogg`)
  })
})
