/**
 * Tests for Telegram Voice Conversation Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateConversationId,
  VoiceConversationManager,
  createVoiceConversationManager,
  type VoiceMessageMetadata,
} from "./conversation-manager.js";

describe("generateConversationId", () => {
  it("should generate ID for private chat", () => {
    const id = generateConversationId(123, 456);
    expect(id).toBe("chat:123:user:456");
  });

  it("should generate ID for group chat with thread", () => {
    const id = generateConversationId(123, undefined, 789);
    expect(id).toBe("chat:123:thread:789");
  });

  it("should generate ID for regular group chat", () => {
    const id = generateConversationId(123);
    expect(id).toBe("chat:123");
  });

  it("should prioritize thread ID over user ID", () => {
    const id = generateConversationId(123, 456, 789);
    expect(id).toBe("chat:123:thread:789");
  });
});

describe("VoiceConversationManager", () => {
  let manager: VoiceConversationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = createVoiceConversationManager({
      maxMessagesPerConversation: 10,
      conversationTimeoutMs: 5 * 60 * 1000,
      cleanupIntervalMs: 60 * 1000,
    });
  });

  afterEach(() => {
    manager.shutdown();
    vi.useRealTimers();
  });

  describe("getOrCreateConversation", () => {
    it("should create new conversation", () => {
      const conv = manager.getOrCreateConversation(123, "private", 456);

      expect(conv.chatId).toBe(123);
      expect(conv.userId).toBe(456);
      expect(conv.chatType).toBe("private");
      expect(conv.messages).toEqual([]);
      expect(conv.active).toBe(true);
    });

    it("should return existing conversation", () => {
      const conv1 = manager.getOrCreateConversation(123, "private", 456);
      const conv2 = manager.getOrCreateConversation(123, "private", 456);

      expect(conv1).toBe(conv2);
    });

    it("should update last message time on retrieval", () => {
      const conv1 = manager.getOrCreateConversation(123, "private", 456);
      const time1 = conv1.lastMessageAt;

      vi.advanceTimersByTime(1000);

      const conv2 = manager.getOrCreateConversation(123, "private", 456);
      const time2 = conv2.lastMessageAt;

      expect(time2).toBeGreaterThan(time1);
    });
  });

  describe("addMessage", () => {
    it("should add message to conversation", () => {
      manager.addMessage(
        123,
        "private",
        {
          messageId: 1,
          userId: 456,
          type: "voice",
          content: "Test",
          isBot: false,
        },
        456,
      );

      const conv = manager.getConversation("chat:123:user:456");
      expect(conv?.messages.length).toBe(1);
      expect(conv?.messages[0].messageId).toBe(1);
    });

    it("should trim old messages when exceeding max", () => {
      for (let i = 0; i < 15; i++) {
        manager.addMessage(
          123,
          "private",
          {
            messageId: i,
            userId: 456,
            type: "voice",
            isBot: false,
          },
          456,
        );
      }

      const conv = manager.getConversation("chat:123:user:456");
      expect(conv?.messages.length).toBe(10);
      expect(conv?.messages[0].messageId).toBe(5);
    });

    it("should update last message time", () => {
      manager.addMessage(
        123,
        "private",
        {
          messageId: 1,
          userId: 456,
          type: "voice",
          isBot: false,
        },
        456,
      );

      const time1 = manager.getConversation("chat:123:user:456")?.lastMessageAt;

      vi.advanceTimersByTime(1000);

      manager.addMessage(
        123,
        "private",
        {
          messageId: 2,
          userId: 456,
          type: "voice",
          isBot: false,
        },
        456,
      );

      const time2 = manager.getConversation("chat:123:user:456")?.lastMessageAt;

      expect(time2).toBeGreaterThan(time1!);
    });
  });

  describe("addVoiceMessage", () => {
    it("should add voice message with metadata", () => {
      const metadata: VoiceMessageMetadata = {
        duration: 10,
        fileId: "file-123",
        userId: 456,
        chatId: 123,
        chatType: "private",
        messageId: 1,
        timestamp: Date.now(),
      };

      manager.addVoiceMessage(metadata, "Hello world");

      const conv = manager.getConversation("chat:123:user:456");
      expect(conv?.messages.length).toBe(1);
      expect(conv?.messages[0].type).toBe("voice");
      expect(conv?.messages[0].content).toBe("Hello world");
      expect(conv?.messages[0].voiceMetadata).toBe(metadata);
    });
  });

  describe("addBotVoiceResponse", () => {
    it("should add bot response", () => {
      manager.addBotVoiceResponse(123, "private", 2, "Bot response", 456);

      const conv = manager.getConversation("chat:123:user:456");
      expect(conv?.messages[0].isBot).toBe(true);
      expect(conv?.messages[0].content).toBe("Bot response");
    });
  });

  describe("getContext", () => {
    it("should return undefined for non-existent conversation", () => {
      const context = manager.getContext("non-existent");
      expect(context).toBeUndefined();
    });

    it("should return context for existing conversation", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.setContext("chat:123:user:456", { key: "value" });

      const context = manager.getContext("chat:123:user:456");
      expect(context).toEqual({ key: "value" });
    });
  });

  describe("setContext and updateContext", () => {
    it("should set conversation context", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.setContext("chat:123:user:456", { foo: "bar" });

      const context = manager.getContext("chat:123:user:456");
      expect(context).toEqual({ foo: "bar" });
    });

    it("should update context by merging", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.setContext("chat:123:user:456", { foo: "bar", baz: 123 });
      manager.updateContext("chat:123:user:456", { foo: "updated", new: true });

      const context = manager.getContext("chat:123:user:456");
      expect(context).toEqual({ foo: "updated", baz: 123, new: true });
    });
  });

  describe("getRecentMessages", () => {
    it("should return recent messages", () => {
      for (let i = 0; i < 15; i++) {
        manager.addMessage(
          123,
          "private",
          {
            messageId: i,
            userId: 456,
            type: "voice",
            isBot: false,
          },
          456,
        );
      }

      const conv = manager.getConversation("chat:123:user:456");
      // Verify max messages are 10 due to trimming
      expect(conv?.messages.length).toBe(10);

      const recent = manager.getRecentMessages("chat:123:user:456", 5);
      expect(recent.length).toBe(5);
      // Get last 5 messages from the 10 stored (messages 10-14 are at indices 5-9 in the trimmed array)
      const firstRecentId = conv!.messages[conv!.messages.length - 5].messageId;
      const lastRecentId = conv!.messages[conv!.messages.length - 1].messageId;
      expect(recent[0].messageId).toBe(firstRecentId);
      expect(recent[4].messageId).toBe(lastRecentId);
    });

    it("should return empty array for non-existent conversation", () => {
      const recent = manager.getRecentMessages("non-existent");
      expect(recent).toEqual([]);
    });
  });

  describe("getConversationHistory", () => {
    it("should format conversation history", () => {
      manager.addMessage(
        123,
        "private",
        {
          messageId: 1,
          userId: 456,
          type: "voice",
          content: "Hello",
          isBot: false,
        },
        456,
      );

      manager.addBotVoiceResponse(123, "private", 2, "Hi there", 456);

      const history = manager.getConversationHistory("chat:123:user:456");
      expect(history).toContain("User 456: Hello");
      expect(history).toContain("Bot: Hi there");
    });

    it("should handle messages without content", () => {
      manager.addMessage(
        123,
        "private",
        {
          messageId: 1,
          userId: 456,
          type: "voice",
          isBot: false,
        },
        456,
      );

      const history = manager.getConversationHistory("chat:123:user:456");
      expect(history).toContain("[Voice message]");
    });
  });

  describe("isConversationActive", () => {
    it("should return true for recent conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);

      expect(manager.isConversationActive("chat:123:user:456")).toBe(true);
    });

    it("should return false for stale conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);

      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      expect(manager.isConversationActive("chat:123:user:456")).toBe(false);
    });

    it("should return false for non-existent conversations", () => {
      expect(manager.isConversationActive("non-existent")).toBe(false);
    });
  });

  describe("endConversation", () => {
    it("should mark conversation as inactive", () => {
      const conv = manager.getOrCreateConversation(123, "private", 456);
      expect(conv.active).toBe(true);

      manager.endConversation("chat:123:user:456");

      const updated = manager.getConversation("chat:123:user:456");
      expect(updated?.active).toBe(false);
    });
  });

  describe("deleteConversation", () => {
    it("should delete conversation", () => {
      manager.getOrCreateConversation(123, "private", 456);

      const deleted = manager.deleteConversation("chat:123:user:456");
      expect(deleted).toBe(true);

      const conv = manager.getConversation("chat:123:user:456");
      expect(conv).toBeUndefined();
    });

    it("should return false for non-existent conversation", () => {
      const deleted = manager.deleteConversation("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("cleanupStaleConversations", () => {
    it("should clean up stale conversations", () => {
      const conv1 = manager.getOrCreateConversation(123, "private", 456);
      const conv2 = manager.getOrCreateConversation(124, "private", 457);

      // Manually set the lastMessageAt to be stale
      const staleTime = Date.now() - (6 * 60 * 1000);
      conv1.lastMessageAt = staleTime;
      conv2.lastMessageAt = staleTime;

      const cleaned = manager.cleanupStaleConversations();

      expect(cleaned).toBe(2);
      expect(manager.getConversation("chat:123:user:456")).toBeUndefined();
    });

    it("should not clean up active conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);

      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      const cleaned = manager.cleanupStaleConversations();

      expect(cleaned).toBe(0);
      expect(manager.getConversation("chat:123:user:456")).toBeDefined();
    });

    it("should auto-cleanup on timer", () => {
      manager.getOrCreateConversation(123, "private", 456);

      vi.advanceTimersByTime(6 * 60 * 1000); // Pass conversation timeout
      vi.advanceTimersByTime(60 * 1000); // Trigger cleanup timer

      expect(manager.getConversation("chat:123:user:456")).toBeUndefined();
    });
  });

  describe("getAnalytics", () => {
    it("should track conversation analytics", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.addMessage(123, "private", {
        messageId: 1,
        userId: 456,
        type: "voice",
        isBot: false,
      }, 456);
      manager.addMessage(123, "private", {
        messageId: 2,
        userId: 456,
        type: "text",
        isBot: false,
      }, 456);

      const analytics = manager.getAnalytics();

      expect(analytics.totalConversations).toBe(1);
      expect(analytics.activeConversations).toBe(1);
      expect(analytics.totalMessages).toBe(2);
      expect(analytics.voiceMessages).toBe(1);
      expect(analytics.textMessages).toBe(1);
    });

    it("should update active count on end", () => {
      manager.getOrCreateConversation(123, "private", 456);

      let analytics = manager.getAnalytics();
      expect(analytics.activeConversations).toBe(1);

      manager.endConversation("chat:123:user:456");

      analytics = manager.getAnalytics();
      expect(analytics.activeConversations).toBe(0);
    });
  });

  describe("getActiveConversations", () => {
    it("should return only active conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.getOrCreateConversation(124, "private", 457);

      vi.advanceTimersByTime(6 * 60 * 1000);

      manager.getOrCreateConversation(125, "private", 458);

      const active = manager.getActiveConversations();
      expect(active.length).toBe(1);
      expect(active[0].chatId).toBe(125);
    });
  });

  describe("clearAll", () => {
    it("should clear all conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);
      manager.getOrCreateConversation(124, "private", 457);

      manager.clearAll();

      const analytics = manager.getAnalytics();
      expect(analytics.conversationCount).toBe(0);
      expect(analytics.activeConversations).toBe(0);
    });
  });

  describe("shutdown", () => {
    it("should stop cleanup timer and clear conversations", () => {
      manager.getOrCreateConversation(123, "private", 456);

      manager.shutdown();

      const analytics = manager.getAnalytics();
      expect(analytics.conversationCount).toBe(0);
    });
  });
});
