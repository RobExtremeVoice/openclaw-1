/**
 * Telegram Calls Provider Plugin - Entry Point
 *
 * Exports factory function and types for the Telegram provider plugin.
 */

export {
  TelegramCallProviderPlugin,
} from "./telegram-provider.js";

export {
  validateTelegramConfig,
  validateBotToken,
  validateGroupId,
  validateUserId,
  TelegramCallConfigSchema,
  type TelegramCallConfig,
  type TelegramGroupCallOptions,
  type TelegramCallParticipant,
  TELEGRAM_CALL_EVENTS,
  TELEGRAM_CALL_STATE_MAP,
} from "./telegram-config.js";

export {
  verifyTelegramWebhook,
  parseChatMemberUpdate,
  GroupCallParticipantTracker,
  extractGroupIdFromUpdate,
  extractUserFromUpdate,
  isGroupUpdate,
  pollGroupCallParticipants,
  type GroupCallMemberStatusUpdate,
  type GroupCallStateUpdate,
  type GroupCallPollingOptions,
} from "./telegram-webhook.js";

/**
 * Factory function to create a Telegram call provider plugin
 */
export function createTelegramCallProvider(config: unknown) {
  const { TelegramCallProviderPlugin } = require("./telegram-provider.js");
  const { validateTelegramConfig } = require("./telegram-config.js");

  const validatedConfig = validateTelegramConfig(config);
  return new TelegramCallProviderPlugin(validatedConfig);
}
