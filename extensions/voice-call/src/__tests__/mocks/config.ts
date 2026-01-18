/**
 * Mock configuration factories for testing
 */

import type { VoiceCallConfig } from "../../config.js";
import { VoiceCallConfigSchema } from "../../config.js";

export function createMockConfig(overrides: Partial<VoiceCallConfig> = {}): VoiceCallConfig {
  return VoiceCallConfigSchema.parse({
    enabled: true,
    provider: "mock",
    fromNumber: "+15550000000",
    toNumber: "+15550000001",
    fallbackOrder: ["telnyx", "twilio", "plivo"],
    telnyx: {
      apiKey: "test-key",
      connectionId: "test-conn",
      publicKey: "test-pubkey",
    },
    twilio: {
      accountSid: "AC123456",
      authToken: "test-token",
    },
    plivo: {
      authId: "test-auth",
      authToken: "test-token",
    },
    stt: {
      provider: "openai",
      model: "whisper-1",
    },
    tts: {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      voice: "coral",
    },
    inboundPolicy: "disabled",
    allowFrom: [],
    ...overrides,
  });
}

export function createProviderConfig(
  provider: "telnyx" | "twilio" | "plivo" | "mock",
  overrides: Partial<VoiceCallConfig> = {},
): VoiceCallConfig {
  return createMockConfig({
    provider,
    ...overrides,
  });
}
