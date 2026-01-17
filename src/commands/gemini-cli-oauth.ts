/**
 * VPS-aware Gemini CLI OAuth flow.
 *
 * On local machines: Uses a localhost callback server on port 8085.
 * On VPS/SSH/headless: Shows URL and prompts user to paste the callback URL manually.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { OAuthCredentials } from "@mariozechner/pi-ai";

const CLIENT_ID_KEYS = ["CLAWDBOT_GEMINI_OAUTH_CLIENT_ID", "GEMINI_CLI_OAUTH_CLIENT_ID"];
const CLIENT_SECRET_KEYS = [
  "CLAWDBOT_GEMINI_OAUTH_CLIENT_SECRET",
  "GEMINI_CLI_OAUTH_CLIENT_SECRET",
];
const REDIRECT_URI = "http://localhost:8085/oauth2callback";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const TIER_FREE = "free-tier";
const TIER_LEGACY = "legacy-tier";
const TIER_STANDARD = "standard-tier";

function resolveEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function resolveOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId = resolveEnv(CLIENT_ID_KEYS);
  if (!clientId) {
    throw new Error(
      "Missing Gemini OAuth client ID. Set CLAWDBOT_GEMINI_OAUTH_CLIENT_ID (or GEMINI_CLI_OAUTH_CLIENT_ID).",
    );
  }
  const clientSecret = resolveEnv(CLIENT_SECRET_KEYS);
  return { clientId, clientSecret };
}

function isWSL(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const release = readFileSync("/proc/version", "utf8").toLowerCase();
    return release.includes("microsoft") || release.includes("wsl");
  } catch {
    return false;
  }
}

function isWSL2(): boolean {
  if (!isWSL()) return false;
  try {
    const version = readFileSync("/proc/version", "utf8").toLowerCase();
    return version.includes("wsl2") || version.includes("microsoft-standard");
  } catch {
    return false;
  }
}

export function isRemoteEnvironment(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) {
    return true;
  }

  if (process.env.REMOTE_CONTAINERS || process.env.CODESPACES) {
    return true;
  }

  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY &&
    !isWSL()
  ) {
    return true;
  }

  return false;
}

export function shouldUseManualOAuthFlow(): boolean {
  return isWSL2() || isRemoteEnvironment();
}

function generatePKCESync(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildAuthUrl(challenge: string, verifier: string): string {
  const { clientId } = resolveOAuthClientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function parseCallbackInput(
  input: string,
  expectedState: string,
): { code: string; state: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "No input provided" };
  }

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? expectedState;

    if (!code) {
      return { error: "Missing 'code' parameter in URL" };
    }
    if (!state) {
      return { error: "Missing 'state' parameter. Paste the full URL." };
    }

    return { code, state };
  } catch {
    if (!expectedState) {
      return { error: "Paste the full redirect URL, not just the code." };
    }
    return { code: trimmed, state: expectedState };
  }
}

async function waitForLocalCallback(params: {
  expectedState: string;
  timeoutMs: number;
  onProgress?: (message: string) => void;
}): Promise<{ code: string; state: string }> {
  const port = 8085;
  // Bind to localhost so IPv4/IPv6 resolution matches the browser's localhost.
  const hostname = "localhost";
  const expectedPath = "/oauth2callback";

  return new Promise<{ code: string; state: string }>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://${hostname}:${port}`);
        if (requestUrl.pathname !== expectedPath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();

        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end(`Authentication failed: ${error}`);
          finish(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Missing code or state");
          finish(new Error("Missing OAuth code or state"));
          return;
        }

        if (state !== params.expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Invalid state");
          finish(new Error("OAuth state mismatch"));
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'/></head>" +
            "<body><h2>Gemini CLI OAuth complete</h2>" +
            "<p>You can close this window and return to Clawdbot.</p></body></html>",
        );

        finish(undefined, { code, state });
      } catch (err) {
        finish(err instanceof Error ? err : new Error("OAuth callback failed"));
      }
    });

    const finish = (err?: Error, result?: { code: string; state: string }) => {
      if (timeout) clearTimeout(timeout);
      try {
        server.close();
      } catch {
        // ignore close errors
      }
      if (err) {
        reject(err);
      } else if (result) {
        resolve(result);
      }
    };

    server.once("error", (err) => {
      finish(err instanceof Error ? err : new Error("OAuth callback server error"));
    });

    server.listen(port, hostname, () => {
      params.onProgress?.(`Waiting for OAuth callback on ${REDIRECT_URI}…`);
    });

    timeout = setTimeout(() => {
      finish(new Error("OAuth callback timeout"));
    }, params.timeoutMs);
  });
}

async function exchangeCodeForTokens(code: string, verifier: string): Promise<OAuthCredentials> {
  const { clientId, clientSecret } = resolveOAuthClientConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!data.refresh_token) {
    throw new Error("No refresh token received. Please try again.");
  }

  const email = await getUserEmail(data.access_token);
  const projectId = await discoverProject(data.access_token);
  const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;

  return {
    refresh: data.refresh_token,
    access: data.access_token,
    expires: expiresAt,
    projectId,
    email,
  };
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const data = (await response.json()) as { email?: string };
      return data.email;
    }
  } catch {
    // Ignore errors, email is optional
  }
  return undefined;
}

async function discoverProject(accessToken: string): Promise<string> {
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/clawdbot",
  };

  const loadBody = {
    cloudaicompanionProject: envProject,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
      duetProject: envProject,
    },
  };

  let data: {
    currentTier?: { id?: string };
    cloudaicompanionProject?: string | { id?: string };
    allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
  } = {};

  try {
    const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers,
      body: JSON.stringify(loadBody),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      if (isVpcScAffected(errorPayload)) {
        data = { currentTier: { id: TIER_STANDARD } };
      } else {
        throw new Error(`loadCodeAssist failed: ${response.status} ${response.statusText}`);
      }
    } else {
      data = (await response.json()) as typeof data;
    }
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("loadCodeAssist failed");
  }

  if (data.currentTier) {
    const project = data.cloudaicompanionProject;
    if (typeof project === "string" && project) return project;
    if (typeof project === "object" && project?.id) return project.id;
    if (envProject) return envProject;
    throw new Error(
      "This account requires GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID to be set.",
    );
  }

  const tier = getDefaultTier(data.allowedTiers);
  const tierId = tier?.id || TIER_FREE;
  if (tierId !== TIER_FREE && !envProject) {
    throw new Error(
      "This account requires GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID to be set.",
    );
  }

  const onboardBody: Record<string, unknown> = {
    tierId,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  };
  if (tierId !== TIER_FREE && envProject) {
    onboardBody.cloudaicompanionProject = envProject;
    (onboardBody.metadata as Record<string, unknown>).duetProject = envProject;
  }

  const onboardResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
    method: "POST",
    headers,
    body: JSON.stringify(onboardBody),
  });

  if (!onboardResponse.ok) {
    throw new Error(`onboardUser failed: ${onboardResponse.status} ${onboardResponse.statusText}`);
  }

  let lro = (await onboardResponse.json()) as {
    done?: boolean;
    name?: string;
    response?: { cloudaicompanionProject?: { id?: string } };
  };

  if (!lro.done && lro.name) {
    lro = await pollOperation(lro.name, headers);
  }

  const projectId = lro.response?.cloudaicompanionProject?.id;
  if (projectId) return projectId;
  if (envProject) return envProject;

  throw new Error(
    "Could not discover or provision a Google Cloud project. Set GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID.",
  );
}

function isVpcScAffected(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const details = (error as { details?: unknown[] }).details;
  if (!Array.isArray(details)) return false;
  return details.some(
    (item) => typeof item === "object" && item && (item as { reason?: string }).reason === "SECURITY_POLICY_VIOLATED",
  );
}

function getDefaultTier(
  allowedTiers?: Array<{ id?: string; isDefault?: boolean }>,
): { id?: string } | undefined {
  if (!allowedTiers?.length) return { id: TIER_LEGACY };
  return allowedTiers.find((tier) => tier.isDefault) ?? { id: TIER_LEGACY };
}

async function pollOperation(
  operationName: string,
  headers: Record<string, string>,
): Promise<{ done?: boolean; response?: { cloudaicompanionProject?: { id?: string } } }> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal/${operationName}`, {
      headers,
    });
    if (!response.ok) continue;
    const data = (await response.json()) as {
      done?: boolean;
      response?: { cloudaicompanionProject?: { id?: string } };
    };
    if (data.done) return data;
  }
  throw new Error("Operation polling timeout");
}

async function promptInput(message: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

export async function loginGeminiCliVpsAware(
  onUrl: (url: string) => void | Promise<void>,
  onProgress?: (message: string) => void,
): Promise<OAuthCredentials | null> {
  if (shouldUseManualOAuthFlow()) {
    return loginGeminiCliManual(onUrl, onProgress);
  }

  const { verifier, challenge } = generatePKCESync();
  const authUrl = buildAuthUrl(challenge, verifier);

  await onUrl(authUrl);
  onProgress?.("Waiting for OAuth callback...");

  try {
    const { code } = await waitForLocalCallback({
      expectedState: verifier,
      timeoutMs: 5 * 60 * 1000,
      onProgress,
    });
    onProgress?.("Exchanging authorization code for tokens...");
    return await exchangeCodeForTokens(code, verifier);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("EADDRINUSE") ||
        err.message.includes("port") ||
        err.message.includes("listen"))
    ) {
      onProgress?.("Local callback server failed. Switching to manual mode...");
      return loginGeminiCliManual(onUrl, onProgress);
    }
    throw err;
  }
}

export async function loginGeminiCliManual(
  onUrl: (url: string) => void | Promise<void>,
  onProgress?: (message: string) => void,
): Promise<OAuthCredentials | null> {
  const { verifier, challenge } = generatePKCESync();
  const authUrl = buildAuthUrl(challenge, verifier);

  await onUrl(authUrl);
  onProgress?.("Waiting for you to paste the callback URL...");

  console.log("\n");
  console.log("=".repeat(60));
  console.log("VPS/Remote Mode - Manual OAuth");
  console.log("=".repeat(60));
  console.log("\n1. Open the URL above in your LOCAL browser");
  console.log("2. Complete the Google sign-in");
  console.log("3. Your browser will redirect to a localhost URL that won't load");
  console.log("4. Copy the ENTIRE URL from your browser's address bar");
  console.log("5. Paste it below\n");
  console.log("The URL will look like:");
  console.log("http://localhost:8085/oauth2callback?code=xxx&state=yyy\n");

  const callbackInput = await promptInput("Paste the redirect URL here: ");

  const parsed = parseCallbackInput(callbackInput, verifier);
  if ("error" in parsed) {
    throw new Error(parsed.error);
  }

  if (parsed.state !== verifier) {
    throw new Error("OAuth state mismatch - please try again");
  }

  onProgress?.("Exchanging authorization code for tokens...");
  return exchangeCodeForTokens(parsed.code, verifier);
}
