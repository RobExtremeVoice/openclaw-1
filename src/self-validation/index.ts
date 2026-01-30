import { TimerManager } from "./timer-manager.js";
import { captureScreenshot } from "./screenshot-capture.js";
import { analyzeProgress } from "./vision-analyzer.js";
import { determineRetryAction } from "./retry-handler.js";
import { generateCompletionReport, formatReportForUser } from "./report-generator.js";
import {
  readValidationState,
  writeValidationState,
  recordValidationCheck,
  markComplete,
  startExtension,
  transitionToPhase2,
} from "./storage.js";
import type { SelfValidationState, ValidationCheck } from "./types.js";
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_RETRIES,
  TOTAL_WORK_DURATION_MS,
  EXTENSION_DURATION_MS,
} from "./constants.js";

export interface SelfValidationOptions {
  directory: string;
  sessionId: string;
  originalTask: string;
  callAI: (prompt: string, imagePath: string) => Promise<string>;
  sendMessage: (message: string) => Promise<void>;
  maxIterations?: number;
  maxRetries?: number;
}

export class SelfValidationLoop {
  private timerManager: TimerManager;
  private options: SelfValidationOptions;
  private isRunning: boolean = false;

  constructor(options: SelfValidationOptions) {
    this.options = options;
    this.timerManager = new TimerManager();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const state: SelfValidationState = {
      active: true,
      phase: 1,
      iteration_count: 0,
      max_iterations: this.options.maxIterations || DEFAULT_MAX_ITERATIONS,
      started_at: new Date().toISOString(),
      session_id: this.options.sessionId,
      original_task: this.options.originalTask,
      validation_history: [],
      retry_count: 0,
      max_retries: this.options.maxRetries || DEFAULT_MAX_RETRIES,
      in_extension: false,
      is_complete: false,
    };

    writeValidationState(this.options.directory, state);
    this.isRunning = true;

    this.timerManager.start(async () => {
      await this.runValidationCycle();
    });
  }

  private async runValidationCycle(): Promise<void> {
    const state = readValidationState(this.options.directory);
    if (!state || !state.active) {
      this.stop();
      return;
    }

    // Check if we've exceeded max iterations
    if (state.iteration_count >= state.max_iterations) {
      if (!state.in_extension) {
        await this.enterExtensionPeriod(state);
        return;
      } else {
        await this.completeTask(state, "TIMEOUT");
        return;
      }
    }

    // Check if total work duration exceeded
    const elapsed = Date.now() - new Date(state.started_at).getTime();
    if (elapsed >= TOTAL_WORK_DURATION_MS && !state.in_extension) {
      await this.enterExtensionPeriod(state);
      return;
    }

    // Check if extension period exceeded
    if (state.in_extension && state.extension_started_at) {
      const extensionElapsed = Date.now() - new Date(state.extension_started_at).getTime();
      if (extensionElapsed >= EXTENSION_DURATION_MS) {
        await this.completeTask(state, "TIMEOUT");
        return;
      }
    }

    // Capture screenshot
    const screenshot = await captureScreenshot(this.options.directory, state.session_id);
    if (!screenshot.success) {
      console.error("[SelfValidation] Screenshot failed:", screenshot.error);
      return;
    }

    // Analyze with AI
    const analysis = await analyzeProgress(
      screenshot.path,
      state.original_task,
      this.options.callAI,
    );

    // Record check
    const check: ValidationCheck = {
      timestamp: new Date().toISOString(),
      phase: state.phase,
      iteration: state.iteration_count + 1,
      screenshot_path: screenshot.path,
      status: analysis.status,
      analysis_summary: analysis.summary,
    };

    // Determine action
    const retryResult = determineRetryAction(state, analysis.status);
    check.action_taken = retryResult.shouldRetry
      ? "retry"
      : analysis.status === "COMPLETE"
        ? "report"
        : "continue";

    recordValidationCheck(this.options.directory, check);

    // Handle phase transition
    const currentPhase = this.timerManager.getPhase();
    if (currentPhase === 2 && state.phase === 1) {
      transitionToPhase2(this.options.directory);
    }

    // Handle status
    if (analysis.status === "COMPLETE") {
      await this.completeTask(state, "COMPLETE");
    } else if (retryResult.shouldRetry) {
      await this.options.sendMessage(retryResult.continuationPrompt);
    }
  }

  private async enterExtensionPeriod(state: SelfValidationState): Promise<void> {
    startExtension(this.options.directory);
    await this.options.sendMessage(
      `Initial work period completed. Entering 10-minute extension period to complete the task: ${state.original_task}`,
    );
  }

  private async completeTask(
    _state: SelfValidationState,
    _finalStatus: "COMPLETE" | "TIMEOUT" | "MAX_RETRIES",
  ): Promise<void> {
    this.stop();

    const completedState = markComplete(this.options.directory);
    if (completedState) {
      const report = generateCompletionReport(completedState);
      const formattedReport = formatReportForUser(report);
      await this.options.sendMessage(formattedReport);
    }
  }

  stop(): void {
    this.isRunning = false;
    this.timerManager.stop();
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export function createSelfValidationLoop(options: SelfValidationOptions): SelfValidationLoop {
  return new SelfValidationLoop(options);
}
