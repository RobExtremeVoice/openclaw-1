/**
 * Telegram Voice Conversation Manager
 *
 * Manages conversation continuity across voice message exchanges:
 * - Track voice message threads
 * - Maintain conversation context across voice exchanges
 * - Support multi-turn voice conversations
 * - Handle voice message reactions and replies
 * - Store voice message metadata for analytics
 * - Auto-cleanup of stale conversations
 */

import type { VoiceMessageMetadata } from "./message-handler.js";

export interface ConversationMessage {
  /** Message ID from Telegram */
  messageId: number;
  /** User ID who sent the message */
  userId: number;
  /** Message type: voice or text */
  type: "voice" | "text";
  /** Message content (transcription for voice, text for text) */
  content?: string;
  /** Voice message metadata if applicable */
  voiceMetadata?: VoiceMessageMetadata;
  /** Timestamp when message was received */
  timestamp: number;
  /** Whether this was a bot response */
  isBot: boolean;
}

export interface Conversation {
  /** Unique conversation key (chatId:userId or chatId:threadId) */
  conversationId: string;
  /** Chat ID */
  chatId: number;
  /** User ID (for private chats) */
  userId?: number;
  /** Thread/topic ID (for forum groups) */
  threadId?: number;
  /** Chat type */
  chatType: "private" | "group" | "supergroup" | "channel";
  /** Array of messages in conversation */
  messages: ConversationMessage[];
  /** When conversation started */
  startedAt: number;
  /** Last message timestamp */
  lastMessageAt: number;
  /** Conversation context/state */
  context?: Record<string, unknown>;
  /** Whether conversation is active */
  active: boolean;
}

export interface ConversationManagerOptions {
  /** Maximum messages to keep per conversation (default: 50) */
  maxMessagesPerConversation?: number;
  /** Conversation timeout in milliseconds (default: 5 minutes) */
  conversationTimeoutMs?: number;
  /** Auto-cleanup interval in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number;
  /** Enable conversation analytics (default: true) */
  enableAnalytics?: boolean;
}

/**
 * Generate unique conversation ID.
 */
export function generateConversationId(
  chatId: number,
  userId?: number,
  threadId?: number,
): string {
  if (threadId) {
    return `chat:${chatId}:thread:${threadId}`;
  }
  if (userId) {
    return `chat:${chatId}:user:${userId}`;
  }
  return `chat:${chatId}`;
}

/**
 * Voice conversation manager class.
 */
export class VoiceConversationManager {
  private conversations = new Map<string, Conversation>();
  private options: Required<ConversationManagerOptions>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private analytics = {
    totalConversations: 0,
    activeConversations: 0,
    totalMessages: 0,
    voiceMessages: 0,
    textMessages: 0,
  };

  constructor(options: ConversationManagerOptions = {}) {
    this.options = {
      maxMessagesPerConversation: options.maxMessagesPerConversation ?? 50,
      conversationTimeoutMs: options.conversationTimeoutMs ?? 5 * 60 * 1000, // 5 minutes
      cleanupIntervalMs: options.cleanupIntervalMs ?? 60 * 1000, // 1 minute
      enableAnalytics: options.enableAnalytics ?? true,
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get or create a conversation.
   */
  getOrCreateConversation(
    chatId: number,
    chatType: "private" | "group" | "supergroup" | "channel",
    userId?: number,
    threadId?: number,
  ): Conversation {
    const conversationId = generateConversationId(chatId, userId, threadId);
    let conversation = this.conversations.get(conversationId);

    if (!conversation) {
      conversation = {
        conversationId,
        chatId,
        userId,
        threadId,
        chatType,
        messages: [],
        startedAt: Date.now(),
        lastMessageAt: Date.now(),
        active: true,
      };

      this.conversations.set(conversationId, conversation);

      if (this.options.enableAnalytics) {
        this.analytics.totalConversations++;
        this.analytics.activeConversations++;
      }
    } else {
      conversation.lastMessageAt = Date.now();
      conversation.active = true;
    }

    return conversation;
  }

  /**
   * Add a message to a conversation.
   */
  addMessage(
    chatId: number,
    chatType: "private" | "group" | "supergroup" | "channel",
    message: Omit<ConversationMessage, "timestamp">,
    userId?: number,
    threadId?: number,
  ): Conversation {
    const conversation = this.getOrCreateConversation(chatId, chatType, userId, threadId);

    const fullMessage: ConversationMessage = {
      ...message,
      timestamp: Date.now(),
    };

    conversation.messages.push(fullMessage);

    // Trim messages if exceeding max
    if (conversation.messages.length > this.options.maxMessagesPerConversation) {
      const excess = conversation.messages.length - this.options.maxMessagesPerConversation;
      conversation.messages.splice(0, excess);
    }

    conversation.lastMessageAt = Date.now();

    if (this.options.enableAnalytics) {
      this.analytics.totalMessages++;
      if (message.type === "voice") {
        this.analytics.voiceMessages++;
      } else {
        this.analytics.textMessages++;
      }
    }

    return conversation;
  }

  /**
   * Add voice message to conversation.
   */
  addVoiceMessage(
    metadata: VoiceMessageMetadata,
    transcription?: string,
  ): Conversation {
    return this.addMessage(
      metadata.chatId,
      metadata.chatType,
      {
        messageId: metadata.messageId,
        userId: metadata.userId,
        type: "voice",
        content: transcription,
        voiceMetadata: metadata,
        isBot: false,
      },
      metadata.userId,
      metadata.threadId,
    );
  }

  /**
   * Add bot voice response to conversation.
   */
  addBotVoiceResponse(
    chatId: number,
    chatType: "private" | "group" | "supergroup",
    messageId: number,
    responseText: string,
    userId?: number,
    threadId?: number,
  ): Conversation {
    return this.addMessage(
      chatId,
      chatType,
      {
        messageId,
        userId: 0, // Bot has no user ID
        type: "voice",
        content: responseText,
        isBot: true,
      },
      userId,
      threadId,
    );
  }

  /**
   * Get conversation by ID.
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get conversation context.
   */
  getContext(conversationId: string): Record<string, unknown> | undefined {
    return this.conversations.get(conversationId)?.context;
  }

  /**
   * Set conversation context.
   */
  setContext(conversationId: string, context: Record<string, unknown>): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.context = context;
    }
  }

  /**
   * Update conversation context (merge).
   */
  updateContext(conversationId: string, updates: Record<string, unknown>): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.context = {
        ...conversation.context,
        ...updates,
      };
    }
  }

  /**
   * Get recent messages from conversation.
   */
  getRecentMessages(conversationId: string, count: number = 10): ConversationMessage[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return [];
    }

    return conversation.messages.slice(-count);
  }

  /**
   * Get conversation history as formatted text.
   */
  getConversationHistory(conversationId: string, maxMessages: number = 10): string {
    const messages = this.getRecentMessages(conversationId, maxMessages);

    return messages
      .map((msg) => {
        const sender = msg.isBot ? "Bot" : `User ${msg.userId}`;
        const content = msg.content ?? "[Voice message]";
        return `${sender}: ${content}`;
      })
      .join("\n");
  }

  /**
   * Check if conversation is active (within timeout).
   */
  isConversationActive(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    const timeSinceLastMessage = Date.now() - conversation.lastMessageAt;
    return timeSinceLastMessage < this.options.conversationTimeoutMs;
  }

  /**
   * End a conversation (mark as inactive).
   */
  endConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.active = false;

      if (this.options.enableAnalytics) {
        this.analytics.activeConversations = Math.max(0, this.analytics.activeConversations - 1);
      }
    }
  }

  /**
   * Delete a conversation and its data.
   */
  deleteConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      if (conversation.active && this.options.enableAnalytics) {
        this.analytics.activeConversations = Math.max(0, this.analytics.activeConversations - 1);
      }
      return this.conversations.delete(conversationId);
    }
    return false;
  }

  /**
   * Clean up stale conversations.
   */
  cleanupStaleConversations(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, conversation] of this.conversations.entries()) {
      const timeSinceLastMessage = now - conversation.lastMessageAt;

      if (timeSinceLastMessage > this.options.conversationTimeoutMs) {
        if (conversation.active && this.options.enableAnalytics) {
          this.analytics.activeConversations = Math.max(0, this.analytics.activeConversations - 1);
        }
        this.conversations.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConversations();
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Stop cleanup timer.
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get analytics data.
   */
  getAnalytics(): {
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    voiceMessages: number;
    textMessages: number;
    conversationCount: number;
  } {
    return {
      ...this.analytics,
      conversationCount: this.conversations.size,
    };
  }

  /**
   * Get all active conversations.
   */
  getActiveConversations(): Conversation[] {
    return Array.from(this.conversations.values()).filter((conv) =>
      this.isConversationActive(conv.conversationId),
    );
  }

  /**
   * Clear all conversations.
   */
  clearAll(): void {
    this.conversations.clear();

    if (this.options.enableAnalytics) {
      this.analytics.activeConversations = 0;
    }
  }

  /**
   * Shutdown manager and cleanup resources.
   */
  shutdown(): void {
    this.stopCleanupTimer();
    this.clearAll();
  }
}

/**
 * Create a voice conversation manager instance.
 */
export function createVoiceConversationManager(
  options?: ConversationManagerOptions,
): VoiceConversationManager {
  return new VoiceConversationManager(options);
}
