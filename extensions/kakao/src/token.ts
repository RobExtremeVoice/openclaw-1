import { readFileSync } from "node:fs";

import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

import type { KakaoConfig } from "./types.js";

export type KakaoTokenResolution = {
  token: string;
  source: "env" | "config" | "configFile" | "none";
};

export function resolveKakaoToken(
  config: KakaoConfig | undefined,
  accountId?: string | null,
): KakaoTokenResolution {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;
  const baseConfig = config;
  const accountConfig =
    resolvedAccountId !== DEFAULT_ACCOUNT_ID
      ? (baseConfig?.accounts?.[resolvedAccountId] as KakaoConfig | undefined)
      : undefined;

  if (accountConfig) {
    const token = accountConfig.apiKey?.trim();
    if (token) return { token, source: "config" };
    const tokenFile = accountConfig.tokenFile?.trim();
    if (tokenFile) {
      try {
        const fileToken = readFileSync(tokenFile, "utf8").trim();
        if (fileToken) return { token: fileToken, source: "configFile" };
      } catch {
        // ignore read failures
      }
    }
  }

  if (isDefaultAccount) {
    const token = baseConfig?.apiKey?.trim();
    if (token) return { token, source: "config" };
    const tokenFile = baseConfig?.tokenFile?.trim();
    if (tokenFile) {
      try {
        const fileToken = readFileSync(tokenFile, "utf8").trim();
        if (fileToken) return { token: fileToken, source: "configFile" };
      } catch {
        // ignore read failures
      }
    }
    const envToken = process.env.KAKAO_REST_API_KEY?.trim();
    if (envToken) return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}
