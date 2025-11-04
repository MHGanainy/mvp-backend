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

// Type exports
export type PaymentParams = z.infer<typeof paymentParamsSchema>
export type CreateCreditCheckoutInput = z.infer<typeof createCreditCheckoutSchema>
export type CheckoutSessionParam = z.infer<typeof checkoutSessionParamSchema>