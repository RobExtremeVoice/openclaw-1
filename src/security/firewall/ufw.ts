/**
 * ufw (Uncomplicated Firewall) backend
 * Requires sudo capability
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { FirewallBackendInterface } from "./types.js";

const execAsync = promisify(exec);

const RULE_COMMENT = "openclaw-blocklist";

export class UfwBackend implements FirewallBackendInterface {
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("which ufw");
      return true;
    } catch {
      return false;
    }
  }

  async blockIp(ip: string): Promise<{ ok: boolean; error?: string }> {
    try {
      // Check if already blocked
      const alreadyBlocked = await this.isIpBlocked(ip);
      if (alreadyBlocked) {
        return { ok: true };
      }

      // Add deny rule with comment
      await execAsync(`ufw insert 1 deny from ${ip} comment '${RULE_COMMENT}'`);

      return { ok: true };
    } catch (err) {
      const error = String(err);
      if (error.includes("Permission denied") || error.includes("need to be root")) {
        return {
          ok: false,
          error: "Insufficient permissions (requires sudo)",
        };
      }
      return { ok: false, error };
    }
  }

  async unblockIp(ip: string): Promise<{ ok: boolean; error?: string }> {
    try {
      // Delete deny rule
      try {
        await execAsync(`ufw delete deny from ${ip}`);
      } catch {
        // Rule might not exist, that's okay
      }

      return { ok: true };
    } catch (err) {
      const error = String(err);
      if (error.includes("Permission denied") || error.includes("need to be root")) {
        return {
          ok: false,
          error: "Insufficient permissions (requires sudo)",
        };
      }
      return { ok: false, error };
    }
  }

  async listBlockedIps(): Promise<string[]> {
    try {
      const { stdout } = await execAsync("ufw status numbered");
      const ips: string[] = [];

      // Parse ufw output
      const lines = stdout.split("\n");
      for (const line of lines) {
        // Look for DENY rules with our comment
        if (line.includes("DENY") && line.includes(RULE_COMMENT)) {
          // Extract IP from line like: "[ 1] DENY IN    192.168.1.100"
          const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match && match[1]) {
            ips.push(match[1]);
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
