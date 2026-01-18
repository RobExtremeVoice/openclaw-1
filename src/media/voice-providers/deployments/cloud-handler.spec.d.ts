/**
 * Cloud Deployment Handler Specification
 *
 * This file outlines the contract that the Cloud deployment handler
 * sub-agent must implement.
 *
 * IMPLEMENTATION CHECKLIST:
 * - [ ] Validate endpoint URL and connectivity
 * - [ ] Test API authentication with apiKey
 * - [ ] Implement HTTP client with connection pooling
 * - [ ] Add exponential backoff retry logic
 * - [ ] Handle rate limiting and circuit breaker patterns
 * - [ ] Implement request timeouts and graceful degradation
 * - [ ] Support streaming responses
 * - [ ] Write tests for: connectivity, auth, retries, rate limit handling, timeouts
 */
/**
 * Cloud deployment handler interface
 */
export interface CloudDeploymentHandler {
    /**
     * Validate endpoint is accessible
     * @param endpoint - API endpoint URL
     */
    validateEndpoint(endpoint: string): Promise<boolean>;
    /**
     * Test API authentication
     * @param endpoint - API endpoint URL
     * @param apiKey - API key (optional)
     */
    testAuthentication(endpoint: string, apiKey?: string): Promise<boolean>;
    /**
     * Synthesize text via Cloud API
     * @param text - Text to synthesize
     * @param options - Synthesis options
     */
    synthesize(text: string, options?: {
        voice?: string;
        speed?: number;
        language?: string;
    }): Promise<Uint8Array>;
    /**
     * Stream synthesis response
     * @param text - Text to synthesize
     */
    synthesizeStream(text: string): AsyncIterable<Uint8Array>;
    /**
     * Get current connection status
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
}
/**
 * Retry configuration
 */
export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}
/**
 * Expected implementation location:
 * /src/media/voice-providers/deployments/cloud-handler.ts
 */
export declare const CloudHandlerContract: {};
//# sourceMappingURL=cloud-handler.spec.d.ts.map