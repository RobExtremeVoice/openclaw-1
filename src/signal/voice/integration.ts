/**
 * Signal Voice Message Integration
 *
 * Handles voice message detection, transcription, and response generation
 * with automatic voice/text response based on configuration.
 *
 * Follows the Discord voice integration pattern for consistency.
 */

import type { SignalVoiceAttachment, DecryptedVoiceMessage } from './message-handler.js';
import {
  isVoiceMessage,
  processVoiceMessage,
  extractVoiceMetadata,
} from './message-handler.js';
import { handleVoiceResponse } from './response-handler.js';
import { logVerbose } from '../../globals.js';
import { fetchRemoteMedia } from '../../media/fetch.js';
import { VoiceProviderRegistry } from '../../media/voice-providers/registry.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';
import type { RuntimeEnv } from '../../runtime.js';

/**
 * Signal voice message configuration (matches Discord pattern)
 */
export interface SignalVoiceConfig {
  // Enable/disable voice message handling
  enabled?: boolean;

  // Voice response type
  responseType?: 'voice' | 'text' | 'both';

  // TTS voice settings
  voice?: string;
  speed?: number;
  language?: string;

  // Audio format
  audioFormat?: 'opus' | 'ogg' | 'wav';

  // Privacy settings
  disableLogging?: boolean;
  ephemeralMode?: boolean;

  // Transcription settings
  enableTranscription?: boolean;
  transcriptionProvider?: string;
}

/**
 * Merge voice config with defaults
 */
export function mergeSignalVoiceConfig(
  config: Partial<SignalVoiceConfig> = {},
): SignalVoiceConfig {
  return {
    enabled: config.enabled ?? true,
    responseType: config.responseType ?? 'voice',
    audioFormat: config.audioFormat ?? 'opus',
    disableLogging: config.disableLogging ?? true,
    ephemeralMode: config.ephemeralMode ?? true,
    enableTranscription: config.enableTranscription ?? true,
    ...config,
  };
}

/**
 * Check if voice message handling is enabled
 */
export function isSignalVoiceEnabled(config: SignalVoiceConfig): boolean {
  return config.enabled !== false;
}

/**
 * Resolve voice response type based on context
 */
export function resolveSignalVoiceResponseType(
  config: SignalVoiceConfig,
  context?: {
    isGroup?: boolean;
    isVerified?: boolean;
  },
): 'voice' | 'text' | 'both' {
  const { responseType = 'voice' } = config;

  // In groups, prefer text-only for clarity
  if (context?.isGroup && responseType === 'voice') {
    return 'text';
  }

  return responseType;
}

/**
 * Handle Signal voice message with transcription and voice response
 *
 * This function:
 * 1. Detects voice attachments in Signal messages
 * 2. Downloads and transcribes the audio
 * 3. Generates a response using the configured agent
 * 4. Sends voice/text/both response based on configuration
 *
 * @param message Voice attachment to process
 * @param voiceConfig Voice message configuration
 * @param providersConfig Voice providers configuration
 * @param replyFn Function to generate text reply from transcribed message
 * @param sendFn Function to send the final message(s) to Signal
 * @returns True if voice message was handled, false otherwise
 */
export async function handleSignalVoiceMessage(params: {
  attachment: SignalVoiceAttachment;
  sender: string;
  senderUuid?: string;
  timestamp: number;
  messageId: string;
  groupId?: string;
  groupName?: string;
  baseUrl: string;
  account?: string;
  accountId?: string;
  voiceConfig?: Partial<SignalVoiceConfig>;
  providersConfig?: VoiceProvidersConfig;
  runtime?: RuntimeEnv;
  /**
   * Function to generate reply text from transcribed message
   * Should return the response text to be spoken/sent
   */
  replyFn: (transcribedText: string) => Promise<string>;
  /**
   * Function to send the final message(s) to Signal
   * Receives voice buffer and/or text to send
   */
  sendFn: (params: {
    voiceBuffer?: Buffer;
    text?: string;
    voiceFormat?: 'opus' | 'ogg' | 'wav';
  }) => Promise<void>;
}): Promise<boolean> {
  const {
    attachment,
    sender,
    senderUuid,
    timestamp,
    messageId,
    groupId,
    groupName,
    baseUrl,
    account,
    accountId,
    voiceConfig,
    providersConfig,
    runtime,
    replyFn,
    sendFn,
  } = params;

  // Merge with defaults
  const config = mergeSignalVoiceConfig(voiceConfig ?? {});

  // Check if voice messages are enabled
  if (!isSignalVoiceEnabled(config)) {
    return false;
  }

  // Check for voice attachment
  if (!isVoiceMessage(attachment)) {
    return false;
  }

  logVerbose(
    `signal-voice: detected voice attachment ${attachment.filename} (${attachment.contentType})`
  );

  // Initialize voice provider registry
  const registry = new VoiceProviderRegistry();
  if (providersConfig) {
    await registry.loadProviders(providersConfig);
  }

  try {
    // Process and decrypt voice message
    const voiceMessage = await processVoiceMessage({
      attachment,
      sender,
      senderUuid,
      timestamp,
      messageId,
      groupId,
      groupName,
      baseUrl,
      account,
      runtime,
    });

    logVerbose(
      `signal-voice: processed voice message (${(voiceMessage.size / 1024).toFixed(1)}KB, ${voiceMessage.audioFormat})`
    );

    // Transcribe the voice message
    if (!config.enableTranscription) {
      logVerbose('signal-voice: transcription disabled');
      return false;
    }

    const transcriber = await registry.getTranscriber();
    const result = await transcriber.transcribe(voiceMessage.audioBuffer as any, {
      // Skip format - providers will auto-detect
    });

    // Extract text from transcription result
    let transcribedText: string;
    if ('text' in result && typeof result.text === 'string') {
      transcribedText = result.text.trim();
    } else {
      logVerbose('signal-voice: transcription failed - no text returned');
      return false;
    }

    if (!transcribedText) {
      logVerbose('signal-voice: empty transcription, skipping');
      return false;
    }

    logVerbose(`signal-voice: transcribed text: "${transcribedText}"`);

    // Generate response text
    const responseText = await replyFn(transcribedText);
    if (!responseText) {
      logVerbose('signal-voice: empty response text, skipping');
      return false;
    }

    // Resolve response type based on config and context
    const responseType = resolveSignalVoiceResponseType(config, {
      isGroup: Boolean(groupId),
      isVerified: voiceMessage.verified,
    });

    logVerbose(`signal-voice: response type: ${responseType}`);

    // Determine what to send based on response type
    let voiceBuffer: Buffer | undefined;
    let textToSend: string | undefined;

    if (responseType === 'voice' || responseType === 'both') {
      // Generate voice response
      try {
        const synthesizer = await registry.getSynthesizer();
        const audioResult = await synthesizer.synthesize(responseText, {
          // Format handled by synthesizer
        });

        // audioResult should be a Buffer
        if (Buffer.isBuffer(audioResult)) {
          voiceBuffer = audioResult;
        } else if ('buffer' in audioResult && Buffer.isBuffer(audioResult.buffer)) {
          voiceBuffer = audioResult.buffer;
        } else {
          logVerbose('signal-voice: synthesizer returned non-buffer, falling back to text');
        }
      } catch (synthError) {
        logVerbose(
          `signal-voice: synthesis failed: ${synthError instanceof Error ? synthError.message : String(synthError)}`
        );
      }
    }

    if (responseType === 'text' || responseType === 'both' || !voiceBuffer) {
      textToSend = responseText;
    }

    // Send response via provided function
    await sendFn({
      voiceBuffer,
      text: textToSend,
      voiceFormat: config.audioFormat,
    });

    return true;
  } catch (error) {
    // Log error and fall back to text-only processing
    logVerbose(
      `signal-voice: failed to handle voice message: ${error instanceof Error ? error.message : String(error)}`
    );

    // Attempt text fallback if transcription succeeded but response failed
    try {
      await sendFn({
        text: 'Sorry, I encountered an error processing the voice message.',
      });
    } catch (fallbackError) {
      logVerbose(
        `signal-voice: fallback text response failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }

    return false;
  } finally {
    // Cleanup registry
    await registry.shutdown();
  }
}

/**
 * Check if a Signal attachment is a voice message
 * Useful for filtering attachments before full processing
 */
export { isVoiceMessage };

/**
 * Extract voice message metadata (no audio content)
 * Privacy-first: returns only metadata for logging/storage
 */
export { extractVoiceMetadata };
