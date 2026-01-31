import { MarkdownConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

const kakaoAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema,
  apiKey: z.string().optional(),
  tokenFile: z.string().optional(),
  webhookPath: z.string().optional(),
  webhookSecret: z.string().optional(),
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(allowFromEntry).optional(),
  responseTimeoutMs: z.number().optional(),
});

export const KakaoConfigSchema = kakaoAccountSchema.extend({
  accounts: z.object({}).catchall(kakaoAccountSchema).optional(),
  defaultAccount: z.string().optional(),
});
