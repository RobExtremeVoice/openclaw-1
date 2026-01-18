/**
 * Cloud Deployment Handler
 *
 * Manages Kokoro deployment via external API endpoint.
 * Handles HTTP requests, retries, and connection pooling.
 */
import type { CloudDeploymentHandler } from './cloud-handler.spec.js';
export declare class CloudHandler implements CloudDeploymentHandler {
    private endpoint;
    private apiKey;
    private httpAgent;
    private httpsAgent;
    private lastHealthCheck;
    private isConnected;
    private readonly retryConfig;
    constructor(endpoint: string, apiKey?: string);
    /**
     * Validate endpoint is accessible
     */
    validateEndpoint(endpoint: string): Promise<boolean>;
    /**
     * Test API authentication
     */
    testAuthentication(endpoint: string, apiKey?: string): Promise<boolean>;
    /**
     * Synthesize text via API with retry logic
     */
    synthesize(text: string, options?: {
        voice?: string;
        speed?: number;
        language?: string;
    }): Promise<Uint8Array>;
    /**
     * Stream synthesis response
     */
    synthesizeStream(text: string): AsyncIterable<Uint8Array>;
    /**
     * Get connection status
     */
    getConnectionStatus(): Promise<{
        connected: boolean;
        latencyMs?: number;
        lastCheck?: Date;
    }>;
    /**
     * Close connection pool and cleanup
     */
    close(): Promise<void>;
    /**
     * Make HTTP request with automatic retry on failure
     */
    private retryRequest;
    /**
     * Make individual HTTP request
     */
    private makeRequest;
}
//# sourceMappingURL=cloud-handler.d.ts.map