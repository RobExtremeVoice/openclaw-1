/**
 * ElevenLabs TTS Plugin Service
 *
 * Plugin service wrapper for ElevenLabs TTS provider.
 * Handles registration, validation, and lifecycle management.
 */

import { ElevenLabsTTSProvider, type ElevenLabsTTSConfig } from "../../providers/tts-elevenlabs.js";
import type { TTSProvider, PluginMetadata } from "../interfaces.js";

/**
 * Service wrapper for ElevenLabs TTS plugin.
 * Provides cloud-only provider (no local service needed).
 */
export class ElevenLabsTTSService {
  private provider: ElevenLabsTTSProvider | null = null;
  private isInitialized = false;
  private isHealthy = true;
  private lastHealthCheck = 0;

  /**
   * Initialize the ElevenLabs TTS service.
   *
   * @param config - Configuration for the provider
   * @returns true if initialization succeeded
   */
  async initialize(config: ElevenLabsTTSConfig): Promise<boolean> {
    try {
      // Validate API key exists
      if (!config.apiKey) {
        console.error("[ElevenLabsTTSService] API key is required");
        return false;
      }

      // Create provider instance
      this.provider = new ElevenLabsTTSProvider(config);

      // Validate configuration
      this.provider.validateConfig();

      // Attempt to verify API key by fetching user info
      try {
        const userInfo = await this.provider.getUserInfo();
        console.log(
          `[ElevenLabsTTSService] Authenticated successfully. Character balance: ${userInfo.subscription.character_count}`,
        );
      } catch (error) {
        console.warn("[ElevenLabsTTSService] Could not verify API key:", error);
        // Continue anyway - might be network issue
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("[ElevenLabsTTSService] Initialization failed:", error);
      return false;
    }
  }

  /**
   * Get the provider instance.
   */
  getProvider(): TTSProvider | null {
    if (!this.isInitialized || !this.provider) {
      return null;
    }
    return this.provider;
  }

  /**
   * Check if the provider is ready.
   */
  isReady(): boolean {
    return this.isInitialized && this.provider !== null && this.isHealthy;
  }

  /**
   * Perform health check (API key validation).
   *
   * @returns true if health check passed
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.provider) {
        this.isHealthy = false;
        return false;
      }

      // Rate limit health checks to once per 5 minutes
      const now = Date.now();
      if (now - this.lastHealthCheck < 300000) {
        return this.isHealthy;
      }

      // Attempt to fetch user info to verify API key
      await this.provider.getUserInfo();
      this.isHealthy = true;
      this.lastHealthCheck = now;
      return true;
    } catch (error) {
      console.warn("[ElevenLabsTTSService] Health check failed:", error);
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  /**
   * Get service status information.
   */
  getStatus(): {
    initialized: boolean;
    healthy: boolean;
    provider: string | null;
    metadata?: PluginMetadata;
  } {
    return {
      initialized: this.isInitialized,
      healthy: this.isHealthy,
      provider: this.provider?.metadata.name ?? null,
      metadata: this.provider?.metadata,
    };
  }

  /**
   * Shutdown the service (cleanup).
   * For cloud providers, this is mainly for cleanup and state management.
   */
  async shutdown(): Promise<void> {
    try {
      if (this.provider) {
        console.log("[ElevenLabsTTSService] Shutting down");
        this.provider = null;
        this.isInitialized = false;
        this.isHealthy = false;
      }
    } catch (error) {
      console.error("[ElevenLabsTTSService] Shutdown error:", error);
    }
  }
}

/**
 * Plugin factory for ElevenLabs TTS.
 */
export class ElevenLabsTTSPlugin {
  private service: ElevenLabsTTSService | null = null;

  /**
   * Initialize the plugin.
   */
  async init(config: ElevenLabsTTSConfig): Promise<ElevenLabsTTSService> {
    const service = new ElevenLabsTTSService();

    if (!(await service.initialize(config))) {
      throw new Error("Failed to initialize ElevenLabs TTS service");
    }

    this.service = service;
    return service;
  }

  /**
   * Get the service instance.
   */
  getService(): ElevenLabsTTSService | null {
    return this.service;
  }

  /**
   * Cleanup plugin resources.
   */
  async destroy(): Promise<void> {
    if (this.service) {
      await this.service.shutdown();
      this.service = null;
    }
  }
}

/**
 * Default plugin instance for easy import and use.
 */
export const elevenlabsTTSPlugin = new ElevenLabsTTSPlugin();
