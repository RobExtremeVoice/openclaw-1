/**
 * Voice Provider API Integration
 * Handles all communication with the voice provider backend
 */

import type {
  ApiVoiceProvider,
  ApiProviderStatus,
  GetProvidersResponse,
  GetProviderStatusResponse,
  GetCapabilitiesResponse,
  TestTTSRequest,
  TestTTSResponse,
  TestSTTRequest,
  TestSTTResponse,
  VoiceSystemHealth,
  ApiVoiceConfig,
  GetConfigResponse,
  SetConfigRequest,
} from '../../../ui/types/voice-api.js';

const API_BASE = '/api/voice';

/**
 * Get all available voice providers
 */
export async function getProviders(): Promise<ApiVoiceProvider[]> {
  const response = await fetch(`${API_BASE}/providers`);
  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${response.statusText}`);
  }
  const data = (await response.json()) as GetProvidersResponse;
  return data.providers;
}

/**
 * Get status of a specific provider
 */
export async function getProviderStatus(providerId: string): Promise<ApiProviderStatus> {
  const response = await fetch(`${API_BASE}/providers/${providerId}/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch status for ${providerId}: ${response.statusText}`);
  }
  const data = (await response.json()) as GetProviderStatusResponse;
  return data.status;
}

/**
 * Get capabilities of a specific provider
 */
export async function getProviderCapabilities(providerId: string): Promise<GetCapabilitiesResponse> {
  const response = await fetch(`${API_BASE}/providers/${providerId}/capabilities`);
  if (!response.ok) {
    throw new Error(`Failed to fetch capabilities for ${providerId}: ${response.statusText}`);
  }
  return response.json() as Promise<GetCapabilitiesResponse>;
}

/**
 * Test STT transcription
 */
export async function testTranscribe(
  providerId: string,
  audioFile: File,
  language?: string
): Promise<TestSTTResponse> {
  const formData = new FormData();
  formData.append('providerId', providerId);
  formData.append('audio', audioFile);
  if (language) {
    formData.append('language', language);
  }

  const response = await fetch(`${API_BASE}/test-stt`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`STT test failed: ${response.statusText}`);
  }
  return response.json() as Promise<TestSTTResponse>;
}

/**
 * Test TTS synthesis
 */
export async function testSynthesize(
  request: TestTTSRequest
): Promise<TestTTSResponse> {
  const response = await fetch(`${API_BASE}/test-tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`TTS test failed: ${response.statusText}`);
  }
  return response.json() as Promise<TestTTSResponse>;
}

/**
 * Get current voice configuration
 */
export async function getVoiceConfig(): Promise<ApiVoiceConfig> {
  const response = await fetch(`${API_BASE}/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch voice config: ${response.statusText}`);
  }
  const data = (await response.json()) as GetConfigResponse;
  return data.config;
}

/**
 * Update voice configuration
 */
export async function setVoiceConfig(config: ApiVoiceConfig): Promise<void> {
  const response = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update voice config: ${response.statusText}`);
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth(): Promise<VoiceSystemHealth> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Failed to fetch health status: ${response.statusText}`);
  }
  return response.json() as Promise<VoiceSystemHealth>;
}

/**
 * Connect to WebSocket for real-time updates
 */
export function connectHealthStream(
  onUpdate: (status: ApiProviderStatus) => void,
  onError: (error: Error) => void
): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}${API_BASE}/health-stream`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ApiProviderStatus;
          onUpdate(data);
        } catch (error) {
          onError(new Error(`Failed to parse WebSocket message: ${String(error)}`));
        }
      };

      ws.onerror = (event) => {
        onError(new Error(`WebSocket error: ${event.type}`));
      };

      ws.onclose = () => {
        // Attempt to reconnect with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, backoffMs);
      };
    } catch (error) {
      onError(new Error(`Failed to connect WebSocket: ${String(error)}`));
    }
  };

  connect();

  // Return cleanup function
  return () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (ws) {
      ws.close();
    }
  };
}
