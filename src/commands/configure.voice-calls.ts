/**
 * Voice Calls Configuration Wizard
 *
 * Handles post-onboarding configuration and management of real-time voice call
 * providers (Discord, Telegram, Signal, Twilio) in the configure command.
 * Allows users to:
 * - List current providers
 * - Add/edit provider configuration per platform
 * - Enable/disable providers
 * - Remove providers
 * - Validate credentials
 */

import type { ClawdbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { note } from "../terminal/note.js";
import {
  confirm,
  select,
  text,
} from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

type VoiceCallsMode = "list" | "discord" | "telegram" | "signal" | "twilio" | "__back";

interface DiscordCallConfig {
  guildId: string;
  voiceChannelId?: string;
  participantLimit?: number;
  enabled: boolean;
}

interface TelegramCallConfig {
  botToken: string;
  groupId: string;
  recordingEnabled?: boolean;
  maxParticipants?: number;
  enabled: boolean;
}

interface SignalCallConfig {
  phoneNumber: string;
  signalCliPath?: string;
  zrtpVerificationEnabled?: boolean;
  groupCallsEnabled: boolean;
  oneToOneCallsEnabled: boolean;
  enabled: boolean;
}

interface TwilioCallConfig {
  accountSid: string;
  authToken: string;
  twilioPhoneNumber: string;
  whatsappCallsEnabled: boolean;
  whatsappMessagingEnabled: boolean;
  defaultTimeoutSeconds?: number;
  enabled: boolean;
}

function validateDiscordGuildId(guildId: string): boolean {
  return /^\d{17,19}$/.test(guildId);
}

function validateTelegramBotToken(token: string): boolean {
  return /^\d+:[a-zA-Z0-9_-]+$/.test(token);
}

function validateTelegramGroupId(groupId: string): boolean {
  return /^-\d+$/.test(groupId);
}

function validateE164PhoneNumber(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

function validateTwilioAccountSid(sid: string): boolean {
  return /^AC[a-zA-Z0-9]{32}$/.test(sid);
}

async function promptVoiceCallsMode(prompter: WizardPrompter): Promise<VoiceCallsMode> {
  return (await select<VoiceCallsMode>({
    message: "Voice call providers",
    options: [
      { value: "list", label: "List providers", hint: "Show current configuration" },
      { value: "discord", label: "Discord", hint: "Configure Discord voice calls" },
      { value: "telegram", label: "Telegram", hint: "Configure Telegram group calls" },
      { value: "signal", label: "Signal", hint: "Configure Signal calls (E2E encryption)" },
      { value: "twilio", label: "Twilio", hint: "Configure WhatsApp via Twilio" },
      { value: "__back", label: "Back", hint: "Return to main menu" },
    ],
    initialValue: "list",
  })) as VoiceCallsMode;
}

async function listVoiceCallProviders(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<void> {
  const calls = cfg.voice?.calls;
  if (!calls || !calls.enabled) {
    await prompter.note("Voice calls are not enabled.", "Voice calls");
    return;
  }

  const providers = calls.providers;
  const lines: string[] = [];

  if (providers.discord?.enabled) {
    lines.push(`  Discord: guild ${providers.discord.guildId}`);
  }

  if (providers.telegram?.enabled) {
    lines.push(`  Telegram: group ${providers.telegram.groupId}`);
  }

  if (providers.signal?.enabled) {
    lines.push(`  Signal: ${providers.signal.phoneNumber}`);
  }

  if (providers.twilio?.enabled) {
    lines.push(`  Twilio: ${providers.twilio.twilioPhoneNumber}`);
  }

  if (lines.length === 0) {
    await prompter.note("No voice call providers enabled.", "Voice calls");
  } else {
    await prompter.note(
      [
        "Enabled voice call providers:",
        ...lines,
      ].join("\n"),
      "Voice calls",
    );
  }
}

async function configureDiscord(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const existing = cfg.voice?.calls?.providers.discord;

  await note(
    [
      "Discord voice calls allow Clawdbot to join voice channels.",
      "You need the Guild ID (server ID) and optionally a specific voice channel ID.",
    ].join("\n"),
    "Discord voice calls",
  );

  const guildId = await text({
    message: "Discord Guild ID (server ID)",
    initialValue: existing?.guildId || "",
    placeholder: "123456789012345678",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateDiscordGuildId(trimmed) ? undefined : "Invalid Guild ID format (18-19 digits)";
    },
  });

  if (!guildId) {
    return cfg;
  }

  const voiceChannelId = await text({
    message: "Voice channel ID (optional)",
    initialValue: existing?.voiceChannelId || "",
    placeholder: "987654321098765432",
  });

  const participantLimitStr = await text({
    message: "Participant limit (optional, 0-99)",
    initialValue: existing?.participantLimit ? String(existing.participantLimit) : "",
    placeholder: "No limit",
  });

  const participantLimit = participantLimitStr && !isNaN(Number(participantLimitStr))
    ? Math.max(0, Math.min(99, parseInt(String(participantLimitStr), 10)))
    : undefined;

  const enabled = (await confirm({
    message: "Enable Discord voice calls?",
    initialValue: existing?.enabled ?? true,
  })) as boolean;

  const discord: DiscordCallConfig = {
    guildId: String(guildId).trim(),
    voiceChannelId: String(voiceChannelId || "").trim() || undefined,
    participantLimit,
    enabled,
  };

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      calls: {
        ...cfg.voice?.calls,
        enabled: enabled || (cfg.voice?.calls?.enabled ?? false),
        providers: {
          ...cfg.voice?.calls?.providers,
          discord,
        },
      },
    },
  };
}

async function configureTelegram(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const existing = cfg.voice?.calls?.providers.telegram;

  await note(
    [
      "Telegram group calls allow Clawdbot to participate in group voice calls.",
      "You need a bot token and the target group ID (negative number).",
    ].join("\n"),
    "Telegram voice calls",
  );

  const botToken = await text({
    message: "Telegram bot token",
    initialValue: existing?.botToken || "",
    placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateTelegramBotToken(trimmed) ? undefined : "Invalid bot token format";
    },
  });

  if (!botToken) {
    return cfg;
  }

  const groupId = await text({
    message: "Telegram group ID (negative number)",
    initialValue: existing?.groupId || "",
    placeholder: "-123456789",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateTelegramGroupId(trimmed) ? undefined : "Invalid group ID format (must be negative)";
    },
  });

  if (!groupId) {
    return cfg;
  }

  const recordingEnabled = (await confirm({
    message: "Enable recording?",
    initialValue: existing?.recordingEnabled ?? false,
  })) as boolean;

  const maxParticipantsStr = await text({
    message: "Max participants (optional)",
    initialValue: existing?.maxParticipants ? String(existing.maxParticipants) : "",
    placeholder: "No limit",
  });

  const maxParticipants = maxParticipantsStr && !isNaN(Number(maxParticipantsStr))
    ? Math.max(1, parseInt(String(maxParticipantsStr), 10))
    : undefined;

  const enabled = (await confirm({
    message: "Enable Telegram voice calls?",
    initialValue: existing?.enabled ?? true,
  })) as boolean;

  const telegram: TelegramCallConfig = {
    botToken: String(botToken).trim(),
    groupId: String(groupId).trim(),
    recordingEnabled,
    maxParticipants,
    enabled,
  };

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      calls: {
        ...cfg.voice?.calls,
        enabled: enabled || (cfg.voice?.calls?.enabled ?? false),
        providers: {
          ...cfg.voice?.calls?.providers,
          telegram,
        },
      },
    },
  };
}

async function configureSignal(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const existing = cfg.voice?.calls?.providers.signal;

  await note(
    [
      "Signal calls provide end-to-end encrypted voice communication.",
      "Requires signal-cli to be installed and your Signal phone number.",
    ].join("\n"),
    "Signal voice calls",
  );

  const phoneNumber = await text({
    message: "Your Signal phone number (E.164 format)",
    initialValue: existing?.phoneNumber || "",
    placeholder: "+1234567890",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateE164PhoneNumber(trimmed) ? undefined : "Invalid format (e.g., +1234567890)";
    },
  });

  if (!phoneNumber) {
    return cfg;
  }

  const signalCliPath = await text({
    message: "signal-cli path (optional, auto-detect if blank)",
    initialValue: existing?.signalCliPath || "",
    placeholder: "/usr/local/bin/signal-cli",
  });

  const zrtpVerification = (await confirm({
    message: "Enable ZRTP verification for calls?",
    initialValue: existing?.zrtpVerificationEnabled ?? true,
  })) as boolean;

  const groupCalls = (await confirm({
    message: "Enable group calls?",
    initialValue: existing?.groupCallsEnabled ?? true,
  })) as boolean;

  const oneToOneCalls = (await confirm({
    message: "Enable 1:1 calls?",
    initialValue: existing?.oneToOneCallsEnabled ?? true,
  })) as boolean;

  const enabled = (await confirm({
    message: "Enable Signal voice calls?",
    initialValue: existing?.enabled ?? true,
  })) as boolean;

  const signal: SignalCallConfig = {
    phoneNumber: String(phoneNumber).trim(),
    signalCliPath: String(signalCliPath || "").trim() || undefined,
    zrtpVerificationEnabled: zrtpVerification,
    groupCallsEnabled: groupCalls,
    oneToOneCallsEnabled: oneToOneCalls,
    enabled,
  };

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      calls: {
        ...cfg.voice?.calls,
        enabled: enabled || (cfg.voice?.calls?.enabled ?? false),
        providers: {
          ...cfg.voice?.calls?.providers,
          signal,
        },
      },
    },
  };
}

async function configureTwilio(
  prompter: WizardPrompter,
  cfg: ClawdbotConfig,
): Promise<ClawdbotConfig> {
  const existing = cfg.voice?.calls?.providers.twilio;

  await note(
    [
      "Twilio enables WhatsApp and SMS voice calling.",
      "You need Account SID, Auth Token, and a Twilio phone number.",
    ].join("\n"),
    "Twilio voice calls",
  );

  const accountSid = await text({
    message: "Twilio Account SID",
    initialValue: existing?.accountSid || "",
    placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateTwilioAccountSid(trimmed) ? undefined : "Invalid Account SID format";
    },
  });

  if (!accountSid) {
    return cfg;
  }

  const authToken = await text({
    message: "Twilio Auth Token",
    initialValue: existing?.authToken || "",
    placeholder: "your_auth_token_here",
  });

  if (!authToken) {
    return cfg;
  }

  const phoneNumber = await text({
    message: "Twilio phone number (E.164 format)",
    initialValue: existing?.twilioPhoneNumber || "",
    placeholder: "+1234567890",
    validate: (value) => {
      const trimmed = String(value || "").trim();
      return !trimmed || validateE164PhoneNumber(trimmed) ? undefined : "Invalid format (e.g., +1234567890)";
    },
  });

  if (!phoneNumber) {
    return cfg;
  }

  const whatsappCalls = (await confirm({
    message: "Enable WhatsApp calling?",
    initialValue: existing?.whatsappCallsEnabled ?? true,
  })) as boolean;

  const whatsappMessaging = (await confirm({
    message: "Enable WhatsApp messaging?",
    initialValue: existing?.whatsappMessagingEnabled ?? true,
  })) as boolean;

  const timeoutStr = await text({
    message: "Default timeout (seconds, optional)",
    initialValue: existing?.defaultTimeoutSeconds ? String(existing.defaultTimeoutSeconds) : "",
    placeholder: "30",
  });

  const defaultTimeoutSeconds = timeoutStr && !isNaN(Number(timeoutStr))
    ? Math.max(1, parseInt(String(timeoutStr), 10))
    : undefined;

  const enabled = (await confirm({
    message: "Enable Twilio voice calls?",
    initialValue: existing?.enabled ?? true,
  })) as boolean;

  const twilio: TwilioCallConfig = {
    accountSid: String(accountSid).trim(),
    authToken: String(authToken).trim(),
    twilioPhoneNumber: String(phoneNumber).trim(),
    whatsappCallsEnabled: whatsappCalls,
    whatsappMessagingEnabled: whatsappMessaging,
    defaultTimeoutSeconds,
    enabled,
  };

  return {
    ...cfg,
    voice: {
      ...cfg.voice,
      calls: {
        ...cfg.voice?.calls,
        enabled: enabled || (cfg.voice?.calls?.enabled ?? false),
        providers: {
          ...cfg.voice?.calls?.providers,
          twilio,
        },
      },
    },
  };
}

export async function configureVoiceCalls(
  cfg: ClawdbotConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<ClawdbotConfig> {
  let nextConfig = cfg;

  while (true) {
    const mode = await guardCancel(promptVoiceCallsMode(prompter), runtime);

    if (mode === "__back") {
      break;
    }

    if (mode === "list") {
      await listVoiceCallProviders(prompter, nextConfig);
    } else if (mode === "discord") {
      nextConfig = await configureDiscord(prompter, nextConfig);
    } else if (mode === "telegram") {
      nextConfig = await configureTelegram(prompter, nextConfig);
    } else if (mode === "signal") {
      nextConfig = await configureSignal(prompter, nextConfig);
    } else if (mode === "twilio") {
      nextConfig = await configureTwilio(prompter, nextConfig);
    }
  }

  return nextConfig;
}
