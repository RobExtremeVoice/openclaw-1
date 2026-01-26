import type { ClawdbotConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export async function applyDefaultModelChoice(params: {
  config: ClawdbotConfig;
  setDefaultModel: boolean;
  defaultModel: string;
  applyDefaultConfig: (config: ClawdbotConfig) => ClawdbotConfig | Promise<ClawdbotConfig>;
  applyProviderConfig: (config: ClawdbotConfig) => ClawdbotConfig | Promise<ClawdbotConfig>;
  noteDefault?: string;
  noteAgentModel: (model: string) => Promise<void>;
  prompter: WizardPrompter;
}): Promise<{ config: ClawdbotConfig; agentModelOverride?: string }> {
  if (params.setDefaultModel) {
    const next = await params.applyDefaultConfig(params.config);
    if (params.noteDefault) {
      await params.prompter.note(`Default model set to ${params.noteDefault}`, "Model configured");
    }
    return { config: next };
  }

  const next = await params.applyProviderConfig(params.config);
  await params.noteAgentModel(params.defaultModel);
  return { config: next, agentModelOverride: params.defaultModel };
}
