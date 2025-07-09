import { z } from 'zod'

// Create Instructor Schema (includes User data)
export const createInstructorSchema = z.object({
  // User fields
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  
  // Instructor fields
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
    .optional()
})

// Update Instructor Schema
export const updateInstructorSchema = z.object({
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
  bio: z.string()
    .max(500, 'Bio must be less than 500 characters')
    .optional()
})

// URL Params Schema
export const instructorParamsSchema = z.object({
  id: z.string().uuid('Invalid instructor ID')
})

// Response Schema
export const instructorResponseSchema = z.object({
  id: z.string(),
  userId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  bio: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable()
  })
})

// Type exports
export type CreateInstructorInput = z.infer<typeof createInstructorSchema>
export type UpdateInstructorInput = z.infer<typeof updateInstructorSchema>
export type InstructorParams = z.infer<typeof instructorParamsSchema>
export type InstructorResponse = z.infer<typeof instructorResponseSchema>