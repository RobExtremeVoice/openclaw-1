import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";

import {
  providerRegistry,
  transportRegistry,
  hookRegistry,
  registerProvider,
  registerTransport,
  registerInboundHook,
  registerOutboundHook,
} from "./registry/index.js";
import { customProvider } from "./providers/index.js";
import { webhookTransport } from "./transports/index.js";
import { createWebhookHandler } from "./transports/webhook.js";
import type {
  UniversalInboundMessage,
  UniversalOutboundPayload,
  InboundHookContext,
  OutboundHookContext,
} from "./types.js";

describe("E2E: Webhook → Normalize → Hooks", () => {
  beforeEach(() => {
    providerRegistry.clear();
    transportRegistry.clear();
    hookRegistry.clear();

    // Register built-ins
    registerProvider(customProvider);
    registerTransport(webhookTransport);
  });

  afterEach(() => {
    providerRegistry.clear();
    transportRegistry.clear();
    hookRegistry.clear();
  });

  it("processes webhook message through the pipeline", async () => {
    // Track processed messages
    const processedMessages: UniversalInboundMessage[] = [];

    // Register a test inbound hook
    registerInboundHook({
      id: "test-tracker",
      afterNormalize: (msg) => {
        processedMessages.push({ ...msg });
      },
    });

    // Simulate webhook handler
    const handler = createWebhookHandler((rawEvent) => {
      const msg = customProvider.parseInbound(rawEvent, {
        accountId: "test",
        config: {},
        transport: "webhook",
      });

      if (msg) {
        // Run hooks
        const hooks = hookRegistry.getInboundHooks();
        for (const hook of hooks) {
          hook.afterNormalize?.(msg, {
            accountId: "test",
            config: {},
            provider: "custom",
            transport: "webhook",
          });
        }
      }
    });

    // Simulate webhook request
    const response = handler({
      method: "POST",
      path: "/universal-im/webhook",
      headers: {},
      body: {
        messageId: "msg-e2e-001",
        sender: { id: "user-e2e", name: "E2E Tester" },
        conversation: { type: "direct", id: "conv-e2e" },
        text: "Hello from E2E test!",
      },
    });

    expect(response.status).toBe(200);
    expect(processedMessages).toHaveLength(1);
    expect(processedMessages[0].messageId).toBe("msg-e2e-001");
    expect(processedMessages[0].sender.id).toBe("user-e2e");
    expect(processedMessages[0].body.text).toBe("Hello from E2E test!");
  });

  it("rejects webhook with wrong secret", () => {
    const handler = createWebhookHandler(() => {}, "my-secret");

    // Request without secret
    const response1 = handler({
      method: "POST",
      path: "/webhook",
      headers: {},
      body: { test: true },
    });
    expect(response1.status).toBe(401);

    // Request with wrong secret
    const response2 = handler({
      method: "POST",
      path: "/webhook",
      headers: { "x-webhook-secret": "wrong-secret" },
      body: { test: true },
    });
    expect(response2.status).toBe(401);

    // Request with correct secret
    const response3 = handler({
      method: "POST",
      path: "/webhook",
      headers: { "x-webhook-secret": "my-secret" },
      body: { test: true },
    });
    expect(response3.status).toBe(200);

    // Request with Bearer token
    const response4 = handler({
      method: "POST",
      path: "/webhook",
      headers: { authorization: "Bearer my-secret" },
      body: { test: true },
    });
    expect(response4.status).toBe(200);
  });

  it("handles outbound hooks", () => {
    const outboundPayloads: UniversalOutboundPayload[] = [];

    registerOutboundHook({
      id: "test-outbound",
      beforeBuild: (payload) => {
        outboundPayloads.push({ ...payload });
        // Mutate meta
        payload.meta = { ...payload.meta, hooked: true };
      },
    });

    const payload: UniversalOutboundPayload = {
      provider: "custom",
      to: "user:123",
      text: "Test message",
    };

    const hooks = hookRegistry.getOutboundHooks();
    for (const hook of hooks) {
      hook.beforeBuild?.(payload, {
        accountId: "test",
        config: {},
        provider: "custom",
      });
    }

    expect(outboundPayloads).toHaveLength(1);
    expect(payload.meta).toEqual({ hooked: true });
  });

  it("handles multiple inbound hooks in order", () => {
    const order: string[] = [];

    registerInboundHook({
      id: "hook-1",
      afterNormalize: () => order.push("hook-1"),
    });

    registerInboundHook({
      id: "hook-2",
      afterNormalize: () => order.push("hook-2"),
    });

    registerInboundHook({
      id: "hook-3",
      afterNormalize: () => order.push("hook-3"),
    });

    const msg: UniversalInboundMessage = {
      provider: "custom",
      transport: "webhook",
      messageId: "test",
      timestamp: Date.now(),
      sender: { id: "user-1" },
      conversation: { type: "direct", id: "conv-1" },
      body: { text: "test", raw: {} },
      meta: {},
    };

    const ctx: InboundHookContext = {
      accountId: "test",
      config: {},
      provider: "custom",
      transport: "webhook",
    };

    const hooks = hookRegistry.getInboundHooks();
    for (const hook of hooks) {
      hook.afterNormalize?.(msg, ctx);
    }

    expect(order).toEqual(["hook-1", "hook-2", "hook-3"]);
  });

  it("custom provider can add metadata during hook", () => {
    registerInboundHook({
      id: "metadata-enricher",
      afterNormalize: (msg) => {
        msg.meta.enriched = true;
        msg.meta.processedAt = 12345;
      },
    });

    const rawEvent = {
      sender: { id: "user-1" },
      conversation: { type: "direct", id: "conv-1" },
      text: "test",
    };

    const msg = customProvider.parseInbound(rawEvent, {
      accountId: "test",
      config: {},
      transport: "webhook",
    });

    expect(msg).not.toBeNull();

    if (msg) {
      const hooks = hookRegistry.getInboundHooks();
      for (const hook of hooks) {
        hook.afterNormalize?.(msg, {
          accountId: "test",
          config: {},
          provider: "custom",
          transport: "webhook",
        });
      }

      expect(msg.meta.enriched).toBe(true);
      expect(msg.meta.processedAt).toBe(12345);
    }
  });
});

describe("Custom Provider: Edge Cases", () => {
  it("handles missing optional fields", () => {
    const event = {
      sender: { id: "user-123" },
      conversation: { type: "group", id: "group-456" },
    };

    const msg = customProvider.parseInbound(event, {
      accountId: "test",
      config: {},
      transport: "webhook",
    });

    expect(msg).not.toBeNull();
    expect(msg?.sender.name).toBeUndefined();
    expect(msg?.body.text).toBeUndefined();
    expect(msg?.body.attachments).toBeUndefined();
    expect(msg?.conversation.threadId).toBeUndefined();
  });

  it("auto-generates message ID when missing", () => {
    const event = {
      sender: { id: "user-123" },
      conversation: { type: "direct", id: "conv-123" },
      text: "test",
    };

    const msg = customProvider.parseInbound(event, {
      accountId: "test",
      config: {},
      transport: "webhook",
    });

    expect(msg?.messageId).toMatch(/^custom-\d+-/);
  });

  it("handles numeric sender ID", () => {
    const event = {
      sender: { id: 12345 },
      conversation: { type: "direct", id: "conv-123" },
    };

    const msg = customProvider.parseInbound(event, {
      accountId: "test",
      config: {},
      transport: "webhook",
    });

    expect(msg?.sender.id).toBe("12345");
  });

  it("parses ISO timestamp string", () => {
    const isoDate = "2024-01-15T10:30:00Z";
    const event = {
      sender: { id: "user-123" },
      conversation: { type: "direct", id: "conv-123" },
      timestamp: isoDate,
    };

    const msg = customProvider.parseInbound(event, {
      accountId: "test",
      config: {},
      transport: "webhook",
    });

    expect(msg?.timestamp).toBe(Date.parse(isoDate));
  });

  it("handles all conversation types", () => {
    const types = [
      { input: "direct", expected: "direct" },
      { input: "dm", expected: "direct" },
      { input: "private", expected: "direct" },
      { input: "group", expected: "group" },
      { input: "channel", expected: "channel" },
      { input: "DIRECT", expected: "direct" },
      { input: "unknown", expected: "direct" }, // default
    ];

    for (const { input, expected } of types) {
      const event = {
        sender: { id: "user-123" },
        conversation: { type: input, id: "conv-123" },
      };

      const msg = customProvider.parseInbound(event, {
        accountId: "test",
        config: {},
        transport: "webhook",
      });

      expect(msg?.conversation.type).toBe(expected);
    }
  });

  it("handles all attachment kinds", () => {
    const kinds = [
      { input: "image", expected: "image" },
      { input: "photo", expected: "image" },
      { input: "audio", expected: "audio" },
      { input: "voice", expected: "audio" },
      { input: "video", expected: "video" },
      { input: "document", expected: "document" },
      { input: "file", expected: "document" },
      { input: "unknown", expected: "unknown" },
      { input: "other", expected: "unknown" },
    ];

    for (const { input, expected } of kinds) {
      const event = {
        sender: { id: "user-123" },
        conversation: { type: "direct", id: "conv-123" },
        attachments: [{ kind: input, url: "https://example.com/file" }],
      };

      const msg = customProvider.parseInbound(event, {
        accountId: "test",
        config: {},
        transport: "webhook",
      });

      expect(msg?.body.attachments?.[0].kind).toBe(expected);
    }
  });
});

describe("Provider Registry: Extension", () => {
  beforeEach(() => {
    providerRegistry.clear();
  });

  it("allows registering custom providers", () => {
    registerProvider({
      id: "my-custom-im",
      label: "My Custom IM",
      parseInbound: (event) => {
        const e = event as Record<string, unknown>;
        if (!e || !e.msg) return null;
        return {
          provider: "my-custom-im",
          transport: "webhook",
          messageId: String(e.id ?? Date.now()),
          timestamp: Date.now(),
          sender: { id: String((e.from as Record<string, unknown>)?.id ?? "unknown") },
          conversation: { type: "direct" as const, id: String(e.chat ?? "unknown") },
          body: { text: String(e.msg ?? ""), raw: event },
          meta: {},
        };
      },
      buildOutbound: (msg) => ({
        chat: msg.to,
        msg: msg.text,
      }),
    });

    expect(providerRegistry.has("my-custom-im")).toBe(true);

    const provider = providerRegistry.get("my-custom-im");
    const msg = provider?.parseInbound(
      { id: "123", from: { id: "user-1" }, chat: "chat-1", msg: "Hello!" },
      { accountId: "test", config: {}, transport: "webhook" },
    );

    expect(msg?.body.text).toBe("Hello!");
    expect(msg?.sender.id).toBe("user-1");
  });
});

describe("Transport Registry: Extension", () => {
  beforeEach(() => {
    transportRegistry.clear();
  });

  it("allows registering custom transports", async () => {
    const messages: unknown[] = [];

    registerTransport({
      type: "webhook",
      label: "Custom Webhook",
      async start(ctx) {
        // Simulate receiving a message after 10ms
        setTimeout(() => {
          ctx.onMessage({ test: "message" });
        }, 10);

        ctx.onConnected?.();

        await new Promise<void>((resolve) => {
          ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
        });

        ctx.onDisconnected?.();
      },
    });

    expect(transportRegistry.has("webhook")).toBe(true);

    const transport = transportRegistry.get("webhook");
    const controller = new AbortController();

    const startPromise = transport?.start({
      accountId: "test",
      config: {},
      abortSignal: controller.signal,
      onMessage: (msg) => messages.push(msg),
      onError: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    // Wait for message
    await new Promise((r) => setTimeout(r, 20));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ test: "message" });

    // Cleanup
    controller.abort();
    await startPromise;
  });
});
