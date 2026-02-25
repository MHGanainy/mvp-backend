import axios, { AxiosInstance } from 'axios';
import { FastifyBaseLogger } from 'fastify';
import pino from 'pino';

const defaultLog = pino({ level: process.env.LOG_LEVEL || 'info' });

export class LiveKitVoiceService {
  private client: AxiosInstance;
  private serviceUrl: string;
  private log: FastifyBaseLogger | pino.Logger;

  constructor(logger?: FastifyBaseLogger) {
    this.serviceUrl = process.env.LIVEKIT_SERVICE_URL || 'https://orchestrator-staging-c1dc.up.railway.app';
    this.log = logger || defaultLog;

    this.client = axios.create({
      baseURL: this.serviceUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  async createSession(
    correlationToken: string,
    userName: string,
    config: {
      systemPrompt: string;
      openingLine: string;
      voiceId?: string;
    }
  ): Promise<{
    token: string;
    serverUrl: string;
    roomName: string;
  }> {
    try {
      const voiceId = config.voiceId || 'Ashley';

      const requestPayload = {
        userName,
        correlationToken,
        voiceId,
        openingLine: config.openingLine,
        systemPrompt: config.systemPrompt
      };

      this.log.info({
        userName,
        correlationToken,
        voiceId,
        openingLine: config.openingLine.substring(0, 50) + '...',
        systemPromptLength: config.systemPrompt.length
      }, 'Creating LiveKit session');

      const response = await this.client.post(
        '/orchestrator/session/start',
        requestPayload
      );

      // Python orchestrator should return the same correlationToken as sessionId/roomName
      const returnedSessionId = response.data.sessionId || response.data.roomName;

      this.log.info({
        correlationTokenSent: correlationToken,
        sessionId: response.data.sessionId,
        roomName: response.data.roomName,
        serverUrl: response.data.serverUrl,
        tokenPresent: !!response.data.token,
      }, 'LiveKit session created');

      if (returnedSessionId && returnedSessionId !== correlationToken) {
        this.log.warn({
          sent: correlationToken,
          received: returnedSessionId,
        }, 'Python returned different sessionId/roomName');
      }

      return {
        token: response.data.token,
        serverUrl: response.data.serverUrl,
        roomName: response.data.roomName || response.data.sessionId || correlationToken,
      };
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data: unknown; status: number } };
      this.log.error({
        err: error,
        correlationToken,
        responseData: err.response?.data,
        status: err.response?.status,
      }, 'Failed to create LiveKit session');
      throw new Error(`Failed to create LiveKit session: ${err.message}`);
    }
  }

  async endSession(correlationToken: string): Promise<unknown> {
    try {
      this.log.info({ correlationToken }, 'Ending LiveKit session');

      const response = await this.client.post(
        '/orchestrator/session/end',
        {
          sessionId: correlationToken
        }
      );

      this.log.info({ correlationToken }, 'LiveKit session ended successfully');
      return response.data;
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data: unknown; status: number } };
      this.log.error({
        err: error,
        correlationToken,
        responseData: err.response?.data,
        status: err.response?.status,
      }, 'Failed to end LiveKit session');

      return { status: 'error', message: err.message };
    }
  }
}

export const livekitVoiceService = new LiveKitVoiceService();
