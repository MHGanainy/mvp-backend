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
    }
  ): Promise<{
    token: string;
    serverUrl: string;
    roomName: string;
  }> {
    try {
      console.log(`[LiveKitVoice] Creating session for correlation token: ${correlationToken}`);
      console.log(`[LiveKitVoice] User: ${userName}`);

      const response = await this.client.post(
        '/orchestrator/session/start',
        {
          userName,
          correlationToken,
          voiceId: 'Ashley',  // Hardcoded for now
          openingLine: config.openingLine,
          systemPrompt: config.systemPrompt
        }
      );

      console.log(`[LiveKitVoice] Session created successfully:`, {
        token: response.data.token ? 'PRESENT' : 'MISSING',
        serverUrl: response.data.serverUrl,
        roomName: response.data.roomName || response.data.sessionId
      });

      return {
        token: response.data.token,
        serverUrl: response.data.serverUrl,
        roomName: response.data.roomName || response.data.sessionId
      };
    } catch (error: any) {
      console.error(`[LiveKitVoice] Failed to create session:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
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
