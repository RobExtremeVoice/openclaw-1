/**
 * ProviderSelector Component
 * Allows users to select STT and TTS providers with visual comparison
 */

import React, { useState } from 'react';
import { useVoiceStore } from '../../store/voice-store.js';
import type { ApiVoiceProvider } from '../../../ui/types/voice-api.js';

interface ProviderSelectorProps {
  onSTTChange: (providerId: string) => void;
  onTTSChange: (providerId: string) => void;
  onFallbackChainUpdate?: (chain: string[]) => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  onSTTChange,
  onTTSChange,
  onFallbackChainUpdate,
}) => {
  const { providers, activeSTT, activeTTS, metrics } = useVoiceStore();
  const [showComparison, setShowComparison] = useState(false);
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);

  const sttProviders = providers.filter((p) => p.type === 'stt');
  const ttsProviders = providers.filter((p) => p.type === 'tts');

  const getMetricLatency = (providerId: string): number | undefined => {
    return metrics.find((m) => m.providerId === providerId)?.latency;
  };

  const handleFallbackAdd = (providerId: string) => {
    if (!fallbackChain.includes(providerId) && providerId !== activeSTT) {
      const newChain = [...fallbackChain, providerId];
      setFallbackChain(newChain);
      onFallbackChainUpdate?.([activeSTT || '', ...newChain]);
    }
  };

  const handleFallbackRemove = (index: number) => {
    const newChain = fallbackChain.filter((_, i) => i !== index);
    setFallbackChain(newChain);
    onFallbackChainUpdate?.([activeSTT || '', ...newChain]);
  };

  return (
    <div className="provider-selector">
      {/* STT Provider Selector */}
      <div className="selector-section">
        <h3 className="selector-title">STT Provider</h3>
        <div className="selector-content">
          <select
            className="provider-dropdown"
            value={activeSTT || ''}
            onChange={(e) => onSTTChange(e.target.value)}
          >
            <option value="">Select STT Provider</option>
            {sttProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {getMetricLatency(provider.id) && ` (${getMetricLatency(provider.id)?.toFixed(0)}ms)`}
              </option>
            ))}
          </select>

          {activeSTT && (
            <div className="active-indicator">
              <span className="active-dot" />
              Active
            </div>
          )}
        </div>

        {/* Fallback Chain Visualization */}
        <div className="fallback-section">
          <h4 className="fallback-title">Fallback Chain</h4>
          <div className="fallback-chain">
            {activeSTT && (
              <div className="chain-item primary">
                {providers.find((p) => p.id === activeSTT)?.name || 'Primary'}
              </div>
            )}

            {fallbackChain.map((providerId, index) => (
              <React.Fragment key={providerId}>
                <div className="chain-arrow">→</div>
                <div className="chain-item fallback">
                  {providers.find((p) => p.id === providerId)?.name || 'Fallback'}
                  <button
                    className="remove-button"
                    onClick={() => handleFallbackRemove(index)}
                    title="Remove from fallback chain"
                  >
                    ✕
                  </button>
                </div>
              </React.Fragment>
            ))}

            {sttProviders.length > 1 && (
              <div className="add-fallback">
                <select
                  className="fallback-dropdown"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleFallbackAdd(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="">Add fallback...</option>
                  {sttProviders
                    .filter(
                      (p) =>
                        p.id !== activeSTT && !fallbackChain.includes(p.id)
                    )
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TTS Provider Selector */}
      <div className="selector-section">
        <h3 className="selector-title">TTS Provider</h3>
        <div className="selector-content">
          <select
            className="provider-dropdown"
            value={activeTTS || ''}
            onChange={(e) => onTTSChange(e.target.value)}
          >
            <option value="">Select TTS Provider</option>
            {ttsProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {getMetricLatency(provider.id) && ` (${getMetricLatency(provider.id)?.toFixed(0)}ms)`}
              </option>
            ))}
          </select>

          {activeTTS && (
            <div className="active-indicator">
              <span className="active-dot" />
              Active
            </div>
          )}
        </div>

        {/* Language Support Indicator */}
        {activeTTS && providers.find((p) => p.id === activeTTS) && (
          <div className="language-support">
            <h4>Supported Languages</h4>
            <div className="language-list">
              {providers
                .find((p) => p.id === activeTTS)
                ?.config.languages?.slice(0, 5)
                .map((lang) => (
                  <span key={lang} className="language-badge">
                    {lang}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Button */}
      <div className="selector-actions">
        <button
          className="comparison-button"
          onClick={() => setShowComparison(!showComparison)}
        >
          {showComparison ? 'Hide Comparison' : 'Show Comparison'}
        </button>
      </div>

      {/* Performance Comparison Preview */}
      {showComparison && (
        <div className="comparison-preview">
          <h4>Performance Comparison</h4>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Latency</th>
                <th>Error Rate</th>
                <th>Success Count</th>
              </tr>
            </thead>
            <tbody>
              {[...sttProviders, ...ttsProviders].map((provider) => {
                const metric = metrics.find((m) => m.providerId === provider.id);
                return (
                  <tr key={provider.id}>
                    <td>{provider.name}</td>
                    <td>{metric?.latency.toFixed(2)}ms</td>
                    <td>{((metric?.errorRate || 0) * 100).toFixed(1)}%</td>
                    <td>{metric?.successCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
