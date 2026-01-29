import { describe, expect, it } from "vitest";

import { __testing } from "./web-search.js";

const {
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  resolveBraveBaseUrl,
  resolveBraveAuthStyle,
  normalizeFreshness,
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

describe("web_search brave baseUrl defaults", () => {
  it("returns default Brave URL when no config is provided", () => {
    expect(resolveBraveBaseUrl(undefined)).toBe("https://api.search.brave.com");
  });

  it("returns default Brave URL when config is empty", () => {
    expect(resolveBraveBaseUrl({})).toBe("https://api.search.brave.com");
  });

  it("uses custom baseUrl from config", () => {
    expect(resolveBraveBaseUrl({ baseUrl: "https://custom-brave.example.com" })).toBe(
      "https://custom-brave.example.com",
    );
  });

  it("trims whitespace from custom baseUrl", () => {
    expect(resolveBraveBaseUrl({ baseUrl: "  https://custom-brave.example.com  " })).toBe(
      "https://custom-brave.example.com",
    );
  });

  it("returns default when baseUrl is empty string", () => {
    expect(resolveBraveBaseUrl({ baseUrl: "" })).toBe("https://api.search.brave.com");
  });

  it("returns default when baseUrl is only whitespace", () => {
    expect(resolveBraveBaseUrl({ baseUrl: "   " })).toBe("https://api.search.brave.com");
  });
});

describe("web_search brave authStyle defaults", () => {
  it("returns x-subscription-token when no config is provided", () => {
    expect(resolveBraveAuthStyle(undefined)).toBe("x-subscription-token");
  });

  it("returns x-subscription-token when config is empty", () => {
    expect(resolveBraveAuthStyle({})).toBe("x-subscription-token");
  });

  it("returns bearer when authStyle is bearer", () => {
    expect(resolveBraveAuthStyle({ authStyle: "bearer" })).toBe("bearer");
  });

  it("returns x-subscription-token when authStyle is x-subscription-token", () => {
    expect(resolveBraveAuthStyle({ authStyle: "x-subscription-token" })).toBe(
      "x-subscription-token",
    );
  });

  it("is case-insensitive", () => {
    expect(resolveBraveAuthStyle({ authStyle: "BEARER" } as never)).toBe("bearer");
    expect(resolveBraveAuthStyle({ authStyle: "Bearer" } as never)).toBe("bearer");
  });

  it("returns default for unknown values", () => {
    expect(resolveBraveAuthStyle({ authStyle: "unknown" } as never)).toBe("x-subscription-token");
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
