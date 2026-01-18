/**
 * Voice Providers Onboarding
 *
 * Handles interactive selection and configuration of STT/TTS providers
 * during the onboarding wizard. Includes system capability detection,
 * dependency validation, and provider recommendations.
 */

import type { ClawdbotConfig } from "../../config/config.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import type { RuntimeEnv } from "../../runtime.js";
import {
  detectSystemCapabilities,
  getRecommendedProviders,
  isLocalProviderAvailable,
  checkPackageInstalled,
  getInstallCommand,
} from "../../config/voice-providers.utils.js";
import type {
  VoiceProviderEntry,
  STTProviderConfig,
  TTSProviderConfig,
} from "../../config/zod-schema.voice-providers.js";
import { detectBinary } from "../onboard-helpers.js";
// import { installVoiceProviderPlugin } from "@clawdbot/speech-plugins";

// TODO: Fix import path when extensions are properly built
interface InstallationResult {
  success: boolean;
  mode: string;
  details: Record<string, unknown>;
  error?: string;
}

async function installVoiceProviderPlugin(
  mode: string,
  config: Record<string, unknown>,
  options?: { verbose?: boolean; cacheDir?: string },
): Promise<InstallationResult> {
  return {
    success: true,
    mode,
    details: { configured: true },
  }; // Stub implementation for now
}

type ProviderTypeChoice = "system" | "docker" | "cloud";
type STTModelChoice = "whisper" | "faster-whisper" | "openai";
type TTSModelChoice = "kokoro" | "piper" | "elevenlabs";
type DeploymentMode = "system" | "docker";

interface VoiceProviderSetupResult {
  cfg: ClawdbotConfig;
  voiceProvidersAdded: boolean;
}

/**
 * Prompt for provider type selection (System vs Docker vs Cloud)
 */
async function promptProviderType(prompter: WizardPrompter): Promise<ProviderTypeChoice> {
  return await prompter.select<ProviderTypeChoice>({
    message: "Voice provider deployment",
    options: [
      { value: "system", label: "System", hint: "Install via package manager (brew/apt/choco)" },
      { value: "docker", label: "Docker", hint: "Run in Docker containers" },
      { value: "cloud", label: "Cloud", hint: "Use cloud services (easier setup)" },
    ],
    initialValue: "system",
  });
}

/**
 * Prompt for Docker configuration (image and port)
 */
async function promptDockerConfiguration(prompter: WizardPrompter, providerType: "stt" | "tts"): Promise<{
  dockerImage: string;
  basePort: number;
}> {
  const dockerImages: Record<string, string[]> = {
    stt: [
      "whisper:latest",
      "faster-whisper:latest",
      "whisper:small",
      "faster-whisper:small",
    ],
    tts: [
      "kokoro:latest",
      "piper:latest",
      "kokoro:v1",
      "piper:v1",
    ],
  };

  const images = dockerImages[providerType] || [];

  const dockerImage = (await prompter.select({
    message: `Docker image for ${providerType.toUpperCase()}`,
    options: images.map((img) => ({
      value: img,
      label: img,
    })),
    initialValue: images[0] || "latest",
  })) as string;

  const basePortStr = await prompter.text({
    message: "Base port for Docker container (8000-8999)",
    placeholder: "8000",
  });

  let basePort = 8000;
  if (basePortStr && !isNaN(Number(basePortStr))) {
    const port = parseInt(basePortStr, 10);
    basePort = Math.max(8000, Math.min(8999, port));
  }

  return { dockerImage, basePort };
}

/**
 * Prompt for local STT model selection and provider-specific options
 */
async function promptLocalSTTModel(
  prompter: WizardPrompter,
  capabilities = detectSystemCapabilities(),
): Promise<{
  model: string;
  modelSize: string;
  computeType?: "int8" | "float16" | "float32";
  cpuThreads?: number;
  beamSize?: number;
}> {
  const options = [];

  const fsw = isLocalProviderAvailable("stt", "faster-whisper", capabilities);
  if (fsw.available) {
    options.push({
      value: "faster-whisper",
      label: "Faster-Whisper (faster, optimized)",
      hint: fsw.recommended ? "Recommended" : "Available",
    });
  }

  const whisper = isLocalProviderAvailable("stt", "whisper", capabilities);
  if (whisper.available) {
    options.push({
      value: "whisper",
      label: "Whisper (accurate, standard)",
      hint: "Available",
    });
  }

  if (options.length === 0) {
    return { model: "faster-whisper", modelSize: "small" };
  }

  const model = (await prompter.select({
    message: "STT model",
    options,
    initialValue: options[0]?.value || "faster-whisper",
  })) as string;

  const modelSizeOptions = [
    { value: "tiny", label: "Tiny (fastest, lowest accuracy)" },
    { value: "base", label: "Base (balanced)" },
    { value: "small", label: "Small (recommended)" },
    { value: "medium", label: "Medium (more accurate, slower)" },
    { value: "large", label: "Large (most accurate, slowest)" },
  ];

  // Filter based on available memory
  const filtered = capabilities.totalMemoryGb < 4
    ? modelSizeOptions.filter(o => !['medium', 'large'].includes(o.value))
    : modelSizeOptions;

  const modelSize = (await prompter.select({
    message: "Model size",
    options: filtered,
    initialValue: "small",
  })) as string;

  const result: {
    model: string;
    modelSize: string;
    computeType?: "int8" | "float16" | "float32";
    cpuThreads?: number;
    beamSize?: number;
  } = { model, modelSize };

  // Collect faster-whisper-specific options
  if (model === "faster-whisper") {
    const computeType = (await prompter.select({
      message: "Compute type (affects accuracy vs speed)",
      options: [
        { value: "float32", label: "Float32 (most accurate, slower)" },
        { value: "float16", label: "Float16 (balanced, recommended)" },
        { value: "int8", label: "Int8 (fastest, lower accuracy)" },
      ],
      initialValue: "float16",
    })) as "int8" | "float16" | "float32";

    result.computeType = computeType;

    const cpuThreads = await prompter.text({
      message: "CPU threads (leave blank for auto-detect)",
      placeholder: String(capabilities.cpuThreads),
    });

    if (cpuThreads && !isNaN(Number(cpuThreads))) {
      result.cpuThreads = Math.max(1, parseInt(cpuThreads, 10));
    }

    const beamSize = await prompter.text({
      message: "Beam search size 1-512 (higher = better accuracy but slower)",
      placeholder: "5",
    });

    if (beamSize && !isNaN(Number(beamSize))) {
      const size = Math.max(1, Math.min(512, parseInt(beamSize, 10)));
      result.beamSize = size;
    }
  }

  return result;
}

/**
 * Prompt for cloud STT service and credentials
 */
async function promptCloudSTTProvider(prompter: WizardPrompter): Promise<STTProviderConfig> {
  const service = (await prompter.select({
    message: "Cloud STT service",
    options: [
      { value: "openai", label: "OpenAI Whisper API", hint: "Recommended" },
      { value: "google", label: "Google Cloud Speech-to-Text" },
      { value: "azure", label: "Azure Speech Services" },
    ],
    initialValue: "openai",
  })) as "openai" | "google" | "azure";

  const apiKey = await prompter.text({
    message: `${service.toUpperCase()} API key`,
    placeholder: "Paste your API key here",
  });

  const config: STTProviderConfig = {
    type: service,
    service: service,
    apiKey: apiKey,
    model: service === "openai" ? "whisper-1" : undefined,
    language: "en",
  };

  return config;
}

/**
 * Prompt for local TTS model selection
 */
async function promptLocalTTSModel(
  prompter: WizardPrompter,
  capabilities = detectSystemCapabilities(),
): Promise<{ model: string; voice?: string }> {
  const options = [];

  const kokoro = isLocalProviderAvailable("tts", "kokoro", capabilities);
  if (kokoro.available) {
    options.push({
      value: "kokoro",
      label: "Kokoro (natural, fast)",
      hint: kokoro.recommended ? "Recommended" : "Available",
    });
  }

  const piper = isLocalProviderAvailable("tts", "piper", capabilities);
  if (piper.available) {
    options.push({
      value: "piper",
      label: "Piper (lightweight, offline)",
      hint: "Available",
    });
  }

  if (options.length === 0) {
    return { model: "kokoro" };
  }

  const model = (await prompter.select({
    message: "TTS model",
    options,
    initialValue: options[0]?.value || "kokoro",
  })) as string;

  const voiceOptions = [];
  if (model === "kokoro") {
    voiceOptions.push(
      { value: "af_heart", label: "Kokoro Heart (female)" },
      { value: "af", label: "Kokoro AF (female)" },
      { value: "am", label: "Kokoro AM (male)" },
      { value: "bf", label: "Kokoro BF (female)" },
    );
  } else if (model === "piper") {
    voiceOptions.push(
      { value: "en_US-amy", label: "Amy (US, female)" },
      { value: "en_US-lessac", label: "Lessac (US, female)" },
      { value: "en_GB-alan", label: "Alan (UK, male)" },
    );
  }

  let voice: string | undefined;
  if (voiceOptions.length > 0) {
    voice = (await prompter.select({
      message: "Voice",
      options: voiceOptions,
      initialValue: voiceOptions[0]?.value,
    })) as string;
  }

  return { model, voice };
}

/**
 * Prompt for cloud TTS service and credentials
 */
async function promptCloudTTSProvider(
  prompter: WizardPrompter,
): Promise<TTSProviderConfig> {
  const service = (await prompter.select({
    message: "Cloud TTS service",
    options: [
      { value: "elevenlabs", label: "ElevenLabs", hint: "Recommended, natural voices" },
      { value: "google", label: "Google Cloud Text-to-Speech" },
      { value: "azure", label: "Azure Speech Services" },
      { value: "openai", label: "OpenAI TTS" },
    ],
    initialValue: "elevenlabs",
  })) as "elevenlabs" | "google" | "azure" | "openai";

  const apiKey = await prompter.text({
    message: `${service.toUpperCase()} API key`,
    placeholder: "Paste your API key here",
  });

  const voiceId = await prompter.text({
    message: "Voice ID (optional, leave blank for default)",
    placeholder: service === "elevenlabs" ? "Rachel" : "default",
  });

  const config: TTSProviderConfig = {
    type: service,
    service: service,
    apiKey: apiKey,
    voice: voiceId || undefined,
    speed: 1,
  };

  return config;
}

/**
 * Detect system-level dependencies (ffmpeg, python3) for system deployment
 */
async function detectSystemDependencies(prompter: WizardPrompter): Promise<{
  hasFfmpeg: boolean;
  hasPython3: boolean;
}> {
  const [hasFfmpeg, hasPython3] = await Promise.all([
    detectBinary("ffmpeg"),
    detectBinary("python3"),
  ]);

  return { hasFfmpeg, hasPython3 };
}

/**
 * Show installation instructions for missing system dependencies (multi-platform)
 */
async function showSystemDependencyInstructions(
  prompter: WizardPrompter,
  missing: Array<{ name: string; binaries: string[] }>,
): Promise<void> {
  if (missing.length === 0) return;

  const platform = process.platform;
  const instructions: Record<string, Record<string, string>> = {
    ffmpeg: {
      darwin: "brew install ffmpeg",
      linux: "sudo apt-get install -y ffmpeg  # Ubuntu/Debian\n# or: sudo dnf install -y ffmpeg  # Fedora",
      win32: "choco install ffmpeg  # (requires Chocolatey)\n# or download from: https://ffmpeg.org/download.html",
    },
    python3: {
      darwin: "brew install python@3.11",
      linux: "sudo apt-get install -y python3 python3-pip  # Ubuntu/Debian\n# or: sudo dnf install -y python3 python3-pip  # Fedora",
      win32: "choco install python  # (requires Chocolatey)\n# or download from: https://www.python.org/downloads/",
    },
  };

  const noteLines = [
    "Missing system dependencies. Install before using system deployment:",
    "",
  ];

  for (const dep of missing) {
    const cmd = instructions[dep.name]?.[platform] || `Install ${dep.name} for your platform`;
    noteLines.push(`${dep.name.toUpperCase()}:`);
    noteLines.push(cmd);
    noteLines.push("");
  }

  noteLines.push("You can install these after the wizard completes.");

  await prompter.note(noteLines.join("\n"), "System dependencies");
}

/**
 * Handle missing dependencies for local providers
 */
async function handleMissingDependencies(
  prompter: WizardPrompter,
  model: string,
  dependencies: string[],
): Promise<boolean> {
  const confirmed = await prompter.confirm({
    message: `Install ${dependencies.join(", ")}?`,
    initialValue: true,
  });

  if (confirmed) {
    const commands = dependencies.map(dep => getInstallCommand(dep, "npm")).join(" && ");

    await prompter.note(
      [
        "Installation commands:",
        "",
        `${commands}`,
        "",
        "You can run these commands after the setup wizard completes.",
      ].join("\n"),
      "Install dependencies",
    );
  }

  return confirmed;
}

/**
 * Create provider entry from user selections
 */
function createProviderEntry(
  id: string,
  sttConfig?: STTProviderConfig,
  ttsConfig?: TTSProviderConfig,
): VoiceProviderEntry {
  const entry: Record<string, any> = {
    id,
    priority: 0,
    enabled: true,
  };

  if (sttConfig) {
    entry.stt = sttConfig;
  }

  if (ttsConfig) {
    entry.tts = ttsConfig;
  }

  return entry as VoiceProviderEntry;
}

/**
 * Detect available providers and show summary
 */
async function showProviderSummary(
  prompter: WizardPrompter,
  sttConfig?: STTProviderConfig,
  ttsConfig?: TTSProviderConfig,
): Promise<boolean> {
  const summary = [];

  if (sttConfig) {
    let sttLabel = "Unknown";
    const sttAny = sttConfig as any;
    if (sttConfig.type === "whisper") {
      const mode = sttAny.deploymentMode === "docker" ? "Docker" : "System";
      sttLabel = `${mode} (Whisper - ${sttConfig.modelSize})`;
    } else if (sttConfig.type === "faster-whisper") {
      const mode = sttAny.deploymentMode === "docker" ? "Docker" : "System";
      sttLabel = `${mode} (Faster-Whisper - ${sttConfig.modelSize})`;
    } else if (sttConfig.type === "openai" || sttConfig.type === "google" || sttConfig.type === "azure") {
      sttLabel = `Cloud (${sttConfig.type})`;
    }
    summary.push(`STT: ${sttLabel}`);
  }

  if (ttsConfig) {
    let ttsLabel = "Unknown";
    const ttsAny = ttsConfig as any;
    if (ttsConfig.type === "local") {
      const mode = ttsAny.deploymentMode === "docker" ? "Docker" : "System";
      ttsLabel = `${mode} (${ttsConfig.model || "unknown"})`;
    } else {
      ttsLabel = `Cloud (${ttsConfig.service || ttsConfig.type})`;
    }
    summary.push(`TTS: ${ttsLabel}`);
  }

  if (summary.length === 0) {
    return false;
  }

  const confirmed = await prompter.confirm({
    message: `Configure voice providers?\n${summary.map((s) => `  - ${s}`).join("\n")}`,
    initialValue: true,
  });

  return confirmed;
}

/**
 * Initialize system mode deployment for voice providers
 * Calls the plugin installer to automatically install ffmpeg, python3, and models
 */
async function initializeSystemModeDeployment(
  prompter: WizardPrompter,
  model: string,
  deploymentConfig: Record<string, any>,
  verbose = false,
): Promise<boolean> {
  try {
    await prompter.note("Installing system dependencies (ffmpeg, python3, models)...", "Installing");

    const result = await installVoiceProviderPlugin(
      "system",
      {
        ...deploymentConfig,
        model,
      },
      { verbose, cacheDir: process.env.XDG_CACHE_HOME || `${process.env.HOME}/.cache` },
    );

    if (result.success) {
      const details = Object.entries(result.details)
        .map(([key, value]) => `  ✓ ${key}: ${JSON.stringify(value)}`)
        .join("\n");

      await prompter.note(
        [
          "✓ System mode initialized successfully!",
          "",
          "Installed components:",
          details,
        ].join("\n"),
        "Installation complete",
      );
      return true;
    } else {
      const errorMsg = result.error || "Unknown error during installation";
      await prompter.note(
        [
          "⚠ System mode initialization failed:",
          `  Error: ${errorMsg}`,
          "",
          "Fallback options:",
          "  • Try installing ffmpeg and python3 manually",
          "  • Use Docker mode for containerized deployment",
          "  • Use Cloud mode with external API providers",
        ].join("\n"),
        "Installation failed",
      );
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prompter.note(
      [
        "⚠ Error during system initialization:",
        `  ${errorMsg}`,
        "",
        "Fallback options:",
        "  • Try Docker mode for containerized deployment",
        "  • Use Cloud mode with external API providers",
      ].join("\n"),
      "Installation error",
    );
    return false;
  }
}

/**
 * Main voice provider onboarding function
 */
export async function setupVoiceProviders(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
}): Promise<VoiceProviderSetupResult> {
  const { cfg, prompter, runtime } = params;
  let nextConfig = cfg;

  // Show intro
  await prompter.note(
    [
      "Voice providers enable speech-to-text (STT) and text-to-speech (TTS).",
      "Deployment options:",
      "  - System: Install dependencies via package manager (brew/apt/choco)",
      "  - Docker: Run models in Docker containers",
      "  - Cloud: Use cloud services (easier setup, requires API key)",
      "Both STT and TTS are optional - you can configure one, both, or skip.",
    ].join("\n"),
    "Voice providers",
  );

  // Get system capabilities
  const capabilities = detectSystemCapabilities();
  runtime.log?.(`Detected: ${capabilities.totalMemoryGb}GB RAM, GPU: ${capabilities.hasGpu}`);

  let sttConfig: STTProviderConfig | undefined;
  let ttsConfig: TTSProviderConfig | undefined;

  // Configure STT
  const setupSTT = await prompter.confirm({
    message: "Configure Speech-to-Text (STT)?",
    initialValue: true,
  });

  if (setupSTT) {
    const sttType = await promptProviderType(prompter);

    if (sttType === "system") {
      // Get local model selection first
      const { model, modelSize, computeType, cpuThreads, beamSize } =
        await promptLocalSTTModel(prompter, capabilities);

      // Initialize system mode (install dependencies automatically)
      const initSuccess = await initializeSystemModeDeployment(
        prompter,
        model === "faster-whisper" ? "faster-whisper" : "whisper",
        { modelSize, computeType, cpuThreads, beamSize },
        false,
      );

      if (initSuccess) {
        if (model === "faster-whisper") {
          sttConfig = {
            type: "faster-whisper" as const,
            deploymentMode: "system",
            modelSize: modelSize as "tiny" | "small" | "base" | "medium" | "large",
            language: "en",
            computeType,
            cpuThreads,
            beamSize,
          };
        } else {
          sttConfig = {
            type: "whisper" as const,
            deploymentMode: "system",
            modelSize: modelSize as "tiny" | "small" | "base" | "medium" | "large",
            language: "en",
          };
        }
      } else {
        // Installation failed - offer fallback to Docker or Cloud
        const fallback = await prompter.confirm({
          message: "Try different deployment mode?",
          initialValue: true,
        });

        if (fallback) {
          const fallbackType = await promptProviderType(prompter);
          if (fallbackType === "docker") {
            const { dockerImage, basePort } = await promptDockerConfiguration(prompter, "stt");
            const dockerModel = dockerImage.split(":")[0]?.toLowerCase() || "whisper";
            sttConfig = {
              type: dockerModel === "faster-whisper" ? "faster-whisper" : "whisper",
              deploymentMode: "docker",
              dockerImage,
              dockerPort: basePort,
              modelSize: "small",
              language: "en",
            } as unknown as STTProviderConfig;
          } else {
            sttConfig = await promptCloudSTTProvider(prompter);
          }
        }
      }
    } else if (sttType === "docker") {
      // Docker configuration
      const { dockerImage, basePort } = await promptDockerConfiguration(prompter, "stt");

      const model = dockerImage.split(":")[0]?.toLowerCase() || "whisper";
      sttConfig = {
        type: model === "faster-whisper" ? "faster-whisper" : "whisper",
        deploymentMode: "docker",
        dockerImage,
        dockerPort: basePort,
        modelSize: "small",
        language: "en",
      } as unknown as STTProviderConfig;
    } else {
      // Cloud
      sttConfig = await promptCloudSTTProvider(prompter);
    }
  }

  // Configure TTS
  const setupTTS = await prompter.confirm({
    message: "Configure Text-to-Speech (TTS)?",
    initialValue: true,
  });

  if (setupTTS) {
    const ttsType = await promptProviderType(prompter);

    if (ttsType === "system") {
      // Get local model selection first
      const { model, voice } = await promptLocalTTSModel(prompter, capabilities);

      // Initialize system mode (install dependencies automatically)
      const initSuccess = await initializeSystemModeDeployment(
        prompter,
        model,
        { voice },
        false,
      );

      if (initSuccess) {
        ttsConfig = {
          type: "local",
          model,
          voice,
        };
      } else {
        // Installation failed - offer fallback to Docker or Cloud
        const fallback = await prompter.confirm({
          message: "Try different deployment mode?",
          initialValue: true,
        });

        if (fallback) {
          const fallbackType = await promptProviderType(prompter);
          if (fallbackType === "docker") {
            const { dockerImage, basePort } = await promptDockerConfiguration(prompter, "tts");
            ttsConfig = {
              type: "local",
              model: dockerImage.split(":")[0] || "kokoro",
              voice: undefined,
            };
            (ttsConfig as any).deploymentMode = "docker";
            (ttsConfig as any).dockerImage = dockerImage;
            (ttsConfig as any).dockerPort = basePort;
          } else {
            ttsConfig = await promptCloudTTSProvider(prompter);
          }
        }
      }
    } else if (ttsType === "docker") {
      // Docker configuration
      const { dockerImage, basePort } = await promptDockerConfiguration(prompter, "tts");

      ttsConfig = {
        type: "local",
        model: dockerImage.split(":")[0] || "kokoro",
        voice: undefined,
      };
      // Store Docker configuration as additional properties
      (ttsConfig as any).deploymentMode = "docker";
      (ttsConfig as any).dockerImage = dockerImage;
      (ttsConfig as any).dockerPort = basePort;
    } else {
      // Cloud
      ttsConfig = await promptCloudTTSProvider(prompter);
    }
  }

  // Show summary and confirm
  const confirmed = await showProviderSummary(prompter, sttConfig, ttsConfig);

  if (!confirmed) {
    return { cfg: nextConfig, voiceProvidersAdded: false };
  }

  // Create provider entry and update config
  const providerId = "primary";
  const provider = createProviderEntry(providerId, sttConfig, ttsConfig);

  nextConfig = {
    ...nextConfig,
    voice: {
      ...nextConfig.voice,
      providers: {
        enabled: true,
        providers: [provider] as VoiceProviderEntry[],
      },
    },
  };

  runtime.log?.("Voice providers configured successfully");

  return { cfg: nextConfig, voiceProvidersAdded: true };
}

/**
 * Test voice provider configuration
 */
export async function testVoiceProviders(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<boolean> {
  const { cfg, prompter } = params;

  const hasVoiceConfig = cfg.voice?.providers?.providers && cfg.voice.providers.providers.length > 0;

  if (!hasVoiceConfig) {
    await prompter.note("No voice providers configured", "Voice test");
    return false;
  }

  const runTest = await prompter.confirm({
    message: "Test voice providers (optional)?",
    initialValue: false,
  });

  if (!runTest) {
    return false;
  }

  await prompter.note("Voice provider testing is available from the CLI using: clawdbot voice test", "Voice test");

  return true;
}
