/**
 * OpenAI Realtime STT Provider Plugin
 *
 * Uses the OpenAI Realtime API for streaming transcription with:
 * - Direct mu-law audio support (no conversion needed)
 * - Built-in server-side VAD for turn detection
 * - Low-latency streaming transcription
 * - Partial transcript callbacks for real-time UI updates
 */

import { randomUUID } from "crypto";
import type {
  PluginConfig,
  PluginMetadata,
  STTProvider,
  STTSession,
} from "../interfaces.js";
import { OpenAIRealtimeSTTSession } from "./session.js";

/**
 * Configuration for OpenAI Realtime STT.
 */
export interface OpenAIRealtimeSTTConfig extends PluginConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (default: gpt-4o-transcribe) */
  model?: string;
  /** Silence duration in ms before considering speech ended (default: 800) */
  silenceDurationMs?: number;
  /** VAD threshold 0-1 (default: 0.5) */
  vadThreshold?: number;
}

/**
 * Plugin metadata for OpenAI Realtime STT.
 */
const METADATA: PluginMetadata = {
  name: "openai-realtime",
  version: "1.0.0",
  type: "stt",
  description:
    "OpenAI Realtime API for streaming speech-to-text with server-side VAD",
  capabilities: ["streaming", "realtime", "vad", "mu-law"],
  authors: ["Clawdbot Contributors"],
  license: "MIT",
};

/**
 * OpenAI Realtime STT Provider Plugin.
 *
 * Provides speech-to-text capabilities using OpenAI's Realtime API.
 * Handles WebSocket connections, VAD, and streaming transcription.
 */
export class OpenAIRealtimeSTTProvider implements STTProvider {
  readonly metadata: PluginMetadata = METADATA;
  private apiKey: string;
  private model: string;
  private silenceDurationMs: number;
  private vadThreshold: number;

  constructor(config: OpenAIRealtimeSTTConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key required for Realtime STT");
    }
    this.apiKey = config.apiKey;
    this.model = config.model || "gpt-4o-transcribe";
    this.silenceDurationMs = config.silenceDurationMs || 800;
    this.vadThreshold = config.vadThreshold || 0.5;
  }

  validateConfig(): void {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    if (this.vadThreshold < 0 || this.vadThreshold > 1) {
      throw new Error("VAD threshold must be between 0 and 1");
    }
    if (this.silenceDurationMs < 100) {
      throw new Error("Silence duration must be at least 100ms");
    }
  }

  /**
   * Create a new realtime transcription session.
   */
  createSession(config?: PluginConfig): STTSession {
    const sessionId = config?.instanceId || randomUUID();
    return new OpenAIRealtimeSTTSession(
      sessionId,
      this.apiKey,
      this.model,
      this.silenceDurationMs,
      this.vadThreshold,
    );
  }
}
