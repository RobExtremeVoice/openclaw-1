/**
 * Faster-Whisper System Deployment Handler
 *
 * Manages local system deployment of Faster-Whisper using Python package.
 * Handles model downloads, environment setup, GPU detection, and subprocess management.
 */

import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import type {
  AudioBuffer,
  TranscribeOptions,
  TranscriptionResult,
} from './executor.js';
import { VoiceProviderError } from './executor.js';

const execAsync = promisify(exec);

/**
 * System deployment configuration
 */
interface SystemDeploymentConfig {
  modelSize: 'tiny' | 'small' | 'base' | 'medium' | 'large';
  computeType: 'int8' | 'float16' | 'float32';
  pythonPath: string;
  cachePath: string;
  device: 'cpu' | 'cuda' | 'mps';
  cpuThreads: number;
  beamSize: number;
}

/**
 * Python environment check result
 */
interface PythonEnvInfo {
  pythonAvailable: boolean;
  pythonVersion?: string;
  fasterWhisperInstalled: boolean;
  fasterWhisperVersion?: string;
  ffmpegAvailable: boolean;
  cudaAvailable?: boolean;
  error?: string;
}

/**
 * Model information
 */
interface ModelInfo {
  size: string;
  availableLocally: boolean;
  downloadSize?: number;
  downloadedAt?: string;
}

/**
 * Comprehensive system deployment handler for Faster-Whisper
 */
export class FasterWhisperSystemDeploymentHandler {
  private initialized = false;
  private config: SystemDeploymentConfig;
  private modelReady = false;
  private processCache: Map<number, NodeJS.Process> = new Map();

  constructor(config: Partial<SystemDeploymentConfig> = {}) {
    const homeDir = os.homedir();
    const defaultCachePath = join(homeDir, '.cache', 'faster-whisper');

    this.config = {
      modelSize: config.modelSize || 'base',
      computeType: config.computeType || 'int8',
      pythonPath: config.pythonPath || 'python3',
      cachePath: config.cachePath || defaultCachePath,
      device: config.device || this.detectDevice(),
      cpuThreads: config.cpuThreads || 4,
      beamSize: config.beamSize || 5,
    };

    // Ensure cache directory exists
    if (!existsSync(this.config.cachePath)) {
      mkdirSync(this.config.cachePath, { recursive: true });
    }
  }

  /**
   * Initialize system deployment
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Check Python environment
      await this.checkPythonEnvironment();

      // Verify dependencies
      await this.verifyDependencies();

      // Pre-download model if needed
      await this.ensureModelAvailable();

      this.modelReady = true;
      this.initialized = true;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to initialize system deployment: ${error instanceof Error ? error.message : String(error)}`,
        'faster-whisper-system',
        'INIT_FAILED',
      );
    }
  }

  /**
   * Check Python environment
   */
  private async checkPythonEnvironment(): Promise<PythonEnvInfo> {
    try {
      // Check Python version
      const { stdout: pythonVersion } = await execAsync(
        `${this.config.pythonPath} --version`,
      );

      // Check Faster-Whisper installation
      let fasterWhisperInstalled = false;
      let fasterWhisperVersion: string | undefined;

      try {
        const { stdout } = await execAsync(
          `${this.config.pythonPath} -m pip show faster-whisper`,
        );
        fasterWhisperInstalled = true;
        const versionMatch = stdout.match(/Version: ([\d.]+)/);
        if (versionMatch) {
          fasterWhisperVersion = versionMatch[1];
        }
      } catch {
        // Faster-Whisper not installed
      }

      // Check FFmpeg availability
      let ffmpegAvailable = false;

      try {
        await execAsync('ffmpeg -version');
        ffmpegAvailable = true;
      } catch {
        // FFmpeg not available
      }

      // Check CUDA availability
      let cudaAvailable = false;

      try {
        await execAsync('nvidia-smi');
        cudaAvailable = true;
      } catch {
        // CUDA not available
      }

      if (!fasterWhisperInstalled) {
        throw new Error('faster-whisper package not installed');
      }

      if (!ffmpegAvailable) {
        console.warn(
          'FFmpeg not found - audio format conversion may be limited',
        );
      }

      return {
        pythonAvailable: true,
        pythonVersion: pythonVersion.trim(),
        fasterWhisperInstalled,
        fasterWhisperVersion,
        ffmpegAvailable,
        cudaAvailable,
      };
    } catch (error) {
      throw new Error(
        `Python environment check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verify all dependencies
   */
  private async verifyDependencies(): Promise<void> {
    const required = ['numpy', 'torch'];
    const missingDeps: string[] = [];

    for (const dep of required) {
      try {
        await execAsync(`${this.config.pythonPath} -c "import ${dep}"`);
      } catch {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      console.warn(
        `Missing Python dependencies: ${missingDeps.join(', ')}`,
      );
      console.warn('Install with: pip install -r requirements.txt');
    }
  }

  /**
   * Ensure model is downloaded and available
   */
  private async ensureModelAvailable(): Promise<void> {
    const modelInfo = await this.getModelInfo();

    if (modelInfo.availableLocally) {
      return;
    }

    console.log(
      `Downloading Faster-Whisper model: ${this.config.modelSize}...`,
    );

    try {
      await this.downloadModel();
    } catch (error) {
      throw new Error(
        `Failed to download model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Download Faster-Whisper model
   */
  private async downloadModel(): Promise<void> {
    const pythonScript = `
from faster_whisper import WhisperModel
import os

cache_dir = "${this.config.cachePath}"
os.environ['XDG_CACHE_HOME'] = cache_dir

# This will download the model if not present
model = WhisperModel(
    "${this.config.modelSize}",
    device="${this.config.device}",
    compute_type="${this.config.computeType}",
    download_root=cache_dir
)
print("Model downloaded successfully")
`;

    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.config.pythonPath, ['-c', pythonScript], {
        env: {
          ...process.env,
          XDG_CACHE_HOME: this.config.cachePath,
          HOME: os.homedir(),
        },
      });

      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        error += data.toString();
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(error || 'Model download failed'));
        }
      });

      childProcess.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<ModelInfo> {
    const modelPath = join(
      this.config.cachePath,
      `faster-whisper-${this.config.modelSize}`,
    );

    return {
      size: this.config.modelSize,
      availableLocally: existsSync(modelPath),
    };
  }

  /**
   * Detect available device
   */
  private detectDevice(): 'cpu' | 'cuda' | 'mps' {
    // Try to detect CUDA
    try {
      execAsync('nvidia-smi');
      return 'cuda';
    } catch {
      // Not CUDA
    }

    // Check for MPS (Apple Silicon)
    if (os.platform() === 'darwin') {
      try {
        const arch = os.arch();
        if (arch === 'arm64') {
          return 'mps';
        }
      } catch {
        // Not ARM
      }
    }

    return 'cpu';
  }

  /**
   * Health check for system deployment
   */
  async healthCheck(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      // Try a simple Python import check
      await execAsync(
        `${this.config.pythonPath} -c "from faster_whisper import WhisperModel; print('ok')"`,
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe audio using system Python package
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    if (!this.initialized || !this.modelReady) {
      throw new VoiceProviderError(
        'System deployment not initialized',
        'faster-whisper-system',
        'NOT_INITIALIZED',
      );
    }

    return new Promise((resolve, reject) => {
      const pythonScript = this.generateTranscriptionScript(audio, options);

      const childProcess = spawn(this.config.pythonPath, ['-c', pythonScript], {
        env: {
          ...process.env,
          XDG_CACHE_HOME: this.config.cachePath,
          HOME: os.homedir(),
        },
      });

      let output = '';
      let error = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        error += data.toString();
      });

      childProcess.on('close', (code: number | null) => {
        try {
          if (code === 0) {
            const result = JSON.parse(output);
            resolve({
              text: result.text,
              language: result.language || options?.language,
              duration: result.duration || audio.duration,
              confidence: result.confidence,
              provider: 'faster-whisper-system',
            });
          } else {
            reject(
              new VoiceProviderError(
                error || 'Transcription failed',
                'faster-whisper-system',
                'TRANSCRIPTION_FAILED',
              ),
            );
          }
        } catch (parseError) {
          reject(
            new VoiceProviderError(
              `Failed to parse transcription result: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              'faster-whisper-system',
              'PARSE_FAILED',
            ),
          );
        }
      });

      childProcess.on('error', (err: Error) => {
        reject(
          new VoiceProviderError(
            `Process error: ${err.message}`,
            'faster-whisper-system',
            'PROCESS_ERROR',
          ),
        );
      });

      // Clean up process if timeout
      const timeout = setTimeout(
        () => {
          childProcess.kill();
          reject(
            new VoiceProviderError(
              'Transcription timeout',
              'faster-whisper-system',
              'TIMEOUT',
            ),
          );
        },
        (options?.timeout || 60000) + 5000,
      );

      childProcess.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Generate Python script for transcription
   */
  private generateTranscriptionScript(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): string {
    // Base64 encode audio data for transmission
    const audioBase64 = Buffer.from(audio.data).toString('base64');

    return `
from faster_whisper import WhisperModel
import base64
import json
import numpy as np
import os
import sys

os.environ['XDG_CACHE_HOME'] = "${this.config.cachePath}"

try:
    # Load model
    model = WhisperModel(
        "${this.config.modelSize}",
        device="${this.config.device}",
        compute_type="${this.config.computeType}",
        download_root="${this.config.cachePath}",
        cpu_threads=${this.config.cpuThreads},
        num_workers=${this.config.cpuThreads}
    )

    # Decode audio
    audio_data = base64.b64decode("${audioBase64}")
    audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

    # Transcribe
    segments, info = model.transcribe(
        audio_array,
        language="${options?.language || 'auto'}",
        beam_size=${this.config.beamSize},
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )

    # Collect all segments
    text_parts = []
    for segment in segments:
        text_parts.append(segment.text)

    # Output JSON
    output = {
        "text": " ".join(text_parts).strip(),
        "language": info.language,
        "duration": ${audio.duration},
        "confidence": info.language_probability if hasattr(info, 'language_probability') else None
    }

    print(json.dumps(output))
    sys.exit(0)

except Exception as e:
    print(json.dumps({
        "error": str(e)
    }), file=sys.stderr)
    sys.exit(1)
`;
  }

  /**
   * Get Python environment info
   */
  async getPythonInfo(): Promise<PythonEnvInfo> {
    try {
      const envInfo = await this.checkPythonEnvironment();

      return {
        pythonAvailable: true,
        pythonVersion: envInfo.pythonVersion,
        fasterWhisperInstalled: true,
        fasterWhisperVersion: envInfo.fasterWhisperVersion,
        ffmpegAvailable: envInfo.ffmpegAvailable,
        cudaAvailable: envInfo.cudaAvailable,
      };
    } catch (error) {
      return {
        pythonAvailable: false,
        error: error instanceof Error ? error.message : String(error),
        fasterWhisperInstalled: false,
        ffmpegAvailable: false,
      };
    }
  }

  /**
   * Get cache path
   */
  getCachePath(): string {
    return this.config.cachePath;
  }

  /**
   * Get model size
   */
  getModelSize(): string {
    return this.config.modelSize;
  }

  /**
   * Get device type
   */
  getDevice(): string {
    return this.config.device;
  }

  /**
   * Get compute type
   */
  getComputeType(): string {
    return this.config.computeType;
  }

  /**
   * Get CPU threads configuration
   */
  getCpuThreads(): number {
    return this.config.cpuThreads;
  }

  /**
   * Get beam size configuration
   */
  getBeamSize(): number {
    return this.config.beamSize;
  }

  /**
   * Is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
