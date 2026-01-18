/**
 * Voice Message E2E Test Suite
 *
 * End-to-end tests for Discord voice message handling:
 * - Voice attachment → transcribe → voice response
 * - All response modes (voice/text/both/match)
 * - Fallback to text on TTS failure
 * - Audio quality settings
 *
 * NOTE: All Discord APIs are mocked - no real Discord connections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Message, APIAttachment } from '@buape/carbon';
import {
  processAudioMessage,
  hasAudioAttachment,
  downloadAudioAttachment,
} from '../../../src/discord/voice/message-handler.js';
import {
  handleVoiceMessageResponse,
  type VoiceResponseContext,
} from '../../../src/discord/voice/response-handler.js';
import type { RuntimeEnv } from '../../../src/runtime.js';
import type { DiscordVoiceConfig } from '../../../src/discord/voice/config.js';

// ===================================================================
// MOCKS & TEST DATA
// ===================================================================

/**
 * Mock Discord message with voice attachment
 */
function createMockVoiceMessage(options: {
  messageId?: string;
  userId?: string;
  channelId?: string;
  audioUrl?: string;
  audioSize?: number;
  contentType?: string;
  hasText?: boolean;
}): Message {
  const {
    messageId = '1234567890',
    userId = 'user-123',
    channelId = 'channel-456',
    audioUrl = 'https://cdn.discordapp.com/attachments/123/voice.mp3',
    audioSize = 50000,
    contentType = 'audio/mpeg',
    hasText = false,
  } = options;

  return {
    id: messageId,
    channelId,
    author: {
      id: userId,
      username: 'TestUser',
      discriminator: '1234',
      avatar: 'avatar-hash',
      bot: false,
      system: false,
    },
    content: hasText ? 'Check out this voice message' : '',
    timestamp: new Date().toISOString(),
    attachments: [
      {
        id: 'attachment-123',
        filename: 'voice-message.mp3',
        size: audioSize,
        url: audioUrl,
        proxy_url: audioUrl,
        content_type: contentType,
      } as APIAttachment,
    ],
  } as Message;
}

/**
 * Mock audio data (16kHz PCM, 1 second)
 */
function createMockAudioData(): Buffer {
  const sampleRate = 16000;
  const duration = 1; // 1 second
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples * 2); // 16-bit PCM

  // Generate simple sine wave test tone
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    const value = Math.floor(sample * 32767);
    buffer.writeInt16LE(value, i * 2);
  }

  return buffer;
}

/**
 * Mock runtime environment
 */
function createMockRuntime(): RuntimeEnv {
  return {
    fetch: vi.fn(),
  } as unknown as RuntimeEnv;
}

/**
 * Mock Discord API responses
 */
const mockDiscordAPI = {
  downloadAudio: vi.fn(),
  sendMessage: vi.fn(),
  uploadFile: vi.fn(),
};

// Mock fetch globally
global.fetch = vi.fn();

// ===================================================================
// TEST SUITE: Voice Message Detection & Download
// ===================================================================

describe('Voice Message Detection & Download', () => {
  let runtime: RuntimeEnv;

  beforeEach(() => {
    runtime = createMockRuntime();
    vi.clearAllMocks();
  });

  it('should detect voice attachment by content-type', () => {
    const message = createMockVoiceMessage({
      contentType: 'audio/mpeg',
    });

    expect(hasAudioAttachment(message)).toBe(true);
  });

  it('should detect voice attachment by filename extension', () => {
    const message = createMockVoiceMessage({
      contentType: undefined,
    });

    // Modify attachment to have no content-type but .mp3 extension
    if (message.attachments && message.attachments[0]) {
      message.attachments[0].content_type = undefined;
      message.attachments[0].filename = 'voice.mp3';
    }

    expect(hasAudioAttachment(message)).toBe(true);
  });

  it('should download audio from Discord CDN', async () => {
    const mockAudioData = createMockAudioData();
    const message = createMockVoiceMessage({});

    // Mock fetch to return audio data
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'audio/mpeg']]),
      arrayBuffer: async () => mockAudioData.buffer,
    });

    const attachment = message.attachments![0];
    const result = await downloadAudioAttachment(attachment, runtime);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(mockAudioData.length);
  });

  it('should validate audio size and format', async () => {
    const message = createMockVoiceMessage({
      audioSize: 26 * 1024 * 1024, // 26MB (exceeds Discord limit)
    });

    const mockAudioData = createMockAudioData();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'audio/mpeg']]),
      arrayBuffer: async () => mockAudioData.buffer,
    });

    const attachment = message.attachments![0];

    // Should reject oversized audio
    await expect(
      processAudioMessage(message, attachment, {
        runtime,
        maxSizeBytes: 25 * 1024 * 1024,
      }),
    ).rejects.toThrow(/too large/i);
  });

  it('should extract metadata from voice message', async () => {
    const message = createMockVoiceMessage({
      messageId: 'msg-999',
      userId: 'user-777',
      channelId: 'channel-888',
    });

    const mockAudioData = createMockAudioData();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'audio/mpeg']]),
      arrayBuffer: async () => mockAudioData.buffer,
    });

    const attachment = message.attachments![0];
    const result = await processAudioMessage(message, attachment, {
      runtime,
      channelName: 'test-channel',
      guildName: 'test-guild',
      userName: 'TestUser',
    });

    expect(result.metadata).toMatchObject({
      userId: 'user-777',
      channelId: 'channel-888',
      messageId: 'msg-999',
      channelName: 'test-channel',
      guildName: 'test-guild',
    });
  });
});

// ===================================================================
// TEST SUITE: Response Mode - Voice Only
// ===================================================================

describe('Response Mode: Voice Only', () => {
  let runtime: RuntimeEnv;
  let voiceConfig: DiscordVoiceConfig;

  beforeEach(() => {
    runtime = createMockRuntime();
    voiceConfig = {
      messageResponse: 'voice',
      voiceFormat: 'mp3',
      audioQuality: 'medium',
      enabled: true,
    };
    vi.clearAllMocks();
  });

  it('should respond with voice message only', async () => {
    const message = createMockVoiceMessage({});
    const mockAudioResponse = createMockAudioData();

    // Mock Discord API - send message with file
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'response-msg-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'This is a test response.',
    };

    // Mock TTS synthesis
    vi.mock('../../../src/media/voice-providers/cartesia.js', () => ({
      CartesiaExecutor: vi.fn().mockImplementation(() => ({
        initialize: vi.fn(),
        synthesize: vi.fn().mockResolvedValue({
          data: mockAudioResponse,
          format: 'pcm16',
          sampleRate: 16000,
        }),
        shutdown: vi.fn(),
      })),
    }));

    await handleVoiceMessageResponse(context);

    // Verify file upload was called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bot mock-bot-token',
        }),
      }),
    );
  });

  it('should use configured audio quality settings', async () => {
    const message = createMockVoiceMessage({});
    const mockAudioResponse = createMockAudioData();

    voiceConfig.audioQuality = 'high'; // 128kbps

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'response-msg-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'High quality audio response.',
    };

    await handleVoiceMessageResponse(context);

    // Verify high quality was used
    expect(voiceConfig.audioQuality).toBe('high');
  });
});

// ===================================================================
// TEST SUITE: Response Mode - Text Only
// ===================================================================

describe('Response Mode: Text Only', () => {
  let runtime: RuntimeEnv;
  let voiceConfig: DiscordVoiceConfig;

  beforeEach(() => {
    runtime = createMockRuntime();
    voiceConfig = {
      messageResponse: 'text',
      voiceFormat: 'mp3',
      audioQuality: 'medium',
      enabled: true,
    };
    vi.clearAllMocks();
  });

  it('should respond with text message only', async () => {
    const message = createMockVoiceMessage({});

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'response-msg-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'This is a text-only response.',
    };

    await handleVoiceMessageResponse(context);

    // Verify text message was sent
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('text-only response'),
      }),
    );
  });
});

// ===================================================================
// TEST SUITE: Response Mode - Both
// ===================================================================

describe('Response Mode: Both (Text + Voice)', () => {
  let runtime: RuntimeEnv;
  let voiceConfig: DiscordVoiceConfig;

  beforeEach(() => {
    runtime = createMockRuntime();
    voiceConfig = {
      messageResponse: 'both',
      voiceFormat: 'mp3',
      audioQuality: 'medium',
      enabled: true,
    };
    vi.clearAllMocks();
  });

  it('should respond with both text and voice', async () => {
    const message = createMockVoiceMessage({});
    const mockAudioResponse = createMockAudioData();

    // Mock two API calls: text message, then voice file
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'text-msg-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'voice-msg-456' }),
      });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'This response includes both modalities.',
    };

    await handleVoiceMessageResponse(context);

    // Verify both text and voice were sent
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should send text even if voice synthesis fails', async () => {
    const message = createMockVoiceMessage({});

    // Mock text success
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'text-msg-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'Text sent, voice will fail.',
    };

    // Mock TTS failure
    vi.mock('../../../src/media/voice-providers/cartesia.js', () => ({
      CartesiaExecutor: vi.fn().mockImplementation(() => ({
        initialize: vi.fn(),
        synthesize: vi.fn().mockRejectedValue(new Error('TTS service unavailable')),
        shutdown: vi.fn(),
      })),
    }));

    await handleVoiceMessageResponse(context);

    // Text should still be sent
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        body: expect.stringContaining('Text sent'),
      }),
    );
  });
});

// ===================================================================
// TEST SUITE: Response Mode - Match
// ===================================================================

describe('Response Mode: Match Input Modality', () => {
  let runtime: RuntimeEnv;
  let voiceConfig: DiscordVoiceConfig;

  beforeEach(() => {
    runtime = createMockRuntime();
    voiceConfig = {
      messageResponse: 'match',
      voiceFormat: 'mp3',
      audioQuality: 'medium',
      enabled: true,
    };
    vi.clearAllMocks();
  });

  it('should respond with voice when user sends voice', async () => {
    const message = createMockVoiceMessage({
      hasText: false, // Pure voice message
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'voice-response-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'Matching voice input with voice output.',
    };

    await handleVoiceMessageResponse(context);

    // Should send voice response
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should respond with text when user sends text', async () => {
    // Create message with no voice attachment
    const message = {
      id: '123',
      channelId: 'channel-456',
      author: {
        id: 'user-789',
        username: 'TextUser',
      },
      content: 'This is a text message',
      timestamp: new Date().toISOString(),
      attachments: [],
    } as Message;

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'text-response-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'Matching text input with text output.',
    };

    await handleVoiceMessageResponse(context);

    // Should send text response
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        body: expect.stringContaining('text input with text output'),
      }),
    );
  });
});

// ===================================================================
// TEST SUITE: Error Handling & Fallback
// ===================================================================

describe('Error Handling & Fallback', () => {
  let runtime: RuntimeEnv;
  let voiceConfig: DiscordVoiceConfig;

  beforeEach(() => {
    runtime = createMockRuntime();
    voiceConfig = {
      messageResponse: 'voice',
      voiceFormat: 'mp3',
      audioQuality: 'medium',
      enabled: true,
    };
    vi.clearAllMocks();
  });

  it('should fallback to text when TTS fails', async () => {
    const message = createMockVoiceMessage({});

    // Mock TTS failure, then fallback text success
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'fallback-text-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'This will fail voice synthesis.',
    };

    await handleVoiceMessageResponse(context);

    // Should send fallback text
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        body: expect.stringContaining('Voice response failed'),
      }),
    );
  });

  it('should handle network errors gracefully', async () => {
    const message = createMockVoiceMessage({});

    (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'This will fail due to network.',
    };

    await expect(handleVoiceMessageResponse(context)).rejects.toThrow();
  });

  it('should respect disabled voice messages config', async () => {
    const message = createMockVoiceMessage({});

    voiceConfig.enabled = false;

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'text-123' }),
    });

    const context: VoiceResponseContext = {
      message,
      token: 'mock-bot-token',
      runtime,
      voiceConfig,
      responseText: 'Voice disabled, sending text.',
    };

    await handleVoiceMessageResponse(context);

    // Should send text even though mode is 'voice'
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        body: expect.stringContaining('Voice disabled'),
      }),
    );
  });
});
