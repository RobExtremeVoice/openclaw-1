import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock playwright-core to avoid real browser connections
const mockChromium = {
  connectOverCDP: vi.fn(),
};

vi.mock("playwright-core", () => ({
  chromium: mockChromium,
}));

// Mock chrome.js to avoid WebSocket URL lookups
vi.mock("./chrome.js", () => ({
  getChromeWebSocketUrl: vi.fn().mockRejectedValue(new Error("Not available in tests")),
}));

// Mock pw-session to avoid connection retries
vi.mock("./pw-session.js", async () => {
  const actual = await vi.importActual<any>("./pw-session.js");
  return {
    ...actual,
    ensurePlaywrightConnection: vi.fn(async (cdpUrl) => {
      // Return a mock connection that will resolve immediately
      const browser = {};
      return { browser, cdpUrl };
    }),
  };
});

type FakeSession = {
  send: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
};

function createPage(opts: { targetId: string; snapshotFull?: string; hasSnapshotForAI?: boolean }) {
  const session: FakeSession = {
    send: vi.fn().mockResolvedValue({
      targetInfo: { targetId: opts.targetId },
    }),
    detach: vi.fn().mockResolvedValue(undefined),
  };

  const context = {
    newCDPSession: vi.fn().mockResolvedValue(session),
  };

  const click = vi.fn().mockResolvedValue(undefined);
  const dblclick = vi.fn().mockResolvedValue(undefined);
  const fill = vi.fn().mockResolvedValue(undefined);
  const locator = vi.fn().mockReturnValue({ click, dblclick, fill });

  const page = {
    context: () => context,
    locator,
    on: vi.fn(),
    ...(opts.hasSnapshotForAI === false
      ? {}
      : {
          _snapshotForAI: vi.fn().mockResolvedValue({ full: opts.snapshotFull ?? "SNAP" }),
        }),
  };

  return { page, session, locator, click, fill };
}

function createBrowser(pages: unknown[]) {
  const ctx = {
    pages: () => pages,
    on: vi.fn(),
  };
  return {
    contexts: () => [ctx],
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function importModule() {
  return await import("./pw-ai.js");
}

beforeEach(() => {
  mockChromium.connectOverCDP.mockClear();
});

afterEach(async () => {
  const mod = await importModule();
  await mod.closePlaywrightBrowserConnection();
  vi.clearAllMocks();
});

describe("pw-ai", () => {
  it("captures an ai snapshot via Playwright for a specific target", async () => {
    const p1 = createPage({ targetId: "T1", snapshotFull: "ONE" });
    const p2 = createPage({ targetId: "T2", snapshotFull: "TWO" });
    const browser = createBrowser([p1.page, p2.page]);

    mockChromium.connectOverCDP.mockResolvedValue(browser);

    const mod = await importModule();
    const res = await mod.snapshotAiViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T2",
    });

    expect(res.snapshot).toBe("TWO");
    expect(p1.session.detach).toHaveBeenCalledTimes(1);
    expect(p2.session.detach).toHaveBeenCalledTimes(1);
  });

  it("truncates oversized snapshots", async () => {
    const longSnapshot = "A".repeat(20);
    const p1 = createPage({ targetId: "T1", snapshotFull: longSnapshot });
    const browser = createBrowser([p1.page]);

    mockChromium.connectOverCDP.mockResolvedValue(browser);

    const mod = await importModule();
    const res = await mod.snapshotAiViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      maxChars: 10,
    });

    expect(res.truncated).toBe(true);
    expect(res.snapshot.startsWith("AAAAAAAAAA")).toBe(true);
    expect(res.snapshot).toContain("TRUNCATED");
  });

  it("clicks a ref using aria-ref locator", async () => {
    const p1 = createPage({ targetId: "T1" });
    const browser = createBrowser([p1.page]);
    mockChromium.connectOverCDP.mockResolvedValue(browser);

    const mod = await importModule();
    await mod.clickViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      ref: "76",
    });

    expect(p1.locator).toHaveBeenCalledWith("aria-ref=76");
    expect(p1.click).toHaveBeenCalledTimes(1);
  });

  it("fails with a clear error when _snapshotForAI is missing", async () => {
    const p1 = createPage({ targetId: "T1", hasSnapshotForAI: false });
    const browser = createBrowser([p1.page]);
    mockChromium.connectOverCDP.mockResolvedValue(browser);

    const mod = await importModule();
    await expect(
      mod.snapshotAiViaPlaywright({
        cdpUrl: "http://127.0.0.1:18792",
        targetId: "T1",
      }),
    ).rejects.toThrow(/_snapshotForAI/i);
  });

  it("reuses the CDP connection for repeated calls", async () => {
    const p1 = createPage({ targetId: "T1", snapshotFull: "ONE" });
    const browser = createBrowser([p1.page]);
    mockChromium.connectOverCDP.mockResolvedValue(browser);

    const mod = await importModule();
    await mod.snapshotAiViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
    });
    await mod.clickViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "T1",
      ref: "1",
    });

    expect(mockChromium.connectOverCDP).toHaveBeenCalledTimes(1);
  });
});
