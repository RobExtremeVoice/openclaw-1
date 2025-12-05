import Twilio from "twilio";
import type { EnvConfig } from "../env.js";

export function createClient(env: EnvConfig) {
  // Twilio client using either auth token or API key/secret.
  if (!env.auth || !env.accountSid) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or TWILIO_API_KEY/TWILIO_API_SECRET) in .env",
    );
  }

  if ("authToken" in env.auth) {
    return Twilio(env.accountSid, env.auth.authToken, {
      accountSid: env.accountSid,
    });
  }
  return Twilio(env.auth.apiKey, env.auth.apiSecret, {
    accountSid: env.accountSid,
  });
}
