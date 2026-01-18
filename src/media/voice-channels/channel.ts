/**
 * Voice Channel
 *
 * N-party audio room with participant management, audio mixing,
 * and session lifecycle management. Supports real-time transcription
 * and synthesis for each participant.
 */

import { EventEmitter } from 'events';
import type { AudioBuffer } from '../voice-providers/executor.js';
import type { VoiceProviderExecutor } from '../voice-providers/executor.js';
import { AudioMixer, type MixAlgorithm } from '../audio-mixer.js';
import type { AudioPipelineConfig } from '../audio-pipeline.js';

export interface VoiceChannelConfig {
  id: string;
  name: string;
  maxParticipants?: number;
  mixingAlgorithm?: MixAlgorithm;
  recordingEnabled?: boolean;
  audioPipelineConfig?: AudioPipelineConfig;
}

export interface VoiceParticipantConfig {
  userId: string;
  displayName?: string;
  transcriber?: VoiceProviderExecutor;
  synthesizer?: VoiceProviderExecutor;
  audioInput?: 'microphone' | 'stream' | 'synthetic';
  audioOutput?: 'speaker' | 'stream' | 'none';
}

export class VoiceParticipant extends EventEmitter {
  id: string;
  displayName: string;
  channel?: VoiceChannel;
  private transcriber?: VoiceProviderExecutor;
  private synthesizer?: VoiceProviderExecutor;
  private audioInput: 'microphone' | 'stream' | 'synthetic';
  private audioOutput: 'speaker' | 'stream' | 'none';
  private isConnected: boolean = false;

  constructor(config: VoiceParticipantConfig) {
    super();
    this.id = config.userId;
    this.displayName = config.displayName ?? config.userId;
    this.transcriber = config.transcriber;
    this.synthesizer = config.synthesizer;
    this.audioInput = config.audioInput ?? 'microphone';
    this.audioOutput = config.audioOutput ?? 'speaker';
  }

  /**
   * Connect participant to channel
   */
  async connect(channel: VoiceChannel): Promise<void> {
    this.channel = channel;
    this.isConnected = true;
    this.emit('connected', { participantId: this.id });
  }

  /**
   * Disconnect from channel
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.channel = undefined;
    this.emit('disconnected', { participantId: this.id });
  }

  /**
   * Send audio to channel
   */
  async sendAudio(audio: AudioBuffer): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('Not connected to channel');
    }

    // Add to mixer
    this.channel.addParticipantAudio(this.id, audio);

    // Transcribe if transcriber available
    if (this.transcriber) {
      try {
        const result = await this.transcriber.transcribe(audio);
        this.emit('transcribed', {
          participantId: this.id,
          text: result.text,
          confidence: result.confidence,
        });
      } catch (error) {
        this.emit('transcription-error', {
          participantId: this.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Receive mixed audio from channel
   */
  async receiveAudio(audio: AudioBuffer): Promise<void> {
    if (this.audioOutput === 'none') {
      return;
    }

    if (this.audioOutput === 'stream') {
      this.emit('audio-received', { audio });
    }

    // Could also synthesize to speaker if needed
    if (this.synthesizer && this.audioOutput === 'speaker') {
      // Implement speaker playback
    }
  }

  isConnectedToChannel(): boolean {
    return this.isConnected && this.channel !== undefined;
  }
}

export class VoiceChannel extends EventEmitter {
  id: string;
  name: string;
  participants: Map<string, VoiceParticipant> = new Map();
  private mixer: AudioMixer;
  private config: VoiceChannelConfig;
  private isActive: boolean = false;

  constructor(config: VoiceChannelConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.mixer = new AudioMixer({
      algorithm: config.mixingAlgorithm ?? 'broadcast',
      maxParticipants: config.maxParticipants ?? 16,
    });
  }

  /**
   * Activate the channel
   */
  async activate(): Promise<void> {
    this.isActive = true;
    this.emit('activated', { channelId: this.id });
  }

  /**
   * Deactivate the channel
   */
  async deactivate(): Promise<void> {
    this.isActive = false;
    for (const participant of this.participants.values()) {
      await participant.disconnect();
    }
    this.participants.clear();
    this.emit('deactivated', { channelId: this.id });
  }

  /**
   * Add a participant to the channel
   */
  async addParticipant(
    config: VoiceParticipantConfig,
  ): Promise<VoiceParticipant> {
    if (
      this.config.maxParticipants &&
      this.participants.size >= this.config.maxParticipants
    ) {
      throw new Error(
        `Channel ${this.id} is full (max ${this.config.maxParticipants} participants)`,
      );
    }

    const participant = new VoiceParticipant(config);
    await participant.connect(this);
    this.participants.set(config.userId, participant);

    this.emit('participant-joined', {
      channelId: this.id,
      participantId: config.userId,
      displayName: config.displayName,
    });

    return participant;
  }

  /**
   * Remove a participant from the channel
   */
  async removeParticipant(userId: string): Promise<void> {
    const participant = this.participants.get(userId);
    if (participant) {
      await participant.disconnect();
      this.mixer.removeTrack(userId);
      this.participants.delete(userId);

      this.emit('participant-left', {
        channelId: this.id,
        participantId: userId,
      });
    }
  }

  /**
   * Add audio from participant (internal)
   */
  addParticipantAudio(userId: string, audio: AudioBuffer): void {
    this.mixer.addTrack(userId, audio);
  }

  /**
   * Mix and broadcast audio to all participants
   */
  async broadcastMixed(): Promise<void> {
    const mixed = this.mixer.mix();

    for (const [, participant] of this.participants) {
      if (participant.isConnectedToChannel()) {
        try {
          await participant.receiveAudio(mixed);
        } catch (error) {
          console.warn(
            `Failed to send audio to participant ${participant.id}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Get participant by ID
   */
  getParticipant(userId: string): VoiceParticipant | undefined {
    return this.participants.get(userId);
  }

  /**
   * Get all active participants (by voice activity)
   */
  getActiveSpeakers(): string[] {
    return this.mixer.getActiveTracks();
  }

  /**
   * Get channel statistics
   */
  getStats(): {
    channelId: string;
    participantCount: number;
    activeSpeakers: string[];
    isActive: boolean;
  } {
    return {
      channelId: this.id,
      participantCount: this.participants.size,
      activeSpeakers: this.getActiveSpeakers(),
      isActive: this.isActive,
    };
  }

  /**
   * Set participant volume
   */
  setParticipantVolume(userId: string, volume: number): void {
    this.mixer.setTrackVolume(userId, volume);
  }

  /**
   * Mute/unmute participant
   */
  setParticipantEnabled(userId: string, enabled: boolean): void {
    this.mixer.setTrackEnabled(userId, enabled);
  }
}
