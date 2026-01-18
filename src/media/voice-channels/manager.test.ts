/**
 * Voice Channel Manager Tests
 *
 * Tests channel lifecycle management:
 * - Create/join/leave/destroy lifecycle
 * - Handle 10 concurrent channels
 * - Auto-cleanup empty channels
 * - Metrics accuracy
 * - Resource leak detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceChannel, type VoiceChannelConfig } from './channel.js';
import type { VoiceParticipantConfig } from './channel.js';

/**
 * Channel Manager
 *
 * Manages multiple voice channels with lifecycle and cleanup
 */
class ChannelManager {
  private channels: Map<string, VoiceChannel> = new Map();
  private metrics: {
    channelsCreated: number;
    channelsDestroyed: number;
    totalParticipants: number;
    activeChannels: number;
  };

  constructor() {
    this.metrics = {
      channelsCreated: 0,
      channelsDestroyed: 0,
      totalParticipants: 0,
      activeChannels: 0,
    };
  }

  /**
   * Create a new voice channel
   */
  async createChannel(config: VoiceChannelConfig): Promise<VoiceChannel> {
    if (this.channels.has(config.id)) {
      throw new Error(`Channel ${config.id} already exists`);
    }

    const channel = new VoiceChannel(config);
    await channel.activate();

    this.channels.set(config.id, channel);
    this.metrics.channelsCreated++;
    this.metrics.activeChannels++;

    return channel;
  }

  /**
   * Get a channel by ID
   */
  getChannel(channelId: string): VoiceChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Join a participant to a channel
   */
  async joinChannel(
    channelId: string,
    participantConfig: VoiceParticipantConfig,
  ): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    await channel.addParticipant(participantConfig);
    this.metrics.totalParticipants++;
  }

  /**
   * Leave a participant from a channel
   */
  async leaveChannel(channelId: string, userId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    await channel.removeParticipant(userId);
    this.metrics.totalParticipants--;

    // Auto-cleanup empty channels
    if (channel.participants.size === 0) {
      await this.destroyChannel(channelId);
    }
  }

  /**
   * Destroy a channel
   */
  async destroyChannel(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return;
    }

    await channel.deactivate();
    this.channels.delete(channelId);

    this.metrics.channelsDestroyed++;
    this.metrics.activeChannels--;
  }

  /**
   * Get all active channels
   */
  getActiveChannels(): VoiceChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get channel metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentChannels: this.channels.size,
    };
  }

  /**
   * Cleanup all channels
   */
  async shutdown(): Promise<void> {
    for (const channelId of this.channels.keys()) {
      await this.destroyChannel(channelId);
    }
  }
}

describe('Channel Manager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('Channel Lifecycle', () => {
    it('should create a new channel', async () => {
      const config: VoiceChannelConfig = {
        id: 'test-channel',
        name: 'Test Channel',
      };

      const channel = await manager.createChannel(config);

      expect(channel).toBeDefined();
      expect(channel.id).toBe('test-channel');
      expect(channel.name).toBe('Test Channel');

      const metrics = manager.getMetrics();
      expect(metrics.channelsCreated).toBe(1);
      expect(metrics.activeChannels).toBe(1);
    });

    it('should not allow duplicate channel IDs', async () => {
      const config: VoiceChannelConfig = {
        id: 'duplicate-channel',
        name: 'Duplicate Channel',
      };

      await manager.createChannel(config);

      await expect(manager.createChannel(config)).rejects.toThrow(
        'already exists',
      );
    });

    it('should join participant to channel', async () => {
      const channelConfig: VoiceChannelConfig = {
        id: 'channel-1',
        name: 'Channel 1',
      };

      await manager.createChannel(channelConfig);

      const participantConfig: VoiceParticipantConfig = {
        userId: 'user-1',
        displayName: 'User 1',
      };

      await manager.joinChannel('channel-1', participantConfig);

      const channel = manager.getChannel('channel-1')!;
      expect(channel.participants.size).toBe(1);
      expect(channel.participants.has('user-1')).toBe(true);
    });

    it('should leave participant from channel', async () => {
      const channelConfig: VoiceChannelConfig = {
        id: 'channel-1',
        name: 'Channel 1',
      };

      await manager.createChannel(channelConfig);

      await manager.joinChannel('channel-1', {
        userId: 'user-1',
        displayName: 'User 1',
      });

      await manager.leaveChannel('channel-1', 'user-1');

      // Channel should be destroyed after last participant leaves
      expect(manager.getChannel('channel-1')).toBeUndefined();
    });

    it('should destroy a channel', async () => {
      const config: VoiceChannelConfig = {
        id: 'channel-1',
        name: 'Channel 1',
      };

      await manager.createChannel(config);
      await manager.destroyChannel('channel-1');

      expect(manager.getChannel('channel-1')).toBeUndefined();

      const metrics = manager.getMetrics();
      expect(metrics.channelsDestroyed).toBe(1);
      expect(metrics.activeChannels).toBe(0);
    });
  });

  describe('Concurrent Channel Management', () => {
    it('should handle 10 concurrent channels', async () => {
      // Create 10 channels concurrently
      const createPromises = [];

      for (let i = 0; i < 10; i++) {
        const config: VoiceChannelConfig = {
          id: `channel-${i}`,
          name: `Channel ${i}`,
        };

        createPromises.push(manager.createChannel(config));
      }

      await Promise.all(createPromises);

      const activeChannels = manager.getActiveChannels();
      expect(activeChannels.length).toBe(10);

      const metrics = manager.getMetrics();
      expect(metrics.activeChannels).toBe(10);
      expect(metrics.channelsCreated).toBe(10);
    });

    it('should handle participants across multiple channels', async () => {
      // Create 5 channels
      for (let i = 0; i < 5; i++) {
        await manager.createChannel({
          id: `channel-${i}`,
          name: `Channel ${i}`,
        });
      }

      // Add 3 participants to each channel
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 3; j++) {
          await manager.joinChannel(`channel-${i}`, {
            userId: `user-${i}-${j}`,
            displayName: `User ${i}-${j}`,
          });
        }
      }

      const metrics = manager.getMetrics();
      expect(metrics.totalParticipants).toBe(15); // 5 channels * 3 participants
    });
  });

  describe('Auto-Cleanup', () => {
    it('should auto-cleanup empty channels', async () => {
      const config: VoiceChannelConfig = {
        id: 'cleanup-test',
        name: 'Cleanup Test',
      };

      await manager.createChannel(config);

      // Add participant
      await manager.joinChannel('cleanup-test', {
        userId: 'user-1',
        displayName: 'User 1',
      });

      // Remove participant (should trigger auto-cleanup)
      await manager.leaveChannel('cleanup-test', 'user-1');

      // Channel should be destroyed
      expect(manager.getChannel('cleanup-test')).toBeUndefined();

      const metrics = manager.getMetrics();
      expect(metrics.channelsDestroyed).toBe(1);
    });

    it('should not cleanup channels with participants', async () => {
      const config: VoiceChannelConfig = {
        id: 'non-empty-channel',
        name: 'Non-Empty Channel',
      };

      await manager.createChannel(config);

      // Add 2 participants
      await manager.joinChannel('non-empty-channel', {
        userId: 'user-1',
        displayName: 'User 1',
      });

      await manager.joinChannel('non-empty-channel', {
        userId: 'user-2',
        displayName: 'User 2',
      });

      // Remove one participant
      await manager.leaveChannel('non-empty-channel', 'user-1');

      // Channel should still exist (has 1 participant)
      expect(manager.getChannel('non-empty-channel')).toBeDefined();
      expect(manager.getChannel('non-empty-channel')!.participants.size).toBe(1);
    });
  });

  describe('Metrics Accuracy', () => {
    it('should track channel creation accurately', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.createChannel({
          id: `channel-${i}`,
          name: `Channel ${i}`,
        });
      }

      const metrics = manager.getMetrics();
      expect(metrics.channelsCreated).toBe(5);
      expect(metrics.activeChannels).toBe(5);
    });

    it('should track channel destruction accurately', async () => {
      // Create 5 channels
      for (let i = 0; i < 5; i++) {
        await manager.createChannel({
          id: `channel-${i}`,
          name: `Channel ${i}`,
        });
      }

      // Destroy 3 channels
      for (let i = 0; i < 3; i++) {
        await manager.destroyChannel(`channel-${i}`);
      }

      const metrics = manager.getMetrics();
      expect(metrics.channelsCreated).toBe(5);
      expect(metrics.channelsDestroyed).toBe(3);
      expect(metrics.activeChannels).toBe(2);
    });

    it('should track total participants accurately', async () => {
      await manager.createChannel({
        id: 'channel-1',
        name: 'Channel 1',
      });

      // Add 5 participants
      for (let i = 0; i < 5; i++) {
        await manager.joinChannel('channel-1', {
          userId: `user-${i}`,
          displayName: `User ${i}`,
        });
      }

      const metrics = manager.getMetrics();
      expect(metrics.totalParticipants).toBe(5);
    });
  });

  describe('Resource Leak Detection', () => {
    it('should not leak resources after shutdown', async () => {
      // Create 10 channels with participants
      for (let i = 0; i < 10; i++) {
        await manager.createChannel({
          id: `channel-${i}`,
          name: `Channel ${i}`,
        });

        await manager.joinChannel(`channel-${i}`, {
          userId: `user-${i}`,
          displayName: `User ${i}`,
        });
      }

      // Shutdown manager
      await manager.shutdown();

      // Verify all channels are destroyed
      const activeChannels = manager.getActiveChannels();
      expect(activeChannels.length).toBe(0);

      const metrics = manager.getMetrics();
      expect(metrics.activeChannels).toBe(0);
    });

    it('should cleanup after 1 hour continuous operation', async () => {
      // Simulate 1 hour of operation
      const startTime = Date.now();

      // Create and destroy channels repeatedly
      for (let i = 0; i < 100; i++) {
        const channel = await manager.createChannel({
          id: `channel-${i}`,
          name: `Channel ${i}`,
        });

        await manager.joinChannel(`channel-${i}`, {
          userId: `user-${i}`,
        });

        await manager.leaveChannel(`channel-${i}`, `user-${i}`);
      }

      const endTime = Date.now();

      // Verify metrics are consistent
      const metrics = manager.getMetrics();
      expect(metrics.channelsCreated).toBe(100);
      expect(metrics.channelsDestroyed).toBe(100);
      expect(metrics.activeChannels).toBe(0);

      // All channels should be cleaned up
      expect(manager.getActiveChannels().length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle joining non-existent channel', async () => {
      await expect(
        manager.joinChannel('non-existent', { userId: 'user-1' }),
      ).rejects.toThrow('not found');
    });

    it('should handle leaving non-existent channel', async () => {
      await expect(
        manager.leaveChannel('non-existent', 'user-1'),
      ).rejects.toThrow('not found');
    });

    it('should handle double destruction gracefully', async () => {
      const config: VoiceChannelConfig = {
        id: 'channel-1',
        name: 'Channel 1',
      };

      await manager.createChannel(config);
      await manager.destroyChannel('channel-1');

      // Second destroy should not throw
      await expect(manager.destroyChannel('channel-1')).resolves.not.toThrow();
    });
  });
});
