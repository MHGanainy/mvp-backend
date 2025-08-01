import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

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

export interface TranscriptClean {
  messages: {
    timestamp: string;   // keep as ISO string; convert to Date later if needed
    speaker: string;
    message: string;
  }[];
  duration: number;      // seconds – never null
  totalMessages: number;
}