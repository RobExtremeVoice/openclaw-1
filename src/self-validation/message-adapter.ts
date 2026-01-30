import type { OpenClawConfig } from "../config/config.js";

export interface ValidationMessageParams {
  onBlockReply?: (payload: { text?: string }) => void | Promise<void>;
  messageChannel?: string;
  messageTo?: string;
  sessionKey?: string;
  config?: OpenClawConfig;
}

export function createValidationMessageSender(params: ValidationMessageParams) {
  return async (message: string): Promise<void> => {
    if (params.onBlockReply) {
      await params.onBlockReply({ text: message });
      return;
    }

    console.warn("[SelfValidation] No message channel available:", message);
  };
}
