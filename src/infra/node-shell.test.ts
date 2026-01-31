import { describe, expect, it, vi } from "vitest";

vi.mock("./windows-shell.js", () => ({
  POWERSHELL_ARGS: ["-NoProfile", "-NonInteractive", "-Command"],
  resolvePowerShellPath: () => "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
  wrapPowerShellUtf8Command: (command: string) => `wrapped:${command}`,
}));

describe("buildNodeShellCommand", () => {
  it("uses PowerShell for win32", async () => {
    const { buildNodeShellCommand } = await import("./node-shell.js");
    expect(buildNodeShellCommand("echo hi", "win32")).toEqual([
      "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "wrapped:echo hi",
    ]);
  });

  it("uses PowerShell for windows labels", async () => {
    const { buildNodeShellCommand } = await import("./node-shell.js");
    expect(buildNodeShellCommand("echo hi", "windows")).toEqual([
      "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "wrapped:echo hi",
    ]);
    expect(buildNodeShellCommand("echo hi", "Windows 11")).toEqual([
      "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "wrapped:echo hi",
    ]);
  });

  it("uses /bin/sh for darwin", async () => {
    const { buildNodeShellCommand } = await import("./node-shell.js");
    expect(buildNodeShellCommand("echo hi", "darwin")).toEqual(["/bin/sh", "-lc", "echo hi"]);
  });

  it("uses /bin/sh when platform missing", async () => {
    const { buildNodeShellCommand } = await import("./node-shell.js");
    expect(buildNodeShellCommand("echo hi")).toEqual(["/bin/sh", "-lc", "echo hi"]);
  });
});
