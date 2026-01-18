/**
 * Voice Providers Configuration Wizard
 *
 * Handles post-onboarding configuration and management of STT/TTS providers
 * in the configure command. Allows users to:
 * - List current providers
 * - Add/edit provider configuration
 * - Enable/disable providers
 * - Set priority
 * - Delete providers
 */

import type { ClawdbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type {
  VoiceProviderEntry,
  STTProviderConfig,
  TTSProviderConfig,
} from "../config/zod-schema.voice-providers.js";
import { note } from "../terminal/note.js";
import { confirm, select, text } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

type VoiceProviderMode = "list" | "add" | "edit" | "enable-disable" | "priority" | "delete" | "__back";

async function promptVoiceProviderMode(prompter: WizardPrompter): Promise<VoiceProviderMode> {
  return (await select<VoiceProviderMode>({
    message: "Voice providers",
    options: [
      { value: "list", label: "List providers", hint: "Show current configuration" },
      { value: "add", label: "Add provider", hint: "Configure a new provider" },
      { value: "edit", label: "Edit provider", hint: "Modify existing provider" },
      { value: "enable-disable", label: "Enable/disable", hint: "Toggle provider status" },
      { value: "priority", label: "Set priority", hint: "Change provider priority" },
      { value: "delete", label: "Delete provider", hint: "Remove a provider" },
      { value: "__back", label: "Back", hint: "Return to main menu" },
    ],
    initialValue: "list",
  })) as VoiceProviderMode;
}

async function listVoiceProviders(
  prompter: WizardPrompter,
  providers: VoiceProviderEntry[],
): Promise<void> {
  if (providers.length === 0) {
    await prompter.note("No voice providers configured.", "Voice providers");
    return;
  }

  const lines = providers.map((p) => {
    const features = [];
    if (p.stt) features.push(`STT: ${p.stt.type}`);
    if (p.tts) features.push(`TTS: ${p.tts.type}`);
    const status = p.enabled ? "enabled" : "disabled";
    const priority = p.priority !== undefined ? ` (priority: ${p.priority})` : "";

    return `  ${p.id}: ${features.join(", ")} [${status}]${priority}`;
  });

  await prompter.note(
    [
      "Configured voice providers:",
      ...lines,
    ].join("\n"),
    "Voice providers",
  );
}

async function promptSTTConfig(prompter: WizardPrompter, current?: STTProviderConfig): Promise<STTProviderConfig | null> {
  const setupSTT = (await confirm({
    message: "Configure Speech-to-Text (STT)?",
    initialValue: current !== undefined,
  })) as boolean;

  if (!setupSTT) {
    return null;
  }

  const sttType = (await select({
    message: "STT provider type",
    options: [
      { value: "whisper", label: "Whisper" },
      { value: "faster-whisper", label: "Faster-Whisper" },
      { value: "openai", label: "OpenAI (Cloud)" },
      { value: "google", label: "Google Cloud (Cloud)" },
      { value: "azure", label: "Azure (Cloud)" },
    ],
    initialValue: current?.type || "whisper",
  })) as string;

  if (sttType === "openai" || sttType === "google" || sttType === "azure") {
    const apiKey = await text({
      message: `${sttType.toUpperCase()} API key`,
      initialValue: (current as any)?.apiKey || "",
      placeholder: "Paste your API key here",
    });

    return {
      type: sttType as "openai" | "google" | "azure",
      service: sttType,
      apiKey: String(apiKey || "").trim(),
      model: sttType === "openai" ? "whisper-1" : undefined,
      language: "en",
    };
  }

  // Local providers (whisper, faster-whisper)
  const modelSize = (await select({
    message: "Model size",
    options: [
      { value: "tiny", label: "Tiny (fastest)" },
      { value: "base", label: "Base" },
      { value: "small", label: "Small (recommended)" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large (most accurate)" },
    ],
    initialValue: (current as any)?.modelSize || "small",
  })) as string;

  const config: STTProviderConfig = {
    type: sttType as "whisper" | "faster-whisper",
    modelSize: modelSize as "tiny" | "small" | "base" | "medium" | "large",
    language: "en",
  };

  if (sttType === "faster-whisper") {
    const computeType = (await select({
      message: "Compute type",
      options: [
        { value: "float32", label: "Float32 (most accurate)" },
        { value: "float16", label: "Float16 (recommended)" },
        { value: "int8", label: "Int8 (fastest)" },
      ],
      initialValue: (current as any)?.computeType || "float16",
    })) as string;

    (config as any).computeType = computeType;

    const cpuThreads = await text({
      message: "CPU threads (leave blank for auto)",
      initialValue: (current as any)?.cpuThreads ? String((current as any).cpuThreads) : "",
    });

    if (cpuThreads && !isNaN(Number(cpuThreads))) {
      (config as any).cpuThreads = Math.max(1, parseInt(String(cpuThreads), 10));
    }
  }

  return config;
}

async function promptTTSConfig(prompter: WizardPrompter, current?: TTSProviderConfig): Promise<TTSProviderConfig | null> {
  const setupTTS = (await confirm({
    message: "Configure Text-to-Speech (TTS)?",
    initialValue: current !== undefined,
  })) as boolean;

  if (!setupTTS) {
    return null;
  }

  const ttsType = (await select({
    message: "TTS provider type",
    options: [
      { value: "local", label: "Local (Kokoro/Piper)" },
      { value: "elevenlabs", label: "ElevenLabs (Cloud)" },
      { value: "google", label: "Google Cloud (Cloud)" },
      { value: "azure", label: "Azure (Cloud)" },
      { value: "openai", label: "OpenAI (Cloud)" },
    ],
    initialValue: current?.type || "local",
  })) as string;

  if (ttsType === "local") {
    const model = (await select({
      message: "Local model",
      options: [
        { value: "kokoro", label: "Kokoro (natural, fast)" },
        { value: "piper", label: "Piper (lightweight)" },
      ],
      initialValue: (current as any)?.model || "kokoro",
    })) as string;

    const voiceOptions = model === "kokoro"
      ? [
          { value: "af_heart", label: "Kokoro Heart (female)" },
          { value: "af", label: "Kokoro AF (female)" },
          { value: "am", label: "Kokoro AM (male)" },
          { value: "bf", label: "Kokoro BF (female)" },
        ]
      : [
          { value: "en_US-amy", label: "Amy (US, female)" },
          { value: "en_US-lessac", label: "Lessac (US, female)" },
          { value: "en_GB-alan", label: "Alan (UK, male)" },
        ];

    const voice = (await select({
      message: "Voice",
      options: voiceOptions,
      initialValue: (current as any)?.voice || voiceOptions[0]?.value,
    })) as string;

    return {
      type: "local",
      model,
      voice,
    };
  }

  // Cloud providers
  const apiKey = await text({
    message: `${ttsType.toUpperCase()} API key`,
    initialValue: (current as any)?.apiKey || "",
    placeholder: "Paste your API key here",
  });

  const voice = await text({
    message: "Voice ID (optional, leave blank for default)",
    initialValue: (current as any)?.voice || "",
    placeholder: ttsType === "elevenlabs" ? "Rachel" : "default",
  });

  return {
    type: ttsType as "elevenlabs" | "google" | "azure" | "openai",
    service: ttsType,
    apiKey: String(apiKey || "").trim(),
    voice: String(voice || "").trim() || undefined,
    speed: 1,
  };
}

async function addVoiceProvider(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const providerId = await text({
    message: "Provider ID (e.g., 'primary', 'backup')",
    placeholder: "primary",
  });

  if (!providerId) {
    note("Provider ID is required.", "Voice providers");
    return cfg;
  }

  const sttConfig = await promptSTTConfig(prompter);
  const ttsConfig = await promptTTSConfig(prompter);

  if (!sttConfig && !ttsConfig) {
    note("At least STT or TTS must be configured.", "Voice providers");
    return cfg;
  }

  const priority = await text({
    message: "Priority (0-100, higher = prefer this provider)",
    initialValue: "0",
  });

  const entry: VoiceProviderEntry = {
    id: String(providerId).trim(),
    enabled: true,
    priority: parseInt(String(priority || "0"), 10) || 0,
    stt: sttConfig || undefined,
    tts: ttsConfig || undefined,
  };

  const providers = cfg.voice?.providers?.providers || [];
  const existing = providers.findIndex((p) => p.id === entry.id);

  let nextProviders: any[];
  if (existing >= 0) {
    nextProviders = [...(providers as any)];
    nextProviders[existing] = entry;
    note(`Updated provider: ${entry.id}`, "Voice providers");
  } else {
    nextProviders = [...(providers as any), entry];
    note(`Added provider: ${entry.id}`, "Voice providers");
  }

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      providers: {
        ...cfg.voice?.providers,
        enabled: true,
        providers: nextProviders as any,
      },
    },
  };
}

async function editVoiceProvider(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const providers = cfg.voice?.providers?.providers || [];

  if (providers.length === 0) {
    note("No providers to edit.", "Voice providers");
    return cfg;
  }

  const providerId = (await select({
    message: "Select provider to edit",
    options: providers.map((p) => ({
      value: p.id,
      label: p.id,
    })),
  })) as string;

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return cfg;
  }

  const sttConfig = await promptSTTConfig(prompter, provider.stt as any);
  const ttsConfig = await promptTTSConfig(prompter, provider.tts as any);

  const priority = await text({
    message: "Priority (0-100)",
    initialValue: String(provider.priority || 0),
  });

  const updated: any = {
    ...provider,
    stt: (sttConfig || provider.stt) as any,
    tts: (ttsConfig || provider.tts) as any,
    priority: parseInt(String(priority || "0"), 10) || 0,
  };

  const nextProviders = (providers as any).map((p: any) => (p.id === providerId ? updated : p));

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      providers: {
        ...cfg.voice?.providers,
        enabled: true,
        providers: nextProviders as any,
      },
    },
  };
}

async function enableDisableProvider(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const providers = cfg.voice?.providers?.providers || [];

  if (providers.length === 0) {
    note("No providers to manage.", "Voice providers");
    return cfg;
  }

  const providerId = (await select({
    message: "Select provider",
    options: providers.map((p) => ({
      value: p.id,
      label: `${p.id} (${p.enabled ? "enabled" : "disabled"})`,
    })),
  })) as string;

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return cfg;
  }

  const enabled = (await confirm({
    message: `Enable ${providerId}?`,
    initialValue: provider.enabled,
  })) as boolean;

  const nextProviders = (providers as any).map((p: any) => (p.id === providerId ? { ...p, enabled } : p));

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      providers: {
        ...cfg.voice?.providers,
        enabled: nextProviders.some((p: any) => p.enabled),
        providers: nextProviders as any,
      },
    },
  };
}

async function setPriority(prompter: WizardPrompter, cfg: ClawdbotConfig): Promise<ClawdbotConfig> {
  const providers = cfg.voice?.providers?.providers || [];

  if (providers.length === 0) {
    note("No providers to prioritize.", "Voice providers");
    return cfg;
  }

  const providerId = (await select({
    message: "Select provider",
    options: providers.map((p) => ({
      value: p.id,
      label: `${p.id} (priority: ${p.priority || 0})`,
    })),
  })) as string;

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return cfg;
  }

  const priority = await text({
    message: "New priority (0-100, higher = prefer)",
    initialValue: String(provider.priority || 0),
  });

  const nextProviders = (providers as any).map((p: any) =>
    p.id === providerId ? { ...p, priority: parseInt(String(priority || "0"), 10) || 0 } : p,
  );

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      providers: {
        ...cfg.voice?.providers,
        providers: nextProviders as any,
      },
    },
  };
}

async function deleteVoiceProvider(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const providers = cfg.voice?.providers?.providers || [];

  if (providers.length === 0) {
    note("No providers to delete.", "Voice providers");
    return cfg;
  }

  const providerId = (await select({
    message: "Select provider to delete",
    options: providers.map((p) => ({
      value: p.id,
      label: p.id,
    })),
  })) as string;

  const confirmed = (await confirm({
    message: `Delete provider '${providerId}'?`,
    initialValue: false,
  })) as boolean;

  if (!confirmed) {
    return cfg;
  }

  const nextProviders = (providers as any).filter((p: any) => p.id !== providerId);

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      providers: {
        ...cfg.voice?.providers,
        enabled: nextProviders.length > 0 && nextProviders.some((p: any) => p.enabled),
        providers: nextProviders as any,
      },
    },
  };
}

export async function configureVoiceProviders(
  cfg: ClawdbotConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<ClawdbotConfig> {
  let nextConfig = cfg;

  while (true) {
    const mode = await guardCancel(promptVoiceProviderMode(prompter), runtime);

    if (mode === "__back") {
      break;
    }

    if (mode === "list") {
      await listVoiceProviders(prompter, (nextConfig.voice?.providers?.providers as any) || []);
    } else if (mode === "add") {
      nextConfig = await addVoiceProvider(prompter, nextConfig);
    } else if (mode === "edit") {
      nextConfig = await editVoiceProvider(prompter, nextConfig);
    } else if (mode === "enable-disable") {
      nextConfig = await enableDisableProvider(prompter, nextConfig);
    } else if (mode === "priority") {
      nextConfig = await setPriority(prompter, nextConfig);
    } else if (mode === "delete") {
      nextConfig = await deleteVoiceProvider(prompter, nextConfig);
    }
  }

  return nextConfig;
}
