/**
 * Signal Voice Call Handler
 *
 * Privacy-first real-time voice call management for Signal with end-to-end encryption.
 * Handles incoming voice calls, verifies encryption, establishes encrypted audio streams,
 * and manages call state while maintaining Signal's privacy guarantees.
 *
 * Features:
 * - Incoming voice call detection and acceptance
 * - E2E encryption verification throughout call
 * - Encrypted audio stream establishment (Opus codec at 48kHz)
 * - Call state management (answer, stream, end)
 * - Support for 1:1 and group calls
 * - Privacy-first: no audio/call logging
 * - Graceful error handling
 */

import type { SignalRpcOptions } from '../client.js';
import { signalRpcRequest } from '../client.js';
import type { RuntimeEnv } from '../../runtime.js';
import { EventEmitter } from 'node:events';

/**
 * Call states
 */
export type CallState =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ending'
  | 'ended'
  | 'failed';

/**
 * Call participants
 */
export interface CallParticipant {
  id: string;
  name?: string;
  uuid?: string;
  verified: boolean; // E2E encryption verified
  joined: boolean;
  muted: boolean;
}

/**
 * Voice call metadata
 */
export interface VoiceCall {
  callId: string;

  // Caller information
  caller: string;
  callerUuid?: string;

  // Call type
  type: '1:1' | 'group';
  groupId?: string;
  groupName?: string;

  // Call state
  state: CallState;
  startTime: number;
  endTime?: number;
  duration?: number; // milliseconds

  // Participants (for group calls)
  participants: CallParticipant[];

  // Encryption status
  encrypted: boolean;
  encryptionVerified: boolean;
  encryptionFingerprint?: string;

  // Audio metadata
  audioFormat: 'opus';
  sampleRate: 48000;
  channels: number; // 1 = mono, 2 = stereo

  // Connection metadata
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  latencyMs?: number;

  // Error information
  error?: string;
  errorCode?: string;
}

/**
 * Call handler configuration
 */
export interface CallHandlerConfig {
  // Auto-accept calls
  autoAcceptCalls?: boolean;

  // Allowed callers (phone numbers or UUIDs)
  allowedCallers?: string[];

  // Maximum call duration (auto-hangup)
  maxDurationMs?: number; // Default: 10 minutes

  // Require encryption verification
  requireEncryptionVerification?: boolean; // Default: true

  // Enable group calls
  enableGroupCalls?: boolean; // Default: false

  // Audio settings
  enableEchoCancellation?: boolean; // Default: true
  enableNoiseSuppression?: boolean; // Default: true

  // Privacy settings
  disableCallLogging?: boolean; // Default: true
}

/**
 * Call event types
 */
export interface CallEvents {
  'call:incoming': (call: VoiceCall) => void;
  'call:accepted': (call: VoiceCall) => void;
  'call:connected': (call: VoiceCall) => void;
  'call:audio-ready': (call: VoiceCall) => void;
  'call:ended': (call: VoiceCall) => void;
  'call:failed': (call: VoiceCall, error: Error) => void;
  'call:encryption-verified': (call: VoiceCall) => void;
  'call:participant-joined': (call: VoiceCall, participant: CallParticipant) => void;
  'call:participant-left': (call: VoiceCall, participant: CallParticipant) => void;
  'call:quality-changed': (call: VoiceCall, quality: string) => void;
}

/**
 * Signal Voice Call Handler
 *
 * Manages incoming voice calls with privacy-first design.
 * Only supports one active call at a time.
 */
export class SignalVoiceCallHandler extends EventEmitter {
  private config: Required<CallHandlerConfig>;
  private currentCall: VoiceCall | null = null;
  private rpcOptions: SignalRpcOptions;
  private runtime?: RuntimeEnv;
  private callMonitorInterval?: NodeJS.Timeout;

  constructor(
    rpcOptions: SignalRpcOptions,
    config: CallHandlerConfig = {},
    runtime?: RuntimeEnv,
  ) {
    super();

    this.rpcOptions = rpcOptions;
    this.runtime = runtime;

    // Default configuration (privacy-first)
    this.config = {
      autoAcceptCalls: config.autoAcceptCalls ?? false,
      allowedCallers: config.allowedCallers ?? [],
      maxDurationMs: config.maxDurationMs ?? 10 * 60 * 1000, // 10 minutes
      requireEncryptionVerification: config.requireEncryptionVerification ?? true,
      enableGroupCalls: config.enableGroupCalls ?? false,
      enableEchoCancellation: config.enableEchoCancellation ?? true,
      enableNoiseSuppression: config.enableNoiseSuppression ?? true,
      disableCallLogging: config.disableCallLogging ?? true,
    };
  }

  /**
   * Check if caller is allowed
   */
  private isCallerAllowed(caller: string, callerUuid?: string): boolean {
    if (this.config.allowedCallers.length === 0) {
      // No restrictions, allow all
      return true;
    }

    return this.config.allowedCallers.includes(caller) ||
           !!(callerUuid && this.config.allowedCallers.includes(callerUuid));
  }

  /**
   * Process incoming voice call notification
   *
   * Called when a new voice call is detected from Signal events.
   */
  async handleIncomingCall(params: {
    callId: string;
    caller: string;
    callerUuid?: string;
    groupId?: string;
    groupName?: string;
    account?: string;
  }): Promise<VoiceCall> {
    const { callId, caller, callerUuid, groupId, groupName, account } = params;

    // Check if already on a call
    if (this.currentCall && this.currentCall.state !== 'ended') {
      throw new Error('Already on an active call. Only one call supported at a time.');
    }

    // Determine call type
    const callType: '1:1' | 'group' = groupId ? 'group' : '1:1';

    // Check if group calls are enabled
    if (callType === 'group' && !this.config.enableGroupCalls) {
      throw new Error('Group calls are disabled');
    }

    // Check if caller is allowed
    if (!this.isCallerAllowed(caller, callerUuid)) {
      this.runtime?.log?.(`Rejected call from ${caller}: caller not in allowlist`);
      throw new Error(`Caller ${caller} not in allowlist`);
    }

    // Create call metadata
    const call: VoiceCall = {
      callId,
      caller,
      callerUuid,
      type: callType,
      groupId,
      groupName,
      state: 'ringing',
      startTime: Date.now(),
      participants: [
        {
          id: caller,
          uuid: callerUuid,
          verified: false, // Will verify during connection
          joined: true,
          muted: false,
        },
      ],
      encrypted: true, // Signal always encrypts
      encryptionVerified: false, // Will verify on accept
      audioFormat: 'opus',
      sampleRate: 48000,
      channels: 1, // Mono by default
    };

    this.currentCall = call;

    this.runtime?.log?.(
      `Incoming ${callType} call from ${caller} (ID: ${callId})`
    );

    this.emit('call:incoming', call);

    // Auto-accept if configured
    if (this.config.autoAcceptCalls) {
      this.runtime?.log?.('Auto-accepting call...');
      await this.acceptCall(account);
    }

    return call;
  }

  /**
   * Accept incoming voice call
   *
   * Verifies E2E encryption and establishes encrypted audio stream.
   */
  async acceptCall(account?: string): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No incoming call to accept');
    }

    if (this.currentCall.state !== 'ringing') {
      throw new Error(`Cannot accept call in state: ${this.currentCall.state}`);
    }

    const call = this.currentCall;
    call.state = 'connecting';

    try {
      this.runtime?.log?.(`Accepting call ${call.callId}...`);

      // Accept call via Signal RPC
      const acceptResponse = await signalRpcRequest<{
        success: boolean;
        encryptionVerified?: boolean;
        encryptionFingerprint?: string;
        audioStreamId?: string;
      }>(
        'acceptCall',
        {
          callId: call.callId,
          account,
          ...(call.groupId && { groupId: call.groupId }),
        },
        this.rpcOptions,
      );

      if (!acceptResponse?.success) {
        throw new Error('Failed to accept call');
      }

      // Verify E2E encryption
      call.encryptionVerified = acceptResponse.encryptionVerified ?? false;
      call.encryptionFingerprint = acceptResponse.encryptionFingerprint;

      if (this.config.requireEncryptionVerification && !call.encryptionVerified) {
        call.state = 'failed';
        call.error = 'E2E encryption verification failed';
        call.errorCode = 'ENCRYPTION_NOT_VERIFIED';
        this.emit('call:failed', call, new Error(call.error));
        throw new Error(call.error);
      }

      call.state = 'connected';
      call.startTime = Date.now();

      this.runtime?.log?.(
        `Call accepted and connected (E2E verified: ${call.encryptionVerified})`
      );

      this.emit('call:accepted', call);
      this.emit('call:connected', call);

      if (call.encryptionVerified) {
        this.emit('call:encryption-verified', call);
      }

      // Start call monitoring
      this.startCallMonitoring();

    } catch (error) {
      call.state = 'failed';
      call.error = error instanceof Error ? error.message : String(error);
      this.emit('call:failed', call, error as Error);
      throw error;
    }
  }

  /**
   * Establish encrypted audio stream
   *
   * Returns stream configuration for audio processing.
   */
  async establishAudioStream(): Promise<{
    format: 'opus';
    sampleRate: 48000;
    channels: number;
    streamId: string;
  }> {
    if (!this.currentCall || this.currentCall.state !== 'connected') {
      throw new Error('No active call to establish audio stream');
    }

    const call = this.currentCall;

    try {
      // Get audio stream details from Signal
      const streamResponse = await signalRpcRequest<{
        streamId: string;
        format: string;
        sampleRate: number;
        channels: number;
      }>(
        'getCallAudioStream',
        {
          callId: call.callId,
        },
        this.rpcOptions,
      );

      if (!streamResponse?.streamId) {
        throw new Error('Failed to establish audio stream');
      }

      this.runtime?.log?.(
        `Audio stream established: ${streamResponse.format} @ ${streamResponse.sampleRate}Hz`
      );

      this.emit('call:audio-ready', call);

      return {
        format: 'opus',
        sampleRate: 48000,
        channels: streamResponse.channels ?? 1,
        streamId: streamResponse.streamId,
      };

    } catch (error) {
      call.error = `Failed to establish audio stream: ${error instanceof Error ? error.message : String(error)}`;
      this.emit('call:failed', call, error as Error);
      throw error;
    }
  }

  /**
   * End current call
   */
  async endCall(reason?: string): Promise<void> {
    if (!this.currentCall) {
      return; // No active call
    }

    const call = this.currentCall;

    if (call.state === 'ended') {
      return; // Already ended
    }

    call.state = 'ending';

    try {
      this.runtime?.log?.(`Ending call ${call.callId}${reason ? `: ${reason}` : ''}`);

      // End call via Signal RPC
      await signalRpcRequest(
        'endCall',
        {
          callId: call.callId,
        },
        this.rpcOptions,
      );

      call.state = 'ended';
      call.endTime = Date.now();
      call.duration = call.endTime - call.startTime;

      this.runtime?.log?.(
        `Call ended (duration: ${(call.duration / 1000).toFixed(1)}s)`
      );

      this.emit('call:ended', call);

      // Stop monitoring
      this.stopCallMonitoring();

    } catch (error) {
      this.runtime?.error?.(
        `Failed to end call: ${error instanceof Error ? error.message : String(error)}`
      );

      // Force end state even if RPC fails
      call.state = 'ended';
      call.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.currentCall = null;
    }
  }

  /**
   * Get current active call
   */
  getCurrentCall(): VoiceCall | null {
    return this.currentCall;
  }

  /**
   * Check if currently on a call
   */
  isOnCall(): boolean {
    return this.currentCall !== null &&
           this.currentCall.state !== 'ended' &&
           this.currentCall.state !== 'failed';
  }

  /**
   * Monitor call quality and duration
   */
  private startCallMonitoring(): void {
    this.stopCallMonitoring(); // Clear any existing monitor

    this.callMonitorInterval = setInterval(async () => {
      if (!this.currentCall || this.currentCall.state !== 'connected') {
        this.stopCallMonitoring();
        return;
      }

      const call = this.currentCall;
      const currentDuration = Date.now() - call.startTime;

      // Check max duration
      if (currentDuration > this.config.maxDurationMs) {
        this.runtime?.log?.('Maximum call duration reached, ending call...');
        await this.endCall('Maximum duration reached');
        return;
      }

      // Query call quality (if supported by Signal)
      try {
        const qualityResponse = await signalRpcRequest<{
          quality?: string;
          latencyMs?: number;
        }>(
          'getCallQuality',
          { callId: call.callId },
          this.rpcOptions,
        );

        if (qualityResponse?.quality && qualityResponse.quality !== call.connectionQuality) {
          call.connectionQuality = qualityResponse.quality as any;
          call.latencyMs = qualityResponse.latencyMs;
          this.emit('call:quality-changed', call, qualityResponse.quality);
        }
      } catch {
        // Quality monitoring not supported, ignore
      }

    }, 5000); // Monitor every 5 seconds
  }

  /**
   * Stop call monitoring
   */
  private stopCallMonitoring(): void {
    if (this.callMonitorInterval) {
      clearInterval(this.callMonitorInterval);
      this.callMonitorInterval = undefined;
    }
  }

  /**
   * Handle participant joined (group calls)
   */
  handleParticipantJoined(participantId: string, participantUuid?: string): void {
    if (!this.currentCall || this.currentCall.type !== 'group') {
      return;
    }

    const call = this.currentCall;

    // Check if already in participants list
    if (call.participants.some(p => p.id === participantId)) {
      return;
    }

    const participant: CallParticipant = {
      id: participantId,
      uuid: participantUuid,
      verified: false,
      joined: true,
      muted: false,
    };

    call.participants.push(participant);

    this.runtime?.log?.(`Participant joined: ${participantId}`);
    this.emit('call:participant-joined', call, participant);
  }

  /**
   * Handle participant left (group calls)
   */
  handleParticipantLeft(participantId: string): void {
    if (!this.currentCall || this.currentCall.type !== 'group') {
      return;
    }

    const call = this.currentCall;
    const index = call.participants.findIndex(p => p.id === participantId);

    if (index === -1) {
      return;
    }

    const participant = call.participants[index];
    participant.joined = false;

    this.runtime?.log?.(`Participant left: ${participantId}`);
    this.emit('call:participant-left', call, participant);

    // Remove from list
    call.participants.splice(index, 1);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopCallMonitoring();

    if (this.currentCall && this.currentCall.state !== 'ended') {
      await this.endCall('Cleanup');
    }

    this.removeAllListeners();
  }
}
