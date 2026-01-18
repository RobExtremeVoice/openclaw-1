/**
 * Voice Provider Utilities
 *
 * Provides utilities for detecting system capabilities,
 * validating providers, and managing voice configuration.
 */

import os from "node:os";
import { execSync } from "node:child_process";
import type { SystemCapability, DependencyInfo, ProviderAvailability } from "./voice-providers.types.js";

/**
 * Detect system capabilities for voice provider recommendations
 */
export function detectSystemCapabilities(): SystemCapability {
  const cpuThreads = os.cpus().length;
  const totalMemoryGb = os.totalmem() / (1024 * 1024 * 1024);
  const nodeVersion = process.version;

  let gpuType: "cuda" | "mps" | "other" | undefined;
  let hasGpu = false;

  // Check for GPU on current platform
  if (process.platform === "darwin") {
    // macOS - check for Metal Performance Shaders (MPS)
    try {
      const result = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep -i gpu || true', {
        encoding: "utf-8",
        timeout: 2000,
      });
      if (result.includes("AMD") || result.includes("NVIDIA") || result.includes("Intel")) {
        hasGpu = true;
        gpuType = "mps";
      }
    } catch {
      // Silent fail
    }
  } else if (process.platform === "linux") {
    // Linux - check for NVIDIA CUDA
    try {
      execSync("which nvidia-smi", { stdio: "pipe", timeout: 2000 });
      hasGpu = true;
      gpuType = "cuda";
    } catch {
      // Check for AMD ROCm
      try {
        execSync("which rocminfo", { stdio: "pipe", timeout: 2000 });
        hasGpu = true;
        gpuType = "cuda"; // Treat AMD ROCm as CUDA-compatible
      } catch {
        // Silent fail
      }
    }
  }

  return {
    hasGpu,
    gpuType,
    cpuThreads,
    totalMemoryGb,
    osType: (process.platform as "darwin" | "linux" | "win32") || "linux",
    nodeVersion,
  };
}

/**
 * Check if a Node.js package is installed
 */
export function checkPackageInstalled(packageName: string): DependencyInfo {
  let installed = false;
  let version: string | undefined;

  try {
    // Try to require the package to verify it's installed
    const pkg = require.resolve(packageName);
    installed = Boolean(pkg);

    // Try to get version from package.json
    try {
      const pkgJson = require.resolve(`${packageName}/package.json`);
      const pkgData = JSON.parse(require("fs").readFileSync(pkgJson, "utf-8"));
      version = pkgData.version;
    } catch {
      // Version detection failed, that's ok
    }
  } catch {
    installed = false;
  }

  return {
    name: packageName,
    installed,
    version,
    optional: true,
    required: false,
    npmPackage: packageName,
  };
}

/**
 * Get list of required dependencies for a provider
 */
export function getProviderDependencies(
  providerType: "stt" | "tts",
  model: string,
): DependencyInfo[] {
  const deps: DependencyInfo[] = [];

  // STT provider dependencies
  if (providerType === "stt") {
    if (model === "whisper") {
      deps.push({
        name: "openai-whisper",
        installed: checkPackageInstalled("openai-whisper").installed,
        optional: false,
        required: true,
        npmPackage: "openai-whisper",
      });
    } else if (model === "faster-whisper") {
      deps.push({
        name: "faster-whisper",
        installed: checkPackageInstalled("faster-whisper").installed,
        optional: false,
        required: true,
        npmPackage: "faster-whisper",
      });
    } else if (model === "openai" || model === "google" || model === "azure") {
      // Cloud providers don't require local dependencies
    }
  }

  // TTS provider dependencies
  if (providerType === "tts") {
    if (model === "kokoro") {
      deps.push({
        name: "kokoro",
        installed: checkPackageInstalled("kokoro").installed,
        optional: false,
        required: true,
        npmPackage: "@kokoro-ai/kokoro",
      });
    } else if (model === "piper") {
      deps.push({
        name: "piper-tts",
        installed: checkPackageInstalled("piper-tts").installed,
        optional: false,
        required: true,
        npmPackage: "piper-tts",
      });
    }
  }

  return deps;
}

/**
 * Determine if a local provider is available based on system capabilities
 */
export function isLocalProviderAvailable(
  providerType: "stt" | "tts",
  model: string,
  capabilities?: SystemCapability,
): ProviderAvailability {
  const deps = getProviderDependencies(providerType, model);
  const allDepsInstalled = deps.every((d) => d.installed);

  if (!allDepsInstalled) {
    const missingDeps = deps.filter((d) => !d.installed).map((d) => d.name);
    return {
      id: `local-${providerType}-${model}`,
      type: providerType,
      available: false,
      reason: `Missing dependencies: ${missingDeps.join(", ")}`,
      dependencies: deps,
      recommended: false,
    };
  }

  // Check memory requirements
  const cap = capabilities || detectSystemCapabilities();
  if (model === "large" && cap.totalMemoryGb < 4) {
    return {
      id: `local-${providerType}-${model}`,
      type: providerType,
      available: false,
      reason: "Insufficient memory for large model",
      dependencies: deps,
      recommended: false,
    };
  }

  return {
    id: `local-${providerType}-${model}`,
    type: providerType,
    available: true,
    dependencies: deps,
    recommended: cap.hasGpu || cap.totalMemoryGb >= 8,
    recommendationReason: cap.hasGpu ? "GPU available for acceleration" : "Sufficient memory",
  };
}

/**
 * Get recommended providers based on system capabilities
 */
export function getRecommendedProviders(capabilities?: SystemCapability) {
  const caps = capabilities || detectSystemCapabilities();
  const recommendations = [];

  // STT recommendations
  if (caps.hasGpu) {
    if (caps.gpuType === "cuda" || caps.gpuType === "mps") {
      recommendations.push({
        type: "stt" as const,
        provider: "local",
        model: "faster-whisper",
        modelSize: caps.totalMemoryGb > 16 ? "medium" : "small",
        reason: "GPU acceleration available",
      });
    }
  } else if (caps.totalMemoryGb >= 8) {
    recommendations.push({
      type: "stt" as const,
      provider: "local",
      model: "faster-whisper",
      modelSize: "small",
      reason: "Sufficient CPU memory for local transcription",
    });
  } else {
    recommendations.push({
      type: "stt" as const,
      provider: "cloud",
      service: "openai",
      reason: "Limited resources; cloud recommended",
    });
  }

  // TTS recommendations
  if (caps.hasGpu) {
    recommendations.push({
      type: "tts" as const,
      provider: "local",
      model: "kokoro",
      reason: "GPU available for real-time synthesis",
    });
  } else if (caps.totalMemoryGb >= 4) {
    recommendations.push({
      type: "tts" as const,
      provider: "local",
      model: "kokoro",
      reason: "Local synthesis without GPU",
    });
  } else {
    recommendations.push({
      type: "tts" as const,
      provider: "cloud",
      service: "elevenlabs",
      reason: "Limited resources; cloud recommended",
    });
  }

  return recommendations;
}

/**
 * Validate provider configuration completeness
 * Delegates to validateSTTProviderConfig for new discriminated union types
 * Maintains backward compatibility with "local"/"cloud" generic types
 */
export function validateProviderConfig(config: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const type = config.type as string | undefined;

  if (!type) {
    errors.push("Provider type is required");
    return { valid: false, errors };
  }

  // Check if it's a new discriminated union type
  if (["whisper", "faster-whisper", "openai", "google", "azure"].includes(type)) {
    return validateSTTProviderConfig(config);
  }

  // Legacy validation for "local"/"cloud" types
  if (type === "local") {
    if (!config.model) {
      errors.push("Local provider requires model specification");
    }
  } else if (type === "cloud") {
    if (!config.service) {
      errors.push("Cloud provider requires service specification");
    }
    if (!config.apiKey) {
      errors.push("Cloud provider requires API key");
    }
  } else {
    errors.push(`Unknown provider type: ${type}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Migrate legacy voice configuration to new schema
 */
export function migrateLegacyVoiceConfig(legacyConfig: any): Record<string, unknown> {
  if (!legacyConfig) {
    return {};
  }

  const providers: any[] = [];

  // Migrate legacy tts.voice to new structure
  if (legacyConfig.tts?.voiceId || legacyConfig.tts?.voice) {
    providers.push({
      id: "elevenlabs-legacy",
      priority: 1,
      enabled: true,
      tts: {
        type: "cloud",
        service: "elevenlabs",
        voiceId: legacyConfig.tts.voiceId || legacyConfig.tts.voice,
        modelId: legacyConfig.tts.modelId,
        outputFormat: legacyConfig.tts.outputFormat,
        apiKey: legacyConfig.tts.apiKey,
      },
    });
  }

  return {
    enabled: true,
    providers,
    migrationMetadata: {
      migratedFrom: "legacy-tts-config",
      migratedAt: new Date().toISOString(),
    },
  };
}

/**
 * Get installation command for a provider dependency
 */
export function getInstallCommand(
  packageName: string,
  platform: "npm" | "yarn" | "pnpm" = "npm",
): string {
  const commands: Record<string, Record<string, string>> = {
    "openai-whisper": {
      npm: "npm install openai-whisper",
      yarn: "yarn add openai-whisper",
      pnpm: "pnpm add openai-whisper",
    },
    "faster-whisper": {
      npm: "npm install faster-whisper",
      yarn: "yarn add faster-whisper",
      pnpm: "pnpm add faster-whisper",
    },
    "@kokoro-ai/kokoro": {
      npm: "npm install @kokoro-ai/kokoro",
      yarn: "yarn add @kokoro-ai/kokoro",
      pnpm: "pnpm add @kokoro-ai/kokoro",
    },
    "piper-tts": {
      npm: "npm install piper-tts",
      yarn: "yarn add piper-tts",
      pnpm: "pnpm add piper-tts",
    },
  };

  return commands[packageName]?.[platform] || `npm install ${packageName}`;
}

/**
 * Validate provider-specific STT configuration
 * Ensures all required fields are present for the selected provider type
 */
export function validateSTTProviderConfig(config: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.type) {
    errors.push("Provider type is required (whisper, faster-whisper, openai, google, or azure)");
    return { valid: false, errors };
  }

  const providerType = config.type as string;

  if (providerType === "whisper") {
    // Whisper-specific validation
    if (!config.modelSize) {
      errors.push("Whisper requires modelSize (tiny, small, base, medium, or large)");
    }
  } else if (providerType === "faster-whisper") {
    // Faster-Whisper-specific validation
    if (!config.modelSize) {
      errors.push("Faster-Whisper requires modelSize (tiny, small, base, medium, or large)");
    }
    if (config.cpuThreads && (typeof config.cpuThreads !== "number" || config.cpuThreads < 1)) {
      errors.push("cpuThreads must be a positive integer");
    }
    if (config.beamSize && (typeof config.beamSize !== "number" || config.beamSize < 1 || config.beamSize > 512)) {
      errors.push("beamSize must be between 1 and 512");
    }
    if (config.computeType && !["int8", "float16", "float32"].includes(config.computeType as string)) {
      errors.push("computeType must be int8, float16, or float32");
    }
  } else if (["openai", "google", "azure"].includes(providerType)) {
    // Cloud provider validation
    if (!config.service) {
      errors.push(`${providerType} requires service field`);
    }
    if (!config.apiKey) {
      errors.push(`${providerType} requires apiKey`);
    }
  } else {
    errors.push(`Unknown STT provider type: ${providerType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
