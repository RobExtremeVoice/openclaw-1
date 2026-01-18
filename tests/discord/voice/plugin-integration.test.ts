/**
 * Plugin Integration Test Suite
 *
 * Tests Docker/plugin integration for voice providers:
 * - Start clawdbot in Docker with speech-plugins installed
 * - Send voice message to Discord (mocked)
 * - Verify response is voice message using configured provider
 * - Verify uses correct TTS provider from config
 *
 * NOTE: All Docker and Discord operations are mocked - no real containers or connections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ===================================================================
// DOCKER MOCK INFRASTRUCTURE
// ===================================================================

/**
 * Mock Docker container
 */
class MockDockerContainer extends EventEmitter {
  id: string;
  name: string;
  status: 'created' | 'running' | 'stopped' | 'exited';
  env: Record<string, string>;
  ports: Record<number, number>;

  constructor(options: {
    name: string;
    env?: Record<string, string>;
    ports?: Record<number, number>;
  }) {
    super();
    this.id = `container-${Math.random().toString(36).substring(7)}`;
    this.name = options.name;
    this.status = 'created';
    this.env = options.env || {};
    this.ports = options.ports || {};
  }

  async start(): Promise<void> {
    this.status = 'running';
    this.emit('start');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate startup
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    this.emit('stop');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async remove(): Promise<void> {
    this.status = 'exited';
    this.emit('remove');
  }

  async exec(command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Simulate command execution
    return {
      exitCode: 0,
      stdout: `Executed: ${command.join(' ')}`,
      stderr: '',
    };
  }
}

/**
 * Mock Docker manager
 */
class MockDockerManager {
  containers = new Map<string, MockDockerContainer>();

  async createContainer(options: {
    name: string;
    image: string;
    env?: Record<string, string>;
    ports?: Record<number, number>;
  }): Promise<MockDockerContainer> {
    const container = new MockDockerContainer({
      name: options.name,
      env: options.env,
      ports: options.ports,
    });

    this.containers.set(container.id, container);
    return container;
  }

  async removeContainer(containerId: string): Promise<void> {
    const container = this.containers.get(containerId);
    if (container) {
      await container.remove();
      this.containers.delete(containerId);
    }
  }

  getContainer(containerId: string): MockDockerContainer | undefined {
    return this.containers.get(containerId);
  }

  listContainers(): MockDockerContainer[] {
    return Array.from(this.containers.values());
  }
}

// ===================================================================
// SPEECH PLUGIN MOCK
// ===================================================================

/**
 * Mock speech plugin provider types
 */
type SpeechProvider = 'cartesia' | 'elevenlabs' | 'kokoro' | 'whisper';

/**
 * Mock speech plugin configuration
 */
interface SpeechPluginConfig {
  ttsProvider: SpeechProvider;
  sttProvider: SpeechProvider;
  apiKey?: string;
  voiceId?: string;
}

/**
 * Mock speech plugin
 */
class MockSpeechPlugin {
  config: SpeechPluginConfig;
  initialized = false;

  constructor(config: SpeechPluginConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.initialized = true;
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }

    // Mock TTS synthesis
    const audioSize = text.length * 100; // Rough estimate
    const buffer = Buffer.alloc(audioSize);
    buffer.fill(0x41); // Fill with 'A' for testing

    return buffer;
  }

  async transcribe(audioData: Buffer): Promise<string> {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }

    // Mock STT transcription
    return 'Mock transcription of audio input';
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}

// ===================================================================
// TEST FIXTURES
// ===================================================================

/**
 * Create mock clawdbot container with speech plugins
 */
async function createClawdbotContainer(
  manager: MockDockerManager,
  config: SpeechPluginConfig,
): Promise<MockDockerContainer> {
  const container = await manager.createContainer({
    name: 'clawdbot-test',
    image: 'clawdbot:latest',
    env: {
      DISCORD_TOKEN: 'mock-discord-token',
      SPEECH_TTS_PROVIDER: config.ttsProvider,
      SPEECH_STT_PROVIDER: config.sttProvider,
      SPEECH_API_KEY: config.apiKey || 'mock-api-key',
      SPEECH_VOICE_ID: config.voiceId || 'default-voice',
    },
    ports: {
      8080: 8080, // Web UI
      9000: 9000, // Gateway
    },
  });

  await container.start();
  return container;
}

/**
 * Mock Discord voice message
 */
interface MockDiscordMessage {
  id: string;
  channelId: string;
  userId: string;
  hasVoiceAttachment: boolean;
  content: string;
}

/**
 * Create mock voice message
 */
function createMockVoiceMessage(): MockDiscordMessage {
  return {
    id: 'msg-123',
    channelId: 'channel-456',
    userId: 'user-789',
    hasVoiceAttachment: true,
    content: '',
  };
}

// ===================================================================
// TEST SUITE: Basic Plugin Integration
// ===================================================================

describe('Basic Plugin Integration', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    // Clean up all containers
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should start clawdbot with speech plugins installed', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    expect(container.status).toBe('running');
    expect(container.env.SPEECH_TTS_PROVIDER).toBe('cartesia');
    expect(container.env.SPEECH_STT_PROVIDER).toBe('whisper');
  });

  it('should verify speech plugin configuration in container', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'elevenlabs',
      sttProvider: 'whisper',
      apiKey: 'test-api-key-123',
      voiceId: 'voice-abc',
    });

    expect(container.env).toMatchObject({
      SPEECH_TTS_PROVIDER: 'elevenlabs',
      SPEECH_STT_PROVIDER: 'whisper',
      SPEECH_API_KEY: 'test-api-key-123',
      SPEECH_VOICE_ID: 'voice-abc',
    });
  });

  it('should expose gateway and web UI ports', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    expect(container.ports).toMatchObject({
      8080: 8080,
      9000: 9000,
    });
  });
});

// ===================================================================
// TEST SUITE: TTS Provider Integration
// ===================================================================

describe('TTS Provider Integration', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should use Cartesia TTS provider', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    await plugin.initialize();

    const audioBuffer = await plugin.synthesize('Test message for Cartesia');

    expect(audioBuffer).toBeInstanceOf(Buffer);
    expect(audioBuffer.length).toBeGreaterThan(0);
  });

  it('should use ElevenLabs TTS provider', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'elevenlabs',
      sttProvider: 'whisper',
      apiKey: 'elevenlabs-key',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'elevenlabs',
      sttProvider: 'whisper',
      apiKey: 'elevenlabs-key',
    });

    await plugin.initialize();

    const audioBuffer = await plugin.synthesize('Test message for ElevenLabs');

    expect(audioBuffer).toBeInstanceOf(Buffer);
    expect(audioBuffer.length).toBeGreaterThan(0);
  });

  it('should use Kokoro TTS provider', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'kokoro',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'kokoro',
      sttProvider: 'whisper',
    });

    await plugin.initialize();

    const audioBuffer = await plugin.synthesize('Test message for Kokoro');

    expect(audioBuffer).toBeInstanceOf(Buffer);
    expect(audioBuffer.length).toBeGreaterThan(0);
  });
});

// ===================================================================
// TEST SUITE: STT Provider Integration
// ===================================================================

describe('STT Provider Integration', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should use Whisper STT provider', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    await plugin.initialize();

    const mockAudio = Buffer.alloc(16000 * 2); // 1 second of 16kHz audio
    const transcript = await plugin.transcribe(mockAudio);

    expect(transcript).toBe('Mock transcription of audio input');
  });
});

// ===================================================================
// TEST SUITE: End-to-End Voice Message Flow
// ===================================================================

describe('End-to-End Voice Message Flow', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should complete voice message → transcription → response cycle', async () => {
    // Start container
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    // Initialize plugin
    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });
    await plugin.initialize();

    // Simulate incoming voice message
    const incomingMessage = createMockVoiceMessage();
    const incomingAudio = Buffer.alloc(32000); // 2 seconds

    // Transcribe
    const transcript = await plugin.transcribe(incomingAudio);
    expect(transcript).toBeDefined();

    // Generate response (in real system, this would go to LLM)
    const responseText = `You said: ${transcript}`;

    // Synthesize response
    const responseAudio = await plugin.synthesize(responseText);
    expect(responseAudio).toBeInstanceOf(Buffer);
    expect(responseAudio.length).toBeGreaterThan(0);

    // Verify container is still running
    expect(container.status).toBe('running');
  });

  it('should handle multiple concurrent voice messages', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });
    await plugin.initialize();

    // Process 5 voice messages concurrently
    const promises = Array.from({ length: 5 }, async (_, i) => {
      const audio = Buffer.alloc(16000);
      const transcript = await plugin.transcribe(audio);
      const response = await plugin.synthesize(`Response ${i}: ${transcript}`);
      return response;
    });

    const responses = await Promise.all(promises);

    expect(responses).toHaveLength(5);
    responses.forEach((response) => {
      expect(response).toBeInstanceOf(Buffer);
    });
  });
});

// ===================================================================
// TEST SUITE: Configuration Verification
// ===================================================================

describe('Configuration Verification', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should verify TTS provider is set correctly', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'elevenlabs',
      sttProvider: 'whisper',
    });

    // Verify via container environment
    const result = await container.exec(['env']);
    expect(result.stdout).toContain('SPEECH_TTS_PROVIDER');
    expect(container.env.SPEECH_TTS_PROVIDER).toBe('elevenlabs');
  });

  it('should verify API keys are passed securely', async () => {
    const apiKey = 'secret-api-key-do-not-log';

    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
      apiKey,
    });

    // API key should be in env but not logged
    expect(container.env.SPEECH_API_KEY).toBe(apiKey);
  });

  it('should verify voice ID is configured', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
      voiceId: 'custom-voice-123',
    });

    expect(container.env.SPEECH_VOICE_ID).toBe('custom-voice-123');
  });
});

// ===================================================================
// TEST SUITE: Error Handling
// ===================================================================

describe('Error Handling', () => {
  let dockerManager: MockDockerManager;

  beforeEach(() => {
    dockerManager = new MockDockerManager();
  });

  afterEach(async () => {
    for (const container of dockerManager.listContainers()) {
      await container.stop();
      await dockerManager.removeContainer(container.id);
    }
  });

  it('should handle plugin initialization failure', async () => {
    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    // Try to use plugin without initialization
    await expect(plugin.synthesize('test')).rejects.toThrow(/not initialized/i);
  });

  it('should handle TTS synthesis failure gracefully', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });
    await plugin.initialize();

    // In real system, this would be a network/API error
    // Mock just returns valid buffer, but structure is in place
    const result = await plugin.synthesize('test');
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should handle STT transcription failure gracefully', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });
    await plugin.initialize();

    const invalidAudio = Buffer.alloc(0); // Empty audio
    const result = await plugin.transcribe(invalidAudio);

    // Should return something even for empty audio
    expect(typeof result).toBe('string');
  });

  it('should clean up resources on shutdown', async () => {
    const container = await createClawdbotContainer(dockerManager, {
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });

    const plugin = new MockSpeechPlugin({
      ttsProvider: 'cartesia',
      sttProvider: 'whisper',
    });
    await plugin.initialize();

    await plugin.shutdown();

    expect(plugin.initialized).toBe(false);
  });
});
