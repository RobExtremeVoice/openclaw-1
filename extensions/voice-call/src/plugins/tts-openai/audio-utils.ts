/**
 * Audio Format Conversion Utilities
 *
 * Provides functions for converting between PCM, mu-law, and other audio formats.
 * Essential for telephony compatibility with Twilio and similar services.
 */

/**
 * Resample 24kHz PCM to 8kHz using linear interpolation.
 * Input/output: 16-bit signed little-endian mono.
 */
export function resample24kTo8k(input: Buffer): Buffer {
  const inputSamples = input.length / 2;
  const outputSamples = Math.floor(inputSamples / 3);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    // Calculate position in input (3:1 ratio)
    const srcPos = i * 3;
    const srcIdx = srcPos * 2;

    if (srcIdx + 3 < input.length) {
      // Linear interpolation between samples
      const s0 = input.readInt16LE(srcIdx);
      const s1 = input.readInt16LE(srcIdx + 2);
      const frac = srcPos % 1 || 0;
      const sample = Math.round(s0 + frac * (s1 - s0));
      output.writeInt16LE(clamp16(sample), i * 2);
    } else {
      // Last sample
      output.writeInt16LE(input.readInt16LE(srcIdx), i * 2);
    }
  }

  return output;
}

/**
 * Clamp value to 16-bit signed integer range.
 */
function clamp16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

/**
 * Convert 16-bit PCM to 8-bit mu-law.
 * Standard G.711 mu-law encoding for telephony.
 */
export function pcmToMulaw(pcm: Buffer): Buffer {
  const samples = pcm.length / 2;
  const mulaw = Buffer.alloc(samples);

  for (let i = 0; i < samples; i++) {
    const sample = pcm.readInt16LE(i * 2);
    mulaw[i] = linearToMulaw(sample);
  }

  return mulaw;
}

/**
 * Convert a single 16-bit linear sample to 8-bit mu-law.
 * Implements ITU-T G.711 mu-law encoding.
 */
function linearToMulaw(sample: number): number {
  const BIAS = 132;
  const CLIP = 32635;

  // Get sign bit
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;

  // Clip to prevent overflow
  if (sample > CLIP) sample = CLIP;

  // Add bias and find segment
  sample += BIAS;
  let exponent = 7;
  for (
    let expMask = 0x4000;
    (sample & expMask) === 0 && exponent > 0;
    exponent--, expMask >>= 1
  ) {
    // Find the segment (exponent)
  }

  // Extract mantissa bits
  const mantissa = (sample >> (exponent + 3)) & 0x0f;

  // Combine into mu-law byte (inverted for transmission)
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Convert 8-bit mu-law to 16-bit linear PCM.
 * Useful for decoding incoming audio.
 */
export function mulawToLinear(mulaw: number): number {
  // mu-law is transmitted inverted
  mulaw = ~mulaw & 0xff;

  const sign = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;

  let sample = ((mantissa << 3) + 132) << exponent;
  sample -= 132;

  return sign ? -sample : sample;
}

/**
 * Chunk audio buffer into 20ms frames for streaming.
 * At 8kHz mono, 20ms = 160 samples = 160 bytes (mu-law).
 */
export function chunkAudio(
  audio: Buffer,
  chunkSize = 160,
): Generator<Buffer, void, unknown> {
  return (function* () {
    for (let i = 0; i < audio.length; i += chunkSize) {
      yield audio.subarray(i, Math.min(i + chunkSize, audio.length));
    }
  })();
}
