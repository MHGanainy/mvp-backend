import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import './shared/types'

// Add all imports
import authRoutes from './entities/auth/auth.routes'
import subscriptionRoutes from './entities/subscription/subscription.routes'
import specialtyRoutes from './entities/specialty/specialty.routes'
import curriculumRoutes from './entities/curriculum/curriculum.routes'
import markingDomainRoutes from './entities/marking-domain/marking-domain.routes'
import instructorRoutes from './entities/instructor/instructor.routes'
import studentRoutes from './entities/student/student.routes'
import examRoutes from './entities/exam/exam.routes'
import courseRoutes from './entities/course/course.routes'
import courseCaseRoutes from './entities/course-case/course-case.routes'
import caseTabRoutes from './entities/case-tab/case-tab.routes'  
import simulationRoutes from './entities/simulation/simulation.routes'
import simulationAttemptRoutes from './entities/simulation-attempt/simulation-attempt.routes'
import paymentRoutes from './entities/payment/payment.routes'
import markingCriterionRoutes from './entities/marking-criterion/marking-criterion.routes'
import billingRoutes from './entities/billing/billing.routes'

const fastify = Fastify({ logger: true })
const prisma = new PrismaClient()

// Register prisma on fastify instance
fastify.decorate('prisma', prisma)

// Register JWT plugin
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
fastify.register(fastifyJwt, {
  secret: JWT_SECRET,
  sign: {
    expiresIn: '1h'
  }
})

// Register CORS plugin - Allow ALL origins
fastify.register(fastifyCors, {
  origin: true, // This allows ALL origins
  credentials: true, // Allow cookies/credentials
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] // Allowed methods
})

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
      // Register auth routes FIRST (no prefix needed)
      await fastify.register(authRoutes, { prefix: '/api' })
      
      // Register subscription routes (also at root level for easier access)
      await fastify.register(subscriptionRoutes, { prefix: '/api' })
      
      // Register all other route sets
      await fastify.register(specialtyRoutes, { prefix: '/api' })
      await fastify.register(curriculumRoutes, { prefix: '/api' })
      await fastify.register(markingDomainRoutes, { prefix: '/api' })
      await fastify.register(instructorRoutes, { prefix: '/api' })
      await fastify.register(studentRoutes, { prefix: '/api' })
      await fastify.register(examRoutes, { prefix: '/api' })
      await fastify.register(courseRoutes, { prefix: '/api' })
      await fastify.register(courseCaseRoutes, { prefix: '/api' })
      await fastify.register(caseTabRoutes, { prefix: '/api' })  
      await fastify.register(simulationRoutes, { prefix: '/api' })
      await fastify.register(simulationAttemptRoutes, { prefix: '/api' })
      await fastify.register(paymentRoutes, { prefix: '/api' })
      await fastify.register(markingCriterionRoutes, { prefix: '/api' })
      await fastify.register(billingRoutes, { prefix: '/api' })
      const port = Number(process.env.PORT) || 3000
      const host = process.env.HOST || '0.0.0.0'
      
      await fastify.listen({ port, host })
      console.log(`🚀 Server running on ${host}:${port}`)
      console.log(`🔐 JWT authentication enabled`)
      console.log(`🌐 CORS enabled for ALL origins`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  
  start()