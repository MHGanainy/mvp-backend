// src/services/voice-agent.service.ts
import axios, { AxiosInstance } from 'axios';

export class VoiceAgentService {
  private client: AxiosInstance;
  private sharedSecret: string;

  constructor() {
    this.sharedSecret = process.env.BACKEND_SHARED_SECRET || 'your-internal-secret-change-in-production';
    
    this.client = axios.create({
      baseURL: process.env.VOICE_ASSISTANT_API_URL || 'http://localhost:8000',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  async closeConnection(correlationToken: string): Promise<boolean> {
    try {
      console.log(`[VoiceAgent] Requesting connection close for correlation token: ${correlationToken}`);
      
      const response = await this.client.post(
        `/api/connections/${correlationToken}/close`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.sharedSecret}`
          }
        }
      );

      console.log(`[VoiceAgent] Connection close response for ${correlationToken}:`, response.data);
      
      if (response.data.status === 'success') {
        console.log(`[VoiceAgent] Successfully closed connection for ${correlationToken}`);
        return true;
      } else if (response.data.status === 'not_found') {
        console.log(`[VoiceAgent] No active connection found for ${correlationToken} (may already be closed)`);
        return false;
      } else {
        console.warn(`[VoiceAgent] Unexpected response status: ${response.data.status}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[VoiceAgent] Failed to close connection for ${correlationToken}:`, error.message);
      
      if (error.response) {
        console.error('[VoiceAgent] Error response:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      
      // Don't throw - we want to continue even if we can't close the connection
      return false;
    }
  }

  async getTranscript(correlationToken: string): Promise<any> {
    try {
      console.log(`[VoiceAgent] Fetching transcript for correlation token: ${correlationToken}`);
      
      const response = await this.client.get(
        `/api/transcripts/correlation/${correlationToken}`
      );
      
      console.log(`[VoiceAgent] Successfully fetched transcript for ${correlationToken}`);
      return response.data;
    } catch (error: any) {
      console.error(`[VoiceAgent] Failed to get transcript for ${correlationToken}:`, error.message);
      
      if (error.response?.status === 404) {
        console.error('[VoiceAgent] Transcript not found');
        throw new Error('Transcript not found');
      }
      
      throw error;
    }
  }

  async getConnectionStatus(correlationToken: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/api/conversations`,
        {
          params: {
            active_only: true
          }
        }
      );
      
      // Find conversation with matching correlation token
      const activeConversation = response.data.conversations.find((conv: any) => 
        conv.metadata?.correlation_token === correlationToken
      );
      
      return {
        isActive: !!activeConversation,
        conversation: activeConversation || null
      };
    } catch (error) {
      console.error(`[VoiceAgent] Failed to get connection status:`, error);
      return {
        isActive: false,
        conversation: null
      };
    }
  }
}

// Export singleton instance
export const voiceAgentService = new VoiceAgentService();