/**
 * Discord Voice Channel Manager
 *
 * Manages multiple concurrent Discord voice channel connections.
 * Provides centralized tracking, metrics collection, and lifecycle management
 * for all active voice connections.
 *
 * Features:
 * - Track multiple concurrent voice channels
 * - Manage connections by guild+channel ID
 * - Collect aggregated metrics
 * - Graceful shutdown and cleanup
 * - Connection health monitoring
 */

import {
  DiscordVoiceChannelConnector,
  type VoiceChannelConfig,
  type VoiceConnectionStats,
  type UserTranscription,
} from './channel-connector.js';
import type { DeepgramExecutor } from '../../media/voice-providers/deepgram.js';

/**
 * Connection identifier (guild + channel)
 */
interface ConnectionId {
  guildId: string;
  channelId: string;
}

/**
 * Managed voice connection
 */
interface ManagedConnection {
  id: string;
  guildId: string;
  channelId: string;
  connector: DiscordVoiceChannelConnector;
  createdAt: number;
  lastActivity: number;
}

/**
 * Aggregated metrics across all connections
 */
export interface AggregatedMetrics {
  totalConnections: number;
  activeConnections: number;
  totalParticipants: number;
  totalBytesReceived: number;
  totalBytesSent: number;
  totalPacketsReceived: number;
  totalPacketsSent: number;
  averageConnectionTime: number;
  connections: VoiceConnectionStats[];
}

/**
 * Discord Voice Channel Manager
 *
 * Centralized manager for all Discord voice channel connections.
 */
export class DiscordVoiceChannelManager {
  private connections = new Map<string, ManagedConnection>();
  private sttProvider: DeepgramExecutor;
  private globalTranscriptionCallbacks = new Set<
    (transcription: UserTranscription) => void
  >();

  // Configuration
  private readonly maxConnections: number;
  private readonly idleTimeout: number;

  constructor(
    sttProvider: DeepgramExecutor,
    options: {
      maxConnections?: number;
      idleTimeout?: number; // milliseconds
    } = {},
  ) {
    this.sttProvider = sttProvider;
    this.maxConnections = options.maxConnections ?? 10;
    this.idleTimeout = options.idleTimeout ?? 3600000; // 1 hour default

    // Start idle connection cleanup
    this.startIdleCleanup();
  }

  /**
   * Join a voice channel
   */
  async join(config: VoiceChannelConfig): Promise<string> {
    const connectionId = this.getConnectionId(config.guildId, config.channelId);

    // Check if already connected
    if (this.connections.has(connectionId)) {
      throw new Error(
        `Already connected to channel ${config.channelId} in guild ${config.guildId}`,
      );
    }

    // Check connection limit
    if (this.connections.size >= this.maxConnections) {
      throw new Error(
        `Maximum connections (${this.maxConnections}) reached. Close some connections first.`,
      );
    }

    try {
      // Create connector
      const connector = new DiscordVoiceChannelConnector(
        config,
        this.sttProvider,
      );

      // Setup global transcription forwarding
      connector.onTranscription((transcription) => {
        this.handleTranscription(connectionId, transcription);
      });

      // Connect to voice channel
      await connector.connect();

      // Store managed connection
      const managed: ManagedConnection = {
        id: connectionId,
        guildId: config.guildId,
        channelId: config.channelId,
        connector,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      this.connections.set(connectionId, managed);

      console.log(
        `Manager: Joined voice channel ${config.channelId} in guild ${config.guildId} (ID: ${connectionId})`,
      );

      return connectionId;
    } catch (error) {
      throw new Error(
        `Failed to join voice channel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Leave a voice channel
   */
  async leave(guildId: string, channelId: string): Promise<void> {
    const connectionId = this.getConnectionId(guildId, channelId);
    const managed = this.connections.get(connectionId);

    if (!managed) {
      throw new Error(
        `Not connected to channel ${channelId} in guild ${guildId}`,
      );
    }

    try {
      await managed.connector.disconnect();
      this.connections.delete(connectionId);

      console.log(
        `Manager: Left voice channel ${channelId} in guild ${guildId}`,
      );
    } catch (error) {
      console.error(
        `Error leaving voice channel: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Still remove from map
      this.connections.delete(connectionId);
    }
  }

  /**
   * Leave all voice channels
   */
  async leaveAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    const connectionEntries = Array.from(this.connections.entries());
    for (const [connectionId, managed] of connectionEntries) {
      disconnectPromises.push(
        managed.connector
          .disconnect()
          .catch((error) =>
            console.error(
              `Error disconnecting ${connectionId}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ),
      );
    }

    await Promise.all(disconnectPromises);
    this.connections.clear();

    console.log('Manager: Left all voice channels');
  }

  /**
   * Get connection status for a specific channel
   */
  getStatus(guildId: string, channelId: string): VoiceConnectionStats | null {
    const connectionId = this.getConnectionId(guildId, channelId);
    const managed = this.connections.get(connectionId);

    if (!managed) {
      return null;
    }

    return managed.connector.getStats();
  }

  /**
   * Get aggregated metrics across all connections
   */
  getMetrics(): AggregatedMetrics {
    const connectionStats: VoiceConnectionStats[] = [];
    let totalParticipants = 0;
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    let totalPacketsReceived = 0;
    let totalPacketsSent = 0;
    let totalConnectionTime = 0;
    let activeConnections = 0;

    const managedList = Array.from(this.connections.values());
    for (const managed of managedList) {
      const stats = managed.connector.getStats();
      connectionStats.push(stats);

      if (stats.connected) {
        activeConnections++;
      }

      totalParticipants += stats.participants;
      totalBytesReceived += stats.bytesReceived;
      totalBytesSent += stats.bytesSent;
      totalPacketsReceived += stats.packetsReceived;
      totalPacketsSent += stats.packetsSent;
      totalConnectionTime += stats.connectionTime;
    }

    const averageConnectionTime =
      activeConnections > 0 ? totalConnectionTime / activeConnections : 0;

    return {
      totalConnections: this.connections.size,
      activeConnections,
      totalParticipants,
      totalBytesReceived,
      totalBytesSent,
      totalPacketsReceived,
      totalPacketsSent,
      averageConnectionTime,
      connections: connectionStats,
    };
  }

  /**
   * List all active connections
   */
  listConnections(): Array<{
    id: string;
    guildId: string;
    channelId: string;
    connected: boolean;
    participants: number;
    createdAt: number;
    lastActivity: number;
  }> {
    const result: Array<{
      id: string;
      guildId: string;
      channelId: string;
      connected: boolean;
      participants: number;
      createdAt: number;
      lastActivity: number;
    }> = [];

    const managedList = Array.from(this.connections.values());
    for (const managed of managedList) {
      const stats = managed.connector.getStats();
      result.push({
        id: managed.id,
        guildId: managed.guildId,
        channelId: managed.channelId,
        connected: stats.connected,
        participants: stats.participants,
        createdAt: managed.createdAt,
        lastActivity: managed.lastActivity,
      });
    }

    return result;
  }

  /**
   * Check if connected to a specific channel
   */
  isConnected(guildId: string, channelId: string): boolean {
    const connectionId = this.getConnectionId(guildId, channelId);
    const managed = this.connections.get(connectionId);
    return managed ? managed.connector.isConnected() : false;
  }

  /**
   * Register global transcription callback
   *
   * Will receive transcriptions from all voice channels
   */
  onTranscription(callback: (transcription: UserTranscription) => void): void {
    this.globalTranscriptionCallbacks.add(callback);
  }

  /**
   * Unregister global transcription callback
   */
  offTranscription(callback: (transcription: UserTranscription) => void): void {
    this.globalTranscriptionCallbacks.delete(callback);
  }

  /**
   * Shutdown manager and cleanup all connections
   */
  async shutdown(): Promise<void> {
    console.log('Manager: Shutting down...');
    await this.leaveAll();
    this.globalTranscriptionCallbacks.clear();
    console.log('Manager: Shutdown complete');
  }

  /**
   * Generate unique connection ID
   */
  private getConnectionId(guildId: string, channelId: string): string {
    return `${guildId}:${channelId}`;
  }

  /**
   * Handle transcription from any connection
   */
  private handleTranscription(
    connectionId: string,
    transcription: UserTranscription,
  ): void {
    // Update last activity
    const managed = this.connections.get(connectionId);
    if (managed) {
      managed.lastActivity = Date.now();
    }

    // Forward to global callbacks
    const callbacks = Array.from(this.globalTranscriptionCallbacks);
    for (const callback of callbacks) {
      callback(transcription);
    }
  }

  /**
   * Start idle connection cleanup
   */
  private startIdleCleanup(): void {
    setInterval(
      () => {
        const now = Date.now();
        const toRemove: string[] = [];

        const connectionEntries = Array.from(this.connections.entries());
        for (const [connectionId, managed] of connectionEntries) {
          const idleTime = now - managed.lastActivity;
          if (idleTime > this.idleTimeout) {
            console.log(
              `Cleaning up idle connection ${connectionId} (idle for ${Math.floor(idleTime / 1000)}s)`,
            );
            toRemove.push(connectionId);
          }
        }

        // Cleanup idle connections
        for (const connectionId of toRemove) {
          const managed = this.connections.get(connectionId);
          if (managed) {
            managed.connector.disconnect().catch((error) => {
              console.error(`Error disconnecting ${connectionId}: ${error}`);
            });
            this.connections.delete(connectionId);
          }
        }
      },
      60000,
    ); // Check every minute
  }
}

export default DiscordVoiceChannelManager;
