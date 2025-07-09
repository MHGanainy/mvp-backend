import { z } from 'zod'

// Create Student Schema (includes User data)
export const createStudentSchema = z.object({
  // User fields
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  
  // Student fields
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
    }, 'Age must be between 18 and 100 years')
  // Note: creditBalance is NOT included - always starts at 0
})

// Update Student Schema
export const updateStudentSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .trim()
    .optional(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .trim()
    .optional(),
  dateOfBirth: z.string()
    .datetime('Invalid date format')
    .or(z.date())
    .transform((val) => new Date(val))
    .refine((date) => {
      const age = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      return age >= 18 && age <= 100
    }, 'Age must be between 18 and 100 years')
    .optional()
  // Note: creditBalance updates will be handled by separate business methods
})

// URL Params Schema
const studentUserParamsSchema = z.object({
  userId: z.string().transform(val => parseInt(val)).refine(val => !isNaN(val), 'Invalid user ID')
})

// Response Schema
export const studentResponseSchema = z.object({
  id: z.string(),
  userId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.date(),
  creditBalance: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable()
  })
})

// Type exports
export type CreateStudentInput = z.infer<typeof createStudentSchema>
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>
export type StudentUserParams = z.infer<typeof studentUserParamsSchema>
export type StudentResponse = z.infer<typeof studentResponseSchema>

// Export the params schema
export { studentUserParamsSchema }