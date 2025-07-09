import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import './shared/types'

// Add all imports
import specialtyRoutes from './entities/specialty/specialty.routes'
import curriculumRoutes from './entities/curriculum/curriculum.routes'
import markingDomainRoutes from './entities/marking-domain/marking-domain.routes'
import instructorRoutes from './entities/instructor/instructor.routes'
import studentRoutes from './entities/student/student.routes'
import examRoutes from './entities/exam/exam.routes'
import courseRoutes from './entities/course/course.routes'
import courseCaseRoutes from './entities/course-case/course-case.routes'
import simulationRoutes from './entities/simulation/simulation.routes'
import simulationAttemptRoutes from './entities/simulation-attempt/simulation-attempt.routes'

const fastify = Fastify({ logger: true })
const prisma = new PrismaClient()

// Register prisma on fastify instance
fastify.decorate('prisma', prisma)

// Health check
fastify.get('/health', async () => {
  return { status: 'OK', timestamp: new Date().toISOString() }
})

// Clean User routes
fastify.get('/users', async () => {
  const users = await prisma.user.findMany({
    include: { 
      instructor: true,
      student: true
    }
  })
  return users
})

fastify.post('/users', async (request) => {
  const { email, name } = request.body as { email: string; name?: string }
  
  const user = await prisma.user.create({
    data: { email, name }
  })
  return user
})

fastify.get('/users/:id', async (request) => {
  const { id } = request.params as { id: string }
  
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    include: { 
      instructor: true,
      student: true
    }
  })
  
  if (!user) {
    throw new Error('User not found')
  }
  
  return user
})

// Start server
const start = async () => {
    try {
      // Register all route sets
      await fastify.register(specialtyRoutes, { prefix: '/api' })
      await fastify.register(curriculumRoutes, { prefix: '/api' })
      await fastify.register(markingDomainRoutes, { prefix: '/api' })
      await fastify.register(instructorRoutes, { prefix: '/api' })
      await fastify.register(studentRoutes, { prefix: '/api' })
      await fastify.register(examRoutes, { prefix: '/api' })
      await fastify.register(courseRoutes, { prefix: '/api' })
      await fastify.register(courseCaseRoutes, { prefix: '/api' })
      await fastify.register(simulationRoutes, { prefix: '/api' })
      await fastify.register(simulationAttemptRoutes, { prefix: '/api' })
      
      const port = Number(process.env.PORT) || 3000
      const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
      
      await fastify.listen({ port, host })
      console.log(`🚀 Server running on ${host}:${port}`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  
  start()