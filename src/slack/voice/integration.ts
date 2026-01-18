/**
 * Slack Voice Message Integration
 *
 * Handles voice message detection, transcription, and response generation
 * with automatic voice/text response based on configuration.
 *
 * Follows the same pattern as Discord and Telegram voice integration.
 */

import type { SlackVoiceFile } from './message-handler.js';
import type { SlackVoiceContext } from './message-handler.js';
import { SlackVoiceMessageHandler } from './message-handler.js';
import { SlackVoiceResponseHandler } from './response-handler.js';

import { logVerbose } from '../../globals.js';
import { VoiceProviderRegistry } from '../../media/voice-providers/registry.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';
import type { RuntimeEnv } from '../../runtime.js';

/**
 * Check if a Slack message contains audio file attachments
 */
export function hasVoiceAttachment(message: { files?: Array<{ mimetype?: string; name?: string }> }): boolean {
  if (!message.files || message.files.length === 0) return false;

  const voiceHandler = new SlackVoiceMessageHandler(
    {} as any, // Client not needed for detection
    {} as any, // Runtime not needed for detection
  );

  return message.files.some(file => {
    const voiceFile: SlackVoiceFile = {
      id: '',
      name: file.name || '',
      mimetype: file.mimetype || '',
      size: 0,
      url_private: '',
      timestamp: 0,
    };
    return voiceHandler.isAudioFile(voiceFile);
  });
}

/**
 * Extract voice attachment from Slack message
 */
export function extractVoiceAttachment(
  message: { files?: SlackVoiceFile[] }
): SlackVoiceFile | null {
  if (!message.files || message.files.length === 0) return null;

  const voiceHandler = new SlackVoiceMessageHandler(
    {} as any, // Client not needed for detection
    {} as any, // Runtime not needed for detection
  );

  const audioFile = message.files.find(file => voiceHandler.isAudioFile(file));
  return audioFile || null;
}

/**
 * Handle Slack voice message with transcription and voice response
 *
 * This function:
 * 1. Detects voice files in Slack messages
 * 2. Downloads and transcribes the audio
 * 3. Generates a response using the configured agent
 * 4. Sends voice/text/both response based on configuration
 *
 * @param params Voice message handling parameters
 * @returns True if voice message was handled, false otherwise
 */
export async function handleSlackVoiceMessage(params: {
  message: { files?: SlackVoiceFile[] };
  client: any; // Slack WebClient
  token: string;
  providersConfig?: VoiceProvidersConfig;
  channelId: string;
  userId?: string;
  runtime?: RuntimeEnv;
  /**
   * Function to generate reply text from transcribed message
   * Should return the response text to be sent
   */
  replyFn: (transcribedText: string) => Promise<string>;
  /**
   * Function to send the final message(s) to Slack
   * Receives text and/or voice response
   */
  sendFn: (params: {
    voiceBuffer?: Buffer;
    text?: string;
    threadTs?: string;
  }) => Promise<void>;
  threadTs?: string;
}): Promise<boolean> {
  const { message, client, token, providersConfig, channelId, userId, runtime, replyFn, sendFn, threadTs } = params;

  // Check for voice file
  const voiceFile = extractVoiceAttachment(message);
  if (!voiceFile) {
    return false;
  }

  logVerbose(
    `slack-voice: detected voice file (name: ${voiceFile.name}, size: ${voiceFile.size} bytes)`,
  );

  // Initialize voice provider registry
  const registry = new VoiceProviderRegistry();
  if (providersConfig) {
    await registry.loadProviders(providersConfig);
  }

  try {
    // Create message handler to download audio
    const effectiveRuntime: RuntimeEnv = runtime || {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    };
    const messageHandler = new SlackVoiceMessageHandler(client, effectiveRuntime);

    // Download the audio file
    const voiceContext: SlackVoiceContext = await messageHandler.downloadAudioFile(voiceFile, channelId);

    logVerbose(`slack-voice: downloaded audio (format: ${voiceContext.format}, size: ${voiceContext.sizeBytes} bytes)`);

    // Get STT provider with fallback
    const transcriber = await registry.getTranscriber();

    // Transcribe the audio
    const result = await transcriber.transcribe(voiceContext.audioPath as any, {
      format: voiceContext.format,
    });

    // Extract text from transcription result
    let transcribedText = '';
    if ('text' in result && typeof result.text === 'string') {
      transcribedText = result.text.trim();
    } else if ('transcript' in result && typeof result.transcript === 'string') {
      transcribedText = result.transcript.trim();
    }

    if (!transcribedText) {
      logVerbose('slack-voice: empty transcription, skipping');
      await messageHandler.cleanup(voiceContext);
      return false;
    }

    logVerbose(`slack-voice: transcribed text: "${transcribedText}"`);

    // Generate response text
    const responseText = await replyFn(transcribedText);
    if (!responseText) {
      logVerbose('slack-voice: empty response text, skipping');
      await messageHandler.cleanup(voiceContext);
      return false;
    }

    logVerbose(`slack-voice: sending text response`);

    // For now, always send text response
    // Voice synthesis can be added in future similar to Discord/Telegram

    // Send response via provided function
    await sendFn({
      text: responseText,
      threadTs,
    });

    // Cleanup
    await messageHandler.cleanup(voiceContext);

    return true;
  } catch (error) {
    // Log error and fall back to text-only processing
    logVerbose(
      `slack-voice: failed to handle voice message: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Attempt text fallback if transcription succeeded but response failed
    try {
      await sendFn({
        text: 'Sorry, I encountered an error processing the voice message.',
        threadTs,
      });
    } catch (fallbackError) {
      logVerbose(
        `slack-voice: fallback text response failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }

    return false;
  } finally {
    // Cleanup registry
    await registry.shutdown();
  }
}

/**
 * Check if a Slack message contains voice attachments
 * Useful for filtering messages before full processing
 */
export function shouldHandleSlackVoiceMessage(message: { files?: Array<{ mimetype?: string; name?: string }> }): boolean {
  return hasVoiceAttachment(message);
}
