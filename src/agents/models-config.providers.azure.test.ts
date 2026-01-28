import { describe, it, expect } from "vitest";
import { resolveImplicitAzureProvider } from "./models-config.providers.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Azure provider auto-discovery", () => {
  it("should return null when environment variables are missing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {},
    });
    expect(provider).toBeNull();
  });

  it("should auto-discover Azure provider from environment variables", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://eastus2.api.cognitive.microsoft.com",
        AZURE_API_KEY: "test-key",
        AZURE_DEPLOYMENT: "gpt-5.2",
        AZURE_API_VERSION: "2024-02-01",
      },
    });

    expect(provider).not.toBeNull();
    expect(provider?.apiKey).toBe("test-key");
    expect(provider?.api).toBe("openai-completions");
    expect(provider?.headers).toEqual({ "api-key": "test-key" });
  });

  it("should construct correct baseUrl with deployment and API version", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://eastus2.api.cognitive.microsoft.com",
        AZURE_API_KEY: "test-key",
        AZURE_DEPLOYMENT: "gpt-5.2",
        AZURE_API_VERSION: "2024-02-01",
      },
    });

    expect(provider?.baseUrl).toBe(
      "https://eastus2.api.cognitive.microsoft.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-02-01",
    );
  });

  it("should create model definition with empty ID", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://test.com",
        AZURE_API_KEY: "key",
        AZURE_DEPLOYMENT: "gpt-4",
      },
    });

    expect(provider?.models).toHaveLength(1);
    expect(provider?.models[0].id).toBe("");
    expect(provider?.models[0].name).toBe("Azure gpt-4");
  });

  it("should detect reasoning models (o1/o3)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://test.com",
        AZURE_API_KEY: "key",
        AZURE_DEPLOYMENT: "gpt-o1-preview",
      },
    });

    expect(provider?.models[0].reasoning).toBe(true);
  });

  it("should detect vision models", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://test.com",
        AZURE_API_KEY: "key",
        AZURE_DEPLOYMENT: "gpt-4-vision",
      },
    });

    expect(provider?.models[0].input).toEqual(["text", "image"]);
  });

  it("should use max_completion_tokens compatibility", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "moltbot-test-"));
    const provider = await resolveImplicitAzureProvider({
      agentDir: tempDir,
      env: {
        AZURE_ENDPOINT: "https://test.com",
        AZURE_API_KEY: "key",
        AZURE_DEPLOYMENT: "gpt-5.2",
      },
    });

    expect(provider?.models[0].compat?.maxTokensField).toBe("max_completion_tokens");
  });
});
