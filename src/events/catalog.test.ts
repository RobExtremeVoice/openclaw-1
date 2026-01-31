import { describe, it, expect } from "vitest";
import { createEvent, isEventOfType, type TypedEvent } from "./catalog.js";
import type { EventEnvelope } from "./types.js";

describe("createEvent", () => {
  it("creates typed event input", () => {
    const event = createEvent("channel.message.received", {
      channelId: "whatsapp",
      accountId: "default",
      messageId: "msg123",
      chatId: "+1234567890",
      chatType: "dm",
      senderId: "+1234567890",
      text: "Hello!",
      hasMedia: false,
      timestamp: Date.now(),
    });

    expect(event.topic).toBe("channel.message.received");
    expect(event.payload.channelId).toBe("whatsapp");
    expect(event.payload.text).toBe("Hello!");
  });

  it("includes optional fields", () => {
    const event = createEvent(
      "agent.run.started",
      {
        runId: "run123",
        agentId: "default",
        model: "claude-3-opus",
        trigger: "message",
      },
      {
        correlationId: "corr123",
        source: "test",
        sessionKey: "session123",
      },
    );

    expect(event.correlationId).toBe("corr123");
    expect(event.source).toBe("test");
    expect(event.sessionKey).toBe("session123");
  });
});

describe("isEventOfType", () => {
  it("returns true for matching topic", () => {
    const event: EventEnvelope = {
      topic: "channel.message.received",
      payload: {
        channelId: "whatsapp",
        accountId: "default",
        messageId: "msg123",
        chatId: "+1234567890",
        chatType: "dm",
        senderId: "+1234567890",
        hasMedia: false,
        timestamp: Date.now(),
      },
      seq: 1,
      ts: Date.now(),
    };

    expect(isEventOfType(event, "channel.message.received")).toBe(true);
    expect(isEventOfType(event, "channel.message.sent")).toBe(false);
  });

  it("narrows type correctly", () => {
    const event: EventEnvelope = {
      topic: "agent.run.completed",
      payload: {
        runId: "run123",
        agentId: "default",
        success: true,
        duration: 1000,
        inputTokens: 100,
        outputTokens: 200,
        toolCalls: 5,
      },
      seq: 1,
      ts: Date.now(),
    };

    if (isEventOfType(event, "agent.run.completed")) {
      // TypeScript should know the payload type here
      expect(event.payload.runId).toBe("run123");
      expect(event.payload.success).toBe(true);
      expect(event.payload.toolCalls).toBe(5);
    }
  });
});

describe("TypedEvent type", () => {
  it("provides correct payload type", () => {
    // This is a compile-time test - if it compiles, it works
    const event: TypedEvent<"channel.status.changed"> = {
      topic: "channel.status.changed",
      payload: {
        channelId: "telegram",
        accountId: "bot123",
        status: "connected",
      },
      seq: 1,
      ts: Date.now(),
    };

    expect(event.payload.status).toBe("connected");
  });
});
