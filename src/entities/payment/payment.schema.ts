import { z } from 'zod'

// Initiate Payment Schema (for subscriptions)
export const initiatePaymentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  courseId: z.string().uuid('Invalid course ID'),
  durationMonths: z.enum(['3', '6', '12']).transform(val => parseInt(val)),
  paymentType: z.literal('SUBSCRIPTION')
})

// Confirm Payment Schema (mock Stripe webhook)
export const confirmPaymentSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID'),
  stripePaymentIntentId: z.string() // Mock Stripe payment intent
})

// URL Params Schema
export const paymentParamsSchema = z.object({
  id: z.string().uuid('Invalid payment ID')
})

// Type exports
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>
export type PaymentParams = z.infer<typeof paymentParamsSchema>