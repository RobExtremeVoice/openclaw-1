/**
 * Docker Provider Adapter - Usage Examples
 *
 * Demonstrates how to use the Docker Provider Adapter to deploy and manage
 * multiple voice provider instances.
 */

import {
  getGlobalDockerProviderAdapter,
  PROVIDER_TEMPLATES,
  type DockerProviderConfig,
} from './docker-provider-adapter.js';
import type { DockerHandler } from './docker-handler.js';

/**
 * Example 1: Basic Single Provider Deployment
 *
 * Deploy a single Faster-Whisper instance with default configuration
 */
export async function exampleBasicDeployment(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // Create a Faster-Whisper instance with defaults
  const handler = await adapter.createProviderInstance(
    'whisper-default',
    'faster-whisper',
  );

  console.log('Created Faster-Whisper instance with default config');
  console.log('Handler:', handler.constructor.name);
}

/**
 * Example 2: GPU-Accelerated Faster-Whisper
 *
 * Deploy Faster-Whisper with GPU support for faster inference
 */
export async function exampleGpuAcceleration(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  const config: Partial<DockerProviderConfig> = {
    image: 'fedirz/faster-whisper-server:latest-gpu',
    port: 8001,
    gpuEnabled: true,
    cpuLimit: '4',
    memoryLimit: '8g',
    env: {
      LOG_LEVEL: 'INFO',
      DEFAULT_MODEL_SIZE: 'base',
      COMPUTE_TYPE: 'float16', // Use float16 on GPU for speed
      DEVICE: 'cuda',
      DEVICE_INDEX: '0',
    },
    healthCheck: {
      endpoint: 'http://127.0.0.1:8001/health',
      interval: 30000,
      timeout: 10000,
    },
  };

  const handler = await adapter.createProviderInstance(
    'whisper-gpu',
    'faster-whisper',
    config,
  );

  console.log('Created GPU-accelerated Faster-Whisper instance');
}

/**
 * Example 3: Multiple STT Instances with Different Models
 *
 * Deploy multiple Faster-Whisper instances for different use cases
 */
export async function exampleMultipleSttInstances(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // Small, fast model for real-time transcription
  const fastModel = await adapter.createProviderInstance(
    'whisper-fast',
    'faster-whisper',
    {
      port: 8001,
      env: {
        DEFAULT_MODEL_SIZE: 'tiny',
        COMPUTE_TYPE: 'int8',
      },
    },
  );

  // Large, accurate model for batch processing
  const accurateModel = await adapter.createProviderInstance(
    'whisper-accurate',
    'faster-whisper',
    {
      port: 8002,
      gpuEnabled: true,
      memoryLimit: '12g',
      env: {
        DEFAULT_MODEL_SIZE: 'large',
        COMPUTE_TYPE: 'float16',
        DEVICE: 'cuda',
      },
    },
  );

  console.log('Created fast and accurate STT instances');
  console.log('Fast model on 127.0.0.1:8001');
  console.log('Accurate model on 127.0.0.1:8002');
}

/**
 * Example 4: Chatterbox TTS with Volume Persistence
 *
 * Deploy Chatterbox with persistent model caching
 */
export async function exampleChatterboxTts(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  const config: Partial<DockerProviderConfig> = {
    image: 'chatterbox-tts:latest',
    port: 5000,
    containerName: 'chatterbox-tts-main',
    gpuEnabled: true,
    cpuLimit: '2',
    memoryLimit: '4g',
    volumes: {
      'chatterbox-models': '/app/models',
      'chatterbox-cache': '/app/cache',
    },
    env: {
      API_PORT: '5000',
      DEVICE: 'cuda',
      MODEL_DIR: '/app/models',
      CACHE_DIR: '/app/cache',
      TTS_ENGINE: 'glow-tts',
      VOCODER: 'hifi-gan',
    },
    healthCheck: {
      endpoint: 'http://127.0.0.1:5000/api/v1/health',
      interval: 30000,
      timeout: 10000,
    },
  };

  const handler = await adapter.createProviderInstance(
    'chatterbox-main',
    'chatterbox',
    config,
  );

  console.log('Created Chatterbox TTS instance with persistent volumes');
}

/**
 * Example 5: Mixed STT/TTS Pipeline
 *
 * Deploy both STT and TTS providers for a complete voice pipeline
 */
export async function exampleVoicePipeline(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // Deploy STT (speech-to-text)
  const sttHandler = await adapter.createProviderInstance(
    'pipeline-stt',
    'faster-whisper',
    {
      port: 8001,
      gpuEnabled: true,
      env: {
        DEFAULT_MODEL_SIZE: 'base',
        COMPUTE_TYPE: 'float16',
      },
    },
  );

  // Deploy TTS (text-to-speech)
  const ttsHandler = await adapter.createProviderInstance(
    'pipeline-tts',
    'chatterbox',
    {
      port: 5000,
      gpuEnabled: true,
      env: {
        TTS_ENGINE: 'glow-tts',
      },
    },
  );

  console.log('Created voice pipeline:');
  console.log('  STT: http://127.0.0.1:8001');
  console.log('  TTS: http://127.0.0.1:5000');
}

/**
 * Example 6: Loading Configuration from File
 *
 * Load provider configurations from docker-providers.json
 */
export async function exampleLoadConfigFromFile(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // In a real application, load from file
  const providerConfigs = [
    {
      id: 'faster-whisper-gpu',
      type: 'faster-whisper',
      config: {
        image: 'fedirz/faster-whisper-server:latest-gpu',
        port: 8001,
        gpuEnabled: true,
        env: {
          COMPUTE_TYPE: 'float16',
        },
      },
    },
    {
      id: 'chatterbox-tts',
      type: 'chatterbox',
      config: {
        image: 'chatterbox-tts:latest',
        port: 5000,
        gpuEnabled: true,
      },
    },
  ];

  // Create instances from config
  for (const provider of providerConfigs) {
    await adapter.createProviderInstance(
      provider.id,
      provider.type,
      provider.config,
    );
    console.log(`Created provider: ${provider.id}`);
  }

  // List active instances
  const instances = adapter.getActiveInstances();
  console.log(`Active instances: ${instances.join(', ')}`);
}

/**
 * Example 7: Port Allocation and Management
 *
 * Demonstrate automatic port allocation and conflict prevention
 */
export async function examplePortAllocation(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // Create instances without specifying ports
  // They will be allocated sequentially (8000, 8001, 8002, etc.)
  const handler1 = await adapter.createProviderInstance(
    'instance-1',
    'faster-whisper',
  );

  const handler2 = await adapter.createProviderInstance(
    'instance-2',
    'faster-whisper',
  );

  const handler3 = await adapter.createProviderInstance(
    'instance-3',
    'faster-whisper',
  );

  console.log('Instances created with auto-allocated ports:');
  console.log(`instance-1: ${handler1.constructor.name}`);
  console.log(`instance-2: ${handler2.constructor.name}`);
  console.log(`instance-3: ${handler3.constructor.name}`);
}

/**
 * Example 8: List Available Templates and Customize
 *
 * Show how to list available provider templates and customize them
 */
export async function exampleTemplateUsage(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // List all available providers
  const providers = adapter.listAvailableProviders();
  console.log('Available providers:', providers.join(', '));

  // Get template for a provider
  const whisperTemplate = adapter.getTemplate('faster-whisper');
  console.log('Faster-Whisper Template:');
  console.log(`  Image: ${whisperTemplate.defaultImage}`);
  console.log(`  Port: ${whisperTemplate.defaultPort}`);
  console.log(`  GPU Support: ${whisperTemplate.gpuSupport}`);
  console.log(`  Memory: ${whisperTemplate.memoryLimit}`);
  console.log(`  Health Check Path: ${whisperTemplate.healthCheckPath}`);

  // Create instance based on template
  const handler = await adapter.createProviderInstance(
    'whisper-from-template',
    'faster-whisper',
    {
      // Override specific values from template
      env: {
        DEFAULT_MODEL_SIZE: 'large', // Override model size
      },
    },
  );

  console.log('Created instance from template with custom config');
}

/**
 * Example 9: Cleanup and Resource Management
 *
 * Demonstrate proper cleanup of instances and resources
 */
export async function exampleCleanup(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  // Create some instances
  await adapter.createProviderInstance('temp-instance-1', 'faster-whisper');
  await adapter.createProviderInstance('temp-instance-2', 'chatterbox');

  console.log('Active instances:', adapter.getActiveInstances());

  // Remove individual instance
  adapter.removeProviderInstance('temp-instance-1');
  console.log('After removing instance-1:', adapter.getActiveInstances());

  // Clean up all remaining instances
  await adapter.cleanup();
  console.log('After cleanup:', adapter.getActiveInstances());
}

/**
 * Example 10: Error Handling
 *
 * Demonstrate proper error handling
 */
export async function exampleErrorHandling(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  try {
    // Try to create instance with unknown provider
    await adapter.createProviderInstance(
      'unknown-instance',
      'nonexistent-provider',
    );
  } catch (error) {
    console.error('Error creating provider:');
    console.error(`  Message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && 'code' in error) {
      console.error(`  Code: ${(error as any).code}`);
    }
  }

  try {
    // Try to get template for unknown provider
    adapter.getTemplate('nonexistent-provider');
  } catch (error) {
    console.error('Error getting template:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 11: Full Production Setup
 *
 * Complete example of a production voice processing setup
 */
export async function exampleProductionSetup(): Promise<void> {
  const adapter = getGlobalDockerProviderAdapter();

  try {
    // Deploy redundant STT services
    const sttPrimary = await adapter.createProviderInstance(
      'stt-primary',
      'faster-whisper',
      {
        port: 8001,
        gpuEnabled: true,
        cpuLimit: '4',
        memoryLimit: '8g',
        env: {
          DEFAULT_MODEL_SIZE: 'base',
          COMPUTE_TYPE: 'float16',
        },
      },
    );

    const sttFallback = await adapter.createProviderInstance(
      'stt-fallback',
      'faster-whisper',
      {
        gpuEnabled: false, // CPU-only fallback
        cpuLimit: '2',
        memoryLimit: '2g',
        env: {
          DEFAULT_MODEL_SIZE: 'tiny',
          COMPUTE_TYPE: 'int8',
        },
      },
    );

    // Deploy TTS service
    const tts = await adapter.createProviderInstance(
      'tts-primary',
      'chatterbox',
      {
        port: 5000,
        gpuEnabled: true,
        cpuLimit: '2',
        memoryLimit: '4g',
        volumes: {
          'chatterbox-models': '/app/models',
        },
      },
    );

    console.log('Production setup complete:');
    console.log('  STT Primary (GPU):', sttPrimary.constructor.name);
    console.log('  STT Fallback (CPU):', sttFallback.constructor.name);
    console.log('  TTS Primary:', tts.constructor.name);

    // Get active instances
    const instances = adapter.getActiveInstances();
    console.log(`  Total instances: ${instances.length}`);

    // In production, you would integrate with monitoring/health checks
    console.log('Ready for production traffic');
  } catch (error) {
    console.error('Failed to setup production environment:', error);
    throw error;
  }
}

// Export all examples for documentation
export const EXAMPLES = {
  exampleBasicDeployment,
  exampleGpuAcceleration,
  exampleMultipleSttInstances,
  exampleChatterboxTts,
  exampleVoicePipeline,
  exampleLoadConfigFromFile,
  examplePortAllocation,
  exampleTemplateUsage,
  exampleCleanup,
  exampleErrorHandling,
  exampleProductionSetup,
};
