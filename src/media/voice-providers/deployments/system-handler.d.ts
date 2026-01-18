/**
 * System Deployment Handler
 *
 * Manages Kokoro deployment via local Python installation.
 * Handles Python detection, pip installation, and process lifecycle.
 */
import type { DeploymentConfig } from '../kokoro.js';
import type { SystemDeploymentHandler } from './system-handler.spec.js';
export declare class SystemHandler implements SystemDeploymentHandler {
    private runningPid;
    private childProcess;
    /**
     * Detect Python 3 installation
     */
    detectPython(): Promise<string>;
    /**
     * Check if kokoro is installed via pip
     */
    checkKokoroInstalled(pythonPath: string): Promise<boolean>;
    /**
     * Install kokoro via pip
     */
    installKokoro(pythonPath: string, installCmd?: string): Promise<void>;
    /**
     * Start Kokoro process
     */
    startProcess(config: DeploymentConfig['system']): Promise<number>;
    /**
     * Check if process is running
     */
    isProcessRunning(pid: number): Promise<boolean>;
    /**
     * Stop Kokoro process gracefully
     */
    stopProcess(pid: number, timeoutMs?: number): Promise<void>;
    /**
     * Get process status
     */
    getProcessStatus(pid: number): Promise<{
        running: boolean;
        uptime?: number;
        memory?: number;
    }>;
    /**
     * Cleanup on shutdown
     */
    cleanup(): Promise<void>;
    /**
     * Get running process PID
     */
    getRunningPid(): number | null;
}
//# sourceMappingURL=system-handler.d.ts.map