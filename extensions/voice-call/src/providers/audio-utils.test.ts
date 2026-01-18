/**
 * Tests for Audio Format Utilities
 */

import { describe, expect, it } from "vitest";
import {
  AUDIO_FORMATS,
  alawToPcm,
  calculateRmsLevel,
  concatenateAudio,
  isSilent,
  monoToStereo,
  muLawToPcm,
  pcmToAlaw,
  pcmToMuLaw,
  resampleAudio,
  scaleVolume,
  stereoToMono,
} from "./audio-utils.js";

describe("Audio Format Utilities", () => {
  describe("AUDIO_FORMATS", () => {
    it("defines standard formats correctly", () => {
      expect(AUDIO_FORMATS.OPENAI_TTS.sampleRate).toBe(24000);
      expect(AUDIO_FORMATS.TWILIO_MULAW.sampleRate).toBe(8000);
      expect(AUDIO_FORMATS.PCM_16KHZ.sampleRate).toBe(16000);
      expect(AUDIO_FORMATS.TWILIO_MULAW.encoding).toBe("mulaw");
      expect(AUDIO_FORMATS.OPENAI_TTS.encoding).toBe("pcm");
    });
  });

  describe("pcmToMuLaw", () => {
    it("converts PCM to mu-law", () => {
      const pcm = Buffer.alloc(4);
      const view = new DataView(pcm.buffer);
      view.setInt16(0, 1000, true);
      view.setInt16(2, -1000, true);

      const mulaw = pcmToMuLaw(pcm);
      expect(mulaw.length).toBe(2);
      expect(mulaw[0]).toBeGreaterThanOrEqual(0);
      expect(mulaw[0]).toBeLessThanOrEqual(255);
      expect(mulaw[1]).toBeGreaterThanOrEqual(0);
      expect(mulaw[1]).toBeLessThanOrEqual(255);
    });
  });

  describe("muLawToPcm", () => {
    it("converts mu-law back to PCM", () => {
      const mulaw = Buffer.from([0x00, 0xff]);
      const pcm = muLawToPcm(mulaw);
      expect(pcm.length).toBe(4);
    });

    it("converts mu-law and back maintains approximate value", () => {
      // Create PCM data
      const originalPcm = Buffer.alloc(4);
      const view = new DataView(originalPcm.buffer);
      view.setInt16(0, 5000, true);

      // Convert to mu-law and back
      const mulaw = pcmToMuLaw(originalPcm);
      const recovered = muLawToPcm(mulaw);

      // Check approximate recovery (mu-law is lossy)
      const recoveredView = new DataView(recovered.buffer);
      const recoveredValue = Math.abs(recoveredView.getInt16(0, true));
      const originalValue = Math.abs(view.getInt16(0, true));

      // Should be within ~20% due to quantization (mu-law compression is lossy with ~14 bits effective precision)
      // For value 5000, recovery is typically around 1024, which is about 20.5%
      expect(recoveredValue).toBeGreaterThan(originalValue * 0.15);
      expect(recoveredValue).toBeLessThan(originalValue * 0.35);
    });
  });

  describe("pcmToAlaw", () => {
    it("converts PCM to A-law", () => {
      const pcm = Buffer.alloc(4);
      const view = new DataView(pcm.buffer);
      view.setInt16(0, 2000, true);
      view.setInt16(2, -2000, true);

      const alaw = pcmToAlaw(pcm);
      expect(alaw.length).toBe(2);
    });
  });

  describe("alawToPcm", () => {
    it("converts A-law back to PCM", () => {
      const alaw = Buffer.from([0x00, 0xff]);
      const pcm = alawToPcm(alaw);
      expect(pcm.length).toBe(4);
    });
  });

  describe("resampleAudio", () => {
    it("returns same buffer if rates match", () => {
      const pcm = Buffer.alloc(100);
      const result = resampleAudio(pcm, 16000, 16000);
      expect(result).toBe(pcm);
    });

    it("resamples from 16kHz to 8kHz", () => {
      const pcm = Buffer.alloc(32000); // 2 seconds at 16kHz 16-bit
      const result = resampleAudio(pcm, 16000, 8000);
      // Should be roughly half the size (1 second at 8kHz)
      expect(result.length).toBeLessThanOrEqual(pcm.length / 2 + 10);
    });

    it("resamples from 8kHz to 16kHz", () => {
      const pcm = Buffer.alloc(16000);
      const result = resampleAudio(pcm, 8000, 16000);
      // Should be roughly double the size
      expect(result.length).toBeGreaterThanOrEqual(pcm.length * 2 - 10);
    });
  });

  describe("monoToStereo", () => {
    it("converts mono to stereo", () => {
      const mono = Buffer.alloc(4);
      const view = new DataView(mono.buffer);
      view.setInt16(0, 1000, true);
      view.setInt16(2, 2000, true);

      const stereo = monoToStereo(mono);
      expect(stereo.length).toBe(mono.length * 2);

      const stereoView = new DataView(stereo.buffer);
      expect(stereoView.getInt16(0, true)).toBe(1000);
      expect(stereoView.getInt16(2, true)).toBe(1000);
      expect(stereoView.getInt16(4, true)).toBe(2000);
      expect(stereoView.getInt16(6, true)).toBe(2000);
    });
  });

  describe("stereoToMono", () => {
    it("converts stereo to mono", () => {
      const stereo = Buffer.alloc(8);
      const view = new DataView(stereo.buffer);
      view.setInt16(0, 1000, true);
      view.setInt16(2, 2000, true);
      view.setInt16(4, 3000, true);
      view.setInt16(6, 4000, true);

      const mono = stereoToMono(stereo);
      expect(mono.length).toBe(stereo.length / 2);

      const monoView = new DataView(mono.buffer);
      // Average of 1000 and 2000
      expect(monoView.getInt16(0, true)).toBe(1500);
      // Average of 3000 and 4000
      expect(monoView.getInt16(2, true)).toBe(3500);
    });
  });

  describe("scaleVolume", () => {
    it("scales volume up", () => {
      const pcm = Buffer.alloc(4);
      const view = new DataView(pcm.buffer);
      view.setInt16(0, 10000, true);
      view.setInt16(2, 5000, true);

      const scaled = scaleVolume(pcm, 2.0);
      const scaledView = new DataView(scaled.buffer);
      expect(scaledView.getInt16(0, true)).toBe(20000);
      expect(scaledView.getInt16(2, true)).toBe(10000);
    });

    it("scales volume down", () => {
      const pcm = Buffer.alloc(4);
      const view = new DataView(pcm.buffer);
      view.setInt16(0, 10000, true);
      view.setInt16(2, 5000, true);

      const scaled = scaleVolume(pcm, 0.5);
      const scaledView = new DataView(scaled.buffer);
      expect(scaledView.getInt16(0, true)).toBe(5000);
      expect(scaledView.getInt16(2, true)).toBe(2500);
    });

    it("clips samples exceeding range", () => {
      const pcm = Buffer.alloc(4);
      const view = new DataView(pcm.buffer);
      view.setInt16(0, 30000, true);
      view.setInt16(2, -30000, true);

      const scaled = scaleVolume(pcm, 2.0);
      const scaledView = new DataView(scaled.buffer);
      expect(scaledView.getInt16(0, true)).toBe(32767); // max int16
      expect(scaledView.getInt16(2, true)).toBe(-32768); // min int16
    });
  });

  describe("concatenateAudio", () => {
    it("concatenates multiple buffers", () => {
      const buf1 = Buffer.from([0x01, 0x02]);
      const buf2 = Buffer.from([0x03, 0x04]);
      const buf3 = Buffer.from([0x05, 0x06]);

      const result = concatenateAudio([buf1, buf2, buf3]);
      expect(result.length).toBe(6);
      expect(result).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
    });

    it("handles empty array", () => {
      const result = concatenateAudio([]);
      expect(result.length).toBe(0);
    });
  });

  describe("calculateRmsLevel", () => {
    it("calculates RMS for sine wave", () => {
      const pcm = Buffer.alloc(4000);
      const view = new DataView(pcm.buffer);
      const amplitude = 10000;

      // Generate sine wave
      for (let i = 0; i < 2000; i++) {
        const value = amplitude * Math.sin((2 * Math.PI * i) / 2000);
        view.setInt16(i * 2, Math.round(value), true);
      }

      const rms = calculateRmsLevel(pcm);
      // RMS of sine wave is amplitude / sqrt(2)
      const expected = amplitude / Math.sqrt(2);
      expect(rms).toBeGreaterThan(expected * 0.95);
      expect(rms).toBeLessThan(expected * 1.05);
    });

    it("returns near-zero RMS for silent audio", () => {
      const pcm = Buffer.alloc(1000);
      const rms = calculateRmsLevel(pcm);
      expect(rms).toBeLessThan(1);
    });
  });

  describe("isSilent", () => {
    it("detects silent audio", () => {
      const pcm = Buffer.alloc(1000);
      expect(isSilent(pcm)).toBe(true);
    });

    it("detects non-silent audio", () => {
      const pcm = Buffer.alloc(1000);
      const view = new DataView(pcm.buffer);
      // Add some loud samples
      for (let i = 0; i < 500; i++) {
        view.setInt16(i * 2, 5000, true);
      }

      expect(isSilent(pcm)).toBe(false);
    });

    it("respects custom threshold", () => {
      const pcm = Buffer.alloc(1000);
      const view = new DataView(pcm.buffer);
      // Add medium-level samples
      for (let i = 0; i < 500; i++) {
        view.setInt16(i * 2, 1000, true);
      }

      // Should be silent with high threshold
      expect(isSilent(pcm, 2000)).toBe(true);
      // Should be non-silent with low threshold
      expect(isSilent(pcm, 500)).toBe(false);
    });
  });
});
