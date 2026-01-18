/**
 * Whisper System Deployment Handler
 *
 * Manages local system deployment of Whisper using Python package.
 * Handles model downloads, environment setup, and subprocess management.
 */

import { spawn, exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import type { AudioBuffer, TranscribeOptions, TranscriptionResult } from './executor.js';
import { VoiceProviderError } from './executor.js';

const execAsync = promisify(exec);

/**
 * System deployment configuration
 */
interface SystemDeploymentConfig {
  modelSize: 'tiny' | 'small' | 'base' | 'medium' | 'large';
  pythonPath: string;
  cachePath: string;
  device: 'cpu' | 'cuda' | 'mps';
  numWorkers: number;
}

/**
 * Python environment check result
 */
interface PythonEnvInfo {
  pythonAvailable: boolean;
  pythonVersion?: string;
  whisperInstalled: boolean;
  whisperVersion?: string;
  ffmpegAvailable: boolean;
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
 * Comprehensive system deployment handler for Whisper
 */
export class WhisperSystemDeploymentHandler {
  private initialized = false;
  private config: SystemDeploymentConfig;
  private modelReady = false;
  private processCache: Map<number, NodeJS.Process> = new Map();

  constructor(config: Partial<SystemDeploymentConfig> = {}) {
    const homeDir = os.homedir();
    const defaultCachePath = join(homeDir, '.cache', 'whisper');

    this.config = {
      modelSize: config.modelSize || 'base',
      pythonPath: config.pythonPath || 'python3',
      cachePath: config.cachePath || defaultCachePath,
      device: config.device || this.detectDevice(),
      numWorkers: config.numWorkers || 1,
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
        'whisper-system',
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

      // Check Whisper installation
      let whisperInstalled = false;
      let whisperVersion: string | undefined;

      try {
        const { stdout } = await execAsync(
          `${this.config.pythonPath} -m pip show openai-whisper`,
        );
        whisperInstalled = true;
        const versionMatch = stdout.match(/Version: ([\d.]+)/);
        if (versionMatch) {
          whisperVersion = versionMatch[1];
        }
      } catch {
        // Whisper not installed
      }

      // Check FFmpeg availability
      let ffmpegAvailable = false;

      try {
        await execAsync('ffmpeg -version');
        ffmpegAvailable = true;
      } catch {
        // FFmpeg not available
      }

      if (!whisperInstalled) {
        throw new Error('openai-whisper package not installed');
      }

      if (!ffmpegAvailable) {
        console.warn(
          'FFmpeg not found - audio format conversion may be limited',
        );
      }

      return {
        pythonAvailable: true,
        pythonVersion: pythonVersion.trim(),
        whisperInstalled,
        whisperVersion,
        ffmpegAvailable,
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
        await execAsync(
          `${this.config.pythonPath} -c "import ${dep}"`,
        );
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

    console.log(`Downloading Whisper model: ${this.config.modelSize}...`);

    try {
      await this.downloadModel();
    } catch (error) {
      throw new Error(
        `Failed to download model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Download Whisper model
   */
  private async downloadModel(): Promise<void> {
    const pythonScript = `
import whisper
import os

cache_dir = "${this.config.cachePath}"
os.environ['XDG_CACHE_HOME'] = cache_dir

# This will download the model if not present
whisper.load_model("${this.config.modelSize}")
print("Model downloaded successfully")
`;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.pythonPath, ['-c', pythonScript], {
        env: {
          ...process.env,
          XDG_CACHE_HOME: this.config.cachePath,
          HOME: os.homedir(),
        },
      });

      let output = '';
      let error = '';

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        error += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(error || 'Model download failed'));
        }
      });

      proc.on('error', (err: Error) => {
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
      `${this.config.modelSize}.pt`,
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
      execSync('nvidia-smi', { stdio: 'ignore' });
      return 'cuda';
    } catch {
      // Not CUDA
    }

    // Check for MPS (Apple Silicon)
    if (os.platform() === 'darwin') {
      try {
        execSync('sysctl -a | grep arm64', { stdio: 'ignore' });
        return 'mps';
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
        `${this.config.pythonPath} -c "import whisper; print('ok')"`,
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
        'whisper-system',
        'NOT_INITIALIZED',
      );
    }

    return new Promise((resolve, reject) => {
      const pythonScript = this.generateTranscriptionScript(audio, options);
      const env = process.env;

      const proc = spawn(this.config.pythonPath, ['-c', pythonScript], {
        env: {
          ...env,
          XDG_CACHE_HOME: this.config.cachePath,
          HOME: os.homedir(),
        },
      });

      let output = '';
      let error = '';

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        error += data.toString();
      });

      proc.on('close', (code: number | null) => {
        try {
          if (code === 0) {
            const result = JSON.parse(output);
            resolve({
              text: result.text,
              language: result.language || options?.language,
              duration: result.duration || audio.duration,
              confidence: result.confidence,
              provider: 'whisper-system',
            });
          } else {
            reject(
              new VoiceProviderError(
                error || 'Transcription failed',
                'whisper-system',
                'TRANSCRIPTION_FAILED',
              ),
            );
          }
        } catch (parseError) {
          reject(
            new VoiceProviderError(
              `Failed to parse transcription result: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              'whisper-system',
              'PARSE_FAILED',
            ),
          );
        }
      });

      proc.on('error', (err: Error) => {
        reject(
          new VoiceProviderError(
            `Process error: ${err.message}`,
            'whisper-system',
            'PROCESS_ERROR',
          ),
        );
      });

      // Clean up process if timeout
      const timeout = setTimeout(() => {
        proc.kill();
        reject(
          new VoiceProviderError(
            'Transcription timeout',
            'whisper-system',
            'TIMEOUT',
          ),
        );
      }, (options?.timeout || 60000) + 5000);

      process.on('close', () => clearTimeout(timeout));
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
import whisper
import base64
import json
import numpy as np
import os
import sys

os.environ['XDG_CACHE_HOME'] = "${this.config.cachePath}"

try:
    # Load model
    model = whisper.load_model("${this.config.modelSize}", device="${this.config.device}")

    # Decode audio
    audio_data = base64.b64decode("${audioBase64}")
    audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

    # Transcribe
    result = model.transcribe(
        audio_array,
        language="${options?.language || 'auto'}",
        verbose=False
    )

    # Output JSON
    output = {
        "text": result["text"],
        "language": result.get("language"),
        "duration": ${audio.duration},
        "confidence": None
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
      const { pythonVersion, whisperVersion, ffmpegAvailable } =
        await this.checkPythonEnvironment();

      return {
        pythonAvailable: true,
        pythonVersion,
        whisperInstalled: true,
        whisperVersion,
        ffmpegAvailable,
      };
    } catch (error) {
      return {
        pythonAvailable: false,
        error: error instanceof Error ? error.message : String(error),
        whisperInstalled: false,
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
   * Is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
