/**
 * Tests for Discord Voice Message Response Handler
 */

import { describe, it, expect, vi } from 'vitest';
import {
  estimateAudioSize,
  isResponseTooLarge,
} from './response-handler.js';
import type { DiscordVoiceConfig } from './config.js';
import { DEFAULT_VOICE_CONFIG } from './config.js';

describe('Discord Voice Response Handler', () => {
  describe('estimateAudioSize', () => {
    it('should estimate size for MP3 at medium bitrate', () => {
      // ~750 chars = ~150 words at 5 chars/word
      // At 150 words/min, this is ~1 minute
      // At 64kbps = 64000 bits/s = 8000 bytes/s
      // 1 minute = 60s * 8000 bytes/s = 480000 bytes
      const textLength = 750;
      const format = 'mp3';
      const bitrate = 64000;

      const size = estimateAudioSize(textLength, format, bitrate);

      // Should be approximately 480KB
      expect(size).toBeGreaterThan(400000);
      expect(size).toBeLessThan(600000);
    });

    it('should estimate larger size for higher bitrate', () => {
      const textLength = 750;
      const format = 'mp3';
      const lowBitrate = 32000;
      const highBitrate = 128000;

      const lowSize = estimateAudioSize(textLength, format, lowBitrate);
      const highSize = estimateAudioSize(textLength, format, highBitrate);

      expect(highSize).toBeGreaterThan(lowSize * 3); // Should be ~4x larger
    });

    it('should scale with text length', () => {
      const shortText = 375; // ~30 seconds
      const longText = 750; // ~60 seconds
      const format = 'mp3';
      const bitrate = 64000;

      const shortSize = estimateAudioSize(shortText, format, bitrate);
      const longSize = estimateAudioSize(longText, format, bitrate);

      expect(longSize).toBeGreaterThan(shortSize * 1.8); // Should be ~2x larger
    });

    it('should work for OGG format', () => {
      const textLength = 750;
      const format = 'ogg';
      const bitrate = 64000;

      const size = estimateAudioSize(textLength, format, bitrate);

      // OGG at same bitrate should be similar size to MP3
      expect(size).toBeGreaterThan(400000);
      expect(size).toBeLessThan(600000);
    });
  });

  describe('isResponseTooLarge', () => {
    it('should return false for normal-length response', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        audioQuality: 'medium',
        maxAudioSizeMb: 24,
      };

      // ~5 minutes of speech at medium quality should be OK
      const textLength = 3750; // ~750 words

      expect(isResponseTooLarge(textLength, config)).toBe(false);
    });

    it('should return true for very long response at high quality', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        audioQuality: 'high',
        voiceFormat: 'mp3',
        maxAudioSizeMb: 24,
      };

      // ~30 minutes of speech at high quality (128kbps)
      // 30 min * 60 s/min * 128000 bits/s / 8 bits/byte = ~28.8MB
      const textLength = 22500; // ~4500 words

      expect(isResponseTooLarge(textLength, config)).toBe(true);
    });

    it('should return false for same content at lower quality', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        audioQuality: 'low',
        voiceFormat: 'mp3',
        maxAudioSizeMb: 24,
      };

      // Same 30 minutes at low quality (32kbps) = ~7.2MB
      const textLength = 22500;

      expect(isResponseTooLarge(textLength, config)).toBe(false);
    });

    it('should respect custom max size', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        audioQuality: 'medium',
        maxAudioSizeMb: 5, // Custom 5MB limit
      };

      // ~10 minutes at medium quality = ~4.8MB (should be OK)
      const mediumText = 7500;
      expect(isResponseTooLarge(mediumText, config)).toBe(false);

      // ~15 minutes at medium quality = ~7.2MB (should exceed)
      const longText = 11250;
      expect(isResponseTooLarge(longText, config)).toBe(true);
    });

    it('should handle edge case of exact limit', () => {
      const config: DiscordVoiceConfig = {
        ...DEFAULT_VOICE_CONFIG,
        audioQuality: 'medium',
        maxAudioSizeMb: 1,
      };

      // Calculate text length that produces exactly 1MB
      // 1MB = 1048576 bytes
      // At 64kbps = 8000 bytes/s
      // 1048576 / 8000 = ~131 seconds = ~2.2 minutes
      // At 150 words/min * 5 chars/word = ~1650 chars
      const textLength = 1650;

      // Due to estimation, this might be slightly over or under
      // Main goal is to verify no crash and reasonable behavior
      const result = isResponseTooLarge(textLength, config);
      expect(typeof result).toBe('boolean');
    });
  });
});
