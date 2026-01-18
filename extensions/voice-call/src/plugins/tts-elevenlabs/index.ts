/**
 * ElevenLabs TTS Plugin - Main Export
 *
 * Re-exports all ElevenLabs TTS provider components and utilities.
 */

// Provider exports
export {
  ElevenLabsTTSProvider,
  ElevenLabsBatchSynthesizer,
  getCommonVoices,
  findVoiceByName,
  getVoicesByGender,
  getVoicesByAccent,
  estimateCharacterCount,
  chunkTextBySentences,
  type ElevenLabsVoice,
  type ElevenLabsVoiceMetadata,
  type ElevenLabsTTSConfig,
  type VoiceInfo,
} from "../../providers/tts-elevenlabs.js";

// Service exports
export {
  ElevenLabsTTSService,
  ElevenLabsTTSPlugin,
  elevenlabsTTSPlugin,
} from "./service.js";

// Interface exports
export type {
  PluginConfig,
  PluginMetadata,
  TTSProvider,
  TTSSynthesisOptions,
  PluginRegistration,
} from "../interfaces.js";
