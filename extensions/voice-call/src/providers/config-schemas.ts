/**
 * Configuration Schemas for Local STT/TTS Providers
 *
 * Provides validation and type-safe configuration for all local voice providers.
 * Compatible with Zod or custom validation.
 */

import { Type } from "@sinclair/typebox";
import type {
  WhisperLocalSTTConfig,
  WhisperModelSize,
} from "./stt-whisper-local.js";
import type { KokoroTTSConfig, KokoroVoice } from "./tts-kokoro.js";
import type { PiperTTSConfig, PiperLanguage } from "./tts-piper.js";

/**
 * TypeBox schema for Whisper Local STT configuration.
 * Provides JSON schema validation and type safety.
 */
export const WhisperLocalSTTConfigSchema = Type.Object({
  instanceId: Type.Optional(Type.String({ description: "Unique instance identifier" })),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags for categorization/filtering",
    }),
  ),
  modelSize: Type.Optional(
    Type.Union(
      [
        Type.Literal("tiny"),
        Type.Literal("small"),
        Type.Literal("base"),
        Type.Literal("medium"),
        Type.Literal("large"),
      ],
      {
        default: "base",
        description: "Model size to use (impacts quality vs speed)",
        examples: ["tiny", "small", "base", "medium", "large"],
      },
    ),
  ),
  language: Type.Optional(
    Type.String({
      default: "auto",
      description: 'Language code (e.g., "en", "es") or "auto" for detection',
      pattern: "^(auto|[a-z]{2}(-[A-Z]{2})?)$",
    }),
  ),
  wordTimestamps: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Enable word-level timestamps in transcription",
    }),
  ),
  modelPath: Type.Optional(
    Type.String({
      description: "Path to custom model directory",
    }),
  ),
  transcriptionTimeoutMs: Type.Optional(
    Type.Number({
      default: 60000,
      minimum: 1000,
      description: "Timeout for transcription in milliseconds",
    }),
  ),
  batchSize: Type.Optional(
    Type.Number({
      default: 1,
      minimum: 1,
      description: "Batch size for processing audio chunks",
    }),
  ),
});

/**
 * TypeBox schema for Kokoro TTS configuration.
 */
export const KokoroTTSConfigSchema = Type.Object({
  instanceId: Type.Optional(Type.String({ description: "Unique instance identifier" })),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags for categorization/filtering",
    }),
  ),
  voice: Type.Optional(
    Type.Union(
      [
        Type.Literal("af_bella"),
        Type.Literal("af_sarah"),
        Type.Literal("af_nicole"),
        Type.Literal("am_michael"),
        Type.Literal("am_joshua"),
        Type.Literal("am_brandon"),
        Type.Literal("bf_emma"),
        Type.Literal("bm_george"),
      ],
      {
        default: "af_bella",
        description: "Voice identifier",
      },
    ),
  ),
  speed: Type.Optional(
    Type.Number({
      default: 1.0,
      minimum: 0.5,
      maximum: 2.0,
      description: "Speaking speed multiplier",
    }),
  ),
  modelPath: Type.Optional(
    Type.String({
      description: "Path to model directory",
    }),
  ),
  validateSpeaker: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Enable speaker ID validation",
    }),
  ),
});

/**
 * TypeBox schema for Piper TTS configuration.
 */
export const PiperTTSConfigSchema = Type.Object({
  instanceId: Type.Optional(Type.String({ description: "Unique instance identifier" })),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags for categorization/filtering",
    }),
  ),
  language: Type.Optional(
    Type.Union(
      [
        Type.Literal("en"),
        Type.Literal("es"),
        Type.Literal("fr"),
        Type.Literal("de"),
        Type.Literal("it"),
        Type.Literal("pt"),
        Type.Literal("nl"),
        Type.Literal("ru"),
        Type.Literal("pl"),
        Type.Literal("ja"),
        Type.Literal("ko"),
        Type.Literal("zh"),
        Type.Literal("ar"),
        Type.Literal("hi"),
        Type.Literal("tr"),
        Type.Literal("vi"),
        Type.Literal("th"),
        Type.Literal("el"),
        Type.Literal("hu"),
        Type.Literal("cs"),
      ],
      {
        default: "en",
        description: "Language code",
      },
    ),
  ),
  voice: Type.Optional(
    Type.String({
      description: "Voice name for the selected language",
      examples: ["en_US-amy-medium", "en_US-arctic-medium"],
    }),
  ),
  speed: Type.Optional(
    Type.Number({
      default: 1.0,
      minimum: 0.5,
      maximum: 2.0,
      description: "Speaking speed multiplier",
    }),
  ),
  speakerId: Type.Optional(
    Type.Number({
      default: 0,
      minimum: 0,
      description: "Speaker ID for multi-speaker models",
    }),
  ),
  modelPath: Type.String({
    description: "Path to model directory (required)",
  }),
  validateSpeaker: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Enable speaker ID validation",
    }),
  ),
  outputFormat: Type.Optional(
    Type.Union([Type.Literal("pcm"), Type.Literal("mulaw"), Type.Literal("wav")], {
      default: "pcm",
      description: "Output audio format",
    }),
  ),
});

/**
 * UI hints for configuration fields.
 */
export const ConfigUIHints = {
  whisperLocal: {
    modelSize: {
      label: "Model Size",
      help: "Larger models are more accurate but slower. tiny=fastest, large=most accurate",
      advanced: false,
    },
    language: {
      label: "Language",
      help: 'Language code (e.g., "en" for English) or "auto" for auto-detection',
      advanced: false,
    },
    wordTimestamps: {
      label: "Word-level Timestamps",
      help: "Include timestamp for each word in transcription",
      advanced: true,
    },
    modelPath: {
      label: "Model Directory",
      help: "Path to custom Whisper model directory",
      advanced: true,
    },
    transcriptionTimeoutMs: {
      label: "Timeout (ms)",
      help: "Maximum time to wait for transcription",
      advanced: true,
    },
    batchSize: {
      label: "Batch Size",
      help: "Number of audio chunks to process at once",
      advanced: true,
    },
  },
  kokoro: {
    voice: {
      label: "Voice",
      help: "Select from available voices (af=American Female, am=American Male, bf=British Female, bm=British Male)",
      advanced: false,
    },
    speed: {
      label: "Speed",
      help: "Speaking speed (0.5=slower, 1.0=normal, 2.0=faster)",
      advanced: false,
    },
    modelPath: {
      label: "Model Directory",
      help: "Path to Kokoro model files",
      advanced: true,
    },
    validateSpeaker: {
      label: "Validate Speaker",
      help: "Enable speaker ID validation",
      advanced: true,
    },
  },
  piper: {
    language: {
      label: "Language",
      help: "Target language for synthesis",
      advanced: false,
    },
    voice: {
      label: "Voice",
      help: "Voice name for the selected language",
      advanced: false,
    },
    speed: {
      label: "Speed",
      help: "Speaking speed (0.5=slower, 1.0=normal, 2.0=faster)",
      advanced: false,
    },
    speakerId: {
      label: "Speaker ID",
      help: "Speaker ID for multi-speaker models",
      advanced: true,
    },
    modelPath: {
      label: "Model Directory",
      help: "Path to Piper model directory (required)",
      advanced: false,
    },
    outputFormat: {
      label: "Output Format",
      help: "Audio format: pcm=raw PCM, mulaw=mu-law (Twilio), wav=WAV file",
      advanced: true,
    },
  },
};

/**
 * Validate Whisper Local configuration.
 */
export function validateWhisperLocalConfig(
  config: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    return { valid: false, errors: ["Configuration must be an object"] };
  }

  const cfg = config as Record<string, unknown>;

  // Validate modelSize
  if (cfg.modelSize !== undefined) {
    const validSizes = ["tiny", "small", "base", "medium", "large"];
    if (!validSizes.includes(cfg.modelSize as string)) {
      errors.push(`Invalid modelSize: must be one of ${validSizes.join(", ")}`);
    }
  }

  // Validate language
  if (cfg.language !== undefined) {
    const lang = cfg.language as string;
    if (lang !== "auto" && !/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
      errors.push("Invalid language: use ISO-639-1 format or 'auto'");
    }
  }

  // Validate wordTimestamps
  if (cfg.wordTimestamps !== undefined && typeof cfg.wordTimestamps !== "boolean") {
    errors.push("wordTimestamps must be a boolean");
  }

  // Validate transcriptionTimeoutMs
  if (cfg.transcriptionTimeoutMs !== undefined) {
    const timeout = cfg.transcriptionTimeoutMs as number;
    if (typeof timeout !== "number" || timeout < 1000) {
      errors.push("transcriptionTimeoutMs must be a number >= 1000");
    }
  }

  // Validate batchSize
  if (cfg.batchSize !== undefined) {
    const size = cfg.batchSize as number;
    if (typeof size !== "number" || size < 1) {
      errors.push("batchSize must be a number >= 1");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Kokoro TTS configuration.
 */
export function validateKokoroConfig(
  config: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    return { valid: false, errors: ["Configuration must be an object"] };
  }

  const cfg = config as Record<string, unknown>;

  // Validate voice
  if (cfg.voice !== undefined) {
    const validVoices = [
      "af_bella",
      "af_sarah",
      "af_nicole",
      "am_michael",
      "am_joshua",
      "am_brandon",
      "bf_emma",
      "bm_george",
    ];
    if (!validVoices.includes(cfg.voice as string)) {
      errors.push(`Invalid voice: must be one of ${validVoices.join(", ")}`);
    }
  }

  // Validate speed
  if (cfg.speed !== undefined) {
    const speed = cfg.speed as number;
    if (typeof speed !== "number" || speed < 0.5 || speed > 2.0) {
      errors.push("speed must be a number between 0.5 and 2.0");
    }
  }

  // Validate validateSpeaker
  if (cfg.validateSpeaker !== undefined && typeof cfg.validateSpeaker !== "boolean") {
    errors.push("validateSpeaker must be a boolean");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Piper TTS configuration.
 */
export function validatePiperConfig(
  config: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    return { valid: false, errors: ["Configuration must be an object"] };
  }

  const cfg = config as Record<string, unknown>;

  // Validate modelPath (required)
  if (!cfg.modelPath || typeof cfg.modelPath !== "string") {
    errors.push("modelPath is required and must be a string");
  }

  // Validate language
  if (cfg.language !== undefined) {
    const validLangs = [
      "en",
      "es",
      "fr",
      "de",
      "it",
      "pt",
      "nl",
      "ru",
      "pl",
      "ja",
      "ko",
      "zh",
      "ar",
      "hi",
      "tr",
      "vi",
      "th",
      "el",
      "hu",
      "cs",
    ];
    if (!validLangs.includes(cfg.language as string)) {
      errors.push(`Invalid language: must be one of ${validLangs.join(", ")}`);
    }
  }

  // Validate speed
  if (cfg.speed !== undefined) {
    const speed = cfg.speed as number;
    if (typeof speed !== "number" || speed < 0.5 || speed > 2.0) {
      errors.push("speed must be a number between 0.5 and 2.0");
    }
  }

  // Validate speakerId
  if (cfg.speakerId !== undefined) {
    const id = cfg.speakerId as number;
    if (typeof id !== "number" || id < 0) {
      errors.push("speakerId must be a non-negative number");
    }
  }

  // Validate outputFormat
  if (cfg.outputFormat !== undefined) {
    const validFormats = ["pcm", "mulaw", "wav"];
    if (!validFormats.includes(cfg.outputFormat as string)) {
      errors.push(`Invalid outputFormat: must be one of ${validFormats.join(", ")}`);
    }
  }

  // Validate validateSpeaker
  if (cfg.validateSpeaker !== undefined && typeof cfg.validateSpeaker !== "boolean") {
    errors.push("validateSpeaker must be a boolean");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate configuration safely.
 */
export function parseAndValidateConfig<T>(
  input: unknown,
  validator: (config: unknown) => { valid: boolean; errors: string[] },
): { success: boolean; data?: T; errors?: string[] } {
  const result = validator(input);

  if (result.valid) {
    return { success: true, data: input as T };
  }

  return { success: false, errors: result.errors };
}
