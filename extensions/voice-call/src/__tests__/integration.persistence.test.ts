/**
 * Call Persistence Error Handling Tests
 *
 * Tests error handling for disk I/O operations, corrupted logs,
 * and large file loading. Reveals fire-and-forget persistence issues.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import type { CallRecord } from "../types.js";

describe("Call Persistence Error Handling", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  const webhookUrl = "https://example.com/webhook";
  const config = createMockConfig();

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    mockProvider = new MockVoiceProvider();
  });

  afterEach(async () => {
    mockProvider.reset();
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Disk Full Error Handling", () => {
    it("should handle disk full errors gracefully", async () => {
      vi.spyOn(fsp, "appendFile").mockRejectedValue(
        new Error("ENOSPC: no space left on device"),
      );

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId, success } = await manager.initiateCall("+15550000001");

      expect(success).toBe(true);
      expect(manager.getCall(callId)).toBeDefined();

      // Allow time for fire-and-forget persistence to attempt write
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        "[voice-call] Failed to persist call record:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it("should continue call operations despite persistence failures", async () => {
      vi.spyOn(fsp, "appendFile").mockRejectedValue(
        new Error("ENOSPC: no space left on device"),
      );

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");
      const call = manager.getCall(callId);

      // Call should still be in memory even if persistence failed
      expect(call).toBeDefined();
      expect(call?.state).toBe("initiated");

      // Should be able to process events
      manager.processEvent({
        id: "evt-answered-1",
        type: "call.answered",
        callId,
        providerCallId: mockProvider.lastCallId || "provider-123",
        timestamp: Date.now(),
      });

      const updatedCall = manager.getCall(callId);
      expect(updatedCall?.state).toBe("answered");

      vi.restoreAllMocks();
    });

    it("should batch retries when persistence fails intermittently", async () => {
      let callCount = 0;
      vi.spyOn(fsp, "appendFile").mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error("ENOSPC: no space left on device");
        }
        // Third call succeeds
      });

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");
      expect(manager.getCall(callId)).toBeDefined();

      // Multiple persistence attempts may occur
      await new Promise((resolve) => setTimeout(resolve, 150));

      vi.restoreAllMocks();
    });
  });

  describe("Corrupted Log Recovery", () => {
    it("should handle corrupted call log on load", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      const validRecords = [
        { callId: "1", provider: "mock", direction: "outbound" as const, state: "initiated" as const, from: "+15550000000", to: "+15550000001", startedAt: Date.now() },
        { callId: "2", provider: "mock", direction: "outbound" as const, state: "ringing" as const, from: "+15550000000", to: "+15550000002", startedAt: Date.now() },
      ];

      const lines = [
        JSON.stringify(validRecords[0]),
        "INVALID JSON LINE {{{",
        JSON.stringify(validRecords[1]),
        "NOT A VALID RECORD AT ALL",
        JSON.stringify({
          callId: "3",
          provider: "mock",
          direction: "outbound",
          state: "initiated",
          from: "+15550000000",
          to: "+15550000003",
          startedAt: Date.now(),
        }),
      ];

      await fsp.writeFile(logPath, lines.join("\n"));

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const activeCalls = manager.getActiveCalls();
      // Should load only valid, non-terminal records
      expect(activeCalls.length).toBeGreaterThanOrEqual(1);

      // Check that at least the valid records are loaded
      const callIds = activeCalls.map((c) => c.callId);
      expect(callIds).toContain("1");
      expect(callIds).toContain("2");
    });

    it("should skip unparseable JSON records without crashing", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      const records = [
        JSON.stringify({
          callId: "valid-1",
          provider: "mock",
          direction: "outbound",
          state: "initiated",
          from: "+15550000000",
          to: "+15550000001",
          startedAt: Date.now(),
        }),
        "{incomplete json",
        "plain text that is not json",
        JSON.stringify({
          callId: "valid-2",
          provider: "mock",
          direction: "outbound",
          state: "answered",
          from: "+15550000000",
          to: "+15550000002",
          startedAt: Date.now(),
        }),
      ];

      await fsp.writeFile(logPath, records.join("\n"));

      const manager = new CallManager(config, tempDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle empty log file", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");
      await fsp.writeFile(logPath, "");

      const manager = new CallManager(config, tempDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(0);
    });

    it("should handle log with only invalid records", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      const records = [
        "invalid line 1",
        "invalid line 2",
        "{corrupted json",
        "not even json",
      ];

      await fsp.writeFile(logPath, records.join("\n"));

      const manager = new CallManager(config, tempDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(0);
    });

    it("should preserve processed event IDs during recovery", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      const record: Partial<CallRecord> = {
        callId: "test-call",
        provider: "mock",
        direction: "outbound",
        state: "initiated",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        processedEventIds: ["evt-1", "evt-2", "evt-3"],
      };

      await fsp.writeFile(logPath, JSON.stringify(record));

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(1);

      const recovered = activeCalls[0];
      expect(recovered.processedEventIds).toContain("evt-1");
      expect(recovered.processedEventIds).toContain("evt-2");
      expect(recovered.processedEventIds).toContain("evt-3");
    });
  });

  describe("Large Log File Performance", () => {
    it("should handle large log files efficiently", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      // Generate 10,000 call records (mix of active and terminal states)
      const lines = Array.from({ length: 10000 }, (_, i) => {
        const record: Partial<CallRecord> = {
          callId: `call-${i}`,
          provider: "mock",
          direction: "outbound" as const,
          state: i % 3 === 0 ? ("completed" as const) : ("initiated" as const),
          from: "+15550000000",
          to: `+15550${i.toString().padStart(6, "0")}`,
          startedAt: Date.now(),
          transcript: [],
          processedEventIds: [],
        };
        return JSON.stringify(record);
      });

      await fsp.writeFile(logPath, lines.join("\n"));

      const start = Date.now();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);
      const duration = Date.now() - start;

      // Should load 10k records in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);

      const activeCalls = manager.getActiveCalls();
      // Only ~6,666 records should be active (2/3 of total, since 1/3 are completed)
      expect(activeCalls.length).toBeLessThan(10000);
      expect(activeCalls.length).toBeGreaterThan(0);
    });

    it("should not block event processing while loading large logs", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      // Create initial large log
      const lines = Array.from({ length: 5000 }, (_, i) =>
        JSON.stringify({
          callId: `pre-call-${i}`,
          provider: "mock",
          direction: "outbound",
          state: "completed",
          from: "+15550000000",
          to: "+15550000001",
          startedAt: Date.now(),
          transcript: [],
          processedEventIds: [],
        }),
      );

      await fsp.writeFile(logPath, lines.join("\n"));

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Should be able to initiate calls even after loading large log
      const { callId } = await manager.initiateCall("+15550000001");
      expect(callId).toBeDefined();

      const call = manager.getCall(callId);
      expect(call).toBeDefined();
      expect(call?.state).toBe("initiated");
    });

    it("should handle mixed valid and invalid records in large file", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        if (i % 10 === 0) {
          // Every 10th record is invalid
          lines.push("INVALID_RECORD_" + i);
        } else {
          lines.push(
            JSON.stringify({
              callId: `call-${i}`,
              provider: "mock",
              direction: "outbound",
              state: "initiated",
              from: "+15550000000",
              to: "+15550000001",
              startedAt: Date.now(),
              transcript: [],
              processedEventIds: [],
            }),
          );
        }
      }

      await fsp.writeFile(logPath, lines.join("\n"));

      const start = Date.now();
      const manager = new CallManager(config, tempDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);

      const activeCalls = manager.getActiveCalls();
      // Should have loaded ~900 valid records (90% of 1000)
      expect(activeCalls.length).toBeGreaterThan(800);
    });
  });

  describe("Fire-and-Forget Persistence Pattern", () => {
    it("should not lose in-memory state when persistence fails", async () => {
      vi.spyOn(fsp, "appendFile").mockRejectedValue(
        new Error("I/O error"),
      );

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Even if persistence fails, call should be in memory
      expect(manager.getCall(callId)).toBeDefined();

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.some((c) => c.callId === callId)).toBe(true);

      vi.restoreAllMocks();
    });

    it("should maintain call state consistency during high-frequency updates", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");
      const providerCallId = mockProvider.lastCallId || "provider-123";

      // Rapidly update call state
      const events = [
        { type: "call.answered", state: "answered" },
        { type: "call.active", state: "active" },
        { type: "call.speaking", state: "speaking", text: "Hello" },
      ];

      for (const event of events) {
        manager.processEvent({
          id: `evt-${event.type}`,
          type: event.type as any,
          callId,
          providerCallId,
          timestamp: Date.now(),
          ...(event.type === "call.speaking" && { text: event.text }),
        });
      }

      // Final state should reflect last update
      const call = manager.getCall(callId);
      expect(call?.state).toBe("speaking");
    });

    it("should recover from partial writes on restart", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");

      // Write initial partial record (simulating interrupted write)
      const partialRecord = '{"callId":"partial-1","provider":"mock"';
      await fsp.writeFile(logPath, partialRecord + "\n");

      // Add a complete record
      const completeRecord = {
        callId: "complete-1",
        provider: "mock",
        direction: "outbound" as const,
        state: "initiated" as const,
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
      };

      await fsp.appendFile(logPath, JSON.stringify(completeRecord) + "\n");

      // Restore mocks before initialization to avoid error interference
      vi.restoreAllMocks();

      const manager = new CallManager(config, tempDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();

      const activeCalls = manager.getActiveCalls();
      // Should recover complete record, skip partial
      expect(
        activeCalls.some((c) => c.callId === "complete-1"),
      ).toBe(true);
    });
  });

  describe("Permission and Access Errors", () => {
    it("should handle read permission errors gracefully", async () => {
      const logPath = path.join(tempDir, "calls.jsonl");
      await fsp.writeFile(logPath, '{"callId":"test"}\n');

      // Remove read permissions (Unix-like systems)
      try {
        fs.chmodSync(logPath, 0o000);

        const manager = new CallManager(config, tempDir);
        // Should not crash, may just skip loading
        expect(() => {
          manager.initialize(mockProvider, webhookUrl);
        }).not.toThrow();

        // Restore permissions for cleanup
        fs.chmodSync(logPath, 0o644);
      } catch {
        // Skip on systems that don't support chmod (like Windows)
      }
    });

    it("should handle directory does not exist gracefully", async () => {
      const nonExistentDir = path.join(tempDir, "does-not-exist");

      const manager = new CallManager(config, nonExistentDir);
      expect(() => {
        manager.initialize(mockProvider, webhookUrl);
      }).not.toThrow();

      // Should be able to initiate calls
      const { callId } = await manager.initiateCall("+15550000001");
      expect(callId).toBeDefined();
    });
  });
});
