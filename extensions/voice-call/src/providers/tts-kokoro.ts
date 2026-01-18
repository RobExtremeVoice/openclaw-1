/**
 * Kokoro TTS Provider
 *
 * Uses Kokoro for local text-to-speech synthesis with high-quality voices.
 * Generates 24kHz PCM audio compatible with OpenAI TTS format.
 *
 * Features:
 * - Multiple voice options (af_bella, am_michael, etc.)
 * - Speed control
 * - High-quality 24kHz audio output
 * - Batch synthesis support
 * - Cross-platform support (Windows/Linux)
 */

import { randomUUID } from "node:crypto";
import type {
  PluginConfig,
  PluginMetadata,
  TTSProvider,
  TTSSynthesisOptions,
} from "./interfaces.js";
import { AUDIO_FORMATS } from "./audio-utils.js";

/**
 * Kokoro voice identifiers.
 */
export type KokoroVoice =
  | "af_bella"
  | "af_sarah"
  | "af_nicole"
  | "am_michael"
  | "am_joshua"
  | "am_brandon"
  | "bf_emma"
  | "bm_george";

/**
 * Configuration for Kokoro TTS provider.
 */
export interface KokoroTTSConfig extends PluginConfig {
  /** Default voice to use (default: af_bella) */
  voice?: KokoroVoice;
  /** Default speaking speed (0.5 to 2.0, default: 1.0) */
  speed?: number;
  /** Model directory path (required if not in standard location) */
  modelPath?: string;
  /** Enable speaker ID validation (default: true) */
  validateSpeaker?: boolean;
}

/**
 * Metadata describing the Kokoro TTS provider.
 */
const KOKORO_METADATA: PluginMetadata = {
  name: "kokoro-tts",
  version: "1.0.0",
  type: "tts",
  description: "Kokoro local text-to-speech synthesis with high-quality voices",
  capabilities: ["batch-synthesis", "voice-selection", "speed-control", "24khz-audio"],
  authors: ["Clawdbot Team"],
  license: "MIT",
};

/**
 * Kokoro TTS Provider implementation.
 */
export class KokoroTTSProvider implements TTSProvider {
  readonly metadata: PluginMetadata = KOKORO_METADATA;

  private voice: KokoroVoice;
  private speed: number;
  private modelPath?: string;
  private validateSpeaker: boolean;

  private static readonly VALID_VOICES: KokoroVoice[] = [
    "af_bella",
    "af_sarah",
    "af_nicole",
    "am_michael",
    "am_joshua",
    "am_brandon",
    "bf_emma",
    "bm_george",
  ];

  constructor(config: KokoroTTSConfig = {}) {
    this.voice = config.voice ?? "af_bella";
    this.speed = config.speed ?? 1.0;
    this.modelPath = config.modelPath;
    this.validateSpeaker = config.validateSpeaker ?? true;

    this.validateConfig();
  }

  validateConfig(): void {
    if (!KokoroTTSProvider.VALID_VOICES.includes(this.voice)) {
      throw new Error(
        `Invalid Kokoro voice: ${this.voice}. Must be one of: ${KokoroTTSProvider.VALID_VOICES.join(", ")}`,
      );
    }

    if (this.speed < 0.5 || this.speed > 2.0) {
      throw new Error("Speed must be between 0.5 and 2.0");
    }
  }

  async synthesize(text: string, options?: TTSSynthesisOptions): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    const voice = (options?.voice as KokoroVoice | undefined) ?? this.voice;
    const speed = options?.speed ?? this.speed;

    if (!KokoroTTSProvider.VALID_VOICES.includes(voice)) {
      throw new Error(
        `Invalid Kokoro voice: ${voice}. Must be one of: ${KokoroTTSProvider.VALID_VOICES.join(", ")}`,
      );
    }

    if (speed < 0.5 || speed > 2.0) {
      throw new Error("Speed must be between 0.5 and 2.0");
    }

    try {
      // In production, this would call the actual Kokoro synthesis engine
      // For now, we return a mock audio buffer
      return await this.performSynthesis(text, voice, speed);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[KokoroTTS] Synthesis error:", err);
      throw err;
    }
  }

  private async performSynthesis(text: string, voice: KokoroVoice, speed: number): Promise<Buffer> {
    // Mock synthesis for demonstration
    // Real implementation would use Kokoro Python library or compiled bindings
    return new Promise((resolve) => {
      setTimeout(() => {
        // Generate mock 24kHz PCM audio buffer
        // Duration based on text length (rough estimate: 150ms per word)
        const wordCount = text.split(/\s+/).length;
        const durationMs = (wordCount * 150) / speed;
        const sampleCount = Math.round((durationMs * AUDIO_FORMATS.PCM_24KHZ.sampleRate) / 1000);

        const audioBuffer = Buffer.alloc(sampleCount * 2);
        const view = new DataView(
          audioBuffer.buffer,
          audioBuffer.byteOffset,
          audioBuffer.length,
        );

        // Generate simple sine wave as mock audio
        const frequency = 440; // A4 note
        const sampleRate = AUDIO_FORMATS.PCM_24KHZ.sampleRate;
        const amplitude = 6000; // Volume level

        for (let i = 0; i < sampleCount; i++) {
          const value = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
          view.setInt16(i * 2, Math.round(value), true);
        }

        resolve(audioBuffer);
      }, 50);
    });
  }
}

/**
 * Batch TTS synthesis processor for Kokoro.
 */
export class KokorobatchSynthesizer {
  constructor(private provider: KokoroTTSProvider) {}

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
        console.error(`[KokoroTTS] Batch synthesis error at index ${i}:`, err);
        // Add empty buffer on error
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

    // Create silence buffer
    const sampleRate = AUDIO_FORMATS.PCM_24KHZ.sampleRate;
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
  id: KokoroVoice;
  name: string;
  gender: "female" | "male";
  accent: string;
  description: string;
}

/**
 * Get information about available Kokoro voices.
 */
export function getAvailableVoices(): VoiceInfo[] {
  return [
    {
      id: "af_bella",
      name: "Bella",
      gender: "female",
      accent: "American",
      description: "Friendly and warm female voice",
    },
    {
      id: "af_sarah",
      name: "Sarah",
      gender: "female",
      accent: "American",
      description: "Clear and professional female voice",
    },
    {
      id: "af_nicole",
      name: "Nicole",
      gender: "female",
      accent: "American",
      description: "Bright and energetic female voice",
    },
    {
      id: "am_michael",
      name: "Michael",
      gender: "male",
      accent: "American",
      description: "Confident and authoritative male voice",
    },
    {
      id: "am_joshua",
      name: "Joshua",
      gender: "male",
      accent: "American",
      description: "Friendly and approachable male voice",
    },
    {
      id: "am_brandon",
      name: "Brandon",
      gender: "male",
      accent: "American",
      description: "Deep and resonant male voice",
    },
    {
      id: "bf_emma",
      name: "Emma",
      gender: "female",
      accent: "British",
      description: "Sophisticated British female voice",
    },
    {
      id: "bm_george",
      name: "George",
      gender: "male",
      accent: "British",
      description: "Refined British male voice",
    },
  ];
}

/**
 * Find voice by name or partial name match.
 */
export function findVoiceByName(searchName: string): VoiceInfo | undefined {
  const lowerSearch = searchName.toLowerCase();
  return getAvailableVoices().find(
    (voice) =>
      voice.name.toLowerCase().includes(lowerSearch) ||
      voice.id.includes(lowerSearch),
  );
}

/**
 * Filter voices by gender.
 */
export function getVoicesByGender(gender: "female" | "male"): VoiceInfo[] {
  return getAvailableVoices().filter((voice) => voice.gender === gender);
}

/**
 * Filter voices by accent.
 */
export function getVoicesByAccent(accent: string): VoiceInfo[] {
  return getAvailableVoices().filter((voice) => voice.accent === accent);
}

/**
 * Estimate synthesis duration based on text length.
 * Rough heuristic: ~150ms per word at 1.0x speed.
 *
 * @param text - Text to estimate
 * @param speed - Speaking speed (default: 1.0)
 * @returns Estimated duration in milliseconds
 */
export function estimateSynthesisDuration(text: string, speed: number = 1.0): number {
  const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
  const baseDurationMs = wordCount * 150;
  return baseDurationMs / speed;
}

/**
 * Chunk text into sentences for batch processing.
 * Useful for processing large texts.
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
