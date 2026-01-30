# Summary for Claude — Cursor CLI integration (OpenClaw)

Context and essential info for another agent to carry on.

## What was done

OpenClaw now has a **cursor-cli** backend: the Cursor Agent CLI is used like `claude-cli`, with auth via **OAuth** (`cursor agent login`), not the Cursor Background Agents API key.

- **Two Cursor integrations exist:**
  1. **cursor-agent** (extension) — Background Agents API, API key from dashboard, remote runs.
  2. **cursor-cli** (core) — CLI backend, OAuth via `cursor agent login`, local runs.

## Key files

| Area | Path |
|------|------|
| CLI backend config | `src/agents/cli-backends.ts` — `DEFAULT_CURSOR_BACKEND`, `cursor-cli` in `resolveCliBackendIds` / `resolveCliBackendConfig` |
| Credentials (keychain) | `src/agents/cli-credentials.ts` — `readCursorCliCredentials()`, `readCursorCliCredentialsCached()`, `CursorCliCredential`; reads macOS Keychain `cursor-access-token` / `cursor-refresh-token` |
| Model selection | `src/agents/model-selection.ts` — `cursor-cli` in `isCliProvider()` |
| Runner | `src/agents/cli-runner.ts` — generic; cursor-cli uses same path. `src/agents/cursor-cli-runner.ts` — `runCursorCliAgent()` wrapper |
| Auth profile ID | `src/agents/auth-profiles/constants.ts` — `CURSOR_CLI_PROFILE_ID = "cursor:cursor-cli"` |
| Agent command `--model` | `src/cli/program/register.agent.ts` — `--model <provider/model>`; `src/commands/agent-via-gateway.ts` — `model` in opts and gateway params; `src/gateway/protocol/schema/agent.ts` — `model` in `AgentParamsSchema`; `src/gateway/server-methods/agent.ts` — passes `model` to `agentCommand`; `src/commands/agent/types.ts` — `model?: string` in `AgentCommandOpts`; `src/commands/agent.ts` — parses `opts.model` and uses it for this run (over session/config) |
| Models status (auth) | `src/commands/models/list.types.ts` — `effective.kind` includes `"cli"`, `cliAuth?: boolean`; `src/commands/models/list.auth-overview.ts` — for `cursor-cli` calls `readCursorCliCredentials()`, sets `effective: { kind: "cli", detail: "cursor agent login (keychain)" }` and `cliAuth: true`; `src/commands/models/list.status-command.ts` — filter keeps entries with `cliAuth`, Missing auth hint for cursor-cli: `Run \`cursor agent login\`` |

## How it works

- **Auth:** User runs `cursor agent login` (OAuth). Cursor stores tokens in macOS Keychain (`cursor-access-token`, `cursor-refresh-token`, account `cursor-user`). OpenClaw does **not** store cursor tokens; it only reads them via `readCursorCliCredentials()` (darwin only).
- **Execution:** OpenClaw runs `cursor agent --print --output-format stream-json [--model <model>] [--workspace <path>]` with the user message. Same pattern as claude-cli (serialized runs, JSONL parsing).
- **Default backend:** In `cli-backends.ts`, `DEFAULT_CURSOR_BACKEND` uses `command: "cursor"`, `args: ["agent", "--print", "--output-format", "stream-json"]`, `output: "jsonl"`, `modelArg: "--model"`, `modelAliases` for opus/sonnet/gpt/codex/gemini, etc.

## Config (user)

- **Path:** `~/.openclaw/openclaw.json`
- **Relevant block (already added):**
  - `agents.defaults.model`: `{ "primary": "cursor-cli/auto", "fallbacks": ["anthropic/claude-sonnet-4-5"] }`
  - `agents.defaults.cliBackends.cursor-cli`: command/args/output/input/modelArg/serialize (optional override of defaults in code).

## Usage

```bash
# One-time auth (Cursor CLI OAuth)
cursor agent login

# Use default model (cursor-cli if configured as primary)
openclaw agent --message "Hello" --agent main

# Explicit model for this run
openclaw agent --message "Hello" --model cursor-cli/auto
openclaw agent --message "Hello" --model cursor-cli/opus-4.5
openclaw agent --message "Hello" --model anthropic/claude-sonnet-4-5

# Check auth / models
openclaw models
# When cursor-cli has keychain creds: shows cursor-cli in Auth overview as "cli: cursor agent login (keychain)" and not under "Missing auth".
# When not logged in: cursor-cli under Missing auth with hint "Run `cursor agent login` to authenticate with Cursor CLI."
```

## Current state

- **Working:** cursor-cli backend registration, keychain credential reading, `--model` on `openclaw agent`, gateway passing `model`, models status treating cursor-cli as authenticated when keychain has tokens and showing the right missing-auth hint.
- **Not done:** No automated tests for cursor-cli in this session. E2E would require `cursor` on PATH and (optionally) mock or real login.
- **Platform:** Cursor keychain auth is macOS-only in code (`platform === "darwin"` in `readCursorCliCredentials`); other platforms would need another auth story (e.g. env or file) if desired.

## Repo / env

- **Repo:** OpenClaw (openclaw/openclaw). Guidelines in `CLAUDE.md` / `AGENTS.md`.
- **Build/test:** `pnpm build`, `pnpm test`, `pnpm lint`. Prefer Bun for running TS.
- **Config path:** `~/.openclaw/openclaw.json`; agent dir e.g. `~/.openclaw/agents/main/agent`.

## Extension vs core

- **Extension** `extensions/cursor-agent`: Background Agents API (API key, dashboard), webhooks, remote runs. Config under `channels.cursorAgent`.
- **Core** cursor-cli: CLI backend (OAuth via `cursor agent login`), local `cursor` process. Config under `agents.defaults.cliBackends.cursor-cli` and `agents.defaults.model.primary`.

Use this doc to continue work on cursor-cli, models status, or related agent/CLI behavior.
