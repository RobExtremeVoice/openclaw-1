/**
 * Voice Provider Store
 * State management for voice provider dashboard using Zustand
 */

import { create } from 'zustand';
import type { ApiVoiceProvider, ApiProviderStatus, ApiVoiceConfig } from '../../../ui/types/voice-api.js';

export interface TestResult {
  provider: string;
  success: boolean;
  duration: number;
  transcript?: string;
  confidence?: number;
  audioUrl?: string;
  error?: string;
  timestamp: number;
}

export interface ProviderMetrics {
  providerId: string;
  latency: number;
  errorRate: number;
  successCount: number;
  failureCount: number;
  lastUpdated: number;
}

export interface VoiceStore {
  // State
  providers: ApiVoiceProvider[];
  activeSTT: string | null;
  activeTTS: string | null;
  config: ApiVoiceConfig | null;
  healthStatus: Record<string, ApiProviderStatus>;
  metrics: ProviderMetrics[];
  testResult: TestResult | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;

  // Actions
  setProviders: (providers: ApiVoiceProvider[]) => void;
  setActiveSTT: (id: string) => void;
  setActiveTTS: (id: string) => void;
  setConfig: (config: ApiVoiceConfig) => void;
  updateHealthStatus: (status: ApiProviderStatus) => void;
  updateMetrics: (metrics: ProviderMetrics[]) => void;
  setTestResult: (result: TestResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWSConnected: (connected: boolean) => void;
  reset: () => void;
}

const initialState = {
  providers: [],
  activeSTT: null,
  activeTTS: null,
  config: null,
  healthStatus: {},
  metrics: [],
  testResult: null,
  loading: false,
  error: null,
  wsConnected: false,
};

export const useVoiceStore = create<VoiceStore>((set) => ({
  ...initialState,

  setProviders: (providers) => set({ providers }),

  setActiveSTT: (id) => set({ activeSTT: id }),

  setActiveTTS: (id) => set({ activeTTS: id }),

  setConfig: (config) => set({ config }),

  updateHealthStatus: (status) =>
    set((state) => ({
      healthStatus: {
        ...state.healthStatus,
        [status.id]: status,
      },
    })),

  updateMetrics: (metrics) => set({ metrics }),

  setTestResult: (result) => set({ testResult: result }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setWSConnected: (connected) => set({ wsConnected: connected }),

  reset: () => set(initialState),
}));

/**
 * Selector: Get active STT provider details
 */
export const getActiveSTTProvider = (store: VoiceStore): ApiVoiceProvider | undefined => {
  return store.providers.find((p) => p.id === store.activeSTT);
};

/**
 * Selector: Get active TTS provider details
 */
export const getActiveTTSProvider = (store: VoiceStore): ApiVoiceProvider | undefined => {
  return store.providers.find((p) => p.id === store.activeTTS);
};

/**
 * Selector: Get STT providers only
 */
export const getSTTProviders = (store: VoiceStore): ApiVoiceProvider[] => {
  return store.providers.filter((p) => p.type === 'stt');
};

/**
 * Selector: Get TTS providers only
 */
export const getTTSProviders = (store: VoiceStore): ApiVoiceProvider[] => {
  return store.providers.filter((p) => p.type === 'tts');
};

/**
 * Selector: Get metrics for a specific provider
 */
export const getProviderMetrics = (
  store: VoiceStore,
  providerId: string
): ProviderMetrics | undefined => {
  return store.metrics.find((m) => m.providerId === providerId);
};

/**
 * Selector: Get health status for a specific provider
 */
export const getProviderHealth = (
  store: VoiceStore,
  providerId: string
): ApiProviderStatus | undefined => {
  return store.healthStatus[providerId];
};
