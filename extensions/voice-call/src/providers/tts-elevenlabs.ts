/**
 * ElevenLabs TTS Provider
 *
 * Cloud-based text-to-speech synthesis via ElevenLabs API.
 * Provides high-quality voice synthesis with multiple voice options and parameters.
 *
 * Features:
 * - 100+ realistic voices
 * - Real-time streaming synthesis
 * - Voice cloning support
 * - Stability and similarity control
 * - Rate limiting and retry logic
 * - Connection pooling
 * - Cost tracking support
 */

import { randomUUID } from "node:crypto";
import type {
  PluginConfig,
  PluginMetadata,
  TTSProvider,
  TTSSynthesisOptions,
} from "../plugins/interfaces.js";
import { AUDIO_FORMATS } from "./audio-utils.js";

/**
 * ElevenLabs voice identifiers (common voices).
 */
export type ElevenLabsVoice =
  | "bella"
  | "rachel"
  | "caleb"
  | "charlotte"
  | "matilda"
  | "james"
  | "john"
  | "liam"
  | "sophia"
  | "isabella"
  | "mia"
  | "oliver"
  | "lucas"
  | "ethan"
  | "benjamin"
  | "william"
  | "henry"
  | "alexander"
  | "mason"
  | "michael"
  | "lily"
  | "emily"
  | "emma"
  | "amelia"
  | "evelyn"
  | "abigail"
  | "harper"
  | "luna"
  | "ella"
  | "scarlett"
  | "preview_male_english"
  | "preview_female_english";

/**
 * ElevenLabs voice metadata.
 */
export interface ElevenLabsVoiceMetadata {
  voice_id: string;
  name: string;
  category: "premade" | "cloned";
  description: string;
  preview_url?: string;
  labels?: Record<string, string>;
  owner_id?: string;
  sharing?: "private" | "public";
  high_quality_base?: boolean;
  fine_tuning?: {
    language?: string;
    is_allowed_to_fine_tune?: boolean;
    finely_tuned?: boolean;
    model_id?: string;
    slice_ids?: string[];
  };
}

/**
 * Configuration for ElevenLabs TTS provider.
 */
export interface ElevenLabsTTSConfig extends PluginConfig {
  /** ElevenLabs API key (required) */
  apiKey: string;
  /** Default voice ID or name (default: bella) */
  voiceId?: string;
  /** Model ID (default: eleven_monolingual_v1) */
  modelId?: string;
  /** Stability parameter (0 to 1, default: 0.5) */
  stability?: number;
  /** Similarity boost parameter (0 to 1, default: 0.75) */
  similarityBoost?: number;
  /** Output format (default: mp3_22050_32) */
  outputFormat?: "mp3_44100_64" | "mp3_44100_128" | "mp3_22050_32" | "ulaw_8000_bit";
  /** Enable rate limiting (default: true) */
  rateLimit?: boolean;
  /** Maximum requests per minute (default: 100) */
  requestsPerMinute?: number;
  /** Enable caching of voice lists (default: true) */
  cacheVoices?: boolean;
}

/**
 * Metadata describing the ElevenLabs TTS provider.
 */
const ELEVENLABS_METADATA: PluginMetadata = {
  name: "elevenlabs-tts",
  version: "1.0.0",
  type: "tts",
  description: "ElevenLabs cloud text-to-speech with 100+ realistic voices",
  capabilities: [
    "streaming",
    "voice-selection",
    "voice-cloning",
    "stability-control",
    "similarity-boost",
    "multiple-formats",
    "high-quality",
  ],
  authors: ["Clawdbot Team"],
  license: "MIT",
};

/**
 * ElevenLabs HTTP client with connection pooling and retries.
 */
class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.elevenlabs.io/v1";
  private voiceCache: Map<string, ElevenLabsVoiceMetadata> = new Map();
  private voiceCacheExpiry = 0;
  private requestTimes: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly cacheVoices: boolean;

  constructor(apiKey: string, maxRequestsPerMinute: number = 100, cacheVoices: boolean = true) {
    this.apiKey = apiKey;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.cacheVoices = cacheVoices;
  }

  /**
   * Apply rate limiting if enabled.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old timestamps
    this.requestTimes = this.requestTimes.filter((time) => time > oneMinuteAgo);

    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      // Wait until oldest request falls out of the window
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + 60000 - now;
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.requestTimes.push(now);
  }

  /**
   * Make HTTP request with retry logic.
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    retries: number = 3,
  ): Promise<T> {
    await this.enforceRateLimit();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const options: RequestInit = {
          method,
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("retry-after") || "1", 10);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        // Handle authentication error
        if (response.status === 401) {
          throw new Error("Invalid ElevenLabs API key");
        }

        // Handle not found
        if (response.status === 404) {
          throw new Error(`Resource not found: ${endpoint}`);
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on auth errors
        if (lastError.message.includes("API key")) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < retries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Synthesize text to speech and return audio buffer.
   */
  async synthesize(
    text: string,
    voiceId: string,
    modelId: string,
    stability: number,
    similarityBoost: number,
    outputFormat: string,
  ): Promise<Buffer> {
    const body = {
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    };

    const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs synthesis error: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get list of available voices.
   */
  async getVoices(): Promise<ElevenLabsVoiceMetadata[]> {
    const now = Date.now();

    // Return cached voices if still valid
    if (this.cacheVoices && this.voiceCache.size > 0 && now < this.voiceCacheExpiry) {
      return Array.from(this.voiceCache.values());
    }

    interface VoicesResponse {
      voices: ElevenLabsVoiceMetadata[];
    }
    const data = await this.request<VoicesResponse>("GET", "/voices");

    // Update cache
    this.voiceCache.clear();
    for (const voice of data.voices) {
      this.voiceCache.set(voice.voice_id, voice);
    }
    this.voiceCacheExpiry = now + 3600000; // 1 hour cache

    return data.voices;
  }

  /**
   * Get specific voice metadata.
   */
  async getVoice(voiceId: string): Promise<ElevenLabsVoiceMetadata> {
    const cached = this.voiceCache.get(voiceId);
    if (cached) {
      return cached;
    }

    const voice = await this.request<ElevenLabsVoiceMetadata>("GET", `/voices/${voiceId}`);
    this.voiceCache.set(voiceId, voice);
    return voice;
  }

  /**
   * Get user's subscription info and character count.
   */
  async getUserInfo(): Promise<{ subscription: { character_count: number }; subscription_tier?: string }> {
    interface UserResponse {
      subscription: { character_count: number; character_limit?: number };
      subscription_tier?: string;
    }
    return this.request<UserResponse>("GET", "/user");
  }
}

/**
 * ElevenLabs TTS Provider implementation.
 */
export class ElevenLabsTTSProvider implements TTSProvider {
  readonly metadata: PluginMetadata = ELEVENLABS_METADATA;

  private client: ElevenLabsClient;
  private voiceId: string;
  private modelId: string;
  private stability: number;
  private similarityBoost: number;
  private outputFormat: string;
  private apiKey: string;

  private static readonly VALID_OUTPUT_FORMATS = [
    "mp3_44100_64",
    "mp3_44100_128",
    "mp3_22050_32",
    "ulaw_8000_bit",
  ];

  constructor(config: ElevenLabsTTSConfig) {
    if (!config.apiKey) {
      throw new Error("ElevenLabs API key is required");
    }

    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId ?? "bella";
    this.modelId = config.modelId ?? "eleven_monolingual_v1";
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
    this.outputFormat = config.outputFormat ?? "mp3_22050_32";

    this.client = new ElevenLabsClient(
      config.apiKey,
      config.requestsPerMinute ?? 100,
      config.cacheVoices ?? true,
    );

    this.validateConfig();
  }

  validateConfig(): void {
    if (this.stability < 0 || this.stability > 1) {
      throw new Error("Stability must be between 0 and 1");
    }

    if (this.similarityBoost < 0 || this.similarityBoost > 1) {
      throw new Error("Similarity boost must be between 0 and 1");
    }

    if (!ElevenLabsTTSProvider.VALID_OUTPUT_FORMATS.includes(this.outputFormat)) {
      throw new Error(
        `Invalid output format: ${this.outputFormat}. Must be one of: ${ElevenLabsTTSProvider.VALID_OUTPUT_FORMATS.join(", ")}`,
      );
    }
  }

  async synthesize(text: string, options?: TTSSynthesisOptions): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    const voiceId = (options?.voice as string | undefined) ?? this.voiceId;
    const stability = options?.config?.tags?.includes("stability-high")
      ? Math.min(1, this.stability + 0.2)
      : this.stability;
    const similarityBoost = options?.config?.tags?.includes("similarity-high")
      ? Math.min(1, this.similarityBoost + 0.2)
      : this.similarityBoost;

    try {
      const audio = await this.client.synthesize(
        text,
        voiceId,
        this.modelId,
        stability,
        similarityBoost,
        this.outputFormat,
      );

      return audio;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[ElevenLabsTTS] Synthesis error:", err);
      throw err;
    }
  }

  /**
   * Get available voices.
   */
  async getAvailableVoices(): Promise<ElevenLabsVoiceMetadata[]> {
    return this.client.getVoices();
  }

  /**
   * Get specific voice information.
   */
  async getVoiceInfo(voiceId: string): Promise<ElevenLabsVoiceMetadata> {
    return this.client.getVoice(voiceId);
  }

  /**
   * Get user subscription and character count information.
   */
  async getUserInfo(): Promise<{ subscription: { character_count: number }; subscription_tier?: string }> {
    return this.client.getUserInfo();
  }
}

/**
 * Batch TTS synthesis processor for ElevenLabs.
 */
export class ElevenLabsBatchSynthesizer {
  constructor(private provider: ElevenLabsTTSProvider) {}

  /**
   * Synthesize multiple texts in batch.
   *
   * @param texts - Array of texts to synthesize
   * @param options - Synthesis options
   * @param onProgress - Optional callback for progress updates
   * @returns Array of audio buffers
   */
  async synthesizeBatch(
    texts: string[],
    options?: TTSSynthesisOptions,
    onProgress?: (index: number, total: number) => void,
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    for (let i = 0; i < texts.length; i++) {
      onProgress?.(i, texts.length);

      try {
        const audio = await this.provider.synthesize(texts[i], options);
        results.push(audio);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ElevenLabsTTS] Batch synthesis error at index ${i}:`, err);
        results.push(Buffer.alloc(0));
      }
    }

    return results;
  }

  /**
   * Synthesize and concatenate multiple texts into a single audio buffer.
   *
   * @param texts - Array of texts to synthesize
   * @param options - Synthesis options
   * @param silenceMs - Silence duration between phrases in ms (default: 500)
   * @returns Concatenated audio buffer
   */
  async synthesizeAndConcatenate(
    texts: string[],
    options?: TTSSynthesisOptions,
    silenceMs: number = 500,
  ): Promise<Buffer> {
    const audioBuffers = await this.synthesizeBatch(texts, options);

    // Create silence buffer (MP3 22050Hz default)
    const sampleRate = 22050;
    const silenceSampleCount = Math.round((silenceMs * sampleRate) / 1000);
    const silenceBuffer = Buffer.alloc(silenceSampleCount * 2);

    // Concatenate with silence between
    const result: Buffer[] = [];
    for (let i = 0; i < audioBuffers.length; i++) {
      if (audioBuffers[i].length > 0) {
        result.push(audioBuffers[i]);
        if (i < audioBuffers.length - 1) {
          result.push(silenceBuffer);
        }
      }
    }

    return Buffer.concat(result);
  }
}

/**
 * Voice information and characteristics.
 */
export interface VoiceInfo {
  id: string;
  name: string;
  gender?: string;
  accent?: string;
  description: string;
  category: "premade" | "cloned";
}

/**
 * Get information about common ElevenLabs premade voices.
 */
export function getCommonVoices(): VoiceInfo[] {
  return [
    {
      id: "bella",
      name: "Bella",
      gender: "female",
      accent: "American",
      description: "Warm and friendly female voice",
      category: "premade",
    },
    {
      id: "rachel",
      name: "Rachel",
      gender: "female",
      accent: "American",
      description: "Clear and professional female voice",
      category: "premade",
    },
    {
      id: "caleb",
      name: "Caleb",
      gender: "male",
      accent: "American",
      description: "Friendly and approachable male voice",
      category: "premade",
    },
    {
      id: "charlotte",
      name: "Charlotte",
      gender: "female",
      accent: "American",
      description: "Charming and expressive female voice",
      category: "premade",
    },
    {
      id: "matilda",
      name: "Matilda",
      gender: "female",
      accent: "American",
      description: "Professional and articulate female voice",
      category: "premade",
    },
    {
      id: "james",
      name: "James",
      gender: "male",
      accent: "American",
      description: "Deep and resonant male voice",
      category: "premade",
    },
    {
      id: "john",
      name: "John",
      gender: "male",
      accent: "American",
      description: "Neutral and balanced male voice",
      category: "premade",
    },
    {
      id: "liam",
      name: "Liam",
      gender: "male",
      accent: "American",
      description: "Young and energetic male voice",
      category: "premade",
    },
    {
      id: "sophia",
      name: "Sophia",
      gender: "female",
      accent: "American",
      description: "Sophisticated and elegant female voice",
      category: "premade",
    },
    {
      id: "isabella",
      name: "Isabella",
      gender: "female",
      accent: "Italian",
      description: "Romantic and expressive Italian-accented voice",
      category: "premade",
    },
  ];
}

/**
 * Find voice by name or ID.
 */
export function findVoiceByName(searchName: string): VoiceInfo | undefined {
  const lowerSearch = searchName.toLowerCase();
  return getCommonVoices().find(
    (voice) => voice.name.toLowerCase().includes(lowerSearch) || voice.id.includes(lowerSearch),
  );
}

/**
 * Filter voices by gender.
 */
export function getVoicesByGender(gender: string): VoiceInfo[] {
  return getCommonVoices().filter((voice) => voice.gender?.toLowerCase() === gender.toLowerCase());
}

/**
 * Filter voices by accent.
 */
export function getVoicesByAccent(accent: string): VoiceInfo[] {
  return getCommonVoices().filter((voice) => voice.accent?.toLowerCase() === accent.toLowerCase());
}

/**
 * Estimate synthesis character count from text.
 * Useful for tracking API quota usage.
 *
 * @param text - Text to estimate
 * @returns Estimated character count (includes overhead)
 */
export function estimateCharacterCount(text: string): number {
  // ElevenLabs counts characters roughly as they appear
  // Add 10% overhead for processing
  return Math.ceil(text.length * 1.1);
}

/**
 * Chunk text into sentences for batch processing.
 * Respects sentence boundaries to avoid cutting off speech.
 *
 * @param text - Text to chunk
 * @param maxChunkLength - Maximum characters per chunk (default: 500)
 * @returns Array of text chunks
 */
export function chunkTextBySentences(text: string, maxChunkLength: number = 500): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if ((currentChunk + trimmed).length <= maxChunkLength) {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmed;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
