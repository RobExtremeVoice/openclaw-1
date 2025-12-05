import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";

const MockTelegramClient = vi.fn();

vi.mock("telegram", () => ({
  TelegramClient: class {
    connected = false;
    constructor(...args: unknown[]) {
      MockTelegramClient(...args);
      this.connected = false;
    }
  },
}));
vi.mock("telegram/sessions/index.js", () => ({
  StringSession: class {
    _sessionString: string;
    constructor(sessionString = "") {
      this._sessionString = sessionString;
    }
    save() {
      return this._sessionString || "mock-session-string";
    }
  },
}));

const { createTelegramClient, isClientConnected } = await import("./client.js");
const { StringSession } = await import("telegram/sessions/index.js");

describe("telegram client", () => {
  const mockRuntime: RuntimeEnv = {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(() => {
      throw new Error("exit");
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    MockTelegramClient.mockClear();
    process.env = {};
  });

  describe("createTelegramClient", () => {
    it("creates client with null session", async () => {
      process.env.TELEGRAM_API_ID = "12345";
      process.env.TELEGRAM_API_HASH = "abcdef";
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+1555";
      process.env.TWILIO_AUTH_TOKEN = "token";

      await createTelegramClient(null, false, mockRuntime);

      expect(MockTelegramClient).toHaveBeenCalledWith(
        expect.anything(), // StringSession
        12345,
        "abcdef",
        expect.objectContaining({
          connectionRetries: 5,
          useWSS: true,
        }),
      );
    });

    it("creates client with existing session", async () => {
      process.env.TELEGRAM_API_ID = "12345";
      process.env.TELEGRAM_API_HASH = "abcdef";
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+1555";
      process.env.TWILIO_AUTH_TOKEN = "token";

      const mockSession = {
        save: vi.fn(() => "existing-session"),
        _sessionString: "existing-session",
      };

      await createTelegramClient(mockSession as never, false, mockRuntime);

      expect(MockTelegramClient).toHaveBeenCalledWith(
        mockSession,
        12345,
        "abcdef",
        expect.objectContaining({
          connectionRetries: 5,
          useWSS: true,
        }),
      );
    });

    it("throws error when Telegram credentials not configured", async () => {
      // Both credentials missing - readEnv will allow this but createTelegramClient should throw
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+1555";
      process.env.TWILIO_AUTH_TOKEN = "token";

      try {
        await createTelegramClient(null, false, mockRuntime);
        throw new Error("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toContain(
          "Telegram API credentials not configured",
        );
      }
    });

    it("includes helpful URL in error message", async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+1555";
      process.env.TWILIO_AUTH_TOKEN = "token";

      try {
        await createTelegramClient(null, false, mockRuntime);
        throw new Error("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toContain(
          "https://my.telegram.org/apps",
        );
      }
    });
  });

  describe("isClientConnected", () => {
    it("returns connection status", () => {
      const connectedClient = { connected: true };
      const disconnectedClient = { connected: false };

      expect(isClientConnected(connectedClient as never)).toBe(true);
      expect(isClientConnected(disconnectedClient as never)).toBe(false);
    });
  });
});
