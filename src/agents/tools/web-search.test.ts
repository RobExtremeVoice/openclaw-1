import { describe, expect, it } from "vitest";

import { __testing } from "./web-search.js";

const {
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  normalizeFreshness,
  resolveSearxngBaseUrl,
  resolveSearxngHeaders,
} = __testing;

describe("web_search perplexity baseUrl defaults", () => {
  it("detects a Perplexity key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("pplx-123")).toBe("direct");
  });

  it("detects an OpenRouter key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("sk-or-v1-123")).toBe("openrouter");
  });

  it("returns undefined for unknown key formats", () => {
    expect(inferPerplexityBaseUrlFromApiKey("unknown-key")).toBeUndefined();
  });

  it("prefers explicit baseUrl over key-based defaults", () => {
    expect(resolvePerplexityBaseUrl({ baseUrl: "https://example.com" }, "config", "pplx-123")).toBe(
      "https://example.com",
    );
  });

  it("defaults to direct when using PERPLEXITY_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "perplexity_env")).toBe("https://api.perplexity.ai");
  });

  it("defaults to OpenRouter when using OPENROUTER_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "openrouter_env")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to direct when config key looks like Perplexity", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "pplx-123")).toBe(
      "https://api.perplexity.ai",
    );
  });

  it("defaults to OpenRouter when config key looks like OpenRouter", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "sk-or-v1-123")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to OpenRouter for unknown config key formats", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "weird-key")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
});

describe("web_search freshness normalization", () => {
  it("accepts Brave shortcut values", () => {
    expect(normalizeFreshness("pd")).toBe("pd");
    expect(normalizeFreshness("PW")).toBe("pw");
  });

  it("accepts valid date ranges", () => {
    expect(normalizeFreshness("2024-01-01to2024-01-31")).toBe("2024-01-01to2024-01-31");
  });

  it("rejects invalid date ranges", () => {
    expect(normalizeFreshness("2024-13-01to2024-01-31")).toBeUndefined();
    expect(normalizeFreshness("2024-02-30to2024-03-01")).toBeUndefined();
    expect(normalizeFreshness("2024-03-10to2024-03-01")).toBeUndefined();
  });
});

describe("web_search searxng config resolution", () => {
  it("prefers config baseUrl and trims trailing slash", () => {
    expect(resolveSearxngBaseUrl({ baseUrl: "http://localhost:8080/" })).toBe(
      "http://localhost:8080",
    );
  });

  it("falls back to SEARXNG_BASE_URL env var", () => {
    const prev = process.env.SEARXNG_BASE_URL;
    process.env.SEARXNG_BASE_URL = "http://searxng.local:8888/";
    try {
      expect(resolveSearxngBaseUrl(undefined)).toBe("http://searxng.local:8888");
    } finally {
      if (prev === undefined) {
        delete process.env.SEARXNG_BASE_URL;
      } else {
        process.env.SEARXNG_BASE_URL = prev;
      }
    }
  });

  it("builds headers with optional auth and extras", () => {
    expect(resolveSearxngHeaders(undefined)).toEqual({ Accept: "application/json" });

    expect(resolveSearxngHeaders({ apiKey: "token-123" }).Authorization).toBe("Bearer token-123");
    expect(resolveSearxngHeaders({ apiKey: "Basic abc" }).Authorization).toBe("Basic abc");

    const headers = resolveSearxngHeaders({ headers: { "X-Test": "ok" }, apiKey: "token-123" });
    expect(headers["X-Test"]).toBe("ok");
    expect(headers.Accept).toBe("application/json");
  });
});
