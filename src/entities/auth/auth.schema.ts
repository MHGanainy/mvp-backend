import { z } from 'zod'

// Student Registration Schema
export const registerStudentSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .trim(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .trim(),
  dateOfBirth: z.string()
    .datetime('Invalid date format')
    .or(z.date())
    .transform((val) => new Date(val))
    .refine((date) => {
      const age = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      return age >= 18 && age <= 100
    }, 'Age must be between 18 and 100 years'),
  name: z.string().optional() // Optional display name
})

// Instructor Registration Schema
export const registerInstructorSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .trim(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .trim(),
  bio: z.string()
    .max(500, 'Bio must be less than 500 characters')
    .optional(),
  name: z.string().optional() // Optional display name
})

// Login Schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  userType: z.enum(['student', 'instructor'])
})

// Token Refresh Schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string()
})

// JWT Payload Schema - Updated with 'role' field
export const jwtPayloadSchema = z.object({
  userId: z.number(),
  role: z.enum(['student', 'instructor']), // Changed from userType to role
  email: z.string().email(),
  studentId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional()
})

// Auth Response Schema
export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  role: z.enum(['student', 'instructor']), // Changed from userType to role
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable(),
    profile: z.union([
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        creditBalance: z.number()
      }),
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        bio: z.string().nullable()
      })
    ])
  })
})

// Type exports
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>
export type RegisterInstructorInput = z.infer<typeof registerInstructorSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
export type JWTPayload = z.infer<typeof jwtPayloadSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>