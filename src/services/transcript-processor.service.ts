/**
 * Transcript Processor Service
 *
 * Handles merging of split transcript messages from voice agent and
 * transforms them into clean format for AI feedback generation.
 */

export interface VoiceAgentMessage {
  role: 'user' | 'assistant';
  content: string;
  sequence: number;
  timestamp: string;
}

export interface VoiceAgentTranscript {
  version: string;
  messages: VoiceAgentMessage[];
  capturedAt: string;
}

export interface CleanTranscriptMessage {
  timestamp: string;
  speaker: 'student' | 'ai_patient';
  message: string;
}

export class TranscriptProcessorService {
  /**
   * Merge consecutive messages from same speaker within 2-second window
   */
  static mergeConsecutiveMessages(messages: VoiceAgentMessage[]): VoiceAgentMessage[] {
    if (!messages?.length) return [];

    const merged: VoiceAgentMessage[] = [];
    let currentMessage: VoiceAgentMessage | null = null;

    for (const msg of messages) {
      if (currentMessage &&
          currentMessage.role === msg.role &&
          this.isWithinTimeWindow(currentMessage.timestamp, msg.timestamp, 2000)) {
        // Merge content intelligently
        currentMessage.content = this.smartMergeText(currentMessage.content, msg.content);
        currentMessage.timestamp = msg.timestamp; // Use latest timestamp
      } else {
        if (currentMessage) merged.push(currentMessage);
        currentMessage = { ...msg };
      }
    }

    if (currentMessage) merged.push(currentMessage);
    return merged;
  }

  /**
   * Intelligently merge two text fragments, handling punctuation and capitalization
   */
  private static smartMergeText(text1: string, text2: string): string {
    text1 = text1.trim();
    text2 = text2.trim();

    if (!text1) return text2;
    if (!text2) return text1;

    // Handle cases like "What is." + "Your." + "Name."
    const endsWithPeriod = text1.endsWith('.');
    const startsWithCapital = /^[A-Z]/.test(text2);

    if (endsWithPeriod && !startsWithCapital) {
      // "What is." + "your" → "What is your"
      return text1.slice(0, -1) + ' ' + text2;
    } else if (endsWithPeriod && startsWithCapital) {
      // Check if it's likely same sentence (short fragment)
      const shortFragment = text2.length < 10 && !text2.includes(' ');
      if (shortFragment) {
        // "What is." + "Your." → "What is your."
        const text2Lower = text2.toLowerCase();
        return text1.slice(0, -1) + ' ' + text2Lower;
      }
      // Separate sentences
      // "I have pain." + "It started yesterday." → "I have pain. It started yesterday."
      return text1 + ' ' + text2;
    }

    // Default: just join with space
    return text1 + ' ' + text2;
  }

  /**
   * Check if two timestamps are within specified time window
   */
  private static isWithinTimeWindow(time1: string, time2: string, windowMs: number): boolean {
    try {
      const t1 = new Date(time1).getTime();
      const t2 = new Date(time2).getTime();
      return Math.abs(t2 - t1) <= windowMs;
    } catch (error) {
      console.error('[TranscriptProcessor] Invalid timestamp:', error);
      return false;
    }
  }

  /**
   * Convert voice agent transcript to clean format for AI feedback
   */
  static transformToCleanFormat(voiceTranscript: VoiceAgentTranscript): {
    messages: CleanTranscriptMessage[];
    duration: number;
    totalMessages: number;
  } {
    // First merge split messages
    const merged = this.mergeConsecutiveMessages(voiceTranscript.messages);

    // Transform to clean format
    const messages: CleanTranscriptMessage[] = merged.map(msg => ({
      timestamp: msg.timestamp,
      speaker: msg.role === 'user' ? 'student' : 'ai_patient' as const,
      message: msg.content
    }));

    // Calculate duration from first to last message
    let duration = 0;
    if (messages.length > 1) {
      try {
        const firstTime = new Date(messages[0].timestamp).getTime();
        const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
        duration = Math.round((lastTime - firstTime) / 1000);
      } catch (error) {
        console.error('[TranscriptProcessor] Error calculating duration:', error);
        duration = 0;
      }
    }

    return {
      messages,
      duration,
      totalMessages: messages.length
    };
  }
}
