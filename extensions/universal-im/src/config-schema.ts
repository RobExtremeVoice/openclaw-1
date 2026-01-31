import { z } from "zod";

import {
  BlockStreamingCoalesceSchema,
  DmPolicySchema,
  GroupPolicySchema,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk";

const WebhookConfigSchema = z
  .object({
    path: z.string().optional(),
    secret: z.string().optional(),
  })
  .strict();

const WebSocketConfigSchema = z
  .object({
    url: z.string().optional(),
    reconnectMs: z.number().int().positive().optional(),
  })
  .strict();

const PollingConfigSchema = z
  .object({
    url: z.string().optional(),
    intervalMs: z.number().int().positive().optional(),
  })
  .strict();

const OutboundConfigSchema = z
  .object({
    url: z.string().optional(),
    authHeader: z.string().optional(),
  })
  .strict();

const UniversalImAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    provider: z.string().optional(),
    transport: z.enum(["webhook", "websocket", "polling"]).optional(),
    webhook: WebhookConfigSchema.optional(),
    websocket: WebSocketConfigSchema.optional(),
    polling: PollingConfigSchema.optional(),
    outbound: OutboundConfigSchema.optional(),
    dmPolicy: DmPolicySchema.optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: GroupPolicySchema.optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    providerConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const UniversalImAccountSchema = UniversalImAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.universal-im.dmPolicy="open" requires channels.universal-im.allowFrom to include "*"',
  });
});

export const UniversalImConfigSchema = UniversalImAccountSchemaBase.extend({
  accounts: z.record(z.string(), UniversalImAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.universal-im.dmPolicy="open" requires channels.universal-im.allowFrom to include "*"',
  });
});
