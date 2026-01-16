import { describe, expect, it } from "vitest";

import { ClawdbotSchema } from "./zod-schema.js";

describe("tools.message config", () => {
  it("accepts allowCrossContextSend", () => {
    const parsed = ClawdbotSchema.safeParse({
      tools: {
        message: {
          allowCrossContextSend: true,
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tools?.message?.allowCrossContextSend).toBe(true);
  });
});
