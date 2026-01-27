import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";

// Helper to get mocked modules
const { mockFs, mockLogger } = vi.hoisted(() => {
  return {
    mockFs: {
      readFile: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    },
    mockLogger: {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      }),
    },
  };
});

// Mock modules with hoisted implementations
vi.mock("node:fs/promises", () => ({
  default: mockFs,
}));

vi.mock("../../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => mockLogger,
}));

// Mock LLM slug generator dynamic import
vi.mock("../../llm-slug-generator.js", () => ({
  generateSlugViaLLM: vi.fn().mockResolvedValue("mock-slug"),
}));

import saveSessionToMemory from "./handler.js";

describe("session-memory handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should ignore non-new commands", async () => {
    await saveSessionToMemory({
      type: "command",
      action: "stop",
      sessionKey: "test-session",
      context: {},
      timestamp: new Date(),
      messages: [],
    });

    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("should handle basic /new command execution with fallback slug", async () => {
    const timestamp = new Date("2024-01-01T12:00:00Z");
    const event = {
      type: "command" as const,
      action: "new",
      sessionKey: "test-session",
      context: {
        cfg: {},
        sessionEntry: {
          sessionId: "sid-123",
          sessionFile: "/tmp/session.jsonl",
        },
      },
      timestamp,
      messages: [],
    };

    // Setup fs mocks
    // Return empty content to trigger fallback
    mockFs.readFile.mockResolvedValue("");

    await saveSessionToMemory(event);

    expect(mockLogger.info).toHaveBeenCalledWith("Hook triggered for /new command");
    expect(mockFs.mkdir).toHaveBeenCalled();

    // Verify fallback slug usage (time based)
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Using fallback timestamp slug"),
    );

    // Verify file write
    expect(mockFs.writeFile).toHaveBeenCalled();
    const [filePath, content] = mockFs.writeFile.mock.calls[0];

    // Check filename structure: YYYY-MM-DD-HHMM.md
    expect(filePath).toContain("2024-01-01-1200.md");
    expect(content).toContain("# Session: 2024-01-01 12:00:00 UTC");
    expect(content).toContain("- **Session ID**: sid-123");

    expect(mockLogger.info).toHaveBeenCalledWith("Memory file written successfully");
  });

  it("should handle LLM slug generation when content is available", async () => {
    const timestamp = new Date("2024-01-01T12:00:00Z");
    const event = {
      type: "command" as const,
      action: "new",
      sessionKey: "test-session",
      context: {
        cfg: {}, // Config present enables LLM
        sessionEntry: {
          sessionId: "sid-123",
          sessionFile: "/tmp/session.jsonl",
        },
      },
      timestamp,
      messages: [],
    };

    // Valid JSONL session content
    const sessionContent = `
      {"type":"message","message":{"role":"user","content":"hello"}}
      {"type":"message","message":{"role":"assistant","content":"hi there"}}
    `.trim();

    mockFs.readFile.mockResolvedValue(sessionContent);

    // Dynamic import mock setup for this specific test
    // Note: We need to mock the import result for the handler's dynamic import
    // This is tricky with vitest, but since we mocked the module path above,
    // we rely on the implementation detail that it tries to import from ../../llm-slug-generator.js

    await saveSessionToMemory(event);

    // Check for specific calls by inspecting mock history
    const infoCalls = mockLogger.info.mock.calls.map((call: any[]) => call[0]);

    // Assert no errors first - if this fails, we want to see the error message
    expect(mockLogger.error).not.toHaveBeenCalled();

    expect(infoCalls).toContainEqual(expect.stringContaining("Hook triggered for /new command"));
    expect(infoCalls).toContainEqual(expect.stringContaining("Calling generateSlugViaLLM..."));
    expect(infoCalls).toContainEqual(expect.stringContaining("Generated slug: mock-slug"));

    // Verify file write with mock slug
    const [filePath] = mockFs.writeFile.mock.calls[0];
    expect(filePath).toContain("2024-01-01-mock-slug.md");
  });

  it("should log errors cleanly", async () => {
    mockFs.mkdir.mockRejectedValue(new Error("Disk error"));

    await saveSessionToMemory({
      type: "command",
      action: "new",
      sessionKey: "test-session",
      context: {},
      timestamp: new Date(),
      messages: [],
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to save session memory: Disk error"),
    );
  });
});
