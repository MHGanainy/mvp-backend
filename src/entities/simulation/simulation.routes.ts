// src/entities/simulation/simulation.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SimulationService } from './simulation.service'
import { CourseCaseService } from '../course-case/course-case.service'
import { CourseService } from '../course/course.service'
import { 
  createSimulationSchema, 
  updateSimulationSchema, 
  simulationParamsSchema,
  simulationCourseCaseParamsSchema,
  VoiceModelEnum
} from './simulation.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

const creditCostUpdateSchema = z.object({
  creditCost: z.number().int().min(1).max(10)
})

const timeLimitUpdateSchema = z.object({
  timeLimitMinutes: z.number().int().min(1).max(120),
  warningTimeMinutes: z.number().int().min(1).optional()
})

const voiceModelParamsSchema = z.object({
  voiceModel: VoiceModelEnum
})

const creditCostParamsSchema = z.object({
  creditCost: z.string().transform(val => parseInt(val)).refine(val => val >= 1 && val <= 10, 'Invalid credit cost')
})

const courseIdParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID')
})

export default async function simulationRoutes(fastify: FastifyInstance) {
  const simulationService = new SimulationService(fastify.prisma)
  const courseCaseService = new CourseCaseService(fastify.prisma)
  const courseService = new CourseService(fastify.prisma)

  // GET /simulations - Get all simulations (PUBLIC)
  fastify.get('/simulations', async (request, reply) => {
    try {
      const simulations = await simulationService.findAll()
      reply.send(simulations)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch simulations' })
    }
  })

  // GET /simulations/course-case/:courseCaseId - Get simulation by course case (PUBLIC)
  fastify.get('/simulations/course-case/:courseCaseId', async (request, reply) => {
    try {
      const { courseCaseId } = simulationCourseCaseParamsSchema.parse(request.params)
      const simulation = await simulationService.findByCourseCaseId(courseCaseId)
      reply.send(simulation)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'No simulation configured for this course case') {
          reply.status(404).send({ error: 'No simulation configured for this course case' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /simulations/course/:courseId - Get simulations by course (PUBLIC)
  fastify.get('/simulations/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseIdParamsSchema.parse(request.params)
      const simulations = await simulationService.findByCourse(courseId)
      reply.send(simulations)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /simulations/voice-model/:voiceModel - Get simulations by voice model (PUBLIC)
  fastify.get('/simulations/voice-model/:voiceModel', async (request, reply) => {
    try {
      const { voiceModel } = voiceModelParamsSchema.parse(request.params)
      const simulations = await simulationService.findByVoiceModel(voiceModel)
      reply.send(simulations)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid voice model' })
    }
  })

  // GET /simulations/credit-cost/:creditCost - Get simulations by credit cost (PUBLIC)
  fastify.get('/simulations/credit-cost/:creditCost', async (request, reply) => {
    try {
      const { creditCost } = creditCostParamsSchema.parse(request.params)
      const simulations = await simulationService.findByCreditCost(creditCost)
      reply.send(simulations)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid credit cost' })
    }
  })

  // GET /simulations/stats - Get simulation statistics (PUBLIC)
  fastify.get('/simulations/stats', async (request, reply) => {
    try {
      const stats = await simulationService.getSimulationStats()
      reply.send(stats)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch simulation statistics' })
    }
  })

  // GET /simulations/stats/course/:courseId - Get simulation statistics for specific course (PUBLIC)
  fastify.get('/simulations/stats/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseIdParamsSchema.parse(request.params)
      const stats = await simulationService.getSimulationStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /simulations/:id - Get simulation by ID (PUBLIC)
  fastify.get('/simulations/:id', async (request, reply) => {
    try {
      const { id } = simulationParamsSchema.parse(request.params)
      const simulation = await simulationService.findById(id)
      reply.send(simulation)
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation not found') {
        reply.status(404).send({ error: 'Simulation not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /simulations - Create new simulation
  fastify.post('/simulations', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createSimulationSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(data.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create simulations for your own course cases' })
          return
        }
      }
      
      const simulation = await simulationService.create(data)
      reply.status(201).send(simulation)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'This course case already has a simulation configured') {
          reply.status(400).send({ error: 'This course case already has a simulation configured' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /simulations/:id - Update simulation
  fastify.put('/simulations/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = simulationParamsSchema.parse(request.params)
      const data = updateSimulationSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const simulation = await simulationService.findById(id)
        const courseCase = await courseCaseService.findById(simulation.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update simulations for your own course cases' })
          return
        }
      }
      
      const simulation = await simulationService.update(id, data)
      reply.send(simulation)
    } catch (error) {
      if (error instanceof Error && error.message === 'Simulation not found') {
        reply.status(404).send({ error: 'Simulation not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /simulations/:id/credit-cost - Update simulation credit cost
  fastify.patch('/simulations/:id/credit-cost', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = simulationParamsSchema.parse(request.params)
      const { creditCost } = creditCostUpdateSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const simulation = await simulationService.findById(id)
        const courseCase = await courseCaseService.findById(simulation.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update simulations for your own course cases' })
          return
        }
      }
      
      const simulation = await simulationService.updateCreditCost(id, creditCost)
      reply.send({
        message: `Credit cost updated to ${creditCost} successfully`,
        simulation
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Simulation not found') {
          reply.status(404).send({ error: 'Simulation not found' })
        } else if (error.message.includes('Credit cost must be')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /simulations/:id/time-limit - Update simulation time limit
  fastify.patch('/simulations/:id/time-limit', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = simulationParamsSchema.parse(request.params)
      const { timeLimitMinutes, warningTimeMinutes } = timeLimitUpdateSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const simulation = await simulationService.findById(id)
        const courseCase = await courseCaseService.findById(simulation.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update simulations for your own course cases' })
          return
        }
      }
      
      const simulation = await simulationService.updateTimeLimit(id, timeLimitMinutes, warningTimeMinutes)
      reply.send({
        message: `Time limit updated to ${timeLimitMinutes} minutes successfully`,
        simulation
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Simulation not found') {
          reply.status(404).send({ error: 'Simulation not found' })
        } else if (error.message.includes('Time limit must be') || error.message.includes('Warning time must be')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /simulations/:id - Delete simulation
  fastify.delete('/simulations/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = simulationParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const simulation = await simulationService.findById(id)
        const courseCase = await courseCaseService.findById(simulation.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete simulations for your own course cases' })
          return
        }
      }
      
      await simulationService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Simulation not found') {
          reply.status(404).send({ error: 'Simulation not found' })
        } else if (error.message === 'Cannot delete simulation with existing student attempts') {
          reply.status(400).send({ error: 'Cannot delete simulation with existing student attempts' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })
}