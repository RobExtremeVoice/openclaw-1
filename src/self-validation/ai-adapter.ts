import { readFileSync } from "fs";
import type { OpenClawConfig } from "../config/config.js";

export interface ValidationAIParams {
  config?: OpenClawConfig;
  agentDir: string;
  workspaceDir: string;
  sessionId: string;
  provider: string;
  model: string;
}

function readImageAsBase64(imagePath: string): string {
  const buffer = readFileSync(imagePath);
  return buffer.toString("base64");
}

export function createValidationAICall(params: ValidationAIParams) {
  return async (prompt: string, imagePath: string): Promise<string> => {
    const { runEmbeddedPiAgent } = await import("../agents/pi-embedded-runner/run.js");

    const validationSessionId = `${params.sessionId}-validation`;
    const base64Image = readImageAsBase64(imagePath);

    const result = await runEmbeddedPiAgent({
      sessionId: validationSessionId,
      sessionFile: `${params.agentDir}/sessions/${validationSessionId}.jsonl`,
      workspaceDir: params.workspaceDir,
      config: params.config,
      prompt: prompt,
      images: [{ type: "image", mimeType: "image/png", data: base64Image }],
      provider: params.provider,
      model: params.model,
      disableTools: true,
      timeoutMs: 30_000,
      runId: `validation-${Date.now()}`,
    });

    return result.payloads?.find((p) => p.text)?.text ?? "";
  };
}
