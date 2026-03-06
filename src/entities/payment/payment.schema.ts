import { z } from 'zod'

// URL Params Schema
export const paymentParamsSchema = z.object({
  id: z.string().uuid('Invalid payment ID')
})

// Credit Checkout Schema
export const createCreditCheckoutSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
})

// Checkout Session ID Param Schema
export const checkoutSessionParamSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
})

// Subscription Checkout Schema
export const createSubscriptionCheckoutSchema = z.object({
  pricingPlanId: z.string().uuid('Invalid pricing plan ID'),
})

// Payment History Query Schema
export const paymentHistoryQuerySchema = z.object({
  paymentType: z.enum(['SUBSCRIPTION', 'CREDITS']).optional(),
  page: z.string().transform(Number).pipe(z.number().min(1)).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
})

// Type exports
export type PaymentParams = z.infer<typeof paymentParamsSchema>
export type CreateCreditCheckoutInput = z.infer<typeof createCreditCheckoutSchema>
export type CreateSubscriptionCheckoutInput = z.infer<typeof createSubscriptionCheckoutSchema>
export type CheckoutSessionParam = z.infer<typeof checkoutSessionParamSchema>
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>