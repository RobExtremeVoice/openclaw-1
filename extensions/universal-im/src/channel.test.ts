import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { universalImPlugin } from "./channel.js";
import {
  normalizeUniversalImMessagingTarget,
  looksLikeUniversalImTargetId,
  normalizeAllowEntry,
  formatAllowEntry,
} from "./normalize.js";
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
import { webhookTransport, websocketTransport, pollingTransport } from "./transports/index.js";
import type {
  UniversalProvider,
  UniversalTransport,
  InboundHook,
  OutboundHook,
  UniversalInboundMessage,
} from "./types.js";

describe("universalImPlugin", () => {
  describe("messaging", () => {
    it("normalizes user: prefix", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("user:USER123")).toBe("user:USER123");
      expect(normalize("USER:abc")).toBe("user:abc");
    });

    it("normalizes channel: prefix", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("channel:CHAN123")).toBe("channel:CHAN123");
      expect(normalize("CHANNEL:general")).toBe("channel:general");
    });

    it("normalizes @ prefix to user:", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("@Alice")).toBe("user:Alice");
      expect(normalize("@bob")).toBe("user:bob");
    });

    it("normalizes # prefix to channel:", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("#general")).toBe("channel:general");
      expect(normalize("#dev-team")).toBe("channel:dev-team");
    });

    it("defaults to user: for plain strings", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("john")).toBe("user:john");
      expect(normalize("user123")).toBe("user:user123");
    });

    it("returns undefined for empty strings", () => {
      const normalize = universalImPlugin.messaging?.normalizeTarget;
      if (!normalize) return;

      expect(normalize("")).toBeUndefined();
      expect(normalize("   ")).toBeUndefined();
    });
  });

  describe("pairing", () => {
    it("normalizes allowlist entries", () => {
      const normalize = universalImPlugin.pairing?.normalizeAllowEntry;
      if (!normalize) return;

      expect(normalize("@Alice")).toBe("alice");
      expect(normalize("user:USER123")).toBe("user123");
      expect(normalize("universal-im:BOT999")).toBe("bot999");
    });
  });

  describe("config", () => {
    it("formats allowFrom entries", () => {
      const formatAllowFrom = universalImPlugin.config.formatAllowFrom;

      const formatted = formatAllowFrom({
        allowFrom: ["@Alice", "user:USER123", "universal-im:BOT999"],
      });
      expect(formatted).toEqual(["@alice", "user123", "bot999"]);
    });
  });

  describe("capabilities", () => {
    it("supports expected chat types", () => {
      expect(universalImPlugin.capabilities.chatTypes).toContain("direct");
      expect(universalImPlugin.capabilities.chatTypes).toContain("channel");
      expect(universalImPlugin.capabilities.chatTypes).toContain("group");
      expect(universalImPlugin.capabilities.chatTypes).toContain("thread");
    });

    it("supports threads and media", () => {
      expect(universalImPlugin.capabilities.threads).toBe(true);
      expect(universalImPlugin.capabilities.media).toBe(true);
    });
  });
});

describe("normalize functions", () => {
  describe("normalizeUniversalImMessagingTarget", () => {
    it("handles various prefixes", () => {
      expect(normalizeUniversalImMessagingTarget("user:123")).toBe("user:123");
      expect(normalizeUniversalImMessagingTarget("channel:456")).toBe("channel:456");
      expect(normalizeUniversalImMessagingTarget("group:789")).toBe("group:789");
      expect(normalizeUniversalImMessagingTarget("universal-im:abc")).toBe("user:abc");
    });

    it("handles @ and # prefixes", () => {
      expect(normalizeUniversalImMessagingTarget("@user")).toBe("user:user");
      expect(normalizeUniversalImMessagingTarget("#channel")).toBe("channel:channel");
    });
  });

  describe("looksLikeUniversalImTargetId", () => {
    it("recognizes valid target IDs", () => {
      expect(looksLikeUniversalImTargetId("user:123")).toBe(true);
      expect(looksLikeUniversalImTargetId("channel:456")).toBe(true);
      expect(looksLikeUniversalImTargetId("@username")).toBe(true);
      expect(looksLikeUniversalImTargetId("#channel")).toBe(true);
      expect(looksLikeUniversalImTargetId("abc123")).toBe(true);
    });

    it("rejects invalid target IDs", () => {
      expect(looksLikeUniversalImTargetId("")).toBe(false);
      expect(looksLikeUniversalImTargetId("ab")).toBe(false); // too short
    });
  });

  describe("normalizeAllowEntry", () => {
    it("normalizes entries correctly", () => {
      expect(normalizeAllowEntry("@User")).toBe("user");
      expect(normalizeAllowEntry("user:ABC")).toBe("abc");
      expect(normalizeAllowEntry("universal-im:Test")).toBe("test");
      expect(normalizeAllowEntry("  spaces  ")).toBe("spaces");
    });
  });

  describe("formatAllowEntry", () => {
    it("formats entries correctly", () => {
      expect(formatAllowEntry("@User")).toBe("@user");
      expect(formatAllowEntry("user:ABC")).toBe("abc");
      expect(formatAllowEntry("plain")).toBe("plain");
      expect(formatAllowEntry("")).toBe("");
    });
  });
});

describe("registry", () => {
  beforeEach(() => {
    providerRegistry.clear();
    transportRegistry.clear();
    hookRegistry.clear();
  });

  describe("provider registry", () => {
    it("registers and retrieves providers", () => {
      const testProvider: UniversalProvider = {
        id: "test",
        parseInbound: () => null,
        buildOutbound: (msg) => msg,
      };

      registerProvider(testProvider);
      expect(providerRegistry.has("test")).toBe(true);
      expect(providerRegistry.get("test")).toBe(testProvider);
      expect(providerRegistry.list()).toContain("test");
    });

    it("throws on duplicate registration", () => {
      const testProvider: UniversalProvider = {
        id: "test",
        parseInbound: () => null,
        buildOutbound: (msg) => msg,
      };

      registerProvider(testProvider);
      expect(() => registerProvider(testProvider)).toThrow('Provider "test" is already registered');
    });
  });

  describe("transport registry", () => {
    it("registers and retrieves transports", () => {
      const testTransport: UniversalTransport = {
        type: "webhook",
        start: async () => {},
      };

      registerTransport(testTransport);
      expect(transportRegistry.has("webhook")).toBe(true);
      expect(transportRegistry.get("webhook")).toBe(testTransport);
      expect(transportRegistry.list()).toContain("webhook");
    });

    it("throws on duplicate registration", () => {
      const testTransport: UniversalTransport = {
        type: "webhook",
        start: async () => {},
      };

      registerTransport(testTransport);
      expect(() => registerTransport(testTransport)).toThrow(
        'Transport "webhook" is already registered',
      );
    });
  });

  describe("hook registry", () => {
    it("registers and retrieves inbound hooks", () => {
      const testHook: InboundHook = {
        id: "test-inbound",
        afterNormalize: () => {},
      };

      registerInboundHook(testHook);
      const hooks = hookRegistry.getInboundHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].id).toBe("test-inbound");
    });

    it("registers and retrieves outbound hooks", () => {
      const testHook: OutboundHook = {
        id: "test-outbound",
        beforeBuild: () => {},
      };

      registerOutboundHook(testHook);
      const hooks = hookRegistry.getOutboundHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].id).toBe("test-outbound");
    });
  });
});

describe("custom provider", () => {
  it("parses valid inbound messages", () => {
    const event = {
      messageId: "msg-123",
      timestamp: 1704067200000,
      sender: {
        id: "user-456",
        name: "John Doe",
      },
      conversation: {
        type: "direct",
        id: "conv-789",
      },
      text: "Hello, world!",
    };

    const ctx = {
      accountId: "default",
      config: {},
      transport: "webhook" as const,
    };

    const result = customProvider.parseInbound(event, ctx);

    expect(result).not.toBeNull();
    expect(result?.messageId).toBe("msg-123");
    expect(result?.sender.id).toBe("user-456");
    expect(result?.sender.name).toBe("John Doe");
    expect(result?.conversation.id).toBe("conv-789");
    expect(result?.conversation.type).toBe("direct");
    expect(result?.body.text).toBe("Hello, world!");
  });

  it("returns null for invalid events", () => {
    const ctx = {
      accountId: "default",
      config: {},
      transport: "webhook" as const,
    };

    expect(customProvider.parseInbound(null, ctx)).toBeNull();
    expect(customProvider.parseInbound({}, ctx)).toBeNull();
    expect(customProvider.parseInbound({ sender: {} }, ctx)).toBeNull();
  });

  it("parses events with attachments", () => {
    const event = {
      sender: { id: "user-1" },
      conversation: { type: "direct", id: "conv-1" },
      text: "Check this out",
      attachments: [
        { kind: "image", url: "https://example.com/img.png" },
        { kind: "document", url: "https://example.com/doc.pdf" },
      ],
    };

    const ctx = {
      accountId: "default",
      config: {},
      transport: "webhook" as const,
    };

    const result = customProvider.parseInbound(event, ctx);

    expect(result?.body.attachments).toHaveLength(2);
    expect(result?.body.attachments?.[0].kind).toBe("image");
    expect(result?.body.attachments?.[1].kind).toBe("document");
  });

  it("builds outbound payload correctly", () => {
    const payload = {
      provider: "custom",
      to: "user:123",
      text: "Hello!",
      mediaUrl: "https://example.com/img.png",
    };

    const ctx = {
      accountId: "default",
      config: {},
    };

    const result = customProvider.buildOutbound(payload, ctx) as Record<string, unknown>;

    expect(result.to).toBe("user:123");
    expect(result.text).toBe("Hello!");
    expect(result.mediaUrl).toBe("https://example.com/img.png");
  });
});

describe("transports", () => {
  describe("webhook transport", () => {
    it("has correct type", () => {
      expect(webhookTransport.type).toBe("webhook");
    });

    it("signals connected and waits for abort", async () => {
      const controller = new AbortController();
      let connected = false;
      let disconnected = false;

      const startPromise = webhookTransport.start({
        accountId: "test",
        config: {},
        abortSignal: controller.signal,
        onMessage: () => {},
        onError: () => {},
        onConnected: () => {
          connected = true;
        },
        onDisconnected: () => {
          disconnected = true;
        },
      });

      // Give it time to connect
      await new Promise((r) => setTimeout(r, 10));
      expect(connected).toBe(true);

      // Abort
      controller.abort();
      await startPromise;
      expect(disconnected).toBe(true);
    });
  });

  describe("websocket transport", () => {
    it("has correct type", () => {
      expect(websocketTransport.type).toBe("websocket");
    });
  });

  describe("polling transport", () => {
    it("has correct type", () => {
      expect(pollingTransport.type).toBe("polling");
    });
  });
});
