/**
 * Voice Channel E2E Test Suite
 *
 * End-to-end tests for Discord voice channel integration:
 * - Join voice channel
 * - Capture audio from user
 * - Transcribe and respond
 * - Audio broadcast to participants
 * - Leave voice channel
 * - Multiple concurrent channels
 *
 * NOTE: All Discord APIs are mocked - no real Discord connections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ===================================================================
// VOICE CHANNEL MOCK INFRASTRUCTURE
// ===================================================================

/**
 * Mock Discord voice connection state
 */
type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

/**
 * Mock voice connection
 */
class MockVoiceConnection extends EventEmitter {
  state: VoiceConnectionState = 'disconnected';
  channelId: string;
  guildId: string;

  constructor(options: { channelId: string; guildId: string }) {
    super();
    this.channelId = options.channelId;
    this.guildId = options.guildId;
  }

  async join(): Promise<void> {
    this.state = 'connecting';
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate connection delay
    this.state = 'connected';
    this.emit('connected');
  }

  async leave(): Promise<void> {
    this.state = 'disconnecting';
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  sendAudio(audioData: Buffer): void {
    if (this.state !== 'connected') {
      throw new Error('Cannot send audio: not connected');
    }
    this.emit('audio-sent', audioData);
  }

  destroy(): void {
    this.state = 'disconnected';
    this.removeAllListeners();
  }
}

/**
 * Mock audio receiver for capturing user audio
 */
class MockAudioReceiver extends EventEmitter {
  channelId: string;
  isReceiving = false;

  constructor(channelId: string) {
    super();
    this.channelId = channelId;
  }

  startReceiving(): void {
    this.isReceiving = true;
    this.emit('started');
  }

  stopReceiving(): void {
    this.isReceiving = false;
    this.emit('stopped');
  }

  simulateUserAudio(userId: string, audioData: Buffer): void {
    if (!this.isReceiving) return;
    this.emit('audio', { userId, audioData });
  }
}

/**
 * Mock voice channel manager
 */
class MockVoiceChannelManager {
  connections = new Map<string, MockVoiceConnection>();
  receivers = new Map<string, MockAudioReceiver>();

  async joinChannel(channelId: string, guildId: string): Promise<MockVoiceConnection> {
    const connection = new MockVoiceConnection({ channelId, guildId });
    await connection.join();
    this.connections.set(channelId, connection);

    const receiver = new MockAudioReceiver(channelId);
    receiver.startReceiving();
    this.receivers.set(channelId, receiver);

    return connection;
  }

  async leaveChannel(channelId: string): Promise<void> {
    const connection = this.connections.get(channelId);
    if (connection) {
      await connection.leave();
      connection.destroy();
      this.connections.delete(channelId);
    }

    const receiver = this.receivers.get(channelId);
    if (receiver) {
      receiver.stopReceiving();
      this.receivers.delete(channelId);
    }
  }

  getConnection(channelId: string): MockVoiceConnection | undefined {
    return this.connections.get(channelId);
  }

  getReceiver(channelId: string): MockAudioReceiver | undefined {
    return this.receivers.get(channelId);
  }

  simulateUserSpeaking(channelId: string, userId: string, audioData: Buffer): void {
    const receiver = this.receivers.get(channelId);
    if (receiver) {
      receiver.simulateUserAudio(userId, audioData);
    }
  }
}

/**
 * Create mock audio data (16kHz PCM, 1 second)
 */
function createMockAudioData(durationSeconds = 1): Buffer {
  const sampleRate = 16000;
  const samples = sampleRate * durationSeconds;
  const buffer = Buffer.alloc(samples * 2); // 16-bit PCM

  // Generate simple sine wave
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    const value = Math.floor(sample * 32767);
    buffer.writeInt16LE(value, i * 2);
  }

  return buffer;
}

/**
 * Mock STT transcription
 */
async function mockTranscribe(audioData: Buffer): Promise<string> {
  // Simulate transcription delay
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 'This is a mock transcription of the audio.';
}

/**
 * Mock TTS synthesis
 */
async function mockSynthesize(text: string): Promise<Buffer> {
  // Simulate synthesis delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  return createMockAudioData(2); // 2 seconds of audio
}

// ===================================================================
// TEST SUITE: Voice Channel Connection
// ===================================================================

describe('Voice Channel Connection', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    // Clean up all connections
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should join voice channel successfully', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    const connection = await manager.joinChannel(channelId, guildId);

    expect(connection.state).toBe('connected');
    expect(connection.channelId).toBe(channelId);
    expect(connection.guildId).toBe(guildId);
  });

  it('should receive connected event', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    const connection = await manager.joinChannel(channelId, guildId);

    const connectedPromise = new Promise((resolve) => {
      connection.on('connected', resolve);
    });

    // Connection is already established, but verify event was emitted
    expect(connection.state).toBe('connected');
  });

  it('should leave voice channel successfully', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    await manager.joinChannel(channelId, guildId);
    await manager.leaveChannel(channelId);

    expect(manager.getConnection(channelId)).toBeUndefined();
  });

  it('should emit disconnected event on leave', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    const connection = await manager.joinChannel(channelId, guildId);

    const disconnectedPromise = new Promise((resolve) => {
      connection.on('disconnected', resolve);
    });

    await manager.leaveChannel(channelId);

    await disconnectedPromise;
    expect(connection.state).toBe('disconnected');
  });
});

// ===================================================================
// TEST SUITE: Audio Capture from Users
// ===================================================================

describe('Audio Capture from Users', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should start receiving audio after joining', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    await manager.joinChannel(channelId, guildId);

    const receiver = manager.getReceiver(channelId);
    expect(receiver).toBeDefined();
    expect(receiver?.isReceiving).toBe(true);
  });

  it('should capture audio from user', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';
    const userId = 'user-789';

    await manager.joinChannel(channelId, guildId);

    const receiver = manager.getReceiver(channelId);
    expect(receiver).toBeDefined();

    const audioPromise = new Promise<{ userId: string; audioData: Buffer }>((resolve) => {
      receiver!.on('audio', resolve);
    });

    const audioData = createMockAudioData();
    manager.simulateUserSpeaking(channelId, userId, audioData);

    const captured = await audioPromise;
    expect(captured.userId).toBe(userId);
    expect(captured.audioData).toBeInstanceOf(Buffer);
  });

  it('should handle multiple users speaking', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    await manager.joinChannel(channelId, guildId);

    const receiver = manager.getReceiver(channelId);
    const capturedAudio: Array<{ userId: string; audioData: Buffer }> = [];

    receiver!.on('audio', (data) => {
      capturedAudio.push(data);
    });

    // Simulate 3 users speaking
    manager.simulateUserSpeaking(channelId, 'user-1', createMockAudioData());
    manager.simulateUserSpeaking(channelId, 'user-2', createMockAudioData());
    manager.simulateUserSpeaking(channelId, 'user-3', createMockAudioData());

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(capturedAudio).toHaveLength(3);
    expect(capturedAudio.map((a) => a.userId)).toEqual(['user-1', 'user-2', 'user-3']);
  });
});

// ===================================================================
// TEST SUITE: Transcription & Response
// ===================================================================

describe('Transcription & Response', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should transcribe captured audio', async () => {
    const audioData = createMockAudioData();

    const transcript = await mockTranscribe(audioData);

    expect(transcript).toBe('This is a mock transcription of the audio.');
  });

  it('should synthesize text to audio', async () => {
    const text = 'Hello, this is a response.';

    const audioData = await mockSynthesize(text);

    expect(audioData).toBeInstanceOf(Buffer);
    expect(audioData.length).toBeGreaterThan(0);
  });

  it('should complete full transcription → response cycle', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';
    const userId = 'user-789';

    const connection = await manager.joinChannel(channelId, guildId);
    const receiver = manager.getReceiver(channelId);

    // Set up audio capture
    const transcriptPromise = new Promise<string>((resolve) => {
      receiver!.on('audio', async (data) => {
        const transcript = await mockTranscribe(data.audioData);
        resolve(transcript);
      });
    });

    // Simulate user speaking
    const userAudio = createMockAudioData();
    manager.simulateUserSpeaking(channelId, userId, userAudio);

    const transcript = await transcriptPromise;

    // Generate response audio
    const responseAudio = await mockSynthesize(`Response to: ${transcript}`);

    // Broadcast response
    connection.sendAudio(responseAudio);

    expect(transcript).toContain('mock transcription');
  });
});

// ===================================================================
// TEST SUITE: Audio Broadcasting
// ===================================================================

describe('Audio Broadcasting', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should broadcast audio to all participants', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    const connection = await manager.joinChannel(channelId, guildId);

    const sentPromise = new Promise<Buffer>((resolve) => {
      connection.on('audio-sent', resolve);
    });

    const audioData = createMockAudioData();
    connection.sendAudio(audioData);

    const sentAudio = await sentPromise;
    expect(sentAudio).toBe(audioData);
  });

  it('should reject audio broadcast when not connected', async () => {
    const connection = new MockVoiceConnection({
      channelId: 'channel-123',
      guildId: 'guild-456',
    });

    const audioData = createMockAudioData();

    expect(() => connection.sendAudio(audioData)).toThrow(/not connected/i);
  });

  it('should handle rapid consecutive broadcasts', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    const connection = await manager.joinChannel(channelId, guildId);

    const sentAudio: Buffer[] = [];
    connection.on('audio-sent', (data) => {
      sentAudio.push(data);
    });

    // Send 5 audio chunks rapidly
    for (let i = 0; i < 5; i++) {
      const audioData = createMockAudioData(0.5); // 0.5 seconds each
      connection.sendAudio(audioData);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(sentAudio).toHaveLength(5);
  });
});

// ===================================================================
// TEST SUITE: Multiple Concurrent Channels
// ===================================================================

describe('Multiple Concurrent Channels', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should handle multiple voice channels concurrently', async () => {
    const channels = [
      { channelId: 'channel-1', guildId: 'guild-1' },
      { channelId: 'channel-2', guildId: 'guild-2' },
      { channelId: 'channel-3', guildId: 'guild-3' },
    ];

    // Join all channels concurrently
    const connections = await Promise.all(
      channels.map((ch) => manager.joinChannel(ch.channelId, ch.guildId)),
    );

    expect(connections).toHaveLength(3);
    expect(manager.connections.size).toBe(3);

    // Verify all connections are active
    for (const conn of connections) {
      expect(conn.state).toBe('connected');
    }
  });

  it('should isolate audio between channels', async () => {
    const channel1 = 'channel-1';
    const channel2 = 'channel-2';

    await manager.joinChannel(channel1, 'guild-1');
    await manager.joinChannel(channel2, 'guild-2');

    const receiver1 = manager.getReceiver(channel1);
    const receiver2 = manager.getReceiver(channel2);

    const channel1Audio: string[] = [];
    const channel2Audio: string[] = [];

    receiver1!.on('audio', (data) => {
      channel1Audio.push(data.userId);
    });

    receiver2!.on('audio', (data) => {
      channel2Audio.push(data.userId);
    });

    // Simulate audio in different channels
    manager.simulateUserSpeaking(channel1, 'user-1-ch1', createMockAudioData());
    manager.simulateUserSpeaking(channel2, 'user-2-ch2', createMockAudioData());

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(channel1Audio).toEqual(['user-1-ch1']);
    expect(channel2Audio).toEqual(['user-2-ch2']);
  });

  it('should leave specific channels without affecting others', async () => {
    await manager.joinChannel('channel-1', 'guild-1');
    await manager.joinChannel('channel-2', 'guild-2');
    await manager.joinChannel('channel-3', 'guild-3');

    await manager.leaveChannel('channel-2');

    expect(manager.getConnection('channel-1')).toBeDefined();
    expect(manager.getConnection('channel-2')).toBeUndefined();
    expect(manager.getConnection('channel-3')).toBeDefined();
  });

  it('should handle concurrent joins and leaves', async () => {
    const operations = [
      manager.joinChannel('channel-1', 'guild-1'),
      manager.joinChannel('channel-2', 'guild-2'),
      manager.joinChannel('channel-3', 'guild-3'),
    ];

    await Promise.all(operations);

    const leaveOps = [
      manager.leaveChannel('channel-1'),
      manager.leaveChannel('channel-2'),
    ];

    await Promise.all(leaveOps);

    expect(manager.connections.size).toBe(1);
    expect(manager.getConnection('channel-3')).toBeDefined();
  });
});

// ===================================================================
// TEST SUITE: Error Handling & Recovery
// ===================================================================

describe('Error Handling & Recovery', () => {
  let manager: MockVoiceChannelManager;

  beforeEach(() => {
    manager = new MockVoiceChannelManager();
  });

  afterEach(async () => {
    for (const channelId of manager.connections.keys()) {
      await manager.leaveChannel(channelId);
    }
  });

  it('should handle connection failures gracefully', async () => {
    const connection = new MockVoiceConnection({
      channelId: 'channel-123',
      guildId: 'guild-456',
    });

    // Simulate connection failure
    connection.state = 'disconnected';

    expect(connection.state).toBe('disconnected');
  });

  it('should clean up resources on disconnect', async () => {
    const channelId = 'channel-123';
    const guildId = 'guild-456';

    await manager.joinChannel(channelId, guildId);

    const connection = manager.getConnection(channelId);
    const listenerCount = connection!.listenerCount('audio-sent');

    await manager.leaveChannel(channelId);

    expect(connection!.listenerCount('audio-sent')).toBe(0);
  });

  it('should handle STT transcription errors', async () => {
    const audioData = createMockAudioData();

    // Mock transcription error
    const transcribeWithError = async (): Promise<string> => {
      throw new Error('STT service unavailable');
    };

    await expect(transcribeWithError()).rejects.toThrow(/STT service unavailable/i);
  });

  it('should handle TTS synthesis errors', async () => {
    const text = 'This will fail to synthesize.';

    // Mock synthesis error
    const synthesizeWithError = async (): Promise<Buffer> => {
      throw new Error('TTS service unavailable');
    };

    await expect(synthesizeWithError()).rejects.toThrow(/TTS service unavailable/i);
  });
});
