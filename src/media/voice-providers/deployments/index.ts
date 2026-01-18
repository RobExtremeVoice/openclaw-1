/**
 * Deployment Handlers Index
 *
 * Export point for all deployment mode handlers and provider adapters.
 */

// Specifications (contracts for sub-agents)
export type { DockerDeploymentHandler } from './docker-handler.spec.js';
export type { SystemDeploymentHandler } from './system-handler.spec.js';
export type { CloudDeploymentHandler, RetryConfig } from './cloud-handler.spec.js';

// Core implementations
export { DockerHandler } from './docker-handler.js';
export { SystemHandler } from './system-handler.js';
export { CloudHandler } from './cloud-handler.js';

// Docker provider support
export type { DockerProviderConfig, PortAllocationResult, ContainerState } from './docker-handler.js';
export {
  DockerProviderAdapter,
  PortAllocator,
  VolumeManager,
  PROVIDER_TEMPLATES,
  getGlobalDockerProviderAdapter,
  resetGlobalDockerProviderAdapter,
} from './docker-provider-adapter.js';
export type { ProviderDockerTemplate } from './docker-provider-adapter.js';
