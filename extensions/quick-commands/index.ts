import type { OpenClawPluginApi, OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { registerQuickCommands } from "./src/commands.js";

const plugin: OpenClawPluginDefinition = {
  id: "quick-commands",
  name: "Quick Commands",
  description: "Quick slash commands using Haiku for fast, cheap status queries",
  version: "0.1.0",

  async register(api: OpenClawPluginApi) {
    registerQuickCommands(api);
    api.logger.info("Quick commands registered: /status, /board, /prs, /ralph, /sessions");
  },
};

export default plugin;
