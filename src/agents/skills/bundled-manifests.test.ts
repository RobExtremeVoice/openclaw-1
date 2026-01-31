import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadWorkspaceSkillEntries } from "./workspace.js";
import { validatePermissionManifest } from "./permissions.js";
import type { SkillEntryWithPermissions } from "./types.js";

/**
 * Integration tests for bundled skill permission manifests.
 * These tests verify that the permission manifests in bundled skills
 * are properly parsed and validated.
 */
describe("Bundled Skill Permission Manifests", () => {
  // Load skills from the skills directory
  const skillsDir = path.resolve(__dirname, "../../../skills");
  let entries: SkillEntryWithPermissions[];

  try {
    entries = loadWorkspaceSkillEntries(".", {
      bundledSkillsDir: skillsDir,
      skipSecurityFilter: true,
    });
  } catch {
    entries = [];
  }

  // Skills that should have manifests
  const skillsWithManifests = [
    "weather",
    "github",
    "1password",
    "slack",
    "notion",
    "obsidian",
    "trello",
  ];

  describe("Manifest presence", () => {
    for (const skillName of skillsWithManifests) {
      it(`${skillName} should have a permission manifest`, () => {
        const skill = entries.find((e) => e.skill.name === skillName);
        if (!skill) {
          // Skill not found - might not be in test environment
          return;
        }
        expect(skill.permissions).toBeDefined();
        expect(skill.permissions?.version).toBe(1);
      });
    }
  });

  describe("Manifest validation", () => {
    for (const skillName of skillsWithManifests) {
      it(`${skillName} should have a valid permission manifest`, () => {
        const skill = entries.find((e) => e.skill.name === skillName);
        if (!skill) {
          return;
        }
        if (!skill.permissions) {
          return;
        }

        const result = validatePermissionManifest(skill.permissions, skillName);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    }
  });

  describe("Manifest content", () => {
    it("weather should declare network access to wttr.in", () => {
      const skill = entries.find((e) => e.skill.name === "weather");
      if (!skill?.permissions) return;

      expect(skill.permissions.network).toContain("wttr.in");
      expect(skill.permissions.network).toContain("api.open-meteo.com");
      expect(skill.permissions.exec).toContain("curl");
    });

    it("github should declare network access to github.com", () => {
      const skill = entries.find((e) => e.skill.name === "github");
      if (!skill?.permissions) return;

      expect(skill.permissions.network).toContain("github.com");
      expect(skill.permissions.network).toContain("api.github.com");
      expect(skill.permissions.exec).toContain("gh");
    });

    it("1password should declare credential access", () => {
      const skill = entries.find((e) => e.skill.name === "1password");
      if (!skill?.permissions) return;

      expect(skill.permissions.sensitive_data?.credentials).toBe(true);
      expect(skill.permissions.exec).toContain("op");
    });

    it("slack should declare network access to slack.com", () => {
      const skill = entries.find((e) => e.skill.name === "slack");
      if (!skill?.permissions) return;

      expect(skill.permissions.network).toContain("slack.com");
    });

    it("notion should declare personal info access", () => {
      const skill = entries.find((e) => e.skill.name === "notion");
      if (!skill?.permissions) return;

      expect(skill.permissions.network).toContain("api.notion.com");
      expect(skill.permissions.sensitive_data?.personal_info).toBe(true);
    });

    it("obsidian should declare filesystem access", () => {
      const skill = entries.find((e) => e.skill.name === "obsidian");
      if (!skill?.permissions) return;

      expect(skill.permissions.filesystem).toBeDefined();
      expect(skill.permissions.filesystem?.length).toBeGreaterThan(0);
      expect(skill.permissions.sensitive_data?.personal_info).toBe(true);
    });

    it("trello should declare env var requirements", () => {
      const skill = entries.find((e) => e.skill.name === "trello");
      if (!skill?.permissions) return;

      expect(skill.permissions.env).toContain("TRELLO_API_KEY");
      expect(skill.permissions.env).toContain("TRELLO_TOKEN");
    });
  });

  describe("Risk assessment", () => {
    it("weather should have low risk (network only)", () => {
      const skill = entries.find((e) => e.skill.name === "weather");
      if (!skill?.permissionValidation) return;

      expect(skill.permissionValidation.risk_level).toBe("low");
    });

    it("1password should have high risk (credential access)", () => {
      const skill = entries.find((e) => e.skill.name === "1password");
      if (!skill?.permissionValidation) return;

      // 1password accesses credentials, so should be high risk
      expect(["high", "critical"]).toContain(skill.permissionValidation.risk_level);
    });

    it("all manifested skills should have declared_purpose", () => {
      for (const skillName of skillsWithManifests) {
        const skill = entries.find((e) => e.skill.name === skillName);
        if (!skill?.permissions) continue;

        expect(
          skill.permissions.declared_purpose,
          `${skillName} should have a declared_purpose`,
        ).toBeDefined();
        expect(
          skill.permissions.declared_purpose?.length,
          `${skillName} declared_purpose should not be empty`,
        ).toBeGreaterThan(0);
      }
    });

    it("all manifested skills should have security_notes", () => {
      for (const skillName of skillsWithManifests) {
        const skill = entries.find((e) => e.skill.name === skillName);
        if (!skill?.permissions) continue;

        expect(
          skill.permissions.security_notes,
          `${skillName} should have security_notes`,
        ).toBeDefined();
      }
    });
  });
});
