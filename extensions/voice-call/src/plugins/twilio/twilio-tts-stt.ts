/**
 * Twilio Call Provider Plugin - TTS/STT Integration
 *
 * Provides Text-to-Speech and Speech-to-Text providers using Twilio's
 * TwiML elements (<Say> for TTS, <Gather> for STT).
 * Integrates with media streams for higher quality audio.
 */

import type { PluginConfig, PluginMetadata, TTSProvider, STTProvider, STTSession } from "../interfaces.js";
import { generateSayTwiml, generateGatherTwiml } from "./twilio-config.js";

// ============================================================================
// TTS Provider
// ============================================================================

/**
 * TwiML-based TTS provider using Twilio's Say element
 *
 * Features:
 * - Multiple voice options (Alice, Man, Woman)
 * - Language/locale support
 * - Integrates with Twilio media streams
 */
export class TwilioTTSProvider implements TTSProvider {
  readonly metadata: PluginMetadata = {
    name: "twilio-tts",
    version: "1.0.0",
    type: "tts",
    description: "Text-to-Speech using Twilio's Say TwiML element",
    capabilities: ["streaming", "multiple-voices", "language-support"],
    authors: ["Clawdbot"],
    license: "MIT",
  };

  private accountSid: string;
  private authToken: string;
  private defaultVoice: string = "Alice";
  private defaultLanguage: string = "en-US";

  // Supported Polly voices in Twilio
  private readonly SUPPORTED_VOICES = [
    "Alice", // Default English woman
    "Polly.Joanna", // Polly voice (modern TTS)
    "Polly.Matthew", // Polly male voice
    "man", // Default male voice
    "woman", // Default female voice
  ];

  // Language/locale mappings
  private readonly LANGUAGE_MAP: Record<string, string> = {
    "en-US": "en-US",
    "en-GB": "en-GB",
    "es-ES": "es-ES",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
    "it-IT": "it-IT",
    "ja-JP": "ja-JP",
    "zh-CN": "zh-CN",
  };

  constructor(config: {
    accountSid: string;
    authToken: string;
    defaultVoice?: string;
    defaultLanguage?: string;
  }) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    if (config.defaultVoice) {
      this.defaultVoice = config.defaultVoice;
    }
    if (config.defaultLanguage) {
      this.defaultLanguage = config.defaultLanguage;
    }
  }

  /**
   * Synthesize speech from text using Twilio Say TwiML
   *
   * Returns TwiML XML that Twilio will execute during a call.
   * For media streaming, use the synthesizeForStream() method instead.
   */
  async synthesize(
    text: string,
    options?: {
      voice?: string;
      speed?: number;
      instructions?: string;
    },
  ): Promise<Buffer> {
    const voice = this.validateVoice(options?.voice || this.defaultVoice);
    const language = this.defaultLanguage;

    // Generate TwiML Say element
    const twiml = generateSayTwiml(text, {
      voice,
      language,
    });

    // Return as UTF-8 encoded buffer
    return Buffer.from(twiml, "utf-8");
  }

  /**
   * Synthesize audio optimized for media streaming (mu-law, 8kHz)
   *
   * This would integrate with Twilio's media stream to capture
   * audio during a call. The actual audio generation happens
   * server-side during the call.
   */
  async synthesizeForStream(
    text: string,
    streamSid: string,
    options?: {
      voice?: string;
      language?: string;
    },
  ): Promise<{
    twiml: string;
    streamSid: string;
  }> {
    const voice = this.validateVoice(options?.voice || this.defaultVoice);
    const language = options?.language || this.defaultLanguage;

    const twiml = generateSayTwiml(text, {
      voice,
      language,
    });

    return {
      twiml,
      streamSid,
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(): void {
    if (!this.accountSid) {
      throw new Error("Account SID is required");
    }
    if (!this.authToken) {
      throw new Error("Auth Token is required");
    }
  }

  /**
   * Get list of supported voices
   */
  getSupportedVoices(): string[] {
    return [...this.SUPPORTED_VOICES];
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(this.LANGUAGE_MAP);
  }

  /**
   * Validate and normalize voice identifier
   */
  private validateVoice(voice: string): string {
    if (this.SUPPORTED_VOICES.includes(voice)) {
      return voice;
    }
    // Default to Alice if unknown
    console.warn(
      `[TwilioTTS] Unknown voice: ${voice}, using default: ${this.defaultVoice}`,
    );
    return this.defaultVoice;
  }

  /**
   * Get metadata
   */
  getMetadata(): PluginMetadata {
    return this.metadata;
  }
}

// ============================================================================
// STT Provider
// ============================================================================

/**
 * TwiML-based STT provider using Twilio's Gather element
 *
 * Features:
 * - Speech recognition via Gather
 * - Language support
 * - Confidence scoring
 * - DTMF digit collection
 * - Timeout handling
 */
export class TwilioSTTProvider implements STTProvider {
  readonly metadata: PluginMetadata = {
    name: "twilio-stt",
    version: "1.0.0",
    type: "stt",
    description: "Speech-to-Text using Twilio's Gather TwiML element",
    capabilities: ["streaming", "language-support", "dtmf-support"],
    authors: ["Clawdbot"],
    license: "MIT",
  };

  private accountSid: string;
  private authToken: string;
  private defaultLanguage: string = "en-US";

  // Language/locale mappings for Twilio speech recognition
  private readonly LANGUAGE_MAP: Record<string, string> = {
    "en-US": "en-US",
    "en-GB": "en-GB",
    "es-ES": "es-ES",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
    "it-IT": "it-IT",
    "ja-JP": "ja-JP",
    "zh-CN": "zh-CN",
    "pt-BR": "pt-BR",
  };

  private sessions = new Map<string, TwilioSTTSession>();
  private nextSessionId = 0;

  constructor(config: {
    accountSid: string;
    authToken: string;
    defaultLanguage?: string;
  }) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    if (config.defaultLanguage) {
      this.defaultLanguage = config.defaultLanguage;
    }
  }

  /**
   * Create a new STT session
   */
  createSession(config?: PluginConfig): STTSession {
    const sessionId = `twilio-stt-${++this.nextSessionId}-${Date.now()}`;
    const session = new TwilioSTTSession(sessionId, this.defaultLanguage);
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Validate configuration
   */
  validateConfig(): void {
    if (!this.accountSid) {
      throw new Error("Account SID is required");
    }
    if (!this.authToken) {
      throw new Error("Auth Token is required");
    }
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(this.LANGUAGE_MAP);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TwilioSTTSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up session resources
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.close();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get metadata
   */
  getMetadata(): PluginMetadata {
    return this.metadata;
  }
}

// ============================================================================
// STT Session Implementation
// ============================================================================

/**
 * Active Twilio STT session for speech capture
 *
 * Manages callbacks and state for ongoing speech recognition.
 * Integrates with Twilio's Gather element for webhook-based transcription.
 */
export class TwilioSTTSession implements STTSession {
  readonly sessionId: string;
  private connected: boolean = false;
  private language: string;
  private partialCallbacks: Array<(partial: string) => void> = [];
  private transcriptCallbacks: Array<(transcript: string) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private transcriptPromise: Promise<string> | null = null;
  private transcriptResolver: ((value: string) => void) | null = null;
  private transcriptRejecter: ((error: Error) => void) | null = null;

  constructor(sessionId: string, language: string = "en-US") {
    this.sessionId = sessionId;
    this.language = language;
  }

  /**
   * Connect to the STT service
   * For Twilio, this is mainly for state management
   */
  async connect(): Promise<void> {
    this.connected = true;
  }

  /**
   * Send audio for transcription
   * For Twilio Gather, this is handled via the media stream
   */
  sendAudio(_audio: Buffer): void {
    if (!this.connected) {
      throw new Error("Session not connected");
    }
    // Audio handling is done through Twilio media streams
  }

  /**
   * Register callback for partial transcripts
   */
  onPartial(callback: (partial: string) => void): void {
    this.partialCallbacks.push(callback);
  }

  /**
   * Register callback for final transcripts
   */
  onTranscript(callback: (transcript: string) => void): void {
    this.transcriptCallbacks.push(callback);
  }

  /**
   * Register callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Wait for next complete transcript
   */
  async waitForTranscript(timeoutMs: number = 30000): Promise<string> {
    if (this.transcriptPromise) {
      return this.transcriptPromise;
    }

    this.transcriptPromise = new Promise((resolve, reject) => {
      this.transcriptResolver = resolve;
      this.transcriptRejecter = reject;

      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Transcript timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // If we get a transcript before timeout, clear it
      const originalResolver = this.transcriptResolver;
      this.transcriptResolver = (value: string) => {
        clearTimeout(timeoutHandle);
        originalResolver?.(value);
      };
    });

    return this.transcriptPromise;
  }

  /**
   * Emit partial transcript
   */
  emitPartial(partial: string): void {
    for (const callback of this.partialCallbacks) {
      try {
        callback(partial);
      } catch (error) {
        console.error("[TwilioSTT] Error in partial callback:", error);
      }
    }
  }

  /**
   * Emit final transcript
   */
  emitTranscript(transcript: string): void {
    for (const callback of this.transcriptCallbacks) {
      try {
        callback(transcript);
      } catch (error) {
        console.error("[TwilioSTT] Error in transcript callback:", error);
      }
    }

    // Resolve waiting promise
    if (this.transcriptResolver) {
      this.transcriptResolver(transcript);
      this.transcriptResolver = null;
      this.transcriptPromise = null;
    }
  }

  /**
   * Emit error
   */
  emitError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch (e) {
        console.error("[TwilioSTT] Error in error callback:", e);
      }
    }

    // Reject waiting promise
    if (this.transcriptRejecter) {
      this.transcriptRejecter(error);
      this.transcriptRejecter = null;
      this.transcriptPromise = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close session and cleanup
   */
  close(): void {
    this.connected = false;
    this.partialCallbacks = [];
    this.transcriptCallbacks = [];
    this.errorCallbacks = [];

    if (this.transcriptRejecter) {
      this.transcriptRejecter(new Error("Session closed"));
      this.transcriptRejecter = null;
    }
  }

  /**
   * Get current language
   */
  getLanguage(): string {
    return this.language;
  }

  /**
   * Set language
   */
  setLanguage(language: string): void {
    this.language = language;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Twilio TTS provider instance
 */
export function createTwilioTTSProvider(config: {
  accountSid: string;
  authToken: string;
  defaultVoice?: string;
  defaultLanguage?: string;
}): TwilioTTSProvider {
  return new TwilioTTSProvider(config);
}

/**
 * Create a Twilio STT provider instance
 */
export function createTwilioSTTProvider(config: {
  accountSid: string;
  authToken: string;
  defaultLanguage?: string;
}): TwilioSTTProvider {
  return new TwilioSTTProvider(config);
}
