/**
 * OpenAI Realtime STT Session
 *
 * Handles WebSocket connections, audio streaming, and event handling.
 */

import WebSocket from "ws";
import type { STTSession } from "../interfaces.js";

/**
 * WebSocket-based session for real-time speech-to-text.
 */
export class OpenAIRealtimeSTTSession implements STTSession {
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_DELAY_MS = 1000;
  private static readonly WEBSOCKET_TIMEOUT_MS = 10000;

  readonly sessionId: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private closed = false;
  private reconnectAttempts = 0;
  private pendingTranscript = "";
  private onTranscriptCallback: ((transcript: string) => void) | null = null;
  private onPartialCallback: ((partial: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(
    sessionId: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly silenceDurationMs: number,
    private readonly vadThreshold: number,
  ) {
    this.sessionId = sessionId;
  }

  async connect(): Promise<void> {
    this.closed = false;
    this.reconnectAttempts = 0;
    return this.doConnect();
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = "wss://api.openai.com/v1/realtime?intent=transcription";

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      this.ws.on("open", () => {
        console.log(`[RealtimeSTT:${this.sessionId}] WebSocket connected`);
        this.connected = true;
        this.reconnectAttempts = 0;

        // Configure the transcription session
        this.sendEvent({
          type: "transcription_session.update",
          session: {
            input_audio_format: "g711_ulaw",
            input_audio_transcription: {
              model: this.model,
            },
            turn_detection: {
              type: "server_vad",
              threshold: this.vadThreshold,
              prefix_padding_ms: 300,
              silence_duration_ms: this.silenceDurationMs,
            },
          },
        });

        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (error) {
          const err =
            error instanceof Error
              ? error
              : new Error("Failed to parse WebSocket message");
          console.error(`[RealtimeSTT:${this.sessionId}] Parse error:`, err);
          this.onErrorCallback?.(err);
        }
      });

      this.ws.on("error", (error) => {
        const err =
          error instanceof Error ? error : new Error(String(error));
        console.error(`[RealtimeSTT:${this.sessionId}] WebSocket error:`, err);
        if (!this.connected) reject(err);
        this.onErrorCallback?.(err);
      });

      this.ws.on("close", (code, reason) => {
        console.log(
          `[RealtimeSTT:${this.sessionId}] WebSocket closed (code: ${code}, reason: ${reason?.toString() || "none"})`,
        );
        this.connected = false;

        // Attempt reconnection if not intentionally closed
        if (!this.closed) {
          void this.attemptReconnect();
        }
      });

      const timeoutHandle = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          reject(new Error("Realtime STT connection timeout"));
        }
      }, OpenAIRealtimeSTTSession.WEBSOCKET_TIMEOUT_MS);

      this.ws.once("open", () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.closed) {
      return;
    }

    if (
      this.reconnectAttempts >=
      OpenAIRealtimeSTTSession.MAX_RECONNECT_ATTEMPTS
    ) {
      const err = new Error(
        `Max reconnect attempts (${OpenAIRealtimeSTTSession.MAX_RECONNECT_ATTEMPTS}) reached`,
      );
      console.error(`[RealtimeSTT:${this.sessionId}] ${err.message}`);
      this.onErrorCallback?.(err);
      return;
    }

    this.reconnectAttempts++;
    const delay =
      OpenAIRealtimeSTTSession.RECONNECT_DELAY_MS *
      2 ** (this.reconnectAttempts - 1);
    console.log(
      `[RealtimeSTT:${this.sessionId}] Reconnecting ${this.reconnectAttempts}/${OpenAIRealtimeSTTSession.MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.closed) {
      return;
    }

    try {
      await this.doConnect();
      console.log(
        `[RealtimeSTT:${this.sessionId}] Reconnected successfully`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[RealtimeSTT:${this.sessionId}] Reconnect failed:`, err);
      this.onErrorCallback?.(err);
    }
  }

  private handleEvent(event: {
    type: string;
    delta?: string;
    transcript?: string;
    error?: unknown;
  }): void {
    switch (event.type) {
      case "transcription_session.created":
      case "transcription_session.updated":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
        console.log(`[RealtimeSTT:${this.sessionId}] ${event.type}`);
        break;

      case "conversation.item.input_audio_transcription.delta":
        if (event.delta) {
          this.pendingTranscript += event.delta;
          this.onPartialCallback?.(this.pendingTranscript);
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          console.log(
            `[RealtimeSTT:${this.sessionId}] Transcript: ${event.transcript}`,
          );
          this.onTranscriptCallback?.(event.transcript);
        }
        this.pendingTranscript = "";
        break;

      case "input_audio_buffer.speech_started":
        console.log(`[RealtimeSTT:${this.sessionId}] Speech started`);
        this.pendingTranscript = "";
        break;

      case "error":
        console.error(
          `[RealtimeSTT:${this.sessionId}] Error:`,
          event.error,
        );
        const err = new Error(
          `OpenAI Realtime error: ${JSON.stringify(event.error)}`,
        );
        this.onErrorCallback?.(err);
        break;
    }
  }

  private sendEvent(event: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  sendAudio(muLawData: Buffer): void {
    if (!this.connected) return;
    this.sendEvent({
      type: "input_audio_buffer.append",
      audio: muLawData.toString("base64"),
    });
  }

  onPartial(callback: (partial: string) => void): void {
    this.onPartialCallback = callback;
  }

  onTranscript(callback: (transcript: string) => void): void {
    this.onTranscriptCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  async waitForTranscript(timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.onTranscriptCallback = null;
        reject(new Error("Transcript timeout"));
      }, timeoutMs);

      this.onTranscriptCallback = (transcript) => {
        clearTimeout(timeout);
        this.onTranscriptCallback = null;
        resolve(transcript);
      };
    });
  }

  close(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
