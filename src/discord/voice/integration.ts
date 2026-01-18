/**
 * Discord Voice Message Integration
 *
 * Handles voice message detection, transcription, and response generation
 * with automatic voice/text response based on configuration.
 */

import type { Message } from "@buape/carbon";
import type { APIAttachment } from "discord-api-types/v10";

import { logVerbose } from "../../globals.js";
import { fetchRemoteMedia } from "../../media/fetch.js";
import { VoiceProviderRegistry } from "../../media/voice-providers/registry.js";
import type { VoiceProvidersConfig } from "../../config/zod-schema.voice-providers.js";
import type { DiscordVoiceConfig } from "./config.js";
import {
  detectInputModality,
  resolveVoiceResponseType,
  isVoiceMessagesEnabled,
  mergeVoiceConfig,
  DEFAULT_VOICE_CONFIG,
} from "./config.js";

/**
 * Check if an attachment is a voice/audio file
 */
function isAudioAttachment(attachment: APIAttachment): boolean {
  const contentType = attachment.content_type?.toLowerCase() ?? "";
  const filename = attachment.filename?.toLowerCase() ?? "";

  // Check MIME type
  if (contentType.startsWith("audio/")) {
    return true;
  }

  // Check file extension
  const audioExtensions = [".mp3", ".ogg", ".wav", ".m4a", ".opus", ".flac", ".aac"];
  return audioExtensions.some((ext) => filename.endsWith(ext));
}

/**
 * Extract voice attachment from Discord message
 */
function extractVoiceAttachment(message: Message): APIAttachment | null {
  const attachments = message.attachments ?? [];
  return attachments.find((att) => isAudioAttachment(att)) ?? null;
}

/**
 * Download and transcribe voice attachment
 */
async function transcribeVoiceAttachment(
  attachment: APIAttachment,
  registry: VoiceProviderRegistry,
): Promise<string> {
  // Download the audio file
  const fetched = await fetchRemoteMedia({
    url: attachment.url,
    filePathHint: attachment.filename ?? attachment.url,
  });

  // Get STT provider with fallback
  const transcriber = await registry.getTranscriber();

  // Transcribe the audio - use buffer as-is (providers handle format internally)
  const result = await transcriber.transcribe(fetched.buffer as any, {
    // Skip format - providers will auto-detect
  });

  // Extract text from transcription result
  if ("text" in result && typeof result.text === "string") {
    return result.text.trim();
  }

  throw new Error("Transcription failed: no text returned");
}

/**
 * Handle Discord voice message with transcription and voice response
 *
 * This function:
 * 1. Detects voice attachments in Discord messages
 * 2. Downloads and transcribes the audio
 * 3. Generates a response using the configured agent
 * 4. Sends voice/text/both response based on configuration
 *
 * @param message Discord message to process
 * @param voiceConfig Voice message configuration (from Discord config)
 * @param providersConfig Voice providers configuration
 * @param replyFn Function to generate text reply from transcribed message
 * @returns True if voice message was handled, false otherwise
 */
export async function handleDiscordVoiceMessage(params: {
  message: Message;
  voiceConfig?: Partial<DiscordVoiceConfig>;
  providersConfig?: VoiceProvidersConfig;
  guildId?: string;
  channelId?: string;
  userId?: string;
  /**
   * Function to generate reply text from transcribed message
   * Should return the response text to be spoken/sent
   */
  replyFn: (transcribedText: string) => Promise<string>;
  /**
   * Function to send the final message(s) to Discord
   * Receives voice buffer and/or text to send
   */
  sendFn: (params: {
    voiceBuffer?: Buffer;
    text?: string;
    voiceFormat?: "mp3" | "ogg";
    replyToId?: string;
  }) => Promise<void>;
}): Promise<boolean> {
  const { message, voiceConfig, providersConfig, guildId, channelId, userId, replyFn, sendFn } =
    params;

  // Merge with defaults
  const config = mergeVoiceConfig(voiceConfig ?? {});

  // Check if voice messages are enabled
  if (!isVoiceMessagesEnabled(config)) {
    return false;
  }

  // Check for voice attachment
  const voiceAttachment = extractVoiceAttachment(message);
  if (!voiceAttachment) {
    return false;
  }

  logVerbose(
    `discord-voice: detected voice attachment ${voiceAttachment.filename} (${voiceAttachment.content_type})`,
  );

  // Initialize voice provider registry
  const registry = new VoiceProviderRegistry();
  if (providersConfig) {
    await registry.loadProviders(providersConfig);
  }

  try {
    // Transcribe the voice message
    const transcribedText = await transcribeVoiceAttachment(voiceAttachment, registry);
    logVerbose(`discord-voice: transcribed text: "${transcribedText}"`);

    if (!transcribedText) {
      logVerbose("discord-voice: empty transcription, skipping");
      return false;
    }

    // Generate response text
    const responseText = await replyFn(transcribedText);
    if (!responseText) {
      logVerbose("discord-voice: empty response text, skipping");
      return false;
    }

    // Detect input modality
    const inputModality = detectInputModality({ hasVoiceAttachment: true });

    // Resolve response type based on config and context
    const responseType = resolveVoiceResponseType(config, {
      guildId,
      channelId,
      userId,
      inputModality,
    });

    logVerbose(`discord-voice: response type: ${responseType}`);

    // Determine what to send based on response type
    let voiceBuffer: Buffer | undefined;
    let textToSend: string | undefined;

    if (responseType === "voice" || responseType === "both") {
      // Generate voice response
      try {
        const synthesizer = await registry.getSynthesizer();
        const audioResult = await synthesizer.synthesize(responseText, {
          // Format handled by synthesizer
        });

        // audioResult should be a Buffer
        if (Buffer.isBuffer(audioResult)) {
          voiceBuffer = audioResult;
        } else if ("buffer" in audioResult && Buffer.isBuffer(audioResult.buffer)) {
          voiceBuffer = audioResult.buffer;
        } else {
          logVerbose("discord-voice: synthesizer returned non-buffer, falling back to text");
        }
      } catch (synthError) {
        logVerbose(
          `discord-voice: synthesis failed: ${synthError instanceof Error ? synthError.message : String(synthError)}`,
        );
      }
    }

    if (responseType === "text" || responseType === "both" || !voiceBuffer) {
      textToSend = responseText;
    }

    // Send response via provided function
    await sendFn({
      voiceBuffer,
      text: textToSend,
      voiceFormat: config.voiceFormat,
      replyToId: message.id,
    });

    return true;
  } catch (error) {
    // Log error and fall back to text-only processing
    logVerbose(
      `discord-voice: failed to handle voice message: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Attempt text fallback if transcription succeeded but response failed
    try {
      await sendFn({
        text: "Sorry, I encountered an error processing the voice message.",
        replyToId: message.id,
      });
    } catch (fallbackError) {
      logVerbose(
        `discord-voice: fallback text response failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }

    return false;
  } finally {
    // Cleanup registry
    await registry.shutdown();
  }
}

/**
 * Check if a Discord message contains a voice attachment
 * Useful for filtering messages before full processing
 */
export function hasVoiceAttachment(message: Message): boolean {
  return extractVoiceAttachment(message) !== null;
}
