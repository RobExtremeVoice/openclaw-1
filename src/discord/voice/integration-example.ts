/**
 * Integration Example: Discord Voice Messages
 *
 * This example shows how to integrate voice message support
 * into the existing Discord message handler.
 */

import type { Message } from '@buape/carbon';
import type { RuntimeEnv } from '../../runtime.js';
import type { DiscordVoiceConfig, VoiceResponseType } from './config.js';
import {
  hasAudioAttachment,
  getAudioAttachments,
  processAudioMessage,
} from './message-handler.js';
import { handleVoiceMessageResponse } from './response-handler.js';
import { getChildLogger } from '../../logging.js';

const logger = getChildLogger({ module: 'discord-voice-integration' });

/**
 * Example: Detect and process voice messages in Discord message handler
 *
 * Add this to your existing Discord message processing pipeline.
 */
export async function handleDiscordMessage(params: {
  message: Message;
  token: string;
  runtime: RuntimeEnv;
  voiceConfig: DiscordVoiceConfig;
  channelName?: string;
  guildName?: string;
  userName?: string;
}): Promise<void> {
  const { message, token, runtime, voiceConfig, channelName, guildName, userName } = params;

  // Check if message has audio attachments
  if (!hasAudioAttachment(message)) {
    // Not a voice message, handle as regular text message
    logger.debug({ messageId: message.id }, 'No audio attachment, skipping voice handler');
    return;
  }

  const author = message.author;
  if (!author) {
    logger.warn({ messageId: message.id }, 'Voice message has no author');
    return;
  }

  logger.info(
    {
      messageId: message.id,
      userId: author.id,
      channelId: message.channelId,
    },
    'Processing voice message',
  );

  try {
    // Get all audio attachments (usually just one for voice messages)
    const audioAttachments = getAudioAttachments(message);

    if (audioAttachments.length === 0) {
      logger.warn({ messageId: message.id }, 'hasAudioAttachment returned true but no audio found');
      return;
    }

    // Process the first audio attachment
    const attachment = audioAttachments[0];

    const { audioData, metadata } = await processAudioMessage(
      message,
      attachment,
      {
        channelName,
        guildName,
        userName,
        runtime,
      },
    );

    logger.info(
      {
        messageId: message.id,
        audioSize: audioData.length,
        format: metadata.contentType,
        duration: metadata.duration,
      },
      'Audio downloaded successfully',
    );

    // TODO: Transcribe audio using STT provider
    // For now, we'll use placeholder text
    const transcribedText = '[Audio message transcription would go here]';

    // TODO: Process through agent
    // For now, we'll use placeholder response
    const agentResponse = 'I received your voice message!';

    // Handle voice message response based on configuration
    await handleVoiceMessageResponse({
      message,
      token,
      runtime,
      voiceConfig,
      responseText: agentResponse,
      channelName,
      guildName,
      userName,
    });

    logger.info(
      {
        messageId: message.id,
        responseLength: agentResponse.length,
      },
      'Voice message handled successfully',
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id,
      },
      'Failed to handle voice message',
    );

    // Fallback: Log error but don't attempt to send via REST
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to handle voice message, fallback skipped',
    );
  }
}

/**
 * Example: Integration with existing message handler preflight
 *
 * This shows how to modify the existing preflight check to detect voice messages.
 */
export function shouldHandleAsVoiceMessage(message: Message): boolean {
  // Voice messages are typically:
  // 1. Audio-only (no text content)
  // 2. Or have minimal text with audio attachment
  const hasAudio = hasAudioAttachment(message);
  const hasMinimalText = !message.content || message.content.trim().length < 20;

  return hasAudio && hasMinimalText;
}

/**
 * Example: Configuration helper for different scenarios
 */
export function getVoiceConfigForContext(params: {
  guildId?: string;
  channelId?: string;
  userId?: string;
  baseConfig: DiscordVoiceConfig;
}): {
  responseType: VoiceResponseType;
  shouldProcess: boolean;
} {
  const { guildId, channelId, userId, baseConfig } = params;

  // Check if voice messages are enabled
  if (!baseConfig.enabled) {
    return {
      responseType: 'text',
      shouldProcess: false,
    };
  }

  // Resolve response type using priority order
  let responseType: VoiceResponseType = baseConfig.messageResponse;

  // Guild override
  if (guildId && baseConfig.perGuildOverride?.[guildId]) {
    responseType = baseConfig.perGuildOverride[guildId];
  }

  // Channel override (higher priority)
  if (channelId && baseConfig.perChannelOverride?.[channelId]) {
    responseType = baseConfig.perChannelOverride[channelId];
  }

  // User override (highest priority)
  if (userId && baseConfig.perUserOverride?.[userId]) {
    responseType = baseConfig.perUserOverride[userId];
  }

  return {
    responseType,
    shouldProcess: true,
  };
}

/**
 * Example: Complete flow from detection to response
 */
export async function completeVoiceMessageFlow(params: {
  message: Message;
  token: string;
  runtime: RuntimeEnv;
  voiceConfig: DiscordVoiceConfig;
}): Promise<{ success: boolean; error?: string }> {
  const { message, token, runtime, voiceConfig } = params;

  try {
    // Step 1: Detect audio attachment
    if (!hasAudioAttachment(message)) {
      return { success: false, error: 'No audio attachment' };
    }

    // Step 2: Get configuration for this context
    const messageAuthor = message.author;
    if (!messageAuthor) {
      return { success: false, error: 'Message has no author' };
    }

    const { responseType, shouldProcess } = getVoiceConfigForContext({
      guildId: undefined,
      channelId: message.channelId,
      userId: messageAuthor.id,
      baseConfig: voiceConfig,
    });

    if (!shouldProcess) {
      return { success: false, error: 'Voice messages disabled' };
    }

    logger.info(
      {
        messageId: message.id,
        responseType,
      },
      'Voice message flow starting',
    );

    // Step 3: Download audio
    const audioAttachments = getAudioAttachments(message);
    const { audioData, metadata } = await processAudioMessage(
      message,
      audioAttachments[0],
      { runtime },
    );

    // Step 4: Transcribe (placeholder)
    const transcription = '[Transcription]';

    // Step 5: Process through agent (placeholder)
    const agentResponse = 'Response from agent';

    // Step 6: Send response
    await handleVoiceMessageResponse({
      message,
      token,
      runtime,
      voiceConfig,
      responseText: agentResponse,
    });

    logger.info({ messageId: message.id }, 'Voice message flow completed');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Voice message flow failed');
    return { success: false, error: errorMessage };
  }
}
