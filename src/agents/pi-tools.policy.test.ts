import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  filterToolsByPolicy,
  isToolAllowedByPolicyName,
  resolveSubagentToolPolicy,
} from "./pi-tools.policy.js";
import type { OpenClawConfig } from "../config/config.js";

function createStubTool(name: string): AgentTool<unknown, unknown> {
  return {
    name,
    label: name,
    description: "",
    parameters: {},
    execute: async () => ({}) as AgentToolResult<unknown>,
  };
}

describe("pi-tools.policy", () => {
  it("treats * in allow as allow-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { allow: ["*"] });
    expect(filtered.map((tool) => tool.name)).toEqual(["read", "exec"]);
  });

  it("treats * in deny as deny-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { deny: ["*"] });
    expect(filtered).toEqual([]);
  });

  it("supports wildcard allow/deny patterns", () => {
    expect(isToolAllowedByPolicyName("web_fetch", { allow: ["web_*"] })).toBe(true);
    expect(isToolAllowedByPolicyName("web_search", { deny: ["web_*"] })).toBe(false);
  });

  it("keeps apply_patch when exec is allowlisted", () => {
    expect(isToolAllowedByPolicyName("apply_patch", { allow: ["exec"] })).toBe(true);
  });

  describe("resolveSubagentToolPolicy", () => {
    it("denies default subagent tools when no config is provided", () => {
      const policy = resolveSubagentToolPolicy(undefined);
      expect(policy.deny).toContain("sessions_send");
      expect(policy.deny).toContain("memory_search");
    });

    it("allows overriding specific tools from default deny list via allowOverride", () => {
      const cfg: OpenClawConfig = {
        tools: {
          subagents: {
            tools: {
              allowOverride: ["sessions_send", "memory_search"],
            },
          },
        },
      };
      const policy = resolveSubagentToolPolicy(cfg);
      expect(policy.deny).not.toContain("sessions_send");
      expect(policy.deny).not.toContain("memory_search");
      // Other defaults should still be denied
      expect(policy.deny).toContain("gateway");
      expect(policy.deny).toContain("sessions_spawn");
    });

    it("merges custom deny with remaining default deny", () => {
      const cfg: OpenClawConfig = {
        tools: {
          subagents: {
            tools: {
              allowOverride: ["sessions_send"],
              deny: ["custom_tool"],
            },
          },
        },
      };
      const policy = resolveSubagentToolPolicy(cfg);
      expect(policy.deny).not.toContain("sessions_send");
      expect(policy.deny).toContain("custom_tool");
      expect(policy.deny).toContain("gateway");
    });
  });
});
