/**
 * Deployment Handlers for Faster-Whisper
 *
 * Handles Docker and System deployment with GPU support,
 * CUDA/ROCm configuration, and environment setup.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Docker deployment configuration
 */
export interface DockerDeploymentConfig {
  image: string;
  gpuSupport: boolean;
  gpuRuntime?: 'nvidia' | 'amd' | 'auto';
  memoryMb: number;
  cpuCores: number;
  computeType: 'int8' | 'float16' | 'float32';
  beamSize: number;
  volume?: string;
  port?: number;
}

/**
 * System deployment configuration
 */
export interface SystemDeploymentConfig {
  pythonPath: string;
  venvPath?: string;
  gpuSupport: boolean;
  cudaPath?: string;
  rocmPath?: string;
  computeType: 'int8' | 'float16' | 'float32';
  beamSize: number;
  cpuThreads: number;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  method: 'docker' | 'system';
  status: string;
  configuration: Record<string, any>;
  warnings: string[];
}

/**
 * Docker Deployment Handler
 * Handles containerized deployment with GPU passthrough support
 */
export class DockerDeploymentHandler {
  /**
   * Validate Docker installation
   */
  static isDockerAvailable(): boolean {
    try {
      execSync('docker --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate NVIDIA Docker runtime
   */
  static hasNvidiaRuntime(): boolean {
    try {
      const output = execSync('docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi', {
        stdio: 'pipe',
        timeout: 5000,
      });
      return output.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get recommended Docker image
   */
  static getRecommendedImage(gpuType?: 'nvidia' | 'amd' | 'auto'): string {
    if (gpuType === 'nvidia' || gpuType === 'auto') {
      return 'systran/faster-whisper:latest-cuda';
    }
    if (gpuType === 'amd') {
      return 'systran/faster-whisper:latest-rocm';
    }
    return 'systran/faster-whisper:latest-cpu';
  }

  /**
   * Generate Docker run command
   */
  static generateDockerCommand(config: DockerDeploymentConfig): string {
    const baseCmd = ['docker', 'run', '--rm', '-it'];

    // GPU support
    if (config.gpuSupport) {
      if (config.gpuRuntime === 'nvidia' || config.gpuRuntime === 'auto') {
        baseCmd.push('--gpus', 'all');
      } else if (config.gpuRuntime === 'amd') {
        baseCmd.push('--device', '/dev/kfd', '--device', '/dev/dri');
        baseCmd.push('--group-add', 'video');
      }
    }

    // Resource limits
    baseCmd.push('--memory', `${config.memoryMb}m`);
    baseCmd.push('--cpus', String(config.cpuCores));

    // Volume mount
    if (config.volume) {
      baseCmd.push('-v', config.volume);
    }

    // Port mapping
    if (config.port) {
      baseCmd.push('-p', `${config.port}:8000`);
    }

    // Environment variables
    baseCmd.push(
      '-e', `FASTER_WHISPER_COMPUTE_TYPE=${config.computeType}`,
      '-e', `FASTER_WHISPER_BEAM_SIZE=${config.beamSize}`,
    );

    // Image
    baseCmd.push(config.image);

    return baseCmd.join(' ');
  }

  /**
   * Generate Dockerfile for custom image
   */
  static generateDockerfile(config: DockerDeploymentConfig): string {
    const baseImage = config.gpuSupport
      ? 'systran/faster-whisper:latest-cuda'
      : 'systran/faster-whisper:latest-cpu';

    return `FROM ${baseImage}

# Set optimization environment variables
ENV FASTER_WHISPER_COMPUTE_TYPE=${config.computeType}
ENV FASTER_WHISPER_BEAM_SIZE=${config.beamSize}
ENV FASTER_WHISPER_NUM_WORKERS=${Math.max(1, Math.floor(config.cpuCores / 2))}

# Install additional dependencies
RUN pip install --no-cache-dir \\
    numpy \\
    scipy \\
    librosa \\
    torch==2.1.0 ${config.gpuSupport ? '--index-url https://download.pytorch.org/whl/cu118' : '--index-url https://download.pytorch.org/whl/cpu'}

# Copy application code
COPY . /app/
WORKDIR /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD python -c "from faster_whisper import WhisperModel; model = WhisperModel('base', device='${config.gpuSupport ? 'cuda' : 'cpu'}')" || exit 1

# Entry point
CMD ["python", "-m", "faster_whisper.server", "--host", "0.0.0.0", "--port", "8000"]
`;
  }

  /**
   * Generate docker-compose.yml for orchestration
   */
  static generateDockerCompose(config: DockerDeploymentConfig): string {
    const gpuServices = config.gpuSupport
      ? `
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
`
      : '';

    return `version: '3.8'

services:
  faster-whisper:
    image: ${config.image}
    container_name: faster-whisper-stt
    ports:
      - "${config.port || 8000}:8000"
    volumes:
      - ./audio:/app/audio
      - ./models:/root/.cache/huggingface
    environment:
      - FASTER_WHISPER_COMPUTE_TYPE=${config.computeType}
      - FASTER_WHISPER_BEAM_SIZE=${config.beamSize}
      - FASTER_WHISPER_DEVICE=cuda
      - OMP_NUM_THREADS=${Math.max(1, Math.floor(config.cpuCores / 2))}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3${gpuServices}
`;
  }

  /**
   * Deploy Faster-Whisper to Docker
   */
  static async deploy(config: DockerDeploymentConfig): Promise<DeploymentResult> {
    const warnings: string[] = [];

    // Check Docker availability
    if (!this.isDockerAvailable()) {
      return {
        success: false,
        method: 'docker',
        status: 'Docker is not installed or not in PATH',
        configuration: config,
        warnings: ['Docker must be installed to use Docker deployment'],
      };
    }

    // Check GPU runtime if requested
    if (config.gpuSupport && config.gpuRuntime === 'nvidia') {
      if (!this.hasNvidiaRuntime()) {
        warnings.push('NVIDIA Docker runtime not detected. GPU support may not work.');
      }
    }

    // Generate deployment artifacts
    const dockerCommand = this.generateDockerCommand(config);
    const dockerfile = this.generateDockerfile(config);
    const dockerCompose = this.generateDockerCompose(config);

    return {
      success: true,
      method: 'docker',
      status: 'Docker deployment configured successfully',
      configuration: {
        ...config,
        command: dockerCommand,
        dockerfile,
        dockerCompose,
      },
      warnings,
    };
  }
}

/**
 * System Deployment Handler
 * Handles native system deployment with CUDA/ROCm detection
 */
export class SystemDeploymentHandler {
  /**
   * Detect CUDA installation
   */
  static detectCUDA(): { found: boolean; path?: string; version?: string } {
    const cudaPaths = [
      process.env.CUDA_PATH,
      '/usr/local/cuda',
      '/opt/cuda',
      'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA',
    ];

    for (const cudaPath of cudaPaths) {
      if (!cudaPath) continue;

      if (fs.existsSync(cudaPath)) {
        try {
          const version = execSync(`${path.join(cudaPath, 'bin', 'nvcc')} --version`, {
            stdio: 'pipe',
            timeout: 1000,
          }).toString();
          const versionMatch = version.match(/release ([\d.]+)/);

          return {
            found: true,
            path: cudaPath,
            version: versionMatch ? versionMatch[1] : undefined,
          };
        } catch {
          // Continue to next path
        }
      }
    }

    return { found: false };
  }

  /**
   * Detect ROCm installation
   */
  static detectROCm(): { found: boolean; path?: string; version?: string } {
    const rocmPaths = [
      process.env.ROCM_PATH,
      '/opt/rocm',
      '/usr/local/rocm',
    ];

    for (const rocmPath of rocmPaths) {
      if (!rocmPath) continue;

      if (fs.existsSync(rocmPath)) {
        try {
          const versionFile = path.join(rocmPath, '.hipVersion');
          if (fs.existsSync(versionFile)) {
            const version = fs.readFileSync(versionFile, 'utf-8').trim();
            return {
              found: true,
              path: rocmPath,
              version,
            };
          }
        } catch {
          // Continue to next path
        }
      }
    }

    return { found: false };
  }

  /**
   * Generate environment variables for deployment
   */
  static generateEnvironment(config: SystemDeploymentConfig): Record<string, string> {
    const env: Record<string, string> = {
      FASTER_WHISPER_COMPUTE_TYPE: config.computeType,
      FASTER_WHISPER_BEAM_SIZE: String(config.beamSize),
      OMP_NUM_THREADS: String(config.cpuThreads),
      PYTHONUNBUFFERED: '1',
    };

    if (config.cudaPath) {
      env.CUDA_PATH = config.cudaPath;
      env.CUDA_HOME = config.cudaPath;
      env.PATH = `${path.join(config.cudaPath, 'bin')}:${process.env.PATH || ''}`;
      env.LD_LIBRARY_PATH = `${path.join(config.cudaPath, 'lib64')}:${process.env.LD_LIBRARY_PATH || ''}`;
    }

    if (config.rocmPath) {
      env.ROCM_PATH = config.rocmPath;
      env.PATH = `${path.join(config.rocmPath, 'bin')}:${process.env.PATH || ''}`;
      env.LD_LIBRARY_PATH = `${path.join(config.rocmPath, 'lib')}:${process.env.LD_LIBRARY_PATH || ''}`;
    }

    if (config.venvPath) {
      env.VIRTUAL_ENV = config.venvPath;
      env.PATH = `${path.join(config.venvPath, 'bin')}:${process.env.PATH || ''}`;
    }

    return env;
  }

  /**
   * Generate installation script
   */
  static generateInstallScript(config: SystemDeploymentConfig): string {
    const lines: string[] = ['#!/bin/bash', 'set -e', ''];

    // Python version check
    lines.push('# Check Python version');
    lines.push('python_version=$(python3 --version 2>&1 | awk \'{print $2}\')');
    lines.push('required_version="3.9"');
    lines.push('if [ "$(printf \'%s\\n\' "$required_version" "$python_version" | sort -V | head -n1)" = "$required_version" ]; then');
    lines.push('  echo "Python $python_version OK"');
    lines.push('else');
    lines.push('  echo "Python 3.9+ required, got $python_version"');
    lines.push('  exit 1');
    lines.push('fi');
    lines.push('');

    // Virtual environment setup
    if (config.venvPath) {
      lines.push('# Create virtual environment');
      lines.push(`python3 -m venv "${config.venvPath}"`);
      lines.push(`source "${path.join(config.venvPath, 'bin', 'activate')}"`);
      lines.push('');
    }

    // CUDA setup
    if (config.cudaPath) {
      lines.push('# CUDA environment setup');
      lines.push(`export CUDA_PATH="${config.cudaPath}"`);
      lines.push(`export CUDA_HOME="${config.cudaPath}"`);
      lines.push(`export PATH="${path.join(config.cudaPath, 'bin')}:$PATH"`);
      lines.push(`export LD_LIBRARY_PATH="${path.join(config.cudaPath, 'lib64')}:$LD_LIBRARY_PATH"`);
      lines.push('');

      // PyTorch with CUDA
      lines.push('# Install PyTorch with CUDA');
      lines.push('pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cu118');
    }

    // ROCm setup
    if (config.rocmPath) {
      lines.push('# ROCm environment setup');
      lines.push(`export ROCM_PATH="${config.rocmPath}"`);
      lines.push(`export PATH="${path.join(config.rocmPath, 'bin')}:$PATH"`);
      lines.push(`export LD_LIBRARY_PATH="${path.join(config.rocmPath, 'lib')}:$LD_LIBRARY_PATH"`);
      lines.push('');

      // PyTorch with ROCm
      lines.push('# Install PyTorch with ROCm');
      lines.push('pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/rocm5.7');
    }

    // CPU-only PyTorch
    if (!config.cudaPath && !config.rocmPath) {
      lines.push('# Install PyTorch (CPU-only)');
      lines.push('pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu');
    }

    lines.push('');

    // Install Faster-Whisper
    lines.push('# Install Faster-Whisper and dependencies');
    lines.push('pip install --no-cache-dir \\');
    lines.push('  faster-whisper \\');
    lines.push('  numpy \\');
    lines.push('  scipy \\');
    lines.push('  librosa \\');
    lines.push('  soundfile');
    lines.push('');

    lines.push('echo "Installation complete!"');

    return lines.join('\n');
  }

  /**
   * Generate systemd service file (Linux)
   */
  static generateSystemdService(config: SystemDeploymentConfig): string {
    const env = this.generateEnvironment(config);
    const envVars = Object.entries(env)
      .map(([key, value]) => `Environment="${key}=${value}"`)
      .join('\n');

    return `[Unit]
Description=Faster-Whisper STT Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/faster-whisper
ExecStart=${config.pythonPath} -m faster_whisper.server --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
${envVars}

[Install]
WantedBy=multi-user.target
`;
  }

  /**
   * Generate launchd plist (macOS)
   */
  static generateLaunchdPlist(config: SystemDeploymentConfig): string {
    const env = this.generateEnvironment(config);

    const envDict = Object.entries(env)
      .map(([key, value]) => `\t\t<key>${key}</key>\n\t\t<string>${value}</string>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.systran.faster-whisper</string>
  <key>ProgramArguments</key>
  <array>
    <string>${config.pythonPath}</string>
    <string>-m</string>
    <string>faster_whisper.server</string>
    <string>--host</string>
    <string>0.0.0.0</string>
    <string>--port</string>
    <string>8000</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envDict}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/faster-whisper.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/faster-whisper-error.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
  }

  /**
   * Deploy Faster-Whisper to system
   */
  static async deploy(config: SystemDeploymentConfig): Promise<DeploymentResult> {
    const warnings: string[] = [];

    // Detect CUDA/ROCm
    const cuda = this.detectCUDA();
    const rocm = this.detectROCm();

    if (!cuda.found && !rocm.found) {
      warnings.push('No CUDA or ROCm detected. Will use CPU-only mode.');
    }

    // Generate deployment artifacts
    const environment = this.generateEnvironment(config);
    const installScript = this.generateInstallScript(config);
    const systemdService = this.generateSystemdService(config);
    const launchdPlist = this.generateLaunchdPlist(config);

    return {
      success: true,
      method: 'system',
      status: 'System deployment configured successfully',
      configuration: {
        ...config,
        cudaDetected: cuda.found,
        cudaVersion: cuda.version,
        rocmDetected: rocm.found,
        rocmVersion: rocm.version,
        environment,
        installScript,
        systemdService,
        launchdPlist,
      },
      warnings,
    };
  }
}

/**
 * Auto-select best deployment method
 */
export async function selectBestDeployment(
  dockerConfig?: DockerDeploymentConfig,
  systemConfig?: SystemDeploymentConfig,
): Promise<'docker' | 'system'> {
  const dockerAvailable = DockerDeploymentHandler.isDockerAvailable();

  if (dockerAvailable) {
    return 'docker'; // Prefer Docker for isolation and consistency
  }

  return 'system';
}
