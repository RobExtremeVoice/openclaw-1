/**
 * ProviderStatusCard Component
 * Displays real-time status and metrics for a single voice provider
 */

import React, { useState } from 'react';
import type { ApiVoiceProvider, ApiProviderStatus } from '../../../ui/types/voice-api.js';
import type { ProviderMetrics } from '../../store/voice-store.js';
import '../../../provider-web/styles/voice-dashboard.css';

interface ProviderStatusCardProps {
  provider: ApiVoiceProvider;
  healthStatus?: ApiProviderStatus;
  metrics?: ProviderMetrics;
  isActive: boolean;
  onQuickTest: () => void;
  onSwitch: () => void;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
}

export const ProviderStatusCard: React.FC<ProviderStatusCardProps> = ({
  provider,
  healthStatus,
  metrics,
  isActive,
  onQuickTest,
  onSwitch,
}) => {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0 });

  const getStatusColor = (): string => {
    if (!healthStatus) return 'bg-gray-200';
    if (!healthStatus.available) return 'bg-red-500';
    if (!healthStatus.healthy) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = (): string => {
    if (!healthStatus) return 'Unknown';
    if (!healthStatus.available) return 'Unavailable';
    if (!healthStatus.healthy) return 'Degraded';
    return 'Healthy';
  };

  const getTrendIndicator = (): string => {
    if (!metrics) return '';
    // In a real implementation, compare with previous latency
    return metrics.latency < 50 ? '↓' : '↑';
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left,
      y: rect.top - 10,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ ...tooltip, visible: false });
  };

  return (
    <div className="provider-card">
      <div className="provider-header">
        <div className="provider-title-section">
          <span className={`status-indicator ${getStatusColor()}`} />
          <div>
            <h3 className="provider-name">{provider.name}</h3>
            <p className="provider-type">{provider.type.toUpperCase()}</p>
          </div>
        </div>

        {isActive && <span className="active-badge">Active</span>}
      </div>

      <div className="provider-metrics">
        {metrics && (
          <>
            <div
              className="metric-item"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <span className="metric-label">Latency</span>
              <span className="metric-value">
                {metrics.latency.toFixed(0)}ms {getTrendIndicator()}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Error Rate</span>
              <span className="metric-value">{(metrics.errorRate * 100).toFixed(1)}%</span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Success Rate</span>
              <span className="metric-value">
                {((metrics.successCount / (metrics.successCount + metrics.failureCount)) * 100).toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      {healthStatus && (
        <div className="provider-status">
          <span className="status-text">{getStatusText()}</span>
          {healthStatus.lastChecked && (
            <span className="last-check">
              Last check: {new Date(healthStatus.lastChecked).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {healthStatus?.warnings && healthStatus.warnings.length > 0 && (
        <div className="warnings">
          {healthStatus.warnings.map((warning, i) => (
            <div key={i} className="warning-item">
              ⚠️ {warning}
            </div>
          ))}
        </div>
      )}

      <div className="provider-actions">
        <button
          className="action-button test-button"
          onClick={onQuickTest}
          title="Run quick test on this provider"
        >
          Test
        </button>

        {!isActive && (
          <button
            className="action-button switch-button"
            onClick={onSwitch}
            title="Switch to this provider"
          >
            Switch
          </button>
        )}

        <button
          className="action-button settings-button"
          title="Provider settings"
        >
          ⚙️
        </button>
      </div>

      {tooltip.visible && (
        <div className="tooltip" style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}>
          <div className="tooltip-content">
            <div>
              <strong>Latency:</strong> {metrics?.latency.toFixed(2)}ms
            </div>
            <div>
              <strong>Success Count:</strong> {metrics?.successCount}
            </div>
            <div>
              <strong>Failure Count:</strong> {metrics?.failureCount}
            </div>
            <div>
              <strong>Updated:</strong> {new Date(metrics?.lastUpdated ?? 0).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
