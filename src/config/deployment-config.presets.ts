/**
 * Deployment Configuration Presets
 *
 * Pre-configured deployment templates for common voice providers.
 * These serve as examples and starting points for provider initialization.
 *
 * Each preset demonstrates the recommended deployment mode(s) for that provider
 * and includes sensible defaults for production use.
 *
 * Usage:
 *   const config = getProviderPreset('whisper-docker');
 *   const customConfig = { ...config, env: { CUDA_VISIBLE_DEVICES: '0' } };
 */

import type {
  DockerDeploymentConfig,
  SystemDeploymentConfig,
  CloudDeploymentConfig,
} from './deployment-config.types.js';

/**
 * ============================================================================
 * WHISPER STT PROVIDER PRESETS
 * ============================================================================
 * Supports: Docker (recommended), System
 * Note: Local-only, offline capable
 */

export const WHISPER_DOCKER_PRESET: DockerDeploymentConfig = {
  id: 'whisper-docker',
  name: 'Whisper (Docker)',
  type: 'whisper',
  mode: 'docker',
  enabled: true,
  priority: 10,
  image: 'openai/whisper',
  tag: 'latest',
  pullPolicy: 'ifNotPresent',
  ports: {
    8000: 8000, // API port
  },
  volumes: {
    '/root/.cache': '/tmp/whisper-cache', // Model cache
  },
  network: 'bridge',
  resources: {
    memoryMb: 4096,
    cpuLimit: 2,
    memoryRequestMb: 2048,
    cpuRequest: 1,
  },
  restartPolicy: 'onFailure',
  maxRetryCount: 3,
  timeoutMs: 120000, // 2 minutes for model loading
  retries: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
  },
  healthCheck: {
    enabled: true,
    endpoint: 'http://localhost:8000/health',
    timeoutMs: 5000,
    intervalMs: 30000,
    failureThreshold: 3,
  },
  tags: {
    provider: 'whisper',
    type: 'stt',
    offline: 'true',
  },
};

export const WHISPER_SYSTEM_PRESET: SystemDeploymentConfig = {
  id: 'whisper-system',
  name: 'Whisper (System)',
  type: 'whisper',
  mode: 'system',
  enabled: true,
  priority: 5, // Lower than Docker for local fallback
  binary: 'whisper',
  packageManager: ['pip', 'brew'],
  pypiPackage: 'openai-whisper',
  brewFormula: 'whisper',
  searchPaths: [
    '/usr/local/bin',
    '/opt/whisper/bin',
    '~/.local/bin',
  ],
  versionConstraint: '>=20240101',
  systemDependencies: [
    {
      name: 'ffmpeg',
      packageManager: 'apt',
      required: true,
    },
    {
      name: 'python3',
      packageManager: 'system',
      required: true,
    },
  ],
  installationInstructions: {
    title: 'Install OpenAI Whisper',
    command: 'pip install openai-whisper',
    manualSteps: [
      'Ensure Python 3.7+ is installed',
      'Ensure ffmpeg is installed: apt-get install ffmpeg',
    ],
    documentationUrl: 'https://github.com/openai/whisper',
  },
  cliFlags: {
    defaults: {
      model: 'base',
      device: 'cpu',
      language: 'auto',
    },
  },
  environmentSetup: {
    CUDA_VISIBLE_DEVICES: '0', // Use first GPU if available
  },
  models: {
    path: '~/.cache/whisper',
    autoDownload: true,
    predownload: ['base', 'small'],
  },
  capabilityCheck: {
    command: 'whisper --version',
    successIndicator: 'version',
  },
  timeoutMs: 180000, // First run downloads model
  retries: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    multiplier: 2,
  },
  healthCheck: {
    enabled: true,
    command: 'whisper --help',
    expectedExitCode: 0,
    timeoutMs: 5000,
    intervalMs: 60000,
  },
  logging: {
    verbose: true,
    level: 'debug',
  },
  tags: {
    provider: 'whisper',
    type: 'stt',
    offline: 'true',
  },
};

/**
 * ============================================================================
 * FASTER-WHISPER STT PROVIDER PRESETS
 * ============================================================================
 * Supports: Docker (recommended), System
 * Note: Optimized local-only, faster than Whisper
 */

export const FASTER_WHISPER_DOCKER_PRESET: DockerDeploymentConfig = {
  id: 'faster-whisper-docker',
  name: 'Faster-Whisper (Docker)',
  type: 'faster-whisper',
  mode: 'docker',
  enabled: false, // Disabled by default, enable if using
  priority: 20, // Higher priority than regular Whisper
  image: 'faster-whisper',
  tag: 'latest',
  ports: {
    8001: 8001,
  },
  volumes: {
    '/root/.cache': '/tmp/faster-whisper-cache',
  },
  resources: {
    memoryMb: 6144, // Needs more memory
    cpuLimit: 4,
    memoryRequestMb: 3072,
    cpuRequest: 2,
  },
  restartPolicy: 'onFailure',
  timeoutMs: 150000,
  retries: {
    maxRetries: 3,
    initialDelayMs: 1500,
    maxDelayMs: 15000,
    multiplier: 2,
  },
  healthCheck: {
    enabled: true,
    endpoint: 'http://localhost:8001/health',
    timeoutMs: 5000,
    intervalMs: 30000,
    failureThreshold: 3,
  },

  tags: {
    provider: 'faster-whisper',
    type: 'stt',
    offline: 'true',
    optimized: 'true',
  },
};

export const FASTER_WHISPER_SYSTEM_PRESET: SystemDeploymentConfig = {
  id: 'faster-whisper-system',
  name: 'Faster-Whisper (System)',
  type: 'faster-whisper',
  mode: 'system',
  enabled: false,
  priority: 15,
  binary: 'faster-whisper',
  packageManager: ['pip'],
  pypiPackage: 'faster-whisper',
  searchPaths: ['~/.local/bin', '/usr/local/bin'],
  installationInstructions: {
    command: 'pip install faster-whisper',
    documentationUrl: 'https://github.com/SYSTRAN/faster-whisper',
  },
  cliFlags: {
    defaults: {
      device: 'auto',
      computeType: 'float16',
      language: 'auto',
    },
  },
  environmentSetup: {
    CUDA_VISIBLE_DEVICES: '0',
  },
  models: {
    path: '~/.cache/faster-whisper',
    autoDownload: true,
  },
  capabilityCheck: {
    command: 'faster-whisper --version',
  },
  timeoutMs: 180000,
  retries: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    multiplier: 2,
  },

  tags: {
    provider: 'faster-whisper',
    type: 'stt',
    offline: 'true',
    optimized: 'true',
  },
};

/**
 * ============================================================================
 * KOKORO TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Docker (recommended), System
 * Note: Local-only, high-quality voice synthesis
 */

export const KOKORO_DOCKER_PRESET: DockerDeploymentConfig = {
  id: 'kokoro-docker',
  name: 'Kokoro (Docker)',
  type: 'kokoro',
  mode: 'docker',
  enabled: false,
  priority: 15,
  image: 'kokoro-tts',
  tag: 'latest',
  ports: {
    5000: 5000,
  },
  volumes: {
    '/models': '/tmp/kokoro-models',
  },
  resources: {
    memoryMb: 4096,
    cpuLimit: 2,
    memoryRequestMb: 2048,
  },
  restartPolicy: 'onFailure',
  timeoutMs: 60000,
  healthCheck: {
    enabled: true,
    endpoint: 'http://localhost:5000/health',
    timeoutMs: 3000,
    intervalMs: 30000,
  },

  tags: {
    provider: 'kokoro',
    type: 'tts',
    offline: 'true',
    quality: 'high',
  },
};

export const KOKORO_SYSTEM_PRESET: SystemDeploymentConfig = {
  id: 'kokoro-system',
  name: 'Kokoro (System)',
  type: 'kokoro',
  mode: 'system',
  enabled: false,
  priority: 10,
  binary: 'kokoro',
  packageManager: ['pip'],
  pypiPackage: 'kokoro-tts',
  installationInstructions: {
    command: 'pip install kokoro-tts',
    documentationUrl: 'https://github.com/kokoro-lib/kokoro',
  },
  models: {
    path: '~/.cache/kokoro',
    autoDownload: true,
  },
  cliFlags: {
    defaults: {
      voice: 'af_bella',
      speed: '1.0',
    },
  },
  timeoutMs: 30000,

  tags: {
    provider: 'kokoro',
    type: 'tts',
    offline: 'true',
  },
};

/**
 * ============================================================================
 * PIPER TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Docker, System
 * Note: Lightweight, multi-language local TTS
 */

export const PIPER_SYSTEM_PRESET: SystemDeploymentConfig = {
  id: 'piper-system',
  name: 'Piper (System)',
  type: 'piper',
  mode: 'system',
  enabled: false,
  priority: 8,
  binary: 'piper',
  packageManager: ['pip'],
  pypiPackage: 'piper-tts',
  installationInstructions: {
    command: 'pip install piper-tts',
    documentationUrl: 'https://github.com/rhasspy/piper',
  },
  models: {
    path: '~/.local/share/piper/models',
    autoDownload: true,
  },
  cliFlags: {
    defaults: {
      voice: 'en_US-lessac-medium',
      rate: '22050',
    },
  },
  timeoutMs: 30000,

  tags: {
    provider: 'piper',
    type: 'tts',
    offline: 'true',
    lightweight: 'true',
  },
};

/**
 * ============================================================================
 * ELEVENLABS TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Cloud only
 * Note: Premium API-based service, requires API key
 */

export const ELEVENLABS_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'elevenlabs-api',
  name: 'ElevenLabs (Cloud)',
  type: 'elevenlabs',
  mode: 'cloud',
  enabled: false,
  priority: 20,
  provider: 'elevenlabs',
  endpoint: 'https://api.elevenlabs.io/v1',
  apiVersion: 'v1',
  auth: {
    type: 'apiKey',
    keyField: 'xi-api-key',
  },
  rateLimit: {
    requestsPerMinute: 60,
    maxConcurrent: 5,
  },
  quota: {
    enabled: true,
    monthlyCharacterLimit: 100000,
    costPer1kUnits: 0.002,
    alertThreshold: 80,
  },
  availableVoices: [
    'bella',
    'rachel',
    'daniel',
    'sam',
    'jessica',
  ],
  cache: {
    enabled: true,
    ttlSeconds: 3600,
    maxEntries: 1000,
  },
  timeoutMs: 30000,
  retries: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    multiplier: 2,
  },

  tags: {
    provider: 'elevenlabs',
    type: 'tts',
    cloud: 'true',
    premium: 'true',
  },
};

/**
 * ============================================================================
 * OPENAI STT/TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Cloud only
 * Note: Requires API key from OpenAI
 */

export const OPENAI_STT_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'openai-stt-api',
  name: 'OpenAI Whisper (Cloud)',
  type: 'openai',
  mode: 'cloud',
  enabled: false,
  priority: 15,
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  auth: {
    type: 'bearer',
  },
  rateLimit: {
    requestsPerMinute: 3500, // RPM limit varies by plan
  },
  quota: {
    enabled: true,
    costPer1kUnits: 0.002,
  },
  availableModels: ['whisper-1'],
  timeoutMs: 60000,
  retries: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
  },

  tags: {
    provider: 'openai',
    type: 'stt',
    cloud: 'true',
  },
};

export const OPENAI_TTS_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'openai-tts-api',
  name: 'OpenAI TTS (Cloud)',
  type: 'openai',
  mode: 'cloud',
  enabled: false,
  priority: 18,
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  auth: {
    type: 'bearer',
  },
  rateLimit: {
    requestsPerMinute: 3500,
  },
  availableModels: ['tts-1', 'tts-1-hd'],
  availableVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  quota: {
    enabled: true,
    costPer1kUnits: 0.015,
  },
  timeoutMs: 30000,

  tags: {
    provider: 'openai',
    type: 'tts',
    cloud: 'true',
  },
};

/**
 * ============================================================================
 * GOOGLE CLOUD STT/TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Cloud only
 * Note: Requires Google Cloud credentials
 */

export const GOOGLE_STT_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'google-stt-api',
  name: 'Google Cloud Speech-to-Text',
  type: 'google',
  mode: 'cloud',
  enabled: false,
  priority: 12,
  provider: 'google',
  endpoint: 'https://speech.googleapis.com/v1',
  auth: {
    type: 'apiKey',
    keyField: 'key',
  },
  regions: {
    default: 'global',
    endpoints: {
      'us-central1': 'https://us-central1-speech.googleapis.com/v1',
      'eu-west1': 'https://eu-west1-speech.googleapis.com/v1',
    },
  },
  quota: {
    enabled: true,
    costPer1kUnits: 0.006,
  },
  timeoutMs: 60000,

  tags: {
    provider: 'google',
    type: 'stt',
    cloud: 'true',
  },
};

export const GOOGLE_TTS_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'google-tts-api',
  name: 'Google Cloud Text-to-Speech',
  type: 'google',
  mode: 'cloud',
  enabled: false,
  priority: 16,
  provider: 'google',
  endpoint: 'https://texttospeech.googleapis.com/v1',
  auth: {
    type: 'apiKey',
    keyField: 'key',
  },
  availableVoices: [
    'en-US-Neural2-A',
    'en-US-Neural2-C',
    'en-US-Neural2-E',
  ],
  quota: {
    enabled: true,
    costPer1kUnits: 0.016,
  },
  timeoutMs: 30000,

  tags: {
    provider: 'google',
    type: 'tts',
    cloud: 'true',
  },
};

/**
 * ============================================================================
 * AZURE STT/TTS PROVIDER PRESETS
 * ============================================================================
 * Supports: Cloud only
 * Note: Requires Azure subscription
 */

export const AZURE_STT_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'azure-stt-api',
  name: 'Azure Speech-to-Text',
  type: 'azure',
  mode: 'cloud',
  enabled: false,
  priority: 12,
  provider: 'azure',
  endpoint: 'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1',
  auth: {
    type: 'apiKey',
    keyField: 'Ocp-Apim-Subscription-Key',
  },
  regions: {
    default: 'eastus',
    endpoints: {
      eastus: 'https://eastus.stt.speech.microsoft.com',
      westus: 'https://westus.stt.speech.microsoft.com',
      westeurope: 'https://westeurope.stt.speech.microsoft.com',
    },
  },
  quota: {
    enabled: true,
    costPer1kUnits: 0.002,
  },
  timeoutMs: 60000,

  tags: {
    provider: 'azure',
    type: 'stt',
    cloud: 'true',
  },
};

export const AZURE_TTS_CLOUD_PRESET: CloudDeploymentConfig = {
  id: 'azure-tts-api',
  name: 'Azure Text-to-Speech',
  type: 'azure',
  mode: 'cloud',
  enabled: false,
  priority: 16,
  provider: 'azure',
  endpoint: 'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1',
  auth: {
    type: 'apiKey',
    keyField: 'Ocp-Apim-Subscription-Key',
  },
  availableVoices: [
    'en-US-AriaNeural',
    'en-US-GuyNeural',
    'en-GB-LibbyNeural',
  ],
  regions: {
    default: 'eastus',
    endpoints: {
      eastus: 'https://eastus.tts.speech.microsoft.com',
    },
  },
  quota: {
    enabled: true,
    costPer1kUnits: 0.01,
  },
  timeoutMs: 30000,

  tags: {
    provider: 'azure',
    type: 'tts',
    cloud: 'true',
  },
};

/**
 * Registry of all available presets
 * Used for discovery and initialization
 */
export const DEPLOYMENT_PRESETS = {
  // Whisper STT
  'whisper-docker': WHISPER_DOCKER_PRESET,
  'whisper-system': WHISPER_SYSTEM_PRESET,

  // Faster-Whisper STT
  'faster-whisper-docker': FASTER_WHISPER_DOCKER_PRESET,
  'faster-whisper-system': FASTER_WHISPER_SYSTEM_PRESET,

  // Kokoro TTS
  'kokoro-docker': KOKORO_DOCKER_PRESET,
  'kokoro-system': KOKORO_SYSTEM_PRESET,

  // Piper TTS
  'piper-system': PIPER_SYSTEM_PRESET,

  // ElevenLabs TTS
  'elevenlabs-api': ELEVENLABS_CLOUD_PRESET,

  // OpenAI
  'openai-stt-api': OPENAI_STT_CLOUD_PRESET,
  'openai-tts-api': OPENAI_TTS_CLOUD_PRESET,

  // Google Cloud
  'google-stt-api': GOOGLE_STT_CLOUD_PRESET,
  'google-tts-api': GOOGLE_TTS_CLOUD_PRESET,

  // Azure
  'azure-stt-api': AZURE_STT_CLOUD_PRESET,
  'azure-tts-api': AZURE_TTS_CLOUD_PRESET,
};

/**
 * Get a preset by ID
 */
export function getDeploymentPreset(presetId: string) {
  return DEPLOYMENT_PRESETS[presetId as keyof typeof DEPLOYMENT_PRESETS];
}

/**
 * List all available presets
 */
export function listDeploymentPresets() {
  return Object.entries(DEPLOYMENT_PRESETS).map(([id, config]) => ({
    id,
    name: config.name || id,
    type: config.type,
    mode: config.mode,
    provider: 'provider' in config ? config.provider : undefined,
  }));
}

/**
 * Get presets by mode
 */
export function getPresetsByMode(mode: 'docker' | 'system' | 'cloud') {
  return Object.entries(DEPLOYMENT_PRESETS)
    .filter(([_, config]) => config.mode === mode)
    .map(([id, config]) => ({
      id,
      name: config.name || id,
      type: config.type,
    }));
}

/**
 * Get presets by provider type
 */
export function getPresetsByType(type: string) {
  return Object.entries(DEPLOYMENT_PRESETS)
    .filter(([_, config]) => config.type === type)
    .map(([id, config]) => ({
      id,
      name: config.name || id,
      mode: config.mode,
    }));
}
