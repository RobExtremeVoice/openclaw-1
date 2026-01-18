/**
 * Voice Config Command
 *
 * Manage voice provider configuration:
 * clawdbot voice config --list
 * clawdbot voice config --set-default-stt whisper
 * clawdbot voice config --set-default-tts kokoro
 * clawdbot voice config --show-deployment
 */

import { spinner } from '@clack/prompts';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';
import {
  loadVoiceConfig,
  printTable,
  getStatusIndicator,
  formatCapabilities,
  initializeRegistry,
} from './helpers.js';
import {
  writeConfigFile,
  readConfigFileSnapshot,
  type ClawdbotConfig,
} from '../../config/config.js';

export interface ConfigCommandOptions {
  list?: boolean;
  setDefaultStt?: string;
  setDefaultTts?: string;
  showDeployment?: boolean;
  edit?: string;
}

/**
 * Main config command handler
 */
export async function configCommand(
  opts: ConfigCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    if (opts.list) {
      await listProviders(r);
    } else if (opts.setDefaultStt) {
      await setDefaultProvider('stt', opts.setDefaultStt, r);
    } else if (opts.setDefaultTts) {
      await setDefaultProvider('tts', opts.setDefaultTts, r);
    } else if (opts.showDeployment) {
      await showDeployment(r);
    } else if (opts.edit) {
      await editProvider(opts.edit, r);
    } else {
      // Default: show summary
      await showSummary(r);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Config command failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * List all configured providers
 */
async function listProviders(runtime: RuntimeEnv): Promise<void> {
  const spin = spinner();
  spin.start('Loading configuration...');

  const { voiceConfig } = await loadVoiceConfig();

  if (!voiceConfig?.enabled) {
    console.log('Voice providers are not enabled.');
    return;
  }

  if (!voiceConfig.providers?.length) {
    console.log('No voice providers configured.');
    spin.stop();
    return;
  }

  spin.stop('');

  console.log('Configured Voice Providers:');
  console.log('═'.repeat(70));
  console.log('');

  for (const provider of voiceConfig.providers) {
    const status = getStatusIndicator(provider.enabled ?? true);
    console.log(`${status} Provider ID: ${provider.id}`);
    console.log(`  Priority: ${provider.priority || 1}`);

    if (provider.stt) {
      console.log(`  STT Type: ${provider.stt.type}`);
      if (provider.stt.language) {
        console.log(`    Language: ${provider.stt.language}`);
      }
    }

    if (provider.tts) {
      console.log(`  TTS Type: ${provider.tts.type}`);
      if ((provider.tts as any).voice) {
        console.log(`    Voice: ${(provider.tts as any).voice}`);
      }
      if ((provider.tts as any).model) {
        console.log(`    Model: ${(provider.tts as any).model}`);
      }
    }

    console.log('');
  }

  // Show health status
  console.log('Provider Health Status:');
  console.log('─'.repeat(70));

  spin.start('Checking provider health...');
  const registry = await initializeRegistry(voiceConfig);
  const health = await registry.getHealthStatus();
  spin.stop('');

  const rows = Object.entries(health).map(([id, status]) => [
    getStatusIndicator(status.healthy),
    id,
    status.healthy ? 'Healthy' : 'Unhealthy',
  ]);

  printTable(['', 'Provider', 'Status'], rows);

  await registry.shutdown();
}

/**
 * Show provider configuration summary
 */
async function showSummary(runtime: RuntimeEnv): Promise<void> {
  const { voiceConfig } = await loadVoiceConfig();

  if (!voiceConfig?.enabled) {
    console.log('Voice providers are not enabled.');
    return;
  }

  console.log('Voice Configuration Summary:');
  console.log('═'.repeat(50));

  if (voiceConfig.providers?.length) {
    console.log(`Providers configured: ${voiceConfig.providers.length}`);

    const sttCount = voiceConfig.providers.filter(p => p.stt).length;
    const ttsCount = voiceConfig.providers.filter(p => p.tts).length;

    console.log(`  STT providers: ${sttCount}`);
    console.log(`  TTS providers: ${ttsCount}`);

    // Show system capabilities if available
    if (voiceConfig.systemCapabilities) {
      const caps = voiceConfig.systemCapabilities;
      console.log('\nSystem Capabilities:');
      if (caps.totalMemoryGb) {
        console.log(`  Memory: ${caps.totalMemoryGb.toFixed(1)}GB`);
      }
      if (caps.gpuAvailable !== undefined) {
        console.log(`  GPU: ${caps.gpuAvailable ? 'Yes' : 'No'}`);
      }
      if (caps.cpuCount) {
        console.log(`  CPU Cores: ${caps.cpuCount}`);
      }
    }
  } else {
    console.log('No providers configured. Run:');
    console.log('  clawdbot configure voice');
  }
}

/**
 * Set default STT or TTS provider
 */
async function setDefaultProvider(
  type: 'stt' | 'tts',
  providerId: string,
  runtime: RuntimeEnv,
): Promise<void> {
  const spin = spinner();
  spin.start('Loading configuration...');

  const snapshot = await readConfigFileSnapshot();
  let config = snapshot.config;

  const voiceConfig = config.voice?.providers;
  if (!voiceConfig?.providers) {
    spin.stop();
    throw new Error('No voice providers configured');
  }

  // Find provider
  const provider = voiceConfig.providers.find(p => p.id === providerId);
  if (!provider) {
    spin.stop();
    throw new Error(`Provider not found: ${providerId}`);
  }

  // Check if provider supports the type
  const hasType = type === 'stt' ? provider.stt : provider.tts;
  if (!hasType) {
    spin.stop();
    throw new Error(`Provider ${providerId} does not support ${type.toUpperCase()}`);
  }

  // Move to front (highest priority)
  const providers = voiceConfig.providers.filter(p => p.id !== providerId);
  providers.unshift({ ...provider, priority: 1 });

  config = {
    ...config,
    voice: {
      ...config.voice,
      providers: {
        ...voiceConfig,
        providers,
      },
    },
  };

  spin.stop();
  spin.start(`Setting default ${type.toUpperCase()} provider...`);

  await writeConfigFile(config);

  spin.stop(`Default ${type.toUpperCase()} provider set to: ${providerId}`);
}

/**
 * Show deployment configuration
 */
async function showDeployment(runtime: RuntimeEnv): Promise<void> {
  const spin = spinner();
  spin.start('Loading deployment configuration...');

  const { voiceConfig } = await loadVoiceConfig();

  if (!voiceConfig?.providers?.length) {
    spin.stop();
    console.log('No providers configured.');
    return;
  }

  spin.stop('');

  console.log('Deployment Configuration:');
  console.log('═'.repeat(70));
  console.log('');

  const registry = await initializeRegistry(voiceConfig);

  for (const provider of voiceConfig.providers) {
    const executor = await registry.getTranscriber(provider.id).catch(
      () => null,
    ) || await registry.getSynthesizer(provider.id).catch(() => null);

    if (!executor) continue;

    console.log(`Provider: ${provider.id}`);

    const caps = executor.getCapabilities();
    const capLines = formatCapabilities(caps);

    for (const line of capLines) {
      console.log(`  ${line}`);
    }

    console.log('');
  }

  await registry.shutdown();
}

/**
 * Edit provider configuration (placeholder)
 */
async function editProvider(
  providerId: string,
  runtime: RuntimeEnv,
): Promise<void> {
  console.log(`Edit provider: ${providerId}`);
  console.log('This feature is coming soon.');
  console.log('For now, manually edit ~/.clawdbot/config.yaml');
}
