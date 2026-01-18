/**
 * ElevenLabs TTS Provider Tests
 *
 * Comprehensive test suite for the ElevenLabs TTS provider with mocked API responses.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ElevenLabsTTSProvider,
  ElevenLabsBatchSynthesizer,
  getCommonVoices,
  findVoiceByName,
  getVoicesByGender,
  getVoicesByAccent,
  estimateCharacterCount,
  chunkTextBySentences,
} from "./tts-elevenlabs.js";
import type { TTSSynthesisOptions } from "../plugins/interfaces.js";

// Mock fetch
global.fetch = vi.fn();

describe("ElevenLabsTTSProvider", () => {
  let provider: ElevenLabsTTSProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ElevenLabsTTSProvider({
      apiKey: "test-api-key-12345",
    });
  });

  describe("initialization", () => {
    it("should initialize with default configuration", () => {
      expect(provider.metadata.name).toBe("elevenlabs-tts");
      expect(provider.metadata.type).toBe("tts");
      expect(provider.metadata.capabilities).toContain("streaming");
    });

    it("should throw error if API key is missing", () => {
      expect(() => {
        new ElevenLabsTTSProvider({ apiKey: "" });
      }).toThrow("ElevenLabs API key is required");
    });

    it("should validate stability parameter", () => {
      expect(() => {
        new ElevenLabsTTSProvider({
          apiKey: "test-key",
          stability: 1.5,
        });
      }).toThrow("Stability must be between 0 and 1");
    });

    it("should validate similarity boost parameter", () => {
      expect(() => {
        new ElevenLabsTTSProvider({
          apiKey: "test-key",
          similarityBoost: -0.5,
        });
      }).toThrow("Similarity boost must be between 0 and 1");
    });

    it("should validate output format", () => {
      expect(() => {
        new ElevenLabsTTSProvider({
          apiKey: "test-key",
          outputFormat: "invalid_format" as "mp3_22050_32",
        });
      }).toThrow("Invalid output format");
    });

    it("should accept valid configuration", () => {
      const config = new ElevenLabsTTSProvider({
        apiKey: "test-key",
        voiceId: "rachel",
        stability: 0.7,
        similarityBoost: 0.8,
        outputFormat: "mp3_44100_128",
      });

      expect(config.metadata.name).toBe("elevenlabs-tts");
    });
  });

  describe("synthesize", () => {
    it("should throw error if text is empty", async () => {
      await expect(provider.synthesize("")).rejects.toThrow("Text cannot be empty");
      await expect(provider.synthesize("   ")).rejects.toThrow("Text cannot be empty");
    });

    it("should synthesize text successfully", async () => {
      // Create valid PCM16 audio: alternating sine wave pattern
      const mockAudio = Buffer.alloc(16000 * 2); // 1 second at 16kHz
      for (let i = 0; i < 16000; i++) {
        const sample = Math.sin(i * 0.01) * 32767; // Sine wave amplitude
        mockAudio.writeInt16LE(Math.floor(sample), i * 2);
      }
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockAudio.buffer,
      });

      const result = await provider.synthesize("Hello world");

      expect(Buffer.from(result)).toEqual(mockAudio);
      expect(global.fetch).toHaveBeenCalled();

      // Validate response format (should contain audio data)
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeCloseTo(32000, -3); // Approximate PCM16 size
    });

    it("should use default voice if not specified", async () => {
      const mockData = new Uint8Array([109, 111, 99, 107]);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData.buffer,
      });

      await provider.synthesize("Test text");

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toContain("/text-to-speech/bella");
    });

    it("should use voice from options if provided", async () => {
      const mockData = new Uint8Array([109, 111, 99, 107]);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData.buffer,
      });

      const options: TTSSynthesisOptions = { voice: "rachel" };
      await provider.synthesize("Test text", options);

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toContain("/text-to-speech/rachel");
    });

    it("should include voice settings in request body", async () => {
      const mockData = new Uint8Array([109, 111, 99, 107]);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData.buffer,
      });

      await provider.synthesize("Test text");

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.text).toBe("Test text");
      expect(body.voice_settings.stability).toBe(0.5);
      expect(body.voice_settings.similarity_boost).toBe(0.75);
    });

    it("should handle API errors", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(provider.synthesize("Test text")).rejects.toThrow("ElevenLabs synthesis error");
    });

    it("should handle network errors", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      await expect(provider.synthesize("Test text")).rejects.toThrow();
    });

    it("should return response with all required audio fields", async () => {
      // Create proper audio response
      const mockAudio = Buffer.alloc(16000 * 2);
      for (let i = 0; i < 16000; i++) {
        const sample = Math.sin(i * 0.01) * 32767;
        mockAudio.writeInt16LE(Math.floor(sample), i * 2);
      }

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockAudio.buffer,
      });

      const result = await provider.synthesize("Test text");

      // Validate required fields
      expect(result).toBeDefined();
      expect(Buffer.isBuffer(result) || ArrayBuffer.isView(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeCloseTo(32000, -3); // PCM16 1 second at 16kHz

      // Add audio quality assertions
      const int16Data = new Int16Array(result.buffer);
      expect(Math.max(...int16Data)).toBeGreaterThan(0); // Not all zeros
      expect(Math.min(...int16Data)).toBeLessThan(0); // Contains both positive and negative
    });
  });

  describe("getUserInfo", () => {
    it("should fetch user subscription info", async () => {
      const mockUserInfo = {
        subscription: { character_count: 50000 },
        subscription_tier: "professional",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserInfo,
      });

      const result = await provider.getUserInfo();

      expect(result.subscription.character_count).toBe(50000);
      expect(result.subscription_tier).toBe("professional");
    });
  });
});

describe("ElevenLabsBatchSynthesizer", () => {
  let provider: ElevenLabsTTSProvider;
  let synthesizer: ElevenLabsBatchSynthesizer;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ElevenLabsTTSProvider({
      apiKey: "test-api-key-12345",
    });
    synthesizer = new ElevenLabsBatchSynthesizer(provider);
  });

  describe("synthesizeBatch", () => {
    it("should synthesize multiple texts", async () => {
      // Create deterministic PCM16 audio for each sample
      const createMockAudio = (sampleOffset: number): Uint8Array => {
        const mockAudio = Buffer.alloc(16000 * 2); // 1 second at 16kHz
        for (let i = 0; i < 16000; i++) {
          const sample = Math.sin((i + sampleOffset) * 0.01) * 32767;
          mockAudio.writeInt16LE(Math.floor(sample), i * 2);
        }
        return new Uint8Array(mockAudio.buffer);
      };

      const mockData1 = createMockAudio(0);
      const mockData2 = createMockAudio(1000);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData1.buffer,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData2.buffer,
      });

      const results = await synthesizer.synthesizeBatch(["Text 1", "Text 2"]);

      expect(results).toHaveLength(2);
      expect(Buffer.from(results[0])).toEqual(Buffer.from(mockData1));
      expect(Buffer.from(results[1])).toEqual(Buffer.from(mockData2));
      // Verify audio quality: not all zeros or all max values
      expect(Math.max(...new Int16Array(results[0].buffer))).toBeGreaterThan(0);
      expect(Math.max(...new Int16Array(results[1].buffer))).toBeGreaterThan(0);
    });

    it("should handle synthesis errors gracefully", async () => {
      // Create deterministic PCM16 audio for successful synthesis
      const mockAudio = Buffer.alloc(16000 * 2); // 1 second at 16kHz
      for (let i = 0; i < 16000; i++) {
        const sample = Math.sin(i * 0.01) * 32767;
        mockAudio.writeInt16LE(Math.floor(sample), i * 2);
      }
      const mockData = new Uint8Array(mockAudio.buffer);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData.buffer,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Error",
      });

      const results = await synthesizer.synthesizeBatch(["Text 1", "Text 2"]);

      expect(results).toHaveLength(2);
      expect(Buffer.from(results[0])).toEqual(Buffer.from(mockData));
      expect(results[1].length).toBe(0); // Empty buffer on error
      // Verify successful audio is valid
      expect(Math.max(...new Int16Array(results[0].buffer))).toBeGreaterThan(0);
    });

    it("should call progress callback", async () => {
      // Create deterministic PCM16 audio
      const mockAudio = Buffer.alloc(16000 * 2); // 1 second at 16kHz
      for (let i = 0; i < 16000; i++) {
        const sample = Math.sin(i * 0.01) * 32767;
        mockAudio.writeInt16LE(Math.floor(sample), i * 2);
      }
      const mockData = new Uint8Array(mockAudio.buffer);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockData.buffer,
      });

      const progressCallback = vi.fn();
      const results = await synthesizer.synthesizeBatch(["Text 1", "Text 2", "Text 3"], undefined, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(0, 3);
      expect(progressCallback).toHaveBeenCalledWith(1, 3);
      expect(progressCallback).toHaveBeenCalledWith(2, 3);
      // Verify audio quality
      results.forEach((result) => {
        expect(Math.max(...new Int16Array(result.buffer))).toBeGreaterThan(0);
      });
    });
  });

  describe("synthesizeAndConcatenate", () => {
    it("should concatenate audio buffers with silence", async () => {
      // Create deterministic PCM16 audio for each sample
      const createMockAudio = (sampleOffset: number): Uint8Array => {
        const mockAudio = Buffer.alloc(1000); // 0.5 second at 16kHz
        for (let i = 0; i < 500; i++) {
          const sample = Math.sin((i + sampleOffset) * 0.01) * 32767;
          mockAudio.writeInt16LE(Math.floor(sample), i * 2);
        }
        return new Uint8Array(mockAudio.buffer);
      };

      const mockData1 = createMockAudio(0);
      const mockData2 = createMockAudio(500);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData1.buffer,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockData2.buffer,
      });

      const result = await synthesizer.synthesizeAndConcatenate(["Text 1", "Text 2"]);

      // Should be audio1 + silence + audio2
      expect(result.length).toBeGreaterThan(2000);
      // Verify concatenated audio is not all zeros
      expect(Math.max(...new Int16Array(result.buffer))).toBeGreaterThan(0);
    });
  });
});

describe("Voice helper functions", () => {
  describe("getCommonVoices", () => {
    it("should return list of common voices", () => {
      const voices = getCommonVoices();

      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0]).toHaveProperty("id");
      expect(voices[0]).toHaveProperty("name");
      expect(voices[0]).toHaveProperty("category");
    });

    it("should include bella voice", () => {
      const voices = getCommonVoices();
      const bella = voices.find((v) => v.id === "bella");

      expect(bella).toBeDefined();
      expect(bella?.name).toBe("Bella");
    });
  });

  describe("findVoiceByName", () => {
    it("should find voice by name", () => {
      const voice = findVoiceByName("rachel");

      expect(voice).toBeDefined();
      expect(voice?.name).toBe("Rachel");
    });

    it("should find voice by partial name", () => {
      const voice = findVoiceByName("rach");

      expect(voice).toBeDefined();
      expect(voice?.name).toBe("Rachel");
    });

    it("should find voice by ID", () => {
      const voice = findVoiceByName("caleb");

      expect(voice).toBeDefined();
      expect(voice?.id).toBe("caleb");
    });

    it("should return undefined for non-existent voice", () => {
      const voice = findVoiceByName("nonexistent");

      expect(voice).toBeUndefined();
    });

    it("should be case-insensitive", () => {
      const voice1 = findVoiceByName("RACHEL");
      const voice2 = findVoiceByName("rachel");

      expect(voice1).toEqual(voice2);
    });
  });

  describe("getVoicesByGender", () => {
    it("should filter voices by gender", () => {
      const femaleVoices = getVoicesByGender("female");

      expect(femaleVoices.length).toBeGreaterThan(0);
      expect(femaleVoices.every((v) => v.gender === "female")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const femaleVoices1 = getVoicesByGender("FEMALE");
      const femaleVoices2 = getVoicesByGender("female");

      expect(femaleVoices1).toEqual(femaleVoices2);
    });
  });

  describe("getVoicesByAccent", () => {
    it("should filter voices by accent", () => {
      const americanVoices = getVoicesByAccent("American");

      expect(americanVoices.length).toBeGreaterThan(0);
      expect(americanVoices.every((v) => v.accent === "American")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const voices1 = getVoicesByAccent("AMERICAN");
      const voices2 = getVoicesByAccent("american");

      expect(voices1).toEqual(voices2);
    });
  });

  describe("estimateCharacterCount", () => {
    it("should estimate character count", () => {
      const count = estimateCharacterCount("Hello world");

      expect(count).toBeGreaterThanOrEqual("Hello world".length);
    });

    it("should add overhead for longer texts", () => {
      const shortText = "Hi";
      const longText = "a".repeat(1000);

      const shortCount = estimateCharacterCount(shortText);
      const longCount = estimateCharacterCount(longText);

      expect(longCount).toBeGreaterThan(shortCount);
    });
  });

  describe("chunkTextBySentences", () => {
    it("should chunk text by sentences", () => {
      const text = "This is sentence one. This is sentence two. This is sentence three.";
      const chunks = chunkTextBySentences(text, 100);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(100);
      });
    });

    it("should respect sentence boundaries", () => {
      const text = "First sentence. Second sentence.";
      const chunks = chunkTextBySentences(text, 20);

      expect(chunks).toContain("First sentence.");
      expect(chunks).toContain("Second sentence.");
    });

    it("should handle text without sentence boundaries", () => {
      const text = "No punctuation here";
      const chunks = chunkTextBySentences(text);

      expect(chunks).toContain(text);
    });

    it("should handle text efficiently", () => {
      const chunks = chunkTextBySentences("Short text.");

      expect(chunks).toEqual(["Short text."]);
    });

    it("should use default chunk length of 500", () => {
      const longText = "Sentence. ".repeat(100);
      const chunks = chunkTextBySentences(longText);

      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(500);
      });
    });
  });
});

describe("Configuration validation", () => {
  it("should accept all valid output formats", () => {
    const formats: Array<"mp3_44100_64" | "mp3_44100_128" | "mp3_22050_32" | "ulaw_8000_bit"> = [
      "mp3_44100_64",
      "mp3_44100_128",
      "mp3_22050_32",
      "ulaw_8000_bit",
    ];

    for (const format of formats) {
      expect(() => {
        new ElevenLabsTTSProvider({
          apiKey: "test-key",
          outputFormat: format,
        });
      }).not.toThrow();
    }
  });

  it("should validate metadata fields", () => {
    const provider = new ElevenLabsTTSProvider({
      apiKey: "test-key",
    });

    expect(provider.metadata.name).toBe("elevenlabs-tts");
    expect(provider.metadata.type).toBe("tts");
    expect(provider.metadata.description).toContain("ElevenLabs");
    expect(provider.metadata.authors).toBeDefined();
    expect(provider.metadata.license).toBe("MIT");
  });
});
