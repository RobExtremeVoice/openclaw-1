/**
 * Discord Direct Call Manager
 *
 * Manages active direct calls, tracks call state, and provides
 * methods for initiating, accepting, declining, and ending calls.
 *
 * Features:
 * - Call state tracking by user ID
 * - Active call management (max concurrent calls)
 * - Call history and logging
 * - Auto-cleanup of stale calls
 * - Statistics and reporting
 */

import { DiscordDirectCallConnector, CallState, type DirectCallConfig, type CallStats } from './direct-call-connector.js';
import type { DeepgramExecutor } from '../../media/voice-providers/deepgram.js';
import { getChildLogger } from '../../logging.js';

const logger = getChildLogger({ module: 'discord-call-manager' });

/**
 * Call record for tracking active and completed calls
 */
export interface CallRecord {
  userId: string;
  channelId: string;
  state: CallState;
  connector?: DiscordDirectCallConnector;
  startTime: number;
  endTime?: number;
  duration?: number;
  initiatedBy: 'user' | 'bot';
  stats?: CallStats;
}

/**
 * Call manager configuration
 */
export interface CallManagerConfig {
  /** Maximum concurrent calls (default: 5) */
  maxConcurrentCalls?: number;

  /** Auto-accept incoming calls (default: false) */
  autoAcceptCalls?: boolean;

  /** Call timeout in milliseconds (default: 30000 = 30s) */
  callTimeout?: number;

  /** Maximum call duration in milliseconds (default: 3600000 = 1 hour) */
  maxCallDuration?: number;

  /** Cleanup interval for stale calls in milliseconds (default: 60000 = 1 minute) */
  cleanupInterval?: number;

  /** Keep call history for this many milliseconds (default: 86400000 = 24 hours) */
  historyRetention?: number;
}

/**
 * Discord Direct Call Manager
 *
 * Central manager for all direct voice calls.
 */
export class DiscordCallManager {
  private config: Required<CallManagerConfig>;
  private activeCalls = new Map<string, CallRecord>();
  private callHistory: CallRecord[] = [];
  private sttProvider: DeepgramExecutor;
  private cleanupInterval?: NodeJS.Timeout;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<CallManagerConfig> = {
    maxConcurrentCalls: 5,
    autoAcceptCalls: false,
    callTimeout: 30000, // 30 seconds
    maxCallDuration: 3600000, // 1 hour
    cleanupInterval: 60000, // 1 minute
    historyRetention: 86400000, // 24 hours
  };

  constructor(config: CallManagerConfig, sttProvider: DeepgramExecutor) {
    this.config = { ...DiscordCallManager.DEFAULT_CONFIG, ...config };
    this.sttProvider = sttProvider;

    // Start cleanup interval
    this.startCleanupInterval();

    logger.info({ config: this.config }, 'Call manager initialized');
  }

  /**
   * Initiate an outgoing call to a user
   */
  async initiateCall(params: {
    userId: string;
    channelId: string;
    adapterCreator: any;
  }): Promise<DiscordDirectCallConnector> {
    const { userId, channelId, adapterCreator } = params;

    // Check if call already exists
    if (this.activeCalls.has(userId)) {
      const existing = this.activeCalls.get(userId)!;
      throw new Error(
        `Call already exists for user ${userId} in state ${existing.state}`,
      );
    }

    // Check concurrent call limit
    const activeCallCount = this.getActiveCalls().length;
    if (activeCallCount >= this.config.maxConcurrentCalls) {
      throw new Error(
        `Maximum concurrent calls reached (${this.config.maxConcurrentCalls})`,
      );
    }

    logger.info({ userId, channelId }, 'Initiating outgoing call');

    // Create call connector
    const callConfig: DirectCallConfig = {
      userId,
      channelId,
      adapterCreator,
      autoAccept: false, // Outgoing calls don't need auto-accept
      callTimeout: this.config.callTimeout,
      maxCallDuration: this.config.maxCallDuration,
    };

    const connector = new DiscordDirectCallConnector(callConfig, this.sttProvider);

    // Create call record
    const record: CallRecord = {
      userId,
      channelId,
      state: CallState.RINGING,
      connector,
      startTime: Date.now(),
      initiatedBy: 'bot',
    };

    this.activeCalls.set(userId, record);

    try {
      // Initiate the call
      await connector.initiateCall();

      // Update record
      record.state = connector.getState();

      return connector;
    } catch (error) {
      // Remove from active calls on failure
      this.activeCalls.delete(userId);
      throw error;
    }
  }

  /**
   * Accept an incoming call from a user
   */
  async acceptCall(params: {
    userId: string;
    channelId: string;
    adapterCreator: any;
  }): Promise<DiscordDirectCallConnector> {
    const { userId, channelId, adapterCreator } = params;

    logger.info({ userId, channelId }, 'Accepting incoming call');

    // Check if call already exists
    let existingRecord = this.activeCalls.get(userId);

    // If no existing record, create a new one
    if (!existingRecord) {
      // Check concurrent call limit
      const activeCallCount = this.getActiveCalls().length;
      if (activeCallCount >= this.config.maxConcurrentCalls) {
        throw new Error(
          `Maximum concurrent calls reached (${this.config.maxConcurrentCalls})`,
        );
      }

      // Create call connector
      const callConfig: DirectCallConfig = {
        userId,
        channelId,
        adapterCreator,
        autoAccept: this.config.autoAcceptCalls,
        callTimeout: this.config.callTimeout,
        maxCallDuration: this.config.maxCallDuration,
      };

      const connector = new DiscordDirectCallConnector(callConfig, this.sttProvider);

      // Create call record
      existingRecord = {
        userId,
        channelId,
        state: CallState.RINGING,
        connector,
        startTime: Date.now(),
        initiatedBy: 'user',
      };

      this.activeCalls.set(userId, existingRecord);
    }

    try {
      // Accept the call
      await existingRecord.connector!.acceptCall();

      // Update record
      existingRecord.state = existingRecord.connector!.getState();

      return existingRecord.connector!;
    } catch (error) {
      // Remove from active calls on failure
      this.activeCalls.delete(userId);
      throw error;
    }
  }

  /**
   * Decline an incoming call
   */
  async declineCall(userId: string): Promise<void> {
    const record = this.activeCalls.get(userId);
    if (!record) {
      throw new Error(`No active call found for user ${userId}`);
    }

    if (record.state !== CallState.RINGING) {
      throw new Error(
        `Cannot decline call in state ${record.state}`,
      );
    }

    logger.info({ userId }, 'Declining incoming call');

    try {
      await record.connector!.declineCall();

      // Update record
      record.state = CallState.DECLINED;
      record.endTime = Date.now();
      record.duration = record.endTime - record.startTime;

      // Move to history
      this.moveToHistory(userId);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to decline call',
      );
      throw error;
    }
  }

  /**
   * End an active call
   */
  async endCall(userId: string): Promise<void> {
    const record = this.activeCalls.get(userId);
    if (!record) {
      throw new Error(`No active call found for user ${userId}`);
    }

    logger.info({ userId, state: record.state }, 'Ending call');

    try {
      await record.connector!.endCall();

      // Update record
      record.state = CallState.ENDED;
      record.endTime = Date.now();
      record.duration = record.endTime - record.startTime;
      record.stats = record.connector!.getStats();

      // Move to history
      this.moveToHistory(userId);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to end call',
      );
      throw error;
    }
  }

  /**
   * Get active call connector for a user
   */
  getCall(userId: string): DiscordDirectCallConnector | undefined {
    return this.activeCalls.get(userId)?.connector;
  }

  /**
   * Check if user has an active call
   */
  hasActiveCall(userId: string): boolean {
    const record = this.activeCalls.get(userId);
    return record !== undefined && record.state === CallState.CONNECTED;
  }

  /**
   * Get call state for a user
   */
  getCallState(userId: string): CallState | undefined {
    return this.activeCalls.get(userId)?.state;
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): CallRecord[] {
    return Array.from(this.activeCalls.values()).filter(
      (record) => record.state === CallState.CONNECTED || record.state === CallState.RINGING,
    );
  }

  /**
   * Get call statistics for a user
   */
  getCallStats(userId: string): CallStats | undefined {
    const record = this.activeCalls.get(userId);
    return record?.connector?.getStats();
  }

  /**
   * Get call history
   */
  getCallHistory(params?: {
    userId?: string;
    limit?: number;
    since?: number;
  }): CallRecord[] {
    let history = [...this.callHistory];

    // Filter by user ID
    if (params?.userId) {
      history = history.filter((record) => record.userId === params.userId);
    }

    // Filter by time
    if (params?.since) {
      history = history.filter((record) => record.startTime >= params.since!);
    }

    // Sort by start time (most recent first)
    history.sort((a, b) => b.startTime - a.startTime);

    // Limit results
    if (params?.limit && params.limit > 0) {
      history = history.slice(0, params.limit);
    }

    return history;
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    activeCalls: number;
    totalCalls: number;
    averageDuration: number;
    maxConcurrent: number;
    historySize: number;
  } {
    const activeCalls = this.getActiveCalls().length;
    const totalCalls = this.activeCalls.size + this.callHistory.length;

    // Calculate average call duration from history
    const completedCalls = this.callHistory.filter((r) => r.duration !== undefined);
    const averageDuration =
      completedCalls.length > 0
        ? completedCalls.reduce((sum, r) => sum + (r.duration || 0), 0) /
          completedCalls.length
        : 0;

    return {
      activeCalls,
      totalCalls,
      averageDuration,
      maxConcurrent: this.config.maxConcurrentCalls,
      historySize: this.callHistory.length,
    };
  }

  /**
   * Move call record to history
   */
  private moveToHistory(userId: string): void {
    const record = this.activeCalls.get(userId);
    if (!record) return;

    // Remove connector reference to prevent memory leaks
    delete record.connector;

    // Add to history
    this.callHistory.push(record);

    // Remove from active calls
    this.activeCalls.delete(userId);

    logger.debug(
      {
        userId,
        state: record.state,
        duration: record.duration,
      },
      'Moved call to history',
    );
  }

  /**
   * Start cleanup interval for stale calls and old history
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup stale calls and old history
   */
  private cleanup(): void {
    const now = Date.now();

    // Cleanup stale active calls
    for (const [userId, record] of this.activeCalls.entries()) {
      // End calls that have exceeded max duration
      if (
        record.state === CallState.CONNECTED &&
        now - record.startTime > this.config.maxCallDuration
      ) {
        logger.warn(
          { userId, duration: now - record.startTime },
          'Force-ending call that exceeded max duration',
        );
        this.endCall(userId).catch((error) => {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              userId,
            },
            'Failed to force-end call',
          );
        });
      }

      // Cleanup failed/timeout calls
      if (
        record.state === CallState.FAILED ||
        record.state === CallState.TIMEOUT
      ) {
        this.moveToHistory(userId);
      }
    }

    // Cleanup old call history
    const cutoffTime = now - this.config.historyRetention;
    const beforeSize = this.callHistory.length;
    this.callHistory = this.callHistory.filter(
      (record) => record.startTime >= cutoffTime,
    );
    const removedCount = beforeSize - this.callHistory.length;

    if (removedCount > 0) {
      logger.debug({ removedCount }, 'Cleaned up old call history');
    }
  }

  /**
   * Shutdown the call manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down call manager');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // End all active calls
    const endPromises = Array.from(this.activeCalls.keys()).map((userId) =>
      this.endCall(userId).catch((error) => {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            userId,
          },
          'Failed to end call during shutdown',
        );
      }),
    );

    await Promise.all(endPromises);

    this.activeCalls.clear();
    this.callHistory = [];

    logger.info('Call manager shutdown complete');
  }
}

export default DiscordCallManager;
