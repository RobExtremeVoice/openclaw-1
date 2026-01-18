/**
 * Tests for Discord Voice Message Configuration
 */

import { describe, it, expect } from 'vitest';
import {
  type DiscordVoiceConfig,
  DEFAULT_VOICE_CONFIG,
  resolveVoiceResponseType,
  detectInputModality,
  getQualityBitrate,
  validateVoiceConfig,
  mergeVoiceConfig,
  isVoiceMessagesEnabled,
} from './config.js';

describe('Discord Voice Config', () => {
  describe('detectInputModality', () => {
    it('should detect voice attachment', () => {
      const modality = detectInputModality({
        hasVoiceAttachment: true,
        isVoiceChannel: false,
      });
      expect(modality).toBe('voice');
    });

    it('should detect voice channel', () => {
      const modality = detectInputModality({
        hasVoiceAttachment: false,
        isVoiceChannel: true,
      });
      expect(modality).toBe('voice-channel');
    });

    it('should detect text input', () => {
      const modality = detectInputModality({
        hasVoiceAttachment: false,
        isVoiceChannel: false,
      });
      expect(modality).toBe('text');
    });

    it('should prioritize voice attachment over voice channel', () => {
      const modality = detectInputModality({
        hasVoiceAttachment: true,
        isVoiceChannel: true,
      });
      expect(modality).toBe('voice');
    });
  });

  describe('resolveVoiceResponseType', () => {
    it('should return global default when no overrides', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'voice',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
      });

      expect(result).toBe('voice');
    });

    it('should prioritize user override', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'text',
        perGuildOverride: { guild1: 'voice' },
        perChannelOverride: { channel1: 'both' },
        perUserOverride: { user1: 'text' },
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
      });

      expect(result).toBe('text'); // User override wins
    });

    it('should use channel override when no user override', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'text',
        perGuildOverride: { guild1: 'voice' },
        perChannelOverride: { channel1: 'both' },
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
      });

      expect(result).toBe('both'); // Channel override wins
    });

    it('should use guild override when no channel/user override', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'text',
        perGuildOverride: { guild1: 'voice' },
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
      });

      expect(result).toBe('voice'); // Guild override wins
    });

    it('should fall back to global default', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'both',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild2', // Not in overrides
        channelId: 'channel2',
        userId: 'user2',
      });

      expect(result).toBe('both'); // Global default
    });

    it('should match voice input when response is match', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'match',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        inputModality: 'voice',
      });

      expect(result).toBe('voice'); // Match mode → voice response
    });

    it('should match text input when response is match', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'match',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        inputModality: 'text',
      });

      expect(result).toBe('text'); // Match mode → text response
    });

    it('should match voice channel input when response is match', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'match',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        inputModality: 'voice-channel',
      });

      expect(result).toBe('voice'); // Match mode → voice response
    });

    it('should default to text when match mode but no modality', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'match',
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
      });

      expect(result).toBe('text'); // Match mode without modality → text fallback
    });

    it('should respect override even in match mode', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'match',
        perUserOverride: { user1: 'voice' },
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        inputModality: 'text', // Text input
      });

      expect(result).toBe('voice'); // Override forces voice regardless of input
    });

    it('should match per-channel override in match mode', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        messageResponse: 'text',
        perChannelOverride: { channel1: 'match' },
      };

      const result = resolveVoiceResponseType(config, {
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        inputModality: 'voice',
      });

      expect(result).toBe('voice'); // Channel override is match → voice response
    });
  });

  describe('getQualityBitrate', () => {
    it('should return correct bitrate for high quality', () => {
      expect(getQualityBitrate('high')).toBe(128000);
    });

    it('should return correct bitrate for medium quality', () => {
      expect(getQualityBitrate('medium')).toBe(64000);
    });

    it('should return correct bitrate for low quality', () => {
      expect(getQualityBitrate('low')).toBe(32000);
    });
  });

  describe('validateVoiceConfig', () => {
    it('should pass valid config with match', () => {
      const config: Partial<DiscordVoiceConfig> = {
        messageResponse: 'match',
        voiceFormat: 'mp3',
        audioQuality: 'medium',
        maxAudioSizeMb: 20,
      };

      const errors = validateVoiceConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid config with voice', () => {
      const config: Partial<DiscordVoiceConfig> = {
        messageResponse: 'voice',
        voiceFormat: 'mp3',
        audioQuality: 'medium',
        maxAudioSizeMb: 20,
      };

      const errors = validateVoiceConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject maxAudioSizeMb > 25', () => {
      const config: Partial<DiscordVoiceConfig> = {
        maxAudioSizeMb: 30,
      };

      const errors = validateVoiceConfig(config);
      expect(errors).toContain('maxAudioSizeMb cannot exceed 25 (Discord limit)');
    });

    it('should reject invalid messageResponse', () => {
      const config: any = {
        messageResponse: 'invalid',
      };

      const errors = validateVoiceConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invalid messageResponse');
    });

    it('should reject invalid voiceFormat', () => {
      const config: any = {
        voiceFormat: 'wav',
      };

      const errors = validateVoiceConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invalid voiceFormat');
    });

    it('should reject invalid audioQuality', () => {
      const config: any = {
        audioQuality: 'ultra',
      };

      const errors = validateVoiceConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invalid audioQuality');
    });
  });

  describe('mergeVoiceConfig', () => {
    it('should merge with defaults', () => {
      const config: Partial<DiscordVoiceConfig> = {
        messageResponse: 'voice',
        audioQuality: 'high',
      };

      const merged = mergeVoiceConfig(config);

      expect(merged.messageResponse).toBe('voice');
      expect(merged.audioQuality).toBe('high');
      expect(merged.voiceFormat).toBe(DEFAULT_VOICE_CONFIG.voiceFormat);
      expect(merged.maxAudioSizeMb).toBe(DEFAULT_VOICE_CONFIG.maxAudioSizeMb);
    });

    it('should use all defaults when empty', () => {
      const merged = mergeVoiceConfig({});

      expect(merged).toEqual(DEFAULT_VOICE_CONFIG);
    });

    it('should have match as default response type', () => {
      expect(DEFAULT_VOICE_CONFIG.messageResponse).toBe('match');
    });
  });

  describe('isVoiceMessagesEnabled', () => {
    it('should return true when enabled is undefined', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
      };

      expect(isVoiceMessagesEnabled(config)).toBe(true);
    });

    it('should return true when enabled is true', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        enabled: true,
      };

      expect(isVoiceMessagesEnabled(config)).toBe(true);
    });

    it('should return false when enabled is false', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        enabled: false,
      };

      expect(isVoiceMessagesEnabled(config)).toBe(false);
    });
  });
});
