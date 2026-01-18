// @ts-nocheck
import { logVerbose } from "../globals.js";
import { buildTelegramMessageContext } from "./bot-message-context.js";
import { dispatchTelegramMessage } from "./bot-message-dispatch.js";
import { handleTelegramVoiceMessage, hasVoiceMessage } from "./voice/integration.js";
import { sendMessageTelegram } from "./send.js";

export const createTelegramMessageProcessor = (deps) => {
  const {
    bot,
    cfg,
    account,
    telegramCfg,
    historyLimit,
    groupHistories,
    dmPolicy,
    allowFrom,
    groupAllowFrom,
    ackReactionScope,
    logger,
    resolveGroupActivation,
    resolveGroupRequireMention,
    resolveTelegramGroupConfig,
    runtime,
    replyToMode,
    streamMode,
    textLimit,
    opts,
    resolveBotTopicsEnabled,
  } = deps;

  return async (primaryCtx, allMedia, storeAllowFrom, options) => {
    const msg = primaryCtx.message;
    const chatId = msg?.chat?.id;

    // Handle voice messages first (if present)
    if (msg && hasVoiceMessage(msg)) {
      const voiceHandled = await handleTelegramVoiceMessage({
        message: msg,
        bot,
        token: opts.token,
        providersConfig: cfg.voice as any, // Type cast - config validation happens in registry
        chatId: chatId ?? 0,
        userId: msg.from?.id,
        replyFn: async (transcribedText: string) => {
          // For now, we'll just echo back a simple response
          // In production, you'd wire this into your full agent pipeline
          // by calling dispatchReplyFromConfig with the transcribed text
          return `I heard you say: "${transcribedText}". Voice message support is active!`;
        },
        sendFn: async ({ text, replyToId }) => {
          // Send text response to Telegram
          if (text) {
            await sendMessageTelegram(String(chatId), text, {
              token: opts.token,
              replyToMessageId: replyToId,
            });
          }
        },
      });

      if (voiceHandled) {
        // Voice message was successfully handled, skip regular text processing
        logVerbose(`telegram: voice message handled for ${msg.message_id}`);
        return;
      }
    }

    const context = await buildTelegramMessageContext({
      primaryCtx,
      allMedia,
      storeAllowFrom,
      options,
      bot,
      cfg,
      account,
      historyLimit,
      groupHistories,
      dmPolicy,
      allowFrom,
      groupAllowFrom,
      ackReactionScope,
      logger,
      resolveGroupActivation,
      resolveGroupRequireMention,
      resolveTelegramGroupConfig,
    });
    if (!context) return;
    await dispatchTelegramMessage({
      context,
      bot,
      cfg,
      runtime,
      replyToMode,
      streamMode,
      textLimit,
      telegramCfg,
      opts,
      resolveBotTopicsEnabled,
    });
  };
};
