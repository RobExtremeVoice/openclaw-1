/**
 * OpenAI TTS Plugin
 *
 * Exports the plugin provider, types, and utilities.
 */

export { OpenAITTSProvider, OPENAI_TTS_VOICES } from "./provider.js";
export type { OpenAITTSConfig, OpenAITTSVoice } from "./provider.js";
export {
  chunkAudio,
  mulawToLinear,
  pcmToMulaw,
  resample24kTo8k,
} from "./audio-utils.js";
