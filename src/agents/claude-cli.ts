import fs from "node:fs";
import path from "node:path";

import { createSubsystemLogger } from "../logging.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { resolveUserPath } from "../utils.js";

const log = createSubsystemLogger("agents/claude-cli");

type ClaudeCliUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
};

export type ClaudeCliResult = {
  text: string;
  isError: boolean;
  usage?: ClaudeCliUsage;
  raw?: unknown;
};

type RunClaudeCliParams = {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  cwd?: string;
  timeoutMs: number;
};

function isExecutable(pathname: string): boolean {
  try {
    const stat = fs.statSync(pathname);
    if (!stat.isFile()) return false;
    fs.accessSync(pathname, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findExecutableInPath(bin: string): string | null {
  const envPath = process.env.PATH || "";
  const entries = envPath.split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    const candidate = path.join(entry, bin);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function resolveClaudeCliPath(): string | null {
  const envPath =
    process.env.CLAUDE_CLI_PATH?.trim() || process.env.CLAUDE_CLI?.trim();
  if (envPath) return envPath;

  const homeCandidate = resolveUserPath("~/claude-bin");
  if (isExecutable(homeCandidate)) return homeCandidate;

  return findExecutableInPath("claude");
}

function mapClaudeCliModel(modelId?: string): string | undefined {
  if (!modelId) return undefined;
  const normalized = modelId.trim().toLowerCase();
  if (normalized.includes("sonnet")) return "sonnet";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("haiku")) return "haiku";
  return undefined;
}

function parseClaudeCliJson(stdout: string, stderr: string): ClaudeCliResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      text: stderr.trim() || "Claude CLI returned no output.",
      isError: true,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      text: `Claude CLI output was not JSON. stdout: ${trimmed}`,
      isError: true,
    };
  }

  const resultText =
    typeof parsed?.result === "string" ? parsed.result : String(parsed?.result);
  const isError = Boolean(parsed?.is_error);
  const usageRaw = parsed?.usage ?? {};
  const usage: ClaudeCliUsage = {
    input: typeof usageRaw.input_tokens === "number" ? usageRaw.input_tokens : 0,
    output:
      typeof usageRaw.output_tokens === "number" ? usageRaw.output_tokens : 0,
    cacheRead:
      typeof usageRaw.cache_read_input_tokens === "number"
        ? usageRaw.cache_read_input_tokens
        : 0,
    cacheWrite:
      typeof usageRaw.cache_creation_input_tokens === "number"
        ? usageRaw.cache_creation_input_tokens
        : 0,
    total:
      typeof usageRaw.total_tokens === "number" ? usageRaw.total_tokens : 0,
  };

  return { text: resultText, isError, usage, raw: parsed };
}

export async function runClaudeCliPrompt(
  params: RunClaudeCliParams,
): Promise<ClaudeCliResult> {
  const cliPath = resolveClaudeCliPath();
  if (!cliPath) {
    return {
      text:
        "Claude CLI not found. Install it or set CLAUDE_CLI_PATH to the binary.",
      isError: true,
    };
  }

  const args: string[] = [
    cliPath,
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "dontAsk",
    "--tools",
    "",
  ];
  const mappedModel = mapClaudeCliModel(params.modelId);
  if (mappedModel) {
    args.push("--model", mappedModel);
  }
  const systemPrompt = params.systemPrompt?.trim();
  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }
  args.push(params.prompt);

  const started = Date.now();
  const result = await runCommandWithTimeout(args, {
    timeoutMs: params.timeoutMs,
    cwd: params.cwd,
  });
  const parsed = parseClaudeCliJson(result.stdout, result.stderr);
  log.info("claude-cli run complete", {
    durationMs: Date.now() - started,
    exitCode: result.code,
    isError: parsed.isError,
  });
  return parsed;
}
