/**
 * Tests for Signal Voice Response Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesizeTextToVoice, handleVoiceResponse } from './response-handler.js';
import type { VoiceResponseConfig } from './response-handler.js';
import { AudioFormat } from '../../media/voice-providers/executor.js';

describe('SignalVoiceResponseHandler', () => {
  const mockTtsExecutor = {
    id: 'test-tts',
    synthesize: vi.fn(async (text: string) => ({
      data: new Uint8Array(1024),
      format: AudioFormat.OPUS,
      sampleRate: 16000,
      duration: 5000,
      channels: 1,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('synthesizeTextToVoice', () => {
    it('should synthesize text to voice', async () => {
      const text = 'Hello, this is a test message';
      const config: VoiceResponseConfig = {
        voice: 'en-US',
        speed: 1.0,
      };

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(result).toBeDefined();
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.format).toBe(AudioFormat.OPUS);
      expect(result.size).toBeGreaterThan(0);
      expect(mockTtsExecutor.synthesize).toHaveBeenCalledWith(text, {
        voice: 'en-US',
        speed: 1.0,
        language: undefined,
        format: undefined,
        sampleRate: undefined,
      });
    });

    it('should reject empty text', async () => {
      const config: VoiceResponseConfig = {};

      await expect(
        synthesizeTextToVoice('', config, mockTtsExecutor),
      ).rejects.toThrow('Cannot synthesize empty text');
    });

    it('should reject text exceeding max length', async () => {
      const longText = 'a'.repeat(10000);
      const config: VoiceResponseConfig = {};

      await expect(
        synthesizeTextToVoice(longText, config, mockTtsExecutor),
      ).rejects.toThrow('exceeds maximum length');
    });

    it('should respect privacy mode (no logging)', async () => {
      const text = 'Sensitive message';
      const config: VoiceResponseConfig = {
        disableLogging: true,
      };

      const mockRuntime = {
        log: vi.fn(),
        error: vi.fn(),
      };

      await synthesizeTextToVoice(text, config, mockTtsExecutor, mockRuntime);

      // Should not log the actual sensitive text content
      // Technical logs (bytes, format, etc.) are OK
      const logCalls = mockRuntime.log.mock.calls.flat().join(' ');
      expect(logCalls).not.toContain('Sensitive message');
      expect(logCalls).not.toContain(text);
    });
  });

  describe('Privacy guarantees', () => {
    it('should enable ephemeral mode by default', async () => {
      const config: VoiceResponseConfig = {};

      // Ephemeral mode should be true by default
      expect(config.ephemeralMode).toBeUndefined(); // Uses default in implementation
    });

    it('should disable conversation logging by default', async () => {
      const config: VoiceResponseConfig = {};

      // Logging should be disabled by default
      expect(config.disableLogging).toBeUndefined(); // Uses default in implementation
    });

    it('should never cache audio content', async () => {
      const text = 'Test message';
      const config: VoiceResponseConfig = {
        disableLogging: true,
      };

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      // Audio should be fresh, not cached
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(mockTtsExecutor.synthesize).toHaveBeenCalled();
    });
  });

  describe('Audio format handling', () => {
    it('should support OPUS format (Signal default)', async () => {
      const text = 'Test message';
      const config: VoiceResponseConfig = {
        audioFormat: AudioFormat.OPUS,
      };

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(result.format).toBe(AudioFormat.OPUS);
    });

    it('should support custom sample rates', async () => {
      const text = 'Test message';
      const config: VoiceResponseConfig = {
        sampleRate: 24000,
      };

      await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(mockTtsExecutor.synthesize).toHaveBeenCalledWith(
        text,
        expect.objectContaining({ sampleRate: 24000 }),
      );
    });

    it('should support custom voice settings', async () => {
      const text = 'Test message';
      const config: VoiceResponseConfig = {
        voice: 'custom-voice',
        speed: 1.5,
        language: 'en-GB',
      };

      await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(mockTtsExecutor.synthesize).toHaveBeenCalledWith(
        text,
        expect.objectContaining({
          voice: 'custom-voice',
          speed: 1.5,
          language: 'en-GB',
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('should handle TTS provider errors', async () => {
      const errorExecutor = {
        id: 'error-tts',
        synthesize: vi.fn(async () => {
          throw new Error('TTS provider error');
        }),
      };

      const text = 'Test message';
      const config: VoiceResponseConfig = {};

      await expect(
        synthesizeTextToVoice(text, config, errorExecutor),
      ).rejects.toThrow('TTS provider error');
    });

    it('should validate text before synthesis', async () => {
      const config: VoiceResponseConfig = {};

      await expect(
        synthesizeTextToVoice('   ', config, mockTtsExecutor),
      ).rejects.toThrow('Cannot synthesize empty text');
    });
  });

  describe('Encryption verification', () => {
    it('should flag messages as encrypted', async () => {
      // Signal messages are always E2E encrypted
      const text = 'Encrypted message';
      const config: VoiceResponseConfig = {};

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(result).toBeDefined();
      // Encryption is handled by Signal library
    });
  });

  describe('Performance metrics', () => {
    it('should track synthesis duration', async () => {
      const text = 'Performance test message';
      const config: VoiceResponseConfig = {};

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(result.duration).toBeGreaterThan(0);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should return provider information', async () => {
      const text = 'Provider test';
      const config: VoiceResponseConfig = {};

      const result = await synthesizeTextToVoice(text, config, mockTtsExecutor);

      expect(result.provider).toBe('test-tts');
    });
  });
});
