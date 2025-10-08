// src/middleware/auth.middleware.ts
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
    isAdmin?: boolean
  }
}

// Auth middleware - verifies JWT and attaches user to request
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    
    // The JWT payload is automatically attached to request.user by fastify-jwt
    const user = request.user as JWTPayload
    request.role = user.role
    request.isAdmin = user.isAdmin || false // ADD THIS
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

    // Admin bypasses all role checks
    if (request.isAdmin) {
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
    request.role = user.role
    request.isAdmin = user.isAdmin || false // ADD THIS
  } catch (err) {
    // Don't fail, just continue without user
    request.role = undefined
    request.isAdmin = undefined
  }
}

// Helper to check if user is admin - NEW
export function isAdmin(request: FastifyRequest): boolean {
  return request.isAdmin === true
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

// Helper to check if user can access instructor resources - NEW
export function canAccessInstructorResource(request: FastifyRequest, instructorId: string): boolean {
  // Admin can access everything
  if (request.isAdmin) {
    return true
  }
  // Otherwise check if it's the instructor's own resource
  return getCurrentInstructorId(request) === instructorId
}

// Helper to check if user can access student resources - NEW
export function canAccessStudentResource(request: FastifyRequest, studentId: string): boolean {
  // Admin can access everything
  if (request.isAdmin) {
    return true
  }
  // Otherwise check if it's the student's own resource
  return getCurrentStudentId(request) === studentId
}

// Helper to check if user can modify exam - NEW
export function canModifyExam(request: FastifyRequest, examInstructorId: string): boolean {
  // Admin can modify any exam
  if (request.isAdmin) {
    return true
  }
  // Otherwise check if it's the instructor's own exam
  return getCurrentInstructorId(request) === examInstructorId
}

// Helper to check if user can access course - NEW
export function canAccessCourse(request: FastifyRequest, courseInstructorId: string): boolean {
  // Admin can access any course
  if (request.isAdmin) {
    return true
  }
  // Otherwise check if it's the instructor's own course
  return getCurrentInstructorId(request) === courseInstructorId
}

// Helper to check if user needs to pay for resources - NEW
export function requiresPayment(request: FastifyRequest): boolean {
  // Admin never needs to pay
  if (request.isAdmin) {
    return false
  }
  // Everyone else needs to pay
  return true
}

// Helper to get effective credit balance - NEW
export function getEffectiveCreditBalance(request: FastifyRequest, actualBalance: number): number {
  // Admin always has unlimited credits
  if (request.isAdmin) {
    return 999999
  }
  return actualBalance
}