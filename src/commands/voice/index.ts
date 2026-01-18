/**
 * Voice Commands Index
 *
 * Exports all voice CLI commands
 */

export { transcribeCommand } from './transcribe.js';
export { synthesizeCommand } from './synthesize.js';
export { configCommand } from './config.js';
export { providerCommand } from './provider.js';
export { channelCommand } from './channel.js';

export type { TranscribeCommandOptions } from './transcribe.js';
export type { SynthesizeCommandOptions } from './synthesize.js';
export type { ConfigCommandOptions } from './config.js';
export type { ProviderCommandOptions } from './provider.js';
export type { ChannelCommandOptions } from './channel.js';
