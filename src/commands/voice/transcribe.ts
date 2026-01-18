/**
 * Voice Transcribe Command
 *
 * CLI command to transcribe audio files using configured STT providers:
 * clawdbot voice transcribe --file audio.wav [--provider whisper] [--language en] [--format text|json]
 */

import { readFileSync } from 'fs';
import path from 'path';
import { spinner } from '@clack/prompts';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';
import {
  loadVoiceConfig,
  initializeRegistry,
  formatTime,
  isAudioFile,
  formatCapabilities,
} from './helpers.js';
import type { AudioBuffer } from '../../media/voice-providers/executor.js';
import { AudioFormat } from '../../media/voice-providers/executor.js';

export interface TranscribeCommandOptions {
  file: string;
  provider?: string;
  language?: string;
  format?: 'text' | 'json';
  verbose?: boolean;
}

/**
 * Main transcribe command handler
 */
export async function transcribeCommand(
  opts: TranscribeCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    // Validate input file
    if (!opts.file) {
      throw new Error('--file is required');
    }

    if (!isAudioFile(opts.file)) {
      throw new Error(
        `Audio file not found or unsupported format: ${opts.file}`,
      );
    }

    // Load configuration
    const { voiceConfig } = await loadVoiceConfig();
    if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
      throw new Error(
        'Voice providers not configured. Run "clawdbot configure voice" first.',
      );
    }

    // Initialize registry
    const registry = await initializeRegistry(voiceConfig);

    // Get transcriber
    const spin = spinner();
    spin.start('Loading provider...');
    const transcriber = await registry.getTranscriber(opts.provider);
    spin.stop(`Provider loaded: ${transcriber.id}`);

    // Read audio file
    spin.start('Reading audio file...');
    const audioData = readFileSync(opts.file);
    const audioBuffer = createAudioBuffer(audioData);
    spin.stop(
      `Audio loaded: ${(audioData.length / 1024).toFixed(2)}KB`,
    );

    // Transcribe
    const startTime = Date.now();
    spin.start('Transcribing...');

    const result = await transcriber.transcribe(audioBuffer, {
      language: opts.language,
    });

    const duration = Date.now() - startTime;
    spin.stop(`Transcription complete (${formatTime(duration)})`);

    // Output results
    if (opts.format === 'json') {
      const output = {
        text: result.text,
        confidence: result.confidence,
        language: result.language,
        duration: result.duration,
        provider: result.provider,
        processingTimeMs: duration,
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('\nTranscription:');
      console.log('─'.repeat(50));
      console.log(result.text);
      console.log('─'.repeat(50));

      if (opts.verbose) {
        console.log('\nMetadata:');
        if (result.confidence !== undefined) {
          console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        }
        if (result.language) {
          console.log(`  Language: ${result.language}`);
        }
        console.log(`  Duration: ${formatTime(result.duration)}`);
        console.log(`  Provider: ${result.provider}`);
        console.log(`  Processing: ${formatTime(duration)}`);
      }
    }

    // Cleanup
    await registry.shutdown();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Transcribe failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * Create AudioBuffer from raw data
 */
function createAudioBuffer(data: Buffer): AudioBuffer {
  return {
    data: new Uint8Array(data),
    format: AudioFormat.PCM_16,
    sampleRate: 16000,
    duration: (data.length / 32000) * 1000, // Approximate for 16-bit mono
    channels: 1,
  };
}
