import { loadConfig } from "../config/config.js";
import {
  loadCombinedSessionStoreForGateway,
  resolveGatewaySessionStoreTarget,
  updateSessionStore,
} from "../config/sessions.js";

export interface SessionTTLConfig {
  /**
   * Idle time in seconds before a session is eligible for cleanup
   * Default: 3600 (1 hour)
   */
  idle?: number;

  /**
   * Maximum age in seconds regardless of activity
   * Default: 86400 (24 hours)
   */
  maxAge?: number;

  /**
   * How often to run the cleanup process (in seconds)
   * Default: 300 (5 minutes)
   */
  cleanupInterval?: number;

  /**
   * Exclude certain session patterns from cleanup
   * Example: ['main', 'persistent:*']
   */
  exclude?: string[];
}

export class SessionTTLManager {
  private config: Required<SessionTTLConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: SessionTTLConfig = {}) {
    this.config = {
      idle: config.idle ?? 3600,
      maxAge: config.maxAge ?? 86400,
      cleanupInterval: config.cleanupInterval ?? 300,
      exclude: config.exclude ?? ["main"],
    };
  }

  start(): void {
    if (this.cleanupTimer) {
      console.warn("[SessionTTL] Cleanup already running");
      return;
    }

    console.log("[SessionTTL] Starting automatic session cleanup", {
      idleSeconds: this.config.idle,
      maxAgeSeconds: this.config.maxAge,
      intervalSeconds: this.config.cleanupInterval,
    });

    this.cleanup().catch((err) => console.error("[SessionTTL] Cleanup failed on start:", err));

    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => console.error("[SessionTTL] Cleanup failed:", err));
    }, this.config.cleanupInterval * 1000);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log("[SessionTTL] Stopped automatic session cleanup");
    }
  }

  async cleanup(): Promise<void> {
    if (this.isRunning) {
      console.log("[SessionTTL] Cleanup already in progress, skipping");
      return;
    }
    this.isRunning = true;

    try {
      const cfg = loadConfig();
      const { store } = loadCombinedSessionStoreForGateway(cfg);
      const now = Date.now();
      const toDeleteByStore = new Map<string, string[]>();

      let eligibleCount = 0;

      for (const [key, session] of Object.entries(store)) {
        if (this.shouldCleanup(key, session, now)) {
          eligibleCount++;
          // Resolve the physical store path for this session
          const { storePath, canonicalKey } = resolveGatewaySessionStoreTarget({
            cfg,
            key,
          });

          if (!toDeleteByStore.has(storePath)) {
            toDeleteByStore.set(storePath, []);
          }
          toDeleteByStore.get(storePath)!.push(canonicalKey);
        }
      }

      if (eligibleCount > 0) {
        console.log(
          `[SessionTTL] Found ${eligibleCount} sessions eligible for cleanup across ${toDeleteByStore.size} stores`,
        );

        for (const [storePath, keys] of toDeleteByStore.entries()) {
          try {
            await updateSessionStore(storePath, (params) => {
              let deleted = 0;
              for (const key of keys) {
                if (params[key]) {
                  delete params[key];
                  deleted++;
                }
              }
              if (deleted > 0) {
                console.log(`[SessionTTL] Removed ${deleted} sessions from ${storePath}`);
              }
              return params;
            });
          } catch (err) {
            console.error(`[SessionTTL] Failed to clean up store ${storePath}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[SessionTTL] Cleanup failed:", err);
    } finally {
      this.isRunning = false;
    }
  }

  private shouldCleanup(
    sessionKey: string,
    session: { createdAt?: number; updatedAt?: number },
    now: number,
  ): boolean {
    if (this.isExcluded(sessionKey)) {
      return false;
    }

    // Default to 0 if missing, though typically they should exist.
    // Use updatedAt as a proxy for both creation and activity if one is missing,
    // assuming last write was last activity.
    const createdAt = session.createdAt ?? session.updatedAt ?? 0;
    const lastActivityAt = session.updatedAt ?? session.createdAt ?? 0;

    const ageMs = now - createdAt;
    const idleMs = now - lastActivityAt;

    if (createdAt > 0 && ageMs > this.config.maxAge * 1000) {
      // debug log only if verbose?
      return true;
    }

    if (lastActivityAt > 0 && idleMs > this.config.idle * 1000) {
      return true;
    }

    return false;
  }

  private isExcluded(sessionId: string): boolean {
    return this.config.exclude.some((pattern) => {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return sessionId.startsWith(prefix);
      }
      return sessionId === pattern;
    });
  }
}
