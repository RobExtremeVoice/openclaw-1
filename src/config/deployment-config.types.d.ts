/**
 * Deployment Configuration Types
 *
 * Defines TypeScript interfaces for voice provider deployment modes
 * (Docker, System, Cloud) with comprehensive configuration options.
 *
 * Architecture:
 * - BaseDeploymentConfig: Common settings (timeout, retries, health checks)
 * - Mode-specific configs: Docker, System, Cloud
 * - Provider-specific overrides: Whisper, Faster-Whisper, Kokoro, ElevenLabs, etc.
 *
 * All providers inherit from BaseDeploymentConfig and extend with mode-specific fields.
 */
/**
 * Health check configuration for provider readiness/liveness probes
 */
export interface HealthCheckConfig {
    /** Enable health checks for this provider */
    enabled: boolean;
    /** HTTP endpoint or command to check health */
    endpoint?: string;
    /** Timeout for health check in milliseconds */
    timeoutMs?: number;
    /** Interval between health checks in milliseconds */
    intervalMs?: number;
    /** Number of failed checks before marking unhealthy */
    failureThreshold?: number;
    /** Number of successful checks before marking healthy */
    successThreshold?: number;
    /** Custom command to run for health verification (e.g., shell command) */
    command?: string;
    /** Expected exit code for command health checks (default: 0) */
    expectedExitCode?: number;
}
/**
 * Retry policy for transient failures
 */
export interface RetryPolicy {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Initial backoff delay in milliseconds */
    initialDelayMs: number;
    /** Maximum backoff delay in milliseconds */
    maxDelayMs: number;
    /** Backoff multiplier (exponential backoff: delay * multiplier ^ attempt) */
    multiplier: number;
    /** Status codes or error types to retry on */
    retryableErrors?: (string | number)[];
}
/**
 * Logging configuration for deployment
 */
export interface LoggingConfig {
    /** Log level: trace, debug, info, warn, error, fatal */
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    /** Enable request/response logging */
    verbose?: boolean;
    /** Log file path (if applicable) */
    filePath?: string;
    /** Maximum log file size in bytes */
    maxFileSize?: number;
    /** Maximum number of log files to retain */
    maxFiles?: number;
    /** Enable structured JSON logging */
    json?: boolean;
}
/**
 * Base deployment configuration - applicable to ALL modes
 */
export interface BaseDeploymentConfig {
    /** Unique provider identifier (e.g., "whisper-docker", "openai-api") */
    id: string;
    /** Human-readable provider name */
    name?: string;
    /** Provider type/implementation (whisper, faster-whisper, kokoro, etc.) */
    type: string;
    /** Deployment mode: docker, system, or cloud */
    mode: 'docker' | 'system' | 'cloud';
    /** Enable/disable this provider */
    enabled?: boolean;
    /** Priority in fallback chain (higher = used first) */
    priority?: number;
    /** Request timeout in milliseconds */
    timeoutMs?: number;
    /** Global retry policy */
    retries?: RetryPolicy;
    /** Health check configuration */
    healthCheck?: HealthCheckConfig;
    /** Logging configuration */
    logging?: LoggingConfig;
    /** Custom metadata/tags */
    tags?: Record<string, string>;
    /** Deployment-specific environment variables */
    env?: Record<string, string>;
}
/**
 * Docker deployment configuration
 */
export interface DockerDeploymentConfig extends Omit<BaseDeploymentConfig, 'logging'> {
    mode: 'docker';
    /** Docker image name (e.g., "openai/whisper", "registry.example.com/kokoro:latest") */
    image: string;
    /** Docker image tag (if not included in image) */
    tag?: string;
    /** Image pull policy: "always", "ifNotPresent", "never" */
    pullPolicy?: 'always' | 'ifNotPresent' | 'never';
    /** Container port mapping (internal: external) */
    ports: Record<number, number>;
    /** Volume mounts: { containerPath: hostPath } */
    volumes?: Record<string, string>;
    /** Docker network name (default: "bridge") */
    network?: string;
    /** Container startup command override */
    command?: string[];
    /** Container startup arguments */
    args?: string[];
    /** Whether to build image locally before running */
    buildFirst?: boolean;
    /** Dockerfile path if building locally */
    dockerfilePath?: string;
    /** Resource limits */
    resources?: {
        /** Memory limit in MB */
        memoryMb?: number;
        /** CPU limit (0.5 = half CPU) */
        cpuLimit?: number;
        /** Memory soft limit (request) in MB */
        memoryRequestMb?: number;
        /** CPU request in cores */
        cpuRequest?: number;
    };
    /** Restart policy */
    restartPolicy?: 'no' | 'always' | 'onFailure' | 'unlessStopped';
    /** Restart maximum retry count (for onFailure) */
    maxRetryCount?: number;
    /** Container logging driver and options (Docker-specific, overrides base logging) */
    logging?: {
        driver?: string;
        options?: Record<string, string>;
    };
    /** Security options */
    security?: {
        /** Run as privileged container */
        privileged?: boolean;
        /** User to run container as (e.g., "1000:1000") */
        user?: string;
        /** Capabilities to add/drop */
        capAdd?: string[];
        capDrop?: string[];
    };
    /** Health check for container readiness */
    containerHealthCheck?: {
        command: string[];
        intervalMs?: number;
        timeoutMs?: number;
        retries?: number;
        startPeriodMs?: number;
    };
    /** Additional Docker flags/options */
    additionalFlags?: Record<string, string | boolean>;
}
/**
 * System deployment configuration (local binary/package)
 */
export interface SystemDeploymentConfig extends BaseDeploymentConfig {
    mode: 'system';
    /** System package/binary name (e.g., "whisper", "piper", "kokoro-cli") */
    binary: string;
    /** Package manager(s) to check: npm, pip, brew, apt, dnf, pacman */
    packageManager?: ('npm' | 'pip' | 'brew' | 'apt' | 'dnf' | 'pacman')[];
    /** NPM package name if different from binary name */
    npmPackage?: string;
    /** PyPI package name if different from binary name */
    pypiPackage?: string;
    /** Homebrew formula name if different from binary name */
    brewFormula?: string;
    /** APT/Debian package name */
    aptPackage?: string;
    /** System paths to check for binary (e.g., ["/usr/local/bin", "/opt/whisper/bin"]) */
    searchPaths?: string[];
    /** Version constraint (e.g., ">=1.0.0", "^2.1.0") */
    versionConstraint?: string;
    /** Required system dependencies */
    systemDependencies?: {
        name: string;
        packageManager: string;
        required: boolean;
        optional?: boolean;
    }[];
    /** Installation instructions if binary not found */
    installationInstructions?: {
        title?: string;
        command?: string;
        manualSteps?: string[];
        documentationUrl?: string;
    };
    /** CLI flags and common options */
    cliFlags?: {
        /** Map of flag names to default values */
        defaults?: Record<string, string | boolean | number>;
        /** Custom CLI wrapper command (if binary needs wrapping) */
        wrapper?: string;
        /** CLI working directory */
        cwd?: string;
    };
    /** Required environment variables */
    environmentSetup?: Record<string, string>;
    /** Model/data download locations */
    models?: {
        /** Model directory path */
        path: string;
        /** Auto-download models if missing */
        autoDownload?: boolean;
        /** Pre-download specific model names */
        predownload?: string[];
        /** Model sources and URLs */
        sources?: Record<string, string>;
    };
    /** Capability detection (can be called at startup to verify installation) */
    capabilityCheck?: {
        command: string;
        successIndicator?: string;
    };
}
/**
 * Cloud deployment configuration (API-based)
 */
export interface CloudDeploymentConfig extends BaseDeploymentConfig {
    mode: 'cloud';
    /** API provider: openai, google, azure, elevenlabs, etc. */
    provider: string;
    /** API endpoint URL */
    endpoint: string;
    /** API version (if applicable) */
    apiVersion?: string;
    /** Authentication method */
    auth?: {
        type: 'apiKey' | 'oauth2' | 'bearer' | 'custom';
        /** API key field name (default: "Authorization") */
        keyField?: string;
        /** OAuth2 endpoints (if using oauth2 auth) */
        oauth2?: {
            tokenEndpoint: string;
            authorizeEndpoint: string;
            clientId?: string;
            clientSecret?: string;
            scopes?: string[];
        };
        /** Custom auth headers */
        headers?: Record<string, string>;
    };
    /** Rate limiting configuration */
    rateLimit?: {
        /** Requests per minute */
        requestsPerMinute?: number;
        /** Requests per day */
        requestsPerDay?: number;
        /** Concurrent request limit */
        maxConcurrent?: number;
        /** Queue strategy: fifo, prioritize */
        queueStrategy?: 'fifo' | 'prioritize';
    };
    /** Quota management */
    quota?: {
        /** Enable quota tracking */
        enabled?: boolean;
        /** Monthly character limit for TTS */
        monthlyCharacterLimit?: number;
        /** Monthly request limit */
        monthlyRequestLimit?: number;
        /** Cost per 1k characters/tokens */
        costPer1kUnits?: number;
        /** Alert when usage reaches % of quota */
        alertThreshold?: number;
    };
    /** Fallback endpoints (for redundancy) */
    fallbackEndpoints?: {
        url: string;
        priority?: number;
    }[];
    /** Request/response transformation */
    transforms?: {
        /** Request body transformer (custom logic) */
        requestTransform?: (payload: any) => any;
        /** Response body transformer */
        responseTransform?: (response: any) => any;
        /** Expected response schema validation */
        responseSchema?: Record<string, any>;
    };
    /** Supported models/voices (provider-specific) */
    availableModels?: string[];
    availableVoices?: string[];
    /** Model/voice fallbacks if primary unavailable */
    modelFallbacks?: Record<string, string>;
    voiceFallbacks?: Record<string, string>;
    /** Regional endpoint configuration (for multi-region providers) */
    regions?: {
        /** Default region */
        default: string;
        /** Region endpoints */
        endpoints?: Record<string, string>;
        /** Region-specific latency preferences */
        preferredRegions?: string[];
    };
    /** Cost tracking and budgeting */
    budget?: {
        /** Monthly budget in USD */
        monthlyLimit?: number;
        /** Daily budget in USD */
        dailyLimit?: number;
        /** Alert when daily spending reaches amount */
        alertThreshold?: number;
    };
    /** Caching configuration for redundant requests */
    cache?: {
        enabled?: boolean;
        ttlSeconds?: number;
        maxEntries?: number;
    };
}
/**
 * Union type for all deployment configurations
 */
export type DeploymentConfig = DockerDeploymentConfig | SystemDeploymentConfig | CloudDeploymentConfig;
/**
 * Provider-specific deployment overrides
 * Allows customization per provider while maintaining schema compatibility
 */
export interface ProviderDeploymentOverrides {
    /** Provider ID to apply overrides to */
    providerId: string;
    /** Override fields (partial, only override what's needed) */
    overrides: Partial<DeploymentConfig>;
    /** Merge strategy: "merge" (extend), "replace" (override completely) */
    strategy?: 'merge' | 'replace';
}
/**
 * Deployment health status
 */
export interface DeploymentHealthStatus {
    providerId: string;
    mode: 'docker' | 'system' | 'cloud';
    healthy: boolean;
    lastCheck: Date;
    nextCheck?: Date;
    details?: Record<string, any>;
    error?: string;
}
/**
 * Deployment initialization result
 */
export interface DeploymentInitResult {
    providerId: string;
    mode: 'docker' | 'system' | 'cloud';
    success: boolean;
    duration: number;
    error?: Error;
    warnings: string[];
    details: Record<string, unknown>;
}
//# sourceMappingURL=deployment-config.types.d.ts.map