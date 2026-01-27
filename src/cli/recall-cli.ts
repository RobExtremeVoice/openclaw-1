import { exec } from "node:child_process";

import type { Command } from "commander";

import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { createRecallServer } from "../recall/server.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

const DEFAULT_PORT = 18790;
const DEFAULT_HOST = "127.0.0.1";

type RecallOptions = {
  port?: number;
  agent?: string;
  open?: boolean;
};

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) {
      defaultRuntime.log(`Open ${url} in your browser`);
    }
  });
}

export function registerRecallCli(program: Command) {
  program
    .command("recall")
    .description("Memory manager web UI")
    .option("-p, --port <port>", "Port to listen on", (v) => Number.parseInt(v, 10), DEFAULT_PORT)
    .option("--agent <id>", "Agent ID (default: default agent)")
    .option("--no-open", "Do not open browser automatically")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/recall", "docs.clawd.bot/cli/recall")}\n`,
    )
    .action(async (opts: RecallOptions) => {
      const cfg = loadConfig();
      const agentId = opts.agent?.trim() || resolveDefaultAgentId(cfg);
      const port = opts.port ?? DEFAULT_PORT;
      const host = DEFAULT_HOST;

      defaultRuntime.log(`Starting Recall memory manager for agent: ${agentId}`);

      const server = await createRecallServer({
        cfg,
        agentId,
        port,
        host,
      });

      await server.start();

      const url = server.getUrl();
      defaultRuntime.log(`Recall UI available at: ${url}`);

      if (opts.open !== false) {
        openBrowser(url);
      }

      // Keep the process running
      const shutdown = async () => {
        defaultRuntime.log("\nShutting down Recall server...");
        await server.stop();
        process.exit(0);
      };

      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());

      // Keep process alive
      await new Promise(() => {});
    });
}
