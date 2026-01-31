/**
 * iptables firewall backend
 * Requires sudo/CAP_NET_ADMIN capability
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { FirewallBackendInterface } from "./types.js";

const execAsync = promisify(exec);

const CHAIN_NAME = "OPENCLAW_BLOCKLIST";
const COMMENT_PREFIX = "openclaw-block";

export class IptablesBackend implements FirewallBackendInterface {
  private initialized = false;

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("which iptables");
      return true;
    } catch {
      return false;
    }
  }

  private async ensureChain(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if chain exists
      await execAsync(`iptables -L ${CHAIN_NAME} -n 2>/dev/null`);
    } catch {
      // Create chain if it doesn't exist
      try {
        await execAsync(`iptables -N ${CHAIN_NAME}`);
        // Insert chain into INPUT at the beginning
        await execAsync(`iptables -I INPUT -j ${CHAIN_NAME}`);
      } catch (err) {
        throw new Error(`Failed to create iptables chain: ${String(err)}`);
      }
    }

    this.initialized = true;
  }

  async blockIp(ip: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureChain();

      // Check if already blocked
      const alreadyBlocked = await this.isIpBlocked(ip);
      if (alreadyBlocked) {
        return { ok: true };
      }

      // Add block rule with comment
      const comment = `${COMMENT_PREFIX}:${ip}`;
      await execAsync(
        `iptables -A ${CHAIN_NAME} -s ${ip} -j DROP -m comment --comment "${comment}"`,
      );

      return { ok: true };
    } catch (err) {
      const error = String(err);
      if (error.includes("Permission denied") || error.includes("Operation not permitted")) {
        return {
          ok: false,
          error: "Insufficient permissions (requires sudo or CAP_NET_ADMIN)",
        };
      }
      return { ok: false, error };
    }
  }

  async unblockIp(ip: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureChain();

      // Delete all rules matching this IP
      const comment = `${COMMENT_PREFIX}:${ip}`;
      try {
        await execAsync(
          `iptables -D ${CHAIN_NAME} -s ${ip} -j DROP -m comment --comment "${comment}"`,
        );
      } catch {
        // Rule might not exist, that's okay
      }

      return { ok: true };
    } catch (err) {
      const error = String(err);
      if (error.includes("Permission denied") || error.includes("Operation not permitted")) {
        return {
          ok: false,
          error: "Insufficient permissions (requires sudo or CAP_NET_ADMIN)",
        };
      }
      return { ok: false, error };
    }
  }

  async listBlockedIps(): Promise<string[]> {
    try {
      await this.ensureChain();

      const { stdout } = await execAsync(`iptables -L ${CHAIN_NAME} -n --line-numbers`);
      const ips: string[] = [];

      // Parse iptables output
      const lines = stdout.split("\n");
      for (const line of lines) {
        // Look for DROP rules with our comment
        if (line.includes("DROP") && line.includes(COMMENT_PREFIX)) {
          const parts = line.trim().split(/\s+/);
          // Source IP is typically in column 4 (after num, target, prot)
          const sourceIp = parts[3];
          if (sourceIp && sourceIp !== "0.0.0.0/0" && sourceIp !== "anywhere") {
            ips.push(sourceIp);
          }
        }
      }

      return ips;
    } catch {
      return [];
    }
  }

  async isIpBlocked(ip: string): Promise<boolean> {
    try {
      const blockedIps = await this.listBlockedIps();
      return blockedIps.includes(ip);
    } catch {
      return false;
    }
  }
}
