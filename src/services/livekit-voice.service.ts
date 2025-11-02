// src/services/livekit-voice.service.ts
import axios, { AxiosInstance } from 'axios';

export class LiveKitVoiceService {
  private client: AxiosInstance;
  private serviceUrl: string;

  constructor() {
    this.serviceUrl = process.env.LIVEKIT_SERVICE_URL || 'https://orchestrator-staging-c1dc.up.railway.app';

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
      const voiceId = config.voiceId || 'Ashley';  // Use provided voice or default to Ashley

      const requestPayload = {
        userName,
        correlationToken,
        voiceId: voiceId,
        openingLine: config.openingLine,
        systemPrompt: config.systemPrompt
      };

      console.log(`[LiveKitVoice] Creating session with payload:`, {
        userName,
        correlationToken,
        voiceId,
        openingLine: config.openingLine.substring(0, 50) + '...',
        systemPromptLength: config.systemPrompt.length
      });

      const response = await this.client.post(
        '/orchestrator/session/start',
        requestPayload
      );

      // Python orchestrator should return the same correlationToken as sessionId/roomName
      const returnedSessionId = response.data.sessionId || response.data.roomName;

      console.log(`[LiveKitVoice] Session created - Response from Python orchestrator:`, {
        token: response.data.token ? `PRESENT (${response.data.token.substring(0, 20)}...)` : 'MISSING',
        serverUrl: response.data.serverUrl,
        sessionId: response.data.sessionId,
        roomName: response.data.roomName,
        correlationTokenSent: correlationToken
      });

      // Validate that Python returned the same ID we sent
      if (returnedSessionId && returnedSessionId !== correlationToken) {
        console.warn(`[LiveKitVoice] WARNING: Python returned different sessionId/roomName!`, {
          sent: correlationToken,
          received: returnedSessionId
        });
      }

      return {
        token: response.data.token,
        serverUrl: response.data.serverUrl,
        // Use Python's returned roomName, fallback to sessionId, or use correlationToken if neither present
        roomName: response.data.roomName || response.data.sessionId || correlationToken
      };
    } catch (error: any) {
      console.error(`[LiveKitVoice] Failed to create session:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        correlationToken
      });
      throw new Error(`Failed to create LiveKit session: ${error.message}`);
    }
  }

  async endSession(correlationToken: string): Promise<any> {
    try {
      console.log(`[LiveKitVoice] Ending session for correlation token: ${correlationToken}`);

      const response = await this.client.post(
        '/orchestrator/session/end',
        {
          sessionId: correlationToken
        }
      );

      console.log(`[LiveKitVoice] Session ended successfully:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[LiveKitVoice] Failed to end session:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      // Don't throw - session might already be ended
      return { status: 'error', message: error.message };
    }
  }
}

// Export singleton instance
export const livekitVoiceService = new LiveKitVoiceService();
