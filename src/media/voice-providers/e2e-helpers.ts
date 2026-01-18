/**
 * E2E Test Helpers and Utilities
 *
 * Provides test fixtures, audio utilities, and assertion helpers for
 * integration testing of the VoiceOrchestrator and all 7 providers.
 */

import { randomBytes } from 'crypto';
import type {
  AudioBuffer,
  TranscriptionResult,
  SynthesisOptions,
  ProviderCapabilities,
} from './executor.js';
import { AudioFormat } from './executor.js';
import type { VoiceProvidersConfig, VoiceProviderEntry } from '../../config/zod-schema.voice-providers.js';

/**
 * Create minimal PCM audio buffer for testing
 */
export function createTestAudioBuffer(
  duration: number = 1.0,
  sampleRate: number = 16000,
  channels: number = 1,
): AudioBuffer {
  const samples = Math.floor(duration * sampleRate * channels);
  const data = new Uint8Array(samples * 2); // 16-bit PCM
  randomBytes(data.length).copy(Buffer.from(data));

  return {
    data,
    format: AudioFormat.PCM_16,
    sampleRate,
    duration,
    channels,
  };
}

/**
 * Create silent audio buffer for synthesis testing
 */
export function createSilentAudioBuffer(
  duration: number = 1.0,
  sampleRate: number = 16000,
  channels: number = 1,
): AudioBuffer {
  const samples = Math.floor(duration * sampleRate * channels);
  const data = new Uint8Array(samples * 2); // 16-bit PCM, all zeros

  return {
    data,
    format: AudioFormat.PCM_16,
    sampleRate,
    duration,
    channels,
  };
}

/**
 * Create audio buffer with specific format
 */
export function createAudioBufferWithFormat(
  format: AudioFormat,
  duration: number = 1.0,
  sampleRate: number = 16000,
): AudioBuffer {
  let dataSize: number;
  switch (format) {
    case AudioFormat.PCM_16:
      dataSize = Math.floor(duration * sampleRate * 2);
      break;
    case AudioFormat.OPUS:
      dataSize = Math.floor(duration * sampleRate * 0.1); // Opus is compressed
      break;
    case AudioFormat.AAC:
      dataSize = Math.floor(duration * sampleRate * 0.125); // AAC typical bitrate
      break;
    case AudioFormat.MP3:
      dataSize = Math.floor(duration * sampleRate * 0.125); // MP3 typical bitrate
      break;
    case AudioFormat.VORBIS:
      dataSize = Math.floor(duration * sampleRate * 0.125); // Vorbis typical bitrate
      break;
  }

  const data = new Uint8Array(dataSize);
  randomBytes(data.length).copy(Buffer.from(data));

  return {
    data,
    format,
    sampleRate,
    duration,
    channels: 1,
  };
}

/**
 * Assertion helper: verify audio buffer is valid
 */
export function assertValidAudioBuffer(
  buffer: AudioBuffer,
  expectedFormat?: AudioFormat,
  expectedDuration?: number,
): void {
  if (!buffer) {
    throw new Error('Audio buffer is null or undefined');
  }

  if (!buffer.data || buffer.data.length === 0) {
    throw new Error('Audio buffer data is empty');
  }

  if (!buffer.format) {
    throw new Error('Audio buffer format is not set');
  }

  if (buffer.sampleRate < 8000 || buffer.sampleRate > 48000) {
    throw new Error(`Invalid sample rate: ${buffer.sampleRate}`);
  }

  if (buffer.channels < 1 || buffer.channels > 8) {
    throw new Error(`Invalid channel count: ${buffer.channels}`);
  }

  if (buffer.duration <= 0) {
    throw new Error(`Invalid duration: ${buffer.duration}`);
  }

  if (expectedFormat && buffer.format !== expectedFormat) {
    throw new Error(
      `Expected format ${expectedFormat}, got ${buffer.format}`,
    );
  }

  if (expectedDuration && Math.abs(buffer.duration - expectedDuration) > 0.1) {
    throw new Error(
      `Expected duration ~${expectedDuration}s, got ${buffer.duration}s`,
    );
  }
}

/**
 * Assertion helper: verify transcription result
 */
export function assertValidTranscriptionResult(
  result: TranscriptionResult,
  expectedProvider?: string,
): void {
  if (!result) {
    throw new Error('Transcription result is null or undefined');
  }

  if (typeof result.text !== 'string') {
    throw new Error('Transcription text is not a string');
  }

  if (result.duration <= 0) {
    throw new Error(`Invalid duration: ${result.duration}`);
  }

  if (!result.provider) {
    throw new Error('Provider name is not set');
  }

  if (expectedProvider && result.provider !== expectedProvider) {
    throw new Error(
      `Expected provider ${expectedProvider}, got ${result.provider}`,
    );
  }

  if (result.confidence !== undefined) {
    if (result.confidence < 0 || result.confidence > 1) {
      throw new Error(
        `Confidence must be between 0 and 1, got ${result.confidence}`,
      );
    }
  }
}

/**
 * Provider capability generator for testing
 */
export function createProviderCapabilities(
  type: 'stt' | 'tts',
  overrides?: Partial<ProviderCapabilities>,
): ProviderCapabilities {
  const baseCapabilities: ProviderCapabilities = {
    supportedFormats: [AudioFormat.PCM_16, AudioFormat.OPUS],
    supportedSampleRates: [16000, 24000],
    supportedLanguages: ['en', 'es', 'fr'],
    supportsStreaming: true,
    maxConcurrentSessions: 10,
    estimatedLatencyMs: type === 'stt' ? 500 : 200,
    requiresNetworkConnection: true,
    requiresLocalModel: false,
  };

  return { ...baseCapabilities, ...overrides };
}

/**
 * Test configuration factory for all 7 providers
 */
export function createTestVoiceProvidersConfig(): NonNullable<VoiceProvidersConfig> {
  return {
    enabled: true,
    autoDetectCapabilities: true,
    providers: [
      // Priority 1: Deepgram (cloud STT)
      {
        id: 'deepgram',
        name: 'Deepgram',
        enabled: true,
        priority: 1,
        stt: {
          type: 'openai',
          apiKey: 'test-deepgram-key',
          service: 'deepgram',
          model: 'nova-2',
          language: 'en',
        },
      },
      // Priority 2: ElevenLabs (cloud TTS)
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        enabled: true,
        priority: 1,
        tts: {
          type: 'elevenlabs',
          service: 'elevenlabs',
          apiKey: 'test-elevenlabs-key',
          voiceId: 'EXAVITQu4vr4xnSDxMaL',
          model: 'eleven_monolingual_v1',
        },
      },
      // Priority 3: Cartesia (cloud TTS)
      {
        id: 'cartesia',
        name: 'Cartesia',
        enabled: true,
        priority: 2,
        tts: {
          type: 'cartesia',
          service: 'cartesia',
          apiKey: 'test-cartesia-key',
          voiceId: 'default',
          model: 'sonic-3',
        },
      },
      // Priority 4: Faster Whisper (docker STT)
      {
        id: 'faster-whisper',
        name: 'Faster Whisper',
        enabled: true,
        priority: 2,
        stt: {
          type: 'faster-whisper',
          modelSize: 'base',
          language: 'en',
        },
      },
      // Priority 5: Kokoro (docker TTS)
      {
        id: 'kokoro',
        name: 'Kokoro',
        enabled: true,
        priority: 3,
        tts: {
          type: 'kokoro',
          model: 'kokoro',
          voiceId: 'af_heart',
          language: 'en',
        },
      },
      // Priority 6: System Whisper (system STT)
      {
        id: 'whisper-system',
        name: 'Whisper System',
        enabled: true,
        priority: 3,
        stt: {
          type: 'whisper',
          modelSize: 'base',
          language: 'en',
        },
      },
      // Priority 7: Piper (system TTS)
      {
        id: 'piper',
        name: 'Piper',
        enabled: true,
        priority: 4,
        tts: {
          type: 'piper',
          model: 'piper',
          voiceId: 'en_US-hfc_female-medium',
          language: 'en',
        },
      },
    ],
  };
}

/**
 * Create provider config for specific providers
 */
export function createProviderConfig(
  providerIds: string[],
): VoiceProvidersConfig {
  const allConfig = createTestVoiceProvidersConfig();
  return {
    enabled: true,
    autoDetectCapabilities: true,
    providers: allConfig.providers?.filter((p) => providerIds.includes(p.id)) ?? [],
  };
}

/**
 * Create provider config with priorities
 */
export function createProviderConfigWithPriorities(
  providers: Array<{ id: string; priority: number }>,
): VoiceProvidersConfig {
  const allConfig = createTestVoiceProvidersConfig();
  const providerIds = new Set(providers.map((p) => p.id));

  // Filter to only requested providers and update priorities
  const updated = (allConfig.providers ?? [])
    .filter((p) => providerIds.has(p.id))
    .map((p) => {
      const priorityConfig = providers.find((pr) => pr.id === p.id);
      if (priorityConfig) {
        return { ...p, priority: priorityConfig.priority };
      }
      return p;
    });

  return {
    enabled: true,
    autoDetectCapabilities: true,
    providers: updated,
  };
}

/**
 * Mock logger for testing
 */
export function createMockLogger(): {
  debug: (msg: string, meta?: any) => void;
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
  getLogs: () => Array<{ level: string; message: string; meta?: any }>;
  clear: () => void;
} {
  const logs: Array<{ level: string; message: string; meta?: any }> = [];

  return {
    debug: (msg: string, meta?: any) => logs.push({ level: 'debug', message: msg, meta }),
    info: (msg: string, meta?: any) => logs.push({ level: 'info', message: msg, meta }),
    warn: (msg: string, meta?: any) => logs.push({ level: 'warn', message: msg, meta }),
    error: (msg: string, meta?: any) => logs.push({ level: 'error', message: msg, meta }),
    getLogs: () => logs,
    clear: () => logs.splice(0, logs.length),
  };
}

/**
 * Wait utility for testing async operations
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100,
): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition (${timeoutMs}ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }
}

/**
 * Simulate network delay
 */
export async function simulateNetworkDelay(delayMs: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Create a promise that resolves/rejects after delay
 */
export function createDelayedPromise<T>(
  value: T,
  delayMs: number,
  shouldReject: boolean = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldReject) {
        reject(new Error(`Simulated error after ${delayMs}ms`));
      } else {
        resolve(value);
      }
    }, delayMs);
  });
}

/**
 * Assertion helper: verify synthesis options are applied correctly
 */
export function assertSynthesisOptionsApplied(
  options: SynthesisOptions,
  expectedSettings: Partial<SynthesisOptions>,
): void {
  for (const [key, expectedValue] of Object.entries(expectedSettings)) {
    const actualValue = (options as Record<string, any>)[key];
    if (actualValue !== expectedValue) {
      throw new Error(
        `Expected ${key} to be ${expectedValue}, got ${actualValue}`,
      );
    }
  }
}

/**
 * Extract provider metrics from logs
 */
export function extractMetricsFromLogs(
  logs: Array<{ level: string; message: string; meta?: any }>,
): {
  successCount: number;
  failureCount: number;
  providerCalls: Map<string, number>;
} {
  const metrics = {
    successCount: 0,
    failureCount: 0,
    providerCalls: new Map<string, number>(),
  };

  for (const log of logs) {
    if (log.message.includes('success')) metrics.successCount++;
    if (log.message.includes('failed') || log.message.includes('error'))
      metrics.failureCount++;

    if (log.meta?.provider) {
      const count = metrics.providerCalls.get(log.meta.provider) || 0;
      metrics.providerCalls.set(log.meta.provider, count + 1);
    }
  }

  return metrics;
}

/**
 * Verify fallback chain execution
 */
export function verifyFallbackChainExecution(
  logs: Array<{ level: string; message: string; meta?: any }>,
  expectedProviderOrder: string[],
): boolean {
  let currentIndex = 0;

  for (const log of logs) {
    if (log.message.includes('fallback') || log.message.includes('Trying provider')) {
      if (currentIndex < expectedProviderOrder.length) {
        const expected = expectedProviderOrder[currentIndex];
        if (log.message.includes(expected) || log.meta?.provider === expected) {
          currentIndex++;
        }
      }
    }
  }

  return currentIndex === expectedProviderOrder.length;
}

/**
 * Create test audio samples for different formats
 */
export const TEST_AUDIO_SAMPLES = {
  pcm16: createAudioBufferWithFormat(AudioFormat.PCM_16, 1.0),
  opus: createAudioBufferWithFormat(AudioFormat.OPUS, 1.0),
  aac: createAudioBufferWithFormat(AudioFormat.AAC, 1.0),
  mp3: createAudioBufferWithFormat(AudioFormat.MP3, 1.0),
  vorbis: createAudioBufferWithFormat(AudioFormat.VORBIS, 1.0),
};

/**
 * Test fixture: voice configuration state
 */
export const TEST_FIXTURES = {
  allProvidersConfig: createTestVoiceProvidersConfig(),
  sttOnlyConfig: createProviderConfig(['deepgram', 'faster-whisper', 'whisper-system']),
  ttsOnlyConfig: createProviderConfig(['elevenlabs', 'cartesia', 'kokoro', 'piper']),
  cloudOnlyConfig: createProviderConfig(['deepgram', 'elevenlabs', 'cartesia']),
  dockerOnlyConfig: createProviderConfig(['faster-whisper', 'kokoro']),
  systemOnlyConfig: createProviderConfig(['whisper-system', 'piper']),
};
