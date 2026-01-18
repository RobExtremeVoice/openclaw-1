/**
 * Audio Format Utilities
 *
 * Provides audio format conversion and manipulation utilities for STT/TTS providers.
 * Supports conversions between PCM, mu-law, and other common audio formats.
 */

/**
 * Audio format specifications.
 */
export interface AudioFormat {
  /** Sample rate in Hz */
  sampleRate: number;
  /** Bits per sample (8, 16, 24, 32) */
  bits: number;
  /** Number of channels (1 = mono, 2 = stereo) */
  channels: number;
  /** Encoding type */
  encoding: "pcm" | "mulaw" | "alaw";
  /** Is big endian (false = little endian) */
  bigEndian: boolean;
}

/**
 * Standard audio formats commonly used in voice APIs.
 */
export const AUDIO_FORMATS = {
  // OpenAI TTS output: 24kHz PCM 16-bit mono
  OPENAI_TTS: {
    sampleRate: 24000,
    bits: 16,
    channels: 1,
    encoding: "pcm" as const,
    bigEndian: false,
  },
  // Twilio input: 8kHz mu-law mono
  TWILIO_MULAW: {
    sampleRate: 8000,
    bits: 8,
    channels: 1,
    encoding: "mulaw" as const,
    bigEndian: false,
  },
  // Generic PCM: 16kHz 16-bit mono (common for Whisper)
  PCM_16KHZ: {
    sampleRate: 16000,
    bits: 16,
    channels: 1,
    encoding: "pcm" as const,
    bigEndian: false,
  },
  // Generic PCM: 24kHz 16-bit mono
  PCM_24KHZ: {
    sampleRate: 24000,
    bits: 16,
    channels: 1,
    encoding: "pcm" as const,
    bigEndian: false,
  },
  // Generic PCM: 8kHz 16-bit mono
  PCM_8KHZ: {
    sampleRate: 8000,
    bits: 16,
    channels: 1,
    encoding: "pcm" as const,
    bigEndian: false,
  },
} as const;

/**
 * Convert PCM 16-bit audio to mu-law (G.711).
 *
 * @param pcmData - PCM 16-bit audio buffer (little-endian)
 * @returns Mu-law encoded audio buffer
 */
export function pcmToMuLaw(pcmData: Buffer): Buffer {
  const muLawData = Buffer.alloc(pcmData.length / 2);
  const pcmView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);

  for (let i = 0; i < muLawData.length; i++) {
    // Read little-endian 16-bit PCM sample
    const sample = pcmView.getInt16(i * 2, true);

    // Convert to mu-law
    muLawData[i] = linearToMulaw(sample);
  }

  return muLawData;
}

/**
 * Convert mu-law (G.711) audio to PCM 16-bit.
 *
 * @param muLawData - Mu-law encoded audio buffer
 * @returns PCM 16-bit audio buffer (little-endian)
 */
export function muLawToPcm(muLawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(muLawData.length * 2);
  const pcmView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);

  for (let i = 0; i < muLawData.length; i++) {
    // Convert from mu-law
    const sample = mulawToLinear(muLawData[i]);

    // Write little-endian 16-bit PCM sample
    pcmView.setInt16(i * 2, sample, true);
  }

  return pcmData;
}

/**
 * Convert PCM 16-bit audio to A-law (G.711).
 *
 * @param pcmData - PCM 16-bit audio buffer (little-endian)
 * @returns A-law encoded audio buffer
 */
export function pcmToAlaw(pcmData: Buffer): Buffer {
  const alawData = Buffer.alloc(pcmData.length / 2);
  const pcmView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);

  for (let i = 0; i < alawData.length; i++) {
    const sample = pcmView.getInt16(i * 2, true);
    alawData[i] = linearToAlaw(sample);
  }

  return alawData;
}

/**
 * Convert A-law (G.711) audio to PCM 16-bit.
 *
 * @param alawData - A-law encoded audio buffer
 * @returns PCM 16-bit audio buffer (little-endian)
 */
export function alawToPcm(alawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(alawData.length * 2);
  const pcmView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);

  for (let i = 0; i < alawData.length; i++) {
    const sample = alawToLinear(alawData[i]);
    pcmView.setInt16(i * 2, sample, true);
  }

  return pcmData;
}

/**
 * Resample audio from one sample rate to another.
 * Uses simple linear interpolation (fast but lower quality).
 *
 * @param pcmData - PCM 16-bit audio buffer
 * @param fromSampleRate - Source sample rate
 * @param toSampleRate - Target sample rate
 * @returns Resampled PCM 16-bit audio buffer
 */
export function resampleAudio(
  pcmData: Buffer,
  fromSampleRate: number,
  toSampleRate: number,
): Buffer {
  if (fromSampleRate === toSampleRate) {
    return pcmData;
  }

  const pcmView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);
  const inputSamples = pcmData.length / 2;
  const outputSamples = Math.ceil((inputSamples * toSampleRate) / fromSampleRate);

  const outputData = Buffer.alloc(outputSamples * 2);
  const outputView = new DataView(
    outputData.buffer,
    outputData.byteOffset,
    outputData.length,
  );

  const ratio = fromSampleRate / toSampleRate;

  for (let i = 0; i < outputSamples; i++) {
    const sourceIndex = i * ratio;
    const sourceIntPart = Math.floor(sourceIndex);
    const sourceFracPart = sourceIndex - sourceIntPart;

    let sample: number;

    if (sourceIntPart + 1 < inputSamples) {
      // Linear interpolation
      const sample1 = pcmView.getInt16(sourceIntPart * 2, true);
      const sample2 = pcmView.getInt16((sourceIntPart + 1) * 2, true);
      sample = Math.round(sample1 * (1 - sourceFracPart) + sample2 * sourceFracPart);
    } else {
      // Last sample
      sample = pcmView.getInt16(sourceIntPart * 2, true);
    }

    outputView.setInt16(i * 2, Math.max(-32768, Math.min(32767, sample)), true);
  }

  return outputData;
}

/**
 * Convert mono PCM to stereo by duplicating channels.
 *
 * @param monoData - Mono PCM 16-bit audio buffer
 * @returns Stereo PCM 16-bit audio buffer
 */
export function monoToStereo(monoData: Buffer): Buffer {
  const stereoData = Buffer.alloc(monoData.length * 2);
  const monoView = new DataView(monoData.buffer, monoData.byteOffset, monoData.length);
  const stereoView = new DataView(
    stereoData.buffer,
    stereoData.byteOffset,
    stereoData.length,
  );

  for (let i = 0; i < monoData.length / 2; i++) {
    const sample = monoView.getInt16(i * 2, true);
    stereoView.setInt16(i * 4, sample, true);
    stereoView.setInt16(i * 4 + 2, sample, true);
  }

  return stereoData;
}

/**
 * Convert stereo PCM to mono by averaging channels.
 *
 * @param stereoData - Stereo PCM 16-bit audio buffer
 * @returns Mono PCM 16-bit audio buffer
 */
export function stereoToMono(stereoData: Buffer): Buffer {
  const monoData = Buffer.alloc(stereoData.length / 2);
  const stereoView = new DataView(
    stereoData.buffer,
    stereoData.byteOffset,
    stereoData.length,
  );
  const monoView = new DataView(monoData.buffer, monoData.byteOffset, monoData.length);

  for (let i = 0; i < monoData.length / 2; i++) {
    const left = stereoView.getInt16(i * 4, true);
    const right = stereoView.getInt16(i * 4 + 2, true);
    const sample = Math.round((left + right) / 2);
    monoView.setInt16(i * 2, sample, true);
  }

  return monoData;
}

/**
 * Apply volume scaling to PCM audio.
 *
 * @param pcmData - PCM 16-bit audio buffer
 * @param scale - Volume scale factor (1.0 = no change, 2.0 = double volume)
 * @returns Scaled PCM 16-bit audio buffer
 */
export function scaleVolume(pcmData: Buffer, scale: number): Buffer {
  const scaledData = Buffer.alloc(pcmData.length);
  const srcView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);
  const dstView = new DataView(
    scaledData.buffer,
    scaledData.byteOffset,
    scaledData.length,
  );

  for (let i = 0; i < pcmData.length / 2; i++) {
    const sample = srcView.getInt16(i * 2, true);
    const scaled = Math.round(sample * scale);
    dstView.setInt16(i * 2, Math.max(-32768, Math.min(32767, scaled)), true);
  }

  return scaledData;
}

/**
 * Concatenate multiple PCM audio buffers.
 *
 * @param buffers - Array of PCM 16-bit audio buffers
 * @returns Concatenated PCM 16-bit audio buffer
 */
export function concatenateAudio(buffers: Buffer[]): Buffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = Buffer.alloc(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    buffer.copy(result, offset);
    offset += buffer.length;
  }

  return result;
}

/**
 * Calculate RMS (Root Mean Square) energy level of audio.
 * Useful for detecting silence or speech activity.
 *
 * @param pcmData - PCM 16-bit audio buffer
 * @returns RMS level (0-32768 for 16-bit audio)
 */
export function calculateRmsLevel(pcmData: Buffer): number {
  const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.length);
  let sum = 0;
  const sampleCount = pcmData.length / 2;

  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(i * 2, true);
    sum += sample * sample;
  }

  return Math.sqrt(sum / sampleCount);
}

/**
 * Detect silence in audio based on RMS threshold.
 *
 * @param pcmData - PCM 16-bit audio buffer
 * @param threshold - RMS threshold below which audio is considered silent (default: 500)
 * @returns true if audio is silent
 */
export function isSilent(pcmData: Buffer, threshold: number = 500): boolean {
  return calculateRmsLevel(pcmData) < threshold;
}

/**
 * Convert a linear PCM sample to mu-law.
 * Based on ITU-T G.711 standard.
 *
 * @param sample - Linear PCM sample (-32768 to 32767)
 * @returns Mu-law encoded byte (0-255)
 */
function linearToMulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const QUANT_MASK = 0xf;
  const SEG_MASK = 0x70;
  const SEG_SHIFT = 4;

  // Get magnitude and sign
  const sign = (sample & 0x8000) >> 8;
  if (sign !== 0) {
    sample = -sample;
  }

  // Clip to valid range
  if (sample > CLIP) {
    sample = CLIP;
  }

  // Find the segment
  let segmentNo: number;
  if (sample < 256) {
    segmentNo = 0;
  } else {
    // Add bias and count leading zeros
    const val = (sample + BIAS) >> 8;
    segmentNo = Math.min(7, Math.floor(Math.log2(val)));
  }

  // Compute quantized value
  const quantized = (sample >> (segmentNo + 3)) & QUANT_MASK;
  const mulawByte = ~(sign | (segmentNo << SEG_SHIFT) | quantized);

  return mulawByte & 0xff;
}

/**
 * Convert a mu-law encoded byte to linear PCM.
 * Based on ITU-T G.711 standard.
 *
 * @param mulawByte - Mu-law encoded byte (0-255)
 * @returns Linear PCM sample (-32768 to 32767)
 */
function mulawToLinear(mulawByte: number): number {
  const BIAS = 0x84;

  // Invert all bits except sign
  const inverted = ~mulawByte;

  // Extract components
  const sign = inverted & 0x80;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0f;

  // Compute value
  let sample = mantissa << (exponent + 3);
  sample += BIAS;

  return sign === 0 ? sample : -sample;
}

/**
 * Convert a linear PCM sample to A-law.
 * Based on ITU-T G.711 standard.
 *
 * @param sample - Linear PCM sample (-32768 to 32767)
 * @returns A-law encoded byte (0-255)
 */
function linearToAlaw(sample: number): number {
  const CLIP = 32635;
  const QUANT_MASK = 0x0f;
  const SEG_MASK = 0x70;
  const SEG_SHIFT = 4;

  // Get magnitude and sign
  const sign = (sample & 0x8000) >> 8;
  if (sign !== 0) {
    sample = -sample;
  }

  // Clip to valid range
  if (sample > CLIP) {
    sample = CLIP;
  }

  // Find segment
  let segmentNo: number;
  if (sample < 256) {
    segmentNo = 0;
  } else {
    // Count leading zeros
    const val = sample >> 8;
    segmentNo = Math.min(7, Math.floor(Math.log2(val)));
  }

  // Compute quantized value
  const quantized = (sample >> (segmentNo === 0 ? 4 : segmentNo + 3)) & QUANT_MASK;
  const alawByte = ~(sign | (segmentNo << SEG_SHIFT) | quantized);

  return alawByte & 0xff;
}

/**
 * Convert an A-law encoded byte to linear PCM.
 * Based on ITU-T G.711 standard.
 *
 * @param alawByte - A-law encoded byte (0-255)
 * @returns Linear PCM sample (-32768 to 32767)
 */
function alawToLinear(alawByte: number): number {
  // Invert all bits except sign
  const inverted = ~alawByte;

  // Extract components
  const sign = inverted & 0x80;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0f;

  // Compute value
  let sample = mantissa << (exponent === 0 ? 4 : exponent + 3);
  if (exponent > 0) {
    sample |= 0x80 << exponent;
  }

  return sign === 0 ? sample : -sample;
}
