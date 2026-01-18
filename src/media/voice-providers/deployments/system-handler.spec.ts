/**
 * System Deployment Handler Specification
 *
 * This file outlines the contract that the System deployment handler
 * sub-agent must implement.
 *
 * IMPLEMENTATION CHECKLIST:
 * - [ ] Detect Python installation (python3, python)
 * - [ ] Check if kokoro is installed via pip
 * - [ ] Install kokoro if missing (pip install kokoro)
 * - [ ] Spawn kokoro process with stdio forwarding
 * - [ ] Track process PID for lifecycle management
 * - [ ] Implement graceful shutdown (signal SIGTERM, then SIGKILL)
 * - [ ] Handle process crashes and auto-restart logic
 * - [ ] Write tests for: python detection, pip check, install, process spawn, graceful shutdown
 */

import type { DeploymentConfig } from '../kokoro.js';

/**
 * System deployment handler interface
 */
export interface SystemDeploymentHandler {
  /**
   * Detect Python installation on system
   * @returns Path to Python executable
   */
  detectPython(): Promise<string>;

  /**
   * Check if kokoro is already installed
   * @param pythonPath - Path to Python executable
   */
  checkKokoroInstalled(pythonPath: string): Promise<boolean>;

  /**
   * Install kokoro via pip
   * @param pythonPath - Path to Python executable
   * @param installCmd - Custom install command (optional)
   */
  installKokoro(pythonPath: string, installCmd?: string): Promise<void>;

  /**
   * Start Kokoro process
   * @param config - System deployment configuration
   * @returns Process PID
   */
  startProcess(config: DeploymentConfig['system']): Promise<number>;

  /**
   * Check if process is running
   * @param pid - Process ID
   */
  isProcessRunning(pid: number): Promise<boolean>;

  /**
   * Stop Kokoro process gracefully
   * @param pid - Process ID
   * @param timeoutMs - Grace period before SIGKILL
   */
  stopProcess(pid: number, timeoutMs?: number): Promise<void>;

  /**
   * Get process status info
   */
  getProcessStatus(pid: number): Promise<{
    running: boolean;
    uptime?: number;
    memory?: number;
  }>;
}

/**
 * Expected implementation location:
 * /src/media/voice-providers/deployments/system-handler.ts
 */
export const SystemHandlerContract = {
  // Implementation should export a class SystemHandler that implements SystemDeploymentHandler
  // Example usage in KokoroExecutor:
  // const handler = new SystemHandler();
  // const pythonPath = await handler.detectPython();
  // if (!await handler.checkKokoroInstalled(pythonPath)) {
  //   await handler.installKokoro(pythonPath, config.system?.installCmd);
  // }
  // const pid = await handler.startProcess(config.system);
};
