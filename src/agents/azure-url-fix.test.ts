import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installAzureUrlFix, resetAzureUrlFixForTesting } from "./azure-url-fix.js";

describe("Azure URL Fix", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    resetAzureUrlFixForTesting(); // Reset state for each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should fix malformed Azure URLs with query params before path", async () => {
    // Mock fetch to capture the fixed URL
    let capturedUrl = "";
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : (input as any).url || input.toString();
      return new Response("{}");
    };

    installAzureUrlFix();

    // Simulate OpenAI SDK's malformed URL construction
    await fetch(
      "https://eastus2.api.cognitive.microsoft.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-02-01/chat/completions",
    );

    // Verify URL was fixed
    expect(capturedUrl).toBe(
      "https://eastus2.api.cognitive.microsoft.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-02-01",
    );
  });

  it("should not modify non-Azure URLs", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : (input as any).url;
      return new Response("{}");
    };

    installAzureUrlFix();

    const testUrl = "https://api.openai.com/v1/chat/completions";
    await fetch(testUrl);

    expect(capturedUrl).toBe(testUrl);
  });

  it("should handle URLs with different Azure endpoint formats", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : (input as any).url;
      return new Response("{}");
    };

    installAzureUrlFix();

    await fetch(
      "https://test.openai.azure.com/openai/deployments/gpt-4?api-version=2024-08-01-preview/chat/completions",
    );

    expect(capturedUrl).toBe(
      "https://test.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-08-01-preview",
    );
  });
});
