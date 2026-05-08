import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StudentService } from './student.service'
import {
  createStudentSchema,
  updateStudentSchema,
  studentUserParamsSchema
} from './student.schema'
import { replyInternalError } from '../../shared/route-error'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'

const studentListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['joinedAt', 'simulationCount', 'creditBalance']).default('joinedAt'),
  paid: z.coerce.boolean().optional(),
  examId: z.string().uuid().optional(),
})

// Credit operation schemas
const creditOperationSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().optional()
})

// Schema for setting credits (allows 0 to reset)
const setCreditSchema = z.object({
  amount: z.number().min(0, 'Amount cannot be negative'),
  reason: z.string().optional()
})

export default async function studentRoutes(fastify: FastifyInstance) {
  const studentService = new StudentService(fastify.prisma)

  // GET /students - Get all students with search + pagination (admin only)
  fastify.get('/students', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Admin access required' })
    }
    try {
      const query = studentListQuerySchema.parse(request.query)
      const result = await studentService.findAll(query)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch students')
    }
  })

  // GET /students/admin/:studentId - Get student by UUID (admin only)
  fastify.get('/students/admin/:studentId', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Admin access required' })
    }
    try {
      const { studentId } = request.params as { studentId: string }
      const student = await studentService.findById(studentId)
      reply.send(student)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /students/:userId - Get student by User ID
  fastify.get('/students/:userId', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const student = await studentService.findByUserId(userId)
      reply.send(student)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /students - Create new student (creates User + Student)
  fastify.post('/students', async (request, reply) => {
    try {
      const data = createStudentSchema.parse(request.body)
      const student = await studentService.create(data)
      reply.status(201).send(student)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint failed')) {
        reply.status(400).send({ error: 'Email already exists' })
      } else {
        reply.status(400).send({ error: 'Invalid data' })
      }
    }
  })

  // PUT /students/:userId - Update student by User ID
  fastify.put('/students/:userId', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const data = updateStudentSchema.parse(request.body)
      
      // Get student by userId first to get the UUID for update
      const existingStudent = await studentService.findByUserId(userId)
      const student = await studentService.update(existingStudent.id, data)
      reply.send(student)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /students/:userId - Delete student by User ID
  fastify.delete('/students/:userId', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      
      // Get student by userId first to get the UUID for deletion
      const existingStudent = await studentService.findByUserId(userId)
      await studentService.delete(existingStudent.id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // CREDIT MANAGEMENT ENDPOINTS

  // GET /students/:userId/credits - Get credit balance
  fastify.get('/students/:userId/credits', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const balance = await studentService.getCreditBalance(userId)
      reply.send({ userId, creditBalance: balance })
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /students/:userId/credits/add - Add credits
  fastify.post('/students/:userId/credits/add', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const { amount, reason } = creditOperationSchema.parse(request.body)
      
      const student = await studentService.addCredits(userId, amount, reason)
      reply.send({
        message: 'Credits added successfully',
        student,
        operation: {
          type: 'credit',
          amount,
          reason: reason || 'Manual credit addition'
        }
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: error instanceof Error ? error.message : 'Invalid request' })
      }
    }
  })

  // POST /students/:userId/credits/deduct - Deduct credits
  fastify.post('/students/:userId/credits/deduct', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const { amount, reason } = creditOperationSchema.parse(request.body)
      
      const student = await studentService.deductCredits(userId, amount, reason)
      reply.send({
        message: 'Credits deducted successfully',
        student,
        operation: {
          type: 'debit',
          amount,
          reason: reason || 'Manual credit deduction'
        }
      })
    } catch (error) {
      if (error instanceof Error && (error.message === 'Student not found' || error.message === 'Insufficient credits')) {
        const status = error.message === 'Student not found' ? 404 : 400
        reply.status(status).send({ error: error.message })
      } else {
        reply.status(400).send({ error: error instanceof Error ? error.message : 'Invalid request' })
      }
    }
  })

  // NEW ENDPOINT: PUT /students/:userId/credits - Set credit balance to specific value
  fastify.put('/students/:userId/credits', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const { amount, reason } = setCreditSchema.parse(request.body)
      
      const student = await studentService.setCredits(userId, amount, reason)
      reply.send({
        message: 'Credits set successfully',
        student,
        operation: {
          type: 'set',
          amount,
          reason: reason || 'Manual credit balance update'
        }
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: error instanceof Error ? error.message : 'Invalid request' })
      }
    }
  })

  // GET /students/:userId/credits/check/:amount - Check if student has sufficient credits
  fastify.get('/students/:userId/credits/check/:amount', async (request, reply) => {
    try {
      const { userId } = studentUserParamsSchema.parse(request.params)
      const { amount } = request.params as { amount: string }
      const requiredAmount = parseInt(amount)

      if (isNaN(requiredAmount) || requiredAmount <= 0) {
        return reply.status(400).send({ error: 'Invalid amount' })
      }

      const hasSufficientCredits = await studentService.checkSufficientCredits(userId, requiredAmount)
      const currentBalance = await studentService.getCreditBalance(userId)

      reply.send({
        userId,
        requiredAmount,
        currentBalance,
        hasSufficientCredits,
        shortfall: hasSufficientCredits ? 0 : requiredAmount - currentBalance
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /students/:studentId/quick-access - Get quick access data (recent exams and courses)
  fastify.get('/students/:studentId/quick-access', async (request, reply) => {
    try {
      const { studentId } = request.params as { studentId: string }

      // Validate UUID format
      if (!studentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
        return reply.status(400).send({ error: 'Invalid student ID' })
      }

      const quickAccess = await studentService.getQuickAccess(studentId)
      reply.send(quickAccess)
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        reply.status(404).send({ error: 'Student not found' })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch quick access data')
      }
    }
  })
}