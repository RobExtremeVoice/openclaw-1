/**
 * Mock providers for testing voice system integration
 */

import type {
  HangupCallInput,
  InitiateCallInput,
  InitiateCallResult,
  NormalizedEvent,
  PlayTtsInput,
  ProviderWebhookParseResult,
  StartListeningInput,
  StopListeningInput,
  WebhookContext,
  WebhookVerificationResult,
} from "../../types.js";
import type { VoiceCallProvider } from "../../providers/base.js";

export class MockVoiceProvider implements VoiceCallProvider {
  readonly name: "mock" = "mock";

  // Track all calls for assertions
  initiateCallCalls: InitiateCallInput[] = [];
  hangupCallCalls: HangupCallInput[] = [];
  playTtsCalls: PlayTtsInput[] = [];
  startListeningCalls: StartListeningInput[] = [];
  stopListeningCalls: StopListeningInput[] = [];
  webhookVerifyCalls: WebhookContext[] = [];

  // Configure mock behavior
  webhookVerificationResult: WebhookVerificationResult = { ok: true };
  webhookEvents: NormalizedEvent[] = [];
  shouldFailInitiate = false;
  failureReason = "Mock provider error";

  verifyWebhook(ctx: WebhookContext): WebhookVerificationResult {
    this.webhookVerifyCalls.push(ctx);
    return this.webhookVerificationResult;
  }

  parseWebhookEvent(_ctx: WebhookContext): ProviderWebhookParseResult {
    return {
      events: this.webhookEvents,
      statusCode: 200,
    };
  }

  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    this.initiateCallCalls.push(input);
    if (this.shouldFailInitiate) {
      throw new Error(this.failureReason);
    }
    return {
      providerCallId: `provider-call-${Date.now()}`,
      status: "initiated",
    };
  }

  async hangupCall(input: HangupCallInput): Promise<void> {
    this.hangupCallCalls.push(input);
  }

  async playTts(input: PlayTtsInput): Promise<void> {
    this.playTtsCalls.push(input);
  }

  async startListening(input: StartListeningInput): Promise<void> {
    this.startListeningCalls.push(input);
  }

  async stopListening(input: StopListeningInput): Promise<void> {
    this.stopListeningCalls.push(input);
  }

  // Test helpers
  reset(): void {
    this.initiateCallCalls = [];
    this.hangupCallCalls = [];
    this.playTtsCalls = [];
    this.startListeningCalls = [];
    this.stopListeningCalls = [];
    this.webhookVerifyCalls = [];
    this.webhookEvents = [];
    this.shouldFailInitiate = false;
  }

  setWebhookEvents(events: NormalizedEvent[]): void {
    this.webhookEvents = events;
  }

  getCallCount(): number {
    return this.initiateCallCalls.length;
  }

  getLastInitiateCall(): InitiateCallInput | undefined {
    return this.initiateCallCalls[this.initiateCallCalls.length - 1];
  }
}
