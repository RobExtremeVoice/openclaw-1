/**
 * useProviderMetrics Hook
 * Manages provider metrics collection and updates
 */

import { useEffect, useCallback } from 'react';
import { useVoiceStore, type ProviderMetrics } from '../store/voice-store.js';

export function useProviderMetrics(refreshIntervalMs: number = 10000) {
  const { providers, updateMetrics } = useVoiceStore();

  const calculateMetrics = useCallback((): ProviderMetrics[] => {
    // In a real implementation, this would aggregate metrics from the backend
    // For now, return placeholder metrics based on providers
    return providers.map((provider) => ({
      providerId: provider.id,
      latency: Math.random() * 100 + 20, // 20-120ms
      errorRate: Math.random() * 0.1, // 0-10%
      successCount: Math.floor(Math.random() * 1000) + 100,
      failureCount: Math.floor(Math.random() * 50),
      lastUpdated: Date.now(),
    }));
  }, [providers]);

  useEffect(() => {
    const interval = setInterval(() => {
      const metrics = calculateMetrics();
      updateMetrics(metrics);
    }, refreshIntervalMs);

    // Calculate immediately on mount
    const metrics = calculateMetrics();
    updateMetrics(metrics);

    return () => clearInterval(interval);
  }, [calculateMetrics, updateMetrics, refreshIntervalMs]);

  return { refresh: calculateMetrics };
}
