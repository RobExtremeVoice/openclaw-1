/**
 * Call Cleanup Scheduler abstraction for testable timeout management.
 *
 * Decouples setTimeout logic from CallManager for better testability:
 * - Production: DefaultCallCleanupScheduler uses real timers
 * - Tests: SyncCallCleanupScheduler runs synchronously for deterministic testing
 */

import type { CallId } from "./types.js";

/**
 * Interface for scheduling and canceling call cleanup tasks.
 * Enables injection of different scheduler implementations for testing.
 */
export interface CallCleanupScheduler {
  /**
   * Schedule a cleanup task to run after delay.
   * The callback may return a Promise for async operations (e.g., ending a call).
   * @param callId - Call identifier
   * @param delayMs - Delay in milliseconds
   * @param onTimeout - Callback to invoke after delay (may be async)
   */
  schedule(callId: CallId, delayMs: number, onTimeout: () => void | Promise<void>): void;

  /**
   * Cancel a scheduled cleanup task.
   * @param callId - Call identifier
   */
  cancel(callId: CallId): void;
}

/**
 * Production implementation using Node.js setTimeout.
 * Real timers, suitable for production environments.
 */
export class DefaultCallCleanupScheduler implements CallCleanupScheduler {
  private timers = new Map<CallId, NodeJS.Timeout>();

  schedule(callId: CallId, delayMs: number, onTimeout: () => void | Promise<void>): void {
    // Clear any existing timer for this call
    this.cancel(callId);

    const timer = setTimeout(() => {
      this.timers.delete(callId);
      // Call the timeout handler - it may return a Promise
      // We don't await it here; let the event loop handle it
      onTimeout();
    }, delayMs);

    this.timers.set(callId, timer);
  }

  cancel(callId: CallId): void {
    const timer = this.timers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(callId);
    }
  }
}

/**
 * Synchronous test implementation for deterministic testing.
 * Allows manual triggering of timeouts via triggerTimeout().
 * Useful for testing cleanup logic without real delays.
 *
 * Supports both sync and async callbacks:
 * - triggerTimeout() runs callback synchronously and returns before async work completes
 * - triggerTimeoutAsync() awaits any Promises returned by the callback
 */
export class SyncCallCleanupScheduler implements CallCleanupScheduler {
  private scheduled = new Map<CallId, () => void | Promise<void>>();

  schedule(callId: CallId, delayMs: number, onTimeout: () => void | Promise<void>): void {
    // In sync mode, just store the callback (don't use delayMs)
    this.scheduled.set(callId, onTimeout);
  }

  cancel(callId: CallId): void {
    this.scheduled.delete(callId);
  }

  /**
   * Trigger a scheduled timeout manually (for testing).
   * Runs the callback synchronously - does NOT await Promises.
   * For tests that need to await async operations, use triggerTimeoutAsync().
   * @param callId - Call identifier
   * @returns true if callback was triggered, false if no scheduled callback
   */
  triggerTimeout(callId: CallId): boolean {
    const callback = this.scheduled.get(callId);
    if (!callback) return false;

    this.scheduled.delete(callId);
    callback();
    return true;
  }

  /**
   * Trigger a scheduled timeout and await any async operations (for testing).
   * @param callId - Call identifier
   * @returns Promise that resolves when callback completes (including any async work)
   */
  async triggerTimeoutAsync(callId: CallId): Promise<boolean> {
    const callback = this.scheduled.get(callId);
    if (!callback) return false;

    this.scheduled.delete(callId);
    const result = callback();
    // If the callback returned a Promise, await it
    if (result instanceof Promise) {
      await result;
    }
    return true;
  }

  /**
   * Get list of all scheduled calls.
   */
  getScheduled(): CallId[] {
    return Array.from(this.scheduled.keys());
  }

  /**
   * Clear all scheduled callbacks.
   */
  reset(): void {
    this.scheduled.clear();
  }
}
