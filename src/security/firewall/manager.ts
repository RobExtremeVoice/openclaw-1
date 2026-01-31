/**
 * Firewall manager
 * Coordinates firewall backends and integrates with IP manager
 */

import os from "node:os";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { FirewallBackendInterface, FirewallManagerConfig } from "./types.js";
import { IptablesBackend } from "./iptables.js";
import { UfwBackend } from "./ufw.js";

const log = createSubsystemLogger("security:firewall");

export class FirewallManager {
  private backend: FirewallBackendInterface | null = null;
  private config: FirewallManagerConfig;
  private backendAvailable = false;

  constructor(config: FirewallManagerConfig) {
    this.config = config;
  }

  /**
   * Initialize firewall backend
   */
  async initialize(): Promise<{ ok: boolean; error?: string }> {
    // Only enable on Linux
    if (os.platform() !== "linux") {
      log.info("firewall integration only supported on Linux");
      return { ok: false, error: "unsupported_platform" };
    }

    if (!this.config.enabled) {
      log.info("firewall integration disabled");
      return { ok: false, error: "disabled" };
    }

    // Create backend
    if (this.config.backend === "iptables") {
      this.backend = new IptablesBackend();
    } else if (this.config.backend === "ufw") {
      this.backend = new UfwBackend();
    } else {
      return { ok: false, error: `unknown backend: ${String(this.config.backend)}` };
    }

    // Check availability
    const available = await this.backend.isAvailable();
    if (!available) {
      log.warn(`firewall backend ${this.config.backend} not available`);
      return { ok: false, error: "backend_not_available" };
    }

    this.backendAvailable = true;
    log.info(`firewall integration active (backend=${this.config.backend})`);
    return { ok: true };
  }

  /**
   * Check if firewall integration is enabled and available
   */
  isEnabled(): boolean {
    return this.config.enabled && this.backendAvailable && this.backend !== null;
  }

  /**
   * Block an IP address
   */
  async blockIp(ip: string, reason: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled() || !this.backend) {
      return { ok: false, error: "firewall_not_enabled" };
    }

    if (this.config.dryRun) {
      log.info(`[dry-run] would block IP ${ip} (reason: ${reason})`);
      return { ok: true };
    }

    log.info(`blocking IP ${ip} via ${this.config.backend} (reason: ${reason})`);
    const result = await this.backend.blockIp(ip);

    if (!result.ok) {
      log.error(`failed to block IP ${ip}: ${result.error}`);
    }

    return result;
  }

  /**
   * Unblock an IP address
   */
  async unblockIp(ip: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled() || !this.backend) {
      return { ok: false, error: "firewall_not_enabled" };
    }

    if (this.config.dryRun) {
      log.info(`[dry-run] would unblock IP ${ip}`);
      return { ok: true };
    }

    log.info(`unblocking IP ${ip} via ${this.config.backend}`);
    const result = await this.backend.unblockIp(ip);

    if (!result.ok) {
      log.error(`failed to unblock IP ${ip}: ${result.error}`);
    }

    return result;
  }

  /**
   * List all blocked IPs
   */
  async listBlockedIps(): Promise<string[]> {
    if (!this.isEnabled() || !this.backend) {
      return [];
    }

    return await this.backend.listBlockedIps();
  }

  /**
   * Check if an IP is blocked
   */
  async isIpBlocked(ip: string): Promise<boolean> {
    if (!this.isEnabled() || !this.backend) {
      return false;
    }

    return await this.backend.isIpBlocked(ip);
  }

  /**
   * Synchronize blocklist with firewall
   * Adds missing blocks and removes stale blocks
   */
  async synchronize(blocklist: string[]): Promise<{
    added: number;
    removed: number;
    errors: string[];
  }> {
    if (!this.isEnabled() || !this.backend) {
      return { added: 0, removed: 0, errors: ["firewall_not_enabled"] };
    }

    const currentBlocks = await this.listBlockedIps();
    const desiredBlocks = new Set(blocklist);
    const currentSet = new Set(currentBlocks);

    let added = 0;
    let removed = 0;
    const errors: string[] = [];

    // Add missing blocks
    for (const ip of blocklist) {
      if (!currentSet.has(ip)) {
        const result = await this.blockIp(ip, "sync");
        if (result.ok) {
          added++;
        } else {
          errors.push(`Failed to block ${ip}: ${result.error}`);
        }
      }
    }

    // Remove stale blocks
    for (const ip of currentBlocks) {
      if (!desiredBlocks.has(ip)) {
        const result = await this.unblockIp(ip);
        if (result.ok) {
          removed++;
        } else {
          errors.push(`Failed to unblock ${ip}: ${result.error}`);
        }
      }
    }

    if (added > 0 || removed > 0) {
      log.info(`firewall sync: added=${added} removed=${removed}`);
    }

    if (errors.length > 0) {
      log.error(`firewall sync errors: ${errors.join(", ")}`);
    }

    return { added, removed, errors };
  }
}

/**
 * Singleton firewall manager
 */
let firewallManager: FirewallManager | null = null;

/**
 * Initialize firewall manager with config
 */
export async function initFirewallManager(config: FirewallManagerConfig): Promise<FirewallManager> {
  firewallManager = new FirewallManager(config);
  await firewallManager.initialize();
  return firewallManager;
}

/**
 * Get firewall manager instance
 */
export function getFirewallManager(): FirewallManager | null {
  return firewallManager;
}
