/**
 * Shared test utilities for voice provider integration tests
 */

import os from "node:os";
import path from "node:path";

import type { NormalizedEvent } from "../types.js";

/**
 * Create a temporary directory for test files
 */
export function createTempDir(): string {
  return path.join(os.tmpdir(), `voice-test-${Date.now()}-${Math.random()}`);
}

/**
 * Generate a mock E.164 phone number
 */
export function generatePhone(suffix: number = 0): string {
  return `+1555000${String(suffix).padStart(4, "0")}`;
}

/**
 * Create a mock call answered event
 */
export function createCallAnsweredEvent(
  callId: string,
  providerCallId: string,
  delay = 0,
): NormalizedEvent {
  return {
    id: `evt-answered-${Date.now()}`,
    type: "call.answered",
    callId,
    providerCallId,
    timestamp: Date.now() + delay,
  };
}

/**
 * Create a mock call speaking event
 */
export function createCallSpeakingEvent(
  callId: string,
  text: string,
): NormalizedEvent {
  return {
    id: `evt-speaking-${Date.now()}`,
    type: "call.speaking",
    callId,
    text,
    timestamp: Date.now(),
  };
}

/**
 * Create a mock call speech event (STT result)
 */
export function createCallSpeechEvent(
  callId: string,
  transcript: string,
  isFinal = true,
  confidence = 0.95,
): NormalizedEvent {
  return {
    id: `evt-speech-${Date.now()}`,
    type: "call.speech",
    callId,
    transcript,
    isFinal,
    confidence,
    timestamp: Date.now(),
  };
}

/**
 * Create a mock call ended event
 */
export function createCallEndedEvent(
  callId: string,
  reason: "completed" | "hangup-user" | "hangup-bot" | "error",
): NormalizedEvent {
  return {
    id: `evt-ended-${Date.now()}`,
    type: "call.ended",
    callId,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Create a mock call error event
 */
export function createCallErrorEvent(
  callId: string,
  error: string,
  retryable = true,
): NormalizedEvent {
  return {
    id: `evt-error-${Date.now()}`,
    type: "call.error",
    callId,
    error,
    retryable,
    timestamp: Date.now(),
  };
}

/**
 * Create a sequence of call lifecycle events
 */
export function createCallLifecycle(
  callId: string,
  providerCallId: string,
): NormalizedEvent[] {
  return [
    {
      id: "evt-1",
      type: "call.initiated",
      callId,
      providerCallId,
      timestamp: Date.now(),
    },
    {
      id: "evt-2",
      type: "call.ringing",
      callId,
      providerCallId,
      timestamp: Date.now() + 100,
    },
    createCallAnsweredEvent(callId, providerCallId, 1000),
    {
      id: "evt-4",
      type: "call.active",
      callId,
      providerCallId,
      timestamp: Date.now() + 2000,
    },
    createCallEndedEvent(callId, "completed"),
  ];
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Simulate delay for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a function throws with a specific message
 */
export function assertThrows(fn: () => void, pattern: string | RegExp): void {
  try {
    fn();
    throw new Error(`Expected function to throw matching "${pattern}"`);
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;
      const matches =
        typeof pattern === "string"
          ? message.includes(pattern)
          : pattern.test(message);

      if (!matches) {
        throw new Error(`Expected error to match "${pattern}", got: ${message}`);
      }
    } else {
      throw error;
    }
  }
}

/**
 * Assert that a function does not throw
 */
export function assertNoThrow(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    throw new Error(
      `Expected function not to throw, but got: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Create a mock webhook context for testing
 */
export function createWebhookContext(overrides?: Record<string, any>) {
  return {
    headers: { "x-signature": "test" },
    rawBody: "test-body",
    url: "https://example.com/webhook",
    method: "POST" as const,
    ...overrides,
  };
}

/**
 * Collect event logs during test
 */
export class EventLogger {
  private events: Array<{ timestamp: number; type: string; data: any }> = [];

  log(type: string, data: any = {}): void {
    this.events.push({
      timestamp: Date.now(),
      type,
      data,
    });
  }

  getEvents(): Array<{ timestamp: number; type: string; data: any }> {
    return [...this.events];
  }

  getEventsByType(type: string): any[] {
    return this.events.filter((e) => e.type === type).map((e) => e.data);
  }

  clear(): void {
    this.events = [];
  }

  count(type?: string): number {
    if (!type) return this.events.length;
    return this.events.filter((e) => e.type === type).length;
  }
}

/**
 * Performance tracker for tests
 */
export class PerformanceTracker {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number[]> = new Map();

  start(label: string): void {
    this.marks.set(label, Date.now());
  }

  end(label: string): number {
    const start = this.marks.get(label);
    if (!start) {
      throw new Error(`No start mark for "${label}"`);
    }

    const duration = Date.now() - start;
    const measurements = this.measures.get(label) || [];
    measurements.push(duration);
    this.measures.set(label, measurements);

    this.marks.delete(label);
    return duration;
  }

  getAverage(label: string): number {
    const measurements = this.measures.get(label) || [];
    if (measurements.length === 0) return 0;
    return measurements.reduce((a, b) => a + b, 0) / measurements.length;
  }

  getMax(label: string): number {
    const measurements = this.measures.get(label) || [];
    return Math.max(...measurements, 0);
  }

  getMin(label: string): number {
    const measurements = this.measures.get(label) || [];
    return Math.min(...measurements, Infinity);
  }

  getCount(label: string): number {
    return (this.measures.get(label) || []).length;
  }

  report(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [label, measurements] of this.measures) {
      report[label] = {
        count: measurements.length,
        average: this.getAverage(label),
        min: this.getMin(label),
        max: this.getMax(label),
      };
    }

    return report;
  }

  clear(): void {
    this.marks.clear();
    this.measures.clear();
  }
}
