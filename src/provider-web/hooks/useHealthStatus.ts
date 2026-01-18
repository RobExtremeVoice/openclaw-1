/**
 * useHealthStatus Hook
 * Manages WebSocket connection for real-time health updates
 */

import { useEffect, useCallback } from 'react';
import { useVoiceStore } from '../store/voice-store.js';
import * as voiceApi from '../api/voice-api.js';

export function useHealthStatus() {
  const { updateHealthStatus, setWSConnected, setError } = useVoiceStore();

  useEffect(() => {
    const handleUpdate = (status: any) => {
      updateHealthStatus(status);
    };

    const handleError = (error: Error) => {
      setError(error.message);
      setWSConnected(false);
    };

    // Connect to WebSocket stream
    const cleanup = voiceApi.connectHealthStream(handleUpdate, handleError);

    setWSConnected(true);

    return cleanup;
  }, [updateHealthStatus, setWSConnected, setError]);
}
