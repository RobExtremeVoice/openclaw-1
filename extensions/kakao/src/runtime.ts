import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setKakaoRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getKakaoRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Kakao runtime not initialized");
  }
  return runtime;
}
