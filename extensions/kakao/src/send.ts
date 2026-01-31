import type { OpenClawConfig } from "openclaw/plugin-sdk";

import { resolveKakaoAccount } from "./accounts.js";

export type KakaoSendOptions = {
  token?: string;
  accountId?: string;
  cfg?: OpenClawConfig;
};

export type KakaoSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Kakao i Open Builder does not have a traditional "send message" API.
 * All replies go through the synchronous skill response in the webhook handler.
 *
 * This function exists for compatibility with the outbound adapter interface.
 * Proactive messaging is not supported in the Kakao skill server model.
 */
export async function sendMessageKakao(
  _chatId: string,
  _text: string,
  options: KakaoSendOptions = {},
): Promise<KakaoSendResult> {
  const token = options.token ?? (options.cfg
    ? resolveKakaoAccount({ cfg: options.cfg, accountId: options.accountId }).token
    : "");

  if (!token) {
    return { ok: false, error: "No Kakao API key configured" };
  }

  // Kakao skill server is synchronous — outbound messages are returned
  // as HTTP responses to the skill request webhook, not pushed via API.
  // Proactive send is not supported in the skill server model.
  return {
    ok: false,
    error: "Kakao skill server does not support proactive message sending. " +
      "Replies are delivered via the webhook skill response.",
  };
}
