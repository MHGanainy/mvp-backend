import { z } from 'zod'

// InterviewCourseStyle enum
export const InterviewCourseStyleEnum = z.enum(['RANDOM', 'STRUCTURED'])

// Create InterviewCourse Schema (includes business validation)
export const createInterviewCourseSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID'),
  instructorId: z.string().uuid('Invalid instructor ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  style: InterviewCourseStyleEnum.default('RANDOM'),

  // Info points - array of strings
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional()
    .default([]),

  // Pricing validation (business rules)
  price3Months: z.number()
    .positive('3-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2))),
  price6Months: z.number()
    .positive('6-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2))),
  price12Months: z.number()
    .positive('12-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2))),

  // Credit allocation validation
  credits3Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high'),
  credits6Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high'),
  credits12Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high'),

  isPublished: z.boolean().default(false).optional()
}).refine((data) => {
  // Business rule: 6-month should be cheaper per month than 3-month
  const monthly3 = data.price3Months / 3
  const monthly6 = data.price6Months / 6
  return monthly6 <= monthly3
}, {
  message: '6-month plan should offer better value than 3-month plan',
  path: ['price6Months']
}).refine((data) => {
  // Business rule: 12-month should be cheapest per month
  const monthly6 = data.price6Months / 6
  const monthly12 = data.price12Months / 12
  return monthly12 <= monthly6
}, {
  message: '12-month plan should offer best value',
  path: ['price12Months']
}).refine((data) => {
  // Business rule: Longer subscriptions should have more credits
  return data.credits6Months >= data.credits3Months &&
         data.credits12Months >= data.credits6Months
}, {
  message: 'Longer subscriptions should include more credits',
  path: ['credits12Months']
})

// Update InterviewCourse Schema
export const updateInterviewCourseSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
    .optional(),
  price3Months: z.number()
    .positive('3-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2)))
    .optional(),
  price6Months: z.number()
    .positive('6-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2)))
    .optional(),
  price12Months: z.number()
    .positive('12-month price must be positive')
    .max(99999.99, 'Price too high')
    .transform(val => Number(val.toFixed(2)))
    .optional(),
  credits3Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high')
    .optional(),
  credits6Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high')
    .optional(),
  credits12Months: z.number()
    .int('Credits must be whole numbers')
    .min(0, 'Credits cannot be negative')
    .max(1000, 'Credits too high')
    .optional(),
  isPublished: z.boolean().optional()
})

// Add info points update schema for easier management
export const updateInterviewCourseInfoPointsSchema = z.object({
  infoPoints: z.array(z.string().trim().min(1, 'Info point cannot be empty'))
    .max(10, 'Maximum 10 info points allowed')
})

// URL Params Schemas
export const interviewCourseParamsSchema = z.object({
  id: z.string().uuid('Invalid interview course ID')
})

export const interviewCourseInterviewParamsSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID')
})

export const interviewCourseInstructorParamsSchema = z.object({
  instructorId: z.string().uuid('Invalid instructor ID')
})

// Response Schema
export const interviewCourseResponseSchema = z.object({
  id: z.string(),
  interviewId: z.string(),
  instructorId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  style: InterviewCourseStyleEnum,
  infoPoints: z.array(z.string()), // Added info points
  price3Months: z.number(),
  price6Months: z.number(),
  price12Months: z.number(),
  credits3Months: z.number(),
  credits6Months: z.number(),
  credits12Months: z.number(),
  isPublished: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  interview: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    isActive: z.boolean()
  }),
  instructor: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    bio: z.string().nullable()
  })
})

// Type exports
export type CreateInterviewCourseInput = z.infer<typeof createInterviewCourseSchema>
export type UpdateInterviewCourseInput = z.infer<typeof updateInterviewCourseSchema>
export type UpdateInterviewCourseInfoPointsInput = z.infer<typeof updateInterviewCourseInfoPointsSchema>
export type InterviewCourseParams = z.infer<typeof interviewCourseParamsSchema>
export type InterviewCourseInterviewParams = z.infer<typeof interviewCourseInterviewParamsSchema>
export type InterviewCourseInstructorParams = z.infer<typeof interviewCourseInstructorParamsSchema>
export type InterviewCourseResponse = z.infer<typeof interviewCourseResponseSchema>
export type InterviewCourseStyle = z.infer<typeof InterviewCourseStyleEnum>
