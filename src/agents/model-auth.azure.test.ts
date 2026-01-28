import { describe, it, expect } from "vitest";
import {
  resolveAzureEndpoint,
  resolveAzureApiVersion,
  resolveAzureDeployment,
} from "./model-auth.js";

describe("Azure provider configuration", () => {
  it("should resolve Azure endpoint from environment", () => {
    const endpoint = resolveAzureEndpoint({
      AZURE_ENDPOINT: "https://eastus2.api.cognitive.microsoft.com",
    });
    expect(endpoint).toBe("https://eastus2.api.cognitive.microsoft.com");
  });

  it("should resolve Azure API version with default", () => {
    const version = resolveAzureApiVersion({});
    expect(version).toBe("2024-08-01-preview");
  });

  it("should resolve Azure API version from environment", () => {
    const version = resolveAzureApiVersion({
      AZURE_API_VERSION: "2024-02-01",
    });
    expect(version).toBe("2024-02-01");
  });

  it("should resolve Azure deployment from environment", () => {
    const deployment = resolveAzureDeployment({
      AZURE_DEPLOYMENT: "gpt-5.2",
    });
    expect(deployment).toBe("gpt-5.2");
  });

  it("should return undefined for missing endpoint", () => {
    const endpoint = resolveAzureEndpoint({});
    expect(endpoint).toBeUndefined();
  });

  it("should return undefined for missing deployment", () => {
    const deployment = resolveAzureDeployment({});
    expect(deployment).toBeUndefined();
  });

  it("should trim whitespace from values", () => {
    const endpoint = resolveAzureEndpoint({
      AZURE_ENDPOINT: "  https://test.com  ",
    });
    expect(endpoint).toBe("https://test.com");
  });
});
