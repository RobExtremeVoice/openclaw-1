export const CHAT_CHANNEL_ORDER = [
    "telegram",
    "whatsapp",
    "discord",
    "slack",
    "signal",
    "imessage",
] as const;

export type ChatChannelId = (typeof CHAT_CHANNEL_ORDER)[number];
