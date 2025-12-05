import type { TelegramClient } from "telegram";
import type {
  DeliveryStatus,
  MessageHandler,
  Provider,
  ProviderConfig,
  SendOptions,
  SendResult,
  TelegramProviderConfig,
} from "../providers/base/index.js";
import { capabilities } from "./capabilities.js";
import { createTelegramClient, isClientConnected } from "./client.js";
import { cleanOrphanedTempFiles } from "./download.js";
import { startMessageListener } from "./inbound.js";
import { loginTelegram, logoutTelegram } from "./login.js";
import {
  sendMediaMessage,
  sendTextMessage,
  sendTypingIndicator,
} from "./outbound.js";
import { loadSession, telegramAuthExists } from "./session.js";

/**
 * Telegram MTProto Provider
 *
 * Implements the unified Provider interface for Telegram using MTProto (GramJS).
 * Handles personal account automation for 1-on-1 conversations.
 */
export class TelegramProvider implements Provider {
  readonly kind = "telegram";
  readonly capabilities = capabilities;

  private client: TelegramClient | null = null;
  private config: TelegramProviderConfig | null = null;
  private messageHandler: MessageHandler | null = null;
  private cleanupListener: (() => void) | null = null;
  private verbose = false;

  async initialize(config: ProviderConfig): Promise<void> {
    if (config.kind !== "telegram") {
      throw new Error(
        `Invalid config kind for TelegramProvider: ${config.kind}`,
      );
    }

    this.config = config;
    this.verbose = config.verbose ?? false;

    // Clean up orphaned temp files from previous crashes
    await cleanOrphanedTempFiles();

    // Load session
    const session = await loadSession();
    if (!session) {
      throw new Error(
        "No Telegram session found. Run: warelay login --provider telegram",
      );
    }

    // Create and connect client
    this.client = await createTelegramClient(session, this.verbose);
    await this.client.connect();

    if (!this.client.connected) {
      throw new Error("Failed to connect to Telegram");
    }
  }

  isConnected(): boolean {
    return this.client !== null && isClientConnected(this.client);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  async send(
    to: string,
    body: string,
    options?: SendOptions,
  ): Promise<SendResult> {
    if (!this.client) {
      throw new Error("Provider not initialized");
    }

    // If media provided, send with media
    if (options?.media && options.media.length > 0) {
      const media = options.media[0]; // Take first media attachment
      return await sendMediaMessage(this.client, to, body, media, options);
    }

    // Otherwise send text only
    return await sendTextMessage(this.client, to, body, options);
  }

  async sendTyping(to: string): Promise<void> {
    if (!this.client) {
      throw new Error("Provider not initialized");
    }

    await sendTypingIndicator(this.client, to);
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    // Telegram MTProto doesn't provide reliable delivery tracking
    // Messages are sent optimistically, so we return "unknown"
    return {
      messageId,
      status: "unknown",
      timestamp: Date.now(),
    };
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async startListening(): Promise<void> {
    if (!this.client) {
      throw new Error("Provider not initialized");
    }

    if (!this.messageHandler) {
      throw new Error("No message handler registered. Call onMessage() first.");
    }

    const allowFrom = this.config?.allowFrom;

    this.cleanupListener = await startMessageListener(
      this.client,
      this.messageHandler,
      allowFrom,
    );
  }

  async stopListening(): Promise<void> {
    if (this.cleanupListener) {
      this.cleanupListener();
      this.cleanupListener = null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return await telegramAuthExists();
  }

  async login(): Promise<void> {
    await loginTelegram(this.verbose);
  }

  async logout(): Promise<void> {
    await logoutTelegram(this.verbose);
  }

  async getSessionId(): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const me = await this.client.getMe();
      if ("username" in me && typeof me.username === "string") {
        return `@${me.username}`;
      }
      if ("phone" in me && typeof me.phone === "string") {
        return me.phone;
      }
      return null;
    } catch {
      return null;
    }
  }
}
