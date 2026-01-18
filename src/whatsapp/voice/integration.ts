/**
 * WhatsApp Voice Message Integration
 *
 * Handles voice message detection, transcription, and response generation
 * with automatic voice/text response based on configuration.
 *
 * Follows the same pattern as Discord, Telegram, Slack, and Signal voice integration.
 *
 * WhatsApp Cloud API webhook structure:
 * - Message type: "audio"
 * - Contains media_id for the audio file
 * - Audio format: typically OGG/Opus (32kbps, 48kHz, mono)
 */

import type { RuntimeEnv } from '../../runtime.js';
import { logVerbose } from '../../globals.js';
import { VoiceProviderRegistry } from '../../media/voice-providers/registry.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';

export interface WhatsAppVoiceFile {
  id: string;
  mimetype: string;
  timestamp: number;
}

export interface WhatsAppVoiceContext {
  audioPath: string;
  format: string;
  sizeBytes: number;
}

/**
 * Check if a WhatsApp message contains audio attachment
 */
export function hasVoiceAttachment(message: { audio?: { media_id?: string; mime_type?: string } }): boolean {
  return message.audio !== undefined && message.audio.media_id !== undefined;
}

/**
 * Extract voice attachment from WhatsApp message
 *
 * WhatsApp webhook provides audio object with media_id and mime_type
 */
export function extractVoiceAttachment(message: {
  audio?: { media_id?: string; mime_type?: string };
}): WhatsAppVoiceFile | null {
  if (!message.audio || !message.audio.media_id) {
    return null;
  }

  return {
    id: message.audio.media_id,
    mimetype: message.audio.mime_type || 'audio/ogg',
    timestamp: Date.now(),
  };
}

/**
 * Check if a WhatsApp message contains voice attachments
 * Useful for filtering messages before full processing
 */
export function shouldHandleWhatsAppVoiceMessage(message: {
  audio?: { media_id?: string; mime_type?: string };
}): boolean {
  return hasVoiceAttachment(message);
}

/**
 * Handle WhatsApp voice message with transcription and voice response
 *
 * This function:
 * 1. Detects voice files in WhatsApp messages
 * 2. Downloads and transcribes the audio from WhatsApp Cloud API
 * 3. Generates a response using the configured agent
 * 4. Sends voice/text/both response based on configuration
 *
 * @param params Voice message handling parameters
 * @returns True if voice message was handled, false otherwise
 *
 * Example usage:
 * ```typescript
 * const handled = await handleWhatsAppVoiceMessage({
 *   message: { audio: { media_id: '123', mime_type: 'audio/ogg' } },
 *   apiToken: process.env.WHATSAPP_API_TOKEN,
 *   businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
 *   phoneNumber: user.phone,
 *   providersConfig: voiceConfig,
 *   replyFn: async (transcribed) => {
 *     // Generate response from transcribed text
 *     return await agent.chat(transcribed);
 *   },
 *   sendFn: async ({ voiceBuffer, text }) => {
 *     // Send response back to user
 *     await sendMessage(phoneNumber, { voice: voiceBuffer, text });
 *   },
 * });
 * ```
 */
export async function handleWhatsAppVoiceMessage(params: {
  message: { audio?: { media_id?: string; mime_type?: string } };
  apiClient: any; // WhatsApp Cloud API client (or methods)
  runtime?: RuntimeEnv;
  providersConfig?: VoiceProvidersConfig;
  /**
   * Function to generate reply text from transcribed message
   * Should return the response text to be sent
   */
  replyFn: (transcribedText: string) => Promise<string>;
  /**
   * Function to send the final message to WhatsApp
   * Receives text response
   */
  sendFn: (params: { text: string }) => Promise<void>;
}): Promise<boolean> {
  const {
    message,
    apiClient,
    runtime,
    providersConfig,
    replyFn,
    sendFn,
  } = params;

  // Check for voice file
  const voiceFile = extractVoiceAttachment(message);
  if (!voiceFile) {
    return false;
  }

  logVerbose(
    `whatsapp-voice: detected voice file (id: ${voiceFile.id}, mime: ${voiceFile.mimetype})`,
  );

  // Initialize voice provider registry
  const registry = new VoiceProviderRegistry();
  if (providersConfig) {
    await registry.loadProviders(providersConfig);
  }

  try {
    const effectiveRuntime: RuntimeEnv = runtime || {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    };

    // Download audio using WhatsApp Cloud API
    const audioBuffer = await downloadWhatsAppAudio(apiClient, voiceFile.id);

    logVerbose(
      `whatsapp-voice: downloaded audio (size: ${audioBuffer.length} bytes)`,
    );

    // Get STT provider with fallback
    const transcriber = await registry.getTranscriber();

    // Detect format from mime type
    const detectedFormat = detectAudioFormat(voiceFile.mimetype);

    // Transcribe the audio
    const result = await transcriber.transcribe(audioBuffer as any, {
      format: detectedFormat as any,
    });

    // Extract text from transcription result
    let transcribedText = '';
    if ('text' in result && typeof result.text === 'string') {
      transcribedText = result.text.trim();
    } else if ('transcript' in result && typeof result.transcript === 'string') {
      transcribedText = result.transcript.trim();
    }

    if (!transcribedText) {
      logVerbose('whatsapp-voice: empty transcription, skipping');
      return false;
    }

    logVerbose(`whatsapp-voice: transcribed text: "${transcribedText}"`);

    // Generate response text
    const responseText = await replyFn(transcribedText);
    if (!responseText) {
      logVerbose('whatsapp-voice: empty response text, skipping');
      return false;
    }

    logVerbose(`whatsapp-voice: sending text response`);

    // Send text response
    await sendFn({ text: responseText });

    return true;
  } catch (error) {
    logVerbose(
      `whatsapp-voice: failed to handle voice message: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Attempt fallback text response
    try {
      await sendFn({
        text: 'Sorry, I encountered an error processing the voice message.',
      });
    } catch (fallbackError) {
      logVerbose(
        `whatsapp-voice: fallback text response failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }

    return false;
  } finally {
    // Cleanup registry
    await registry.shutdown();
  }
}

/**
 * Download audio from WhatsApp Cloud API
 */
async function downloadWhatsAppAudio(
  apiClient: any,
  mediaId: string,
): Promise<Buffer> {
  // If client has a downloadMedia method, use it
  if (apiClient && typeof apiClient.downloadMedia === 'function') {
    return await apiClient.downloadMedia(mediaId);
  }

  // Otherwise, try to get media URL and fetch
  if (apiClient && typeof apiClient.getMediaUrl === 'function') {
    const url = await apiClient.getMediaUrl(mediaId);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('API client does not support media download');
}

/**
 * Detect audio format from MIME type
 */
function detectAudioFormat(mimeType: string): 'ogg' | 'mp3' | 'wav' | 'aac' {
  if (mimeType.includes('ogg') || mimeType === 'audio/ogg') return 'ogg';
  if (mimeType.includes('mp3') || mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('aac')) return 'aac';
  // Default to ogg for WhatsApp audio messages
  return 'ogg';
}
