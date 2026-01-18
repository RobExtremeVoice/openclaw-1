/**
 * Voice Configuration Commands
 *
 * Provides CLI commands for managing STT/TTS voice providers:
 * - clawdbot configure voice - Configure voice providers
 * - clawdbot voice status - Show current provider configuration
 * - clawdbot voice test - Test providers with sample audio
 * - clawdbot voice providers - List available providers
 */

import type { ClawdbotConfig } from "../config/config.js";
import {
  CONFIG_PATH_CLAWDBOT,
  readConfigFileSnapshot,
  writeConfigFile,
} from "../config/config.js";
import {
  detectSystemCapabilities,
  getRecommendedProviders,
  isLocalProviderAvailable,
  getProviderDependencies,
} from "../config/voice-providers.utils.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { note } from "../terminal/note.js";
import {
  intro,
  outro,
  text,
  confirm,
  select,
} from "./configure.shared.js";

/**
 * Show current voice provider status
 */
export async function voiceStatusCommand(runtime?: RuntimeEnv): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    const snapshot = await readConfigFileSnapshot();
    const config = snapshot.config;

    const voiceConfig = config.voice?.providers;

    if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
      note("No voice providers configured", "Voice status");
      return;
    }

    const lines: string[] = [];
    lines.push("Voice Providers Status:");
    lines.push("");

    for (const provider of voiceConfig.providers) {
      if (!provider.enabled) continue;

      lines.push(`Provider: ${provider.id}`);
      lines.push(`  Priority: ${provider.priority || 1}`);

      if (provider.stt) {
        lines.push(`  STT: ${provider.stt.type}`);
        if (provider.stt.type === "whisper" || provider.stt.type === "faster-whisper") {
          if (provider.stt.modelSize) {
            lines.push(`    Size: ${provider.stt.modelSize}`);
          }
          if (provider.stt.type === "faster-whisper") {
            if (provider.stt.computeType) {
              lines.push(`    Compute: ${provider.stt.computeType}`);
            }
            if (provider.stt.cpuThreads) {
              lines.push(`    CPU Threads: ${provider.stt.cpuThreads}`);
            }
          }
        } else if (provider.stt.type === "openai" || provider.stt.type === "google" || provider.stt.type === "azure") {
          lines.push(`    Service: ${provider.stt.service || "default"}`);
        }
      }

      if (provider.tts) {
        lines.push(`  TTS: ${provider.tts.type}`);
        if (provider.tts.type === "local") {
          lines.push(`    Model: ${provider.tts.model || "default"}`);
          if (provider.tts.voice) {
            lines.push(`    Voice: ${provider.tts.voice}`);
          }
        } else {
          lines.push(`    Service: ${provider.tts.service || "default"}`);
          if (provider.tts.voiceId) {
            lines.push(`    Voice ID: ${provider.tts.voiceId}`);
          }
        }
      }

      lines.push("");
    }

    // Show system capabilities
    lines.push("System Capabilities:");
    if (voiceConfig.systemCapabilities) {
      const caps = voiceConfig.systemCapabilities;
      lines.push(`  Memory: ${caps.totalMemoryGb?.toFixed(1)}GB`);
      lines.push(`  GPU: ${caps.gpuAvailable ? `Yes (${caps.gpuMemoryGb}GB)` : "No"}`);
      lines.push(`  CPU Cores: ${caps.cpuCount}`);
      lines.push(`  Disk: ${caps.diskSpaceGb?.toFixed(1)}GB`);
    }

    note(lines.join("\n"), "Voice Status");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Failed to show voice status: ${msg}`);
  }
}

/**
 * List available voice providers
 */
export async function voiceProvidersCommand(runtime?: RuntimeEnv): Promise<void> {
  const r = runtime || defaultRuntime;
  const capabilities = detectSystemCapabilities();

  const lines: string[] = [];
  lines.push("Available Voice Providers:");
  lines.push("");

  // STT Providers
  lines.push("Speech-to-Text (STT):");
  lines.push("");
  lines.push("Local STT:");
  lines.push(
    `  • Faster-Whisper: ${isLocalProviderAvailable("stt", "faster-whisper", capabilities).available ? "✓" : "✗"}`,
  );
  lines.push(
    `  • Whisper: ${isLocalProviderAvailable("stt", "whisper", capabilities).available ? "✓" : "✗"}`,
  );

  lines.push("");
  lines.push("Cloud STT:");
  lines.push("  • OpenAI Whisper API");
  lines.push("  • Google Cloud Speech-to-Text");
  lines.push("  • Azure Speech Services");

  lines.push("");
  lines.push("Text-to-Speech (TTS):");
  lines.push("");
  lines.push("Local TTS:");
  lines.push(
    `  • Kokoro: ${isLocalProviderAvailable("tts", "kokoro", capabilities).available ? "✓" : "✗"}`,
  );
  lines.push(
    `  • Piper: ${isLocalProviderAvailable("tts", "piper", capabilities).available ? "✓" : "✗"}`,
  );

  lines.push("");
  lines.push("Cloud TTS:");
  lines.push("  • ElevenLabs");
  lines.push("  • Google Cloud Text-to-Speech");
  lines.push("  • Azure Speech Services");
  lines.push("  • OpenAI TTS");

  lines.push("");
  lines.push("System Capabilities:");
  lines.push(`  Memory: ${capabilities.totalMemoryGb.toFixed(1)}GB`);
  lines.push(`  GPU: ${capabilities.hasGpu ? `Yes (${capabilities.gpuType})` : "No"}`);
  lines.push(`  CPU Threads: ${capabilities.cpuThreads}`);

  note(lines.join("\n"), "Available Providers");

  // Show recommendations
  const recommendations = getRecommendedProviders(capabilities);
  if (recommendations.length > 0) {
    const recLines = ["Recommendations based on system capabilities:", ""];
    for (const rec of recommendations) {
      recLines.push(`• ${rec.reason}`);
      recLines.push(`  ${rec.type.toUpperCase()}: ${rec.provider}`);
      if (rec.model) {
        recLines.push(`  Model: ${rec.model}`);
      }
    }
    note(recLines.join("\n"), "Recommendations");
  }
}

/**
 * Test voice providers
 */
export async function voiceTestCommand(runtime?: RuntimeEnv): Promise<void> {
  const r = runtime || defaultRuntime;

  try {
    const snapshot = await readConfigFileSnapshot();
    const config = snapshot.config;

    const voiceConfig = config.voice?.providers;

    if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
      note("No voice providers configured. Run 'clawdbot configure voice' first.", "Voice test");
      return;
    }

    const lines: string[] = [];
    lines.push("Testing voice providers...");
    lines.push("");

    for (const provider of voiceConfig.providers) {
      if (!provider.enabled) continue;

      lines.push(`Provider: ${provider.id}`);

      if (provider.stt) {
        lines.push(`  Testing STT (${provider.stt.type})...`);
        if (provider.stt.type === "whisper" || provider.stt.type === "faster-whisper") {
          const deps = getProviderDependencies("stt", provider.stt.type);
          const allInstalled = deps.every((d) => d.installed);
          if (!allInstalled) {
            const missing = deps.filter((d) => !d.installed).map((d) => d.name);
            lines.push(`    ✗ Missing dependencies: ${missing.join(", ")}`);
          } else {
            lines.push("    ✓ Dependencies available");
            lines.push("    ℹ Full test requires audio sample (not implemented)");
          }
        } else if (provider.stt.type === "openai" || provider.stt.type === "google" || provider.stt.type === "azure") {
          if (provider.stt.apiKey) {
            lines.push("    ✓ API key configured");
            lines.push("    ℹ Full test requires audio sample (not implemented)");
          } else {
            lines.push("    ✗ API key not configured");
          }
        }
      }

      if (provider.tts) {
        lines.push(`  Testing TTS (${provider.tts.type})...`);
        if (provider.tts.type === "local") {
          const deps = getProviderDependencies("tts", provider.tts.model || "kokoro");
          const allInstalled = deps.every((d) => d.installed);
          if (!allInstalled) {
            const missing = deps.filter((d) => !d.installed).map((d) => d.name);
            lines.push(`    ✗ Missing dependencies: ${missing.join(", ")}`);
          } else {
            lines.push("    ✓ Dependencies available");
            lines.push("    ℹ Full test requires audio output (not implemented)");
          }
        } else {
          if (provider.tts.apiKey) {
            lines.push("    ✓ API key configured");
            lines.push("    ℹ Full test requires audio output (not implemented)");
          } else {
            lines.push("    ✗ API key not configured");
          }
        }
      }

      lines.push("");
    }

    lines.push("Note: Full audio tests are available via the voice-call plugin.");

    note(lines.join("\n"), "Voice Test");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Failed to test voice providers: ${msg}`);
  }
}

/**
 * Configure voice providers interactively
 */
export async function configureVoiceCommand(
  config: ClawdbotConfig,
  prompter: WizardPrompter,
  runtime?: RuntimeEnv,
): Promise<ClawdbotConfig> {
  const r = runtime || defaultRuntime;

  intro("Voice Providers Configuration");

  try {
    const mode = (await select({
      message: "Voice configuration",
      options: [
        {
          value: "status",
          label: "View current status",
        },
        {
          value: "list",
          label: "List available providers",
        },
        {
          value: "test",
          label: "Test configured providers",
        },
        {
          value: "setup",
          label: "Setup voice providers",
        },
        {
          value: "clear",
          label: "Clear voice configuration",
        },
      ],
      initialValue: "status",
    })) as string;

    switch (mode) {
      case "status":
        await voiceStatusCommand(r);
        break;

      case "list":
        await voiceProvidersCommand(r);
        break;

      case "test":
        await voiceTestCommand(r);
        break;

      case "setup": {
        const { setupVoiceProviders } = await import("./onboarding/onboarding.voice-providers.js");
        const result = await setupVoiceProviders({
          cfg: config,
          prompter,
          runtime: r,
        });
        config = result.cfg;
        break;
      }

      case "clear": {
        const confirmed = await confirm({
          message: "Clear all voice provider configuration?",
          initialValue: false,
        });
        if (confirmed) {
          config = {
            ...config,
            voice: {
              ...config.voice,
              providers: undefined,
            },
          };
          r.log?.("Voice configuration cleared");
        }
        break;
      }
    }

    outro("Voice configuration complete");
    return config;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    r.error?.(`Voice configuration failed: ${msg}`);
    return config;
  }
}
