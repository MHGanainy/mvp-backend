// src/entities/auth/auth.routes.ts
import { FastifyInstance } from 'fastify'
import { AuthService } from './auth.service'
import { 
  loginSchema, 
  refreshTokenSchema,
  registerStudentSchema,
  registerInstructorSchema
} from './auth.schema'

export default async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.prisma, fastify)

  // POST /auth/register/student - Student registration
  fastify.post('/auth/register/student', async (request, reply) => {
    try {
      const data = registerStudentSchema.parse(request.body)
      const result = await authService.registerStudent(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email already registered') {
          reply.status(400).send({ error: 'Email already registered' })
        } else {
          reply.status(400).send({ error: 'Invalid registration data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /auth/register/instructor - Instructor registration
  fastify.post('/auth/register/instructor', async (request, reply) => {
    try {
      const data = registerInstructorSchema.parse(request.body)
      const result = await authService.registerInstructor(data)
      reply.status(201).send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email already registered') {
          reply.status(400).send({ error: 'Email already registered' })
        } else {
          reply.status(400).send({ error: 'Invalid registration data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /auth/login - Login endpoint
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const data = loginSchema.parse(request.body)
      const result = await authService.login(data)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid credentials' || 
            error.message === 'User is not a student' || 
            error.message === 'User is not an instructor') {
          reply.status(401).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid login data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /auth/refresh - Refresh token endpoint
  fastify.post('/auth/refresh', async (request, reply) => {
    try {
      const data = refreshTokenSchema.parse(request.body)
      const result = await authService.refreshToken(data.refreshToken)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid refresh token') {
        reply.status(401).send({ error: 'Invalid refresh token' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /auth/me - Get current user (requires authentication) - UPDATED
  // This is CORRECT - keep this implementation
  fastify.get('/auth/me', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  }, async (request, reply) => {
    try {
      // Get info from JWT token
      const userId = (request.user as any).userId
      const role = (request.user as any).role as 'student' | 'instructor'
      const isAdmin = (request.user as any).isAdmin || false
      
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        include: {
          student: true,
          instructor: true
        }
      })
  
      if (!user) {
        reply.status(404).send({ error: 'User not found' })
        return
      }
  
      // Build profile based on role from JWT
      let profile
      if (role === 'student' && user.student) {
        profile = {
          id: user.student.id,
          firstName: user.student.firstName,
          lastName: user.student.lastName,
          creditBalance: isAdmin ? 999999 : user.student.creditBalance
        }
      } else if (role === 'instructor' && user.instructor) {
        profile = {
          id: user.instructor.id,
          firstName: user.instructor.firstName,
          lastName: user.instructor.lastName,
          bio: user.instructor.bio
        }
      } else {
        reply.status(500).send({ error: 'Profile not found for user role' })
        return
      }
  
      // Return structure matching old version - everything inside user
      reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: role,        // ✓ Role INSIDE user
          isAdmin: isAdmin,  // ✓ isAdmin INSIDE user  
          profile
        }
      })
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch user information' })
    }
  })

  // POST /auth/logout - Logout endpoint (optional, mainly for client-side token removal)
  fastify.post('/auth/logout', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  }, async (request, reply) => {
    // In a stateless JWT system, logout is handled client-side
    // You could implement token blacklisting here if needed
    reply.send({ message: 'Logged out successfully' })
  })
}