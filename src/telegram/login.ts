import { Api } from "telegram";
import type { StringSession } from "telegram/sessions/index.js";
import { danger, info, success } from "../globals.js";
import { logInfo } from "../logger.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { createTelegramClient } from "./client.js";
import { prompt2FA, promptPhone, promptSMSCode } from "./prompts.js";
import { clearSession, loadSession, saveSession } from "./session.js";

/**
 * Interactive login flow for Telegram.
 * Prompts for phone, SMS code, and optionally 2FA password.
 */
export async function loginTelegram(
  verbose: boolean,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  runtime.log(info("🔐 Telegram Login"));
  runtime.log(
    info("This will connect your personal Telegram account to warelay."),
  );

  const session = await loadSession();
  const client = await createTelegramClient(session, verbose, runtime);

  try {
    await client.start({
      phoneNumber: async () => await promptPhone(runtime),
      phoneCode: async () => await promptSMSCode(runtime),
      password: async () => await prompt2FA(runtime),
      onError: (err) => {
        runtime.error(danger(`Login error: ${String(err)}`));
      },
    });

    if (!client.connected) {
      throw new Error("Failed to connect to Telegram");
    }

    // Get user info for confirmation
    const me = await client.getMe();
    const username =
      "username" in me && typeof me.username === "string" ? me.username : null;
    const displayName =
      "firstName" in me && typeof me.firstName === "string"
        ? me.firstName
        : "Unknown";

    // Save session to disk
    await saveSession(client.session as StringSession);

    runtime.log(
      success(
        `✅ Logged in as: ${displayName}${username ? ` (@${username})` : ""}`,
      ),
    );
    runtime.log(info("Session saved to ~/.clawdis/telegram/session/"));

    logInfo("Telegram login successful", runtime);
  } catch (err) {
    runtime.error(danger(`Login failed: ${String(err)}`));
    runtime.exit(1);
  } finally {
    await client.disconnect();
  }
}

/**
 * Logout from Telegram and clear session.
 */
export async function logoutTelegram(
  verbose: boolean,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const session = await loadSession();
  if (!session) {
    runtime.log(info("No Telegram session found."));
    return;
  }

  const client = await createTelegramClient(session, verbose, runtime);

  try {
    await client.connect();
    await client.invoke(new Api.auth.LogOut());
    await clearSession();
    runtime.log(success("✅ Logged out from Telegram"));
  } catch (err) {
    runtime.error(danger(`Logout failed: ${String(err)}`));
    runtime.exit(1);
  } finally {
    await client.disconnect();
  }
}
