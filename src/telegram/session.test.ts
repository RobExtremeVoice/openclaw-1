import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises");
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
vi.mock("../utils.js", () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import {
  clearSession,
  loadSession,
  saveSession,
  telegramAuthExists,
} from "./session.js";

describe("telegram session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadSession", () => {
    it("returns null when session file does not exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        }),
      );

      const result = await loadSession();

      expect(result).toBeNull();
      expect(fs.readFile).toHaveBeenCalled();
    });

    it("loads session from disk when file exists", async () => {
      const sessionString = "test-session-string";
      vi.mocked(fs.readFile).mockResolvedValue(`  ${sessionString}  ` as never);

      const result = await loadSession();

      expect(result).toBeDefined();
      expect(result?._sessionString).toBe(sessionString);
      expect(fs.readFile).toHaveBeenCalled();
    });

    it("throws on unexpected errors", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("Permission denied"));

      await expect(loadSession()).rejects.toThrow("Permission denied");
    });
  });

  describe("saveSession", () => {
    it("saves session to disk", async () => {
      const mockSession = {
        save: vi.fn(() => "saved-session-string"),
      };
      vi.mocked(fs.writeFile).mockResolvedValue(undefined as never);

      await saveSession(mockSession as never);

      expect(mockSession.save).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("session.string"),
        "saved-session-string",
        "utf-8",
      );
    });
  });

  describe("clearSession", () => {
    it("removes session file when it exists", async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined as never);

      await clearSession();

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("session.string"),
      );
    });

    it("does not throw when file does not exist", async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        }),
      );

      await expect(clearSession()).resolves.toBeUndefined();
    });

    it("throws on unexpected errors", async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error("Permission denied"));

      await expect(clearSession()).rejects.toThrow("Permission denied");
    });
  });

  describe("telegramAuthExists", () => {
    it("returns true when session file exists", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined as never);

      const result = await telegramAuthExists();

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining("session.string"),
      );
    });

    it("returns false when session file does not exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await telegramAuthExists();

      expect(result).toBe(false);
    });
  });
});
