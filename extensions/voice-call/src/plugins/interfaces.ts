/**
 * Plugin System Interfaces
 *
 * Defines base plugin interfaces for STT and TTS providers.
 * Plugins can be dynamically loaded and registered at runtime.
 */

/**
 * Base configuration for any plugin provider.
 */
export interface PluginConfig {
  /** Unique identifier for this plugin instance */
  instanceId?: string;
  /** Optional tags for categorization/filtering */
  tags?: string[];
}

/**
 * Metadata describing a plugin's capabilities and requirements.
 */
export interface PluginMetadata {
  /** Plugin name (e.g., "openai-realtime") */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin type ("stt" or "tts") */
  type: "stt" | "tts";
  /** Human-readable description */
  description: string;
  /** List of capabilities (e.g., ["streaming", "realtime"]) */
  capabilities: string[];
  /** Plugin authors */
  authors?: string[];
  /** License identifier (e.g., "MIT") */
  license?: string;
}

/**
 * Speech-to-Text (STT) provider base interface.
 *
 * Implementations handle streaming audio transcription.
 */
export interface STTProvider {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /**
   * Create a session for streaming transcription.
   * @param config - Session configuration
   * @returns A session instance
   */
  createSession(config?: PluginConfig): STTSession;

  /**
   * Validate provider configuration.
   * Throws if configuration is invalid.
   */
  validateConfig(): void;
}

/**
 * Active transcription session for streaming audio.
 */
export interface STTSession {
  /** Unique session identifier */
  readonly sessionId: string;

  /** Connect to the transcription service */
  connect(): Promise<void>;

  /** Send audio data for transcription */
  sendAudio(audio: Buffer): void;

  /** Register callback for partial transcripts (streaming updates) */
  onPartial(callback: (partial: string) => void): void;

  /** Register callback for final transcripts */
  onTranscript(callback: (transcript: string) => void): void;

  /** Register callback for errors */
  onError?(callback: (error: Error) => void): void;

  /**
   * Wait for the next complete transcript.
   * @param timeoutMs - Timeout in milliseconds
   * @returns The complete transcript
   * @throws Error if timeout or connection fails
   */
  waitForTranscript(timeoutMs?: number): Promise<string>;

  /** Check if session is actively connected */
  isConnected(): boolean;

  /** Close the session and clean up resources */
  close(): void;
}

/**
 * Text-to-Speech (TTS) provider base interface.
 *
 * Implementations handle audio generation from text.
 */
export interface TTSProvider {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /**
   * Synthesize speech audio from text.
   * @param text - Text to synthesize
   * @param options - Optional synthesis parameters
   * @returns Audio buffer in the provider's default format
   */
  synthesize(text: string, options?: TTSSynthesisOptions): Promise<Buffer>;

  /**
   * Validate provider configuration.
   * Throws if configuration is invalid.
   */
  validateConfig(): void;
}

/**
 * Options for TTS synthesis.
 */
export interface TTSSynthesisOptions {
  /** Voice identifier (provider-specific) */
  voice?: string;
  /** Speed multiplier (e.g., 1.0 for normal, 2.0 for 2x) */
  speed?: number;
  /** Style/tone instructions (if supported by provider) */
  instructions?: string;
  /** Custom session configuration */
  config?: PluginConfig;
}

/**
 * Plugin registration information.
 */
export interface PluginRegistration {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin type */
  type: "stt" | "tts";
  /** Plugin instance */
  instance: STTProvider | TTSProvider;
  /** Registration timestamp */
  registeredAt: Date;
}

/**
 * Plugin initialization result.
 */
export interface PluginInitResult {
  success: boolean;
  message: string;
  plugin?: PluginRegistration;
  error?: Error;
}

/**
 * Plugin discovery options.
 */
export interface PluginDiscoveryOptions {
  /** Filter by plugin type */
  type?: "stt" | "tts";
  /** Filter by plugin name pattern */
  namePattern?: RegExp;
  /** Tags to filter by */
  tags?: string[];
}

/**
 * Plugin registry error.
 */
export class PluginRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PluginRegistryError";
  }
}
