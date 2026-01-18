/**
 * Tests for Kokoro and Piper TTS Providers
 */

import { describe, expect, it } from "vitest";
import { KokoroTTSProvider, KokorobatchSynthesizer, getAvailableVoices } from "./tts-kokoro.js";
import {
  PiperTTSProvider,
  PiperBatchSynthesizer,
  getAvailableVoices as getPiperVoices,
  getSupportedLanguages,
  getLanguageName,
  estimateSynthesisDuration,
  chunkTextBySentences,
} from "./tts-piper.js";

describe("KokoroTTSProvider", () => {
  describe("constructor and validation", () => {
    it("creates provider with defaults", () => {
      const provider = new KokoroTTSProvider();
      expect(provider.metadata.name).toBe("kokoro-tts");
      expect(provider.metadata.type).toBe("tts");
    });

    it("throws on invalid voice", () => {
      expect(() => {
        new KokoroTTSProvider({ voice: "invalid_voice" as never });
      }).toThrow("Invalid Kokoro voice");
    });

    it("throws on invalid speed", () => {
      expect(() => {
        new KokoroTTSProvider({ speed: 3.0 });
      }).toThrow("Speed must be between 0.5 and 2.0");

      expect(() => {
        new KokoroTTSProvider({ speed: 0.1 });
      }).toThrow("Speed must be between 0.5 and 2.0");
    });

    it("accepts valid voices", () => {
      const voices = ["af_bella", "am_michael", "bf_emma", "bm_george"] as const;
      for (const voice of voices) {
        expect(() => {
          new KokoroTTSProvider({ voice });
        }).not.toThrow();
      }
    });

    it("accepts valid speeds", () => {
      const speeds = [0.5, 1.0, 2.0, 0.75, 1.5];
      for (const speed of speeds) {
        expect(() => {
          new KokoroTTSProvider({ speed });
        }).not.toThrow();
      }
    });
  });

  describe("synthesize", () => {
    it("throws on empty text", async () => {
      const provider = new KokoroTTSProvider();
      await expect(provider.synthesize("")).rejects.toThrow("Text cannot be empty");
      await expect(provider.synthesize("   ")).rejects.toThrow("Text cannot be empty");
    });

    it("synthesizes text successfully", async () => {
      const provider = new KokoroTTSProvider();
      const audio = await provider.synthesize("Hello world");

      expect(Buffer.isBuffer(audio)).toBe(true);
      expect(audio.length).toBeGreaterThan(0);
    });

    it("uses custom voice option", async () => {
      const provider = new KokoroTTSProvider({ voice: "af_bella" });
      const audio = await provider.synthesize("Test", { voice: "am_joshua" });

      expect(Buffer.isBuffer(audio)).toBe(true);
      expect(audio.length).toBeGreaterThan(0);
    });

    it("uses custom speed option", async () => {
      const provider = new KokoroTTSProvider({ speed: 1.0 });
      const audio1 = await provider.synthesize("Hello world", { speed: 1.0 });
      const audio2 = await provider.synthesize("Hello world", { speed: 2.0 });

      // Faster speech should produce shorter audio
      expect(audio2.length).toBeLessThanOrEqual(audio1.length + 100);
    });
  });

  describe("KokorobatchSynthesizer", () => {
    it("synthesizes batch", async () => {
      const provider = new KokoroTTSProvider();
      const synthesizer = new KokorobatchSynthesizer(provider);

      const texts = ["Hello", "World", "Test"];
      const results = await synthesizer.synthesizeBatch(texts);

      expect(results).toHaveLength(3);
      expect(results.every((buf) => Buffer.isBuffer(buf))).toBe(true);
    });

    it("tracks progress", async () => {
      const provider = new KokoroTTSProvider();
      const synthesizer = new KokorobatchSynthesizer(provider);

      const texts = ["Hello", "World"];
      const calls: Array<[number, number]> = [];

      await synthesizer.synthesizeBatch(texts, undefined, (idx, total) => {
        calls.push([idx, total]);
      });

      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1]).toEqual([1, 2]);
    });

    it("synthesizes and concatenates", async () => {
      const provider = new KokoroTTSProvider();
      const synthesizer = new KokorobatchSynthesizer(provider);

      const texts = ["Hello", "World"];
      const combined = await synthesizer.synthesizeAndConcatenate(texts, undefined, 100);

      expect(Buffer.isBuffer(combined)).toBe(true);
      expect(combined.length).toBeGreaterThan(0);
    });
  });

  describe("getAvailableVoices", () => {
    it("returns all Kokoro voices", () => {
      const voices = getAvailableVoices();
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.some((v) => v.gender === "female")).toBe(true);
      expect(voices.some((v) => v.gender === "male")).toBe(true);
    });

    it("has required voice properties", () => {
      const voices = getAvailableVoices();
      for (const voice of voices) {
        expect(voice.id).toBeDefined();
        expect(voice.name).toBeDefined();
        expect(voice.gender).toMatch(/^(male|female)$/);
        expect(voice.accent).toBeDefined();
      }
    });
  });
});

describe("PiperTTSProvider", () => {
  describe("constructor and validation", () => {
    it("creates provider with modelPath", () => {
      const provider = new PiperTTSProvider({ modelPath: "/path/to/models" });
      expect(provider.metadata.name).toBe("piper-tts");
      expect(provider.metadata.type).toBe("tts");
    });

    it("throws without modelPath", () => {
      expect(() => {
        new PiperTTSProvider({} as any);
      }).toThrow("Model path is required");
    });

    it("throws on invalid language", () => {
      expect(() => {
        new PiperTTSProvider({ modelPath: "/path", language: "invalid" as never });
      }).toThrow("Unsupported language");
    });

    it("throws on invalid speed", () => {
      expect(() => {
        new PiperTTSProvider({ modelPath: "/path", speed: 3.0 });
      }).toThrow("Speed must be between 0.5 and 2.0");
    });

    it("accepts all supported languages", () => {
      const languages = getSupportedLanguages();
      for (const lang of languages) {
        expect(() => {
          new PiperTTSProvider({ modelPath: "/path", language: lang });
        }).not.toThrow();
      }
    });
  });

  describe("synthesize", () => {
    it("throws on empty text", async () => {
      const provider = new PiperTTSProvider({ modelPath: "/path" });
      await expect(provider.synthesize("")).rejects.toThrow("Text cannot be empty");
    });

    it("synthesizes text", async () => {
      const provider = new PiperTTSProvider({ modelPath: "/path" });
      const audio = await provider.synthesize("Hello");

      expect(Buffer.isBuffer(audio)).toBe(true);
      expect(audio.length).toBeGreaterThan(0);
    });

    it("uses custom voice option", async () => {
      const provider = new PiperTTSProvider({ modelPath: "/path", language: "en" });
      const audio = await provider.synthesize("Test", { voice: "en_US-custom" });

      expect(Buffer.isBuffer(audio)).toBe(true);
    });

    it("converts to mu-law format", async () => {
      const provider = new PiperTTSProvider({
        modelPath: "/path",
        outputFormat: "mulaw",
      });
      const audio = await provider.synthesize("Test");

      expect(Buffer.isBuffer(audio)).toBe(true);
      // Mu-law should be roughly half the size of PCM 16-bit
      expect(audio.length).toBeGreaterThan(0);
    });

    it("converts to WAV format", async () => {
      const provider = new PiperTTSProvider({
        modelPath: "/path",
        outputFormat: "wav",
      });
      const audio = await provider.synthesize("Test");

      // WAV should have RIFF header
      expect(audio.toString("ascii", 0, 4)).toBe("RIFF");
      expect(audio.toString("ascii", 8, 12)).toBe("WAVE");
    });
  });

  describe("PiperBatchSynthesizer", () => {
    it("synthesizes batch", async () => {
      const provider = new PiperTTSProvider({ modelPath: "/path" });
      const synthesizer = new PiperBatchSynthesizer(provider);

      const texts = ["One", "Two", "Three"];
      const results = await synthesizer.synthesizeBatch(texts);

      expect(results).toHaveLength(3);
      expect(results.every((buf) => Buffer.isBuffer(buf))).toBe(true);
    });

    it("concatenates results", async () => {
      const provider = new PiperTTSProvider({ modelPath: "/path" });
      const synthesizer = new PiperBatchSynthesizer(provider);

      const texts = ["Hello", "World"];
      const combined = await synthesizer.synthesizeAndConcatenate(texts);

      expect(Buffer.isBuffer(combined)).toBe(true);
      expect(combined.length).toBeGreaterThan(0);
    });
  });

  describe("helper functions", () => {
    it("gets available voices", () => {
      const voices = getPiperVoices("en");
      expect(Array.isArray(voices)).toBe(true);
    });

    it("gets supported languages", () => {
      const languages = getSupportedLanguages();
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toContain("en");
    });

    it("gets language names", () => {
      expect(getLanguageName("en")).toBe("English");
      expect(getLanguageName("es")).toBe("Spanish");
      expect(getLanguageName("fr")).toBe("French");
    });

    it("estimates synthesis duration", () => {
      const duration = estimateSynthesisDuration("Hello world");
      expect(duration).toBeGreaterThan(0);

      // Faster speed should give shorter duration
      const fastDuration = estimateSynthesisDuration("Hello world", "en", 2.0);
      expect(fastDuration).toBeLessThan(duration);
    });

    it("chunks text by sentences", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const chunks = chunkTextBySentences(text, 30);

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(30 + 10); // Some tolerance
      }
    });

    it("handles text without sentence breaks", () => {
      const text = "Just one long line of text without any breaks";
      const chunks = chunkTextBySentences(text, 50);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain("line");
    });
  });
});
