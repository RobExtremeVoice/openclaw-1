/**
 * Voice Commands Registration
 *
 * Registers all voice provider CLI commands with the main program:
 * - transcribe: transcribe audio files
 * - synthesize: synthesize text to speech
 * - config: manage provider configuration
 * - provider: list and test providers
 * - channel: manage voice channels
 */

import { Command } from 'commander';
import { transcribeCommand } from '../../commands/voice/transcribe.js';
import { synthesizeCommand } from '../../commands/voice/synthesize.js';
import { configCommand } from '../../commands/voice/config.js';
import { providerCommand } from '../../commands/voice/provider.js';
import { channelCommand } from '../../commands/voice/channel.js';
import { defaultRuntime } from '../../runtime.js';

export function registerVoiceCommands(program: Command): void {
  const voiceProgram = program
    .command('voice')
    .description('Voice provider operations (STT/TTS)');

  // Transcribe subcommand
  voiceProgram
    .command('transcribe')
    .description('Transcribe audio file to text')
    .option('--file <path>', 'Path to audio file', '')
    .option('--provider <id>', 'Provider ID (or use default)')
    .option('--language <lang>', 'Language code (e.g., en, es)')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (opts) => {
      if (!opts.file) {
        console.error('Error: --file is required');
        process.exit(1);
      }
      await transcribeCommand(opts, defaultRuntime);
    });

  // Synthesize subcommand
  voiceProgram
    .command('synthesize')
    .description('Synthesize text to speech')
    .option('--text <text>', 'Text to synthesize')
    .option('--provider <id>', 'Provider ID (or use default)')
    .option('--voice <voice>', 'Voice ID or name')
    .option('--output <path>', 'Output file path')
    .option('--speed <speed>', 'Speech speed (0.5-2.0)', '1.0')
    .option('--language <lang>', 'Language code (e.g., en, es)')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (opts) => {
      const speed = opts.speed ? parseFloat(opts.speed) : 1.0;
      await synthesizeCommand({ ...opts, speed }, defaultRuntime);
    });

  // Config subcommand
  voiceProgram
    .command('config')
    .description('Manage voice provider configuration')
    .option('--list', 'List all configured providers')
    .option('--set-default-stt <id>', 'Set default STT provider')
    .option('--set-default-tts <id>', 'Set default TTS provider')
    .option('--show-deployment', 'Show deployment configuration')
    .option('--edit <id>', 'Edit provider configuration')
    .action(async (opts) => {
      const hasSubcommand =
        opts.list ||
        opts.setDefaultStt ||
        opts.setDefaultTts ||
        opts.showDeployment ||
        opts.edit;

      if (!hasSubcommand) {
        opts.list = true;
      }

      await configCommand(opts, defaultRuntime);
    });

  // Provider subcommand
  voiceProgram
    .command('provider')
    .description('Manage voice providers')
    .option('--list', 'List available providers')
    .option('--status', 'Show provider status')
    .option('--test', 'Test a provider')
    .option('--provider <id>', 'Provider ID to test')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (opts) => {
      const hasSubcommand = opts.list || opts.status || opts.test;

      if (!hasSubcommand) {
        opts.status = true;
      }

      await providerCommand(opts, defaultRuntime);
    });

  // Channel subcommand
  voiceProgram
    .command('channel')
    .description('Manage voice channels')
    .option('--create <id>', 'Create a new channel')
    .option('--list', 'List all channels')
    .option('--add <id>', 'Add participant to channel')
    .option('--remove <id>', 'Remove participant from channel')
    .option('--status <id>', 'Show channel status')
    .option('--delete <id>', 'Delete a channel')
    .option('--participant <id>', 'Participant ID')
    .option('--max-participants <n>', 'Maximum participants')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (opts) => {
      const hasSubcommand =
        opts.create ||
        opts.list ||
        opts.add ||
        opts.remove ||
        opts.status ||
        opts.delete;

      if (!hasSubcommand) {
        opts.list = true;
      }

      const maxParticipants = opts.maxParticipants
        ? parseInt(opts.maxParticipants, 10)
        : undefined;

      await channelCommand({ ...opts, maxParticipants }, defaultRuntime);
    });
}
