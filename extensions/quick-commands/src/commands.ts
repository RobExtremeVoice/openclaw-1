/**
 * Quick Commands Extension
 *
 * Fast slash commands using Haiku for status queries.
 * These bypass the full conversation pipeline for speed.
 */

import type {
  OpenClawPluginApi,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk";

import { execAsync } from "./exec.js";

// Default repos to check (can be overridden via config)
const DEFAULT_REPOS = [
  "atriumn/idynic",
  "atriumn/veriumn",
  "atriumn/ovrly",
  "atriumn/celiumn",
  "atriumn/atriumn-site",
  "atriumn/clawd",
];

type QuickCommandsConfig = {
  repos?: string[];
};

export function registerQuickCommands(api: OpenClawPluginApi): void {
  const pluginConfig = (api.pluginConfig ?? {}) as QuickCommandsConfig;
  const repos = pluginConfig.repos ?? DEFAULT_REPOS;

  // /status - Session status
  api.registerCommand({
    name: "qstatus",
    description: "Quick session status (tokens, model, cost)",
    acceptsArgs: false,
    requireAuth: true,
    handler: async (ctx) => handleStatusCommand(ctx, api),
  });

  // /board - Open issues across repos
  api.registerCommand({
    name: "board",
    description: "Open issues across repos with quick actions",
    acceptsArgs: false,
    requireAuth: true,
    handler: async (ctx) => handleBoardCommand(ctx, repos),
  });

  // /prs - Open PRs with CI status
  api.registerCommand({
    name: "prs",
    description: "Open PRs with CI status",
    acceptsArgs: false,
    requireAuth: true,
    handler: async (ctx) => handlePrsCommand(ctx, repos),
  });

  // /ralph - Active Ralph dev sessions
  api.registerCommand({
    name: "qralph",
    description: "Active Ralph dev sessions with status",
    acceptsArgs: false,
    requireAuth: true,
    handler: async (ctx) => handleRalphCommand(ctx),
  });

  // /sessions - Active dev sessions
  api.registerCommand({
    name: "qsessions",
    description: "Active development sessions",
    acceptsArgs: false,
    requireAuth: true,
    handler: async (ctx) => handleSessionsCommand(ctx),
  });
}

async function handleStatusCommand(
  _ctx: PluginCommandContext,
  api: OpenClawPluginApi,
): Promise<PluginCommandResult> {
  try {
    // Get model info from config
    const primary = api.config?.agents?.defaults?.model?.primary ?? "unknown";
    const thinking = api.config?.agents?.defaults?.thinking?.mode ?? "off";

    // Try to get usage from Claude Code if available
    let usageInfo = "";
    try {
      const result = await execAsync(
        "cd ~/clawd/skills/claude-code-usage && ./scripts/claude-usage.sh --json 2>/dev/null",
        { timeout: 5000 },
      );
      if (result.stdout) {
        const usage = JSON.parse(result.stdout);
        usageInfo = `

*Session:* ${usage.session?.utilization ?? "?"}% (resets ${usage.session?.resets_in ?? "?"})
*Weekly:* ${usage.weekly?.utilization ?? "?"}% (resets ${usage.weekly?.resets_in ?? "?"})`;
      }
    } catch {
      // Claude Code usage not available
    }

    const text = `*Status*

*Model:* \`${primary}\`
*Thinking:* ${thinking}${usageInfo}`;

    return { text };
  } catch (err) {
    return { text: `Error getting status: ${String(err)}` };
  }
}

async function handleBoardCommand(
  ctx: PluginCommandContext,
  repos: string[],
): Promise<PluginCommandResult> {
  try {
    const issues: Array<{
      repo: string;
      number: number;
      title: string;
      labels: string[];
    }> = [];

    // Fetch issues from all repos in parallel
    const results = await Promise.all(
      repos.map(async (repo) => {
        try {
          const result = await execAsync(
            `gh issue list -R ${repo} --state open --limit 10 --json number,title,labels`,
            { timeout: 10000 },
          );
          if (result.stdout) {
            const repoIssues = JSON.parse(result.stdout);
            return repoIssues.map(
              (issue: { number: number; title: string; labels: Array<{ name: string }> }) => ({
                repo: repo.split("/")[1],
                number: issue.number,
                title: issue.title.slice(0, 50),
                labels: issue.labels?.map((l) => l.name) ?? [],
              }),
            );
          }
        } catch {
          // Repo might not exist or no access
        }
        return [];
      }),
    );

    for (const repoIssues of results) {
      issues.push(...repoIssues);
    }

    if (issues.length === 0) {
      return { text: "No open issues found." };
    }

    // Sort by repo, then by number descending
    issues.sort((a, b) => {
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return b.number - a.number;
    });

    // Format as markdown with inline buttons
    const lines: string[] = ["*Open Issues*\n"];
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    let currentRepo = "";
    let count = 0;
    const MAX_ISSUES = 15;

    for (const issue of issues) {
      if (count >= MAX_ISSUES) break;

      if (issue.repo !== currentRepo) {
        currentRepo = issue.repo;
        lines.push(`\n*${currentRepo}*`);
      }

      const labelStr =
        issue.labels.length > 0 ? ` [${issue.labels.slice(0, 2).join(", ")}]` : "";
      lines.push(`• #${issue.number}: ${issue.title}${labelStr}`);

      // Add button for each issue
      buttons.push([
        {
          text: `${issue.repo}#${issue.number}`,
          callback_data: `work on ${issue.repo}#${issue.number}`,
        },
      ]);
      count++;
    }

    if (issues.length > MAX_ISSUES) {
      lines.push(`\n_...and ${issues.length - MAX_ISSUES} more_`);
    }

    // Only include buttons for Telegram
    const result: PluginCommandResult = { text: lines.join("\n") };
    if (ctx.channel === "telegram" && buttons.length > 0) {
      result.channelData = { telegram: { buttons } };
    }
    return result;
  } catch (err) {
    return { text: `Error fetching issues: ${String(err)}` };
  }
}

async function handlePrsCommand(
  ctx: PluginCommandContext,
  repos: string[],
): Promise<PluginCommandResult> {
  try {
    const prs: Array<{
      repo: string;
      number: number;
      title: string;
      author: string;
      mergeable: string;
      ci: string;
    }> = [];

    // Fetch PRs from all repos in parallel
    const results = await Promise.all(
      repos.map(async (repo) => {
        try {
          const result = await execAsync(
            `gh pr list -R ${repo} --state open --limit 10 --json number,title,author,mergeable,statusCheckRollup`,
            { timeout: 10000 },
          );
          if (result.stdout) {
            const repoPrs = JSON.parse(result.stdout);
            return repoPrs.map(
              (pr: {
                number: number;
                title: string;
                author: { login: string };
                mergeable?: string;
                statusCheckRollup?: Array<{ conclusion: string | null }>;
              }) => {
                // Determine CI status
                let ci = "?";
                if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
                  const failed = pr.statusCheckRollup.some(
                    (c) => c.conclusion === "FAILURE",
                  );
                  const pending = pr.statusCheckRollup.some(
                    (c) => c.conclusion === null,
                  );
                  if (failed) ci = "fail";
                  else if (pending) ci = "pending";
                  else ci = "pass";
                }

                return {
                  repo: repo.split("/")[1],
                  number: pr.number,
                  title: pr.title.slice(0, 40),
                  author: pr.author?.login ?? "?",
                  mergeable: pr.mergeable ?? "?",
                  ci,
                };
              },
            );
          }
        } catch {
          // Repo might not exist or no access
        }
        return [];
      }),
    );

    for (const repoPrs of results) {
      prs.push(...repoPrs);
    }

    if (prs.length === 0) {
      return { text: "No open PRs found." };
    }

    // Sort by repo, then by number descending
    prs.sort((a, b) => {
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return b.number - a.number;
    });

    // Format as markdown
    const lines: string[] = ["*Open PRs*\n"];
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    let currentRepo = "";

    for (const pr of prs) {
      if (pr.repo !== currentRepo) {
        currentRepo = pr.repo;
        lines.push(`\n*${currentRepo}*`);
      }

      // CI status emoji
      const ciEmoji = pr.ci === "pass" ? "OK" : pr.ci === "fail" ? "FAIL" : "PEND";
      lines.push(`• #${pr.number}: ${pr.title} (${ciEmoji})`);

      // Add button for each PR
      buttons.push([
        {
          text: `${pr.repo}#${pr.number} (${ciEmoji})`,
          callback_data: `check pr ${pr.repo}#${pr.number}`,
        },
      ]);
    }

    // Only include buttons for Telegram
    const result: PluginCommandResult = { text: lines.join("\n") };
    if (ctx.channel === "telegram" && buttons.length > 0) {
      result.channelData = { telegram: { buttons } };
    }
    return result;
  } catch (err) {
    return { text: `Error fetching PRs: ${String(err)}` };
  }
}

async function handleRalphCommand(
  ctx: PluginCommandContext,
): Promise<PluginCommandResult> {
  try {
    // Get tmux sessions that look like Ralph sessions
    const result = await execAsync("tmux list-sessions -F '#{session_name}' 2>/dev/null || true", {
      timeout: 5000,
    });

    const sessions = result.stdout
      .split("\n")
      .filter((s) => s.trim())
      .filter((s) => s.match(/^[a-z]+-\d+$/i)); // Match pattern like "idynic-123"

    if (sessions.length === 0) {
      return { text: "No active Ralph sessions." };
    }

    const lines: string[] = ["*Active Ralph Sessions*\n"];
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    for (const session of sessions) {
      // Check if session has LOOP_COMPLETE
      let status = "running";
      try {
        const capture = await execAsync(
          `tmux capture-pane -t ${session} -p -S -50 2>/dev/null | tail -20`,
          { timeout: 3000 },
        );
        if (capture.stdout.includes("LOOP_COMPLETE")) {
          status = "complete";
        }
      } catch {
        // Can't capture
      }

      const statusEmoji = status === "complete" ? "DONE" : "ACTIVE";
      lines.push(`• ${session} (${statusEmoji})`);

      buttons.push([
        {
          text: `${session} logs`,
          callback_data: `check ralph ${session}`,
        },
        {
          text: "Kill",
          callback_data: `kill ralph ${session}`,
        },
      ]);
    }

    // Only include buttons for Telegram
    const cmdResult: PluginCommandResult = { text: lines.join("\n") };
    if (ctx.channel === "telegram" && buttons.length > 0) {
      cmdResult.channelData = { telegram: { buttons } };
    }
    return cmdResult;
  } catch (err) {
    return { text: `Error checking Ralph sessions: ${String(err)}` };
  }
}

async function handleSessionsCommand(
  _ctx: PluginCommandContext,
): Promise<PluginCommandResult> {
  try {
    // Get all tmux sessions
    const result = await execAsync(
      "tmux list-sessions -F '#{session_name}:#{session_attached}:#{session_activity}' 2>/dev/null || true",
      { timeout: 5000 },
    );

    const sessionLines = result.stdout.split("\n").filter((s) => s.trim());

    if (sessionLines.length === 0) {
      return { text: "No active tmux sessions." };
    }

    const lines: string[] = ["*Active Dev Sessions*\n"];

    for (const line of sessionLines) {
      const [name, attached, activity] = line.split(":");
      const isAttached = attached === "1";
      const lastActivity = activity ? new Date(parseInt(activity) * 1000) : null;

      let ageStr = "";
      if (lastActivity) {
        const ageMs = Date.now() - lastActivity.getTime();
        const ageMin = Math.floor(ageMs / 60000);
        if (ageMin < 60) {
          ageStr = `${ageMin}m ago`;
        } else {
          const ageHr = Math.floor(ageMin / 60);
          ageStr = `${ageHr}h ago`;
        }
      }

      const attachedStr = isAttached ? "attached" : "detached";
      lines.push(`• \`${name}\` - ${attachedStr}${ageStr ? `, ${ageStr}` : ""}`);
    }

    return { text: lines.join("\n") };
  } catch (err) {
    return { text: `Error checking sessions: ${String(err)}` };
  }
}
