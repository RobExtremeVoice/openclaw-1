/**
 * Signal Voice Event Handler Integration
 *
 * Hooks voice message detection and processing into the main Signal event handler.
 * Detects voice messages before text processing and handles them separately.
 */

import type { SignalAttachment, SignalDataMessage } from './event-handler.types.js';
import type { RuntimeEnv } from '../../runtime.js';
import { isVoiceMessage } from '../voice/message-handler.js';
import { logVerbose } from '../../globals.js';

/**
 * Check if a Signal data message contains a voice message
 */
export function hasVoiceMessageAttachment(dataMessage: SignalDataMessage | null | undefined): boolean {
  if (!dataMessage?.attachments?.length) {
    return false;
  }

  const firstAttachment = dataMessage.attachments[0];
  if (!firstAttachment?.id) {
    return false;
  }

  return isVoiceMessage(firstAttachment as any); // Cast to any to bypass null-checking
}

/**
 * Extract voice attachment from Signal message
 * Returns the first audio attachment, or null if none found
 */
export function extractVoiceAttachment(dataMessage: SignalDataMessage | null | undefined): SignalAttachment | null {
  if (!dataMessage?.attachments?.length) {
    return null;
  }

  for (const attachment of dataMessage.attachments) {
    if (attachment?.id && isVoiceMessage(attachment as any)) {
      return attachment;
    }
  }

  return null;
}

/**
 * Parameters for handling a Signal voice message in the event flow
 */
export interface SignalVoiceEventParams {
  // Message context
  attachment: SignalAttachment | null | undefined;
  messageId: string;
  timestamp: number;

  // Sender information
  sender: string;
  senderUuid?: string;
  senderName?: string;

  // Group context (if applicable)
  groupId?: string;
  groupName?: string;

  // Signal connection info
  baseUrl: string;
  account?: string;
  accountId?: string;

  // Handlers
  runtime?: RuntimeEnv;

  /**
   * Called after voice message is detected and decrypted
   * Should return the text to synthesize as voice response
   * Return empty string to skip voice handling
   */
  onVoiceDetected: (params: {
    transcribedText: string;
    sender: string;
    groupId?: string;
    isGroup: boolean;
  }) => Promise<string>;

  /**
   * Called when voice response is ready to send
   * Should deliver the voice message and/or text to Signal
   */
  onVoiceResponse: (params: {
    voiceBuffer?: Buffer;
    text?: string;
    format?: 'opus' | 'ogg' | 'wav';
  }) => Promise<void>;
}

/**
 * Handle Signal voice message in the main event processing flow
 *
 * This function is called from the main event handler when a voice message is detected.
 * It coordinates transcription, response generation, and delivery.
 *
 * Returns true if voice message was fully handled (no text processing needed)
 * Returns false if voice handling failed/was skipped (continue with text processing)
 */
export async function handleSignalVoiceMessageEvent(params: SignalVoiceEventParams): Promise<boolean> {
  const {
    attachment,
    messageId,
    timestamp,
    sender,
    senderUuid,
    senderName,
    groupId,
    groupName,
    baseUrl,
    account,
    accountId,
    runtime,
    onVoiceDetected,
    onVoiceResponse,
  } = params;

  try {
    // Validate attachment
    if (!attachment?.id) {
      logVerbose(`signal-voice-event: invalid attachment (no ID)`);
      return false;
    }

    logVerbose(`signal-voice-event: processing voice message from ${sender} (id: ${messageId})`);

    // Import here to avoid circular dependencies
    const { processVoiceMessage } = await import('../voice/message-handler.js');
    const { handleVoiceResponse } = await import('../voice/response-handler.js');
    const { VoiceProviderRegistry } = await import('../../media/voice-providers/registry.js');

    // Step 1: Process and decrypt voice message
    logVerbose(`signal-voice-event: processing attachment ${attachment.id}`);

    // Cast attachment to required type (we've validated it has an id)
    const validatedAttachment = attachment as any;

    const voiceMessage = await processVoiceMessage({
      attachment: validatedAttachment,
      sender,
      senderUuid,
      timestamp,
      messageId,
      groupId,
      groupName,
      baseUrl,
      account,
      runtime,
    });

    logVerbose(
      `signal-voice-event: decrypted voice message (${(voiceMessage.size / 1024).toFixed(1)}KB, encrypted=${voiceMessage.encrypted}, verified=${voiceMessage.verified})`
    );

    // Step 2: Transcribe voice message
    logVerbose(`signal-voice-event: transcribing audio...`);

    const registry = new VoiceProviderRegistry();
    try {
      const transcriber = await registry.getTranscriber();
      const transcriptionResult = await transcriber.transcribe(voiceMessage.audioBuffer as any);

      let transcribedText: string;
      if ('text' in transcriptionResult && typeof transcriptionResult.text === 'string') {
        transcribedText = transcriptionResult.text.trim();
      } else {
        logVerbose('signal-voice-event: transcription failed - invalid result format');
        runtime?.error?.('Voice transcription returned invalid result');
        return false;
      }

      if (!transcribedText) {
        logVerbose('signal-voice-event: empty transcription');
        return false;
      }

      logVerbose(`signal-voice-event: transcribed: "${transcribedText}"`);

      // Step 3: Call handler to generate response
      const isGroup = Boolean(groupId);
      const responseText = await onVoiceDetected({
        transcribedText,
        sender,
        groupId,
        isGroup,
      });

      if (!responseText) {
        logVerbose('signal-voice-event: no response text generated');
        return true; // Still considered handled
      }

      // Step 4: Get synthesizer and generate voice response
      logVerbose(`signal-voice-event: synthesizing response (${responseText.length} chars)...`);

      const synthesizer = await registry.getSynthesizer();
      const audioResult = await synthesizer.synthesize(responseText);

      let voiceBuffer: Buffer | undefined;
      if (Buffer.isBuffer(audioResult)) {
        voiceBuffer = audioResult;
      } else if ('buffer' in audioResult && Buffer.isBuffer(audioResult.buffer)) {
        voiceBuffer = audioResult.buffer;
      }

      if (voiceBuffer) {
        logVerbose(
          `signal-voice-event: synthesized ${(voiceBuffer.byteLength / 1024).toFixed(1)}KB voice response`
        );
      } else {
        logVerbose('signal-voice-event: synthesis failed to produce buffer, using text only');
      }

      // Step 5: Send response
      await onVoiceResponse({
        voiceBuffer,
        text: voiceBuffer ? undefined : responseText, // Send text if no voice buffer
        format: 'opus',
      });

      logVerbose(`signal-voice-event: response sent to ${sender}`);

      return true; // Voice message fully handled
    } finally {
      await registry.shutdown();
    }
  } catch (error) {
    runtime?.error?.(
      `Signal voice event handling failed: ${error instanceof Error ? error.message : String(error)}`
    );
    logVerbose(
      `signal-voice-event: error: ${error instanceof Error ? error.stack : String(error)}`
    );
    return false; // Fall through to text handling
  }
}

/**
 * Middleware for Signal event handler to detect and intercept voice messages
 *
 * Use this in the main event handler before text processing:
 * ```typescript
 * if (await shouldHandleSignalVoiceMessage(dataMessage, context)) {
 *   const handled = await handleSignalVoiceMessageEvent({...});
 *   if (handled) return; // Skip text processing
 * }
 * ```
 */
export async function shouldHandleSignalVoiceMessage(
  dataMessage: SignalDataMessage | null | undefined,
  context?: { runtime?: RuntimeEnv }
): Promise<boolean> {
  if (!hasVoiceMessageAttachment(dataMessage)) {
    return false;
  }

  logVerbose('signal-voice-event: detected voice message in attachment');
  return true;
}
