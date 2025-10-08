// src/entities/auth/auth.service.ts
import { PrismaClient, Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { 
  LoginInput, 
  JWTPayload, 
  RegisterStudentInput, 
  RegisterInstructorInput 
} from './auth.schema'

export class AuthService {
  private fastify: FastifyInstance
  
  constructor(private prisma: PrismaClient, fastify: FastifyInstance) {
    this.fastify = fastify
  }

  // Student Registration
  async registerStudent(data: RegisterStudentInput) {
    // Normalize email to lowercase
    const normalizedEmail = data.email.toLowerCase().trim()
    
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      throw new Error('Email already registered')
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password)

    // Create user and student profile in transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create user with normalized email
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: data.name || `${data.firstName} ${data.lastName}`,
          passwordHash,
          emailVerified: true // Always true in simplified flow
        }
      })

      // Create student profile with 100 complimentary credits
      // Note: dateOfBirth is removed from the model
      const student = await tx.student.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          creditBalance: 100 // 100 complimentary credits on registration
        }
      })

      // Create a credit transaction record for the complimentary credits
      await tx.creditTransaction.create({
        data: {
          studentId: student.id,
          transactionType: 'CREDIT',
          amount: 100,
          balanceAfter: 100,
          sourceType: 'MANUAL',
          description: 'Welcome bonus - 100 complimentary credits'
        }
      })

      return { user, student }
    })

    // Generate tokens for auto-login
    const payload: JWTPayload = {
      userId: result.user.id,
      role: 'student',
      email: result.user.email,
      isAdmin: false,
      studentId: result.student.id
    }

    const accessToken = await this.generateAccessToken(payload)
    const refreshToken = await this.generateRefreshToken(payload)

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: 'student',
      isAdmin: false,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isAdmin: false,
        profile: {
          id: result.student.id,
          firstName: result.student.firstName,
          lastName: result.student.lastName,
          creditBalance: result.student.creditBalance
        }
      }
    }
  }

  // Instructor Registration
  async registerInstructor(data: RegisterInstructorInput) {
    // Normalize email to lowercase
    const normalizedEmail = data.email.toLowerCase().trim()
    
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      throw new Error('Email already registered')
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password)

    // Create user and instructor profile in transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create user with normalized email
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: data.name || `${data.firstName} ${data.lastName}`,
          passwordHash,
          emailVerified: true // Always true in simplified flow
        }
      })

      // Create instructor profile
      const instructor = await tx.instructor.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          bio: data.bio
        }
      })

      return { user, instructor }
    })

    // Generate tokens for auto-login
    const payload: JWTPayload = {
      userId: result.user.id,
      role: 'instructor',
      email: result.user.email,
      isAdmin: false,
      instructorId: result.instructor.id
    }

    const accessToken = await this.generateAccessToken(payload)
    const refreshToken = await this.generateRefreshToken(payload)

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: 'instructor',
      isAdmin: false,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isAdmin: false,
        profile: {
          id: result.instructor.id,
          firstName: result.instructor.firstName,
          lastName: result.instructor.lastName,
          bio: result.instructor.bio
        }
      }
    }
  }

  async login(data: LoginInput) {
    // Normalize email to lowercase for consistent comparison
    const normalizedEmail = data.email.toLowerCase().trim()
    
    // Find user by normalized email
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        student: true,
        instructor: true
      }
    })

    if (!user) {
      throw new Error('Invalid credentials')
    }

    // Special handling for admin user
    if (user.isAdmin) {
      // Admin can login as either role - create profile if needed
      if (data.userType === 'student') {
        if (!user.student) {
          // Create student profile for admin on first student login
          const adminStudent = await this.prisma.student.create({
            data: {
              userId: user.id,
              firstName: 'Admin',
              lastName: 'User',
              creditBalance: 999999 // Unlimited credits
            }
          })
          user.student = adminStudent
        }
      } else if (data.userType === 'instructor') {
        if (!user.instructor) {
          // Create instructor profile for admin on first instructor login
          const adminInstructor = await this.prisma.instructor.create({
            data: {
              userId: user.id,
              firstName: 'Admin',
              lastName: 'User',
              bio: 'System Administrator with full access'
            }
          })
          user.instructor = adminInstructor
        }
      }
    } else {
      // Regular users must have the correct profile type
      if (data.userType === 'student' && !user.student) {
        throw new Error('User is not a student')
      }
      if (data.userType === 'instructor' && !user.instructor) {
        throw new Error('User is not an instructor')
      }
    }

    // Verify password
    if (!user.passwordHash) {
      throw new Error('Invalid credentials')
    }

    const isValidPassword = await this.comparePassword(data.password, user.passwordHash)
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials')
    }

    // Generate tokens - include isAdmin flag
    const payload: JWTPayload = {
      userId: user.id,
      role: data.userType, // Use the requested role, not 'admin'
      email: user.email,
      isAdmin: user.isAdmin || false,
      studentId: user.student?.id,
      instructorId: user.instructor?.id
    }

    const accessToken = await this.generateAccessToken(payload)
    const refreshToken = await this.generateRefreshToken(payload)

    // Get profile based on user type
    const profile = data.userType === 'student' ? {
      id: user.student!.id,
      firstName: user.student!.firstName,
      lastName: user.student!.lastName,
      creditBalance: user.isAdmin ? 999999 : user.student!.creditBalance // Show unlimited for admin
    } : {
      id: user.instructor!.id,
      firstName: user.instructor!.firstName,
      lastName: user.instructor!.lastName,
      bio: user.instructor!.bio
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: data.userType,
      isAdmin: user.isAdmin || false,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin || false,
        profile
      }
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = await this.fastify.jwt.verify(refreshToken) as JWTPayload
      
      // Check if user still exists
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          student: true,
          instructor: true
        }
      })

      if (!user) {
        throw new Error('User not found')
      }

      // Preserve isAdmin flag in new token
      const newPayload: JWTPayload = {
        ...decoded,
        isAdmin: user.isAdmin || false // Ensure current isAdmin status
      }

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(newPayload)
      
      return {
        accessToken: newAccessToken,
        expiresIn: 3600
      }
    } catch (error) {
      throw new Error('Invalid refresh token')
    }
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = await this.fastify.jwt.verify(token) as JWTPayload
      return decoded
    } catch (error) {
      throw new Error('Invalid token')
    }
  }

  private async generateAccessToken(payload: JWTPayload): Promise<string> {
    return this.fastify.jwt.sign(payload, {
      expiresIn: '1h'
    })
  }

  private async generateRefreshToken(payload: JWTPayload): Promise<string> {
    return this.fastify.jwt.sign(payload, {
      expiresIn: '7d'
    })
  }

  // Password hashing utilities
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10
    return bcrypt.hash(password, saltRounds)
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }
}