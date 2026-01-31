import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  promptAccountId,
} from "openclaw/plugin-sdk";

import {
  listKakaoAccountIds,
  resolveDefaultKakaoAccountId,
  resolveKakaoAccount,
} from "./accounts.js";

const channel = "kakao" as const;

function setKakaoDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
) {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.kakao?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      kakao: {
        ...cfg.channels?.kakao,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  } as OpenClawConfig;
}

async function noteKakaoApiKeyHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Open Kakao Developers: https://developers.kakao.com",
      "2) Create an app and go to App Keys",
      "3) Copy the REST API Key",
      "4) Set up a Kakao Talk Channel and link it to your app",
      "5) Enable Kakao i Open Builder chatbot for your channel",
      "Tip: you can also set KAKAO_REST_API_KEY in your env.",
      "Docs: https://docs.openclaw.ai/channels/kakao",
    ].join("\n"),
    "Kakao REST API Key",
  );
}

async function promptKakaoAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveKakaoAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const entry = await prompter.text({
    message: "Kakao allowFrom (plusfriend user key)",
    placeholder: "abcdef123456",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "Required";
      return undefined;
    },
  });
  const normalized = String(entry).trim();
  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
    normalized,
  ];
  const unique = [...new Set(merged)];

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        kakao: {
          ...cfg.channels?.kakao,
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    } as OpenClawConfig;
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      kakao: {
        ...cfg.channels?.kakao,
        enabled: true,
        accounts: {
          ...cfg.channels?.kakao?.accounts,
          [accountId]: {
            ...cfg.channels?.kakao?.accounts?.[accountId],
            enabled: cfg.channels?.kakao?.accounts?.[accountId]?.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  } as OpenClawConfig;
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Kakao",
  channel,
  policyKey: "channels.kakao.dmPolicy",
  allowFromKey: "channels.kakao.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.kakao?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setKakaoDmPolicy(cfg as OpenClawConfig, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID
        : resolveDefaultKakaoAccountId(cfg as OpenClawConfig);
    return promptKakaoAllowFrom({
      cfg: cfg as OpenClawConfig,
      prompter,
      accountId: id,
    });
  },
};

export const kakaoOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listKakaoAccountIds(cfg as OpenClawConfig).some((accountId) =>
      Boolean(resolveKakaoAccount({ cfg: cfg as OpenClawConfig, accountId }).token),
    );
    return {
      channel,
      configured,
      statusLines: [`Kakao: ${configured ? "configured" : "needs API key"}`],
      selectionHint: configured
        ? "recommended · configured"
        : "recommended · newcomer-friendly",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const kakaoOverride = accountOverrides.kakao?.trim();
    const defaultKakaoAccountId = resolveDefaultKakaoAccountId(cfg as OpenClawConfig);
    let kakaoAccountId = kakaoOverride
      ? normalizeAccountId(kakaoOverride)
      : defaultKakaoAccountId;
    if (shouldPromptAccountIds && !kakaoOverride) {
      kakaoAccountId = await promptAccountId({
        cfg: cfg as OpenClawConfig,
        prompter,
        label: "Kakao",
        currentId: kakaoAccountId,
        listAccountIds: listKakaoAccountIds,
        defaultAccountId: defaultKakaoAccountId,
      });
    }

    let next = cfg as OpenClawConfig;
    const resolvedAccount = resolveKakaoAccount({ cfg: next, accountId: kakaoAccountId });
    const accountConfigured = Boolean(resolvedAccount.token);
    const allowEnv = kakaoAccountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv = allowEnv && Boolean(process.env.KAKAO_REST_API_KEY?.trim());
    const hasConfigToken = Boolean(
      resolvedAccount.config.apiKey || resolvedAccount.config.tokenFile,
    );

    let apiKey: string | null = null;
    if (!accountConfigured) {
      await noteKakaoApiKeyHelp(prompter);
    }
    if (canUseEnv && !resolvedAccount.config.apiKey) {
      const keepEnv = await prompter.confirm({
        message: "KAKAO_REST_API_KEY detected. Use env var?",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            kakao: {
              ...next.channels?.kakao,
              enabled: true,
            },
          },
        } as OpenClawConfig;
      } else {
        apiKey = String(
          await prompter.text({
            message: "Enter Kakao REST API Key",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else if (hasConfigToken) {
      const keep = await prompter.confirm({
        message: "Kakao API key already configured. Keep it?",
        initialValue: true,
      });
      if (!keep) {
        apiKey = String(
          await prompter.text({
            message: "Enter Kakao REST API Key",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else {
      apiKey = String(
        await prompter.text({
          message: "Enter Kakao REST API Key",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (apiKey) {
      if (kakaoAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            kakao: {
              ...next.channels?.kakao,
              enabled: true,
              apiKey,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            kakao: {
              ...next.channels?.kakao,
              enabled: true,
              accounts: {
                ...next.channels?.kakao?.accounts,
                [kakaoAccountId]: {
                  ...next.channels?.kakao?.accounts?.[kakaoAccountId],
                  enabled: true,
                  apiKey,
                },
              },
            },
          },
        } as OpenClawConfig;
      }
    }

    // Webhook path configuration
    const webhookPath = String(
      await prompter.text({
        message: "Webhook path (for the gateway HTTP server)",
        initialValue: "/kakao-webhook",
      }),
    ).trim();
    if (webhookPath && webhookPath !== "/kakao-webhook") {
      if (kakaoAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            kakao: {
              ...next.channels?.kakao,
              webhookPath,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            kakao: {
              ...next.channels?.kakao,
              accounts: {
                ...next.channels?.kakao?.accounts,
                [kakaoAccountId]: {
                  ...next.channels?.kakao?.accounts?.[kakaoAccountId],
                  webhookPath,
                },
              },
            },
          },
        } as OpenClawConfig;
      }
    }

    if (forceAllowFrom) {
      next = await promptKakaoAllowFrom({
        cfg: next,
        prompter,
        accountId: kakaoAccountId,
      });
    }

    return { cfg: next, accountId: kakaoAccountId };
  },
};
