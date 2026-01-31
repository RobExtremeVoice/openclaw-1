/**
 * Firewall integration types
 */

export type FirewallBackend = "iptables" | "ufw";

export interface FirewallRule {
  ip: string;
  action: "block" | "allow";
  reason: string;
  createdAt: string;
}

export interface FirewallBackendInterface {
  /**
   * Check if this backend is available on the system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Block an IP address
   */
  blockIp(ip: string): Promise<{ ok: boolean; error?: string }>;

  /**
   * Unblock an IP address
   */
  unblockIp(ip: string): Promise<{ ok: boolean; error?: string }>;

  /**
   * List all blocked IPs managed by this system
   */
  listBlockedIps(): Promise<string[]>;

  /**
   * Check if an IP is blocked
   */
  isIpBlocked(ip: string): Promise<boolean>;
}

export interface FirewallManagerConfig {
  enabled: boolean;
  backend: FirewallBackend;
  dryRun?: boolean;
}
