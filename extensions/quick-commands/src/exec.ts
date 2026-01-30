/**
 * Async exec helper with timeout support
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execPromise = promisify(exec);

export type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
};

export async function execAsync(
  command: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { timeout = 30000, cwd, env } = options;

  const result = await execPromise(command, {
    timeout,
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    maxBuffer: 1024 * 1024, // 1MB
  });

  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}
