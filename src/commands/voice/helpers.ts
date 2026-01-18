/**
 * Voice Command Helpers
 *
 * Shared utilities for voice CLI commands:
 * - Configuration management
 * - Output formatting
 * - Provider registry setup
 * - Error handling
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import {
  readConfigFileSnapshot,
  type ClawdbotConfig,
} from '../../config/config.js';
import { VoiceProviderRegistry } from '../../media/voice-providers/registry.js';
import type { VoiceProvidersConfig } from '../../config/zod-schema.voice-providers.js';
import { defaultRuntime, type RuntimeEnv } from '../../runtime.js';

/**
 * Load voice configuration from user's config file
 */
export async function loadVoiceConfig(): Promise<{
  voiceConfig: VoiceProvidersConfig;
  fullConfig: ClawdbotConfig;
}> {
  const snapshot = await readConfigFileSnapshot();
  const fullConfig = snapshot.config;
  const voiceConfig: VoiceProvidersConfig =
    (fullConfig.voice?.providers as VoiceProvidersConfig | undefined) ?? {
      enabled: false,
      providers: [],
      autoDetectCapabilities: true,
    };

  return { voiceConfig, fullConfig };
}

/**
 * Initialize voice provider registry with config
 */
export async function initializeRegistry(
  voiceConfig?: VoiceProvidersConfig,
): Promise<VoiceProviderRegistry> {
  const registry = new VoiceProviderRegistry();

  if (voiceConfig?.enabled && voiceConfig.providers) {
    await registry.loadProviders(voiceConfig);
  }

  return registry;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format milliseconds to human-readable time
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Print formatted table
 */
export function printTable(
  headers: string[],
  rows: (string | number)[][],
): void {
  const columnWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(
      ...rows.map(row => String(row[i] ?? '').length),
    );
    return Math.max(h.length, maxDataWidth);
  });

  // Print header
  const headerRow = headers
    .map((h, i) => h.padEnd(columnWidths[i]))
    .join('  ');
  console.log(headerRow);
  console.log(
    columnWidths.map(w => '─'.repeat(w)).join('──'),
  );

  // Print rows
  for (const row of rows) {
    const formattedRow = row
      .map((cell, i) => String(cell ?? '').padEnd(columnWidths[i]))
      .join('  ');
    console.log(formattedRow);
  }
}

/**
 * Get configuration file path
 */
export function getConfigPath(): string {
  return path.join(homedir(), '.clawdbot', 'config.yaml');
}

/**
 * Get audio file sample rate and channels info
 */
export async function getAudioFileInfo(filePath: string): Promise<{
  sampleRate: number;
  channels: number;
  duration: number;
  format: string;
} | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  // For now, return basic info. Full implementation would use ffprobe or similar
  const ext = path.extname(filePath).toLowerCase();
  const stats = require('fs').statSync(filePath);

  // This is simplified; real implementation would parse audio metadata
  return {
    sampleRate: 16000,
    channels: 1,
    duration: 0, // Would need actual parsing
    format: ext.slice(1),
  };
}

/**
 * Provider status indicator
 */
export function getStatusIndicator(healthy: boolean): string {
  return healthy ? '✓' : '✗';
}

/**
 * Format provider capabilities for display
 */
export function formatCapabilities(caps: any): string[] {
  const lines: string[] = [];

  if (caps.supportedFormats) {
    lines.push(`Formats: ${caps.supportedFormats.join(', ')}`);
  }

  if (caps.supportedLanguages) {
    lines.push(`Languages: ${caps.supportedLanguages.slice(0, 3).join(', ')}${caps.supportedLanguages.length > 3 ? '...' : ''}`);
  }

  if (caps.supportsStreaming !== undefined) {
    lines.push(`Streaming: ${caps.supportsStreaming ? 'Yes' : 'No'}`);
  }

  if (caps.estimatedLatencyMs) {
    lines.push(`Latency: ~${caps.estimatedLatencyMs}ms`);
  }

  return lines;
}

/**
 * Check if file is readable audio
 */
export function isAudioFile(filePath: string): boolean {
  const audioExtensions = [
    '.wav',
    '.mp3',
    '.flac',
    '.ogg',
    '.m4a',
    '.aac',
    '.wma',
  ];
  const ext = path.extname(filePath).toLowerCase();
  return audioExtensions.includes(ext) && existsSync(filePath);
}

/**
 * Validate text input
 */
export function validateTextInput(text: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = text.trim();

  if (!trimmed) {
    return { valid: false, error: 'Text cannot be empty' };
  }

  if (trimmed.length > 5000) {
    return {
      valid: false,
      error: 'Text exceeds maximum length of 5000 characters',
    };
  }

  return { valid: true };
}
