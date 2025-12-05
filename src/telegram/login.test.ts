import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";

// Mock all dependencies before imports
const mockStart = vi.fn();
const mockGetMe = vi.fn();
const mockDisconnect = vi.fn();
const mockConnect = vi.fn();
const mockInvoke = vi.fn();

vi.mock("telegram", () => ({
  Api: {
    auth: {
      LogOut: class {},
    },
  },
}));

vi.mock("./client.js", () => ({
  createTelegramClient: vi.fn().mockResolvedValue({
    start: mockStart,
    getMe: mockGetMe,
    disconnect: mockDisconnect,
    connect: mockConnect,
    invoke: mockInvoke,
    connected: true,
    session: {
      save: vi.fn(() => "mock-saved-session"),
    },
  }),
}));

vi.mock("./session.js", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("./prompts.js", () => ({
  promptPhone: vi.fn(),
  promptSMSCode: vi.fn(),
  prompt2FA: vi.fn(),
}));

const { loginTelegram, logoutTelegram } = await import("./login.js");
const { loadSession, saveSession, clearSession } = await import("./session.js");
const { promptPhone, promptSMSCode, prompt2FA } = await import("./prompts.js");
const { createTelegramClient } = await import("./client.js");

describe("telegram login", () => {
  const mockRuntime: RuntimeEnv = {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(() => {
      throw new Error("exit");
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockClear();
    mockGetMe.mockClear();
    mockDisconnect.mockClear();
    mockConnect.mockClear();
    mockInvoke.mockClear();
  });

  describe("loginTelegram", () => {
    it("successfully logs in with phone and SMS code", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);
      vi.mocked(promptPhone).mockResolvedValue("+1234567890");
      vi.mocked(promptSMSCode).mockResolvedValue("12345");
      vi.mocked(prompt2FA).mockResolvedValue("");

      mockStart.mockImplementation(async (opts: unknown) => {
        // Simulate successful login
        const { phoneNumber, phoneCode, password } = opts as {
          phoneNumber: () => Promise<string>;
          phoneCode: () => Promise<string>;
          password: () => Promise<string>;
        };
        await phoneNumber();
        await phoneCode();
        await password();
      });

      mockGetMe.mockResolvedValue({
        firstName: "John",
        username: "johndoe",
      });

      await loginTelegram(false, mockRuntime);

      expect(createTelegramClient).toHaveBeenCalledWith(
        null,
        false,
        mockRuntime,
      );
      expect(mockStart).toHaveBeenCalled();
      expect(mockGetMe).toHaveBeenCalled();
      expect(saveSession).toHaveBeenCalled();
      expect(mockRuntime.log).toHaveBeenCalledWith(
        expect.stringContaining("Logged in as: John (@johndoe)"),
      );
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("logs in with 2FA password", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);
      vi.mocked(promptPhone).mockResolvedValue("+1234567890");
      vi.mocked(promptSMSCode).mockResolvedValue("12345");
      vi.mocked(prompt2FA).mockResolvedValue("my2fapassword");

      mockStart.mockImplementation(async (opts: unknown) => {
        const { phoneNumber, phoneCode, password } = opts as {
          phoneNumber: () => Promise<string>;
          phoneCode: () => Promise<string>;
          password: () => Promise<string>;
        };
        await phoneNumber();
        await phoneCode();
        const pwd = await password();
        expect(pwd).toBe("my2fapassword");
      });

      mockGetMe.mockResolvedValue({
        firstName: "Jane",
        username: null,
      });

      await loginTelegram(false, mockRuntime);

      expect(mockStart).toHaveBeenCalled();
      expect(mockGetMe).toHaveBeenCalled();
      expect(saveSession).toHaveBeenCalled();
      expect(mockRuntime.log).toHaveBeenCalledWith(
        expect.stringContaining("Logged in as: Jane"),
      );
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("handles login failure and exits", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);
      mockStart.mockRejectedValue(new Error("Invalid phone number"));

      try {
        await loginTelegram(false, mockRuntime);
        throw new Error("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toBe("exit");
      }

      expect(mockRuntime.error).toHaveBeenCalledWith(
        expect.stringContaining("Login failed: Error: Invalid phone number"),
      );
      expect(mockRuntime.exit).toHaveBeenCalledWith(1);
      expect(saveSession).not.toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("handles connection failure", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);
      mockStart.mockResolvedValue(undefined);

      // Mock client with connected = false
      vi.mocked(createTelegramClient).mockResolvedValue({
        start: mockStart,
        getMe: mockGetMe,
        disconnect: mockDisconnect,
        connect: mockConnect,
        invoke: mockInvoke,
        connected: false,
        session: {
          save: vi.fn(() => "mock-saved-session"),
        },
      } as never);

      try {
        await loginTelegram(false, mockRuntime);
        throw new Error("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toBe("exit");
      }

      expect(mockRuntime.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to connect to Telegram"),
      );
      expect(mockRuntime.exit).toHaveBeenCalledWith(1);
      expect(saveSession).not.toHaveBeenCalled();
    });

    it("uses existing session when available", async () => {
      const mockSession = {
        save: vi.fn(() => "existing-session"),
      };
      vi.mocked(loadSession).mockResolvedValue(mockSession as never);

      // Reset mock to return connected client
      vi.mocked(createTelegramClient).mockResolvedValue({
        start: mockStart,
        getMe: mockGetMe,
        disconnect: mockDisconnect,
        connect: mockConnect,
        invoke: mockInvoke,
        connected: true,
        session: {
          save: vi.fn(() => "mock-saved-session"),
        },
      } as never);

      mockStart.mockImplementation(async (opts: unknown) => {
        // Simulate successful login
        const { phoneNumber, phoneCode, password } = opts as {
          phoneNumber: () => Promise<string>;
          phoneCode: () => Promise<string>;
          password: () => Promise<string>;
        };
        await phoneNumber();
        await phoneCode();
        await password();
      });
      mockGetMe.mockResolvedValue({
        firstName: "Alice",
        username: "alice",
      });

      await loginTelegram(false, mockRuntime);

      expect(createTelegramClient).toHaveBeenCalledWith(
        mockSession,
        false,
        mockRuntime,
      );
      expect(mockStart).toHaveBeenCalled();
    });
  });

  describe("logoutTelegram", () => {
    beforeEach(() => {
      // Reset the mock to return default client
      vi.mocked(createTelegramClient).mockResolvedValue({
        start: mockStart,
        getMe: mockGetMe,
        disconnect: mockDisconnect,
        connect: mockConnect,
        invoke: mockInvoke,
        connected: true,
        session: {
          save: vi.fn(() => "mock-saved-session"),
        },
      } as never);
    });

    it("successfully logs out and clears session", async () => {
      const mockSession = {
        save: vi.fn(() => "existing-session"),
      };
      vi.mocked(loadSession).mockResolvedValue(mockSession as never);

      await logoutTelegram(false, mockRuntime);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalled();
      expect(clearSession).toHaveBeenCalled();
      expect(mockRuntime.log).toHaveBeenCalledWith(
        expect.stringContaining("Logged out from Telegram"),
      );
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("does nothing when no session exists", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);

      await logoutTelegram(false, mockRuntime);

      expect(mockRuntime.log).toHaveBeenCalledWith(
        expect.stringContaining("No Telegram session found"),
      );
      expect(mockConnect).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(clearSession).not.toHaveBeenCalled();
    });

    it("handles logout failure and exits", async () => {
      const mockSession = {
        save: vi.fn(() => "existing-session"),
      };
      vi.mocked(loadSession).mockResolvedValue(mockSession as never);
      mockInvoke.mockRejectedValue(new Error("Network error"));

      try {
        await logoutTelegram(false, mockRuntime);
        throw new Error("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toBe("exit");
      }

      expect(mockRuntime.error).toHaveBeenCalledWith(
        expect.stringContaining("Logout failed: Error: Network error"),
      );
      expect(mockRuntime.exit).toHaveBeenCalledWith(1);
      expect(clearSession).not.toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
