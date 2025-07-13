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
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email }
    })

    if (existingUser) {
      throw new Error('Email already registered')
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password)

    // Create user and student profile in transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name || `${data.firstName} ${data.lastName}`,
          passwordHash,
          emailVerified: true // Always true in simplified flow
        }
      })

      // Create student profile
      const student = await tx.student.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          creditBalance: 0 // Start with 0 credits
        }
      })

      return { user, student }
    })

    // Generate tokens for auto-login
    const payload: JWTPayload = {
      userId: result.user.id,
      role: 'student',
      email: result.user.email,
      studentId: result.student.id
    }

    const accessToken = await this.generateAccessToken(payload)
    const refreshToken = await this.generateRefreshToken(payload)

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: 'student',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
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
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email }
    })

    if (existingUser) {
      throw new Error('Email already registered')
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password)

    // Create user and instructor profile in transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email,
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
      instructorId: result.instructor.id
    }

    const accessToken = await this.generateAccessToken(payload)
    const refreshToken = await this.generateRefreshToken(payload)

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: 'instructor',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
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
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: {
        student: true,
        instructor: true
      }
    })

    if (!user) {
      throw new Error('Invalid credentials')
    }

    // Check if user has the correct type
    if (data.userType === 'student' && !user.student) {
      throw new Error('User is not a student')
    }
    if (data.userType === 'instructor' && !user.instructor) {
      throw new Error('User is not an instructor')
    }

    // Verify password
    if (!user.passwordHash) {
      throw new Error('Invalid credentials')
    }

    const isValidPassword = await this.comparePassword(data.password, user.passwordHash)
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials')
    }

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      role: data.userType, // Using role field
      email: user.email,
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
      creditBalance: user.student!.creditBalance
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
      role: data.userType, // Using role field
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
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

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(decoded)
      
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