/**
 * useVoiceTest Hook
 * Handles STT and TTS testing functionality
 */

import { useState, useCallback } from 'react';
import { useVoiceStore, type TestResult } from '../store/voice-store.js';
import * as voiceApi from '../api/voice-api.js';

interface UseVoiceTestOptions {
  onSuccess?: (result: TestResult) => void;
  onError?: (error: Error) => void;
}

export function useVoiceTest(options: UseVoiceTestOptions = {}) {
  const { setTestResult } = useVoiceStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testSTT = useCallback(
    async (providerId: string, audioFile: File, language?: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await voiceApi.testTranscribe(providerId, audioFile, language);

        const result: TestResult = {
          provider: response.provider,
          success: response.success,
          duration: response.duration,
          transcript: response.transcript,
          confidence: response.confidence,
          error: response.error,
          timestamp: response.timestamp,
        };

        setTestResult(result);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        options.onError?.(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setTestResult, options]
  );

  const testTTS = useCallback(
    async (
      providerId: string,
      text: string,
      voice?: string,
      speed?: number,
      instructions?: string
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await voiceApi.testSynthesize({
          providerId,
          text,
          voice,
          speed,
          instructions,
        });

        const result: TestResult = {
          provider: response.provider,
          success: response.success,
          duration: response.duration,
          audioUrl: response.audioUrl,
          error: response.error,
          timestamp: response.timestamp,
        };

        setTestResult(result);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        options.onError?.(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setTestResult, options]
  );

  return {
    testSTT,
    testTTS,
    loading,
    error,
  };
}
