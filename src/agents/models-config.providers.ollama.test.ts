import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverOllamaModels } from "./models-config.providers.js";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("Ollama provider", () => {
  it("should not include ollama when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    // Ollama requires explicit configuration via OLLAMA_API_KEY env var or profile
    expect(providers?.ollama).toBeUndefined();
  });
});

describe("discoverOllamaModels", () => {
  const originalVitest = process.env.VITEST;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // discoverOllamaModels returns [] when VITEST or NODE_ENV=test is set,
    // so we temporarily clear those to exercise the real logic.
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalVitest !== undefined) {
      process.env.VITEST = originalVitest;
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("skips models with undefined or empty names", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        models: [
          { name: "llama3:latest", modified_at: "", size: 0, digest: "" },
          { name: undefined, modified_at: "", size: 0, digest: "" },
          { name: "", modified_at: "", size: 0, digest: "" },
          { name: "deepseek-r1:latest", modified_at: "", size: 0, digest: "" },
        ],
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const models = await discoverOllamaModels();

    expect(models).toHaveLength(2);
    expect(models[0]!.id).toBe("llama3:latest");
    expect(models[0]!.reasoning).toBe(false);
    expect(models[1]!.id).toBe("deepseek-r1:latest");
    expect(models[1]!.reasoning).toBe(true);
  });

  it("returns empty array when all model names are invalid", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        models: [
          { name: undefined, modified_at: "", size: 0, digest: "" },
          { name: null, modified_at: "", size: 0, digest: "" },
          { name: "", modified_at: "", size: 0, digest: "" },
        ],
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const models = await discoverOllamaModels();

    expect(models).toEqual([]);
  });

  it("returns empty array when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    const models = await discoverOllamaModels();

    expect(models).toEqual([]);
  });
});
