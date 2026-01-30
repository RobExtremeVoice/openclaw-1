import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { SelfValidationState, ValidationCheck } from "./types.js";
import { STATE_FILE_NAME } from "./constants.js";

export function getStateFilePath(directory: string): string {
  return join(directory, ".openclaw", STATE_FILE_NAME);
}

export function readValidationState(directory: string): SelfValidationState | null {
  const statePath = getStateFilePath(directory);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as SelfValidationState;
  } catch {
    return null;
  }
}

export function writeValidationState(directory: string, state: SelfValidationState): boolean {
  const statePath = getStateFilePath(directory);

  try {
    const openclawDir = join(directory, ".openclaw");
    if (!existsSync(openclawDir)) {
      mkdirSync(openclawDir, { recursive: true });
    }

    writeFileSync(statePath, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function clearValidationState(directory: string): boolean {
  const statePath = getStateFilePath(directory);

  try {
    if (existsSync(statePath)) {
      writeFileSync(statePath, JSON.stringify({ active: false }, null, 2));
    }
    return true;
  } catch {
    return false;
  }
}

export function incrementIteration(directory: string): SelfValidationState | null {
  const state = readValidationState(directory);
  if (!state) return null;

  state.iteration_count += 1;
  writeValidationState(directory, state);
  return state;
}

export function transitionToPhase2(directory: string): SelfValidationState | null {
  const state = readValidationState(directory);
  if (!state) return null;

  state.phase = 2;
  state.phase_2_started_at = new Date().toISOString();
  writeValidationState(directory, state);
  return state;
}

export function recordValidationCheck(directory: string, check: ValidationCheck): boolean {
  const state = readValidationState(directory);
  if (!state) return false;

  state.validation_history.push(check);
  state.last_status = check.status;
  state.last_screenshot_path = check.screenshot_path;

  return writeValidationState(directory, state);
}

export function markComplete(directory: string): SelfValidationState | null {
  const state = readValidationState(directory);
  if (!state) return null;

  state.is_complete = true;
  state.completed_at = new Date().toISOString();
  state.active = false;
  state.last_status = "COMPLETE";

  writeValidationState(directory, state);
  return state;
}

export function startExtension(directory: string): SelfValidationState | null {
  const state = readValidationState(directory);
  if (!state) return null;

  state.in_extension = true;
  state.extension_started_at = new Date().toISOString();

  writeValidationState(directory, state);
  return state;
}

export function incrementRetry(directory: string): SelfValidationState | null {
  const state = readValidationState(directory);
  if (!state) return null;

  state.retry_count += 1;
  writeValidationState(directory, state);
  return state;
}
