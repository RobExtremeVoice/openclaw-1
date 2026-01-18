/**
 * Voice Provider Command
 *
 * Manage and test voice providers:
 * clawdbot voice provider list
 * clawdbot voice provider status
 * clawdbot voice provider test --provider whisper
 */

import { spinner } from '@clack/prompts';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';
import {
  loadVoiceConfig,
  initializeRegistry,
  formatCapabilities,
  getStatusIndicator,
  printTable,
} from './helpers.js';
import { detectSystemCapabilities } from '../../config/voice-providers.utils.js';

export interface ProviderCommandOptions {
  list?: boolean;
  status?: boolean;
  test?: boolean;
  provider?: string;
  verbose?: boolean;
}

/**
 * Main provider command handler
 */
export async function providerCommand(
  opts: ProviderCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    if (opts.list) {
      await listProviders(r);
    } else if (opts.status) {
      await showProviderStatus(r);
    } else if (opts.test) {
      await testProvider(opts.provider, r);
    } else {
      // Default: show status
      await showProviderStatus(r);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Provider command failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * List available providers
 */
async function listProviders(runtime: RuntimeEnv): Promise<void> {
  const spin = spinner();
  spin.start('Detecting system capabilities...');

  const capabilities = detectSystemCapabilities();
  spin.stop('System capabilities detected');

  console.log('\nAvailable Voice Providers:');
  console.log('═'.repeat(70));
  console.log('');

  // STT Providers
  console.log('Speech-to-Text (STT) Providers:');
  console.log('─'.repeat(70));

  console.log('\nLocal STT:');
  const sttProviders = [
    {
      name: 'Whisper',
      description: 'OpenAI Whisper (local)',
      supported: true,
    },
    {
      name: 'Faster-Whisper',
      description: 'Faster Whisper fork (optimized)',
      supported: true,
    },
  ];

  for (const p of sttProviders) {
    const icon = p.supported ? '✓' : '✗';
    console.log(`  ${icon} ${p.name}`);
    console.log(`    ${p.description}`);
  }

  console.log('\nCloud STT:');
  const cloudStt = [
    { name: 'OpenAI Whisper API', key: 'openai' },
    { name: 'Google Cloud Speech', key: 'google' },
    { name: 'Azure Speech Services', key: 'azure' },
  ];

  for (const p of cloudStt) {
    console.log(`  ○ ${p.name}`);
  }

  // TTS Providers
  console.log('\n\nText-to-Speech (TTS) Providers:');
  console.log('─'.repeat(70));

  console.log('\nLocal TTS:');
  const ttsProviders = [
    {
      name: 'Kokoro',
      description: 'Fast, high-quality local TTS',
      supported: true,
    },
    {
      name: 'Piper',
      description: 'Offline TTS (multiple voices)',
      supported: true,
    },
  ];

  for (const p of ttsProviders) {
    const icon = p.supported ? '✓' : '✗';
    console.log(`  ${icon} ${p.name}`);
    console.log(`    ${p.description}`);
  }

  console.log('\nCloud TTS:');
  const cloudTts = [
    { name: 'ElevenLabs', key: 'elevenlabs' },
    { name: 'Google Cloud TTS', key: 'google' },
    { name: 'Azure Speech Services', key: 'azure' },
    { name: 'OpenAI TTS', key: 'openai' },
  ];

  for (const p of cloudTts) {
    console.log(`  ○ ${p.name}`);
  }

  // System info
  console.log('\n\nSystem Capabilities:');
  console.log('─'.repeat(70));
  console.log(`Memory: ${capabilities.totalMemoryGb.toFixed(1)}GB`);
  console.log(`CPU Cores: ${capabilities.cpuThreads}`);
  console.log(`GPU: ${capabilities.hasGpu ? `Yes (${capabilities.gpuType})` : 'No'}`);
  if (capabilities.diskSpaceGb !== undefined) {
    console.log(`Disk: ${capabilities.diskSpaceGb.toFixed(1)}GB available`);
  }
}

/**
 * Show provider status
 */
async function showProviderStatus(runtime: RuntimeEnv): Promise<void> {
  const spin = spinner();
  spin.start('Loading configuration...');

  const { voiceConfig } = await loadVoiceConfig();

  if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
    spin.stop();
    console.log('No voice providers configured.');
    return;
  }

  spin.stop();

  console.log('Voice Provider Status:');
  console.log('═'.repeat(70));
  console.log('');

  spin.start('Checking provider health...');
  const registry = await initializeRegistry(voiceConfig);
  const health = await registry.getHealthStatus();
  spin.stop('');

  // Create status rows
  const rows: (string | number)[][] = [];

  for (const provider of voiceConfig.providers) {
    const status = health[provider.id];
    const statusIcon = status?.healthy
      ? '✓ Healthy'
      : '✗ Unhealthy';

    let typeInfo = [];
    if (provider.stt) {
      typeInfo.push('STT');
    }
    if (provider.tts) {
      typeInfo.push('TTS');
    }

    rows.push([
      provider.id,
      typeInfo.join('/'),
      statusIcon,
      provider.priority || 1,
    ]);
  }

  printTable(
    ['Provider ID', 'Type', 'Status', 'Priority'],
    rows,
  );

  // Show details if verbose requested
  console.log('');

  await registry.shutdown();
}

/**
 * Test a specific provider
 */
async function testProvider(
  providerId?: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const spin = spinner();
  spin.start('Loading configuration...');

  const { voiceConfig } = await loadVoiceConfig();

  if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
    spin.stop();
    throw new Error('No voice providers configured');
  }

  spin.stop();

  // Select provider
  let provider = voiceConfig.providers[0];
  if (providerId) {
    const found = voiceConfig.providers.find(p => p.id === providerId);
    if (!found) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    provider = found;
  }

  console.log(`Testing provider: ${provider.id}`);
  console.log('─'.repeat(50));

  spin.start('Initializing provider...');

  const registry = await initializeRegistry(voiceConfig);

  try {
    // Try to get appropriate executor
    let executor = null;

    if (provider.stt) {
      try {
        executor = await registry.getTranscriber(provider.id);
      } catch {
        // Provider may not support STT
      }
    }

    if (!executor && provider.tts) {
      try {
        executor = await registry.getSynthesizer(provider.id);
      } catch {
        // Provider may not support TTS
      }
    }

    if (!executor) {
      spin.stop();
      throw new Error(`Could not load provider: ${provider.id}`);
    }

    spin.stop();

    // Test health
    spin.start('Checking health...');
    const healthy = await executor.isHealthy();
    spin.stop(healthy ? 'Provider is healthy' : 'Provider is unhealthy');

    // Show capabilities
    const caps = executor.getCapabilities();
    console.log('\nCapabilities:');
    console.log('─'.repeat(50));

    const capLines = formatCapabilities(caps);
    for (const line of capLines) {
      console.log(`  ${line}`);
    }

    // Summary
    console.log('\nTest Summary:');
    console.log(`  Provider: ${provider.id}`);
    console.log(`  Status: ${healthy ? 'OK' : 'FAILED'}`);
    console.log(`  Max concurrent: ${caps.maxConcurrentSessions}`);
    console.log(`  Estimated latency: ${caps.estimatedLatencyMs}ms`);
  } finally {
    await registry.shutdown();
  }
}
