import { z } from "zod";

// URL Params Schemas
export const subscriptionParamsSchema = z.object({
  id: z.string().uuid("Invalid subscription ID"),
});

export const subscriptionStudentParamsSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
});

// Query Params Schema
export const subscriptionQuerySchema = z.object({
  active: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  includeExpired: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

// Resource-type-aware params
export const subscriptionResourceParamsSchema = z.object({
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE', 'BUNDLE']),
  resourceId: z.string().uuid('Invalid resource ID')
})

// Unified check response
export const subscriptionCheckResponseSchema = z.object({
  hasActiveSubscription: z.boolean(),
  daysRemaining: z.number().nullable(),
  hoursRemaining: z.number().nullable(),
  isExpired: z.boolean(),
  isAdmin: z.boolean().optional(),
  subscription: z.object({
    id: z.string(),
    resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE', 'BUNDLE']),
    resourceId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationMonths: z.number(),
    isFreeTrial: z.boolean(),
    subscriptionSource: z.string().nullable(),
    pricingPlan: z.object({
      id: z.string(),
      name: z.string(),
      priceInCents: z.number()
    }).nullable()
  }).nullable()
})

// Unified access check response
export const subscriptionAccessResponseSchema = z.object({
  hasAccess: z.boolean(),
  accessReason: z.enum(['SUBSCRIPTION', 'ADMIN']).nullable(),
  subscription: subscriptionCheckResponseSchema.shape.subscription
})

// Unified subscription list item
export const subscriptionListItemSchema = z.object({
  id: z.string(),
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE', 'BUNDLE']),
  resourceId: z.string(),
  resourceTitle: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  durationMonths: z.number(),
  isActive: z.boolean(),
  isFreeTrial: z.boolean(),
  subscriptionSource: z.string().nullable(),
  daysRemaining: z.number().nullable(),
  isExpired: z.boolean(),
  pricingPlan: z.object({
    id: z.string(),
    name: z.string(),
    priceInCents: z.number()
  }).nullable()
})

// Trial activation
export const activateTrialSchema = z.object({
  pricingPlanId: z.string().uuid('Invalid pricing plan ID'),
});

// Type exports
export type ActivateTrialInput = z.infer<typeof activateTrialSchema>;
export type SubscriptionParams = z.infer<typeof subscriptionParamsSchema>;
export type SubscriptionStudentParams = z.infer<
  typeof subscriptionStudentParamsSchema
>;
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;
export type SubscriptionResourceParams = z.infer<
  typeof subscriptionResourceParamsSchema
>;
export type SubscriptionCheckResponse = z.infer<
  typeof subscriptionCheckResponseSchema
>;
export type SubscriptionAccessResponse = z.infer<
  typeof subscriptionAccessResponseSchema
>;
export type SubscriptionListItem = z.infer<
  typeof subscriptionListItemSchema
>;
