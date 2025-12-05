import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

/**
 * Prompt for phone number input.
 */
export async function promptPhone(
  _runtime: RuntimeEnv = defaultRuntime,
): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const phone = await rl.question(
      "📱 Enter your phone number (with country code, e.g., +1234567890): ",
    );
    return phone.trim();
  } finally {
    rl.close();
  }
}

/**
 * Prompt for SMS verification code.
 */
export async function promptSMSCode(
  _runtime: RuntimeEnv = defaultRuntime,
): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const code = await rl.question(
      "🔐 Enter the verification code from Telegram: ",
    );
    return code.trim();
  } finally {
    rl.close();
  }
}

/**
 * Prompt for 2FA password if enabled.
 */
export async function prompt2FA(
  _runtime: RuntimeEnv = defaultRuntime,
): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const password = await rl.question(
      "🔑 Enter your 2FA password (or leave empty if not enabled): ",
    );
    return password.trim();
  } finally {
    rl.close();
  }
}
