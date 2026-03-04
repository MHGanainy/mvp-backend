import { z } from "zod";

// Create Subscription Schema (mocking payment for now)
export const createSubscriptionSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  courseId: z.string().uuid("Invalid course ID"),
  durationMonths: z.enum(["3", "6", "12"]).transform((val) => parseInt(val)),
  // In production, paymentId would come from Stripe
  mockPaymentId: z.string().default(() => "mock_payment_" + Date.now()),
});

// Check Subscription Schema
export const checkSubscriptionSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  courseId: z.string().uuid("Invalid course ID"),
});

// URL Params Schemas
export const subscriptionParamsSchema = z.object({
  id: z.string().uuid("Invalid subscription ID"),
});

export const subscriptionStudentParamsSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
});

export const subscriptionCourseParamsSchema = z.object({
  courseId: z.string().uuid("Invalid course ID"),
});

export const subscriptionCheckParamsSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  courseId: z.string().uuid("Invalid course ID"),
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

// Response Schemas
export const subscriptionResponseSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  courseId: z.string(),
  paymentId: z.string(),
  durationMonths: z.number(),
  startDate: z.date(),
  endDate: z.date(),
  isActive: z.boolean(),
  createdAt: z.date(),
  student: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  course: z
    .object({
      id: z.string(),
      title: z.string(),
      style: z.string(),
      exam: z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string(),
      }),
    })
    .optional(),
});

export const subscriptionStatusResponseSchema = z.object({
  hasActiveSubscription: z.boolean(),
  subscription: subscriptionResponseSchema.optional(),
  daysRemaining: z.number().optional(),
  isExpired: z.boolean(),
});

export const subscriptionStatsResponseSchema = z.object({
  studentId: z.string(),
  totalSubscriptions: z.number(),
  activeSubscriptions: z.number(),
  expiredSubscriptions: z.number(),
  totalCreditsReceived: z.number(),
  subscriptionsByDuration: z.object({
    threeMonth: z.number(),
    sixMonth: z.number(),
    twelveMonth: z.number(),
  }),
});

// Resource-type-aware params
export const subscriptionResourceParamsSchema = z.object({
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']),
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
    resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']),
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
  resourceType: z.enum(['COURSE', 'INTERVIEW_COURSE']),
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

// Type exports
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type CheckSubscriptionInput = z.infer<typeof checkSubscriptionSchema>;
export type SubscriptionParams = z.infer<typeof subscriptionParamsSchema>;
export type SubscriptionStudentParams = z.infer<
  typeof subscriptionStudentParamsSchema
>;
export type SubscriptionCourseParams = z.infer<
  typeof subscriptionCourseParamsSchema
>;
export type SubscriptionCheckParams = z.infer<
  typeof subscriptionCheckParamsSchema
>;
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
export type SubscriptionStatusResponse = z.infer<
  typeof subscriptionStatusResponseSchema
>;
export type SubscriptionStatsResponse = z.infer<
  typeof subscriptionStatsResponseSchema
>;
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
