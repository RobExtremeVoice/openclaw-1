import type { VisionAnalysisResult, ValidationStatus } from "./types.js";

const ANALYSIS_PROMPT = `Analyze this screenshot of a coding task in progress.

TASK CONTEXT: {TASK}

Determine the status:
- PROGRESSING: Active work visible, changes being made, tests running, etc.
- STUCK: Error messages, no recent changes, repeated failures, agent spinning
- COMPLETE: Task appears finished, success messages visible, clean state

Respond with exactly one of: PROGRESSING, STUCK, or COMPLETE
Then provide a 1-2 sentence summary of what you observe.`;

export async function analyzeProgress(
  screenshotPath: string,
  originalTask: string,
  callAI: (prompt: string, imagePath: string) => Promise<string>,
): Promise<VisionAnalysisResult> {
  const prompt = ANALYSIS_PROMPT.replace("{TASK}", originalTask);

  try {
    const response = await callAI(prompt, screenshotPath);
    const lines = response.trim().split("\n");
    const statusLine = lines[0].trim().toUpperCase();

    let status: ValidationStatus = "PROGRESSING";
    if (statusLine.includes("COMPLETE")) {
      status = "COMPLETE";
    } else if (statusLine.includes("STUCK")) {
      status = "STUCK";
    }

    const summary = lines.slice(1).join(" ").trim() || "No additional details provided";

    return { status, summary };
  } catch (err) {
    return {
      status: "PROGRESSING",
      summary: `Analysis failed: ${String(err)}`,
    };
  }
}
