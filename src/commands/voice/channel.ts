/**
 * Voice Channel Command
 *
 * Manage voice channels (Discord-style audio rooms):
 * clawdbot voice channel create myroom
 * clawdbot voice channel list
 * clawdbot voice channel add myroom @user
 * clawdbot voice channel status myroom
 */

import { spinner } from '@clack/prompts';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';
import { printTable } from './helpers.js';
import { VoiceChannel, type VoiceChannelConfig } from '../../media/voice-channels/channel.js';

// In-memory channel storage (in production, would use persistent storage)
const channels = new Map<string, VoiceChannel>();

export interface ChannelCommandOptions {
  create?: string;
  list?: boolean;
  add?: string;
  remove?: string;
  status?: string;
  delete?: string;
  participant?: string;
  maxParticipants?: number;
  verbose?: boolean;
}

/**
 * Main channel command handler
 */
export async function channelCommand(
  opts: ChannelCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    if (opts.create) {
      await createChannel(opts.create, opts.maxParticipants, r);
    } else if (opts.list) {
      await listChannels(r);
    } else if (opts.add) {
      if (!opts.participant) {
        throw new Error('--participant is required with --add');
      }
      await addParticipant(opts.add, opts.participant, r);
    } else if (opts.remove) {
      if (!opts.participant) {
        throw new Error('--participant is required with --remove');
      }
      await removeParticipant(opts.remove, opts.participant, r);
    } else if (opts.status) {
      await showChannelStatus(opts.status, r);
    } else if (opts.delete) {
      await deleteChannel(opts.delete, r);
    } else {
      // Default: show summary
      await showChannelsSummary(r);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Channel command failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * Create a voice channel
 */
async function createChannel(
  channelId: string,
  maxParticipants?: number,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const spin = spinner();

  if (channels.has(channelId)) {
    throw new Error(`Channel already exists: ${channelId}`);
  }

  spin.start(`Creating channel: ${channelId}...`);

  const config: VoiceChannelConfig = {
    id: channelId,
    name: channelId,
    maxParticipants: maxParticipants || 16,
    mixingAlgorithm: 'broadcast',
  };

  const channel = new VoiceChannel(config);
  await channel.activate();
  channels.set(channelId, channel);

  spin.stop(`Channel created: ${channelId}`);
  console.log(`  Max participants: ${config.maxParticipants}`);
  console.log(`  Mixing algorithm: ${config.mixingAlgorithm}`);
}

/**
 * List all voice channels
 */
async function listChannels(runtime: RuntimeEnv = defaultRuntime): Promise<void> {
  console.log('Voice Channels:');
  console.log('═'.repeat(70));

  if (channels.size === 0) {
    console.log('No active voice channels.');
    return;
  }

  const rows: (string | number)[][] = [];

  for (const [id, channel] of channels) {
    const stats = channel.getStats();
    const activeSpeakers = stats.activeSpeakers.length;

    rows.push([
      id,
      stats.participantCount,
      activeSpeakers,
      stats.isActive ? 'Active' : 'Inactive',
    ]);
  }

  printTable(
    ['Channel ID', 'Participants', 'Active Speakers', 'Status'],
    rows,
  );
}

/**
 * Show channels summary
 */
async function showChannelsSummary(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  console.log('Voice Channels Summary:');
  console.log('═'.repeat(50));

  if (channels.size === 0) {
    console.log('No active voice channels.');
    console.log('\nCreate a channel with:');
    console.log('  clawdbot voice channel create myroom');
    return;
  }

  console.log(`Total channels: ${channels.size}`);

  let totalParticipants = 0;
  const channelInfo: string[] = [];

  for (const [id, channel] of channels) {
    const stats = channel.getStats();
    totalParticipants += stats.participantCount;
    channelInfo.push(
      `  ${id}: ${stats.participantCount} participants`,
    );
  }

  console.log(`Total participants: ${totalParticipants}`);
  console.log('\nChannels:');
  console.log(channelInfo.join('\n'));
}

/**
 * Show channel status
 */
async function showChannelStatus(
  channelId: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const channel = channels.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const stats = channel.getStats();

  console.log(`Channel: ${channelId}`);
  console.log('═'.repeat(50));
  console.log(`Status: ${stats.isActive ? 'Active' : 'Inactive'}`);
  console.log(`Participants: ${stats.participantCount}`);
  console.log(`Active speakers: ${stats.activeSpeakers.length}`);

  if (stats.participantCount > 0) {
    console.log('\nParticipants:');
    for (const [userId, participant] of channel.participants) {
      const isActive = stats.activeSpeakers.includes(userId);
      const status = isActive ? '🎤' : '🔇';
      console.log(
        `  ${status} ${participant.displayName} (${userId})`,
      );
    }
  }
}

/**
 * Add participant to channel
 */
async function addParticipant(
  channelId: string,
  participantId: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const channel = channels.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const spin = spinner();
  spin.start(`Adding participant: ${participantId}...`);

  try {
    const participant = await channel.addParticipant({
      userId: participantId,
      displayName: participantId,
      audioInput: 'microphone',
      audioOutput: 'speaker',
    });

    spin.stop(`Participant added: ${participantId}`);
    console.log(`  Channel: ${channelId}`);
    console.log(`  Total participants: ${channel.participants.size}`);
  } catch (error) {
    spin.stop(`Failed to add participant`);
    throw error;
  }
}

/**
 * Remove participant from channel
 */
async function removeParticipant(
  channelId: string,
  participantId: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const channel = channels.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const spin = spinner();
  spin.start(`Removing participant: ${participantId}...`);

  try {
    await channel.removeParticipant(participantId);
    spin.stop(`Participant removed: ${participantId}`);
    console.log(`  Remaining participants: ${channel.participants.size}`);
  } catch (error) {
    spin.stop(`Failed to remove participant`);
    throw error;
  }
}

/**
 * Delete a channel
 */
async function deleteChannel(
  channelId: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const channel = channels.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const spin = spinner();
  spin.start(`Deleting channel: ${channelId}...`);

  try {
    await channel.deactivate();
    channels.delete(channelId);
    spin.stop(`Channel deleted: ${channelId}`);
  } catch (error) {
    spin.stop(`Failed to delete channel`);
    throw error;
  }
}
