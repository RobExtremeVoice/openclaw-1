import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEventBus, getEventBus, setEventBus, resetEventBus } from "./bus.js";
import { topicMatches } from "./types.js";
import type { EventBus, EventEnvelope } from "./types.js";

describe("topicMatches", () => {
  it("matches exact topics", () => {
    expect(topicMatches("channel.message.received", "channel.message.received")).toBe(true);
    expect(topicMatches("channel.message.received", "channel.message.sent")).toBe(false);
  });

  it("matches single segment wildcard (*)", () => {
    expect(topicMatches("channel.*.received", "channel.message.received")).toBe(true);
    expect(topicMatches("channel.*.received", "channel.status.received")).toBe(true);
    expect(topicMatches("channel.*.received", "channel.message.sent")).toBe(false);
    expect(topicMatches("*.message.received", "channel.message.received")).toBe(true);
    expect(topicMatches("channel.message.*", "channel.message.received")).toBe(true);
  });

  it("matches multi-segment wildcard (#)", () => {
    expect(topicMatches("channel.#", "channel.message.received")).toBe(true);
    expect(topicMatches("channel.#", "channel.status.changed")).toBe(true);
    expect(topicMatches("channel.#", "channel")).toBe(true);
    expect(topicMatches("#", "anything.at.all")).toBe(true);
    expect(topicMatches("agent.#", "channel.message.received")).toBe(false);
  });

  it("handles # in middle of pattern", () => {
    expect(topicMatches("channel.#.completed", "channel.message.send.completed")).toBe(true);
    expect(topicMatches("channel.#.completed", "channel.completed")).toBe(true);
    expect(topicMatches("channel.#.completed", "channel.message.failed")).toBe(false);
  });

  it("handles empty segments correctly", () => {
    expect(topicMatches("channel", "channel")).toBe(true);
    expect(topicMatches("channel", "channel.message")).toBe(false);
  });
});

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  afterEach(() => {
    bus.shutdown();
  });

  describe("basic emit and subscribe", () => {
    it("delivers events to subscribers", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "test.event", payload: { data: "hello" } });

      expect(received).toHaveLength(1);
      expect(received[0].topic).toBe("test.event");
      expect(received[0].payload).toEqual({ data: "hello" });
    });

    it("assigns sequence numbers", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "test.event", payload: 1 });
      bus.emit({ topic: "test.event", payload: 2 });
      bus.emit({ topic: "test.event", payload: 3 });

      expect(received[0].seq).toBe(1);
      expect(received[1].seq).toBe(2);
      expect(received[2].seq).toBe(3);
    });

    it("assigns timestamps", () => {
      const before = Date.now();
      const event = bus.emit({ topic: "test.event", payload: {} });
      const after = Date.now();

      expect(event.ts).toBeGreaterThanOrEqual(before);
      expect(event.ts).toBeLessThanOrEqual(after);
    });

    it("preserves correlationId and source", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", (event) => {
        received.push(event);
      });

      bus.emit({
        topic: "test.event",
        payload: {},
        correlationId: "corr-123",
        source: "test-source",
      });

      expect(received[0].correlationId).toBe("corr-123");
      expect(received[0].source).toBe("test-source");
    });
  });

  describe("pattern matching", () => {
    it("delivers to wildcard subscribers", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("channel.*.*", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "channel.message.received", payload: {} });
      bus.emit({ topic: "channel.status.changed", payload: {} });
      bus.emit({ topic: "agent.run.started", payload: {} });

      expect(received).toHaveLength(2);
    });

    it("delivers to multi-segment wildcard subscribers", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("channel.#", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "channel.message.received", payload: {} });
      bus.emit({ topic: "channel.status.changed.error", payload: {} });
      bus.emit({ topic: "agent.run.started", payload: {} });

      expect(received).toHaveLength(2);
    });
  });

  describe("subscription management", () => {
    it("unsubscribes correctly", () => {
      const received: EventEnvelope[] = [];
      const sub = bus.subscribe("test.event", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "test.event", payload: 1 });
      sub.unsubscribe();
      bus.emit({ topic: "test.event", payload: 2 });

      expect(received).toHaveLength(1);
    });

    it("once() unsubscribes after first event", () => {
      const received: EventEnvelope[] = [];
      bus.once("test.event", (event) => {
        received.push(event);
      });

      bus.emit({ topic: "test.event", payload: 1 });
      bus.emit({ topic: "test.event", payload: 2 });

      expect(received).toHaveLength(1);
    });

    it("unsubscribeAll removes all handlers for pattern", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", () => received.push({} as EventEnvelope));
      bus.subscribe("test.event", () => received.push({} as EventEnvelope));
      bus.subscribe("other.event", () => received.push({} as EventEnvelope));

      const count = bus.unsubscribeAll("test.event");

      expect(count).toBe(2);
      bus.emit({ topic: "test.event", payload: {} });
      expect(received).toHaveLength(0);
    });

    it("reports subscription count", () => {
      expect(bus.subscriptionCount()).toBe(0);

      const sub1 = bus.subscribe("test.event", () => {});
      expect(bus.subscriptionCount()).toBe(1);

      const sub2 = bus.subscribe("test.event", () => {});
      expect(bus.subscriptionCount()).toBe(2);

      sub1.unsubscribe();
      expect(bus.subscriptionCount()).toBe(1);

      sub2.unsubscribe();
      expect(bus.subscriptionCount()).toBe(0);
    });

    it("reports hasSubscribers correctly", () => {
      expect(bus.hasSubscribers("test.event")).toBe(false);

      const sub = bus.subscribe("test.event", () => {});
      expect(bus.hasSubscribers("test.event")).toBe(true);

      sub.unsubscribe();
      expect(bus.hasSubscribers("test.event")).toBe(false);
    });

    it("hasSubscribers considers wildcard patterns", () => {
      bus.subscribe("test.#", () => {});
      expect(bus.hasSubscribers("test.event")).toBe(true);
      expect(bus.hasSubscribers("test.event.deep")).toBe(true);
      expect(bus.hasSubscribers("other.event")).toBe(false);
    });
  });

  describe("filtering", () => {
    it("filters by sessionKey", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", (event) => received.push(event), {
        sessionKey: "session-1",
      });

      bus.emit({ topic: "test.event", payload: 1, sessionKey: "session-1" });
      bus.emit({ topic: "test.event", payload: 2, sessionKey: "session-2" });
      bus.emit({ topic: "test.event", payload: 3 });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toBe(1);
    });

    it("filters by source", () => {
      const received: EventEnvelope[] = [];
      bus.subscribe("test.event", (event) => received.push(event), {
        source: "agent",
      });

      bus.emit({ topic: "test.event", payload: 1, source: "agent" });
      bus.emit({ topic: "test.event", payload: 2, source: "channel" });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toBe(1);
    });
  });

  describe("priority ordering", () => {
    it("executes higher priority handlers first", () => {
      const order: number[] = [];

      bus.subscribe("test.event", () => order.push(1), { priority: 1 });
      bus.subscribe("test.event", () => order.push(10), { priority: 10 });
      bus.subscribe("test.event", () => order.push(5), { priority: 5 });

      bus.emit({ topic: "test.event", payload: {} });

      expect(order).toEqual([10, 5, 1]);
    });
  });

  describe("error handling", () => {
    it("isolates handler errors by default", () => {
      const received: EventEnvelope[] = [];

      bus.subscribe("test.event", () => {
        throw new Error("Handler error");
      });
      bus.subscribe("test.event", (event) => received.push(event));

      bus.emit({ topic: "test.event", payload: {} });

      expect(received).toHaveLength(1);
    });

    it("propagates errors when configured", () => {
      bus.subscribe(
        "test.event",
        () => {
          throw new Error("Handler error");
        },
        { propagateErrors: true },
      );

      expect(() => bus.emit({ topic: "test.event", payload: {} })).toThrow("Handler error");
    });
  });

  describe("async handlers", () => {
    it("emitAsync waits for all handlers", async () => {
      const completed: number[] = [];

      bus.subscribe("test.event", async () => {
        await new Promise((r) => setTimeout(r, 10));
        completed.push(1);
      });
      bus.subscribe("test.event", async () => {
        await new Promise((r) => setTimeout(r, 5));
        completed.push(2);
      });

      await bus.emitAsync({ topic: "test.event", payload: {} });

      expect(completed).toHaveLength(2);
    });

    it("emit does not wait for async handlers", () => {
      let completed = false;

      bus.subscribe("test.event", async () => {
        await new Promise((r) => setTimeout(r, 10));
        completed = true;
      });

      bus.emit({ topic: "test.event", payload: {} });

      expect(completed).toBe(false);
    });
  });

  describe("shutdown", () => {
    it("clears all subscriptions", () => {
      bus.subscribe("test.event", () => {});
      bus.subscribe("other.event", () => {});

      expect(bus.subscriptionCount()).toBe(2);

      bus.shutdown();

      expect(bus.subscriptionCount()).toBe(0);
    });

    it("rejects new operations after shutdown", () => {
      bus.shutdown();

      expect(() => bus.emit({ topic: "test", payload: {} })).toThrow("EventBus is shut down");
      expect(() => bus.subscribe("test", () => {})).toThrow("EventBus is shut down");
    });
  });
});

describe("singleton management", () => {
  afterEach(() => {
    resetEventBus();
  });

  it("getEventBus returns same instance", () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it("setEventBus replaces default", () => {
    const custom = createEventBus();
    setEventBus(custom);
    expect(getEventBus()).toBe(custom);
    custom.shutdown();
  });

  it("resetEventBus creates new instance", () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });
});
