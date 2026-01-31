import fs from "node:fs";
import path from "node:path";

export const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command"] as const;

export function resolvePowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    const candidate = path.join(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return "powershell.exe";
}

export function wrapPowerShellUtf8Command(command: string): string {
  const preamble =
    "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; " +
    "chcp 65001 > $null";
  return `${preamble}; ${command}`;
}
