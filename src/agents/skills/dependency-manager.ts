/**
 * Cross-platform dependency resolution and platform detection.
 * Helps select the appropriate install spec for the current OS.
 */

import { hasBinary } from "./config.js";
import type { SkillEntry, SkillInstallSpec } from "./types.js";

export type PackageManagerKind = "brew" | "apt" | "winget" | "choco" | "scoop" | "npm";

export type PlatformInfo = {
  /** Node.js process.platform value */
  os: NodeJS.Platform;
  /** Best package manager for this platform */
  preferredManager: PackageManagerKind | undefined;
  /** All detected package managers available on PATH */
  availableManagers: PackageManagerKind[];
};

/**
 * Detect the current platform and available package managers.
 */
export function detectPlatform(): PlatformInfo {
  const os = process.platform;
  const availableManagers: PackageManagerKind[] = [];

  // Check each package manager
  if (hasBinary("brew")) availableManagers.push("brew");
  if (hasBinary("apt-get") || hasBinary("apt")) availableManagers.push("apt");
  if (hasBinary("winget")) availableManagers.push("winget");
  if (hasBinary("choco")) availableManagers.push("choco");
  if (hasBinary("scoop")) availableManagers.push("scoop");
  if (hasBinary("npm")) availableManagers.push("npm");

  const preferredManager = resolvePreferredManager(os, availableManagers);
  return { os, preferredManager, availableManagers };
}

/**
 * Select the best install spec for the current platform from a skill's install array.
 * Prioritizes specs matching the preferred package manager, then falls back to
 * any compatible spec (e.g., download).
 */
export function selectInstallSpec(
  entry: SkillEntry,
  platform: PlatformInfo,
): SkillInstallSpec | undefined {
  const specs = entry.metadata?.install ?? [];
  if (specs.length === 0) return undefined;

  // Filter specs compatible with current OS
  const compatible = specs.filter((spec) => {
    if (!spec.os || spec.os.length === 0) return true;
    return spec.os.includes(platform.os);
  });

  if (compatible.length === 0) return undefined;

  // Try preferred manager first, then other available managers
  const managerPriority = platform.preferredManager
    ? [
        platform.preferredManager,
        ...platform.availableManagers.filter((m) => m !== platform.preferredManager),
      ]
    : platform.availableManagers;

  for (const manager of managerPriority) {
    const match = compatible.find((spec) => spec.kind === manager);
    if (match) return match;
  }

  // Fall back to universal install methods (don't require a platform package manager)
  const universalKinds = ["download", "node", "go", "uv"];
  const universalSpec = compatible.find((spec) => universalKinds.includes(spec.kind));
  if (universalSpec) return universalSpec;

  // Last resort: first compatible spec
  return compatible[0];
}

/**
 * Check if a specific package manager is available on the system.
 */
export function hasPackageManager(kind: PackageManagerKind): boolean {
  switch (kind) {
    case "brew":
      return hasBinary("brew");
    case "apt":
      return hasBinary("apt-get") || hasBinary("apt");
    case "winget":
      return hasBinary("winget");
    case "choco":
      return hasBinary("choco");
    case "scoop":
      return hasBinary("scoop");
    case "npm":
      return hasBinary("npm");
    default:
      return false;
  }
}

/**
 * Get a human-readable name for a package manager.
 */
export function getPackageManagerLabel(kind: PackageManagerKind): string {
  switch (kind) {
    case "brew":
      return "Homebrew";
    case "apt":
      return "APT (Debian/Ubuntu)";
    case "winget":
      return "Windows Package Manager (winget)";
    case "choco":
      return "Chocolatey";
    case "scoop":
      return "Scoop";
    case "npm":
      return "npm";
    default:
      return kind;
  }
}

function resolvePreferredManager(
  os: string,
  available: PackageManagerKind[],
): PackageManagerKind | undefined {
  // Platform-specific preferences
  if (os === "darwin" && available.includes("brew")) return "brew";
  if (os === "linux" && available.includes("apt")) return "apt";
  if (os === "win32") {
    // Windows: prefer winget > scoop > choco
    if (available.includes("winget")) return "winget";
    if (available.includes("scoop")) return "scoop";
    if (available.includes("choco")) return "choco";
  }

  // Fallback to first available
  return available[0];
}
