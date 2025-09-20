import { z } from 'zod';

// Request schemas
export const BillingWebhookSchema = z.object({
    correlation_token: z.string().min(1, "Correlation token is required"),
    conversation_id: z.string().min(1, "Conversation ID is required"),  
    minute: z.number().min(1).int("Minute must be a positive integer"),
    timestamp: z.string().refine((val) => {
      // Accept timestamps with or without timezone, with varying decimal places
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(val);
    }, "Invalid timestamp format")
  });
  
  export const SessionEndSchema = z.object({
    correlation_token: z.string().min(1, "Correlation token is required"),
    conversation_id: z.string().min(1, "Conversation ID is required"),
    total_minutes: z.number().min(0).int("Total minutes must be a non-negative integer"),
    timestamp: z.string().refine((val) => {
      // Same flexible timestamp validation
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(val);
    }, "Invalid timestamp format")
  });

// Enhanced Response schemas with minutesBilled tracking
export const BillingResponseSchema = z.object({
  status: z.enum(['continue', 'warning', 'terminate', 'error']),
  creditsRemaining: z.number().int(),
  minuteBilled: z.number().int(),
  totalMinutesBilled: z.number().int(), // NEW: Track total minutes billed for this attempt
  shouldTerminate: z.boolean(),
  message: z.string().optional(),
  gracePeriodSeconds: z.number().int().optional(),
  attemptId: z.string().optional() // NEW: Include attempt ID for tracking
});

export const SessionEndResponseSchema = z.object({
  success: z.boolean(),
  totalMinutesBilled: z.number().int(),
  attemptFound: z.boolean(),
  finalBalance: z.number().int().optional() // NEW: Final credit balance after session
});

export const BillingMetricsSchema = z.object({
  totalRequests: z.number().int(),
  successfulBillings: z.number().int(),
  failedBillings: z.number().int(),
  duplicateRequests: z.number().int(),
  insufficientCreditEvents: z.number().int(),
  averageTransactionTime: z.number(),
  totalTransactionTime: z.number(),
  totalMinutesBilled: z.number().int(), // NEW: Total minutes billed across all attempts
  lastProcessedAt: z.date().optional(),
  uptime: z.number()
});

// Type exports
export type BillingWebhookInput = z.infer<typeof BillingWebhookSchema>;
export type SessionEndInput = z.infer<typeof SessionEndSchema>;
export type BillingResponse = z.infer<typeof BillingResponseSchema>;
export type SessionEndResponse = z.infer<typeof SessionEndResponseSchema>;
export type BillingMetrics = z.infer<typeof BillingMetricsSchema>;

// Enums matching your domain
export enum BillingStatus {
  CONTINUE = 'continue',
  WARNING = 'warning',
  TERMINATE = 'terminate',
  ERROR = 'error'
}

// Configuration constants
export const BILLING_CONFIG = {
  DEFAULT_GRACE_PERIOD_SECONDS: 60,
  WARNING_THRESHOLD_CREDITS: 2,
  MINUTE_DURATION_SECONDS: 60,
  TRANSACTION_TIMEOUT_MS: 10000,
  TRANSACTION_MAX_WAIT_MS: 5000,
  DEFAULT_INTERNAL_SECRET: 'your-internal-secret-change-in-production'
} as const;