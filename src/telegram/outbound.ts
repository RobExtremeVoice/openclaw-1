import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import type {
  ProviderMedia,
  SendOptions,
  SendResult,
} from "../providers/base/types.js";
import { capabilities } from "./capabilities.js";
import { streamDownloadToTemp } from "./download.js";
import { extractUserId, resolveEntity } from "./utils.js";

/**
 * Send a text message via Telegram.
 */
export async function sendTextMessage(
  client: TelegramClient,
  to: string,
  body: string,
  options?: SendOptions,
): Promise<SendResult> {
  const entity = await resolveEntity(client, to);

  const result = await client.sendMessage(entity, {
    message: body,
    replyTo: options?.replyTo ? Number(options.replyTo) : undefined,
  });

  return {
    messageId: result.id.toString(),
    status: "sent",
    providerMeta: {
      jid: extractUserId(entity),
    },
  };
}

/**
 * Send a message with media attachment via Telegram.
 *
 * Media sources:
 * - Buffer: Sent directly from memory (existing behavior)
 * - URL: Streamed to temp file (~/.warelay/telegram-temp), sent, then cleaned up
 *
 * Streaming eliminates OOM risk for large files by avoiding memory buffering.
 * Temp files are automatically cleaned up after send (success or failure).
 */
export async function sendMediaMessage(
  client: TelegramClient,
  to: string,
  body: string,
  media: ProviderMedia,
  options?: SendOptions,
): Promise<SendResult> {
  const entity = await resolveEntity(client, to);

  // Determine file source
  let file: Buffer | string;
  let downloadCleanup: (() => Promise<void>) | undefined;

  try {
    if (media.buffer) {
      // CASE 1: Buffer-based media (existing path)
      file = media.buffer;
    } else if (media.url) {
      // CASE 2: URL-based media (streaming path)

      // HEAD check for early size validation (best effort)
      let contentLength: string | null = null;
      try {
        const headResponse = await fetch(media.url, { method: "HEAD" });
        contentLength = headResponse.headers.get("content-length");
      } catch (headError) {
        // HEAD blocked or failed - warn but proceed with streaming download
        console.warn(
          `⚠️  HEAD request failed for ${media.url}, proceeding with streaming download: ${headError instanceof Error ? headError.message : String(headError)}`,
        );
      }

      const maxSize = capabilities.maxMediaSize;

      if (contentLength) {
        const sizeBytes = Number.parseInt(contentLength, 10);
        if (sizeBytes > maxSize) {
          throw new Error(
            `Media size ${(sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(0)}MB. ` +
              "Lower limit with TELEGRAM_MAX_MEDIA_MB env var if needed.",
          );
        }
      }

      // Stream download to temp file (eliminates memory buffering)
      const download = await streamDownloadToTemp(media.url, maxSize);
      file = download.tempPath;
      downloadCleanup = download.cleanup;
    } else {
      throw new Error("Media must have either buffer or url");
    }

    // Send based on media type
    let result: { id: number };
    const caption = body || undefined;

    switch (media.type) {
      case "image":
        result = await client.sendFile(entity, {
          file,
          caption,
          replyTo: options?.replyTo ? Number(options.replyTo) : undefined,
        });
        break;

      case "video":
        result = await client.sendFile(entity, {
          file,
          caption,
          replyTo: options?.replyTo ? Number(options.replyTo) : undefined,
          attributes: [
            new Api.DocumentAttributeVideo({
              duration: 0,
              w: 0,
              h: 0,
            }),
          ],
        });
        break;

      case "audio":
      case "voice":
        result = await client.sendFile(entity, {
          file,
          caption,
          replyTo: options?.replyTo ? Number(options.replyTo) : undefined,
          voiceNote: media.type === "voice",
        });
        break;
      default:
        result = await client.sendFile(entity, {
          file,
          caption,
          replyTo: options?.replyTo ? Number(options.replyTo) : undefined,
          attributes: media.fileName
            ? [
                new Api.DocumentAttributeFilename({
                  fileName: media.fileName,
                }),
              ]
            : undefined,
        });
        break;
    }

    return {
      messageId: result.id.toString(),
      status: "sent",
      providerMeta: {
        jid: extractUserId(entity),
      },
    };
  } finally {
    // CRITICAL: Clean up temp file on success or failure
    if (downloadCleanup) {
      await downloadCleanup();
    }
  }
}

/**
 * Send typing indicator to a chat.
 */
export async function sendTypingIndicator(
  client: TelegramClient,
  to: string,
): Promise<void> {
  const entity = await resolveEntity(client, to);
  await client.invoke(
    new Api.messages.SetTyping({
      peer: entity,
      action: new Api.SendMessageTypingAction(),
    }),
  );
}
