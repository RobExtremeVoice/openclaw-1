export type { VoiceCallProvider } from "./base.js";
export { MockProvider } from "./mock.js";
export {
  OpenAIRealtimeSTTProvider,
  type RealtimeSTTConfig,
  type RealtimeSTTSession,
} from "./stt-openai-realtime.js";
export { TelnyxProvider } from "./telnyx.js";
export { TwilioProvider } from "./twilio.js";
export { PlivoProvider } from "./plivo.js";

// Plugin system - re-export for convenience
export {
  getPluginRegistry,
  PluginRegistry,
  initializeBuiltInPlugins,
} from "../plugins/index.js";
export type {
  PluginConfig,
  PluginInitResult,
  PluginMetadata,
  PluginRegistration,
  STTProvider,
  STTSession,
  TTSProvider,
  TTSSynthesisOptions,
} from "../plugins/index.js";

// Built-in plugins
export { OpenAITTSProvider, OPENAI_TTS_VOICES } from "../plugins/index.js";
export type { OpenAITTSConfig, OpenAITTSVoice } from "../plugins/index.js";
