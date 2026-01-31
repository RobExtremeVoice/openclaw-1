export type KakaoAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** If false, do not start this Kakao account. Default: true. */
  enabled?: boolean;
  /** REST API Key from Kakao Developers console. */
  apiKey?: string;
  /** Path to file containing the REST API key. */
  tokenFile?: string;
  /** Webhook path for the gateway HTTP server (defaults to /kakao-webhook). */
  webhookPath?: string;
  /** Webhook secret for request verification (optional). */
  webhookSecret?: string;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Allowlist for DM senders (Kakao user keys). */
  allowFrom?: Array<string | number>;
  /** Timeout in ms to wait for agent response before returning fallback (default: 4500). */
  responseTimeoutMs?: number;
};

export type KakaoConfig = {
  /** Optional per-account Kakao configuration (multi-account). */
  accounts?: Record<string, KakaoAccountConfig>;
  /** Default account ID when multiple accounts are configured. */
  defaultAccount?: string;
} & KakaoAccountConfig;

export type KakaoTokenSource = "env" | "config" | "configFile" | "none";

export type ResolvedKakaoAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: KakaoTokenSource;
  config: KakaoAccountConfig;
};

/** Kakao i Open Builder skill request payload. */
export type KakaoSkillRequest = {
  userRequest: {
    timezone: string;
    params: Record<string, unknown>;
    block: { id: string; name: string };
    utterance: string;
    lang: string;
    user: {
      id: string;
      type: string;
      properties: {
        plusfriendUserKey?: string;
        appUserId?: string;
        isFriend?: boolean;
      };
    };
  };
  contexts?: Array<{ name: string; lifeSpan: number; params: Record<string, unknown> }>;
  bot: { id: string; name: string };
  action: {
    name: string;
    clientExtra: Record<string, unknown> | null;
    params: Record<string, unknown>;
    id: string;
    detailParams: Record<string, unknown>;
  };
};

/** Kakao i Open Builder skill response. */
export type KakaoSkillResponse = {
  version: "2.0";
  template: {
    outputs: KakaoOutput[];
    quickReplies?: KakaoQuickReply[];
  };
  data?: Record<string, unknown>;
};

export type KakaoOutput =
  | { simpleText: { text: string } }
  | { simpleImage: { imageUrl: string; altText: string } }
  | { textCard: { title?: string; description: string; buttons?: KakaoButton[] } };

export type KakaoButton = {
  action: "webLink" | "message" | "block" | "phone";
  label: string;
  webLinkUrl?: string;
  messageText?: string;
  blockId?: string;
  phoneNumber?: string;
};

export type KakaoQuickReply = {
  action: "message" | "block";
  label: string;
  messageText?: string;
  blockId?: string;
};
