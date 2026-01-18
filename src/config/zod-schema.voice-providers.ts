import { z } from "zod";

/**
 * Voice Providers Configuration Schema
 * Defines the structure for STT/TTS provider configuration
 */

// Shared base schema for local STT providers
const STTBaseConfigSchema = z.object({
  modelSize: z.enum(["tiny", "small", "base", "medium", "large"]).optional(),
  language: z.string().optional(),
});

// Whisper-specific schema
export const WhisperConfigSchema = z
  .object({
    type: z.literal("whisper"),
    deploymentMode: z.enum(["docker", "system"]).optional(),
    dockerPort: z.number().int().min(1).max(65535).optional(),
    dockerImage: z.string().optional(),
    pythonPath: z.string().optional(),
    cachePath: z.string().optional(),
    ...STTBaseConfigSchema.shape,
  })
  .optional();

// Faster-Whisper-specific schema with extended options
export const FasterWhisperConfigSchema = z
  .object({
    type: z.literal("faster-whisper"),
    deploymentMode: z.enum(["docker", "system"]).optional(),
    dockerPort: z.number().int().min(1).max(65535).optional(),
    dockerImage: z.string().optional(),
    computeType: z.enum(["int8", "float16", "float32"]).optional(),
    cpuThreads: z.number().int().positive().optional(),
    beamSize: z.number().int().min(1).max(512).optional(),
    ...STTBaseConfigSchema.shape,
  })
  .optional();

// Cloud STT providers schema (OpenAI, Google, Azure)
export const CloudSTTConfigSchema = z
  .object({
    type: z.enum(["openai", "google", "azure"]),
    service: z.string(),
    apiKey: z.string(),
    model: z.string().optional(),
    language: z.string().optional(),
  })
  .optional();

// Discriminated union for STT configuration
export const STTProviderConfigSchema = z.union([
  WhisperConfigSchema,
  FasterWhisperConfigSchema,
  CloudSTTConfigSchema,
]);

export const TTSProviderConfigSchema = z
  .object({
    type: z.enum(["cloud", "local", "kokoro", "piper", "elevenlabs", "openai", "google", "azure", "cartesia"]),
    service: z.string().optional(),
    voice: z.string().optional(),
    voiceId: z.string().optional(),
    model: z.string().optional(),
    speed: z.number().min(0.5).max(2.0).optional(),
    pitch: z.number().min(0.5).max(2.0).optional(),
    apiKey: z.string().optional(),
    emotion: z.enum(["neutral", "happy", "sad", "angry", "surprised"]).optional(),
    language: z.string().optional(),
    timeout: z.number().positive().optional(),
    connectionPoolSize: z.number().int().positive().optional(),
    outputFormat: z.string().optional(),
  })
  .optional();

export const VoiceProviderEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  stt: STTProviderConfigSchema.optional(),
  tts: TTSProviderConfigSchema.optional(),
});

export const SystemCapabilitiesSchema = z.object({
  cpuCount: z.number(),
  totalMemoryGb: z.number(),
  diskSpaceGb: z.number(),
  gpuAvailable: z.boolean(),
  gpuMemoryGb: z.number(),
});

export const VoiceProvidersConfigSchema = z.object({
  enabled: z.boolean().default(false),
  providers: z.array(VoiceProviderEntrySchema).default([]),
  fallbackChain: z.array(z.string()).optional(),
  defaultSttProviderId: z.string().optional(),
  defaultTtsProviderId: z.string().optional(),
  stt: STTProviderConfigSchema.optional(),
  tts: TTSProviderConfigSchema.optional(),
  autoDetectCapabilities: z.boolean().default(true),
  systemCapabilities: SystemCapabilitiesSchema.optional(),
  migrationMetadata: z
    .object({
      migratedFrom: z.string().optional(),
      migratedAt: z.string().optional(),
    })
    .optional(),
});

export const VoiceConfigSchema = z
  .object({
    providers: VoiceProvidersConfigSchema.optional(),
  })
  .optional();

// Re-export narrowed types from types.voice.ts for type safety
export type {
  STTProviderConfig,
  WhisperConfig,
  FasterWhisperConfig,
  CloudSTTConfig,
} from "./types.voice.js";

export type TTSProviderConfig = z.infer<typeof TTSProviderConfigSchema>;
export type VoiceProviderEntry = z.infer<typeof VoiceProviderEntrySchema>;
export type SystemCapabilities = z.infer<typeof SystemCapabilitiesSchema>;
export type VoiceProvidersConfigData = z.infer<typeof VoiceProvidersConfigSchema>;
export type VoiceProvidersConfig = z.infer<typeof VoiceProvidersConfigSchema>;
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

// Additional schema exports for narrowed type checking
export const WhisperConfigSchemaExport = WhisperConfigSchema;
export const FasterWhisperConfigSchemaExport = FasterWhisperConfigSchema;
export const CloudSTTConfigSchemaExport = CloudSTTConfigSchema;
