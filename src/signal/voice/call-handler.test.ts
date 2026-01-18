/**
 * Tests for Signal Voice Call Handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalVoiceCallHandler } from './call-handler.js';
import type { SignalRpcOptions } from '../client.js';
import type { VoiceCall } from './call-handler.js';

// Mock Signal RPC
vi.mock('../client.js', () => ({
  signalRpcRequest: vi.fn(),
}));

import { signalRpcRequest } from '../client.js';

describe('SignalVoiceCallHandler', () => {
  let handler: SignalVoiceCallHandler;
  let rpcOptions: SignalRpcOptions;
  let mockRuntime: any;

  beforeEach(() => {
    rpcOptions = {
      baseUrl: 'http://localhost:8080',
    };

    mockRuntime = {
      log: vi.fn(),
      error: vi.fn(),
    };

    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (handler) {
      await handler.cleanup();
    }
  });

  describe('initialization', () => {
    it('should create handler with default config', () => {
      handler = new SignalVoiceCallHandler(rpcOptions);
      expect(handler).toBeDefined();
      expect(handler.isOnCall()).toBe(false);
    });

    it('should create handler with custom config', () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        {
          autoAcceptCalls: true,
          maxDurationMs: 5 * 60 * 1000, // 5 minutes
          enableGroupCalls: true,
        },
        mockRuntime,
      );

      expect(handler).toBeDefined();
    });
  });

  describe('incoming calls', () => {
    beforeEach(() => {
      handler = new SignalVoiceCallHandler(rpcOptions, {}, mockRuntime);
    });

    it('should handle incoming 1:1 call', async () => {
      const incomingPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:incoming', (call) => {
          resolve(call);
        });
      });

      const call = await handler.handleIncomingCall({
        callId: 'test-call-1',
        caller: '+15551234567',
        callerUuid: 'uuid-caller',
      });

      expect(call).toBeDefined();
      expect(call.callId).toBe('test-call-1');
      expect(call.caller).toBe('+15551234567');
      expect(call.type).toBe('1:1');
      expect(call.state).toBe('ringing');
      expect(call.encrypted).toBe(true);
      expect(call.encryptionVerified).toBe(false); // Not yet verified

      // Wait for event with timeout
      const emittedCall = await Promise.race([
        incomingPromise,
        new Promise<VoiceCall>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
      expect(emittedCall.callId).toBe('test-call-1');
    });

    it('should handle incoming group call', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { enableGroupCalls: true },
        mockRuntime,
      );

      const call = await handler.handleIncomingCall({
        callId: 'test-call-2',
        caller: '+15551234567',
        callerUuid: 'uuid-caller',
        groupId: 'group-123',
        groupName: 'Test Group',
      });

      expect(call.type).toBe('group');
      expect(call.groupId).toBe('group-123');
      expect(call.groupName).toBe('Test Group');
    });

    it('should reject group call when disabled', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { enableGroupCalls: false },
        mockRuntime,
      );

      await expect(
        handler.handleIncomingCall({
          callId: 'test-call-3',
          caller: '+15551234567',
          groupId: 'group-123',
        }),
      ).rejects.toThrow('Group calls are disabled');
    });

    it('should reject call when already on a call', async () => {
      await handler.handleIncomingCall({
        callId: 'test-call-1',
        caller: '+15551234567',
      });

      await expect(
        handler.handleIncomingCall({
          callId: 'test-call-2',
          caller: '+15559876543',
        }),
      ).rejects.toThrow('Already on an active call');
    });

    it('should enforce caller allowlist', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { allowedCallers: ['+15551111111', '+15552222222'] },
        mockRuntime,
      );

      await expect(
        handler.handleIncomingCall({
          callId: 'test-call-3',
          caller: '+15559999999', // Not in allowlist
        }),
      ).rejects.toThrow('not in allowlist');
    });

    it('should allow caller in allowlist by phone', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { allowedCallers: ['+15551234567'] },
        mockRuntime,
      );

      const call = await handler.handleIncomingCall({
        callId: 'test-call-4',
        caller: '+15551234567',
      });

      expect(call.caller).toBe('+15551234567');
    });

    it('should allow caller in allowlist by UUID', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { allowedCallers: ['uuid-caller-123'] },
        mockRuntime,
      );

      const call = await handler.handleIncomingCall({
        callId: 'test-call-5',
        caller: '+15559999999',
        callerUuid: 'uuid-caller-123',
      });

      expect(call.callerUuid).toBe('uuid-caller-123');
    });
  });

  describe('accepting calls', () => {
    beforeEach(() => {
      handler = new SignalVoiceCallHandler(rpcOptions, {}, mockRuntime);
    });

    it('should accept call with encryption verification', async () => {
      await handler.handleIncomingCall({
        callId: 'test-call-6',
        caller: '+15551234567',
      });

      const acceptedPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:accepted', (call) => {
          resolve(call);
        });
      });

      const verifiedPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:encryption-verified', (call) => {
          resolve(call);
        });
      });

      // Mock successful accept with encryption verified
      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
        encryptionFingerprint: 'fingerprint-abc123',
      });

      await handler.acceptCall();

      // Wait for both events with timeout
      const [acceptedCall, verifiedCall] = await Promise.all([
        Promise.race([
          acceptedPromise,
          new Promise<VoiceCall>((_, reject) =>
            setTimeout(() => reject(new Error('Event timeout')), 5000)
          ),
        ]),
        Promise.race([
          verifiedPromise,
          new Promise<VoiceCall>((_, reject) =>
            setTimeout(() => reject(new Error('Event timeout')), 5000)
          ),
        ]),
      ]);

      expect(acceptedCall.state).toBe('connected');
      expect(acceptedCall.encryptionVerified).toBe(true);
      expect(verifiedCall.encryptionFingerprint).toBe('fingerprint-abc123');
    });

    it('should fail when encryption verification required but not verified', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { requireEncryptionVerification: true },
        mockRuntime,
      );

      await handler.handleIncomingCall({
        callId: 'test-call-7',
        caller: '+15551234567',
      });

      const failedPromise = new Promise<[VoiceCall, Error]>((resolve) => {
        handler.on('call:failed', (call, error) => {
          resolve([call, error]);
        });
      });

      // Mock accept without encryption verification
      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: false,
      });

      await expect(handler.acceptCall()).rejects.toThrow('verification failed');

      // Wait for failed event with timeout
      const [failedCall, error] = await Promise.race([
        failedPromise,
        new Promise<[VoiceCall, Error]>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
      expect(failedCall.state).toBe('failed');
      expect(failedCall.errorCode).toBe('ENCRYPTION_NOT_VERIFIED');
    });

    it('should accept call even without verification if not required', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { requireEncryptionVerification: false },
        mockRuntime,
      );

      await handler.handleIncomingCall({
        callId: 'test-call-8',
        caller: '+15551234567',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: false,
      });

      await handler.acceptCall();

      const currentCall = handler.getCurrentCall();
      expect(currentCall?.state).toBe('connected');
      expect(currentCall?.encryptionVerified).toBe(false);
    });

    it('should reject accept when no incoming call', async () => {
      await expect(handler.acceptCall()).rejects.toThrow('No incoming call');
    });
  });

  describe('audio stream', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallHandler(rpcOptions, {}, mockRuntime);

      await handler.handleIncomingCall({
        callId: 'test-call-9',
        caller: '+15551234567',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
      });

      await handler.acceptCall();
    });

    it('should establish encrypted audio stream', async () => {
      const audioReadyPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:audio-ready', (call) => {
          resolve(call);
        });
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        streamId: 'stream-123',
        format: 'opus',
        sampleRate: 48000,
        channels: 1,
      });

      const stream = await handler.establishAudioStream();

      expect(stream.format).toBe('opus');
      expect(stream.sampleRate).toBe(48000);
      expect(stream.streamId).toBe('stream-123');

      // Wait for audio ready event with timeout
      await Promise.race([
        audioReadyPromise,
        new Promise<VoiceCall>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
    });

    it('should fail when no active call', async () => {
      await handler.endCall();

      await expect(handler.establishAudioStream()).rejects.toThrow('No active call');
    });
  });

  describe('ending calls', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallHandler(rpcOptions, {}, mockRuntime);

      await handler.handleIncomingCall({
        callId: 'test-call-10',
        caller: '+15551234567',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
      });

      await handler.acceptCall();
    });

    it('should end call gracefully', async () => {
      const endedPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:ended', (call) => {
          resolve(call);
        });
      });

      // Simulate some call duration
      await new Promise(resolve => setTimeout(resolve, 50));

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({});

      await handler.endCall('Test end');

      // Wait for ended event with timeout
      const endedCall = await Promise.race([
        endedPromise,
        new Promise<VoiceCall>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
      expect(endedCall.state).toBe('ended');
      expect(endedCall.duration).toBeGreaterThan(0);
      expect(handler.isOnCall()).toBe(false);
    });

    it('should track call duration', async () => {
      // Simulate call duration
      await new Promise(resolve => setTimeout(resolve, 100));

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({});

      await handler.endCall();

      const call = handler.getCurrentCall();
      expect(call).toBeNull(); // Call ended, no current call
    });
  });

  describe('group call participants', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { enableGroupCalls: true },
        mockRuntime,
      );

      await handler.handleIncomingCall({
        callId: 'test-call-11',
        caller: '+15551234567',
        groupId: 'group-123',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
      });

      await handler.acceptCall();
    });

    it('should handle participant joined', async () => {
      const joinedPromise = new Promise<[VoiceCall, any]>((resolve) => {
        handler.on('call:participant-joined', (call, participant) => {
          resolve([call, participant]);
        });
      });

      handler.handleParticipantJoined('+15552222222', 'uuid-participant-2');

      const [call, participant] = await Promise.race([
        joinedPromise,
        new Promise<[VoiceCall, any]>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
      expect(participant.id).toBe('+15552222222');
      expect(participant.joined).toBe(true);
      expect(call.participants.length).toBe(2); // Original caller + new participant
    });

    it('should handle participant left', async () => {
      handler.handleParticipantJoined('+15552222222', 'uuid-participant-2');

      const leftPromise = new Promise<[VoiceCall, any]>((resolve) => {
        handler.on('call:participant-left', (call, participant) => {
          resolve([call, participant]);
        });
      });

      handler.handleParticipantLeft('+15552222222');

      const [call, participant] = await Promise.race([
        leftPromise,
        new Promise<[VoiceCall, any]>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 5000)
        ),
      ]);
      expect(participant.id).toBe('+15552222222');
      expect(participant.joined).toBe(false);
    });
  });

  describe('call monitoring', () => {
    it('should monitor call duration and auto-hangup', async () => {
      handler = new SignalVoiceCallHandler(
        rpcOptions,
        { maxDurationMs: 500 }, // 500ms max
        mockRuntime,
      );

      await handler.handleIncomingCall({
        callId: 'test-call-12',
        caller: '+15551234567',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
      });

      await handler.acceptCall();

      const endedPromise = new Promise<VoiceCall>((resolve) => {
        handler.on('call:ended', (call) => {
          resolve(call);
        });
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({}); // endCall RPC

      // Wait for auto-hangup with timeout
      const endedCall = await Promise.race([
        endedPromise,
        new Promise<VoiceCall>((_, reject) =>
          setTimeout(() => reject(new Error('Auto-hangup timeout')), 7000)
        ),
      ]);
      expect(endedCall.state).toBe('ended');
    }, 10000); // 10 second timeout for test
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      handler = new SignalVoiceCallHandler(rpcOptions, {}, mockRuntime);

      await handler.handleIncomingCall({
        callId: 'test-call-13',
        caller: '+15551234567',
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        success: true,
        encryptionVerified: true,
      });

      await handler.acceptCall();

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({}); // endCall RPC

      await handler.cleanup();

      expect(handler.isOnCall()).toBe(false);
    });
  });
});
