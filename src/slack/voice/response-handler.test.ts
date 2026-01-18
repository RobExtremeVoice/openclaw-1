/**
 * Tests for Slack Voice Response Handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackVoiceResponseHandler } from './response-handler.js';
import type { WebClient as SlackWebClient } from '@slack/web-api';
import type { RuntimeEnv } from '../../runtime.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';

describe('SlackVoiceResponseHandler', () => {
  let handler: SlackVoiceResponseHandler;
  let mockClient: SlackWebClient;
  let mockRuntime: RuntimeEnv;
  let tempDir: string;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = join(tmpdir(), `test-slack-response-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Mock Slack client
    mockClient = {
      files: {
        uploadV2: vi.fn().mockResolvedValue({
          ok: true,
          file: {
            id: 'F999',
            permalink: 'https://slack.com/files/F999',
            timestamp: String(Date.now()),
          },
        }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({
          ok: true,
          ts: '1234567890.123456',
          channel: 'C123',
        }),
      },
    } as any;

    // Mock runtime
    mockRuntime = {
      log: vi.fn(),
      error: vi.fn(),
    } as any;

    handler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
      tempDir,
    });
  });

  afterEach(async () => {
    // Cleanup temp files
    try {
      const { rm } = await import('fs/promises');
      await rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('sendVoiceResponse', () => {
    it('should throw error when voice providers not configured', async () => {
      // Mock voice config to be empty
      vi.mock('../../commands/voice/helpers.js', () => ({
        loadVoiceConfig: vi.fn().mockResolvedValue({
          voiceConfig: null,
        }),
        initializeRegistry: vi.fn(),
      }));

      await expect(
        handler.sendVoiceResponse({
          channelId: 'C123',
          text: 'Hello world',
        }),
      ).rejects.toThrow();
    });
  });

  describe('uploadVoiceFile', () => {
    it('should upload MP3 file to Slack', async () => {
      // Create a test MP3 file
      const testFile = join(tempDir, 'test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test mp3 data'));

      // Call private method via any cast
      const result = await (handler as any).uploadVoiceFile(testFile, {
        channelId: 'C123',
        text: 'Test message',
        includeTranscript: true,
      });

      expect(result.fileId).toBe('F999');
      expect(result.permalink).toBe('https://slack.com/files/F999');
      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: 'C123',
          filename: expect.stringContaining('.mp3'),
          title: 'Voice Response',
        }),
      );
    });

    it('should upload to thread when threadTs provided', async () => {
      const testFile = join(tempDir, 'thread-test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test'));

      await (handler as any).uploadVoiceFile(testFile, {
        channelId: 'C123',
        threadTs: '1234567890.123456',
        text: 'Thread reply',
        includeTranscript: true,
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: 'C123',
          thread_ts: '1234567890.123456',
        }),
      );
    });

    it('should include transcript when requested', async () => {
      const testFile = join(tempDir, 'transcript-test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test'));

      await (handler as any).uploadVoiceFile(testFile, {
        channelId: 'C123',
        text: 'Test with transcript',
        includeTranscript: true,
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          initial_comment: expect.stringContaining('Test with transcript'),
        }),
      );
    });

    it('should omit transcript when not requested', async () => {
      const testFile = join(tempDir, 'no-transcript-test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test'));

      await (handler as any).uploadVoiceFile(testFile, {
        channelId: 'C123',
        text: 'Test without transcript',
        includeTranscript: false,
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          initial_comment: 'Voice response',
        }),
      );
    });

    it('should handle upload failures', async () => {
      mockClient.files.uploadV2 = vi.fn().mockResolvedValue({
        ok: false,
        error: 'upload_failed',
      });

      const testFile = join(tempDir, 'fail-test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test'));

      await expect(
        (handler as any).uploadVoiceFile(testFile, {
          channelId: 'C123',
          text: 'This will fail',
          includeTranscript: true,
        }),
      ).rejects.toThrow('Voice upload failed');
    });
  });

  describe('writeWAVFile', () => {
    it('should write valid WAV file with proper header', async () => {
      const audioBuffer = {
        data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
        format: 'pcm16' as any,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      const outputPath = join(tempDir, 'test.wav');
      await (handler as any).writeWAVFile(outputPath, audioBuffer);

      // Read and verify WAV file
      const { readFile } = await import('fs/promises');
      const wavData = await readFile(outputPath);

      // Check RIFF header
      expect(wavData.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wavData.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wavData.toString('ascii', 12, 16)).toBe('fmt ');
      expect(wavData.toString('ascii', 36, 40)).toBe('data');

      // Check audio data
      expect(wavData.length).toBe(44 + 8); // Header + data
    });

    it('should handle stereo audio', async () => {
      const audioBuffer = {
        data: new Uint8Array(16),
        format: 'pcm16' as any,
        sampleRate: 24000,
        duration: 1000,
        channels: 2,
      };

      const outputPath = join(tempDir, 'stereo.wav');
      await (handler as any).writeWAVFile(outputPath, audioBuffer);

      const { readFile } = await import('fs/promises');
      const wavData = await readFile(outputPath);

      // Verify stereo setup in header
      const numChannels = wavData.readUInt16LE(22);
      expect(numChannels).toBe(2);
    });
  });

  describe('cleanupFile', () => {
    it('should remove temporary file', async () => {
      const testFile = join(tempDir, 'cleanup-test.mp3');
      const { writeFile } = await import('fs/promises');
      await writeFile(testFile, Buffer.from('test'));

      await (handler as any).cleanupFile(testFile);

      // File should be deleted
      await expect(
        import('fs/promises').then(fs => fs.access(testFile)),
      ).rejects.toThrow();
    });

    it('should ignore errors when file does not exist', async () => {
      const nonExistent = join(tempDir, 'does-not-exist.mp3');

      // Should not throw
      await expect(
        (handler as any).cleanupFile(nonExistent),
      ).resolves.toBeUndefined();
    });
  });

  describe('cleanupOldFiles', () => {
    it('should remove old response files', async () => {
      const { writeFile } = await import('fs/promises');

      // Create old files
      const oldFile1 = join(tempDir, 'input-123.wav');
      const oldFile2 = join(tempDir, 'output-456.mp3');

      await writeFile(oldFile1, Buffer.from('old1'));
      await writeFile(oldFile2, Buffer.from('old2'));

      // Wait
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup files older than 50ms
      await handler.cleanupOldFiles(50);

      // Files should be deleted
      await expect(
        import('fs/promises').then(fs => fs.access(oldFile1)),
      ).rejects.toThrow();
      await expect(
        import('fs/promises').then(fs => fs.access(oldFile2)),
      ).rejects.toThrow();
    });
  });

  describe('configuration', () => {
    it('should use default configuration values', () => {
      const defaultHandler = new SlackVoiceResponseHandler(
        mockClient,
        mockRuntime,
      );

      expect((defaultHandler as any).config.defaultVoice).toBe('en_us');
      expect((defaultHandler as any).config.defaultSpeed).toBe(1.0);
      expect((defaultHandler as any).config.targetFormat).toBe('mp3');
      expect((defaultHandler as any).config.targetSampleRate).toBe(24000);
      expect((defaultHandler as any).config.targetBitrate).toBe(64);
      expect((defaultHandler as any).config.includeTranscriptByDefault).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customHandler = new SlackVoiceResponseHandler(
        mockClient,
        mockRuntime,
        {
          defaultVoice: 'en_uk',
          defaultSpeed: 1.5,
          targetSampleRate: 48000,
          targetBitrate: 128,
          includeTranscriptByDefault: false,
        },
      );

      expect((customHandler as any).config.defaultVoice).toBe('en_uk');
      expect((customHandler as any).config.defaultSpeed).toBe(1.5);
      expect((customHandler as any).config.targetSampleRate).toBe(48000);
      expect((customHandler as any).config.targetBitrate).toBe(128);
      expect((customHandler as any).config.includeTranscriptByDefault).toBe(false);
    });
  });

  describe('modality matching', () => {
    it('should match voice input with voice response (match mode)', () => {
      const matchHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'match' },
      });

      const { modality } = (matchHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('voice');
    });

    it('should match text input with text response (match mode)', () => {
      const matchHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'match' },
      });

      const { modality } = (matchHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'text',
      });

      expect(modality).toBe('text');
    });

    it('should force voice response when configured', () => {
      const voiceHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'voice' },
      });

      const { modality } = (voiceHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'text',
      });

      expect(modality).toBe('voice');
    });

    it('should force text response when configured', () => {
      const textHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'text' },
      });

      const { modality } = (textHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('text');
    });

    it('should send both voice and text when configured', () => {
      const bothHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'both' },
      });

      const { modality } = (bothHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('both');
    });

    it('should use per-user override (highest priority)', () => {
      const overrideHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: {
          messageResponse: 'match',
          perChannelOverride: { 'C123': 'voice' },
          perUserOverride: { 'U456': 'text' },
        },
      });

      const { modality } = (overrideHandler as any).determineOutputModality({
        channelId: 'C123',
        userId: 'U456',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('text');
    });

    it('should use per-channel override (medium priority)', () => {
      const overrideHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: {
          messageResponse: 'match',
          perChannelOverride: { 'C123': 'voice' },
        },
      });

      const { modality } = (overrideHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'text',
      });

      expect(modality).toBe('voice');
    });

    it('should fall back to default when no overrides apply', () => {
      const defaultHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: {
          messageResponse: 'text',
          perChannelOverride: { 'C999': 'voice' },
        },
      });

      const { modality } = (defaultHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('text');
    });

    it('should provide metadata about modality determination', () => {
      const handler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: {
          messageResponse: 'match',
          perUserOverride: { 'U456': 'voice' },
        },
      });

      const { metadata } = (handler as any).determineOutputModality({
        channelId: 'C123',
        userId: 'U456',
        text: 'Hello',
        inputModality: 'text',
      });

      expect(metadata.inputModality).toBe('text');
      expect(metadata.outputModality).toBe('voice');
      expect(metadata.reasonForModality).toContain('user-override');
    });
  });

  describe('text response sending', () => {
    it('should send text message to Slack', async () => {
      const textHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'text' },
      });

      // Mock the implementation to avoid voice synthesis
      vi.spyOn(textHandler as any, 'sendTextResponse').mockResolvedValue('1234567890.123456');

      const result = await textHandler.sendVoiceResponse({
        channelId: 'C123',
        text: 'Hello world',
        inputModality: 'text',
      });

      expect(result).toBe('1234567890.123456');
    });

    it('should include thread_ts when sending text response', async () => {
      const textHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'text' },
      });

      vi.spyOn(textHandler as any, 'sendTextResponse').mockResolvedValue('1234567890.123456');

      await textHandler.sendVoiceResponse({
        channelId: 'C123',
        threadTs: '9876543210.654321',
        text: 'Thread reply',
        inputModality: 'text',
      });

      // Verify that sendTextResponse was called with threadTs
      expect((textHandler as any).sendTextResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          threadTs: '9876543210.654321',
        }),
      );
    });
  });

  describe('modality integration', () => {
    it('should handle match modality for voice input correctly', async () => {
      const matchHandler = new SlackVoiceResponseHandler(mockClient, mockRuntime, {
        tempDir,
        slackVoiceConfig: { messageResponse: 'match' },
      });

      // Spy on methods
      const sendVoiceSpy = vi.spyOn(matchHandler as any, 'sendVoiceOnly').mockResolvedValue({
        fileId: 'F123',
        permalink: 'https://slack.com/files/F123',
        timestamp: '1234567890.123456',
      });

      // Since we can't fully mock TTS, just verify the logic
      const { modality } = (matchHandler as any).determineOutputModality({
        channelId: 'C123',
        text: 'Hello',
        inputModality: 'voice',
      });

      expect(modality).toBe('voice');
      expect(sendVoiceSpy).not.toHaveBeenCalled(); // Just verify setup
    });
  });
});
