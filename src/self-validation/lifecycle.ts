import { SelfValidationLoop } from "./index.js";
import type { SelfValidationOptions } from "./index.js";

const activeValidationLoops = new Map<string, SelfValidationLoop>();

export function startSelfValidationLoop(sessionId: string, options: SelfValidationOptions): void {
  if (activeValidationLoops.has(sessionId)) {
    activeValidationLoops.get(sessionId)!.stop();
  }

  const loop = new SelfValidationLoop(options);
  activeValidationLoops.set(sessionId, loop);
  void loop.start();
}

export function stopSelfValidationLoop(sessionId: string): void {
  const loop = activeValidationLoops.get(sessionId);
  if (loop) {
    loop.stop();
    activeValidationLoops.delete(sessionId);
  }
}

export function getActiveValidationLoop(sessionId: string): SelfValidationLoop | undefined {
  return activeValidationLoops.get(sessionId);
}

export function isValidationActive(sessionId: string): boolean {
  const loop = activeValidationLoops.get(sessionId);
  return loop?.isActive() ?? false;
}
