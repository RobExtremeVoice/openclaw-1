import type { Skill } from "@mariozechner/pi-coding-agent";

export type SkillInstallSpec = {
  id?: string;
  kind: "brew" | "node" | "go" | "uv" | "download";
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
};

export type OpenClawSkillMetadata = {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
};

export type SkillInvocationPolicy = {
  userInvocable: boolean;
  disableModelInvocation: boolean;
};

export type SkillCommandDispatchSpec = {
  kind: "tool";
  /** Name of the tool to invoke (AnyAgentTool.name). */
  toolName: string;
  /**
   * How to forward user-provided args to the tool.
   * - raw: forward the raw args string (no core parsing).
   */
  argMode?: "raw";
};

export type SkillCommandSpec = {
  name: string;
  skillName: string;
  description: string;
  /** Optional deterministic dispatch behavior for this command. */
  dispatch?: SkillCommandDispatchSpec;
};

export type SkillsInstallPreferences = {
  preferBrew: boolean;
  nodeManager: "npm" | "pnpm" | "yarn" | "bun";
};

export type ParsedSkillFrontmatter = Record<string, string>;

export type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  metadata?: OpenClawSkillMetadata;
  invocation?: SkillInvocationPolicy;
};

export type SkillEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
};

export type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
  version?: number;
};

// ============================================================================
// Permission Manifest Types
// ============================================================================

/**
 * Permission scope for filesystem access.
 * Format: "read:<path>" | "write:<path>" | "readwrite:<path>"
 * Paths can use globs: "read:./data/*", "write:./output/**"
 * Special values: "read:cwd", "write:temp", "none"
 */
export type FilesystemPermission = string;

/**
 * Permission scope for network access.
 * Format: domain or pattern
 * Examples: "api.weather.gov", "*.openai.com", "localhost:*"
 * Special values: "none", "any" (discouraged)
 */
export type NetworkPermission = string;

/**
 * Permission scope for environment variable access.
 * Format: variable name or pattern
 * Examples: "OPENAI_API_KEY", "AWS_*", "PATH"
 * Special values: "none"
 */
export type EnvPermission = string;

/**
 * Permission scope for executable/command access.
 * Format: binary name
 * Examples: "curl", "python", "node"
 * Special values: "none", "shell" (allows arbitrary shell)
 */
export type ExecPermission = string;

/**
 * Risk level assessment for a skill's permission set.
 */
export type PermissionRiskLevel = "minimal" | "low" | "moderate" | "high" | "critical";

/**
 * Complete permission manifest for a skill.
 */
export type SkillPermissionManifest = {
  /** Schema version for future compatibility */
  version: 1;

  /** Filesystem access requirements */
  filesystem?: FilesystemPermission[];

  /** Network access requirements */
  network?: NetworkPermission[];

  /** Environment variable access */
  env?: EnvPermission[];

  /** Executable/command access */
  exec?: ExecPermission[];

  /** Human-readable purpose statement */
  declared_purpose?: string;

  /** Whether skill needs elevated/sudo access */
  elevated?: boolean;

  /** Whether skill may modify system configuration */
  system_config?: boolean;

  /** Whether skill accesses sensitive data categories */
  sensitive_data?: {
    credentials?: boolean;
    personal_info?: boolean;
    financial?: boolean;
  };

  /** Author-provided security notes */
  security_notes?: string;
};

/**
 * Validation result for a permission manifest.
 */
export type PermissionValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
  risk_level: PermissionRiskLevel;
  risk_factors: string[];
};

/**
 * Extended skill entry with permission information.
 */
export type SkillEntryWithPermissions = SkillEntry & {
  permissions?: SkillPermissionManifest;
  permissionValidation?: PermissionValidationResult;
};
