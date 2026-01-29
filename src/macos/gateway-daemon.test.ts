import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import process from "node:process";

describe("gateway-daemon unhandled rejection handler", () => {
  let exitCalls: Array<string | number | null> = [];
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    exitCalls = [];

    vi.spyOn(process, "exit").mockImplementation((code: string | number | null | undefined) => {
      if (code !== undefined && code !== null) {
        exitCalls.push(code);
      }
    });

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Install the handler (same import the daemon uses)
    const { installUnhandledRejectionHandler } = await import(
      "../infra/unhandled-rejections.js"
    );
    installUnhandledRejectionHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT exit on transient fetch failures (ECONNRESET)", () => {
    const fetchErr = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });

    process.emit("unhandledRejection", fetchErr, Promise.resolve());

    expect(exitCalls).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[moltbot] Non-fatal unhandled rejection (continuing):",
      expect.stringContaining("fetch failed"),
    );
  });

  it("exits on fatal errors like OOM", () => {
    const oomErr = Object.assign(new Error("Out of memory"), {
      code: "ERR_OUT_OF_MEMORY",
    });

    process.emit("unhandledRejection", oomErr, Promise.resolve());

    expect(exitCalls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[moltbot] FATAL unhandled rejection:",
      expect.stringContaining("Out of memory"),
    );
  });
});
