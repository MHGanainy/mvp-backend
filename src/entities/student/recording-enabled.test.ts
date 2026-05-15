import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildTestApp } from '../../../test/helpers/build-test-app'
import { prisma } from '../../../test/helpers/db'
import { makeStudent } from '../../../test/factories/student'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})

describe('recordingEnabled on student', () => {
  it('defaults to true for new students', async () => {
    const { student } = await makeStudent(prisma)
    expect(student.recordingEnabled).toBe(true)
  })

  it('PUT /api/students/:userId can set recordingEnabled to false', async () => {
    const { student } = await makeStudent(prisma)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/students/${student.userId}`,
      payload: { recordingEnabled: false },
    })
    expect(res.statusCode).toBe(200)
    const updated = await prisma.student.findUnique({ where: { id: student.id } })
    expect(updated!.recordingEnabled).toBe(false)
  })

  it('PUT /api/students/:userId can set recordingEnabled back to true', async () => {
    const { student } = await makeStudent(prisma)
    await prisma.student.update({ where: { id: student.id }, data: { recordingEnabled: false } })
    const res = await app.inject({
      method: 'PUT',
      url: `/api/students/${student.userId}`,
      payload: { recordingEnabled: true },
    })
    expect(res.statusCode).toBe(200)
    const updated = await prisma.student.findUnique({ where: { id: student.id } })
    expect(updated!.recordingEnabled).toBe(true)
  })

  it('GET /api/students/:userId includes recordingEnabled in response', async () => {
    const { student } = await makeStudent(prisma)
    const res = await app.inject({
      method: 'GET',
      url: `/api/students/${student.userId}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('recordingEnabled')
  })
})
