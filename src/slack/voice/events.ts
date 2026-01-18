/**
 * Slack Voice Event Handlers
 *
 * Registers event handlers for voice messages in Slack:
 * - file_shared events for incoming audio
 * - Integration with existing message handler
 */

import type { SlackEventMiddlewareArgs } from '@slack/bolt';
import type { SlackMonitorContext } from '../monitor/context.js';
import type { SlackVoiceMessageHandler } from './message-handler.js';
import type { SlackVoiceResponseHandler } from './response-handler.js';

export interface SlackVoiceEventHandlers {
  messageHandler: SlackVoiceMessageHandler;
  responseHandler: SlackVoiceResponseHandler;
  onVoiceMessage?: (fileId: string, channelId: string, userId?: string) => Promise<void>;
}

/**
 * Register voice-related event handlers for Slack
 */
export function registerSlackVoiceEvents(params: {
  ctx: SlackMonitorContext;
  handlers: SlackVoiceEventHandlers;
}) {
  const { ctx, handlers } = params;
  const { messageHandler, responseHandler, onVoiceMessage } = handlers;

  // Listen for file_shared events
  ctx.app.event('file_shared', async ({ event, body }: SlackEventMiddlewareArgs<'file_shared'>) => {
    try {
      if (ctx.shouldDropMismatchedSlackEvent(body)) return;

      const fileId = event.file_id;
      const userId = event.user_id;

      // Get file info
      const fileInfo = await (ctx as any).client.files.info({ file: fileId });
      if (!fileInfo.ok || !fileInfo.file) {
        ctx.runtime.error?.('Failed to get file info');
        return;
      }

      const file = fileInfo.file as any;

      // Check if it's an audio file
      const voiceFile = {
        id: file.id,
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
        url_private: file.url_private,
        url_private_download: file.url_private_download,
        channels: file.channels,
        user: file.user,
        timestamp: file.timestamp,
      };

      if (!messageHandler.isAudioFile(voiceFile)) {
        // Not an audio file, ignore
        return;
      }

      // Get channel (use first channel if multiple)
      const channelId = file.channels?.[0] || event.channel_id;
      if (!channelId) {
        ctx.runtime.error?.('No channel ID found for voice message');
        return;
      }

      ctx.runtime.log?.(`Received voice message: ${file.name} in channel ${channelId}`);

      // Trigger custom handler if provided
      if (onVoiceMessage) {
        await onVoiceMessage(fileId, channelId, userId);
      }
    } catch (err) {
      ctx.runtime.error?.(`Failed to handle voice message: ${err}`);
    }
  });
}
