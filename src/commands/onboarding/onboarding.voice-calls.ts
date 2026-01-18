/**
 * Voice Calls Onboarding
 *
 * Handles interactive selection and configuration of real-time voice call
 * providers during the onboarding wizard. Includes provider-specific credential
 * validation, platform restrictions, and participant limits.
 *
 * Supported platforms:
 * - Discord voice channels
 * - Telegram group calls
 * - Signal calls (1:1 & group with E2E encryption)
 * - WhatsApp calls via Twilio
 */

import type { ClawdbotConfig } from "../../config/config.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import type { RuntimeEnv } from "../../runtime.js";

/**
 * Discord voice call configuration
 */
export interface DiscordCallConfig {
  guildId: string;
  voiceChannelId?: string;
  participantLimit?: number;
  enabled: boolean;
}

/**
 * Telegram group call configuration
 */
export interface TelegramCallConfig {
  botToken: string;
  groupId: string;
  recordingEnabled?: boolean;
  maxParticipants?: number;
  enabled: boolean;
}

/**
 * Signal call configuration with E2E encryption
 */
export interface SignalCallConfig {
  phoneNumber: string;
  signalCliPath?: string;
  zrtpVerificationEnabled?: boolean;
  groupCallsEnabled: boolean;
  oneToOneCallsEnabled: boolean;
  enabled: boolean;
}

/**
 * Twilio WhatsApp/SMS call configuration
 */
export interface TwilioCallConfig {
  accountSid: string;
  authToken: string;
  twilioPhoneNumber: string;
  whatsappCallsEnabled: boolean;
  whatsappMessagingEnabled: boolean;
  defaultTimeoutSeconds?: number;
  enabled: boolean;
}

/**
 * Voice calls provider configuration union
 */
export type VoiceCallProviderConfig =
  | DiscordCallConfig
  | TelegramCallConfig
  | SignalCallConfig
  | TwilioCallConfig;

/**
 * All voice call providers configuration
 */
export interface VoiceCallsConfig {
  enabled: boolean;
  providers: {
    discord?: DiscordCallConfig;
    telegram?: TelegramCallConfig;
    signal?: SignalCallConfig;
    twilio?: TwilioCallConfig;
  };
}

/**
 * Setup result matching voice providers pattern
 */
interface VoiceCallProviderSetupResult {
  cfg: ClawdbotConfig;
  callProvidersAdded: boolean;
}

/**
 * Validate E.164 phone number format
 */
function validateE164PhoneNumber(phoneNumber: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Validate Discord guild ID format (18-digit numeric string)
 */
function validateDiscordGuildId(guildId: string): boolean {
  return /^\d{17,19}$/.test(guildId);
}

/**
 * Validate Telegram bot token format
 */
function validateTelegramBotToken(token: string): boolean {
  // Telegram bot tokens follow format: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
  return /^\d+:[a-zA-Z0-9_-]+$/.test(token);
}

/**
 * Validate Telegram group ID format
 */
function validateTelegramGroupId(groupId: string): boolean {
  // Telegram group IDs are negative numbers: -123456789
  return /^-\d+$/.test(groupId);
}

/**
 * Validate Twilio Account SID format
 */
function validateTwilioAccountSid(sid: string): boolean {
  // Twilio Account SIDs are 34 characters: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  return /^AC[a-zA-Z0-9]{32}$/.test(sid);
}

/**
 * Prompt for Discord voice call configuration
 */
async function promptDiscordCallConfig(prompter: WizardPrompter): Promise<DiscordCallConfig> {
  await prompter.note(
    [
      "Discord voice calls allow Clawdbot to participate in voice channels.",
      "You'll need:",
      "  - Guild ID (server ID)",
      "  - Optional: specific voice channel ID",
      "  - Optional: participant limit",
    ].join("\n"),
    "Discord voice calls",
  );

  const guildId = await prompter.text({
    message: "Discord Guild ID (server ID)",
    placeholder: "123456789012345678",
  });

  if (!validateDiscordGuildId(guildId)) {
    throw new Error("Invalid Discord Guild ID format (must be 17-19 digits)");
  }

  const voiceChannelId = await prompter.text({
    message: "Voice channel ID (optional, leave blank to auto-select)",
    placeholder: "Optional",
  });

  const participantLimitStr = await prompter.text({
    message: "Participant limit (optional, leave blank for unlimited)",
    placeholder: "Unlimited",
  });

  let participantLimit: number | undefined;
  if (participantLimitStr && !isNaN(Number(participantLimitStr))) {
    participantLimit = Math.max(1, parseInt(participantLimitStr, 10));
  }

  return {
    guildId,
    voiceChannelId: voiceChannelId || undefined,
    participantLimit,
    enabled: true,
  };
}

/**
 * Prompt for Telegram group call configuration
 */
async function promptTelegramCallConfig(prompter: WizardPrompter): Promise<TelegramCallConfig> {
  await prompter.note(
    [
      "Telegram group calls allow Clawdbot to join group calls.",
      "You'll need:",
      "  - Telegram bot token (from @BotFather)",
      "  - Group ID (negative number: -123456789)",
      "  - Optional: recording settings",
      "  - Optional: participant limit",
    ].join("\n"),
    "Telegram group calls",
  );

  const botToken = await prompter.text({
    message: "Telegram bot token",
    placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  });

  if (!validateTelegramBotToken(botToken)) {
    throw new Error("Invalid Telegram bot token format");
  }

  const groupId = await prompter.text({
    message: "Group ID (negative number)",
    placeholder: "-123456789",
  });

  if (!validateTelegramGroupId(groupId)) {
    throw new Error("Invalid Telegram group ID format (must be negative: -123456789)");
  }

  const recordingEnabled = await prompter.confirm({
    message: "Enable group call recording?",
    initialValue: false,
  });

  const maxParticipantsStr = await prompter.text({
    message: "Maximum participants (leave blank for default: 200)",
    placeholder: "200",
  });

  let maxParticipants: number | undefined;
  if (maxParticipantsStr && !isNaN(Number(maxParticipantsStr))) {
    maxParticipants = Math.max(1, Math.min(1000, parseInt(maxParticipantsStr, 10)));
  } else {
    maxParticipants = 200;
  }

  return {
    botToken,
    groupId,
    recordingEnabled,
    maxParticipants,
    enabled: true,
  };
}

/**
 * Prompt for Signal call configuration with E2E encryption
 */
async function promptSignalCallConfig(prompter: WizardPrompter): Promise<SignalCallConfig> {
  await prompter.note(
    [
      "Signal calls provide end-to-end encrypted voice calls.",
      "Supports 1:1 calls and group calls with ZRTP verification.",
      "You'll need:",
      "  - Phone number in E.164 format (+1234567890)",
      "  - signal-cli binary path (optional)",
      "  - Optional: enable ZRTP verification for extra security",
    ].join("\n"),
    "Signal calls",
  );

  const phoneNumber = await prompter.text({
    message: "Phone number (E.164 format, e.g., +1234567890)",
    placeholder: "+1234567890",
  });

  if (!validateE164PhoneNumber(phoneNumber)) {
    throw new Error("Invalid phone number format (must be E.164: +1234567890)");
  }

  const signalCliPath = await prompter.text({
    message: "signal-cli path (optional, leave blank to auto-detect)",
    placeholder: "/usr/local/bin/signal-cli",
  });

  const zrtpVerification = await prompter.confirm({
    message: "Enable ZRTP verification for additional security?",
    initialValue: false,
  });

  const groupCalls = await prompter.confirm({
    message: "Enable group calls?",
    initialValue: true,
  });

  const oneToOneCalls = await prompter.confirm({
    message: "Enable 1:1 calls?",
    initialValue: true,
  });

  if (!groupCalls && !oneToOneCalls) {
    throw new Error("At least one call type must be enabled");
  }

  return {
    phoneNumber,
    signalCliPath: signalCliPath || undefined,
    zrtpVerificationEnabled: zrtpVerification,
    groupCallsEnabled: groupCalls,
    oneToOneCallsEnabled: oneToOneCalls,
    enabled: true,
  };
}

/**
 * Prompt for Twilio WhatsApp/SMS call configuration
 */
async function promptTwilioCallConfig(prompter: WizardPrompter): Promise<TwilioCallConfig> {
  await prompter.note(
    [
      "Twilio integration enables WhatsApp and SMS calls.",
      "You'll need:",
      "  - Twilio Account SID",
      "  - Twilio Auth Token",
      "  - Twilio phone number",
      "  - Optional: enable WhatsApp calls and/or messaging",
    ].join("\n"),
    "Twilio WhatsApp calls",
  );

  const accountSid = await prompter.text({
    message: "Twilio Account SID",
    placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  });

  if (!validateTwilioAccountSid(accountSid)) {
    throw new Error("Invalid Twilio Account SID format (must be ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)");
  }

  const authToken = await prompter.text({
    message: "Twilio Auth Token",
    placeholder: "Your auth token (not shown)",
  });

  if (!authToken || authToken.length < 20) {
    throw new Error("Auth token appears invalid (too short)");
  }

  const twilioPhoneNumber = await prompter.text({
    message: "Twilio phone number (E.164 format)",
    placeholder: "+1234567890",
  });

  if (!validateE164PhoneNumber(twilioPhoneNumber)) {
    throw new Error("Invalid Twilio phone number (must be E.164: +1234567890)");
  }

  const whatsappCalls = await prompter.confirm({
    message: "Enable WhatsApp calls?",
    initialValue: true,
  });

  const whatsappMessaging = await prompter.confirm({
    message: "Enable WhatsApp messaging?",
    initialValue: true,
  });

  const timeoutStr = await prompter.text({
    message: "Default call timeout in seconds (optional)",
    placeholder: "30",
  });

  let defaultTimeoutSeconds: number | undefined;
  if (timeoutStr && !isNaN(Number(timeoutStr))) {
    defaultTimeoutSeconds = Math.max(5, Math.min(300, parseInt(timeoutStr, 10)));
  } else {
    defaultTimeoutSeconds = 30;
  }

  return {
    accountSid,
    authToken,
    twilioPhoneNumber,
    whatsappCallsEnabled: whatsappCalls,
    whatsappMessagingEnabled: whatsappMessaging,
    defaultTimeoutSeconds,
    enabled: true,
  };
}

/**
 * Show summary of configured voice call providers
 */
async function showVoiceCallsSummary(
  prompter: WizardPrompter,
  providers: {
    discord?: DiscordCallConfig;
    telegram?: TelegramCallConfig;
    signal?: SignalCallConfig;
    twilio?: TwilioCallConfig;
  },
): Promise<boolean> {
  const summary: string[] = [];

  if (providers.discord) {
    summary.push(
      `Discord: Guild ${providers.discord.guildId}${
        providers.discord.participantLimit ? ` (max ${providers.discord.participantLimit})` : ""
      }`,
    );
  }

  if (providers.telegram) {
    summary.push(
      `Telegram: Group ${providers.telegram.groupId}${
        providers.telegram.recordingEnabled ? " (recording enabled)" : ""
      }${providers.telegram.maxParticipants ? ` (max ${providers.telegram.maxParticipants})` : ""}`,
    );
  }

  if (providers.signal) {
    const callTypes = [];
    if (providers.signal.oneToOneCallsEnabled) callTypes.push("1:1");
    if (providers.signal.groupCallsEnabled) callTypes.push("group");
    summary.push(
      `Signal: ${providers.signal.phoneNumber}${
        providers.signal.zrtpVerificationEnabled ? " (ZRTP enabled)" : ""
      } [${callTypes.join(", ")}]`,
    );
  }

  if (providers.twilio) {
    const modes = [];
    if (providers.twilio.whatsappCallsEnabled) modes.push("calls");
    if (providers.twilio.whatsappMessagingEnabled) modes.push("messaging");
    summary.push(`Twilio: ${providers.twilio.twilioPhoneNumber} [${modes.join(", ")}]`);
  }

  if (summary.length === 0) {
    return false;
  }

  const confirmed = await prompter.confirm({
    message: `Configure voice call providers?\n${summary.map((s) => `  - ${s}`).join("\n")}`,
    initialValue: true,
  });

  return confirmed;
}

/**
 * Main voice call provider onboarding function
 */
export async function setupVoiceCallProviders(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
}): Promise<VoiceCallProviderSetupResult> {
  const { cfg, prompter, runtime } = params;
  let nextConfig = cfg;

  // Show intro screen explaining real-time voice calls
  await prompter.note(
    [
      "Real-time voice calls enable Clawdbot to participate in audio conversations.",
      "Supported platforms:",
      "  - Discord: voice channel integration",
      "  - Telegram: group call support",
      "  - Signal: encrypted 1:1 and group calls",
      "  - WhatsApp: calls via Twilio integration",
      "",
      "Configure any combination of platforms or skip to continue.",
    ].join("\n"),
    "Voice calls setup",
  );

  const providers: {
    discord?: DiscordCallConfig;
    telegram?: TelegramCallConfig;
    signal?: SignalCallConfig;
    twilio?: TwilioCallConfig;
  } = {};

  // Provider selection screen
  const enableCalls = await prompter.confirm({
    message: "Configure voice call providers?",
    initialValue: false,
  });

  if (!enableCalls) {
    return { cfg: nextConfig, callProvidersAdded: false };
  }

  // Multi-select provider screen
  const selectedProviders = await prompter.multiselect({
    message: "Select voice call providers to configure",
    options: [
      { value: "discord", label: "Discord voice channels" },
      { value: "telegram", label: "Telegram group calls" },
      { value: "signal", label: "Signal calls (E2E encrypted)" },
      { value: "twilio", label: "WhatsApp calls (Twilio)" },
    ],
    initialValues: [],
  });

  // Configure selected providers
  try {
    if (selectedProviders.includes("discord")) {
      runtime.log?.("Configuring Discord voice calls...");
      providers.discord = await promptDiscordCallConfig(prompter);
    }

    if (selectedProviders.includes("telegram")) {
      runtime.log?.("Configuring Telegram group calls...");
      providers.telegram = await promptTelegramCallConfig(prompter);
    }

    if (selectedProviders.includes("signal")) {
      runtime.log?.("Configuring Signal calls...");
      providers.signal = await promptSignalCallConfig(prompter);
    }

    if (selectedProviders.includes("twilio")) {
      runtime.log?.("Configuring Twilio WhatsApp calls...");
      providers.twilio = await promptTwilioCallConfig(prompter);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prompter.note(
      [
        "Error during provider configuration:",
        `  ${errorMsg}`,
        "",
        "Please check your input and try again.",
      ].join("\n"),
      "Configuration error",
    );
    return { cfg: nextConfig, callProvidersAdded: false };
  }

  // Show summary and confirm
  const confirmed = await showVoiceCallsSummary(prompter, providers);

  if (!confirmed) {
    return { cfg: nextConfig, callProvidersAdded: false };
  }

  // Validation summary
  const validations: string[] = [];
  if (providers.discord) {
    validations.push("Discord Guild ID format: valid");
  }
  if (providers.telegram) {
    validations.push("Telegram bot token format: valid");
    validations.push("Telegram group ID format: valid");
  }
  if (providers.signal) {
    validations.push("Signal phone number format (E.164): valid");
  }
  if (providers.twilio) {
    validations.push("Twilio Account SID format: valid");
    validations.push("Twilio phone number format (E.164): valid");
    validations.push(
      "Note: Twilio credentials will be validated when the bot connects",
    );
  }

  if (validations.length > 0) {
    await prompter.note(
      [
        "Configuration validated:",
        ...validations.map((v) => `  ✓ ${v}`),
      ].join("\n"),
      "Validation complete",
    );
  }

  // Update config with voice calls
  nextConfig = {
    ...nextConfig,
    voice: {
      ...nextConfig.voice,
      calls: {
        enabled: true,
        providers,
      } as any,
    },
  };

  runtime.log?.("Voice call providers configured successfully");

  return { cfg: nextConfig, callProvidersAdded: true };
}

/**
 * Test voice call configuration
 */
export async function testVoiceCallProviders(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<boolean> {
  const { cfg, prompter } = params;

  const callsConfig = (cfg.voice as any)?.calls as VoiceCallsConfig | undefined;
  const hasCallsConfig = callsConfig?.enabled && Object.keys(callsConfig?.providers || {}).length > 0;

  if (!hasCallsConfig) {
    await prompter.note("No voice call providers configured", "Voice calls test");
    return false;
  }

  const runTest = await prompter.confirm({
    message: "Test voice call providers (optional)?",
    initialValue: false,
  });

  if (!runTest) {
    return false;
  }

  await prompter.note(
    "Voice call provider testing is available from the CLI using: clawdbot voice-calls test",
    "Voice calls test",
  );

  return true;
}
