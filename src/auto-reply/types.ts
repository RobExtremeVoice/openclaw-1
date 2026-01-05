export type GetReplyOptions = {
  onReplyStart?: () => Promise<void> | void;
  isHeartbeat?: boolean;
  onPartialReply?: (payload: ReplyPayload) => Promise<void> | void;
  onToolResult?: (payload: ReplyPayload) => Promise<void> | void;
  onToolStart?: (payload: { name: string; args?: any }) => Promise<void> | void;
  /** If true, suppress streaming tool execution updates (e.g., "Using tool: X...") */
  suppressToolStreaming?: boolean;
  /** If true, wait for final reply instead of streaming partial updates */
  waitForFinalReply?: boolean;
};

export type ReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
};
