/**
 * Response Mode Integration Test Suite
 *
 * Tests voice/text/both/match response modes with:
 * - Both message and channel inputs
 * - Per-user/channel/guild overrides
 * - Match mode detection for voice-channel input
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type DiscordVoiceConfig,
  type VoiceResponseType,
  type InputModality,
  resolveVoiceResponseType,
  detectInputModality,
  DEFAULT_VOICE_CONFIG,
} from '../../../src/discord/voice/config.js';

// ===================================================================
// TEST DATA & HELPERS
// ===================================================================

/**
 * Create test voice config with specific settings
 */
function createTestConfig(
  baseResponse: VoiceResponseType,
  overrides?: {
    perGuildOverride?: Record<string, VoiceResponseType>;
    perChannelOverride?: Record<string, VoiceResponseType>;
    perUserOverride?: Record<string, VoiceResponseType>;
  },
): DiscordVoiceConfig {
  return {
    ...DEFAULT_VOICE_CONFIG,
    messageResponse: baseResponse,
    perGuildOverride: overrides?.perGuildOverride,
    perChannelOverride: overrides?.perChannelOverride,
    perUserOverride: overrides?.perUserOverride,
  };
}

/**
 * Create test context for resolution
 */
interface TestContext {
  guildId?: string;
  channelId?: string;
  userId?: string;
  inputModality?: InputModality;
}

// ===================================================================
// TEST SUITE: Input Modality Detection
// ===================================================================

describe('Input Modality Detection', () => {
  it('should detect voice attachment as voice modality', () => {
    const modality = detectInputModality({
      hasVoiceAttachment: true,
      isVoiceChannel: false,
    });

    expect(modality).toBe('voice');
  });

  it('should detect voice channel as voice-channel modality', () => {
    const modality = detectInputModality({
      hasVoiceAttachment: false,
      isVoiceChannel: true,
    });

    expect(modality).toBe('voice-channel');
  });

  it('should detect text message as text modality', () => {
    const modality = detectInputModality({
      hasVoiceAttachment: false,
      isVoiceChannel: false,
    });

    expect(modality).toBe('text');
  });

  it('should prioritize voice attachment over channel type', () => {
    const modality = detectInputModality({
      hasVoiceAttachment: true,
      isVoiceChannel: true,
    });

    expect(modality).toBe('voice');
  });
});

// ===================================================================
// TEST SUITE: Voice Mode (All Contexts)
// ===================================================================

describe('Voice Mode: Always Respond with Voice', () => {
  let config: DiscordVoiceConfig;

  beforeEach(() => {
    config = createTestConfig('voice');
  });

  it('should respond with voice for voice message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice',
    });

    expect(responseType).toBe('voice');
  });

  it('should respond with voice for text message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'text',
    });

    expect(responseType).toBe('voice');
  });

  it('should respond with voice for voice-channel message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice-channel',
    });

    expect(responseType).toBe('voice');
  });
});

// ===================================================================
// TEST SUITE: Text Mode (All Contexts)
// ===================================================================

describe('Text Mode: Always Respond with Text', () => {
  let config: DiscordVoiceConfig;

  beforeEach(() => {
    config = createTestConfig('text');
  });

  it('should respond with text for voice message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice',
    });

    expect(responseType).toBe('text');
  });

  it('should respond with text for text message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'text',
    });

    expect(responseType).toBe('text');
  });

  it('should respond with text for voice-channel message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice-channel',
    });

    expect(responseType).toBe('text');
  });
});

// ===================================================================
// TEST SUITE: Both Mode (All Contexts)
// ===================================================================

describe('Both Mode: Always Respond with Text + Voice', () => {
  let config: DiscordVoiceConfig;

  beforeEach(() => {
    config = createTestConfig('both');
  });

  it('should respond with both for voice message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice',
    });

    expect(responseType).toBe('both');
  });

  it('should respond with both for text message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'text',
    });

    expect(responseType).toBe('both');
  });

  it('should respond with both for voice-channel message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice-channel',
    });

    expect(responseType).toBe('both');
  });
});

// ===================================================================
// TEST SUITE: Match Mode (Input-Dependent)
// ===================================================================

describe('Match Mode: Respond in Same Modality as Input', () => {
  let config: DiscordVoiceConfig;

  beforeEach(() => {
    config = createTestConfig('match');
  });

  it('should respond with voice for voice message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice',
    });

    expect(responseType).toBe('voice');
  });

  it('should respond with text for text message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'text',
    });

    expect(responseType).toBe('text');
  });

  it('should respond with voice for voice-channel message', () => {
    const responseType = resolveVoiceResponseType(config, {
      inputModality: 'voice-channel',
    });

    expect(responseType).toBe('voice');
  });

  it('should default to text when modality is unknown', () => {
    const responseType = resolveVoiceResponseType(config, {
      // No inputModality provided
    });

    expect(responseType).toBe('text');
  });
});

// ===================================================================
// TEST SUITE: Per-Guild Overrides
// ===================================================================

describe('Per-Guild Overrides', () => {
  it('should override global default with guild setting', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-123': 'voice',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      inputModality: 'text',
    });

    expect(responseType).toBe('voice');
  });

  it('should use global default when guild has no override', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-456': 'voice',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      guildId: 'guild-999', // Different guild
      inputModality: 'text',
    });

    expect(responseType).toBe('text'); // Falls back to global
  });

  it('should handle match mode in guild override', () => {
    const config = createTestConfig('voice', {
      perGuildOverride: {
        'guild-123': 'match',
      },
    });

    const voiceResponse = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      inputModality: 'voice',
    });

    const textResponse = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      inputModality: 'text',
    });

    expect(voiceResponse).toBe('voice');
    expect(textResponse).toBe('text');
  });
});

// ===================================================================
// TEST SUITE: Per-Channel Overrides
// ===================================================================

describe('Per-Channel Overrides', () => {
  it('should override guild setting with channel setting', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-123': 'voice',
      },
      perChannelOverride: {
        'channel-789': 'both',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      channelId: 'channel-789',
      inputModality: 'text',
    });

    expect(responseType).toBe('both'); // Channel override wins
  });

  it('should use guild override when channel has no override', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-123': 'voice',
      },
      perChannelOverride: {
        'channel-456': 'both',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      channelId: 'channel-999', // Different channel
      inputModality: 'text',
    });

    expect(responseType).toBe('voice'); // Falls back to guild override
  });
});

// ===================================================================
// TEST SUITE: Per-User Overrides
// ===================================================================

describe('Per-User Overrides', () => {
  it('should override channel setting with user setting', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-123': 'voice',
      },
      perChannelOverride: {
        'channel-789': 'both',
      },
      perUserOverride: {
        'user-555': 'text',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      guildId: 'guild-123',
      channelId: 'channel-789',
      userId: 'user-555',
      inputModality: 'voice',
    });

    expect(responseType).toBe('text'); // User override wins
  });

  it('should use channel override when user has no override', () => {
    const config = createTestConfig('text', {
      perChannelOverride: {
        'channel-789': 'both',
      },
      perUserOverride: {
        'user-555': 'voice',
      },
    });

    const responseType = resolveVoiceResponseType(config, {
      channelId: 'channel-789',
      userId: 'user-999', // Different user
      inputModality: 'text',
    });

    expect(responseType).toBe('both'); // Falls back to channel override
  });

  it('should handle match mode in user override', () => {
    const config = createTestConfig('voice', {
      perUserOverride: {
        'user-123': 'match',
      },
    });

    const voiceResponse = resolveVoiceResponseType(config, {
      userId: 'user-123',
      inputModality: 'voice',
    });

    const textResponse = resolveVoiceResponseType(config, {
      userId: 'user-123',
      inputModality: 'text',
    });

    expect(voiceResponse).toBe('voice');
    expect(textResponse).toBe('text');
  });
});

// ===================================================================
// TEST SUITE: Override Priority Chain
// ===================================================================

describe('Override Priority Chain', () => {
  it('should follow priority: user > channel > guild > global', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'guild-1': 'voice',
      },
      perChannelOverride: {
        'channel-1': 'both',
      },
      perUserOverride: {
        'user-1': 'text',
      },
    });

    // User override (highest priority)
    expect(
      resolveVoiceResponseType(config, {
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
      }),
    ).toBe('text');

    // Channel override (user not specified)
    expect(
      resolveVoiceResponseType(config, {
        guildId: 'guild-1',
        channelId: 'channel-1',
      }),
    ).toBe('both');

    // Guild override (channel not specified)
    expect(
      resolveVoiceResponseType(config, {
        guildId: 'guild-1',
      }),
    ).toBe('voice');

    // Global default (no context)
    expect(resolveVoiceResponseType(config, {})).toBe('text');
  });
});

// ===================================================================
// TEST SUITE: Cross-Context Match Mode
// ===================================================================

describe('Cross-Context Match Mode', () => {
  let config: DiscordVoiceConfig;

  beforeEach(() => {
    config = createTestConfig('match');
  });

  it('should match voice message in any channel', () => {
    const responseType = resolveVoiceResponseType(config, {
      channelId: 'any-channel',
      inputModality: 'voice',
    });

    expect(responseType).toBe('voice');
  });

  it('should match text message in any guild', () => {
    const responseType = resolveVoiceResponseType(config, {
      guildId: 'any-guild',
      inputModality: 'text',
    });

    expect(responseType).toBe('text');
  });

  it('should match voice-channel message for any user', () => {
    const responseType = resolveVoiceResponseType(config, {
      userId: 'any-user',
      inputModality: 'voice-channel',
    });

    expect(responseType).toBe('voice');
  });
});

// ===================================================================
// TEST SUITE: Real-World Scenarios
// ===================================================================

describe('Real-World Scenarios', () => {
  it('scenario: support channel always uses text', () => {
    const config = createTestConfig('match', {
      perChannelOverride: {
        'support-channel': 'text', // Support staff prefer text logs
      },
    });

    // Even if user sends voice, respond with text in support channel
    expect(
      resolveVoiceResponseType(config, {
        channelId: 'support-channel',
        inputModality: 'voice',
      }),
    ).toBe('text');
  });

  it('scenario: accessibility user prefers voice responses', () => {
    const config = createTestConfig('text', {
      perUserOverride: {
        'accessibility-user': 'voice', // Screen reader user prefers audio
      },
    });

    // Even in text-only guild, this user gets voice
    expect(
      resolveVoiceResponseType(config, {
        userId: 'accessibility-user',
        inputModality: 'text',
      }),
    ).toBe('voice');
  });

  it('scenario: voice-only guild for audio community', () => {
    const config = createTestConfig('text', {
      perGuildOverride: {
        'audio-guild': 'voice', // Podcast/music community
      },
    });

    // All responses in this guild are voice
    expect(
      resolveVoiceResponseType(config, {
        guildId: 'audio-guild',
        inputModality: 'text',
      }),
    ).toBe('voice');
  });

  it('scenario: announcements channel uses both for visibility', () => {
    const config = createTestConfig('match', {
      perChannelOverride: {
        'announcements': 'both', // Important messages in both formats
      },
    });

    // Announcements always get both text and voice
    expect(
      resolveVoiceResponseType(config, {
        channelId: 'announcements',
        inputModality: 'text',
      }),
    ).toBe('both');
  });
});
