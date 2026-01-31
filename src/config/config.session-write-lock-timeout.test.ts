import { describe, expect, it } from "vitest";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";

/**
 * Helper to resolve session write lock timeout from config.
 * Matches the pattern in session-write-lock.ts where default is 60_000ms.
 */
function resolveSessionWriteLockTimeout(config: {
  agents?: { defaults?: { sessionWriteLockTimeoutMs?: number } };
}): number {
  return config.agents?.defaults?.sessionWriteLockTimeoutMs ?? 60_000;
}

describe("sessionWriteLockTimeoutMs config", () => {
  it("uses default timeout when unset", () => {
    const config = {};
    expect(resolveSessionWriteLockTimeout(config)).toBe(60_000);
  });

  it("uses default timeout when agents.defaults is empty", () => {
    const config = { agents: { defaults: {} } };
    expect(resolveSessionWriteLockTimeout(config)).toBe(60_000);
  });

  it("uses custom timeout from config", () => {
    const config = {
      agents: {
        defaults: {
          sessionWriteLockTimeoutMs: 30_000,
        },
      },
    };
    expect(resolveSessionWriteLockTimeout(config)).toBe(30_000);
  });

  it("accepts large timeout values", () => {
    const config = {
      agents: {
        defaults: {
          sessionWriteLockTimeoutMs: 120_000,
        },
      },
    };
    expect(resolveSessionWriteLockTimeout(config)).toBe(120_000);
  });

  it("config type includes sessionWriteLockTimeoutMs field", () => {
    const config: AgentDefaultsConfig = {
      sessionWriteLockTimeoutMs: 45_000,
    };
    expect(config.sessionWriteLockTimeoutMs).toBe(45_000);
  });

  it("validates positive integer timeout via zod schema", () => {
    const validConfig = { sessionWriteLockTimeoutMs: 30_000 };
    const result = AgentDefaultsSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionWriteLockTimeoutMs).toBe(30_000);
    }
  });

  it("rejects negative timeout values", () => {
    const invalidConfig = { sessionWriteLockTimeoutMs: -1000 };
    const result = AgentDefaultsSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("rejects zero timeout value", () => {
    const invalidConfig = { sessionWriteLockTimeoutMs: 0 };
    const result = AgentDefaultsSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer timeout values", () => {
    const invalidConfig = { sessionWriteLockTimeoutMs: 1000.5 };
    const result = AgentDefaultsSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("allows undefined/optional timeout", () => {
    const config = {};
    const result = AgentDefaultsSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
