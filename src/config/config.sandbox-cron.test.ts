import { describe, expect, it, vi } from "vitest";

describe("sandbox cron config", () => {
  it("accepts cron policy entries for sandbox config", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            cron: {
              visibility: "agent",
              elevated: "on",
              allowMainSessionJobs: false,
              delivery: "last-only",
            },
          },
        },
        list: [
          {
            id: "ops",
            sandbox: {
              cron: {
                visibility: "all",
                elevated: "off",
                allowMainSessionJobs: true,
                delivery: "explicit",
              },
            },
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.agents?.defaults?.sandbox?.cron?.visibility).toBe("agent");
      expect(res.config.agents?.list?.[0]?.sandbox?.cron?.visibility).toBe("all");
    }
  });

  it("rejects invalid cron policy values", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            cron: {
              visibility: "everyone",
              elevated: "nope",
              delivery: "sometimes",
            },
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });

  it("accepts full elevated gate and allowMainSessionJobs", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            cron: {
              visibility: "all",
              elevated: "full",
              allowMainSessionJobs: true,
              delivery: "explicit",
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.agents?.defaults?.sandbox?.cron?.elevated).toBe("full");
      expect(res.config.agents?.defaults?.sandbox?.cron?.allowMainSessionJobs).toBe(true);
    }
  });
});
