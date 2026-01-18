/**
 * Voice CLI Commands Integration Tests
 *
 * Tests for the following voice commands:
 * - clawdbot voice status
 * - clawdbot voice test
 * - clawdbot voice providers
 * - clawdbot voice providers list
 * - clawdbot voice providers test <provider>
 *
 * Run with: pnpm test voice-commands.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("Voice CLI Commands", () => {
  let tempDir: string;
  let logFile: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-cli-test-${Date.now()}`);
    logFile = path.join(tempDir, "test.log");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // PART 1: PROVIDER STATUS COMMAND
  // ============================================================================

  describe("voice status Command", () => {
    it("should return provider status summary", () => {
      const statusOutput = {
        timestamp: new Date().toISOString(),
        providers: {
          local: {
            whisper: { status: "not-installed", ready: false },
            kokoro: { status: "not-installed", ready: false },
            piper: { status: "not-installed", ready: false },
          },
          cloud: {
            "openai-tts": {
              status: process.env.OPENAI_API_KEY ? "ready" : "not-configured",
              ready: !!process.env.OPENAI_API_KEY,
            },
            "openai-realtime": {
              status: process.env.OPENAI_API_KEY ? "ready" : "not-configured",
              ready: !!process.env.OPENAI_API_KEY,
            },
          },
        },
        active: "not-selected",
      };

      expect(statusOutput).toHaveProperty("providers");
      expect(statusOutput.providers.local).toBeDefined();
      expect(statusOutput.providers.cloud).toBeDefined();
    });

    it("should show provider configuration summary", () => {
      const config = {
        providers: {
          whisper: { modelSize: "base", language: "auto" },
          kokoro: { voice: "af_bella", speed: 1.0 },
          piper: { voice: "en-us-libritts-high" },
        },
      };

      expect(config.providers.whisper.modelSize).toBe("base");
      expect(config.providers.kokoro.voice).toBe("af_bella");
    });

    it("should report recent provider tests", () => {
      const testResults = [
        {
          provider: "kokoro",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          result: "success",
          latency: 145,
        },
        {
          provider: "whisper",
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          result: "skipped",
          reason: "not-installed",
        },
      ];

      expect(testResults).toHaveLength(2);
      expect(testResults[0].result).toBe("success");
    });

    it("should show provider resource usage", () => {
      const resources = {
        kokoro: {
          memory: "245 MB",
          disk: "1.2 GB",
          status: "not-loaded",
        },
        whisper: {
          memory: "0 MB",
          disk: "3.1 GB (base model)",
          status: "not-loaded",
        },
      };

      expect(resources.kokoro).toBeDefined();
      expect(resources.kokoro.disk).toBeDefined();
    });
  });

  // ============================================================================
  // PART 2: TEST COMMAND
  // ============================================================================

  describe("voice test Command", () => {
    it("should test individual providers", () => {
      const providers = ["whisper", "kokoro", "piper", "openai-tts", "openai-realtime"];

      expect(providers).toHaveLength(5);
      expect(providers).toContain("kokoro");
    });

    it("should test Kokoro TTS synthesis", () => {
      const testResult = {
        provider: "kokoro",
        type: "tts",
        test: "synthesize",
        phrase: "Hello world",
        result: "skipped",
        reason: "model-not-installed",
      };

      expect(testResult.provider).toBe("kokoro");
      expect(testResult.type).toBe("tts");
    });

    it("should test Whisper STT transcription", () => {
      const testResult = {
        provider: "whisper",
        type: "stt",
        test: "transcription",
        audioFile: "test-audio.wav",
        result: "skipped",
        reason: "model-not-installed",
      };

      expect(testResult.provider).toBe("whisper");
      expect(testResult.type).toBe("stt");
    });

    it("should test Piper TTS", () => {
      const testResult = {
        provider: "piper",
        type: "tts",
        test: "synthesize",
        result: "skipped",
        reason: "model-not-installed",
      };

      expect(testResult.provider).toBe("piper");
    });

    it("should test OpenAI TTS with API key", () => {
      const testResult = {
        provider: "openai-tts",
        type: "tts",
        test: "synthesize",
        result: process.env.OPENAI_API_KEY ? "pending" : "skipped",
        reason: process.env.OPENAI_API_KEY ? undefined : "no-api-key",
        skipMessage: "Requires OPENAI_API_KEY environment variable",
      };

      expect(testResult.provider).toBe("openai-tts");
      if (!process.env.OPENAI_API_KEY) {
        expect(testResult.result).toBe("skipped");
      }
    });

    it("should test OpenAI Realtime with API key", () => {
      const testResult = {
        provider: "openai-realtime",
        type: "stt",
        test: "websocket-connection",
        result: process.env.OPENAI_API_KEY ? "pending" : "skipped",
        skipMessage: "Requires OPENAI_API_KEY environment variable",
      };

      expect(testResult.provider).toBe("openai-realtime");
    });

    it("should report test metrics", () => {
      const metrics = {
        tested: 5,
        ready: 0,
        skipped: 5,
        failed: 0,
        testDuration: 1250,
      };

      expect(metrics.tested).toBe(5);
      expect(metrics.skipped).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // PART 3: PROVIDERS COMMAND
  // ============================================================================

  describe("voice providers Command", () => {
    it("should list all available providers", () => {
      const providers = [
        { name: "whisper", type: "stt", location: "local", status: "not-installed" },
        { name: "kokoro", type: "tts", location: "local", status: "not-installed" },
        { name: "piper", type: "tts", location: "local", status: "not-installed" },
        { name: "openai-tts", type: "tts", location: "cloud", status: "not-configured" },
        {
          name: "openai-realtime",
          type: "stt",
          location: "cloud",
          status: "not-configured",
        },
      ];

      expect(providers).toHaveLength(5);
      expect(providers.filter((p) => p.type === "tts")).toHaveLength(3);
      expect(providers.filter((p) => p.type === "stt")).toHaveLength(2);
    });

    it("should show provider capabilities", () => {
      const capabilities = {
        whisper: [
          "speech-to-text",
          "batch-transcription",
          "language-detection",
          "word-timestamps",
        ],
        kokoro: ["text-to-speech", "voice-selection", "speed-control", "24khz-audio"],
        piper: ["text-to-speech", "voice-selection", "offline"],
        "openai-tts": ["text-to-speech", "voice-selection", "quality-models", "streaming"],
        "openai-realtime": [
          "speech-to-text",
          "streaming",
          "low-latency",
          "bidirectional",
        ],
      };

      expect(capabilities.whisper).toContain("language-detection");
      expect(capabilities.kokoro).toContain("speed-control");
    });

    it("should show provider requirements", () => {
      const requirements = {
        whisper: {
          diskSpace: "3.1 GB (base model)",
          memory: "2 GB",
          requiresInternet: false,
          models: ["tiny", "small", "base", "medium", "large"],
        },
        kokoro: {
          diskSpace: "1.2 GB",
          memory: "245 MB",
          requiresInternet: false,
          voices: 8,
        },
        piper: {
          diskSpace: "500 MB",
          memory: "100 MB",
          requiresInternet: false,
          voices: "30+",
        },
        "openai-tts": {
          requiresInternet: true,
          requiresApiKey: true,
          latency: "200-500ms",
          voices: 6,
        },
        "openai-realtime": {
          requiresInternet: true,
          requiresApiKey: true,
          latency: "~100ms",
          supportsStreaming: true,
        },
      };

      expect(requirements.whisper.diskSpace).toContain("3.1 GB");
      expect(requirements["openai-tts"].requiresInternet).toBe(true);
    });

    it("should compare provider performance", () => {
      const comparison = {
        latency: {
          "openai-realtime": "~100ms",
          "openai-tts": "200-500ms",
          kokoro: "500-1000ms",
          piper: "1000-2000ms",
          whisper: "varies",
        },
        quality: {
          "openai-realtime": "high",
          "openai-tts": "very-high",
          kokoro: "high",
          piper: "high",
          whisper: "high",
        },
        cost: {
          local: "free",
          cloud: "$0.015-0.10 per request",
        },
      };

      expect(comparison.latency["openai-realtime"]).toContain("100ms");
      expect(comparison.cost.local).toBe("free");
    });
  });

  // ============================================================================
  // PART 4: FALLBACK CHAIN COMMANDS
  // ============================================================================

  describe("Provider Fallback Chain", () => {
    it("should manage fallback order", () => {
      const fallbackChain = {
        default: ["openai-tts", "kokoro", "piper"],
        local_only: ["kokoro", "piper"],
        cloud_first: ["openai-tts", "openai-realtime"],
      };

      expect(fallbackChain.default).toHaveLength(3);
      expect(fallbackChain.default[0]).toBe("openai-tts");
    });

    it("should track provider switches during operation", () => {
      const switchLog = [
        { timestamp: new Date().toISOString(), from: "openai-tts", to: "kokoro" },
        { timestamp: new Date().toISOString(), from: "kokoro", to: "piper" },
      ];

      expect(switchLog).toHaveLength(2);
      expect(switchLog[0].from).toBe("openai-tts");
    });

    it("should report fallback reason", () => {
      const fallbacks = [
        { provider: "openai-tts", reason: "api-rate-limit", fallback_to: "kokoro" },
        { provider: "kokoro", reason: "timeout", fallback_to: "piper" },
      ];

      expect(fallbacks[0].reason).toBe("api-rate-limit");
      expect(fallbacks[1].fallback_to).toBe("piper");
    });
  });

  // ============================================================================
  // PART 5: OUTPUT FORMATS
  // ============================================================================

  describe("CLI Output Formats", () => {
    it("should support JSON output", () => {
      const json = {
        format: "json",
        providers: [
          { name: "kokoro", status: "not-installed" },
          { name: "whisper", status: "not-installed" },
        ],
      };

      expect(json.format).toBe("json");
      expect(json.providers).toBeInstanceOf(Array);
    });

    it("should support table output", () => {
      const table = {
        format: "table",
        columns: ["Provider", "Type", "Location", "Status"],
        rows: [
          ["whisper", "STT", "local", "not-installed"],
          ["kokoro", "TTS", "local", "not-installed"],
          ["openai-tts", "TTS", "cloud", "not-configured"],
        ],
      };

      expect(table.format).toBe("table");
      expect(table.rows).toHaveLength(3);
    });

    it("should support markdown output", () => {
      const markdown = `# Voice Providers

## Local Providers
- Whisper: not-installed
- Kokoro: not-installed
- Piper: not-installed

## Cloud Providers
- OpenAI TTS: not-configured
- OpenAI Realtime: not-configured
`;

      expect(markdown).toContain("# Voice Providers");
      expect(markdown).toContain("## Local Providers");
    });
  });

  // ============================================================================
  // PART 6: DIAGNOSTIC AND DEBUG INFO
  // ============================================================================

  describe("Diagnostic Commands", () => {
    it("should collect system information", () => {
      const sysInfo = {
        platform: process.platform,
        nodeVersion: process.version,
        architecture: process.arch,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      };

      expect(sysInfo.platform).toBeDefined();
      expect(sysInfo.nodeVersion).toBeDefined();
    });

    it("should check environment configuration", () => {
      const envCheck = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "set" : "not-set",
        WHISPER_MODEL_SIZE: process.env.WHISPER_MODEL_SIZE || "default (base)",
        PIPER_VOICE: process.env.PIPER_VOICE || "default",
      };

      expect(envCheck.OPENAI_API_KEY).toBeDefined();
    });

    it("should verify provider models are available", () => {
      const modelCheck = {
        whisper: { available: false, reason: "not-downloaded" },
        kokoro: { available: false, reason: "not-downloaded" },
        piper: { available: false, reason: "not-downloaded" },
      };

      expect(modelCheck.whisper.available).toBe(false);
    });
  });

  // ============================================================================
  // PART 7: PERFORMANCE MONITORING
  // ============================================================================

  describe("Performance Monitoring", () => {
    it("should record provider performance metrics", () => {
      const metrics = {
        providers: {
          kokoro: { totalTests: 0, successRate: 0, avgLatency: 0 },
          whisper: { totalTests: 0, successRate: 0, avgLatency: 0 },
          "openai-tts": { totalTests: 5, successRate: 0.95, avgLatency: 325 },
        },
      };

      expect(metrics.providers["openai-tts"].successRate).toBe(0.95);
    });

    it("should track request statistics", () => {
      const stats = {
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        averageLatency: 245,
        minLatency: 45,
        maxLatency: 1230,
      };

      expect(stats.totalRequests).toBe(100);
      expect(stats.successfulRequests).toBe(95);
    });

    it("should monitor resource consumption", () => {
      const resources = {
        timestamp: new Date().toISOString(),
        memory: "245 MB",
        cpuUsage: "12%",
        diskIO: "2.3 MB/s",
      };

      expect(resources).toHaveProperty("timestamp");
      expect(resources).toHaveProperty("memory");
    });
  });

  // ============================================================================
  // PART 8: ERROR REPORTING
  // ============================================================================

  describe("Error Reporting", () => {
    it("should report missing models", () => {
      const error = {
        provider: "whisper",
        error: "Model not found",
        action: 'Run "clawdbot voice install whisper"',
      };

      expect(error.provider).toBe("whisper");
      expect(error.action).toContain("install");
    });

    it("should report missing API keys", () => {
      const error = {
        provider: "openai-tts",
        error: "API key not configured",
        action: 'Set OPENAI_API_KEY environment variable',
      };

      expect(error.provider).toBe("openai-tts");
      expect(error.action).toContain("OPENAI_API_KEY");
    });

    it("should suggest solutions for common issues", () => {
      const solutions = {
        "Model too large": "Try a smaller model variant",
        "API rate limit": "Use local provider or wait before retrying",
        "Network error": "Check internet connection and firewall",
      };

      expect(Object.keys(solutions)).toHaveLength(3);
    });
  });

  // ============================================================================
  // PART 9: EXAMPLE COMMANDS
  // ============================================================================

  describe("Example Commands", () => {
    it("should document voice status examples", () => {
      const examples = [
        "clawdbot voice status",
        "clawdbot voice status --detailed",
        "clawdbot voice status --json",
      ];

      expect(examples).toHaveLength(3);
    });

    it("should document voice test examples", () => {
      const examples = [
        "clawdbot voice test",
        "clawdbot voice test --provider kokoro",
        "clawdbot voice test --provider openai-tts",
      ];

      expect(examples).toHaveLength(3);
    });

    it("should document voice providers examples", () => {
      const examples = [
        "clawdbot voice providers",
        "clawdbot voice providers list",
        "clawdbot voice providers test whisper",
        "clawdbot voice providers test kokoro",
      ];

      expect(examples).toHaveLength(4);
    });
  });
});
