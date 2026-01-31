export type KakaoProbeResult = {
  ok: boolean;
  error?: string;
  elapsedMs: number;
};

/**
 * Probe Kakao channel health.
 *
 * Kakao i Open Builder doesn't expose a "getMe" endpoint like Telegram/Zalo.
 * We validate that the REST API key is present and non-empty.
 * A deeper probe could hit the Kakao user API, but that requires an access token
 * rather than the REST API key alone.
 */
export function probeKakao(apiKey: string): KakaoProbeResult {
  const start = Date.now();
  if (!apiKey?.trim()) {
    return { ok: false, error: "No API key provided", elapsedMs: 0 };
  }
  return { ok: true, elapsedMs: Date.now() - start };
}
