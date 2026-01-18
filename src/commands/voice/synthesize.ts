/**
 * Voice Synthesize Command
 *
 * CLI command to synthesize text to speech using configured TTS providers:
 * clawdbot voice synthesize --text "Hello world" [--provider kokoro] [--voice en_us] [--output output.wav]
 */

import { writeFileSync } from 'fs';
import path from 'path';
import { spinner } from '@clack/prompts';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';
import {
  loadVoiceConfig,
  initializeRegistry,
  formatTime,
  formatBytes,
  validateTextInput,
} from './helpers.js';
import type { AudioBuffer } from '../../media/voice-providers/executor.js';

export interface SynthesizeCommandOptions {
  text?: string;
  provider?: string;
  voice?: string;
  output?: string;
  speed?: number;
  language?: string;
  verbose?: boolean;
}

/**
 * Main synthesize command handler
 */
export async function synthesizeCommand(
  opts: SynthesizeCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    // Get text input
    let text = opts.text?.trim() || '';

    // If no text provided as argument, try to read from stdin
    if (!text && process.stdin.isTTY === false) {
      text = await readStdin();
    }

    if (!text) {
      throw new Error('--text is required or provide text via stdin');
    }

    // Validate text
    const validation = validateTextInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
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

    // Get synthesizer
    const spin = spinner();
    spin.start('Loading provider...');
    const synthesizer = await registry.getSynthesizer(opts.provider);
    spin.stop(`Provider loaded: ${synthesizer.id}`);

    // Synthesize
    const startTime = Date.now();
    spin.start('Synthesizing speech...');

    const audio = await synthesizer.synthesize(text, {
      voice: opts.voice,
      speed: opts.speed,
      language: opts.language,
    });

    const duration = Date.now() - startTime;
    spin.stop(`Synthesis complete (${formatTime(duration)})`);

    // Save or output audio
    const outputPath = opts.output || 'output.wav';
    spin.start(`Saving audio to ${outputPath}...`);

    saveAudioBuffer(audio, outputPath);
    spin.stop(`Audio saved: ${formatBytes(audio.data.length)}`);

    // Print summary
    console.log('\nSynthesis Summary:');
    console.log(`  Text length: ${text.length} characters`);
    console.log(`  Output format: ${audio.format}`);
    console.log(`  Sample rate: ${audio.sampleRate}Hz`);
    console.log(`  Duration: ${formatTime(audio.duration)}`);
    console.log(`  Provider: ${synthesizer.id}`);
    console.log(`  Processing: ${formatTime(duration)}`);

    // Cleanup
    await registry.shutdown();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Synthesize failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * Read text from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while (null !== (chunk = process.stdin.read())) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);

    // Timeout if no data received quickly
    setTimeout(() => {
      if (!data) {
        reject(new Error('No text provided'));
      }
    }, 2000);
  });
}

/**
 * Save AudioBuffer to WAV file
 */
function saveAudioBuffer(audio: AudioBuffer, filePath: string): void {
  // Simple WAV header for PCM 16-bit
  const audioData = audio.data;
  const sampleRate = audio.sampleRate;
  const numChannels = audio.channels;
  const bitsPerSample = 16;

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  // WAV header
  const header = Buffer.alloc(44);
  let offset = 0;

  // "RIFF" chunk descriptor
  header.write('RIFF', offset);
  offset += 4;
  header.writeUInt32LE(36 + audioData.length, offset);
  offset += 4;
  header.write('WAVE', offset);
  offset += 4;

  // "fmt " subchunk
  header.write('fmt ', offset);
  offset += 4;
  header.writeUInt32LE(16, offset); // Subchunk1Size (16 for PCM)
  offset += 4;
  header.writeUInt16LE(1, offset); // AudioFormat (1 for PCM)
  offset += 2;
  header.writeUInt16LE(numChannels, offset);
  offset += 2;
  header.writeUInt32LE(sampleRate, offset);
  offset += 4;
  header.writeUInt32LE(byteRate, offset);
  offset += 4;
  header.writeUInt16LE(blockAlign, offset);
  offset += 2;
  header.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  // "data" subchunk
  header.write('data', offset);
  offset += 4;
  header.writeUInt32LE(audioData.length, offset);

  const wavFile = Buffer.concat([header, Buffer.from(audioData)]);
  writeFileSync(filePath, wavFile);
}
