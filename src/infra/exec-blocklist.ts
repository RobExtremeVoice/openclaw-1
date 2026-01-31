/**
 * Exec Command Blocklist
 *
 * Provides a hardcoded blocklist of dangerous commands that should NEVER
 * be executed, regardless of security mode or allowlist status.
 *
 * This is a defense-in-depth measure that catches destructive operations
 * even when security=full or when a command matches the allowlist.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("exec-blocklist");

export type BlocklistCategory =
  | "destructive" // rm -rf, mkfs, dd
  | "system_modification" // chmod 777, chown root
  | "network_exfiltration" // curl to unknown hosts with sensitive data
  | "credential_access" // reading sensitive files
  | "persistence" // cron, systemd modifications
  | "privilege_escalation"; // sudo without approval

export type BlocklistMatch = {
  blocked: boolean;
  category?: BlocklistCategory;
  pattern?: string;
  reason?: string;
};

type BlocklistPattern = {
  pattern: RegExp;
  category: BlocklistCategory;
  reason: string;
};

/**
 * Core blocklist patterns - these are always blocked.
 * Patterns are checked against the full command string.
 */
const CORE_BLOCKLIST: BlocklistPattern[] = [
  // Destructive filesystem operations
  {
    pattern: /\brm\s+(-[^\s]*\s+)*-r\s*f?\s*\/(?!\w)/i,
    category: "destructive",
    reason: "Recursive delete from root",
  },
  {
    pattern: /\brm\s+(-[^\s]*\s+)*-f?\s*r\s*\/(?!\w)/i,
    category: "destructive",
    reason: "Recursive delete from root",
  },
  {
    pattern: /\brm\s+(-[^\s]+\s+)+-[rf]\s+(-[rf]\s+)?\/(?!\w)/i,
    category: "destructive",
    reason: "Recursive delete from root (separated flags)",
  },
  {
    pattern: /\brm\s+(-[^\s]*\s+)*--no-preserve-root/i,
    category: "destructive",
    reason: "Explicit root preservation bypass",
  },
  {
    pattern: /\bmkfs\b/i,
    category: "destructive",
    reason: "Filesystem formatting",
  },
  {
    pattern: /\bdd\s+.*\bof\s*=\s*\/dev\/[sh]d[a-z]/i,
    category: "destructive",
    reason: "Direct disk write",
  },
  {
    pattern: /\bshred\s+.*\/dev\/[sh]d[a-z]/i,
    category: "destructive",
    reason: "Disk shredding",
  },
  {
    pattern: />\s*\/dev\/[sh]d[a-z]/,
    category: "destructive",
    reason: "Direct disk overwrite via redirect",
  },
  {
    pattern: /\bwipefs\b/i,
    category: "destructive",
    reason: "Filesystem signature wiping",
  },

  // Fork bombs and resource exhaustion
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    category: "destructive",
    reason: "Fork bomb",
  },
  {
    pattern: /\bfork\s*\(\s*\)\s*while/i,
    category: "destructive",
    reason: "Fork bomb pattern",
  },

  // Dangerous permission changes
  {
    pattern: /\bchmod\s+(-[^\s]+\s+)*777\s+\//i,
    category: "system_modification",
    reason: "World-writable root permissions",
  },
  {
    pattern: /\bchmod\s+(-[^\s]+\s+)*-R\s+777/i,
    category: "system_modification",
    reason: "Recursive world-writable permissions",
  },
  {
    pattern: /\bchown\s+(-[^\s]+\s+)*-R\s+root/i,
    category: "system_modification",
    reason: "Recursive root ownership change",
  },

  // System file modifications
  {
    pattern: />\s*\/etc\/passwd\b/,
    category: "system_modification",
    reason: "Password file overwrite",
  },
  {
    pattern: />\s*\/etc\/shadow\b/,
    category: "system_modification",
    reason: "Shadow file overwrite",
  },
  {
    pattern: />\s*\/etc\/sudoers\b/,
    category: "system_modification",
    reason: "Sudoers file overwrite",
  },
  {
    pattern: /\bvisudo\b.*NOPASSWD\s*:\s*ALL/i,
    category: "privilege_escalation",
    reason: "Sudoers NOPASSWD modification",
  },

  // Credential exfiltration patterns
  {
    pattern: /\bcat\s+.*\.ssh\/.*\|\s*(curl|wget|nc|netcat)/i,
    category: "credential_access",
    reason: "SSH key exfiltration",
  },
  {
    pattern: /\bcat\s+.*\.aws\/credentials.*\|\s*(curl|wget|nc|netcat)/i,
    category: "credential_access",
    reason: "AWS credentials exfiltration",
  },
  {
    pattern: /\bcat\s+.*\.env.*\|\s*(curl|wget|nc|netcat)/i,
    category: "credential_access",
    reason: "Environment file exfiltration",
  },

  // Persistence mechanisms
  {
    pattern: /\bcrontab\s+-r\b/i,
    category: "persistence",
    reason: "Crontab removal",
  },
  {
    pattern: />\s*\/etc\/cron\.\w+\//,
    category: "persistence",
    reason: "Cron directory write",
  },
  {
    pattern: /\bsystemctl\s+(enable|mask)\s+/i,
    category: "persistence",
    reason: "Systemd service modification",
  },

  // Network backdoors
  {
    pattern: /\bnc\s+(-[^\s]+\s+)*-e\s+\/bin\/(ba)?sh/i,
    category: "network_exfiltration",
    reason: "Netcat reverse shell",
  },
  {
    pattern: /\bbash\s+-i\s+>&?\s*\/dev\/tcp\//i,
    category: "network_exfiltration",
    reason: "Bash reverse shell",
  },
  {
    pattern: /\bpython[23]?\s+-c\s+['"]import\s+socket/i,
    category: "network_exfiltration",
    reason: "Python socket reverse shell",
  },

  // Kernel modifications
  {
    pattern: /\binsmod\b/i,
    category: "system_modification",
    reason: "Kernel module insertion",
  },
  {
    pattern: /\brmmod\b/i,
    category: "system_modification",
    reason: "Kernel module removal",
  },
  {
    pattern: /\bmodprobe\s+(-r\s+)?/i,
    category: "system_modification",
    reason: "Kernel module manipulation",
  },

  // Boot modifications
  {
    pattern: />\s*\/boot\//,
    category: "system_modification",
    reason: "Boot directory write",
  },
  {
    pattern: /\bgrub-install\b/i,
    category: "system_modification",
    reason: "Bootloader modification",
  },
];

/**
 * Extended blocklist patterns - can be toggled via config.
 * These are more aggressive and may block legitimate use cases.
 */
const EXTENDED_BLOCKLIST: BlocklistPattern[] = [
  // Any sudo without explicit approval
  {
    pattern: /\bsudo\s+/i,
    category: "privilege_escalation",
    reason: "Sudo execution (requires explicit approval)",
  },
  // Any su command
  {
    pattern: /\bsu\s+(-\s+)?(\w+)?$/i,
    category: "privilege_escalation",
    reason: "User switching",
  },
  // Package manager operations
  {
    pattern: /\b(apt|apt-get|yum|dnf|pacman|brew)\s+(install|remove|purge)/i,
    category: "system_modification",
    reason: "Package installation/removal",
  },
  // Docker with privileged flag
  {
    pattern: /\bdocker\s+run\s+.*--privileged/i,
    category: "privilege_escalation",
    reason: "Privileged Docker container",
  },
  // Mounting filesystems
  {
    pattern: /\bmount\s+/i,
    category: "system_modification",
    reason: "Filesystem mounting",
  },
];

export type ExecBlocklistConfig = {
  /** Enable blocklist checking (default: true). */
  enabled?: boolean;
  /** Use extended blocklist patterns (default: false). */
  extended?: boolean;
  /** Additional custom patterns to block. */
  customPatterns?: Array<{
    pattern: string;
    category?: BlocklistCategory;
    reason?: string;
  }>;
  /** Patterns to exclude from blocking (escape hatch). */
  excludePatterns?: string[];
  /** Log blocked commands (default: true). */
  logBlocked?: boolean;
};

export type ResolvedExecBlocklistConfig = Required<
  Omit<ExecBlocklistConfig, "customPatterns" | "excludePatterns">
> & {
  customPatterns: BlocklistPattern[];
  excludePatterns: RegExp[];
};

const DEFAULT_CONFIG: ResolvedExecBlocklistConfig = {
  enabled: true,
  extended: false,
  customPatterns: [],
  excludePatterns: [],
  logBlocked: true,
};

export function resolveExecBlocklistConfig(
  config?: Partial<ExecBlocklistConfig>,
): ResolvedExecBlocklistConfig {
  const customPatterns: BlocklistPattern[] = [];
  if (config?.customPatterns) {
    for (const custom of config.customPatterns) {
      try {
        customPatterns.push({
          pattern: new RegExp(custom.pattern, "i"),
          category: custom.category ?? "destructive",
          reason: custom.reason ?? "Custom blocklist pattern",
        });
      } catch {
        log.warn("Invalid custom blocklist pattern", { pattern: custom.pattern });
      }
    }
  }

  const excludePatterns: RegExp[] = [];
  if (config?.excludePatterns) {
    for (const pattern of config.excludePatterns) {
      try {
        excludePatterns.push(new RegExp(pattern, "i"));
      } catch {
        log.warn("Invalid exclude pattern", { pattern });
      }
    }
  }

  return {
    enabled: config?.enabled ?? DEFAULT_CONFIG.enabled,
    extended: config?.extended ?? DEFAULT_CONFIG.extended,
    customPatterns,
    excludePatterns,
    logBlocked: config?.logBlocked ?? DEFAULT_CONFIG.logBlocked,
  };
}

/**
 * Check if a command matches any blocklist pattern.
 */
export function checkBlocklist(
  command: string,
  config?: Partial<ExecBlocklistConfig>,
): BlocklistMatch {
  const resolved = resolveExecBlocklistConfig(config);

  if (!resolved.enabled) {
    return { blocked: false };
  }

  // Check exclusions first
  for (const exclude of resolved.excludePatterns) {
    if (exclude.test(command)) {
      return { blocked: false };
    }
  }

  // Build active patterns list
  const patterns: BlocklistPattern[] = [...CORE_BLOCKLIST, ...resolved.customPatterns];
  if (resolved.extended) {
    patterns.push(...EXTENDED_BLOCKLIST);
  }

  // Check each pattern
  for (const { pattern, category, reason } of patterns) {
    if (pattern.test(command)) {
      if (resolved.logBlocked) {
        log.warn("Command blocked by blocklist", {
          category,
          reason,
          pattern: pattern.source,
        });
      }
      return {
        blocked: true,
        category,
        pattern: pattern.source,
        reason,
      };
    }
  }

  return { blocked: false };
}

/**
 * Quick check if command might match blocklist (for performance).
 * Returns true if full check is recommended.
 */
export function quickBlocklistCheck(command: string): boolean {
  const lowerCommand = command.toLowerCase();
  return (
    lowerCommand.includes("rm ") ||
    lowerCommand.includes("mkfs") ||
    lowerCommand.includes("dd ") ||
    lowerCommand.includes("chmod") ||
    lowerCommand.includes("chown") ||
    lowerCommand.includes("/etc/") ||
    lowerCommand.includes("sudo") ||
    lowerCommand.includes("nc ") ||
    lowerCommand.includes("netcat") ||
    lowerCommand.includes("/dev/tcp") ||
    lowerCommand.includes("/dev/sd") ||
    lowerCommand.includes("/dev/hd") ||
    lowerCommand.includes("insmod") ||
    lowerCommand.includes("modprobe") ||
    lowerCommand.includes("/boot/") ||
    lowerCommand.includes("crontab") ||
    lowerCommand.includes("systemctl")
  );
}

/**
 * Get all active blocklist patterns (for inspection/debugging).
 */
export function getActivePatterns(
  config?: Partial<ExecBlocklistConfig>,
): Array<{ pattern: string; category: BlocklistCategory; reason: string }> {
  const resolved = resolveExecBlocklistConfig(config);

  const patterns: BlocklistPattern[] = [...CORE_BLOCKLIST, ...resolved.customPatterns];
  if (resolved.extended) {
    patterns.push(...EXTENDED_BLOCKLIST);
  }

  return patterns.map(({ pattern, category, reason }) => ({
    pattern: pattern.source,
    category,
    reason,
  }));
}

/**
 * Get blocklist statistics.
 */
export function getBlocklistStats(config?: Partial<ExecBlocklistConfig>): {
  corePatterns: number;
  extendedPatterns: number;
  customPatterns: number;
  totalActive: number;
} {
  const resolved = resolveExecBlocklistConfig(config);
  return {
    corePatterns: CORE_BLOCKLIST.length,
    extendedPatterns: resolved.extended ? EXTENDED_BLOCKLIST.length : 0,
    customPatterns: resolved.customPatterns.length,
    totalActive:
      CORE_BLOCKLIST.length +
      (resolved.extended ? EXTENDED_BLOCKLIST.length : 0) +
      resolved.customPatterns.length,
  };
}
