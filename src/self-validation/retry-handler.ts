import type { SelfValidationState } from "./types.js";
import { incrementRetry, readValidationState } from "./storage.js";

export interface RetryResult {
  shouldRetry: boolean;
  reason: string;
  continuationPrompt: string;
}

export function determineRetryAction(
  state: SelfValidationState,
  currentStatus: "PROGRESSING" | "STUCK" | "COMPLETE",
): RetryResult {
  if (currentStatus === "COMPLETE") {
    return {
      shouldRetry: false,
      reason: "Task is complete",
      continuationPrompt: "",
    };
  }

  if (currentStatus === "PROGRESSING") {
    return {
      shouldRetry: false,
      reason: "Task is progressing normally",
      continuationPrompt: "",
    };
  }

  if (state.retry_count >= state.max_retries) {
    return {
      shouldRetry: false,
      reason: `Max retries (${state.max_retries}) reached`,
      continuationPrompt: `The task appears to be stuck after ${state.retry_count} retry attempts. Please analyze the current state and either complete the task or report the blocker.`,
    };
  }

  return {
    shouldRetry: true,
    reason: `Retry attempt ${state.retry_count + 1} of ${state.max_retries}`,
    continuationPrompt: `The task appears to be stuck. Please analyze the current state, identify what went wrong, and continue working on the original task: ${state.original_task}`,
  };
}

export async function executeRetry(
  directory: string,
  sendMessage: (message: string) => Promise<void>,
): Promise<boolean> {
  const state = readValidationState(directory);
  if (!state) return false;

  const retryResult = determineRetryAction(state, state.last_status || "STUCK");

  if (retryResult.shouldRetry) {
    await sendMessage(retryResult.continuationPrompt);
    incrementRetry(directory);
    return true;
  }

  return false;
}
