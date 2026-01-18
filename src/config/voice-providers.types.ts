/**
 * Voice Provider Types and Interfaces
 *
 * Defines TypeScript interfaces for voice provider operations,
 * detection, and configuration management.
 */

/**
 * System capability detection result
 */
export interface SystemCapability {
  hasGpu: boolean;
  gpuType?: "cuda" | "mps" | "other";
  cpuThreads: number;
  totalMemoryGb: number;
  diskSpaceGb?: number;
  osType: "darwin" | "linux" | "win32";
  nodeVersion: string;
}

/**
 * Dependency check result
 */
export interface DependencyInfo {
  name: string;
  installed: boolean;
  version?: string;
  optional: boolean;
  required: boolean;
  npmPackage?: string;
}

/**
 * Provider availability result
 */
export interface ProviderAvailability {
  id: string;
  type: "stt" | "tts";
  available: boolean;
  reason?: string;
  dependencies: DependencyInfo[];
  recommended: boolean;
  recommendationReason?: string;
}

/**
 * Voice provider test result
 */
export interface VoiceProviderTestResult {
  providerId: string;
  type: "stt" | "tts";
  success: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Voice provider detection and recommendation
 */
export interface ProviderRecommendation {
  providers: Array<{
    id: string;
    type: "stt" | "tts";
    provider: string;
    model?: string;
    priority: number;
    reason: string;
  }>;
  systemCapabilities: SystemCapability;
  recommendations: string[];
  warnings: string[];
}

/**
 * Provider initialization options
 */
export interface ProviderInitOptions {
  workspaceDir?: string;
  cacheDir?: string;
  downloadModels?: boolean;
  validateOnly?: boolean;
}

/**
 * Provider initialization result
 */
export interface ProviderInitResult {
  success: boolean;
  providerId: string;
  error?: Error;
  warnings: string[];
  details: Record<string, unknown>;
}

/**
 * Docker deployment configuration for voice providers
 */
export interface DockerDeploymentConfig {
  /** Docker image reference (e.g., "faster-whisper:latest") */
  image: string;
  /** Host port to bind (auto-allocated if not specified) */
  port?: number;
  /** Container name (optional, defaults to provider-based name) */
  containerName?: string;
  /** Volume mounts for model caching and persistence */
  volumes?: Record<string, string>;
  /** Environment variables for container configuration */
  env?: Record<string, string>;
  /** Health check configuration */
  healthCheck?: {
    /** Health check endpoint path */
    endpoint: string;
    /** Check interval in milliseconds */
    interval?: number;
    /** Check timeout in milliseconds */
    timeout?: number;
  };
  /** GPU support configuration */
  gpuEnabled?: boolean;
  /** CPU limit for container (e.g., "4" for 4 cores) */
  cpuLimit?: string;
  /** Memory limit for container (e.g., "8g" for 8GB) */
  memoryLimit?: string;
}

/**
 * Docker container deployment state
 */
export interface DockerContainerState {
  /** Container ID */
  id: string;
  /** Docker image used */
  image: string;
  /** Provider type (e.g., "faster-whisper", "chatterbox") */
  providerType: string;
  /** Container status */
  status: "running" | "stopped" | "exited" | "error";
  /** Host port assigned */
  port: number;
  /** Container creation timestamp */
  createdAt: Date;
  /** Last health check result */
  lastHealthCheck?: {
    timestamp: Date;
    healthy: boolean;
    error?: string;
  };
}

/**
 * Docker provider instance configuration
 */
export interface DockerProviderInstance {
  /** Unique instance ID (e.g., "faster-whisper-gpu-1") */
  instanceId: string;
  /** Provider type (e.g., "faster-whisper", "chatterbox") */
  providerType: string;
  /** Deployment configuration */
  config: DockerDeploymentConfig;
  /** Current container state */
  state?: DockerContainerState;
  /** Flag indicating if instance is active */
  active: boolean;
}

/**
 * Docker provider adapter configuration
 */
export interface DockerProviderAdapterConfig {
  /** Enable automatic port allocation */
  autoPortAllocation?: boolean;
  /** Port range for allocation */
  portRange?: {
    min: number;
    max: number;
  };
  /** Enable automatic volume creation for model caching */
  autoVolumeManagement?: boolean;
  /** Enable health monitoring */
  enableHealthMonitoring?: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
}

/**
 * Voice provider deployment mode
 */
export type DeploymentMode = "docker" | "system" | "cloud";

/**
 * Unified deployment configuration for voice providers
 */
export interface UnifiedDeploymentConfig {
  /** Deployment mode */
  mode: DeploymentMode;
  /** Docker-specific configuration */
  docker?: DockerDeploymentConfig;
  /** System-specific configuration */
  system?: {
    pythonPath?: string;
    installCmd?: string;
  };
  /** Cloud-specific configuration */
  cloud?: {
    endpoint: string;
    apiKey?: string;
  };
  /** Optional health check configuration (applies to all modes) */
  healthCheck?: {
    endpoint: string;
    interval?: number;
  };
}
