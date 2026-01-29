import { describe, expect, it, afterEach, vi } from "vitest";
import {
  GatewayRateLimiter,
  resolveRateLimitConfig,
  DEFAULT_RATE_LIMIT_CONFIG,
} from "./rate-limit.js";

describe("GatewayRateLimiter", () => {
  let limiter: GatewayRateLimiter;

  afterEach(() => {
    limiter?.close();
  });

  describe("checkRequest", () => {
    it("allows requests when disabled", () => {
      limiter = new GatewayRateLimiter({ enabled: false });
      const result = limiter.checkRequest("client-1", false);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it("allows unlimited authenticated requests by default", () => {
      limiter = new GatewayRateLimiter({ authenticated: 0 });
      for (let i = 0; i < 100; i++) {
        const result = limiter.checkRequest("client-1", true);
        expect(result.allowed).toBe(true);
      }
    });

    it("rate limits unauthenticated requests", () => {
      limiter = new GatewayRateLimiter({
        unauthenticated: 5,
        burstMultiplier: 1, // No burst for simpler testing
      });

      // First 5 should be allowed (burst = 5 * 1)
      for (let i = 0; i < 5; i++) {
        const result = limiter.checkRequest("client-1", false);
        expect(result.allowed).toBe(true);
      }

      // 6th should be rate limited
      const result = limiter.checkRequest("client-1", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("rate_limit");
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("allows burst traffic with burstMultiplier", () => {
      limiter = new GatewayRateLimiter({
        unauthenticated: 5,
        burstMultiplier: 2, // Allow 10 requests in burst
      });

      // First 10 should be allowed (5 * 2 = 10)
      for (let i = 0; i < 10; i++) {
        const result = limiter.checkRequest("client-1", false);
        expect(result.allowed).toBe(true);
      }

      // 11th should be rate limited
      const result = limiter.checkRequest("client-1", false);
      expect(result.allowed).toBe(false);
    });

    it("tracks separate buckets per client", () => {
      limiter = new GatewayRateLimiter({
        unauthenticated: 2,
        burstMultiplier: 1,
      });

      // Exhaust client-1's quota
      limiter.checkRequest("client-1", false);
      limiter.checkRequest("client-1", false);
      expect(limiter.checkRequest("client-1", false).allowed).toBe(false);

      // client-2 should still have quota
      expect(limiter.checkRequest("client-2", false).allowed).toBe(true);
    });

    it("refills tokens over time", async () => {
      vi.useFakeTimers();

      limiter = new GatewayRateLimiter({
        unauthenticated: 60, // 1 per second
        burstMultiplier: 1,
      });

      // Exhaust quota
      for (let i = 0; i < 60; i++) {
        limiter.checkRequest("client-1", false);
      }
      expect(limiter.checkRequest("client-1", false).allowed).toBe(false);

      // Advance time by 2 seconds (should refill 2 tokens)
      vi.advanceTimersByTime(2000);

      expect(limiter.checkRequest("client-1", false).allowed).toBe(true);
      expect(limiter.checkRequest("client-1", false).allowed).toBe(true);
      expect(limiter.checkRequest("client-1", false).allowed).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("checkChannelMessage", () => {
    it("rate limits channel messages", () => {
      limiter = new GatewayRateLimiter({
        channelMessages: 3,
        burstMultiplier: 1,
      });

      // First 3 should be allowed
      for (let i = 0; i < 3; i++) {
        expect(limiter.checkChannelMessage("telegram:123").allowed).toBe(true);
      }

      // 4th should be rate limited
      expect(limiter.checkChannelMessage("telegram:123").allowed).toBe(false);
    });

    it("tracks separate channels independently", () => {
      limiter = new GatewayRateLimiter({
        channelMessages: 2,
        burstMultiplier: 1,
      });

      // Exhaust telegram channel
      limiter.checkChannelMessage("telegram:123");
      limiter.checkChannelMessage("telegram:123");
      expect(limiter.checkChannelMessage("telegram:123").allowed).toBe(false);

      // Discord channel should still work
      expect(limiter.checkChannelMessage("discord:456").allowed).toBe(true);
    });

    it("allows unlimited when channelMessages is 0", () => {
      limiter = new GatewayRateLimiter({ channelMessages: 0 });
      for (let i = 0; i < 1000; i++) {
        expect(limiter.checkChannelMessage("telegram:123").allowed).toBe(true);
      }
    });
  });

  describe("auth failure backoff", () => {
    it("does not apply backoff before threshold", () => {
      limiter = new GatewayRateLimiter({
        authFailuresBeforeBackoff: 5,
      });

      // Record 4 failures (below threshold)
      for (let i = 0; i < 4; i++) {
        limiter.recordAuthFailure("client-1");
      }

      // Should still be allowed
      const result = limiter.checkRequest("client-1", false);
      expect(result.allowed).toBe(true);
    });

    it("applies backoff after threshold", () => {
      limiter = new GatewayRateLimiter({
        authFailuresBeforeBackoff: 3,
        authBackoffBaseMs: 1000,
      });

      // Record 3 failures (at threshold)
      for (let i = 0; i < 3; i++) {
        limiter.recordAuthFailure("client-1");
      }

      // Should be blocked
      const result = limiter.checkRequest("client-1", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("auth_backoff");
    });

    it("applies exponential backoff", () => {
      limiter = new GatewayRateLimiter({
        authFailuresBeforeBackoff: 1,
        authBackoffBaseMs: 1000,
        authBackoffMaxMs: 60000,
      });

      // First failure - 1000ms backoff
      limiter.recordAuthFailure("client-1");
      let state = limiter.getAuthBackoffState("client-1");
      expect(state?.failures).toBe(1);

      // Second failure - 2000ms backoff (1000 * 2^1)
      limiter.recordAuthFailure("client-1");
      state = limiter.getAuthBackoffState("client-1");
      expect(state?.failures).toBe(2);

      // Third failure - 4000ms backoff (1000 * 2^2)
      limiter.recordAuthFailure("client-1");
      state = limiter.getAuthBackoffState("client-1");
      expect(state?.failures).toBe(3);
    });

    it("clears backoff after successful auth", () => {
      limiter = new GatewayRateLimiter({
        authFailuresBeforeBackoff: 1,
      });

      limiter.recordAuthFailure("client-1");
      expect(limiter.getAuthBackoffState("client-1")).not.toBeNull();

      limiter.clearAuthFailure("client-1");
      expect(limiter.getAuthBackoffState("client-1")).toBeNull();
    });

    it("resets failure count after 10 minutes of inactivity", () => {
      vi.useFakeTimers();

      limiter = new GatewayRateLimiter({
        authFailuresBeforeBackoff: 5,
      });

      // Record 4 failures
      for (let i = 0; i < 4; i++) {
        limiter.recordAuthFailure("client-1");
      }

      // Advance 11 minutes
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Record 1 more failure - should be treated as first failure
      limiter.recordAuthFailure("client-1");

      // Should not be in backoff (only 1 failure after reset)
      expect(limiter.getAuthBackoffState("client-1")).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("updateConfig", () => {
    it("updates configuration at runtime", () => {
      limiter = new GatewayRateLimiter({ enabled: true });
      expect(limiter.getConfig().enabled).toBe(true);

      limiter.updateConfig({ enabled: false });
      expect(limiter.getConfig().enabled).toBe(false);
    });
  });
});

describe("resolveRateLimitConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveRateLimitConfig();
    expect(config).toEqual(DEFAULT_RATE_LIMIT_CONFIG);
  });

  it("merges partial config with defaults", () => {
    const config = resolveRateLimitConfig({
      enabled: false,
      unauthenticated: 100,
    });
    expect(config.enabled).toBe(false);
    expect(config.unauthenticated).toBe(100);
    expect(config.authenticated).toBe(DEFAULT_RATE_LIMIT_CONFIG.authenticated);
  });
});
