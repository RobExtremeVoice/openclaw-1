import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuditLogger,
  resolveAuditLogConfig,
  type AuditEvent,
} from "./audit-events.js";

describe("AuditLogger", () => {
  let testDir: string;
  let testLogPath: string;
  let logger: AuditLogger | null = null;

  beforeEach(() => {
    testDir = join(tmpdir(), `audit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testLogPath = join(testDir, "audit.jsonl");
  });

  afterEach(() => {
    logger?.close();
    logger = null;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("basic logging", () => {
    it("does not log when disabled", () => {
      logger = new AuditLogger({ enabled: false, target: "file", filePath: testLogPath });
      logger.logAuth({ action: "login", outcome: "success" });
      logger.close();

      expect(existsSync(testLogPath)).toBe(false);
    });

    it("logs to file when enabled", async () => {
      logger = new AuditLogger({ enabled: true, target: "file", filePath: testLogPath });
      logger.logAuth({ action: "login", outcome: "success", actorId: "user-123" });
      logger.close();

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(existsSync(testLogPath)).toBe(true);
      const content = readFileSync(testLogPath, "utf8");
      const event = JSON.parse(content.trim());
      expect(event.category).toBe("auth");
      expect(event.action).toBe("login");
      expect(event.outcome).toBe("success");
      expect(event.actor.id).toBe("user-123");
    });

    it("logs to stdout when target is stdout", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      logger = new AuditLogger({ enabled: true, target: "stdout" });
      logger.logAuth({ action: "login", outcome: "success" });
      logger.close();

      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("[audit]");
      expect(output).toContain('"category":"auth"');

      writeSpy.mockRestore();
    });

    it("calls custom handler when target is custom", () => {
      const events: AuditEvent[] = [];
      const customHandler = (event: AuditEvent) => events.push(event);

      logger = new AuditLogger({
        enabled: true,
        target: "custom",
        customHandler,
      });

      logger.logAuth({ action: "login", outcome: "success" });
      logger.close();

      expect(events).toHaveLength(1);
      expect(events[0]?.category).toBe("auth");
    });
  });

  describe("event types", () => {
    let events: AuditEvent[];

    beforeEach(() => {
      events = [];
      logger = new AuditLogger({
        enabled: true,
        target: "custom",
        customHandler: (event) => events.push(event),
      });
    });

    it("logs auth events correctly", () => {
      logger!.logAuth({
        action: "login",
        outcome: "failure",
        actorId: "user-123",
        actorIp: "192.168.1.1",
        method: "token",
        error: "Invalid token",
      });

      expect(events[0]?.category).toBe("auth");
      expect(events[0]?.action).toBe("login");
      expect(events[0]?.outcome).toBe("failure");
      expect(events[0]?.actor?.id).toBe("user-123");
      expect(events[0]?.actor?.ip).toBe("192.168.1.1");
      expect(events[0]?.details?.method).toBe("token");
      expect(events[0]?.error).toBe("Invalid token");
    });

    it("logs authz events correctly", () => {
      logger!.logAuthz({
        action: "access_denied",
        outcome: "denied",
        actorId: "user-456",
        resource: "/admin/settings",
        permission: "admin:write",
        reason: "Insufficient permissions",
      });

      expect(events[0]?.category).toBe("authz");
      expect(events[0]?.action).toBe("access_denied");
      expect(events[0]?.target?.name).toBe("/admin/settings");
      expect(events[0]?.details?.permission).toBe("admin:write");
      expect(events[0]?.details?.reason).toBe("Insufficient permissions");
    });

    it("logs admin events correctly", () => {
      logger!.logAdmin({
        action: "config_change",
        outcome: "success",
        actorId: "admin-1",
        targetType: "gateway",
        targetId: "config",
        changes: { bind: "lan" },
      });

      expect(events[0]?.category).toBe("admin");
      expect(events[0]?.action).toBe("config_change");
      expect(events[0]?.target?.type).toBe("gateway");
      expect(events[0]?.details?.changes).toEqual({ bind: "lan" });
    });

    it("logs rate limit events correctly", () => {
      logger!.logRateLimit({
        action: "request_limited",
        outcome: "denied",
        actorIp: "10.0.0.1",
        retryAfterMs: 5000,
      });

      expect(events[0]?.category).toBe("rate_limit");
      expect(events[0]?.action).toBe("request_limited");
      expect(events[0]?.details?.retryAfterMs).toBe(5000);
    });

    it("logs session events correctly", () => {
      logger!.logSession({
        action: "session_end",
        outcome: "success",
        actorId: "user-789",
        sessionId: "sess-abc",
        channel: "telegram",
        durationMs: 300000,
      });

      expect(events[0]?.category).toBe("session");
      expect(events[0]?.action).toBe("session_end");
      expect(events[0]?.target?.id).toBe("sess-abc");
      expect(events[0]?.details?.durationMs).toBe(300000);
    });
  });

  describe("filtering", () => {
    it("filters by category", () => {
      const events: AuditEvent[] = [];
      logger = new AuditLogger({
        enabled: true,
        target: "custom",
        categories: ["auth"], // Only auth events
        customHandler: (event) => events.push(event),
      });

      logger.logAuth({ action: "login", outcome: "success" });
      logger.logAdmin({ action: "config_change", outcome: "success" });
      logger.close();

      expect(events).toHaveLength(1);
      expect(events[0]?.category).toBe("auth");
    });

    it("excludes requestId when disabled", () => {
      const events: AuditEvent[] = [];
      logger = new AuditLogger({
        enabled: true,
        target: "custom",
        includeRequestIds: false,
        customHandler: (event) => events.push(event),
      });

      logger.logAuth({ action: "login", outcome: "success", requestId: "req-123" });
      logger.close();

      expect(events[0]?.requestId).toBeUndefined();
    });
  });

  describe("configuration", () => {
    it("updates config at runtime", () => {
      const events: AuditEvent[] = [];
      logger = new AuditLogger({
        enabled: false,
        target: "custom",
        customHandler: (event) => events.push(event),
      });

      logger.logAuth({ action: "login", outcome: "success" });
      expect(events).toHaveLength(0);

      logger.updateConfig({ enabled: true });
      logger.logAuth({ action: "login", outcome: "success" });
      expect(events).toHaveLength(1);
    });
  });
});

describe("resolveAuditLogConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveAuditLogConfig();
    expect(config.enabled).toBe(false);
    expect(config.target).toBe("file");
    expect(config.categories).toContain("auth");
    expect(config.includeRequestIds).toBe(true);
  });

  it("merges partial config with defaults", () => {
    const config = resolveAuditLogConfig({
      enabled: true,
      target: "stdout",
    });
    expect(config.enabled).toBe(true);
    expect(config.target).toBe("stdout");
    expect(config.categories).toContain("auth"); // Default
  });
});
