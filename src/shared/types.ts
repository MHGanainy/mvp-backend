import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }

  interface FastifyRequest {
    rawBody?: string
    requestId?: string
  }
}

export interface TranscriptMessage {
  timestamp: string;
  speaker: 'student' | 'ai_patient' | 'doctor' | 'patient' | 'participant' | 'assistant';
  message: string;
}

export interface TranscriptClean {
  messages: TranscriptMessage[];
  duration: number;
  totalMessages: number;
}

// Use your existing VoiceAssistantTranscriptApi type
export interface VoiceAssistantTranscriptApi {
  correlation_token: string;
  session_id: string;
  conversation_id: string;
  started_at: string;                // ISO-8601 in UTC
  ended_at: string | null;
  duration_seconds: number | null;
  total_messages: number;
  messages: {
    timestamp: string;               // ISO-8601
    speaker: 'participant' | 'assistant';
    message: string;
    audio_duration: number | null;
  }[];
  metadata: {
    simulation_attempt_id: string;
    connected_at: string;
  };
}