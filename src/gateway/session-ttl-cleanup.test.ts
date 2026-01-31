import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionTTLManager } from "./session-ttl-cleanup";

const { mockStoreResult, mockUpdateSessionStore } = vi.hoisted(() => ({
  mockStoreResult: { store: {} as Record<string, any> },
  mockUpdateSessionStore: vi.fn(),
}));

vi.mock("../config/sessions.js", () => ({
  loadCombinedSessionStoreForGateway: () => ({
    store: mockStoreResult.store,
    storePath: "mock-store.json5",
  }),
  resolveGatewaySessionStoreTarget: ({ key }: { key: string }) => ({
    storePath: "mock-store.json5",
    canonicalKey: key,
  }),
  updateSessionStore: (path: string, cb: any) => mockUpdateSessionStore(path, cb),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({}),
}));

describe("SessionTTLManager", () => {
  let manager: SessionTTLManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateSessionStore.mockClear();
    for (const key in mockStoreResult.store) delete mockStoreResult.store[key];
  });

  afterEach(() => {
    manager?.stop();
    vi.useRealTimers();
  });

  const createSession = (id: string, createdAt: number, updatedAt: number) => {
    mockStoreResult.store[id] = { createdAt, updatedAt };
  };

  describe("Basic functionality", () => {
    it("should not cleanup active sessions", async () => {
      const now = Date.now();
      createSession("session1", now - 1000, now - 500);

      manager = new SessionTTLManager({ idle: 3600 });
      await manager.cleanup();

      expect(mockUpdateSessionStore).not.toHaveBeenCalled();
    });

    it("should cleanup sessions exceeding idle time", async () => {
      const now = Date.now();
      createSession("idle-session", now - 7200000, now - 7200000);

      manager = new SessionTTLManager({ idle: 3600 });
      await manager.cleanup();

      expect(mockUpdateSessionStore).toHaveBeenCalledWith("mock-store.json5", expect.any(Function));

      const callback = mockUpdateSessionStore.mock.calls[0][1];
      const params = { "idle-session": {} };
      const result = callback(params);
      expect(result).not.toHaveProperty("idle-session");
    });

    it("should cleanup sessions exceeding max age", async () => {
      const now = Date.now();
      createSession("old-session", now - 90000000, now - 1000);

      manager = new SessionTTLManager({ idle: 3600, maxAge: 86400 });
      await manager.cleanup();

      expect(mockUpdateSessionStore).toHaveBeenCalled();
    });
  });

  describe("Exclude patterns", () => {
    it("should exclude main session", async () => {
      const now = Date.now();
      createSession("main", now - 100000000, now - 100000000);

      manager = new SessionTTLManager({ idle: 3600, exclude: ["main"] });
      await manager.cleanup();

      expect(mockUpdateSessionStore).not.toHaveBeenCalled();
    });

    it("should exclude sessions matching wildcard patterns", async () => {
      const now = Date.now();
      createSession("hook:github:reviewer:123", now - 10000000, now - 10000000);
      createSession("hook:trello:doublon:456", now - 10000000, now - 10000000);
      createSession("regular-session", now - 10000000, now - 10000000);

      manager = new SessionTTLManager({
        idle: 3600,
        exclude: ["main", "hook:*", "persistent:*"],
      });
      await manager.cleanup();

      expect(mockUpdateSessionStore).toHaveBeenCalledTimes(1);
      const callback = mockUpdateSessionStore.mock.calls[0][1];
      const result = callback({
        "hook:github:reviewer:123": {},
        "hook:trello:doublon:456": {},
        "regular-session": {},
      });

      expect(result).toHaveProperty("hook:github:reviewer:123");
      expect(result).toHaveProperty("hook:trello:doublon:456");
      expect(result).not.toHaveProperty("regular-session");
    });
  });

  describe("Automatic cleanup scheduling", () => {
    it("should run cleanup at configured interval", () => {
      manager = new SessionTTLManager({
        idle: 3600,
        cleanupInterval: 60,
      });

      const cleanupSpy = vi.spyOn(manager, "cleanup");

      manager.start();
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60000);
      expect(cleanupSpy).toHaveBeenCalledTimes(2);
    });

    it("should stop cleanup when stop() is called", () => {
      manager = new SessionTTLManager({
        idle: 3600,
        cleanupInterval: 60,
      });

      const cleanupSpy = vi.spyOn(manager, "cleanup");

      manager.start();
      manager.stop();

      vi.advanceTimersByTime(60000);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });
  });
});
