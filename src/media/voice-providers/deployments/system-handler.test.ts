/**
 * System Handler Tests
 *
 * Cohesive mocking strategy:
 * - Mock `util.promisify` to intercept execAsync binding (module load time fix)
 * - Mock `exec` for CLI commands (pip, python detection)
 * - Mock `spawn` for child process lifecycle
 * - Reload SystemHandler module after mocking to apply promisify mock
 * - Use sequential mocks for operation flows
 * - Properly handle async operations without timeouts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { VoiceProviderError } from '../executor.js';

vi.mock('child_process');
vi.mock('util');

/**
 * Helper to create a mock ChildProcess that properly implements EventEmitter
 * Mimics Node's spawn() return value with working event handlers
 */
function createMockChildProcess(options: {
  pid?: number;
  exitCode?: number;
  emitError?: Error | null;
} = {}): any {
  const { pid = 12345, exitCode = 0, emitError = null } = options;

  // Create separate EventEmitters for main process and streams
  const processEmitter = new EventEmitter();
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  const mockProc = {
    pid,
    stdout: stdoutEmitter,
    stderr: stderrEmitter,

    // Implement EventEmitter interface for the process itself
    on: (event: string, handler: (...args: any[]) => void) => {
      processEmitter.on(event, handler);

      // Auto-emit events after handler registration
      if (event === 'close') {
        setImmediate(() => {
          processEmitter.emit('close', exitCode);
        });
      }

      if (event === 'exit') {
        setImmediate(() => {
          processEmitter.emit('exit', exitCode);
        });
      }

      if (event === 'error' && emitError) {
        setImmediate(() => {
          processEmitter.emit('error', emitError);
        });
      }

      return mockProc;
    },

    once: (event: string, handler: (...args: any[]) => void) => {
      processEmitter.once(event, handler);
      return mockProc;
    },

    off: (event: string, handler: (...args: any[]) => void) => {
      processEmitter.off(event, handler);
      return mockProc;
    },

    removeListener: (event: string, handler: (...args: any[]) => void) => {
      processEmitter.removeListener(event, handler);
      return mockProc;
    },

    removeAllListeners: (event?: string) => {
      if (event) {
        processEmitter.removeAllListeners(event);
      } else {
        processEmitter.removeAllListeners();
      }
      return mockProc;
    },

    kill: vi.fn(() => true),
  };

  return mockProc;
}

describe('SystemHandler', () => {
  let handler: any;
  let mockExecSync: any;

  beforeEach(async () => {
    // Clear mocks before each test
    vi.clearAllMocks();

    // Create a shared mock exec function that all tests can use
    mockExecSync = vi.fn();

    // Mock promisify to return a function that wraps our mocked exec
    vi.mocked(promisify).mockImplementation((fn: any) => {
      return async (...args: any[]) => {
        return new Promise((resolve, reject) => {
          const callback = (error: Error | null, stdout: string, stderr: string) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
          };

          // Call the mocked exec with all args plus our callback
          mockExecSync(...args, callback);
        });
      };
    });

    // Mock exec to work with our promisified wrapper
    vi.mocked(exec).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      mockExecSync(...args.slice(0, -1), cb);
      return { kill: vi.fn(), on: vi.fn() } as any;
    });

    // Mock spawn with default implementation
    vi.mocked(spawn).mockImplementation(() => createMockChildProcess());

    // Now import/reload SystemHandler AFTER mocking promisify
    // This ensures the module-level execAsync = promisify(exec) uses our mock
    const { SystemHandler } = await import('./system-handler.js');
    handler = new SystemHandler();
  });

  afterEach(() => {
    // Tests set up their own mocks, so don't clear them here
    // Just let each test manage its own mock setup and teardown
  });

  describe('detectPython', () => {
    it('should find python3', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(null, 'Python 3.11.0\n', ''));
      });

      const python = await handler.detectPython();
      expect(python).toBe('python3');
    });

    it('should fallback to python if python3 not found', async () => {
      mockExecSync
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // python3 fails
          setImmediate(() => callback(new Error('not found')));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // python succeeds
          setImmediate(() => callback(null, 'Python 3.10.0\n', ''));
        });

      const python = await handler.detectPython();
      expect(python).toBe('python');
    });

    it('should throw if no python found', async () => {
      mockExecSync.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(new Error('not found')));
      });

      await expect(handler.detectPython()).rejects.toThrow(VoiceProviderError);
    });

    it('should reject python version < 3.9', async () => {
      // All python candidates return version < 3.9
      mockExecSync.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(null, 'Python 3.8.0\n', ''));
      });

      await expect(handler.detectPython()).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('checkKokoroInstalled', () => {
    it('should return true when kokoro is installed', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(null, 'Name: kokoro\nVersion: 1.0.0\n', ''));
      });

      const installed = await handler.checkKokoroInstalled('python3');
      expect(installed).toBe(true);
    });

    it('should return false when kokoro is not installed', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(new Error('WARNING: Package(s) not found')));
      });

      const installed = await handler.checkKokoroInstalled('python3');
      expect(installed).toBe(false);
    });
  });

  describe('installKokoro', () => {
    it('should install kokoro successfully', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(null, 'Successfully installed kokoro\n', ''));
      });

      await expect(
        handler.installKokoro('python3'),
      ).resolves.not.toThrow();
    });

    it('should use custom install command if provided', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(null, 'Successfully installed\n', ''));
      });

      const customCmd = 'pip install kokoro-tts';
      await expect(
        handler.installKokoro('python3', customCmd),
      ).resolves.not.toThrow();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(customCmd),
        expect.anything(),
        expect.any(Function),
      );
    });

    it('should throw on install failure', async () => {
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        setImmediate(() => callback(new Error('Could not find a version')));
      });

      await expect(
        handler.installKokoro('python3'),
      ).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('isProcessRunning', () => {
    it('should return true when process is running', async () => {
      // Mock process.kill to succeed (signal 0 check)
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as any);

      const running = await handler.isProcessRunning(12345);
      expect(running).toBe(true);

      killSpy.mockRestore();
    });

    it('should return false when process is not running', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const running = await handler.isProcessRunning(12345);
      expect(running).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('getProcessStatus', () => {
    it('should return status for running process', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as any);
      mockExecSync.mockImplementationOnce((...args: any[]) => {
        const callback = args[args.length - 1] as any;
        // ps output: "etime" + "rss"
        setImmediate(() => callback(null, '00:02:30 51200\n', ''));
      });

      const status = await handler.getProcessStatus(12345);
      expect(status.running).toBe(true);
      // Memory should be parsed from output
      expect(status).toHaveProperty('memory');

      killSpy.mockRestore();
    });

    it('should return not running for stopped process', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const status = await handler.getProcessStatus(12345);
      expect(status.running).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('stopProcess', () => {
    it('should stop process gracefully with SIGTERM', async () => {
      let killCount = 0;
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 'SIGTERM') {
          killCount++;
          // Simulate immediate kill on SIGTERM
          return true as any;
        }
        if (signal === 0) {
          // After SIGTERM, next signal 0 check says process is dead
          killCount++;
          if (killCount > 1) {
            throw new Error('ESRCH');
          }
          return true as any;
        }
        return true as any;
      });

      await expect(
        handler.stopProcess(12345, 1000),
      ).resolves.not.toThrow();

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');

      killSpy.mockRestore();
    });

    it('should force kill if graceful shutdown times out', async () => {
      let sigTermAttempted = false;
      let sigKillSent = false;
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 'SIGTERM') {
          sigTermAttempted = true;
          // Don't actually kill - simulate process doesn't respond
          return true as any;
        }
        if (signal === 0) {
          // Signal 0 check - process still running until SIGKILL is sent
          if (sigKillSent) {
            // After SIGKILL, process is dead - throw ESRCH
            throw new Error('ESRCH: no such process');
          }
          return true as any;
        }
        if (signal === 'SIGKILL') {
          sigKillSent = true;
          // SIGKILL succeeds
          return true as any;
        }
        throw new Error('ESRCH');
      });

      await expect(
        handler.stopProcess(12345, 50),
      ).resolves.not.toThrow();

      expect(sigTermAttempted).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL');

      killSpy.mockRestore();
    });
  });

  describe('startProcess', () => {
    it('should detect python and start process', async () => {
      mockExecSync
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // detectPython
          setImmediate(() => callback(null, 'Python 3.11.0\n', ''));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // checkKokoroInstalled
          setImmediate(() => callback(null, 'Name: kokoro\n', ''));
        });

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementationOnce((cmd: string, args: any[]) => {
        return createMockChildProcess({ pid: 12345, exitCode: 0 });
      });

      // Mock process.kill for PID check
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as any);

      const pid = await handler.startProcess({});
      expect(pid).toBeGreaterThan(0);
      expect(mockSpawn).toHaveBeenCalledWith('python3', ['-m', 'kokoro'], expect.any(Object));

      killSpy.mockRestore();
    });

    it('should install kokoro if not present', async () => {
      mockExecSync
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // detectPython
          setImmediate(() => callback(null, 'Python 3.11.0\n', ''));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // checkKokoroInstalled - not found
          setImmediate(() => callback(new Error('WARNING: Package not found')));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          // installKokoro
          setImmediate(() => callback(null, 'Successfully installed\n', ''));
        });

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementationOnce((cmd: string, args: any[]) => {
        return createMockChildProcess({ pid: 12345, exitCode: 0 });
      });

      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as any);

      const pid = await handler.startProcess({});
      expect(pid).toBeGreaterThan(0);

      // Verify install was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('pip install'),
        expect.anything(),
        expect.any(Function),
      );

      killSpy.mockRestore();
    });

    it('should emit error event when spawn fails', { timeout: 3000 }, async () => {
      // Mock detectPython and checkKokoroInstalled via mockExecSync
      mockExecSync
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          setImmediate(() => callback(null, 'Python 3.11.0\n', ''));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          setImmediate(() => callback(null, 'Name: kokoro\n', ''));
        });

      const mockSpawn = vi.mocked(spawn);
      const spawnError = new Error('spawn ENOENT');
      mockSpawn.mockImplementationOnce((cmd: string, args: any[]) => {
        return createMockChildProcess({
          pid: 12345,
          exitCode: 127,
          emitError: spawnError,
        });
      });

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
        // When checking if the process is running, it should NOT be running after error
        if (signal === 0) {
          throw new Error('ESRCH: no such process');
        }
        return true as any;
      });

      // Process should handle the error - the process exited with code 127 after error event
      let errorThrown: any;
      try {
        await handler.startProcess({});
      } catch (error) {
        errorThrown = error;
      }

      expect(errorThrown).toBeDefined();
      killSpy.mockRestore();
    });

    it('should handle process stdout and stderr streams', async () => {
      mockExecSync
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          setImmediate(() => callback(null, 'Python 3.11.0\n', ''));
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1] as any;
          setImmediate(() => callback(null, 'Name: kokoro\n', ''));
        });

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementationOnce((cmd: string, args: any[]) => {
        const childProc = createMockChildProcess({ pid: 12345, exitCode: 0 });
        // Simulate stream data
        setImmediate(() => {
          childProc.stdout.emit('data', Buffer.from('Output line\n'));
          childProc.stderr.emit('data', Buffer.from('Error line\n'));
        });
        return childProc;
      });

      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as any);

      const pid = await handler.startProcess({});
      expect(pid).toBeGreaterThan(0);

      killSpy.mockRestore();
    });
  });
});
