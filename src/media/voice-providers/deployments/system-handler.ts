/**
 * System Deployment Handler
 *
 * Manages Kokoro deployment via local Python installation.
 * Handles Python detection, pip installation, and process lifecycle.
 */

import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import type { DeploymentConfig } from '../kokoro.js';
import { VoiceProviderError } from '../executor.js';
import type { SystemDeploymentHandler } from './system-handler.spec.js';

const execAsync = promisify(exec);

export class SystemHandler implements SystemDeploymentHandler {
  private runningPid: number | null = null;
  private childProcess: ChildProcess | null = null;

  /**
   * Detect Python 3 installation
   */
  async detectPython(): Promise<string> {
    const pythonCandidates = ['python3', 'python', 'python.exe'];

    for (const candidate of pythonCandidates) {
      try {
        const { stdout } = await execAsync(`${candidate} --version`);
        const version = stdout.trim();
        console.log(`[System] Found ${candidate}: ${version}`);

        // Verify it's Python 3.9+
        const versionMatch = version.match(/Python (\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1], 10);
          const minor = parseInt(versionMatch[2], 10);

          if (major === 3 && minor >= 9) {
            return candidate;
          }
          console.warn(
            `[System] ${candidate} version ${major}.${minor} is below minimum 3.9`,
          );
        }
      } catch (error) {
        // Continue to next candidate
      }
    }

    throw new VoiceProviderError(
      'Python 3.9+ not found. Please install Python 3.9 or later.',
      'kokoro-system',
      'PYTHON_NOT_FOUND',
    );
  }

  /**
   * Check if kokoro is installed via pip
   */
  async checkKokoroInstalled(pythonPath: string): Promise<boolean> {
    try {
      await execAsync(`${pythonPath} -m pip show kokoro`);
      console.log('[System] Kokoro package is installed');
      return true;
    } catch (error) {
      console.log('[System] Kokoro package not found');
      return false;
    }
  }

  /**
   * Install kokoro via pip
   */
  async installKokoro(pythonPath: string, installCmd?: string): Promise<void> {
    const cmd =
      installCmd || `${pythonPath} -m pip install kokoro`;

    try {
      console.log(`[System] Installing Kokoro: ${cmd}`);
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 120000, // 2 minute timeout for pip install
      });

      if (stdout) console.log('[System] Install stdout:', stdout);
      if (stderr) console.log('[System] Install stderr:', stderr);
      console.log('[System] Kokoro installed successfully');
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to install Kokoro: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-system',
        'INSTALL_FAILED',
      );
    }
  }

  /**
   * Start Kokoro process
   */
  async startProcess(config: DeploymentConfig['system']): Promise<number> {
    try {
      const pythonPath = config?.pythonPath || (await this.detectPython());

      // Check and install if needed
      if (!(await this.checkKokoroInstalled(pythonPath))) {
        console.log('[System] Kokoro not installed, installing...');
        await this.installKokoro(pythonPath, config?.installCmd);
      }

      // Start kokoro process
      console.log('[System] Starting Kokoro process...');
      const childProc = spawn(pythonPath, ['-m', 'kokoro'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      if (!childProc.pid) {
        throw new Error('Failed to get process PID');
      }

      // Handle process events
      childProc.on('error', (error) => {
        console.error('[System] Process error:', error);
      });

      childProc.on('exit', (code) => {
        console.warn(`[System] Kokoro process exited with code ${code}`);
        this.runningPid = null;
      });

      // Forward output
      if (childProc.stdout) {
        childProc.stdout.on('data', (data) => {
          console.log('[Kokoro]', data.toString().trim());
        });
      }

      if (childProc.stderr) {
        childProc.stderr.on('data', (data) => {
          console.warn('[Kokoro]', data.toString().trim());
        });
      }

      this.runningPid = childProc.pid;
      this.childProcess = childProc;

      console.log(`[System] Kokoro process started with PID ${process.pid}`);

      // Give process time to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify process is running
      if (!(await this.isProcessRunning(process.pid))) {
        throw new Error('Process exited unexpectedly after startup');
      }

      return process.pid;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to start Kokoro process: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-system',
        'PROCESS_SPAWN_FAILED',
      );
    }
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Stop Kokoro process gracefully
   */
  async stopProcess(pid: number, timeoutMs: number = 10000): Promise<void> {
    try {
      console.log(`[System] Stopping Kokoro process ${pid}...`);

      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        if (!(await this.isProcessRunning(pid))) {
          console.log(`[System] Kokoro process ${pid} stopped gracefully`);
          this.runningPid = null;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Force kill if still running
      console.warn(`[System] Graceful shutdown timeout, force killing PID ${pid}`);
      process.kill(pid, 'SIGKILL');

      // Wait a bit for SIGKILL to take effect
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (await this.isProcessRunning(pid)) {
        throw new Error('Process still running after SIGKILL');
      }

      console.log(`[System] Kokoro process ${pid} force killed`);
      this.runningPid = null;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to stop process ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-system',
        'PROCESS_SHUTDOWN_FAILED',
      );
    }
  }

  /**
   * Get process status
   */
  async getProcessStatus(
    pid: number,
  ): Promise<{ running: boolean; uptime?: number; memory?: number }> {
    try {
      const running = await this.isProcessRunning(pid);

      if (!running) {
        return { running: false };
      }

      // Try to get process info (platform-specific)
      try {
        const { stdout } = await execAsync(
          `ps -p ${pid} -o etime=,rss= 2>/dev/null || tasklist /FI "PID eq ${pid}" 2>/dev/null`,
        );

        // Parse output
        const parts = stdout.trim().split(/\s+/);
        const memoryKb = parts[1] ? parseInt(parts[1], 10) : undefined;

        return {
          running: true,
          memory: memoryKb,
        };
      } catch (error) {
        // If we can't get detailed info, just return running status
        return { running: true };
      }
    } catch (error) {
      return { running: false };
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    if (this.runningPid) {
      try {
        await this.stopProcess(this.runningPid);
      } catch (error) {
        console.error('[System] Cleanup error:', error);
      }
    }
  }

  /**
   * Get running process PID
   */
  getRunningPid(): number | null {
    return this.runningPid;
  }
}
