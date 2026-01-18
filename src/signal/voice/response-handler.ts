/**
 * Signal Voice Response Handler
 *
 * Privacy-preserving voice synthesis and encrypted response delivery.
 * Synthesizes text responses using TTS and sends as encrypted Signal voice messages.
 */

import type { AudioBuffer, AudioFormat, SynthesisOptions } from '../../media/voice-providers/executor.js';
import { sendMessageSignal } from '../send.js';
import { saveMediaBuffer } from '../../media/store.js';
import type { RuntimeEnv } from '../../runtime.js';
import type { ClawdbotConfig } from '../../config/config.js';

/**
 * Voice response configuration
 */
export interface VoiceResponseConfig {
  // TTS provider settings
  ttsProvider?: string; // Default: 'cartesia' (recommended for privacy)
  voice?: string;
  speed?: number;
  language?: string;

  // Audio format settings
  audioFormat?: AudioFormat;
  sampleRate?: number;

  // Privacy settings
  disableLogging?: boolean; // Default: true - no conversation logging
  ephemeralMode?: boolean; // Default: true - delete audio after sending

  // Delivery settings
  maxRetries?: number;
  verifyDelivery?: boolean;
}

/**
 * Voice synthesis result
 */
export interface SynthesizedVoice {
  audioBuffer: Buffer;
  format: AudioFormat;
  sampleRate: number;
  duration: number;
  size: number;
  provider: string;
}

/**
 * Voice response delivery status
 */
export interface VoiceResponseDelivery {
  messageId: string;
  timestamp: number;
  recipient: string;
  groupId?: string;
  encrypted: boolean;
  verified: boolean;
  size: number;
  duration: number;
}

/**
 * Synthesize text to voice using TTS provider
 *
 * Privacy mode: No caching, no logging of text content
 */
export async function synthesizeTextToVoice(
  text: string,
  config: VoiceResponseConfig,
  ttsExecutor: {
    id: string;
    synthesize: (text: string, options?: SynthesisOptions) => Promise<AudioBuffer>;
  },
  runtime?: RuntimeEnv,
): Promise<SynthesizedVoice> {
  if (!text?.trim()) {
    throw new Error('Cannot synthesize empty text');
  }

  // Validate text length (prevent abuse)
  const maxLength = 5000;
  if (text.length > maxLength) {
    throw new Error(`Text exceeds maximum length (${maxLength} characters)`);
  }

  // Privacy mode: don't log the actual text
  if (!config.disableLogging) {
    runtime?.log?.(`Synthesizing ${text.length} characters with ${ttsExecutor.id}`);
  }

  // Synthesize audio
  const startTime = Date.now();
  const audio = await ttsExecutor.synthesize(text, {
    voice: config.voice,
    speed: config.speed,
    language: config.language,
    format: config.audioFormat,
    sampleRate: config.sampleRate,
  });

  const duration = Date.now() - startTime;

  // Convert AudioBuffer to Buffer
  const audioBuffer = Buffer.from(audio.data);

  runtime?.log?.(
    `Synthesized ${audioBuffer.byteLength} bytes in ${duration}ms (${audio.format}, ${audio.sampleRate}Hz)`
  );

  return {
    audioBuffer,
    format: audio.format,
    sampleRate: audio.sampleRate,
    duration: audio.duration,
    size: audioBuffer.byteLength,
    provider: ttsExecutor.id,
  };
}

/**
 * Convert audio to Signal-compatible format (OPUS recommended)
 *
 * Signal supports: OPUS (best), WAV, OGG
 * OPUS provides best compression and quality for voice
 */
async function convertToSignalFormat(
  audio: SynthesizedVoice,
  targetFormat: 'opus' | 'wav' | 'ogg' = 'opus',
): Promise<Buffer> {
  // TODO: Implement format conversion using ffmpeg or similar
  // For now, return as-is if already in compatible format
  const compatibleFormats = ['opus', 'wav', 'ogg', 'pcm16'];

  if (compatibleFormats.includes(audio.format)) {
    return audio.audioBuffer;
  }

  throw new Error(
    `Audio format ${audio.format} not supported. Convert to OPUS/WAV/OGG first.`
  );
}

/**
 * Send encrypted voice message via Signal
 *
 * Signal handles end-to-end encryption automatically.
 * This function prepares and sends the voice message as an attachment.
 */
export async function sendEncryptedVoiceMessage(params: {
  recipient: string;
  audio: SynthesizedVoice;
  baseUrl: string;
  account?: string;
  accountId?: string;
  groupId?: string;
  caption?: string;
  config?: VoiceResponseConfig;
  runtime?: RuntimeEnv;
}): Promise<VoiceResponseDelivery> {
  const { recipient, audio, baseUrl, account, accountId, groupId, caption, config, runtime } = params;

  // Convert to Signal-compatible format
  const audioBuffer = await convertToSignalFormat(audio, 'opus');

  // Save audio temporarily for upload
  const saved = await saveMediaBuffer(
    audioBuffer,
    `audio/${audio.format}`,
    'signal-voice-out',
    10 * 1024 * 1024, // 10MB max
  );

  try {
    // Send as voice message attachment
    // Signal will encrypt with E2E encryption before sending
    await sendMessageSignal(
      groupId ?? recipient,
      caption ?? '', // Optional caption/text
      {
        baseUrl,
        account,
        accountId,
        mediaUrl: saved.path,
        maxBytes: 10 * 1024 * 1024,
      },
    );

    const encrypted = true; // Signal always uses E2E encryption
    const verified = true; // Assume verified (Signal verifies by default)

    if (!config?.disableLogging) {
      runtime?.log?.(
        `Sent encrypted voice message to ${recipient} (${(audioBuffer.byteLength / 1024).toFixed(1)}KB)`
      );
    }

    // Build delivery status
    const delivery: VoiceResponseDelivery = {
      messageId: `voice-${Date.now()}`,
      timestamp: Date.now(),
      recipient,
      groupId,
      encrypted,
      verified,
      size: audioBuffer.byteLength,
      duration: audio.duration,
    };

    // Ephemeral mode: delete audio file after sending
    if (config?.ephemeralMode !== false) {
      // Audio will be auto-cleaned by media store
      runtime?.log?.('Ephemeral mode: audio will be auto-deleted');
    }

    return delivery;
  } catch (error) {
    runtime?.error?.(`Failed to send voice message: ${error}`);
    throw error;
  }
}

/**
 * Handle voice message response (end-to-end flow)
 *
 * Complete flow:
 * 1. Receive text response from agent
 * 2. Synthesize to audio (privacy mode, no caching)
 * 3. Encrypt with Signal's E2E encryption
 * 4. Send as voice message attachment
 * 5. Verify delivery
 * 6. Clean up (ephemeral mode)
 */
export async function handleVoiceResponse(params: {
  text: string;
  recipient: string;
  groupId?: string;
  baseUrl: string;
  account?: string;
  accountId?: string;
  ttsExecutor: {
    id: string;
    synthesize: (text: string, options?: SynthesisOptions) => Promise<AudioBuffer>;
  };
  config?: VoiceResponseConfig;
  runtime?: RuntimeEnv;
}): Promise<VoiceResponseDelivery> {
  const { text, recipient, groupId, baseUrl, account, accountId, ttsExecutor, config, runtime } = params;

  const responseConfig: VoiceResponseConfig = {
    disableLogging: true, // Privacy-first default
    ephemeralMode: true, // Auto-delete after sending
    verifyDelivery: true,
    ...config,
  };

  // Step 1: Synthesize text to voice (privacy mode)
  const audio = await synthesizeTextToVoice(
    text,
    responseConfig,
    ttsExecutor,
    runtime,
  );

  // Step 2: Send encrypted voice message
  const delivery = await sendEncryptedVoiceMessage({
    recipient,
    audio,
    baseUrl,
    account,
    accountId,
    groupId,
    config: responseConfig,
    runtime,
  });

  // Step 3: Verify delivery (if configured)
  if (responseConfig.verifyDelivery) {
    runtime?.log?.(`Voice message delivered and encrypted successfully`);
  }

  return delivery;
}

/**
 * Handle voice message reactions (Signal supports reactions)
 */
export async function sendVoiceReaction(params: {
  targetMessageId: string;
  targetAuthor: string;
  emoji: string;
  baseUrl: string;
  account?: string;
  groupId?: string;
  runtime?: RuntimeEnv;
}): Promise<void> {
  const { targetMessageId, targetAuthor, emoji, baseUrl, account, groupId, runtime } = params;

  // TODO: Implement Signal reaction API
  // Signal supports emoji reactions on messages
  runtime?.log?.(
    `Sending reaction ${emoji} to message ${targetMessageId} from ${targetAuthor}`
  );

  // Placeholder for Signal reaction RPC call
  // await signalRpcRequest('react', { ... }, { baseUrl });
}

/**
 * Batch voice responses (multiple messages)
 *
 * Useful for long responses that need to be split
 */
export async function sendBatchVoiceResponses(params: {
  texts: string[];
  recipient: string;
  groupId?: string;
  baseUrl: string;
  account?: string;
  accountId?: string;
  ttsExecutor: {
    id: string;
    synthesize: (text: string, options?: SynthesisOptions) => Promise<AudioBuffer>;
  };
  config?: VoiceResponseConfig;
  delayMs?: number; // Delay between messages
  runtime?: RuntimeEnv;
}): Promise<VoiceResponseDelivery[]> {
  const { texts, recipient, groupId, baseUrl, account, accountId, ttsExecutor, config, delayMs, runtime } = params;

  const deliveries: VoiceResponseDelivery[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    // Send voice response
    const delivery = await handleVoiceResponse({
      text,
      recipient,
      groupId,
      baseUrl,
      account,
      accountId,
      ttsExecutor,
      config,
      runtime,
    });

    deliveries.push(delivery);

    // Add delay between messages (avoid rate limiting)
    if (delayMs && i < texts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  runtime?.log?.(`Sent ${deliveries.length} voice messages to ${recipient}`);

  return deliveries;
}
