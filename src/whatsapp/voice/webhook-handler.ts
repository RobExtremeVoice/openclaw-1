/**
 * WhatsApp Cloud API Webhook Handler
 *
 * Handles WhatsApp webhook events for both text and voice messages.
 * WhatsApp sends events via POST /webhook with message data.
 *
 * Webhook structure:
 * ```json
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "id": "...",
 *     "changes": [{
 *       "value": {
 *         "messaging_product": "whatsapp",
 *         "messages": [{
 *           "from": "1234567890",
 *           "id": "message_id",
 *           "type": "text" | "audio" | "image" | "document",
 *           "text": { "body": "..." },
 *           "audio": { "media_id": "...", "mime_type": "audio/ogg" }
 *         }]
 *       }
 *     }]
 *   }]
 * }
 * ```
 */

import { logVerbose } from '../../globals.js';
import type { RuntimeEnv } from '../../runtime.js';

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp?: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';
  text?: {
    body: string;
  };
  audio?: {
    media_id: string;
    mime_type?: string;
  };
  image?: {
    media_id: string;
    mime_type?: string;
  };
  document?: {
    media_id: string;
    mime_type?: string;
    filename?: string;
  };
  video?: {
    media_id: string;
    mime_type?: string;
  };
  sticker?: {
    media_id: string;
    mime_type?: string;
    animated?: boolean;
  };
}

export interface WhatsAppWebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata?: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: WhatsAppWebhookMessage[];
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp?: string;
          recipient_id?: string;
          error?: {
            code: number;
            title: string;
            message: string;
          };
        }>;
      };
    }>;
  }>;
}

export interface ParsedWebhookMessage {
  type: 'text' | 'audio' | 'media' | 'status';
  fromPhoneNumber: string;
  messageId: string;
  timestamp?: number;
  text?: string;
  audio?: {
    media_id: string;
    mime_type: string;
  };
  media?: {
    type: 'image' | 'video' | 'document' | 'sticker';
    media_id: string;
    mime_type: string;
  };
  status?: {
    messageId: string;
    status: string;
  };
}

/**
 * WhatsApp Webhook Parser
 *
 * Parses incoming WhatsApp Cloud API webhook events and categorizes them
 */
export class WhatsAppWebhookParser {
  constructor(private runtime?: RuntimeEnv) {}

  /**
   * Parse webhook event from WhatsApp Cloud API
   */
  parseEvent(body: WhatsAppWebhookEvent): ParsedWebhookMessage[] {
    const messages: ParsedWebhookMessage[] = [];

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Parse message events
        if (value.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            const parsed = this.parseMessage(msg);
            if (parsed) {
              messages.push(parsed);
            }
          }
        }

        // Parse status events
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            messages.push({
              type: 'status',
              fromPhoneNumber: '',
              messageId: status.id || '',
              status: {
                messageId: status.id || '',
                status: status.status || 'unknown',
              },
            });
          }
        }
      }
    }

    return messages;
  }

  /**
   * Parse individual message from webhook
   */
  private parseMessage(msg: WhatsAppWebhookMessage): ParsedWebhookMessage | null {
    try {
      const timestamp = msg.timestamp ? parseInt(msg.timestamp, 10) : Date.now();

      // Voice message
      if (msg.type === 'audio' && msg.audio) {
        return {
          type: 'audio',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          audio: {
            media_id: msg.audio.media_id,
            mime_type: msg.audio.mime_type || 'audio/ogg',
          },
        };
      }

      // Text message
      if (msg.type === 'text' && msg.text) {
        return {
          type: 'text',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          text: msg.text.body,
        };
      }

      // Other media (image, video, document, sticker)
      if (msg.type === 'image' && msg.image) {
        return {
          type: 'media',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          media: {
            type: 'image',
            media_id: msg.image.media_id,
            mime_type: msg.image.mime_type || 'image/jpeg',
          },
        };
      }

      if (msg.type === 'video' && msg.video) {
        return {
          type: 'media',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          media: {
            type: 'video',
            media_id: msg.video.media_id,
            mime_type: msg.video.mime_type || 'video/mp4',
          },
        };
      }

      if (msg.type === 'document' && msg.document) {
        return {
          type: 'media',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          media: {
            type: 'document',
            media_id: msg.document.media_id,
            mime_type: msg.document.mime_type || 'application/pdf',
          },
        };
      }

      if (msg.type === 'sticker' && msg.sticker) {
        return {
          type: 'media',
          fromPhoneNumber: msg.from,
          messageId: msg.id,
          timestamp,
          media: {
            type: 'sticker',
            media_id: msg.sticker.media_id,
            mime_type: msg.sticker.mime_type || 'image/webp',
          },
        };
      }

      logVerbose(`whatsapp-webhook: unknown message type: ${msg.type}`);
      return null;
    } catch (error) {
      this.runtime?.error?.(
        `Failed to parse WhatsApp message: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Check if parsed message is a voice message
   */
  isVoiceMessage(parsed: ParsedWebhookMessage): boolean {
    return parsed.type === 'audio';
  }

  /**
   * Check if parsed message is a text message
   */
  isTextMessage(parsed: ParsedWebhookMessage): boolean {
    return parsed.type === 'text';
  }

  /**
   * Check if parsed message is a status event
   */
  isStatusEvent(parsed: ParsedWebhookMessage): boolean {
    return parsed.type === 'status';
  }
}
