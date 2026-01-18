/**
 * HealthMonitor Component
 * Listens to WebSocket updates and broadcasts provider health status
 */

import React, { useEffect, useState } from 'react';
import { useHealthStatus } from '../../hooks/useHealthStatus.js';
import { useVoiceStore } from '../../store/voice-store.js';

interface HealthMonitorProps {
  onStatusChange?: (providerId: string, isHealthy: boolean) => void;
}

export const HealthMonitor: React.FC<HealthMonitorProps> = ({ onStatusChange }) => {
  useHealthStatus();

  const { healthStatus, wsConnected, providers } = useVoiceStore();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Broadcast status changes
    Object.entries(healthStatus).forEach(([providerId, status]) => {
      const isHealthy = status.available && status.healthy;
      onStatusChange?.(providerId, isHealthy);
    });
  }, [healthStatus, onStatusChange]);

  const healthyCount = Object.values(healthStatus).filter(
    (s) => s.available && s.healthy
  ).length;
  const totalCount = Object.keys(healthStatus).length;

  return (
    <div className="health-monitor">
      <div className="monitor-header">
        <h3>System Health</h3>
        <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot" />
          {wsConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="health-summary">
        <div className="health-badge">
          <span className="health-label">Providers Healthy</span>
          <span className="health-value">
            {healthyCount}/{totalCount}
          </span>
        </div>

        <div className="health-percentage">
          <div className="percentage-bar">
            <div
              className="percentage-fill"
              style={{ width: `${(healthyCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="percentage-text">
            {totalCount > 0 ? ((healthyCount / totalCount) * 100).toFixed(1) : 0}% Healthy
          </span>
        </div>
      </div>

      <button
        className="toggle-details-button"
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>

      {showDetails && (
        <div className="health-details">
          {Object.entries(healthStatus).map(([providerId, status]) => {
            const provider = providers.find((p) => p.id === providerId);
            const isHealthy = status.available && status.healthy;

            return (
              <div key={providerId} className={`health-detail-row ${isHealthy ? 'healthy' : 'unhealthy'}`}>
                <div className="detail-provider">
                  <span className={`detail-indicator ${isHealthy ? 'healthy' : 'unhealthy'}`} />
                  <span className="detail-name">{provider?.name || providerId}</span>
                </div>

                <div className="detail-status">
                  <span className="status-badge">
                    {status.available ? 'Available' : 'Unavailable'}
                  </span>
                  {status.healthy ? (
                    <span className="health-badge-good">Healthy</span>
                  ) : (
                    <span className="health-badge-bad">Degraded</span>
                  )}
                </div>

                <div className="detail-meta">
                  {status.uptime && (
                    <span className="meta-item">
                      Uptime: {((status.uptime / 86400) * 100).toFixed(1)}%
                    </span>
                  )}
                  {status.lastChecked && (
                    <span className="meta-item">
                      Last Check: {new Date(status.lastChecked).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {status.resourceUsage && (
                  <div className="resource-usage">
                    {status.resourceUsage.gpu?.enabled && (
                      <span className="resource-item gpu">
                        GPU: {(status.resourceUsage.gpu.utilization || 0).toFixed(1)}%
                      </span>
                    )}
                    {status.resourceUsage.memory && (
                      <span className="resource-item memory">
                        Memory: {(status.resourceUsage.memory / 1024 / 1024).toFixed(0)}MB
                      </span>
                    )}
                    {status.resourceUsage.cpu && (
                      <span className="resource-item cpu">
                        CPU: {status.resourceUsage.cpu.toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}

                {status.warnings && status.warnings.length > 0 && (
                  <div className="warnings-section">
                    {status.warnings.map((warning, i) => (
                      <div key={i} className="warning-item">
                        ⚠️ {warning}
                      </div>
                    ))}
                  </div>
                )}

                {status.errors && status.errors.length > 0 && (
                  <div className="errors-section">
                    {status.errors.map((error, i) => (
                      <div key={i} className="error-item">
                        ❌ {error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
