import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setUniversalImRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getUniversalImRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Universal IM runtime not initialized");
  }
  return runtime;
}
