/**
 * Mock plugin registry and providers for testing
 */

import type {
  PluginMetadata,
  STTProvider,
  STTSession,
  TTSProvider,
  TTSSynthesisOptions,
} from "../../plugins/interfaces.js";

export class MockSTTSession implements STTSession {
  transcripts: string[] = [];
  isClosed = false;

  async processAudio(_audio: ArrayBuffer): Promise<string | null> {
    if (this.transcripts.length > 0) {
      return this.transcripts.shift() || null;
    }
    return null;
  }

  close(): void {
    this.isClosed = true;
  }
}

export class MockSTTProvider implements STTProvider {
  metadata: PluginMetadata = {
    name: "mock-stt",
    version: "1.0.0",
    description: "Mock STT provider",
  };

  shouldFail = false;
  failureReason = "Mock STT failed";
  sessions: Map<string, MockSTTSession> = new Map();
  sessionCount = 0;

  async initialize(): Promise<void> {
    if (this.shouldFail) {
      throw new Error(this.failureReason);
    }
  }

  async createSession(): Promise<STTSession> {
    const session = new MockSTTSession();
    this.sessionCount++;
    this.sessions.set(`session-${this.sessionCount}`, session);
    return session;
  }

  async transcribe(_audio: ArrayBuffer): Promise<string> {
    if (this.shouldFail) {
      throw new Error(this.failureReason);
    }
    return "Mock transcription";
  }

  reset(): void {
    this.sessions.clear();
    this.sessionCount = 0;
  }
}

export class MockTTSProvider implements TTSProvider {
  metadata: PluginMetadata = {
    name: "mock-tts",
    version: "1.0.0",
    description: "Mock TTS provider",
  };

  shouldFail = false;
  failureReason = "Mock TTS failed";
  synthesisCalls: Array<{
    text: string;
    options?: TTSSynthesisOptions;
  }> = [];

  async initialize(): Promise<void> {
    if (this.shouldFail) {
      throw new Error(this.failureReason);
    }
  }

  async synthesize(text: string, options?: TTSSynthesisOptions): Promise<ArrayBuffer> {
    this.synthesisCalls.push({ text, options });
    if (this.shouldFail) {
      throw new Error(this.failureReason);
    }
    // Return a mock audio buffer (16-bit PCM, 8kHz, 1 second of silence)
    return new ArrayBuffer(16000 * 2);
  }

  reset(): void {
    this.synthesisCalls = [];
  }
}

export function createMockPluginRegistry() {
  const mockStt = new MockSTTProvider();
  const mockTts = new MockTTSProvider();

  return {
    stt: mockStt,
    tts: mockTts,
    reset: () => {
      mockStt.reset();
      mockTts.reset();
    },
  };
}
