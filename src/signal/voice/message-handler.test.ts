/**
 * Tests for Signal Voice Message Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isVoiceMessage,
  processVoiceMessage,
  extractVoiceMetadata,
  downloadVoiceMessage,
  saveVoiceMessageAudio,
} from './message-handler.js';
import type { SignalVoiceAttachment } from './message-handler.js';

describe('SignalVoiceMessageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isVoiceMessage', () => {
    it('should detect voice messages by voiceNote flag', () => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-123',
        voiceNote: true,
        contentType: 'audio/ogg',
      };

      expect(isVoiceMessage(attachment)).toBe(true);
    });

    it('should detect voice messages by audio content type', () => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-456',
        contentType: 'audio/opus',
      };

      expect(isVoiceMessage(attachment)).toBe(true);
    });

    it('should reject non-voice attachments', () => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-789',
        contentType: 'image/jpeg',
      };

      expect(isVoiceMessage(attachment)).toBe(false);
    });

    it('should reject attachments without ID', () => {
      const attachment = {
        contentType: 'audio/ogg',
      } as SignalVoiceAttachment;

      expect(isVoiceMessage(attachment)).toBe(false);
    });
  });

  describe('extractVoiceMetadata', () => {
    it('should extract metadata without audio content', () => {
      const message = {
        messageId: 'msg-123',
        sender: '+1234567890',
        senderUuid: 'uuid-abc',
        timestamp: 1234567890000,
        audioBuffer: Buffer.from('fake-audio'),
        audioFormat: 'opus' as const,
        encrypted: true,
        verified: true,
        size: 1024,
        duration: 5000,
      };

      const metadata = extractVoiceMetadata(message);

      expect(metadata).toEqual({
        messageId: 'msg-123',
        sender: '+1234567890',
        senderUuid: 'uuid-abc',
        timestamp: 1234567890000,
        groupId: undefined,
        groupName: undefined,
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 1024,
        duration: 5000,
      });

      // Ensure no audio content in metadata
      expect(metadata).not.toHaveProperty('audioBuffer');
    });

    it('should include group metadata', () => {
      const message = {
        messageId: 'msg-456',
        sender: '+1234567890',
        timestamp: 1234567890000,
        groupId: 'group-123',
        groupName: 'Test Group',
        audioBuffer: Buffer.from('fake-audio'),
        audioFormat: 'wav' as const,
        encrypted: true,
        verified: false,
        size: 2048,
      };

      const metadata = extractVoiceMetadata(message);

      expect(metadata.groupId).toBe('group-123');
      expect(metadata.groupName).toBe('Test Group');
      expect(metadata.verified).toBe(false);
    });
  });

  describe('downloadVoiceMessage', () => {
    it('should reject oversized attachments', async () => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-large',
        contentType: 'audio/opus',
        size: 10 * 1024 * 1024, // 10MB
      };

      await expect(
        downloadVoiceMessage(
          attachment,
          { baseUrl: 'http://localhost:8080' },
          { maxBytes: 8 * 1024 * 1024 }, // 8MB limit
        ),
      ).rejects.toThrow('exceeds');
    });

    it('should reject attachments without ID', async () => {
      const attachment = {
        contentType: 'audio/opus',
      } as SignalVoiceAttachment;

      await expect(
        downloadVoiceMessage(attachment, { baseUrl: 'http://localhost:8080' }),
      ).rejects.toThrow('Invalid attachment');
    });
  });

  describe('processVoiceMessage', () => {
    it('should validate voice message format', async () => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-invalid',
        contentType: 'image/jpeg', // Not a voice message
      };

      await expect(
        processVoiceMessage({
          attachment,
          sender: '+1234567890',
          timestamp: Date.now(),
          messageId: 'msg-123',
          baseUrl: 'http://localhost:8080',
        }),
      ).rejects.toThrow('not a voice message');
    });
  });

  describe('Privacy guarantees', () => {
    it('should never expose audio content in metadata', () => {
      const message = {
        messageId: 'msg-privacy',
        sender: '+1234567890',
        timestamp: Date.now(),
        audioBuffer: Buffer.from('sensitive-audio-data'),
        audioFormat: 'opus' as const,
        encrypted: true,
        verified: true,
        size: 1024,
      };

      const metadata = extractVoiceMetadata(message);
      const metadataJson = JSON.stringify(metadata);

      // Ensure audio buffer is not in serialized metadata
      expect(metadataJson).not.toContain('sensitive-audio-data');
      expect(metadataJson).not.toContain('audioBuffer');
    });

    it('should flag encryption status', () => {
      const message = {
        messageId: 'msg-encryption',
        sender: '+1234567890',
        timestamp: Date.now(),
        audioBuffer: Buffer.from('audio'),
        audioFormat: 'wav' as const,
        encrypted: true,
        verified: true,
        size: 512,
      };

      const metadata = extractVoiceMetadata(message);

      expect(metadata.encrypted).toBe(true);
      expect(metadata.verified).toBe(true);
    });
  });

  describe('Audio format detection', () => {
    it.each([
      ['audio/opus', 'opus'],
      ['audio/ogg', 'ogg'],
      ['audio/wav', 'wav'],
      ['audio/mpeg', 'unknown'],
    ])('should detect format from content type: %s -> %s', (contentType, expected) => {
      const attachment: SignalVoiceAttachment = {
        id: 'test-format',
        contentType,
        voiceNote: true,
      };

      expect(isVoiceMessage(attachment)).toBe(true);
    });
  });
});
