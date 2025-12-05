/**
 * TelegramProvider Tests
 */

import type { TelegramClient } from "telegram";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProviderMedia,
  TelegramProviderConfig,
} from "../providers/base/types.js";
import { capabilities } from "./capabilities.js";
import * as clientModule from "./client.js";
import * as inboundModule from "./inbound.js";
import * as loginModule from "./login.js";
import * as outboundModule from "./outbound.js";
import { TelegramProvider } from "./provider.js";
import * as sessionModule from "./session.js";

// Mock all dependencies
vi.mock("./session.js");
vi.mock("./client.js");
vi.mock("./login.js");
vi.mock("./outbound.js");
vi.mock("./inbound.js");

describe("TelegramProvider", () => {
  let provider: TelegramProvider;
  let mockClient: Partial<TelegramClient>;

  beforeEach(() => {
    provider = new TelegramProvider();
    mockClient = {
      connected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getMe: vi.fn().mockResolvedValue({
        username: "testuser",
        firstName: "Test",
        phone: "+1234567890",
      }),
    };

    vi.clearAllMocks();
  });

  describe("Provider Properties", () => {
    it("has correct kind", () => {
      expect(provider.kind).toBe("telegram");
    });

    it("has correct capabilities", () => {
      expect(provider.capabilities).toEqual(capabilities);
      expect(provider.capabilities.supportsDeliveryReceipts).toBe(false);
      expect(provider.capabilities.supportsReadReceipts).toBe(false);
      expect(provider.capabilities.supportsTypingIndicator).toBe(true);
      expect(provider.capabilities.maxMediaSize).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe("initialize", () => {
    it("initializes successfully with valid config and session", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
        verbose: false,
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);

      expect(sessionModule.loadSession).toHaveBeenCalled();
      expect(clientModule.createTelegramClient).toHaveBeenCalledWith({}, false);
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it("throws error with invalid config kind", async () => {
      const config = {
        kind: "web" as any,
        verbose: false,
      };

      await expect(provider.initialize(config)).rejects.toThrow(
        "Invalid config kind for TelegramProvider: web",
      );
    });

    it("throws error when no session exists", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue(null);

      await expect(provider.initialize(config)).rejects.toThrow(
        "No Telegram session found. Run: warelay login --provider telegram",
      );
    });

    it("throws error when connection fails", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue({
        ...mockClient,
        connected: false,
      } as TelegramClient);

      await expect(provider.initialize(config)).rejects.toThrow(
        "Failed to connect to Telegram",
      );
    });

    it("passes verbose flag to client", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
        verbose: true,
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);

      expect(clientModule.createTelegramClient).toHaveBeenCalledWith({}, true);
    });
  });

  describe("Connection Management", () => {
    beforeEach(async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);
    });

    it("isConnected returns true when client is connected", () => {
      vi.mocked(clientModule.isClientConnected).mockReturnValue(true);
      expect(provider.isConnected()).toBe(true);
    });

    it("isConnected returns false when client is not connected", () => {
      vi.mocked(clientModule.isClientConnected).mockReturnValue(false);
      expect(provider.isConnected()).toBe(false);
    });

    it("isConnected returns false when no client exists", () => {
      const uninitializedProvider = new TelegramProvider();
      expect(uninitializedProvider.isConnected()).toBe(false);
    });

    it("disconnects client and clears reference", async () => {
      await provider.disconnect();

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(false);
    });

    it("disconnect handles null client gracefully", async () => {
      const uninitializedProvider = new TelegramProvider();
      await expect(uninitializedProvider.disconnect()).resolves.not.toThrow();
    });
  });

  describe("Message Sending", () => {
    beforeEach(async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);
    });

    it("send sends text message when no media provided", async () => {
      const mockResult = {
        messageId: "999",
        status: "sent" as const,
      };

      vi.mocked(outboundModule.sendTextMessage).mockResolvedValue(mockResult);

      const result = await provider.send("@testuser", "Hello!");

      expect(outboundModule.sendTextMessage).toHaveBeenCalledWith(
        mockClient,
        "@testuser",
        "Hello!",
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it("send sends media message when media provided", async () => {
      const mockResult = {
        messageId: "999",
        status: "sent" as const,
      };

      vi.mocked(outboundModule.sendMediaMessage).mockResolvedValue(mockResult);

      const media: ProviderMedia = {
        type: "image",
        buffer: Buffer.from("test"),
      };

      const result = await provider.send("@testuser", "Check this out!", {
        media: [media],
      });

      expect(outboundModule.sendMediaMessage).toHaveBeenCalledWith(
        mockClient,
        "@testuser",
        "Check this out!",
        media,
        { media: [media] },
      );
      expect(result).toEqual(mockResult);
    });

    it("send throws error when provider not initialized", async () => {
      const uninitializedProvider = new TelegramProvider();

      await expect(
        uninitializedProvider.send("@testuser", "Hello!"),
      ).rejects.toThrow("Provider not initialized");
    });

    it("sendTyping sends typing indicator", async () => {
      vi.mocked(outboundModule.sendTypingIndicator).mockResolvedValue(
        undefined,
      );

      await provider.sendTyping("@testuser");

      expect(outboundModule.sendTypingIndicator).toHaveBeenCalledWith(
        mockClient,
        "@testuser",
      );
    });

    it("sendTyping throws error when provider not initialized", async () => {
      const uninitializedProvider = new TelegramProvider();

      await expect(
        uninitializedProvider.sendTyping("@testuser"),
      ).rejects.toThrow("Provider not initialized");
    });

    it("getDeliveryStatus returns unknown status", async () => {
      const status = await provider.getDeliveryStatus("test-id");
      expect(status.messageId).toBe("test-id");
      expect(status.status).toBe("unknown");
      expect(status.timestamp).toBeGreaterThan(0);
    });
  });

  describe("Message Listening", () => {
    beforeEach(async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);
    });

    it("onMessage stores handler", () => {
      const handler = vi.fn();
      provider.onMessage(handler);
      // No way to directly test private field, but it shouldn't throw
    });

    it("startListening works when handler is registered", async () => {
      const handler = vi.fn();
      const mockCleanup = vi.fn();

      vi.mocked(inboundModule.startMessageListener).mockResolvedValue(
        mockCleanup,
      );

      provider.onMessage(handler);
      await provider.startListening();

      expect(inboundModule.startMessageListener).toHaveBeenCalledWith(
        mockClient,
        handler,
        undefined,
      );
    });

    it("startListening throws error when provider not initialized", async () => {
      const uninitializedProvider = new TelegramProvider();
      const handler = vi.fn();

      uninitializedProvider.onMessage(handler);

      await expect(uninitializedProvider.startListening()).rejects.toThrow(
        "Provider not initialized",
      );
    });

    it("startListening throws error when no message handler registered", async () => {
      await expect(provider.startListening()).rejects.toThrow(
        "No message handler registered. Call onMessage() first.",
      );
    });

    it("startListening passes allowFrom config to listener", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
        allowFrom: ["@testuser", "+1234567890"],
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      const providerWithAllowFrom = new TelegramProvider();
      await providerWithAllowFrom.initialize(config);

      const handler = vi.fn();
      const mockCleanup = vi.fn();

      vi.mocked(inboundModule.startMessageListener).mockResolvedValue(
        mockCleanup,
      );

      providerWithAllowFrom.onMessage(handler);
      await providerWithAllowFrom.startListening();

      expect(inboundModule.startMessageListener).toHaveBeenCalledWith(
        mockClient,
        handler,
        ["@testuser", "+1234567890"],
      );
    });

    it("stopListening calls cleanup function", async () => {
      const handler = vi.fn();
      const mockCleanup = vi.fn();

      vi.mocked(inboundModule.startMessageListener).mockResolvedValue(
        mockCleanup,
      );

      provider.onMessage(handler);
      await provider.startListening();
      await provider.stopListening();

      expect(mockCleanup).toHaveBeenCalled();
    });

    it("stopListening handles no active listener gracefully", async () => {
      await expect(provider.stopListening()).resolves.not.toThrow();
    });

    it("stopListening can be called multiple times", async () => {
      const handler = vi.fn();
      const mockCleanup = vi.fn();

      vi.mocked(inboundModule.startMessageListener).mockResolvedValue(
        mockCleanup,
      );

      provider.onMessage(handler);
      await provider.startListening();
      await provider.stopListening();
      await provider.stopListening();

      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe("Authentication", () => {
    it("isAuthenticated delegates to telegramAuthExists", async () => {
      vi.mocked(sessionModule.telegramAuthExists).mockResolvedValue(true);
      const result = await provider.isAuthenticated();
      expect(result).toBe(true);
      expect(sessionModule.telegramAuthExists).toHaveBeenCalled();
    });

    it("login delegates to loginTelegram", async () => {
      vi.mocked(loginModule.loginTelegram).mockResolvedValue(undefined);
      await provider.login();
      expect(loginModule.loginTelegram).toHaveBeenCalledWith(false);
    });

    it("logout delegates to logoutTelegram", async () => {
      vi.mocked(loginModule.logoutTelegram).mockResolvedValue(undefined);
      await provider.logout();
      expect(loginModule.logoutTelegram).toHaveBeenCalledWith(false);
    });

    it("login passes verbose flag", async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
        verbose: true,
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);

      vi.mocked(loginModule.loginTelegram).mockResolvedValue(undefined);
      await provider.login();
      expect(loginModule.loginTelegram).toHaveBeenCalledWith(true);
    });
  });

  describe("getSessionId", () => {
    beforeEach(async () => {
      const config: TelegramProviderConfig = {
        kind: "telegram",
        apiId: 12345,
        apiHash: "test-hash",
      };

      vi.mocked(sessionModule.loadSession).mockResolvedValue({} as any);
      vi.mocked(clientModule.createTelegramClient).mockResolvedValue(
        mockClient as TelegramClient,
      );

      await provider.initialize(config);
    });

    it("returns username with @ prefix when available", async () => {
      const sessionId = await provider.getSessionId();
      expect(sessionId).toBe("@testuser");
    });

    it("returns phone when username not available", async () => {
      mockClient.getMe = vi.fn().mockResolvedValue({
        firstName: "Test",
        phone: "+1234567890",
      });

      const sessionId = await provider.getSessionId();
      expect(sessionId).toBe("+1234567890");
    });

    it("returns null when neither username nor phone available", async () => {
      mockClient.getMe = vi.fn().mockResolvedValue({
        firstName: "Test",
      });

      const sessionId = await provider.getSessionId();
      expect(sessionId).toBe(null);
    });

    it("returns null when client is not initialized", async () => {
      const uninitializedProvider = new TelegramProvider();
      const sessionId = await uninitializedProvider.getSessionId();
      expect(sessionId).toBe(null);
    });

    it("returns null when getMe throws error", async () => {
      mockClient.getMe = vi.fn().mockRejectedValue(new Error("API error"));

      const sessionId = await provider.getSessionId();
      expect(sessionId).toBe(null);
    });
  });
});
