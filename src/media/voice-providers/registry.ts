/**
 * Voice Provider Registry
 *
 * Manages loading, lifecycle, and selection of voice providers
 * based on configuration. Handles fallback chains and provider health.
 */

import type {
  VoiceProviderEntry,
  VoiceProvidersConfig,
} from '../../config/zod-schema.voice-providers.js';
import {
  getProvidersInPriorityOrder,
  getFirstAvailableSTTProvider,
  getFirstAvailableTTSProvider,
} from '../../config/voice-providers.migration.js';
import type {
  VoiceProviderExecutor,
  SynthesisOptions,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionChunk,
} from './executor.js';
import { VoiceProviderError } from './executor.js';

export class VoiceProviderRegistry {
  private providers: Map<string, VoiceProviderExecutor> = new Map();
  private config: VoiceProvidersConfig | undefined;
  private sttProviders: VoiceProviderExecutor[] = [];
  private ttsProviders: VoiceProviderExecutor[] = [];

  /**
   * Load providers from configuration
   */
  async loadProviders(config: VoiceProvidersConfig): Promise<void> {
    this.config = config;

    if (!config || !config.enabled || !config.providers) {
      return;
    }

    const ordered = getProvidersInPriorityOrder(config);

    for (const entry of ordered) {
      try {
        const executor = await this.createExecutor(entry);
        await executor.initialize();
        this.providers.set(entry.id, executor);

        // Track STT and TTS providers separately
        if (entry.stt) {
          this.sttProviders.push(executor);
        }
        if (entry.tts) {
          this.ttsProviders.push(executor);
        }
      } catch (error) {
        console.warn(
          `Failed to load provider ${entry.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Get a transcriber (STT provider)
   */
  async getTranscriber(providerId?: string): Promise<VoiceProviderExecutor> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      if (provider) {
        return provider;
      }
      throw new VoiceProviderError(
        `Provider ${providerId} not found`,
        'registry',
      );
    }

    // Find first available STT provider
    const provider = this.sttProviders[0];
    if (!provider) {
      throw new VoiceProviderError(
        'No STT provider available',
        'registry',
      );
    }

    return provider;
  }

  /**
   * Get a synthesizer (TTS provider)
   */
  async getSynthesizer(providerId?: string): Promise<VoiceProviderExecutor> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      if (provider) {
        return provider;
      }
      throw new VoiceProviderError(
        `Provider ${providerId} not found`,
        'registry',
      );
    }

    // Find first available TTS provider
    const provider = this.ttsProviders[0];
    if (!provider) {
      throw new VoiceProviderError(
        'No TTS provider available',
        'registry',
      );
    }

    return provider;
  }

  /**
   * Transcribe with automatic fallback to next provider on error
   */
  async transcribeWithFallback(
    audio: Parameters<VoiceProviderExecutor['transcribe']>[0],
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    for (let i = 0; i < this.sttProviders.length; i++) {
      const provider = this.sttProviders[i];

      try {
        if (!(await provider.isHealthy())) {
          console.warn(
            `Provider ${provider.id} is unhealthy, skipping`,
          );
          continue;
        }

        return await provider.transcribe(audio, options);
      } catch (error) {
        console.warn(
          `Transcription attempt with ${provider.id} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (i === this.sttProviders.length - 1) {
          throw new VoiceProviderError(
            'All STT providers failed',
            'registry',
          );
        }
      }
    }

    throw new VoiceProviderError(
      'No STT providers available',
      'registry',
    );
  }

  /**
   * Synthesize with automatic fallback to next provider on error
   */
  async synthesizeWithFallback(
    text: string,
    options?: SynthesisOptions,
  ): Promise<ReturnType<VoiceProviderExecutor['synthesize']>> {
    for (let i = 0; i < this.ttsProviders.length; i++) {
      const provider = this.ttsProviders[i];

      try {
        if (!(await provider.isHealthy())) {
          console.warn(
            `Provider ${provider.id} is unhealthy, skipping`,
          );
          continue;
        }

        return await provider.synthesize(text, options);
      } catch (error) {
        console.warn(
          `Synthesis attempt with ${provider.id} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (i === this.ttsProviders.length - 1) {
          throw new VoiceProviderError(
            'All TTS providers failed',
            'registry',
          );
        }
      }
    }

    throw new VoiceProviderError(
      'No TTS providers available',
      'registry',
    );
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<
    Record<
      string,
      { healthy: boolean; capabilities?: any }
    >
  > {
    const status: Record<string, { healthy: boolean; capabilities?: any }> = {};

    for (const [id, provider] of this.providers) {
      try {
        const healthy = await provider.isHealthy();
        status[id] = {
          healthy,
          capabilities: healthy ? provider.getCapabilities() : undefined,
        };
      } catch (error) {
        status[id] = { healthy: false };
      }
    }

    return status;
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    const errors: Error[] = [];

    for (const provider of this.providers.values()) {
      try {
        await provider.shutdown();
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      }
    }

    this.providers.clear();
    this.sttProviders = [];
    this.ttsProviders = [];

    if (errors.length > 0) {
      throw new Error(
        `Failed to shutdown providers: ${errors.map(e => e.message).join(', ')}`,
      );
    }
  }

  /**
   * Create an executor instance for a provider entry
   * This is where provider-specific implementations are instantiated
   */
  private async createExecutor(
    entry: VoiceProviderEntry,
  ): Promise<VoiceProviderExecutor> {
    // STT providers
    if (entry.stt) {
      const sttConfig = entry.stt;

      if (sttConfig.type === 'whisper') {
        const { WhisperExecutor } = await import('./whisper.js');
        return new WhisperExecutor(entry.id, sttConfig);
      }

      if (sttConfig.type === 'faster-whisper') {
        const { FasterWhisperExecutor } = await import('./faster-whisper.js');
        return new FasterWhisperExecutor(entry.id, sttConfig);
      }

      if ('service' in sttConfig && (sttConfig as any).service === 'deepgram') {
        const { DeepgramExecutor } = await import('./deepgram.js');
        return new DeepgramExecutor(entry.id, sttConfig as any);
      }

      if (sttConfig.type === 'openai' || sttConfig.type === 'google' || sttConfig.type === 'azure') {
        // const { OpenAISTTExecutor } = await import('./providers/openai-stt.js');
        // return new OpenAISTTExecutor(entry.id, sttConfig);
        throw new VoiceProviderError(
          `${(sttConfig as any).service || sttConfig.type} STT executor not yet implemented`,
          entry.id,
        );
      }
    }

    // TTS providers
    if (entry.tts) {
      const ttsConfig = entry.tts;

      if (ttsConfig.type === 'local' && ttsConfig.model === 'kokoro') {
        // const { KokoroExecutor } = await import('./providers/kokoro.js');
        // return new KokoroExecutor(entry.id, ttsConfig);
        throw new VoiceProviderError(
          'Kokoro executor not yet implemented',
          entry.id,
        );
      }

      if (ttsConfig.type === 'local' && ttsConfig.model === 'piper') {
        // const { PiperExecutor } = await import('./providers/piper.js');
        // return new PiperExecutor(entry.id, ttsConfig);
        throw new VoiceProviderError(
          'Piper executor not yet implemented',
          entry.id,
        );
      }

      if (ttsConfig.type === 'cartesia') {
        const { CartesiaExecutor } = await import('./cartesia.js');
        return new CartesiaExecutor({
          apiKey: (ttsConfig as any).apiKey,
          model: (ttsConfig as any).model || 'sonic-3',
          voiceId: (ttsConfig as any).voiceId,
          emotion: (ttsConfig as any).emotion,
          speed: (ttsConfig as any).speed,
          pitch: (ttsConfig as any).pitch,
          language: (ttsConfig as any).language,
          timeout: (ttsConfig as any).timeout,
          connectionPoolSize: (ttsConfig as any).connectionPoolSize,
        });
      }

      // Chatterbox provider deprecated - keeping import commented out
      // if (ttsConfig.type === 'chatterbox') {
      //   const { ChatterboxExecutor } = await import('./chatterbox.js');
      //   return new ChatterboxExecutor(entry.id, {
      //     deploymentMode: (ttsConfig as any).deploymentMode || 'cloud',
      //     cloudEndpoint: (ttsConfig as any).cloudEndpoint,
      //     apiKey: (ttsConfig as any).apiKey,
      //     dockerImage: (ttsConfig as any).dockerImage,
      //     dockerPort: (ttsConfig as any).dockerPort,
      //     exaggeration: (ttsConfig as any).exaggeration,
      //     temperature: (ttsConfig as any).temperature,
      //     language: (ttsConfig as any).language,
      //     voice: (ttsConfig as any).voice,
      //     timeout: (ttsConfig as any).timeout,
      //   });
      // }

      if (
        (ttsConfig.type === 'elevenlabs' ||
          ttsConfig.type === 'openai' ||
          ttsConfig.type === 'google' ||
          ttsConfig.type === 'azure') &&
        'service' in ttsConfig
      ) {
        // Cloud provider dispatching will be added
        throw new VoiceProviderError(
          `${(ttsConfig as any).service} TTS executor not yet implemented`,
          entry.id,
        );
      }
    }

    throw new VoiceProviderError(
      'Unknown provider configuration',
      entry.id,
    );
  }
}
