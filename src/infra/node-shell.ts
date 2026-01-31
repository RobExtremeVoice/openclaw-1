import {
  POWERSHELL_ARGS,
  resolvePowerShellPath,
  wrapPowerShellUtf8Command,
} from "./windows-shell.js";

export function buildNodeShellCommand(command: string, platform?: string | null) {
  const normalized = String(platform ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("win")) {
    return [resolvePowerShellPath(), ...POWERSHELL_ARGS, wrapPowerShellUtf8Command(command)];
  }
  return ["/bin/sh", "-lc", command];
}
