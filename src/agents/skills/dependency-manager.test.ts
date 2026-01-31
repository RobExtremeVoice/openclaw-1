import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock hasBinary before importing
vi.mock("./config.js", () => ({
  hasBinary: vi.fn(),
}));

import { hasBinary } from "./config.js";
import {
  detectPlatform,
  hasPackageManager,
  selectInstallSpec,
  getPackageManagerLabel,
} from "./dependency-manager.js";
import type { SkillEntry, SkillInstallSpec } from "./types.js";

const mockedHasBinary = vi.mocked(hasBinary);

describe("dependency-manager", () => {
  beforeEach(() => {
    mockedHasBinary.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectPlatform", () => {
    it("detects available package managers", () => {
      mockedHasBinary.mockImplementation((bin) => bin === "npm" || bin === "winget");

      const platform = detectPlatform();

      expect(platform.availableManagers).toContain("npm");
      expect(platform.availableManagers).toContain("winget");
      expect(platform.availableManagers).not.toContain("brew");
    });

    it("detects apt when apt-get is available", () => {
      mockedHasBinary.mockImplementation((bin) => bin === "apt-get");

      const platform = detectPlatform();

      expect(platform.availableManagers).toContain("apt");
    });

    it("returns os from process.platform", () => {
      mockedHasBinary.mockReturnValue(false);

      const platform = detectPlatform();

      expect(["darwin", "linux", "win32"]).toContain(platform.os);
    });
  });

  describe("hasPackageManager", () => {
    it("returns true when brew is available", () => {
      mockedHasBinary.mockImplementation((bin) => bin === "brew");

      expect(hasPackageManager("brew")).toBe(true);
      expect(hasPackageManager("apt")).toBe(false);
    });

    it("returns true when apt-get is available for apt", () => {
      mockedHasBinary.mockImplementation((bin) => bin === "apt-get");

      expect(hasPackageManager("apt")).toBe(true);
    });

    it("checks each package manager correctly", () => {
      mockedHasBinary.mockImplementation((bin) => bin === "scoop");

      expect(hasPackageManager("scoop")).toBe(true);
      expect(hasPackageManager("choco")).toBe(false);
      expect(hasPackageManager("winget")).toBe(false);
    });
  });

  describe("selectInstallSpec", () => {
    const createEntry = (install: SkillInstallSpec[]): SkillEntry => ({
      skill: { name: "test-skill", instructions: "test" },
      frontmatter: {},
      metadata: { install },
    });

    it("returns undefined when no specs are available", () => {
      const entry = createEntry([]);
      const platform = {
        os: "win32" as NodeJS.Platform,
        preferredManager: "winget" as const,
        availableManagers: ["winget" as const],
      };

      expect(selectInstallSpec(entry, platform)).toBeUndefined();
    });

    it("selects spec matching preferred manager", () => {
      const brewSpec: SkillInstallSpec = { kind: "brew", formula: "test" };
      const wingetSpec: SkillInstallSpec = { kind: "winget", package: "test" };
      const entry = createEntry([brewSpec, wingetSpec]);
      const platform = {
        os: "win32" as NodeJS.Platform,
        preferredManager: "winget" as const,
        availableManagers: ["winget" as const],
      };

      expect(selectInstallSpec(entry, platform)).toBe(wingetSpec);
    });

    it("filters by OS when specified", () => {
      const brewSpec: SkillInstallSpec = { kind: "brew", formula: "test", os: ["darwin"] };
      const wingetSpec: SkillInstallSpec = { kind: "winget", package: "test", os: ["win32"] };
      const entry = createEntry([brewSpec, wingetSpec]);
      const platform = {
        os: "win32" as NodeJS.Platform,
        preferredManager: "winget" as const,
        availableManagers: ["winget" as const],
      };

      expect(selectInstallSpec(entry, platform)).toBe(wingetSpec);
    });

    it("falls back to download spec when no manager matches", () => {
      const downloadSpec: SkillInstallSpec = {
        kind: "download",
        url: "https://example.com/file.zip",
      };
      const brewSpec: SkillInstallSpec = { kind: "brew", formula: "test" };
      const entry = createEntry([brewSpec, downloadSpec]);
      const platform = {
        os: "win32" as NodeJS.Platform,
        preferredManager: "winget" as const,
        availableManagers: ["winget" as const],
      };

      expect(selectInstallSpec(entry, platform)).toBe(downloadSpec);
    });

    it("includes specs without OS restriction", () => {
      const universalSpec: SkillInstallSpec = { kind: "node", package: "test-pkg" };
      const entry = createEntry([universalSpec]);
      const platform = {
        os: "linux" as NodeJS.Platform,
        preferredManager: "apt" as const,
        availableManagers: ["apt" as const, "npm" as const],
      };

      expect(selectInstallSpec(entry, platform)).toBe(universalSpec);
    });
  });

  describe("getPackageManagerLabel", () => {
    it("returns human-readable labels", () => {
      expect(getPackageManagerLabel("brew")).toBe("Homebrew");
      expect(getPackageManagerLabel("apt")).toBe("APT (Debian/Ubuntu)");
      expect(getPackageManagerLabel("winget")).toBe("Windows Package Manager (winget)");
      expect(getPackageManagerLabel("choco")).toBe("Chocolatey");
      expect(getPackageManagerLabel("scoop")).toBe("Scoop");
      expect(getPackageManagerLabel("npm")).toBe("npm");
    });
  });
});
