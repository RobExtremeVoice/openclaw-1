/**
 * useVoiceProviders Hook
 * Fetches and manages voice provider data
 */

import { useEffect, useCallback } from 'react';
import { useVoiceStore } from '../store/voice-store.js';
import * as voiceApi from '../api/voice-api.js';

export function useVoiceProviders() {
  const { setProviders, setLoading, setError, setActiveSTT, setActiveTTS } = useVoiceStore();

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const providers = await voiceApi.getProviders();
      setProviders(providers);

      // Set defaults if not already set
      const sttProvider = providers.find((p) => p.type === 'stt');
      const ttsProvider = providers.find((p) => p.type === 'tts');

      if (sttProvider) setActiveSTT(sttProvider.id);
      if (ttsProvider) setActiveTTS(ttsProvider.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch providers';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setProviders, setLoading, setError, setActiveSTT, setActiveTTS]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { refetch: fetchProviders };
}
