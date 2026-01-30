import type { ValidationPhase } from "./types.js";
import { PHASE_1_INTERVAL_MS, PHASE_2_INTERVAL_MS, PHASE_1_DURATION_MS } from "./constants.js";

export class TimerManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private phase: ValidationPhase = 1;
  private startTime: number = 0;
  private callback: (() => Promise<void>) | null = null;

  start(callback: () => Promise<void>): void {
    this.callback = callback;
    this.startTime = Date.now();
    this.intervalId = setInterval(async () => {
      await callback();
      this.checkPhaseTransition();
    }, PHASE_1_INTERVAL_MS);
  }

  private checkPhaseTransition(): void {
    const elapsed = Date.now() - this.startTime;
    if (this.phase === 1 && elapsed >= PHASE_1_DURATION_MS) {
      this.transitionToPhase2();
    }
  }

  private transitionToPhase2(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.phase = 2;
    if (this.callback) {
      this.intervalId = setInterval(this.callback, PHASE_2_INTERVAL_MS);
    }
  }

  getPhase(): ValidationPhase {
    return this.phase;
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
