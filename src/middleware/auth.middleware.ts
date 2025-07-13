import { FastifyRequest, FastifyReply } from 'fastify'
import { JWTPayload } from '../entities/auth/auth.schema'

// Extend FastifyJWT interface
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

// Add custom properties to FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    role?: 'student' | 'instructor'
  }
}

// Auth middleware - verifies JWT and attaches user to request
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    
    // The JWT payload is automatically attached to request.user by fastify-jwt
    const user = request.user as JWTPayload
    request.role = user.role // Changed from user.userType to user.role
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

// Role-based middleware - checks if user has required role
export function requireRole(role: 'student' | 'instructor') {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as JWTPayload | undefined
    
    if (!user) {
      reply.status(401).send({ error: 'Unauthorized' })
      return
    }

    if (request.role !== role) {
      reply.status(403).send({ error: `Access denied. ${role} role required.` })
      return
    }
  }
}

// Combined auth middleware that requires authentication and specific role
export function requireAuth(role?: 'student' | 'instructor') {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // First authenticate
    await authenticate(request, reply)
    
    // If authentication passed and role is specified, check role
    if (role && request.user) {
      await requireRole(role)(request, reply)
    }
  }
}

// Optional auth middleware - attaches user if token is valid, but doesn't fail if not
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const user = request.user as JWTPayload
    request.role = user.role // Changed from user.userType to user.role
  } catch (err) {
    // Don't fail, just continue without user
    request.role = undefined
  }
}

// Helper to get current user ID
export function getCurrentUserId(request: FastifyRequest): number | null {
  const user = request.user as JWTPayload | undefined
  return user?.userId || null
}

// Helper to get current student ID
export function getCurrentStudentId(request: FastifyRequest): string | null {
  const user = request.user as JWTPayload | undefined
  if (request.role === 'student' && user?.studentId) {
    return user.studentId
  }
  return null
}

// Helper to get current instructor ID
export function getCurrentInstructorId(request: FastifyRequest): string | null {
  const user = request.user as JWTPayload | undefined
  if (request.role === 'instructor' && user?.instructorId) {
    return user.instructorId
  }
  return null
}