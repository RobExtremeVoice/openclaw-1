/**
 * Example: Slack Voice Integration
 *
 * This example demonstrates how to integrate voice messaging
 * into a Slack bot using Clawdbot's voice handlers.
 */

import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import {
  SlackVoiceMessageHandler,
  SlackVoiceResponseHandler,
  registerSlackVoiceEvents,
} from './index.js';
import type { RuntimeEnv } from '../../runtime.js';

/**
 * Example: Setup voice integration for Slack bot
 */
export async function setupSlackVoiceIntegration(
  app: App,
  client: WebClient,
  runtime: RuntimeEnv,
) {
  // Initialize message handler
  const messageHandler = new SlackVoiceMessageHandler(client, runtime, {
    maxFileSizeBytes: 50 * 1024 * 1024, // 50MB max
    enableTranscription: false, // Optional: enable if you want text transcription
  });

  // Initialize response handler with modality configuration
  const responseHandler = new SlackVoiceResponseHandler(client, runtime, {
    defaultVoice: 'en_us',
    defaultSpeed: 1.0,
    targetSampleRate: 24000,
    targetBitrate: 64,
    includeTranscriptByDefault: true,
    slackVoiceConfig: {
      // 'match' (default): respond in same format as input
      // 'voice': always respond with voice
      // 'text': always respond with text
      // 'both': send both voice and text responses
      messageResponse: 'match',

      // Per-channel overrides (takes precedence over messageResponse)
      perChannelOverride: {
        // Example: always text in announcements channel
        'C_ANNOUNCEMENTS': 'text',
        // Example: always voice in voice channel
        'C_VOICE': 'voice',
      },

      // Per-user overrides (highest precedence)
      perUserOverride: {
        // Example: specific user gets text responses
        'U_USER_PREFERS_TEXT': 'text',
        // Example: specific user gets both formats
        'U_USER_PREFERS_BOTH': 'both',
      },

      defaultResponse: 'match',
    },
  });

  // Register voice event handlers
  registerSlackVoiceEvents({
    ctx: {
      app,
      client,
      runtime,
      shouldDropMismatchedSlackEvent: () => false,
    } as any,
    handlers: {
      messageHandler,
      responseHandler,
      onVoiceMessage: async (fileId, channelId, userId) => {
        runtime.log?.(`Received voice message: ${fileId} from ${userId}`);

        try {
          // Get file info from Slack
          const fileInfo = await client.files.info({ file: fileId });
          if (!fileInfo.ok || !fileInfo.file) {
            runtime.error?.('Failed to get file info');
            return;
          }

          const file = fileInfo.file as any;

          // Create voice file object
          const voiceFile = {
            id: file.id,
            name: file.name,
            mimetype: file.mimetype,
            size: file.size,
            url_private: file.url_private,
            url_private_download: file.url_private_download,
            user: file.user,
            timestamp: file.timestamp,
          };

          // Download audio file
          const context = await messageHandler.downloadAudioFile(
            voiceFile,
            channelId,
          );

          runtime.log?.(
            `Downloaded voice file: ${context.audioPath} (${context.format})`,
          );

          // Here you would process the audio with your agent
          // For this example, we'll just send a simple response
          const agentResponse = await processVoiceWithAgent(context);

          // Send response with modality matching input
          // The responseHandler will automatically determine whether to send
          // voice, text, or both based on the configuration
          await responseHandler.sendVoiceResponse({
            channelId,
            text: agentResponse,
            userId,
            inputModality: context.inputModality, // Pass input modality for matching
            includeTranscript: true,
          });

          runtime.log?.('Sent voice response');

          // Cleanup temporary file
          await messageHandler.cleanup(context);
        } catch (err) {
          runtime.error?.(`Voice message handling failed: ${err}`);
        }
      },
    },
  });

  // Setup periodic cleanup (every 10 minutes)
  setInterval(async () => {
    await messageHandler.cleanupOldFiles(3600000); // 1 hour
    await responseHandler.cleanupOldFiles(3600000);
  }, 600000);

  runtime.log?.('Slack voice integration initialized');
}

/**
 * Example: Process voice message with agent
 * Replace this with your actual agent processing logic
 */
async function processVoiceWithAgent(context: any): Promise<string> {
  // TODO: Implement your agent logic here
  // This could include:
  // - Transcribing the audio (if enabled)
  // - Analyzing the content
  // - Generating a response
  // - Querying external services

  // For this example, return a simple response
  return 'Thank you for your voice message. How can I help you today?';
}

/**
 * Example: Respond to text message with voice
 */
export async function respondWithVoice(
  client: WebClient,
  runtime: RuntimeEnv,
  channelId: string,
  text: string,
  threadTs?: string,
) {
  const responseHandler = new SlackVoiceResponseHandler(client, runtime);

  await responseHandler.sendVoiceResponse({
    channelId,
    threadTs,
    text,
    includeTranscript: true,
  });
}

/**
 * Example: Custom voice settings per user
 */
export async function respondWithCustomVoice(
  client: WebClient,
  runtime: RuntimeEnv,
  channelId: string,
  text: string,
  options: {
    voice?: string;
    speed?: number;
    includeTranscript?: boolean;
  },
) {
  const responseHandler = new SlackVoiceResponseHandler(client, runtime);

  await responseHandler.sendVoiceResponse({
    channelId,
    text,
    voice: options.voice || 'en_us',
    speed: options.speed || 1.0,
    includeTranscript: options.includeTranscript ?? true,
  });
}

/**
 * Example: Batch voice responses
 */
export async function sendBatchVoiceResponses(
  client: WebClient,
  runtime: RuntimeEnv,
  messages: Array<{
    channelId: string;
    text: string;
    threadTs?: string;
  }>,
) {
  const responseHandler = new SlackVoiceResponseHandler(client, runtime);

  // Send all responses in parallel
  await Promise.all(
    messages.map(msg =>
      responseHandler.sendVoiceResponse({
        channelId: msg.channelId,
        threadTs: msg.threadTs,
        text: msg.text,
      }),
    ),
  );

  runtime.log?.(`Sent ${messages.length} voice responses`);
}

/**
 * Example: Configure modality matching
 *
 * Demonstrates how to set up response modality matching:
 * - Match input (voice -> voice, text -> text)
 * - Force voice responses
 * - Force text responses
 * - Send both formats
 */
export async function setupModalityMatching(
  client: WebClient,
  runtime: RuntimeEnv,
) {
  // Example 1: Match input modality (default behavior)
  const matchHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'match', // Respond in same format as input
    },
  });

  // Example 2: Always voice responses
  const voiceHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'voice', // Always respond with voice
    },
  });

  // Example 3: Always text responses
  const textHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'text', // Always respond with text
    },
  });

  // Example 4: Send both voice and text
  const bothHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'both', // Send both formats
    },
  });

  // Example 5: Per-channel configuration
  const perChannelHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'match', // Default: match input
      perChannelOverride: {
        'C_VOICE_CHANNEL': 'voice', // Always voice in this channel
        'C_TEXT_CHANNEL': 'text', // Always text in this channel
        'C_BOTH_CHANNEL': 'both', // Always both in this channel
      },
    },
  });

  // Example 6: Per-user configuration
  const perUserHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'match', // Default: match input
      perUserOverride: {
        'U_VOICE_LOVER': 'voice', // This user always gets voice
        'U_TEXT_LOVER': 'text', // This user always gets text
        'U_BOTH_LOVER': 'both', // This user gets both formats
      },
    },
  });

  // Example 7: Hierarchical configuration (user > channel > default)
  const hierarchicalHandler = new SlackVoiceResponseHandler(client, runtime, {
    slackVoiceConfig: {
      messageResponse: 'match', // Default: match input
      perChannelOverride: {
        'C_VOICE_CHANNEL': 'voice', // Channel default: voice
      },
      perUserOverride: {
        'U_TEXT_USER': 'text', // User override: text (takes precedence)
      },
    },
  });

  return {
    matchHandler,
    voiceHandler,
    textHandler,
    bothHandler,
    perChannelHandler,
    perUserHandler,
    hierarchicalHandler,
  };
}
