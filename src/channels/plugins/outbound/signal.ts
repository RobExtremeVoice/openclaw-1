import { chunkText } from "../../../auto-reply/chunk.js";
import { sendMessageSignal, sendPollSignal } from "../../../signal/send.js";
import { resolveChannelMediaMaxBytes } from "../media-limits.js";
import type { ChannelOutboundAdapter } from "../types.js";

export const signalOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: chunkText,
  chunkerMode: "text",
  textChunkLimit: 4000,
  pollMaxOptions: 12,
  sendText: async ({ cfg, to, text, accountId, deps }) => {
    const send = deps?.sendSignal ?? sendMessageSignal;
    const maxBytes = resolveChannelMediaMaxBytes({
      cfg,
      resolveChannelLimitMb: ({ cfg, accountId }) =>
        cfg.channels?.signal?.accounts?.[accountId]?.mediaMaxMb ?? cfg.channels?.signal?.mediaMaxMb,
      accountId,
    });
    const result = await send(to, text, {
      maxBytes,
      accountId: accountId ?? undefined,
    });
    return { channel: "signal", ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, accountId, deps }) => {
    const send = deps?.sendSignal ?? sendMessageSignal;
    const maxBytes = resolveChannelMediaMaxBytes({
      cfg,
      resolveChannelLimitMb: ({ cfg, accountId }) =>
        cfg.channels?.signal?.accounts?.[accountId]?.mediaMaxMb ?? cfg.channels?.signal?.mediaMaxMb,
      accountId,
    });
    const result = await send(to, text, {
      mediaUrl,
      maxBytes,
      accountId: accountId ?? undefined,
    });
    return { channel: "signal", ...result };
  },
  sendPoll: async ({ to, poll, accountId }) => {
    const result = await sendPollSignal(to, poll.question, poll.options, {
      multiSelect: (poll.maxSelections ?? 1) > 1,
      accountId: accountId ?? undefined,
    });
    return { messageId: result.messageId };
  },
};
