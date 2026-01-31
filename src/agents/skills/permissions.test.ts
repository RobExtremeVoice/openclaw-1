import { describe, it, expect } from "vitest";
import {
  validatePermissionManifest,
  formatPermissionManifest,
  formatValidationResult,
} from "./permissions.js";
import type { SkillPermissionManifest } from "./types.js";

describe("validatePermissionManifest", () => {
  it("returns high risk for missing manifest", () => {
    const result = validatePermissionManifest(undefined, "test-skill");
    expect(result.valid).toBe(false);
    expect(result.risk_level).toBe("high");
    expect(result.risk_factors).toContain(
      "No declared permissions - skill trust cannot be assessed",
    );
  });

  it("returns minimal risk for empty permissions", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      filesystem: [],
      network: [],
      env: [],
      exec: [],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_level).toBe("minimal");
    expect(result.valid).toBe(true);
  });

  it("flags high-risk filesystem patterns - dotfiles", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      filesystem: ["read:~/.ssh"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.length).toBeGreaterThan(0);
    expect(result.risk_factors.some((f) => f.includes(".ssh"))).toBe(true);
  });

  it("flags high-risk filesystem patterns - env files", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      filesystem: ["read:./.env"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes(".env"))).toBe(true);
  });

  it("flags dangerous executables as critical risk", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      exec: ["bash"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_level).toBe("critical");
    expect(result.risk_factors.some((f) => f.includes("bash"))).toBe(true);
  });

  it("flags sudo as critical risk", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      exec: ["sudo"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_level).toBe("critical");
  });

  it("flags credential access in env", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      env: ["AWS_SECRET_ACCESS_KEY"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes("sensitive"))).toBe(true);
  });

  it("flags API keys in env", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      env: ["OPENAI_API_KEY"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes("KEY"))).toBe(true);
  });

  it("warns when no security_notes for risky skill", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      sensitive_data: { credentials: true },
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.warnings.some((w) => w.includes("security_notes"))).toBe(true);
  });

  it("does not warn about security_notes when provided", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      sensitive_data: { credentials: true },
      declared_purpose: "Test skill",
      security_notes: "This is justified because...",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.warnings.some((w) => w.includes("security_notes"))).toBe(false);
  });

  it("warns when no declared_purpose", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.warnings.some((w) => w.includes("declared_purpose"))).toBe(true);
  });

  it("flags elevated access", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      elevated: true,
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_level).toBe("critical");
    expect(result.risk_factors.some((f) => f.includes("elevated"))).toBe(true);
  });

  it("flags system_config modification", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      system_config: true,
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes("system configuration"))).toBe(true);
  });

  it("flags high-risk network patterns - any", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      network: ["any"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes("any"))).toBe(true);
  });

  it("flags known exfil endpoints", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      network: ["webhook.site"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_factors.some((f) => f.includes("webhook.site"))).toBe(true);
  });

  it("returns low risk for network-only access", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      network: ["api.weather.gov"],
      declared_purpose: "Get weather",
    };
    const result = validatePermissionManifest(manifest, "weather-skill");
    expect(result.risk_level).toBe("low");
  });

  it("returns high risk for multiple risk factors", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      env: ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "DATABASE_PASSWORD"],
      declared_purpose: "Test skill",
    };
    const result = validatePermissionManifest(manifest, "test-skill");
    expect(result.risk_level).toBe("high");
  });
});

describe("formatPermissionManifest", () => {
  it("formats missing manifest with warning", () => {
    const output = formatPermissionManifest(undefined, "test-skill");
    expect(output).toContain("NO permission manifest");
    expect(output).toContain("test-skill");
  });

  it("formats complete manifest", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      filesystem: ["read:./data"],
      network: ["api.example.com"],
      env: ["API_KEY"],
      exec: ["curl"],
      declared_purpose: "Fetch data from API",
    };
    const output = formatPermissionManifest(manifest, "test-skill");
    expect(output).toContain("Fetch data from API");
    expect(output).toContain("read:./data");
    expect(output).toContain("api.example.com");
    expect(output).toContain("API_KEY");
    expect(output).toContain("curl");
  });

  it("shows elevated access warning", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      elevated: true,
      declared_purpose: "System admin",
    };
    const output = formatPermissionManifest(manifest, "admin-skill");
    expect(output).toContain("ELEVATED ACCESS");
  });

  it("shows security notes when present", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      declared_purpose: "Test",
      security_notes: "This is safe because...",
    };
    const output = formatPermissionManifest(manifest, "test-skill");
    expect(output).toContain("This is safe because...");
  });

  it("shows none declared for empty permissions", () => {
    const manifest: SkillPermissionManifest = {
      version: 1,
      filesystem: [],
      network: [],
      declared_purpose: "Minimal skill",
    };
    const output = formatPermissionManifest(manifest, "minimal-skill");
    expect(output).toContain("none declared");
  });
});

describe("formatValidationResult", () => {
  it("formats minimal risk with green indicator", () => {
    const result = validatePermissionManifest(
      { version: 1, declared_purpose: "Test" },
      "test-skill",
    );
    const output = formatValidationResult(result);
    expect(output).toContain("🟢");
    expect(output).toContain("MINIMAL");
  });

  it("formats critical risk with stop indicator", () => {
    const result = validatePermissionManifest(
      { version: 1, elevated: true, declared_purpose: "Test" },
      "test-skill",
    );
    const output = formatValidationResult(result);
    expect(output).toContain("⛔");
    expect(output).toContain("CRITICAL");
  });

  it("lists risk factors", () => {
    const result = validatePermissionManifest(
      { version: 1, exec: ["bash"], declared_purpose: "Test" },
      "test-skill",
    );
    const output = formatValidationResult(result);
    expect(output).toContain("Risk factors:");
    expect(output).toContain("bash");
  });

  it("lists warnings", () => {
    const result = validatePermissionManifest({ version: 1 }, "test-skill");
    const output = formatValidationResult(result);
    expect(output).toContain("Warnings:");
    expect(output).toContain("declared_purpose");
  });
});
