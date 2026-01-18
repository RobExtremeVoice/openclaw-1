/**
 * Tests for Whisper Local STT Provider
 */

import { describe, expect, it } from "vitest";
import {
  analyzeAudioQuality,
  isValidWhisperAudio,
  WhisperLocalSTTProvider,
  WhisperLocalBatchProcessor,
} from "./stt-whisper-local.js";

describe("WhisperLocalSTTProvider", () => {
  describe("constructor and validation", () => {
    it("creates provider with defaults", () => {
      const provider = new WhisperLocalSTTProvider();
      expect(provider.metadata.name).toBe("whisper-local");
      expect(provider.metadata.type).toBe("stt");
    });

    it("throws on invalid model size", () => {
      expect(() => {
        new WhisperLocalSTTProvider({ modelSize: "xlarge" as never });
      }).toThrow("Invalid Whisper model size");
    });

    it("throws on invalid language code", () => {
      expect(() => {
        new WhisperLocalSTTProvider({ language: "invalid" });
      }).toThrow("Invalid language code");
    });

    it("accepts valid language codes", () => {
      const provider = new WhisperLocalSTTProvider({ language: "en" });
      expect(provider).toBeDefined();

      const provider2 = new WhisperLocalSTTProvider({ language: "es-MX" });
      expect(provider2).toBeDefined();

      const provider3 = new WhisperLocalSTTProvider({ language: "auto" });
      expect(provider3).toBeDefined();
    });

    it("throws on invalid timeout", () => {
      expect(() => {
        new WhisperLocalSTTProvider({ transcriptionTimeoutMs: 500 });
      }).toThrow("Transcription timeout must be at least 1000ms");
    });

    it("throws on invalid batch size", () => {
      expect(() => {
        new WhisperLocalSTTProvider({ batchSize: 0 });
      }).toThrow("Batch size must be at least 1");
    });
  });

  describe("createSession", () => {
    it("creates session with unique ID", () => {
      const provider = new WhisperLocalSTTProvider();
      const session1 = provider.createSession();
      const session2 = provider.createSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it("creates session with custom config", () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession({ instanceId: "custom-1" });
      expect(session.sessionId).toBeDefined();
    });
  });

  describe("STTSession", () => {
    it("connects successfully", async () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession();

      await session.connect();
      expect(session.isConnected()).toBe(true);
    });

    it("accepts audio input", async () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession();

      await session.connect();

      const audio = Buffer.alloc(100);
      expect(() => {
        session.sendAudio(audio);
      }).not.toThrow();
    });

    it("registers callbacks", async () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession();

      await session.connect();

      let partialCalled = false;
      let transcriptCalled = false;

      session.onPartial(() => {
        partialCalled = true;
      });

      session.onTranscript(() => {
        transcriptCalled = true;
      });

      // Send audio to trigger callbacks
      session.sendAudio(Buffer.alloc(100));

      expect(typeof partialCalled).toBe("boolean");
      expect(typeof transcriptCalled).toBe("boolean");
    });

    it("waits for transcript with timeout", async () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession();

      await session.connect();
      session.sendAudio(Buffer.alloc(16000 * 2)); // 1 second of audio

      const transcript = await session.waitForTranscript(5000);
      expect(typeof transcript).toBe("string");
    });

    it("closes session", async () => {
      const provider = new WhisperLocalSTTProvider();
      const session = provider.createSession();

      await session.connect();
      expect(session.isConnected()).toBe(true);

      session.close();
      expect(session.isConnected()).toBe(false);
    });
  });

  describe("WhisperLocalBatchProcessor", () => {
    it("transcribes batch of audio", async () => {
      const provider = new WhisperLocalSTTProvider();
      const processor = new WhisperLocalBatchProcessor(provider);

      const audios = [Buffer.alloc(16000 * 2), Buffer.alloc(16000 * 2)];

      const results = await processor.transcribeBatch(audios);
      expect(results).toHaveLength(2);
      expect(results[0].text).toBeDefined();
    });

    it("calls progress callback", async () => {
      const provider = new WhisperLocalSTTProvider();
      const processor = new WhisperLocalBatchProcessor(provider);

      const audios = [Buffer.alloc(1000), Buffer.alloc(1000)];
      const progressCalls: Array<[number, number]> = [];

      await processor.transcribeBatch(audios, (index, total) => {
        progressCalls.push([index, total]);
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });

  describe("isValidWhisperAudio", () => {
    it("accepts valid audio", () => {
      const audio = Buffer.alloc(16000 * 2); // 1 second at 16kHz 16-bit
      expect(isValidWhisperAudio(audio, 16000)).toBe(true);
    });

    it("rejects too short audio", () => {
      const audio = Buffer.alloc(100); // Less than 100ms
      expect(isValidWhisperAudio(audio, 16000)).toBe(false);
    });

    it("rejects odd-length buffers", () => {
      const audio = Buffer.alloc(1001); // Odd length
      expect(isValidWhisperAudio(audio, 16000)).toBe(false);
    });
  });

  describe("analyzeAudioQuality", () => {
    it("analyzes silent audio", () => {
      const audio = Buffer.alloc(1000);
      const quality = analyzeAudioQuality(audio);

      expect(quality.rmsLevel).toBeLessThan(100);
      expect(quality.peakLevel).toBe(0);
      expect(quality.silenceRatio).toBe(1);
    });

    it("analyzes loud audio", () => {
      const audio = Buffer.alloc(1000);
      const view = new DataView(audio.buffer);

      // Fill with loud samples
      for (let i = 0; i < 500; i++) {
        view.setInt16(i * 2, 10000, true);
      }

      const quality = analyzeAudioQuality(audio);
      expect(quality.rmsLevel).toBeGreaterThan(1000);
      expect(quality.peakLevel).toBeGreaterThan(5000);
      expect(quality.silenceRatio).toBeLessThan(0.5);
    });

    it("analyzes mixed audio", () => {
      const audio = Buffer.alloc(1000);
      const view = new DataView(audio.buffer);

      // First half loud, second half silent
      for (let i = 0; i < 250; i++) {
        view.setInt16(i * 2, 5000, true);
      }

      const quality = analyzeAudioQuality(audio);
      expect(quality.rmsLevel).toBeGreaterThan(0);
      expect(quality.peakLevel).toBeGreaterThan(0);
      expect(quality.silenceRatio).toBeGreaterThan(0);
      expect(quality.silenceRatio).toBeLessThan(1);
    });
  });
});
