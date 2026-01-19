import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempHome } from "../../test/helpers/temp-home.js";
import { CODEX_CLI_PROFILE_ID, ensureAuthProfileStore } from "./auth-profiles.js";

describe("external CLI credential sync", () => {
  it("skips codex-cli sync when credentials already exist in another openai-codex profile", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdbot-codex-dedup-skip-"));
    try {
      await withTempHome(
        async (tempHome) => {
          // Set up Codex CLI credentials with shared tokens
          const codexDir = path.join(tempHome, ".codex");
          fs.mkdirSync(codexDir, { recursive: true });
          const codexAuthPath = path.join(codexDir, "auth.json");
          fs.writeFileSync(
            codexAuthPath,
            JSON.stringify({
              tokens: {
                access_token: "shared-access-token",
                refresh_token: "shared-refresh-token",
              },
            }),
          );
          fs.utimesSync(codexAuthPath, new Date(), new Date());

          // Set up auth-profiles.json with an existing profile using the SAME tokens
          const authPath = path.join(agentDir, "auth-profiles.json");
          fs.writeFileSync(
            authPath,
            JSON.stringify({
              version: 1,
              profiles: {
                "openai-codex:my-custom-profile": {
                  type: "oauth",
                  provider: "openai-codex",
                  access: "shared-access-token",
                  refresh: "shared-refresh-token",
                  expires: Date.now() + 3600000, // 1 hour from now
                },
              },
            }),
          );

          // Call ensureAuthProfileStore - should NOT create codex-cli profile
          const store = ensureAuthProfileStore(agentDir);

          // codex-cli profile should NOT exist because tokens match existing profile
          expect(store.profiles[CODEX_CLI_PROFILE_ID]).toBeUndefined();
          // The custom profile should still be there
          expect(store.profiles["openai-codex:my-custom-profile"]).toBeDefined();
        },
        { prefix: "clawdbot-home-" },
      );
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("creates codex-cli profile when credentials differ from existing openai-codex profiles", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdbot-codex-dedup-create-"));
    try {
      await withTempHome(
        async (tempHome) => {
          // Set up Codex CLI credentials with unique tokens
          const codexDir = path.join(tempHome, ".codex");
          fs.mkdirSync(codexDir, { recursive: true });
          const codexAuthPath = path.join(codexDir, "auth.json");
          fs.writeFileSync(
            codexAuthPath,
            JSON.stringify({
              tokens: {
                access_token: "unique-access-token",
                refresh_token: "unique-refresh-token",
              },
            }),
          );
          fs.utimesSync(codexAuthPath, new Date(), new Date());

          // Set up auth-profiles.json with an existing profile using DIFFERENT tokens
          const authPath = path.join(agentDir, "auth-profiles.json");
          fs.writeFileSync(
            authPath,
            JSON.stringify({
              version: 1,
              profiles: {
                "openai-codex:my-custom-profile": {
                  type: "oauth",
                  provider: "openai-codex",
                  access: "different-access-token",
                  refresh: "different-refresh-token",
                  expires: Date.now() + 3600000, // 1 hour from now
                },
              },
            }),
          );

          // Call ensureAuthProfileStore - SHOULD create codex-cli profile
          const store = ensureAuthProfileStore(agentDir);

          // codex-cli profile SHOULD exist because tokens are different
          expect(store.profiles[CODEX_CLI_PROFILE_ID]).toBeDefined();
          expect((store.profiles[CODEX_CLI_PROFILE_ID] as { access: string }).access).toBe(
            "unique-access-token",
          );
          // The custom profile should still be there
          expect(store.profiles["openai-codex:my-custom-profile"]).toBeDefined();
        },
        { prefix: "clawdbot-home-" },
      );
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
