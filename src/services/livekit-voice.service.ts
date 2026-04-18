import axios, { AxiosInstance } from "axios";
import { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

const defaultLog = pino({ level: process.env.LOG_LEVEL || "info" });

const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const LIVEKIT_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "simsbuddy-agent";

interface VoiceAgentContext {
  userId?: string;
}

export function useVoiceAgentV2(_ctx?: VoiceAgentContext): boolean {
  // Global toggle for now. Extend to check per-account flags as needed.
  return process.env.USE_LIVEKIT_AGENTS === 'true';
}

export class LiveKitVoiceService {
  private client: AxiosInstance;
  private serviceUrl: string;
  private log: FastifyBaseLogger | pino.Logger;
  private roomService: RoomServiceClient | null = null;

  constructor(logger?: FastifyBaseLogger) {
    this.serviceUrl =
      process.env.LIVEKIT_SERVICE_URL ||
      "https://orchestrator-staging-c1dc.up.railway.app";
    this.log = logger || defaultLog;

    this.client = axios.create({
      baseURL: this.serviceUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
      this.roomService = new RoomServiceClient(
        LIVEKIT_URL,
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET,
      );
    }
  }

  async createSession(
    correlationToken: string,
    userName: string,
    config: {
      systemPrompt: string;
      openingLine: string;
      voiceId?: string;
    },
  ): Promise<{
    token: string;
    serverUrl: string;
    roomName: string;
  }> {
    if (useVoiceAgentV2({ userId: userName })) {
      return this.createSessionViaAgents(correlationToken, userName, config);
    }
    return this.createSessionViaOrchestrator(
      correlationToken,
      userName,
      config,
    );
  }

  async endSession(correlationToken: string): Promise<unknown> {
    if (useVoiceAgentV2()) {
      return this.endSessionViaAgents(correlationToken);
    }
    return this.endSessionViaOrchestrator(correlationToken);
  }

  // =========================================================================
  // LiveKit Agents (new flow) — direct SDK, no orchestrator
  // =========================================================================

  private async createSessionViaAgents(
    correlationToken: string,
    userName: string,
    config: {
      systemPrompt: string;
      openingLine: string;
      voiceId?: string;
    },
  ): Promise<{ token: string; serverUrl: string; roomName: string }> {
    if (!this.roomService) {
      throw new Error(
        "LiveKit Agents mode enabled but LIVEKIT_URL/API_KEY/API_SECRET not configured",
      );
    }

    const voiceId = config.voiceId || "Ashley";
    const roomName = correlationToken;

    this.log.info(
      {
        userName,
        correlationToken,
        voiceId,
        roomName,
        mode: "livekit-agents",
      },
      "Creating LiveKit room with agent dispatch",
    );

    const roomMetadata = JSON.stringify({
      sessionId: correlationToken,
      correlationToken,
      voiceId,
      userId: userName,
      caseType: "simulation",
    });

    await this.roomService.createRoom({
      name: roomName,
      metadata: roomMetadata,
      emptyTimeout: 5 * 60,
      departureTimeout: 20,
      agents: [
        new RoomAgentDispatch({
          agentName: LIVEKIT_AGENT_NAME,
          metadata: roomMetadata,
        }),
      ],
    });

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userName,
      name: userName,
    });
    at.addGrant({ roomJoin: true, room: roomName });
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: LIVEKIT_AGENT_NAME,
          metadata: roomMetadata,
        }),
      ],
    });
    const token = await at.toJwt();

    this.log.info(
      {
        correlationToken,
        roomName,
        serverUrl: LIVEKIT_URL,
        tokenLength: token.length,
        mode: "livekit-agents",
      },
      "LiveKit room created with agent dispatch",
    );

    return {
      token,
      serverUrl: LIVEKIT_URL,
      roomName,
    };
  }

  private async endSessionViaAgents(
    correlationToken: string,
  ): Promise<unknown> {
    if (!this.roomService) {
      throw new Error(
        "LiveKit Agents mode enabled but LIVEKIT_URL/API_KEY/API_SECRET not configured",
      );
    }

    try {
      this.log.info(
        { correlationToken, mode: "livekit-agents" },
        "Deleting LiveKit room",
      );
      await this.roomService.deleteRoom(correlationToken);
      this.log.info(
        { correlationToken, mode: "livekit-agents" },
        "LiveKit room deleted",
      );
      return { status: "ok" };
    } catch (error: unknown) {
      const err = error as Error;
      this.log.error(
        { err: error, correlationToken, mode: "livekit-agents" },
        "Failed to delete LiveKit room",
      );
      return { status: "error", message: err.message };
    }
  }

  // =========================================================================
  // Python Orchestrator (legacy flow)
  // =========================================================================

  private async createSessionViaOrchestrator(
    correlationToken: string,
    userName: string,
    config: {
      systemPrompt: string;
      openingLine: string;
      voiceId?: string;
    },
  ): Promise<{ token: string; serverUrl: string; roomName: string }> {
    try {
      const voiceId = config.voiceId || "Ashley";

      const requestPayload = {
        userName,
        correlationToken,
        voiceId,
        openingLine: config.openingLine,
        systemPrompt: config.systemPrompt,
      };

      this.log.info(
        {
          userName,
          correlationToken,
          voiceId,
          openingLine: config.openingLine.substring(0, 50) + "...",
          systemPromptLength: config.systemPrompt.length,
        },
        "Creating LiveKit session",
      );

      const response = await this.client.post(
        "/orchestrator/session/start",
        requestPayload,
      );

      const returnedSessionId =
        response.data.sessionId || response.data.roomName;

      this.log.info(
        {
          correlationTokenSent: correlationToken,
          sessionId: response.data.sessionId,
          roomName: response.data.roomName,
          serverUrl: response.data.serverUrl,
          tokenPresent: !!response.data.token,
        },
        "LiveKit session created",
      );

      if (returnedSessionId && returnedSessionId !== correlationToken) {
        this.log.warn(
          {
            sent: correlationToken,
            received: returnedSessionId,
          },
          "Python returned different sessionId/roomName",
        );
      }

      return {
        token: response.data.token,
        serverUrl: response.data.serverUrl,
        roomName:
          response.data.roomName || response.data.sessionId || correlationToken,
      };
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        response?: { data: unknown; status: number };
      };
      this.log.error(
        {
          err: error,
          correlationToken,
          responseData: err.response?.data,
          status: err.response?.status,
        },
        "Failed to create LiveKit session",
      );
      throw new Error(`Failed to create LiveKit session: ${err.message}`);
    }
  }

  private async endSessionViaOrchestrator(
    correlationToken: string,
  ): Promise<unknown> {
    try {
      this.log.info({ correlationToken }, "Ending LiveKit session");

      const response = await this.client.post("/orchestrator/session/end", {
        sessionId: correlationToken,
      });

      this.log.info({ correlationToken }, "LiveKit session ended successfully");
      return response.data;
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        response?: { data: unknown; status: number };
      };
      this.log.error(
        {
          err: error,
          correlationToken,
          responseData: err.response?.data,
          status: err.response?.status,
        },
        "Failed to end LiveKit session",
      );

      return { status: "error", message: err.message };
    }
  }
}

export const livekitVoiceService = new LiveKitVoiceService();
