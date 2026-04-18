import { z } from 'zod';

// --- Request Schemas ---

export const sessionConfigParamsSchema = z.object({
  correlationToken: z.string().min(1, 'correlationToken is required'),
});

export const heartbeatBodySchema = z.object({
  correlationToken: z.string().min(1, 'correlationToken is required'),
  sessionId: z.string().min(1, 'sessionId is required'),
});

const transcriptMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  timestamp: z.string(),
  sequence: z.number().int().nonnegative(),
});

export const saveTranscriptBodySchema = z.object({
  correlationToken: z.string().min(1, 'correlationToken is required'),
  caseType: z.enum(['simulation', 'interview']),
  transcript: z.object({
    messages: z.array(transcriptMessageSchema),
    capturedAt: z.string(),
    version: z.string(),
  }),
});

// --- Response Types ---

export type SessionConfigParams = z.infer<typeof sessionConfigParamsSchema>;
export type HeartbeatBody = z.infer<typeof heartbeatBodySchema>;
export type SaveTranscriptBody = z.infer<typeof saveTranscriptBodySchema>;

export interface SessionConfigResponse {
  systemPrompt: string;
  openingLine: string;
  voiceId: string;
  caseType: 'simulation' | 'interview';
}

export interface HeartbeatResponse {
  status: 'ok' | 'stop';
  reason?: string;
}

export interface SaveTranscriptResponse {
  success: boolean;
}
