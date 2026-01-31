import { describe, expect, it } from "vitest";

import type { OpenClawConfig } from "openclaw/plugin-sdk";

import { kakaoPlugin } from "./channel.js";

describe("kakao directory", () => {
  it("lists peers from allowFrom", async () => {
    const cfg = {
      channels: {
        kakao: {
          allowFrom: ["kakao:abc123", "kk:def456", "ghi789"],
        },
      },
    } as unknown as OpenClawConfig;

    expect(kakaoPlugin.directory).toBeTruthy();
    expect(kakaoPlugin.directory?.listPeers).toBeTruthy();
    expect(kakaoPlugin.directory?.listGroups).toBeTruthy();

    await expect(
      kakaoPlugin.directory!.listPeers({ cfg, accountId: undefined, query: undefined, limit: undefined }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { kind: "user", id: "abc123" },
        { kind: "user", id: "def456" },
        { kind: "user", id: "ghi789" },
      ]),
    );

    await expect(kakaoPlugin.directory!.listGroups({ cfg, accountId: undefined, query: undefined, limit: undefined })).resolves.toEqual(
      [],
    );
  });
});
