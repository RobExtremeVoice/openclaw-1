/**
 * Discord Direct Call Responder
 *
 * Generates and streams voice responses during direct calls.
 * Handles response generation, TTS synthesis, and audio streaming
 * with support for interruption and continuation.
 *
 * Features:
 * - Voice-first response generation
 * - Real-time TTS streaming
 * - Response interruption handling
 * - Long response chunking
 * - Response mode integration (always voice for calls)
 */

import type { DiscordDirectCallConnector } from './direct-call-connector.js';
import type { AudioBuffer } from '../../media/voice-providers/executor.js';
import { getChildLogger } from '../../logging.js';
import { VoiceProviderRegistry } from '../../media/voice-providers/registry.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';

const logger = getChildLogger({ module: 'discord-call-responder' });

/**
 * Response configuration for direct calls
 */
export interface CallResponseConfig {
  /** Voice provider configuration */
  providersConfig?: VoiceProvidersConfig;

  /** Maximum response chunk length in characters (default: 500) */
  maxChunkLength?: number;

  /** Enable response interruption (default: true) */
  allowInterruption?: boolean;

  /** TTS voice ID (provider-specific) */
  voiceId?: string;

  /** Response timeout in milliseconds (default: 30000 = 30s) */
  responseTimeout?: number;

  /** Enable text preview in DM chat (default: false, voice is primary) */
  sendTextPreview?: boolean;
}

/**
 * Response context for generating replies
 */
export interface CallResponseContext {
  /** User ID */
  userId: string;

  /** Channel ID (DM channel) */
  channelId: string;

  /** Transcribed user input */
  userInput: string;

  /** Call connector for audio playback */
  connector: DiscordDirectCallConnector;

  /** Configuration */
  config: CallResponseConfig;

  /** Response generation function (from agent/LLM) */
  generateResponse: (input: string) => Promise<string>;

  /** Optional function to send text preview to chat */
  sendTextMessage?: (channelId: string, text: string) => Promise<void>;
}

/**
 * Response result
 */
export interface CallResponseResult {
  /** Response text */
  text: string;

  /** Audio buffer (if generated) */
  audio?: AudioBuffer;

  /** Whether response was interrupted */
  interrupted: boolean;

  /** Response generation time in milliseconds */
  generationTime: number;

  /** TTS synthesis time in milliseconds */
  synthesisTime?: number;

  /** Total time (generation + synthesis) in milliseconds */
  totalTime: number;
}

/**
 * Discord Direct Call Responder
 *
 * Handles response generation and voice playback during direct calls.
 */
export class DiscordCallResponder {
  private voiceRegistry?: VoiceProviderRegistry;
  private isInterrupted = false;

  constructor() {
    // Responder is stateless; voice registry is created per-response
  }

  /**
   * Generate and play voice response during a call
   *
   * This is the main entry point for responding to user speech in direct calls.
   */
  async generateAndPlayResponse(
    context: CallResponseContext,
  ): Promise<CallResponseResult> {
    const startTime = Date.now();
    this.isInterrupted = false;

    logger.info(
      {
        userId: context.userId,
        input: context.userInput,
        maxChunkLength: context.config.maxChunkLength,
      },
      'Generating call response',
    );

    try {
      // Generate response text
      const generationStart = Date.now();
      const responseText = await this.generateResponseWithTimeout(
        context.userInput,
        context.generateResponse,
        context.config.responseTimeout ?? 30000,
      );
      const generationTime = Date.now() - generationStart;

      if (!responseText || responseText.trim().length === 0) {
        logger.warn({ userId: context.userId }, 'Empty response generated');
        return {
          text: '',
          interrupted: false,
          generationTime,
          totalTime: Date.now() - startTime,
        };
      }

      logger.info(
        {
          userId: context.userId,
          responseLength: responseText.length,
          generationTime,
        },
        'Response generated',
      );

      // Send text preview to chat if enabled
      if (context.config.sendTextPreview && context.sendTextMessage) {
        await context.sendTextMessage(context.channelId, responseText).catch((error) => {
          logger.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              userId: context.userId,
            },
            'Failed to send text preview',
          );
        });
      }

      // Initialize voice registry
      this.voiceRegistry = new VoiceProviderRegistry();
      if (context.config.providersConfig) {
        await this.voiceRegistry.loadProviders(context.config.providersConfig);
      }

      // Handle long responses by chunking
      const chunks = this.chunkResponse(
        responseText,
        context.config.maxChunkLength ?? 500,
      );

      logger.debug(
        {
          userId: context.userId,
          totalLength: responseText.length,
          chunks: chunks.length,
        },
        'Response chunked',
      );

      // Synthesize and play each chunk
      const synthesisStart = Date.now();
      for (let i = 0; i < chunks.length; i++) {
        // Check for interruption
        if (this.isInterrupted) {
          logger.info(
            { userId: context.userId, chunk: i + 1, total: chunks.length },
            'Response interrupted',
          );
          return {
            text: responseText,
            interrupted: true,
            generationTime,
            synthesisTime: Date.now() - synthesisStart,
            totalTime: Date.now() - startTime,
          };
        }

        const chunk = chunks[i];
        logger.debug(
          {
            userId: context.userId,
            chunk: i + 1,
            total: chunks.length,
            chunkLength: chunk.length,
          },
          'Synthesizing chunk',
        );

        // Synthesize audio for chunk
        const audio = await this.synthesizeChunk(chunk, context);

        // Play audio
        await context.connector.playAudioResponse(audio);
      }

      const synthesisTime = Date.now() - synthesisStart;
      const totalTime = Date.now() - startTime;

      logger.info(
        {
          userId: context.userId,
          generationTime,
          synthesisTime,
          totalTime,
          chunks: chunks.length,
        },
        'Response completed',
      );

      return {
        text: responseText,
        interrupted: false,
        generationTime,
        synthesisTime,
        totalTime,
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId: context.userId,
        },
        'Failed to generate/play response',
      );

      throw new Error(
        `Response generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Cleanup voice registry
      if (this.voiceRegistry) {
        await this.voiceRegistry.shutdown();
        this.voiceRegistry = undefined;
      }
    }
  }

  /**
   * Interrupt current response playback
   */
  interrupt(): void {
    logger.debug('Response interrupted');
    this.isInterrupted = true;
  }

  /**
   * Generate response with timeout
   */
  private async generateResponseWithTimeout(
    input: string,
    generateFn: (input: string) => Promise<string>,
    timeout: number,
  ): Promise<string> {
    return Promise.race([
      generateFn(input),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Response generation timeout')), timeout),
      ),
    ]);
  }

  /**
   * Chunk long response into smaller pieces
   *
   * Splits at sentence boundaries when possible.
   */
  private chunkResponse(text: string, maxChunkLength: number): string[] {
    if (text.length <= maxChunkLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      // If single sentence is longer than max, split by words
      if (sentence.length > maxChunkLength) {
        // Flush current chunk if exists
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // Split long sentence by words
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > maxChunkLength) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk.length > 0 ? ' ' : '') + word;
          }
        }
      } else if (currentChunk.length + sentence.length > maxChunkLength) {
        // Current chunk + sentence exceeds max, flush current
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Add sentence to current chunk
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
      }
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Synthesize audio for a text chunk
   */
  private async synthesizeChunk(
    text: string,
    context: CallResponseContext,
  ): Promise<AudioBuffer> {
    if (!this.voiceRegistry) {
      throw new Error('Voice registry not initialized');
    }

    try {
      // Get TTS provider
      const synthesizer = await this.voiceRegistry.getSynthesizer();

      // Synthesize audio
      const audio = await synthesizer.synthesize(text, {
        voice: context.config.voiceId,
        sampleRate: 48000, // Discord uses 48kHz
      });

      return audio;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          text: text.substring(0, 100),
        },
        'TTS synthesis failed',
      );

      throw new Error(
        `TTS synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if response is currently playing
   */
  isPlaying(): boolean {
    return !this.isInterrupted;
  }
}

/**
 * Create a default call responder instance
 */
export function createCallResponder(): DiscordCallResponder {
  return new DiscordCallResponder();
}

/**
 * Helper function to generate and play response in one call
 *
 * Convenience wrapper for common use cases.
 */
export async function generateAndPlayCallResponse(params: {
  userId: string;
  channelId: string;
  userInput: string;
  connector: DiscordDirectCallConnector;
  generateResponse: (input: string) => Promise<string>;
  config?: Partial<CallResponseConfig>;
  sendTextMessage?: (channelId: string, text: string) => Promise<void>;
}): Promise<CallResponseResult> {
  const responder = createCallResponder();

  const context: CallResponseContext = {
    userId: params.userId,
    channelId: params.channelId,
    userInput: params.userInput,
    connector: params.connector,
    generateResponse: params.generateResponse,
    sendTextMessage: params.sendTextMessage,
    config: {
      maxChunkLength: 500,
      allowInterruption: true,
      responseTimeout: 30000,
      sendTextPreview: false,
      ...params.config,
    },
  };

  return responder.generateAndPlayResponse(context);
}

export default DiscordCallResponder;
