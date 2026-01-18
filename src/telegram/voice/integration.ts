/**
 * Telegram Voice Message Integration
 *
 * Handles voice message detection, transcription, and response generation
 * with automatic voice/text response based on configuration.
 *
 * Follows the same pattern as Discord voice integration.
 */

import type { Message } from "@grammyjs/types";

import { logVerbose } from "../../globals.js";
import { fetchRemoteMedia } from "../../media/fetch.js";
import { VoiceProviderRegistry } from "../../media/voice-providers/registry.js";
import type { VoiceProvidersConfig } from "../../config/zod-schema.voice-providers.js";

/**
 * Check if a Telegram message contains a voice message
 */
function isVoiceMessage(message: Message): boolean {
  return "voice" in message && message.voice !== undefined;
}

/**
 * Extract voice message from Telegram message
 */
function extractVoiceMessage(message: Message): Message["voice"] | null {
  if (!isVoiceMessage(message)) {
    return null;
  }
  return message.voice!;
}

/**
 * Download and transcribe voice message from Telegram
 */
async function transcribeVoiceMessage(
  message: Message,
  bot: any,
  token: string,
  registry: VoiceProviderRegistry,
): Promise<string> {
  const voiceMessage = message.voice;
  if (!voiceMessage) {
    throw new Error("No voice message found");
  }

  // Download the audio file from Telegram
  const fileInfo = await bot.api.getFile(voiceMessage.file_id);
  if (!fileInfo.file_path) {
    throw new Error("Failed to get Telegram file path");
  }

  // Construct download URL
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

  // Download the audio file
  const fetched = await fetchRemoteMedia({
    url: downloadUrl,
    filePathHint: `voice_${voiceMessage.file_id}.ogg`,
  });

  // Get STT provider with fallback
  const transcriber = await registry.getTranscriber();

  // Transcribe the audio - use buffer as-is (providers handle format internally)
  const result = await transcriber.transcribe(fetched.buffer as any, {
    // Skip format - providers will auto-detect or handle Ogg Opus
  });

  // Extract text from transcription result
  if ("text" in result && typeof result.text === "string") {
    return result.text.trim();
  }

  throw new Error("Transcription failed: no text returned");
}

/**
 * Handle Telegram voice message with transcription and voice response
 *
 * This function:
 * 1. Detects voice messages in Telegram messages
 * 2. Downloads and transcribes the audio
 * 3. Generates a response using the configured agent
 * 4. Sends voice/text/both response based on configuration
 *
 * @param message Telegram message to process
 * @param bot Telegram bot instance
 * @param token Telegram bot token
 * @param providersConfig Voice providers configuration
 * @param replyFn Function to generate text reply from transcribed message
 * @param sendFn Function to send the final message(s) to Telegram
 * @returns True if voice message was handled, false otherwise
 */
export async function handleTelegramVoiceMessage(params: {
  message: Message;
  bot: any;
  token: string;
  providersConfig?: VoiceProvidersConfig;
  chatId: number;
  userId?: number;
  /**
   * Function to generate reply text from transcribed message
   * Should return the response text to be spoken/sent
   */
  replyFn: (transcribedText: string) => Promise<string>;
  /**
   * Function to send the final message(s) to Telegram
   * Receives voice buffer and/or text to send
   */
  sendFn: (params: {
    voiceBuffer?: Buffer;
    text?: string;
    replyToId?: number;
  }) => Promise<void>;
}): Promise<boolean> {
  const { message, bot, token, providersConfig, chatId, userId, replyFn, sendFn } = params;

  // Check for voice message
  const voiceMessage = extractVoiceMessage(message);
  if (!voiceMessage) {
    return false;
  }

  logVerbose(
    `telegram-voice: detected voice message (duration: ${voiceMessage.duration}s, fileId: ${voiceMessage.file_id})`,
  );

  // Initialize voice provider registry
  const registry = new VoiceProviderRegistry();
  if (providersConfig) {
    await registry.loadProviders(providersConfig);
  }

  try {
    // Transcribe the voice message
    const transcribedText = await transcribeVoiceMessage(message, bot, token, registry);
    logVerbose(`telegram-voice: transcribed text: "${transcribedText}"`);

    if (!transcribedText) {
      logVerbose("telegram-voice: empty transcription, skipping");
      return false;
    }

    // Generate response text
    const responseText = await replyFn(transcribedText);
    if (!responseText) {
      logVerbose("telegram-voice: empty response text, skipping");
      return false;
    }

    // For now, always send text response
    // Voice synthesis support can be added in future if needed
    // This follows Telegram's current capabilities

    logVerbose(`telegram-voice: sending text response`);

    // Send response via provided function
    await sendFn({
      text: responseText,
      replyToId: message.message_id,
    });

    return true;
  } catch (error) {
    // Log error and fall back to text-only processing
    logVerbose(
      `telegram-voice: failed to handle voice message: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Attempt text fallback if transcription succeeded but response failed
    try {
      await sendFn({
        text: "Sorry, I encountered an error processing the voice message.",
        replyToId: message.message_id,
      });
    } catch (fallbackError) {
      logVerbose(
        `telegram-voice: fallback text response failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }

    return false;
  } finally {
    // Cleanup registry
    await registry.shutdown();
  }
}

/**
 * Check if a Telegram message contains a voice message
 * Useful for filtering messages before full processing
 */
export function hasVoiceMessage(message: Message): boolean {
  return extractVoiceMessage(message) !== null;
}
