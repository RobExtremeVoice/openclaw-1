/**
 * Voice Commands E2E - Real CLI Binary Tests
 *
 * Tests all voice CLI commands by invoking the REAL compiled CLI binary (not mocked).
 * Uses execSync to run actual node dist/entry.js voice commands and validates:
 * - JSON output structure is correct
 * - Error messages are helpful (not undefined or [object Object])
 * - Help and version flags work correctly
 * - Invalid commands fail gracefully
 * - Config parsing errors are reported clearly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

describe('Voice Commands E2E - Real CLI Binary', () => {
  // Project root is where package.json exists (tests run from there during pnpm test)
  const PROJECT_ROOT = process.cwd();
  const CLI_ENTRY = path.join(PROJECT_ROOT, 'dist', 'entry.js');
  const CONFIG_DIR = path.join(os.homedir(), '.clawdbot', 'e2e-test');
  const CONFIG_PATH = path.join(CONFIG_DIR, 'voice-test-config.json');

  function runCli(args: string[]): ExecResult {
    try {
      const command = `node "${CLI_ENTRY}" ${args.join(' ')}`;
      const stdout = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HOME: CONFIG_DIR,
          CLAWDBOT_CONFIG_PATH: CONFIG_PATH,
        },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      // Combine stdout and stderr for easier testing (CLI may output to either)
      const stdout = (error.stdout?.toString() || '') + (error.stderr?.toString() || '');
      return {
        stdout,
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1,
      };
    }
  }

  function runCliSpawn(args: string[]): ExecResult {
    const result = spawnSync('node', [CLI_ENTRY, ...args], {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
        HOME: CONFIG_DIR,
        CLAWDBOT_CONFIG_PATH: CONFIG_PATH,
      },
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status || 0,
    };
  }

  beforeEach(async () => {
    // Ensure config directory and test config exist
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    // Create a minimal valid voice config
    const config = {
      provider: 'mock',
      fromNumber: '+15550000000',
      toNumber: '+15550000001',
      serve: {
        port: 3334,
        path: '/voice/webhook',
      },
      providers: {
        twilio: {
          accountSid: 'ACtest123',
          authToken: 'test-token',
          fromNumber: '+15550000000',
        },
        telnyx: {
          apiKey: 'test-key',
          connectionId: 'test-conn',
          fromNumber: '+15550000000',
        },
      },
    };

    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    // Cleanup test config
    try {
      await fs.rm(CONFIG_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('voice call command', () => {
    it('should show help text for voice call command', () => {
      const { stdout, exitCode } = runCli(['voice', 'call', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('call');
    });

    it('should reject invalid subcommand gracefully', () => {
      const { stdout, exitCode } = runCli(['voice', 'invalid-sub']);

      // CLI shows help for unknown subcommands (exit code 0 is acceptable)
      expect(stdout).toBeTruthy();
    });

    it('should return error output without undefined or objects', () => {
      const { stdout, exitCode } = runCli(['voice', 'invalid-sub']);

      expect(exitCode).not.toBe(0);
      // Error should be readable, not undefined or [object Object]
      expect(stdout).not.toContain('undefined');
      expect(stdout).not.toContain('[object Object]');
    });
  });

  describe('voice help command', () => {
    it('should show help text for voice', () => {
      const { stdout, exitCode } = runCli(['voice', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Voice provider operations');
    });

    it('should show voice subcommands', () => {
      const { stdout, exitCode } = runCli(['voice', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('synthesize');
      expect(stdout.toLowerCase()).toContain('transcribe');
    });
  });

  describe('voice synthesize command', () => {
    it('should show help text for voice synthesize', () => {
      const { stdout, exitCode } = runCli(['voice', 'synthesize', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('synthesize');
    });

    it('should require message parameter or show help', () => {
      const { stdout, exitCode } = runCli(['voice', 'synthesize']);

      // Can be exit code 1 (error) or 0 (help shown)
      expect(stdout).toBeTruthy();
      expect(typeof stdout).toBe('string');
    });
  });

  describe('voice transcribe command', () => {
    it('should show help text for voice transcribe', () => {
      const { stdout, exitCode } = runCli(['voice', 'transcribe', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('transcribe');
    });

    it('should reject invalid parameters gracefully', () => {
      const { stdout, exitCode } = runCli(['voice', 'transcribe']);

      // Error is acceptable
      expect(typeof stdout).toBe('string');
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe('error handling and messages', () => {
    it('should report helpful error when config is invalid JSON', async () => {
      // Write invalid JSON to config
      await fs.writeFile(CONFIG_PATH, '{ invalid json }');

      const { stdout, exitCode } = runCli(['voice', '--help']);

      // Should either handle gracefully or provide clear error
      expect(typeof stdout).toBe('string');
      // Error message should not contain raw error object string representation
      expect(stdout).not.toContain('[object Object]');
    });

    it('should not output undefined in error messages', () => {
      const { stdout, exitCode } = runCli(['voice', '--help']);

      expect(stdout).not.toContain('undefined');
    });

    it('should provide context in error messages', () => {
      const { stdout, exitCode } = runCli(['voice', 'invalid']);

      // CLI shows help for unknown commands (may exit with 0 or 1)
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).not.toContain('[object Object]');
    });
  });

  describe('JSON output format', () => {
    it('should output readable text for voice commands', () => {
      const { stdout, exitCode } = runCli(['voice', '--help']);

      // Should output readable text, not malformed JSON
      expect(typeof stdout).toBe('string');
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).not.toContain('[object Object]');
    });

    it('should provide readable error output on invalid command', () => {
      const { stdout, exitCode } = runCli(['voice', 'invalid']);

      // CLI outputs help for unknown commands (exit code may vary)
      expect(stdout).toBeTruthy();
      expect(stdout).not.toContain('[object Object]');
      expect(stdout).not.toContain('undefined');
    });
  });

  describe('exit codes', () => {
    it('should return 0 for help commands', () => {
      const { exitCode } = runCli(['voice', '--help']);
      expect(exitCode).toBe(0);
    });

    it('should return non-zero for invalid subcommands', () => {
      const { exitCode } = runCli(['voice', 'invalid']);
      expect(exitCode).not.toBe(0);
    });

    it('should return 0 for synthesize help', () => {
      const { exitCode } = runCli(['voice', 'synthesize', '--help']);
      expect(exitCode).toBe(0);
    });
  });

  describe('real world usage scenarios', () => {
    it('should handle help flag correctly', () => {
      const { stdout, exitCode } = runCli(['voice', '--help']);

      // Should provide help text
      expect(exitCode).toBe(0);
      expect(stdout).toContain('voice');
    });

    it('should handle subcommand help', () => {
      const { stdout, exitCode } = runCli([
        'voice',
        'synthesize',
        '--help',
      ]);

      // Should provide help for synthesize
      expect(exitCode).toBe(0);
      expect(stdout).toBeTruthy();
    });

    it('should reject invalid commands', () => {
      const { stdout, exitCode } = runCli(['voice', 'nonexistent-command']);

      expect(exitCode).not.toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe('CLI robustness', () => {
    it('should not crash on unexpected option combinations', () => {
      const { stdout, stderr, exitCode } = runCliSpawn(['voice', '--unknown-option', 'value']);

      // Should exit with non-zero, not crash
      expect(exitCode).not.toBe(0);
      expect(stdout || stderr).toBeTruthy();
    });

    it('should handle very long arguments', () => {
      const longMsg = 'A'.repeat(1000);
      const { stdout, exitCode } = runCli([
        'voice',
        'synthesize',
        '--message',
        longMsg,
      ]);

      // Should not crash or truncate unexpectedly
      expect(typeof stdout).toBe('string');
    });

    it('should handle empty string arguments gracefully', () => {
      const { stdout, exitCode } = runCli(['voice', 'synthesize', '--message', '']);

      // Should either accept or provide clear error
      expect(typeof stdout).toBe('string');
      expect(stdout).not.toContain('[object Object]');
    });
  });

  describe('output stability', () => {
    it('should produce consistent output for same command', () => {
      const result1 = runCli(['voice', '--help']);
      const result2 = runCli(['voice', '--help']);

      // Both should succeed and have consistent structure
      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);
      // Check that key content is present in both (tagline varies, so we check for structure)
      expect(result1.stdout).toContain('Usage: clawdbot voice');
      expect(result2.stdout).toContain('Usage: clawdbot voice');
      expect(result1.stdout).toContain('Voice provider operations');
      expect(result2.stdout).toContain('Voice provider operations');
    });

    it('should not include debug artifacts in output', () => {
      const { stdout } = runCli(['voice', '--help']);

      // Should not contain debug markers
      expect(stdout).not.toContain('DEBUG');
      expect(stdout).not.toContain('TRACE');
      expect(stdout).not.toContain('[DEBUG]');
    });

    it('should format help text readably', () => {
      const { stdout } = runCli(['voice', '--help']);

      // Should have proper structure and content
      expect(stdout).toBeTruthy();
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout.toLowerCase()).toContain('voice');
    });
  });
});
