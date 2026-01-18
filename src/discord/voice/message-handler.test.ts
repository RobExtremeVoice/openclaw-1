/**
 * Tests for Discord Audio Message Handler
 */

import { describe, it, expect, vi } from 'vitest';
import type { Message, Attachment } from '@buape/carbon';
import {
  hasAudioAttachment,
  getAudioAttachments,
  validateAudioAttachment,
  extractAudioMetadata,
  getAudioFormat,
  isVoiceMessageContext,
} from './message-handler.js';

describe('Discord Audio Message Handler', () => {
  describe('hasAudioAttachment', () => {
    it('should return true for message with MP3 attachment', () => {
      const message = {
        attachments: [
          {
            filename: 'audio.mp3',
            contentType: 'audio/mpeg',
            size: 1024,
            url: 'https://cdn.discord.com/audio.mp3',
          },
        ],
      } as Message;

      expect(hasAudioAttachment(message)).toBe(true);
    });

    it('should return true for message with WAV attachment', () => {
      const message = {
        attachments: [
          {
            filename: 'audio.wav',
            contentType: 'audio/wav',
            size: 2048,
            url: 'https://cdn.discord.com/audio.wav',
          },
        ],
      } as Message;

      expect(hasAudioAttachment(message)).toBe(true);
    });

    it('should return false for message without attachments', () => {
      const message = {
        attachments: [],
      } as Message;

      expect(hasAudioAttachment(message)).toBe(false);
    });

    it('should return false for message with non-audio attachment', () => {
      const message = {
        attachments: [
          {
            filename: 'image.png',
            contentType: 'image/png',
            size: 1024,
            url: 'https://cdn.discord.com/image.png',
          },
        ],
      } as Message;

      expect(hasAudioAttachment(message)).toBe(false);
    });

    it('should detect audio by extension when contentType missing', () => {
      const message = {
        attachments: [
          {
            filename: 'audio.mp3',
            size: 1024,
            url: 'https://cdn.discord.com/audio.mp3',
          },
        ],
      } as Message;

      expect(hasAudioAttachment(message)).toBe(true);
    });
  });

  describe('getAudioAttachments', () => {
    it('should return only audio attachments', () => {
      const message = {
        attachments: [
          {
            filename: 'audio.mp3',
            contentType: 'audio/mpeg',
          },
          {
            filename: 'image.png',
            contentType: 'image/png',
          },
          {
            filename: 'audio.ogg',
            contentType: 'audio/ogg',
          },
        ],
      } as Message;

      const audioAttachments = getAudioAttachments(message);
      expect(audioAttachments).toHaveLength(2);
      expect(audioAttachments[0].filename).toBe('audio.mp3');
      expect(audioAttachments[1].filename).toBe('audio.ogg');
    });

    it('should return empty array when no audio attachments', () => {
      const message = {
        attachments: [
          {
            filename: 'image.png',
            contentType: 'image/png',
          },
        ],
      } as Message;

      expect(getAudioAttachments(message)).toHaveLength(0);
    });
  });

  describe('validateAudioAttachment', () => {
    it('should pass valid audio attachment', () => {
      const attachment = {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
        size: 1024 * 1024, // 1MB
      } as Attachment;

      const result = validateAudioAttachment(attachment);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject attachment larger than max size', () => {
      const attachment = {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
        size: 30 * 1024 * 1024, // 30MB (over Discord limit)
      } as Attachment;

      const result = validateAudioAttachment(attachment);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject unsupported format', () => {
      const attachment = {
        filename: 'video.mp4',
        contentType: 'video/mp4',
        size: 1024,
      } as Attachment;

      const result = validateAudioAttachment(attachment);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported audio format');
    });

    it('should respect custom max size', () => {
      const attachment = {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
        size: 15 * 1024 * 1024, // 15MB
      } as Attachment;

      const maxSize = 10 * 1024 * 1024; // 10MB limit
      const result = validateAudioAttachment(attachment, maxSize);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('extractAudioMetadata', () => {
    it('should extract metadata from message and attachment', () => {
      const message = {
        id: 'msg123',
        authorId: 'user456',
        author: {
          id: 'user456',
          username: 'TestUser',
        },
        channelId: 'channel789',
        timestamp: '2024-01-01T00:00:00Z',
        guild: {
          id: 'guild001',
        },
      } as Message;

      const attachment = {
        filename: 'voice.mp3',
        contentType: 'audio/mpeg',
        size: 2048,
      } as Attachment;

      const metadata = extractAudioMetadata(message, attachment, {
        userName: 'TestUser',
        channelName: 'general',
        guildName: 'TestGuild',
      });

      expect(metadata.userId).toBe('user456');
      expect(metadata.userName).toBe('TestUser');
      expect(metadata.channelId).toBe('channel789');
      expect(metadata.channelName).toBe('general');
      expect(metadata.guildId).toBeUndefined();
      expect(metadata.guildName).toBe('TestGuild');
      expect(metadata.messageId).toBe('msg123');
      expect(metadata.filename).toBe('voice.mp3');
      expect(metadata.contentType).toBe('audio/mpeg');
      expect(metadata.fileSizeBytes).toBe(2048);
    });

    it('should handle missing optional context', () => {
      const message = {
        id: 'msg123',
        authorId: 'user456',
        author: {
          id: 'user456',
        },
        channelId: 'channel789',
        timestamp: '2024-01-01T00:00:00Z',
      } as Message;

      const attachment = {
        filename: 'voice.mp3',
        contentType: 'audio/mpeg',
      } as Attachment;

      const metadata = extractAudioMetadata(message, attachment, {});

      expect(metadata.userId).toBe('user456');
      expect(metadata.userName).toBe('user456'); // Falls back to userId
      expect(metadata.guildId).toBeUndefined();
      expect(metadata.guildName).toBeUndefined();
    });

    it('should extract reply-to message ID', () => {
      const message = {
        id: 'msg123',
        authorId: 'user456',
        author: {
          id: 'user456',
        },
        channelId: 'channel789',
        timestamp: '2024-01-01T00:00:00Z',
        messageReference: {
          message_id: 'msg000',
        },
      } as Message;

      const attachment = {
        filename: 'voice.mp3',
        contentType: 'audio/mpeg',
      } as Attachment;

      const metadata = extractAudioMetadata(message, attachment, {});

      expect(metadata.replyToMessageId).toBe('msg000');
    });
  });

  describe('getAudioFormat', () => {
    it('should detect MP3', () => {
      expect(getAudioFormat('audio/mpeg')).toBe('mp3');
      expect(getAudioFormat('audio/mp3')).toBe('mp3');
    });

    it('should detect WAV', () => {
      expect(getAudioFormat('audio/wav')).toBe('wav');
      expect(getAudioFormat('audio/wave')).toBe('wav');
    });

    it('should detect OGG', () => {
      expect(getAudioFormat('audio/ogg')).toBe('ogg');
      expect(getAudioFormat('audio/vorbis')).toBe('ogg');
    });

    it('should detect FLAC', () => {
      expect(getAudioFormat('audio/flac')).toBe('flac');
    });

    it('should return unknown for unsupported format', () => {
      expect(getAudioFormat('audio/aac')).toBe('unknown');
      expect(getAudioFormat('video/mp4')).toBe('unknown');
    });
  });

  describe('isVoiceMessageContext', () => {
    it('should return true for audio-only message', () => {
      const message = {
        content: '',
        attachments: [
          {
            filename: 'voice.mp3',
            contentType: 'audio/mpeg',
          },
        ],
      } as Message;

      expect(isVoiceMessageContext(message)).toBe(true);
    });

    it('should return true for whitespace-only message with audio', () => {
      const message = {
        content: '   ',
        attachments: [
          {
            filename: 'voice.mp3',
            contentType: 'audio/mpeg',
          },
        ],
      } as Message;

      expect(isVoiceMessageContext(message)).toBe(true);
    });

    it('should return false for message with text and audio', () => {
      const message = {
        content: 'Check out this audio',
        attachments: [
          {
            filename: 'voice.mp3',
            contentType: 'audio/mpeg',
          },
        ],
      } as Message;

      expect(isVoiceMessageContext(message)).toBe(false);
    });

    it('should return false for message without audio', () => {
      const message = {
        content: 'Hello',
        attachments: [],
      } as Message;

      expect(isVoiceMessageContext(message)).toBe(false);
    });
  });
});
