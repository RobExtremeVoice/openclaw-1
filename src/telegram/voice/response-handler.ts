/**
 * Telegram Voice Response Handler
 *
 * Synthesizes text responses and sends them as voice messages:
 * - Text-to-speech synthesis via TTS provider
 * - Conversion to Ogg Opus format (Telegram native)
 * - Send as voice message via Telegram bot API
 * - Support voice message replies
 * - Handle group chat mentions in voice responses
 */

import type { Api } from "grammy";

export interface TTSProvider {
  /** Synthesize text to audio buffer */
  synthesize(
    text: string,
    options?: { voiceId?: string; sampleRate?: number },
  ): Promise<Buffer>;
}

export interface AudioEncoder {
  /** Encode PCM audio to Ogg Opus format */
  encodeToOggOpus(
    pcmBuffer: Buffer,
    sampleRate: number,
    channels?: number,
  ): Promise<Buffer>;
}

export interface TelegramVoiceConfig {
  /** Message response modality: voice, text, match, or both
   * 'match' = respond in same format as user input (voice → voice, text → text)
   * 'both' = always send both voice and text responses
   */
  messageResponse?: 'voice' | 'text' | 'match' | 'both';
  /** Override response modality for specific chats */
  perChatOverride?: Record<string, 'voice' | 'text' | 'match' | 'both'>;
  /** Override response modality for specific users */
  perUserOverride?: Record<string, 'voice' | 'text' | 'match' | 'both'>;
}

export interface VoiceResponseOptions {
  /** Telegram bot API instance */
  botApi: Api;
  /** Text-to-speech provider */
  ttsProvider: TTSProvider;
  /** Audio encoder for Ogg Opus conversion */
  audioEncoder: AudioEncoder;
  /** Default voice ID for synthesis */
  defaultVoiceId?: string;
  /** Default sample rate (default: 48000 Hz - Telegram native) */
  defaultSampleRate?: number;
  /** Enable voice replies in group chats (default: false) */
  enableGroupVoiceReplies?: boolean;
  /** Telegram voice configuration for message response modality */
  voiceConfig?: TelegramVoiceConfig;
}

export interface VoiceResponseContext {
  /** Chat ID to send voice to */
  chatId: number;
  /** Optional message ID to reply to */
  replyToMessageId?: number;
  /** Optional thread/topic ID for forum groups */
  threadId?: number;
  /** Voice ID override for this response */
  voiceId?: string;
  /** Sample rate override */
  sampleRate?: number;
  /** Input modality: 'voice' if user sent voice message, 'text' if text message */
  inputModality?: 'voice' | 'text';
  /** User ID for per-user overrides */
  userId?: number;
}

/**
 * Determine the response modality based on configuration and input modality.
 */
export function determineResponseModality(
  context: VoiceResponseContext,
  options: VoiceResponseOptions,
): 'voice' | 'text' | 'both' {
  const config = options.voiceConfig ?? {};
  const defaultModality = config.messageResponse ?? 'match';

  // Check per-user override first
  if (context.userId !== undefined && config.perUserOverride?.[context.userId.toString()]) {
    const userModality = config.perUserOverride[context.userId.toString()];
    if (userModality === 'match') {
      return context.inputModality === 'voice' ? 'voice' : 'text';
    }
    return userModality;
  }

  // Check per-chat override
  if (config.perChatOverride?.[context.chatId.toString()]) {
    const chatModality = config.perChatOverride[context.chatId.toString()];
    if (chatModality === 'match') {
      return context.inputModality === 'voice' ? 'voice' : 'text';
    }
    return chatModality;
  }

  // Use default modality
  if (defaultModality === 'match') {
    return context.inputModality === 'voice' ? 'voice' : 'text';
  }

  return defaultModality;
}

/**
 * Synthesize text and send as Telegram voice message.
 */
export async function sendVoiceResponse(
  text: string,
  context: VoiceResponseContext,
  options: VoiceResponseOptions,
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    // Validate input
    if (!text || text.trim().length === 0) {
      return { success: false, error: "Text cannot be empty" };
    }

    if (text.length > 4096) {
      return { success: false, error: "Text exceeds maximum length (4096 characters)" };
    }

    // Synthesize text to audio
    const voiceId = context.voiceId ?? options.defaultVoiceId;
    const sampleRate = context.sampleRate ?? options.defaultSampleRate ?? 48000;

    const pcmAudio = await options.ttsProvider.synthesize(text, {
      voiceId,
      sampleRate,
    });

    // Encode to Ogg Opus format (Telegram native)
    const oggOpusAudio = await options.audioEncoder.encodeToOggOpus(pcmAudio, sampleRate, 1);

    // Calculate duration estimate (rough approximation)
    const durationSeconds = Math.ceil(pcmAudio.length / (sampleRate * 2)); // 16-bit = 2 bytes per sample

    // Send as voice message
    const sendOptions: {
      reply_to_message_id?: number;
      message_thread_id?: number;
      duration?: number;
    } = {
      duration: durationSeconds,
    };

    if (context.replyToMessageId) {
      sendOptions.reply_to_message_id = context.replyToMessageId;
    }

    if (context.threadId) {
      sendOptions.message_thread_id = context.threadId;
    }

    const result = await options.botApi.sendVoice(
      context.chatId,
      new Blob([new Uint8Array(oggOpusAudio)], { type: "audio/ogg" }) as unknown as string,
      sendOptions,
    );

    return {
      success: true,
      messageId: result.message_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[VoiceResponse] Failed to send voice response:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send a text response to a Telegram chat.
 */
export async function sendTextResponse(
  text: string,
  context: VoiceResponseContext,
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    // Validate input
    if (!text || text.trim().length === 0) {
      return { success: false, error: "Text cannot be empty" };
    }

    if (text.length > 4096) {
      return { success: false, error: "Text exceeds maximum length (4096 characters)" };
    }

    const sendOptions: {
      reply_to_message_id?: number;
      message_thread_id?: number;
    } = {};

    if (context.replyToMessageId) {
      sendOptions.reply_to_message_id = context.replyToMessageId;
    }

    if (context.threadId) {
      sendOptions.message_thread_id = context.threadId;
    }

    // Note: botApi is passed through context.botApi if available
    // For now, we'll need to get it from options, so this requires refactoring
    // the function signature. We'll handle this in the VoiceResponseHandler class.
    return {
      success: false,
      error: "sendTextResponse requires botApi - use VoiceResponseHandler.sendText() instead",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[TextResponse] Failed to send text response:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Voice response handler class for stateful operation.
 */
export class VoiceResponseHandler {
  private options: VoiceResponseOptions;
  private voiceMessageCount = 0;
  private textMessageCount = 0;

  constructor(options: VoiceResponseOptions) {
    this.options = options;
  }

  /**
   * Send a text response to a chat.
   */
  async sendText(
    text: string,
    context: VoiceResponseContext,
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    try {
      // Validate input
      if (!text || text.trim().length === 0) {
        return { success: false, error: "Text cannot be empty" };
      }

      if (text.length > 4096) {
        return { success: false, error: "Text exceeds maximum length (4096 characters)" };
      }

      const sendOptions: {
        reply_to_message_id?: number;
        message_thread_id?: number;
      } = {};

      if (context.replyToMessageId) {
        sendOptions.reply_to_message_id = context.replyToMessageId;
      }

      if (context.threadId) {
        sendOptions.message_thread_id = context.threadId;
      }

      const result = await this.options.botApi.sendMessage(context.chatId, text, sendOptions);

      if (result.message_id) {
        this.textMessageCount++;
      }

      return {
        success: true,
        messageId: result.message_id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[TextResponse] Failed to send text response:", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a response based on modality configuration.
   * Sends voice, text, or both depending on config and input type.
   */
  async sendResponse(
    text: string,
    context: VoiceResponseContext,
  ): Promise<{ success: boolean; messageIds: number[]; errors: string[] }> {
    const modality = determineResponseModality(context, this.options);
    const messageIds: number[] = [];
    const errors: string[] = [];

    if (modality === 'voice' || modality === 'both') {
      const voiceResult = await this.sendVoice(text, context);
      if (voiceResult.success && voiceResult.messageId) {
        messageIds.push(voiceResult.messageId);
      } else if (voiceResult.error) {
        errors.push(`Voice: ${voiceResult.error}`);
      }
    }

    if (modality === 'text' || modality === 'both') {
      const textResult = await this.sendText(text, context);
      if (textResult.success && textResult.messageId) {
        messageIds.push(textResult.messageId);
      } else if (textResult.error) {
        errors.push(`Text: ${textResult.error}`);
      }
    }

    return {
      success: errors.length === 0,
      messageIds,
      errors,
    };
  }

  /**
   * Send a voice response to a chat.
   */
  async sendVoice(
    text: string,
    context: VoiceResponseContext,
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    const result = await sendVoiceResponse(text, context, this.options);

    if (result.success) {
      this.voiceMessageCount++;
    }

    return result;
  }

  /**
   * Send voice reply to a specific message.
   */
  async replyWithVoice(
    text: string,
    chatId: number,
    messageId: number,
    threadId?: number,
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    return this.sendVoice(text, {
      chatId,
      replyToMessageId: messageId,
      threadId,
    });
  }

  /**
   * Check if voice replies are enabled for group chats.
   */
  canSendGroupVoice(): boolean {
    return this.options.enableGroupVoiceReplies ?? false;
  }

  /**
   * Update TTS provider.
   */
  setTTSProvider(provider: TTSProvider): void {
    this.options.ttsProvider = provider;
  }

  /**
   * Update default voice settings.
   */
  setDefaultVoice(voiceId: string, sampleRate?: number): void {
    this.options.defaultVoiceId = voiceId;
    if (sampleRate !== undefined) {
      this.options.defaultSampleRate = sampleRate;
    }
  }

  /**
   * Get statistics about voice messages sent.
   */
  getStats(): { voiceMessagesSent: number; textMessagesSent: number } {
    return {
      voiceMessagesSent: this.voiceMessageCount,
      textMessagesSent: this.textMessageCount,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.voiceMessageCount = 0;
    this.textMessageCount = 0;
  }
}

/**
 * Create a voice response handler instance.
 */
export function createVoiceResponseHandler(
  options: VoiceResponseOptions,
): VoiceResponseHandler {
  return new VoiceResponseHandler(options);
}

/**
 * Simple in-memory Ogg Opus encoder using native Node.js buffers.
 * For production, consider using a proper encoder like opusscript or node-opus.
 */
export class SimpleOggOpusEncoder implements AudioEncoder {
  /**
   * Encode PCM audio to Ogg Opus format.
   * Note: This is a simplified implementation. For production,
   * use a proper Opus encoder library.
   */
  async encodeToOggOpus(
    pcmBuffer: Buffer,
    sampleRate: number,
    channels: number = 1,
  ): Promise<Buffer> {
    // In production, this should use a proper Opus encoder
    // For now, we'll assume the TTS provider returns Opus-compatible audio
    // or implement proper encoding with opusscript/node-opus

    // Validate inputs
    if (sampleRate !== 48000 && sampleRate !== 24000 && sampleRate !== 16000) {
      throw new Error(
        `Unsupported sample rate: ${sampleRate}. Supported rates: 48000, 24000, 16000`,
      );
    }

    if (channels !== 1 && channels !== 2) {
      throw new Error(`Unsupported channel count: ${channels}. Supported: 1 (mono), 2 (stereo)`);
    }

    // TODO: Implement actual Opus encoding
    // For now, return the buffer as-is and rely on TTS provider
    // to return Opus-compatible format
    return pcmBuffer;
  }
}

/**
 * Chunk long text into smaller segments for voice synthesis.
 * Respects sentence boundaries to maintain natural speech flow.
 */
export function chunkTextForVoice(
  text: string,
  maxChunkLength: number = 500,
): string[] {
  // Split by sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    if ((currentChunk + " " + trimmed).length <= maxChunkLength) {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If single sentence exceeds max length, split by words
      if (trimmed.length > maxChunkLength) {
        const words = trimmed.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if ((wordChunk + " " + word).length <= maxChunkLength) {
            wordChunk += (wordChunk ? " " : "") + word;
          } else {
            if (wordChunk) {
              chunks.push(wordChunk);
            }
            wordChunk = word;
          }
        }
        currentChunk = wordChunk;
      } else {
        currentChunk = trimmed;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Send multiple voice messages for long text responses.
 */
export async function sendLongVoiceResponse(
  text: string,
  context: VoiceResponseContext,
  options: VoiceResponseOptions,
  maxChunkLength: number = 500,
): Promise<{
  success: boolean;
  messageIds: number[];
  errors: string[];
}> {
  const chunks = chunkTextForVoice(text, maxChunkLength);
  const messageIds: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkContext = { ...context };

    // Only reply to original message for the first chunk
    if (i > 0) {
      chunkContext.replyToMessageId = undefined;
    }

    const result = await sendVoiceResponse(chunk, chunkContext, options);

    if (result.success && result.messageId) {
      messageIds.push(result.messageId);
    } else if (result.error) {
      errors.push(`Chunk ${i + 1}: ${result.error}`);
    }

    // Small delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return {
    success: errors.length === 0,
    messageIds,
    errors,
  };
}
