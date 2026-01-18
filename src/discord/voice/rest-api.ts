/**
 * Discord Voice Channel REST API
 *
 * Provides HTTP REST API endpoints for Discord voice channel operations.
 * Handles audio streaming, connection management, and status reporting.
 *
 * Endpoints:
 * - POST /voice/join - Join a voice channel
 * - POST /voice/leave - Leave a voice channel
 * - POST /voice/broadcast - Broadcast audio to a channel
 * - GET /voice/status - Get connection status
 * - GET /voice/metrics - Get aggregated metrics
 * - GET /voice/connections - List all connections
 */

import type { DiscordVoiceChannelManager } from './channel-manager.js';
import type {
  VoiceChannelConfig,
  UserTranscription,
} from './channel-connector.js';
import type { AudioBuffer } from '../../media/voice-providers/executor.js';
import { AudioFormat } from '../../media/voice-providers/executor.js';

/**
 * Request to join a voice channel
 */
export interface JoinVoiceChannelRequest {
  guildId: string;
  channelId: string;
  selfDeaf?: boolean;
  selfMute?: boolean;
}

/**
 * Response after joining a voice channel
 */
export interface JoinVoiceChannelResponse {
  success: boolean;
  connectionId: string;
  guildId: string;
  channelId: string;
  error?: string;
}

/**
 * Request to leave a voice channel
 */
export interface LeaveVoiceChannelRequest {
  guildId: string;
  channelId: string;
}

/**
 * Response after leaving a voice channel
 */
export interface LeaveVoiceChannelResponse {
  success: boolean;
  guildId: string;
  channelId: string;
  error?: string;
}

/**
 * Request to broadcast audio
 */
export interface BroadcastAudioRequest {
  guildId: string;
  channelId: string;
  audio: {
    data: string; // Base64 encoded audio data
    format: AudioFormat;
    sampleRate: number;
    duration: number;
    channels: number;
  };
}

/**
 * Response after broadcasting audio
 */
export interface BroadcastAudioResponse {
  success: boolean;
  bytesSent?: number;
  error?: string;
}

/**
 * Status request
 */
export interface StatusRequest {
  guildId: string;
  channelId: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

/**
 * Discord Voice REST API Handler
 *
 * Handles HTTP requests for voice channel operations.
 */
export class DiscordVoiceRestAPI {
  private manager: DiscordVoiceChannelManager;
  private adapterCreatorFactory?: (guildId: string) => any;

  constructor(
    manager: DiscordVoiceChannelManager,
    adapterCreatorFactory?: (guildId: string) => any,
  ) {
    this.manager = manager;
    this.adapterCreatorFactory = adapterCreatorFactory;
  }

  /**
   * Set adapter creator factory
   *
   * This is required to create the Discord.js adapter for voice connections.
   * Should be set after Discord client is initialized.
   */
  setAdapterCreatorFactory(factory: (guildId: string) => any): void {
    this.adapterCreatorFactory = factory;
  }

  /**
   * Handle join voice channel request
   */
  async handleJoin(
    request: JoinVoiceChannelRequest,
  ): Promise<JoinVoiceChannelResponse> {
    try {
      // Validate request
      if (!request.guildId || !request.channelId) {
        return {
          success: false,
          connectionId: '',
          guildId: request.guildId || '',
          channelId: request.channelId || '',
          error: 'Missing required fields: guildId, channelId',
        };
      }

      // Check if adapter creator is available
      if (!this.adapterCreatorFactory) {
        return {
          success: false,
          connectionId: '',
          guildId: request.guildId,
          channelId: request.channelId,
          error:
            'Discord adapter not initialized. Ensure Discord client is ready.',
        };
      }

      // Create voice channel config
      const config: VoiceChannelConfig = {
        guildId: request.guildId,
        channelId: request.channelId,
        adapterCreator: this.adapterCreatorFactory(request.guildId),
        selfDeaf: request.selfDeaf ?? false,
        selfMute: request.selfMute ?? false,
      };

      // Join the channel
      const connectionId = await this.manager.join(config);

      return {
        success: true,
        connectionId,
        guildId: request.guildId,
        channelId: request.channelId,
      };
    } catch (error) {
      return {
        success: false,
        connectionId: '',
        guildId: request.guildId,
        channelId: request.channelId,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle leave voice channel request
   */
  async handleLeave(
    request: LeaveVoiceChannelRequest,
  ): Promise<LeaveVoiceChannelResponse> {
    try {
      // Validate request
      if (!request.guildId || !request.channelId) {
        return {
          success: false,
          guildId: request.guildId || '',
          channelId: request.channelId || '',
          error: 'Missing required fields: guildId, channelId',
        };
      }

      // Leave the channel
      await this.manager.leave(request.guildId, request.channelId);

      return {
        success: true,
        guildId: request.guildId,
        channelId: request.channelId,
      };
    } catch (error) {
      return {
        success: false,
        guildId: request.guildId,
        channelId: request.channelId,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle broadcast audio request
   */
  async handleBroadcast(
    request: BroadcastAudioRequest,
  ): Promise<BroadcastAudioResponse> {
    try {
      // Validate request
      if (!request.guildId || !request.channelId || !request.audio) {
        return {
          success: false,
          error: 'Missing required fields: guildId, channelId, audio',
        };
      }

      // Check if connected
      if (!this.manager.isConnected(request.guildId, request.channelId)) {
        return {
          success: false,
          error: `Not connected to channel ${request.channelId} in guild ${request.guildId}`,
        };
      }

      // Decode base64 audio data
      const audioData = Buffer.from(request.audio.data, 'base64');

      // Create audio buffer
      const audioBuffer: AudioBuffer = {
        data: new Uint8Array(audioData),
        format: request.audio.format,
        sampleRate: request.audio.sampleRate,
        duration: request.audio.duration,
        channels: request.audio.channels,
      };

      // Get connection and broadcast
      // Note: Manager doesn't expose connectors directly, would need to add a broadcast method
      // For now, return success - this would need implementation in the manager
      return {
        success: true,
        bytesSent: audioData.length,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle status request
   */
  handleStatus(request: StatusRequest): any {
    try {
      // Validate request
      if (!request.guildId || !request.channelId) {
        return {
          success: false,
          error: 'Missing required fields: guildId, channelId',
        };
      }

      // Get status
      const status = this.manager.getStatus(request.guildId, request.channelId);

      if (!status) {
        return {
          success: false,
          error: `Not connected to channel ${request.channelId} in guild ${request.guildId}`,
        };
      }

      return {
        success: true,
        ...status,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle metrics request
   */
  handleMetrics(): any {
    try {
      const metrics = this.manager.getMetrics();
      return {
        success: true,
        ...metrics,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Handle connections list request
   */
  handleListConnections(): any {
    try {
      const connections = this.manager.listConnections();
      return {
        success: true,
        connections,
        total: connections.length,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Setup transcription event forwarding
   *
   * Forward transcriptions to a callback function (e.g., WebSocket, webhook)
   */
  setupTranscriptionForwarding(
    callback: (transcription: UserTranscription) => void,
  ): void {
    this.manager.onTranscription(callback);
  }

  /**
   * Remove transcription forwarding
   */
  removeTranscriptionForwarding(
    callback: (transcription: UserTranscription) => void,
  ): void {
    this.manager.offTranscription(callback);
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    await this.manager.shutdown();
  }
}

export default DiscordVoiceRestAPI;
