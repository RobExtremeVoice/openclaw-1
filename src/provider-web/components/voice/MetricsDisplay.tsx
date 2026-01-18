/**
 * MetricsDisplay Component
 * Shows latency, error rates, and provider comparisons
 */

import React, { useState, useMemo } from 'react';
import { useVoiceStore } from '../../store/voice-store.js';

type RefreshInterval = 5000 | 10000 | 30000 | 60000;

export const MetricsDisplay: React.FC = () => {
  const { providers, metrics } = useVoiceStore();
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(10000);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  const chartData = useMemo(() => {
    // Generate mock time-series data for latency chart
    const now = Date.now();
    const points = [];
    const intervalMs = timeRange === '1h' ? 60000 : timeRange === '24h' ? 3600000 : 86400000;
    const pointCount = timeRange === '1h' ? 60 : timeRange === '24h' ? 24 : 7;

    for (let i = 0; i < pointCount; i++) {
      points.push({
        time: new Date(now - (pointCount - i) * intervalMs).toLocaleString(),
        timestamp: now - (pointCount - i) * intervalMs,
      });
    }

    return points;
  }, [timeRange]);

  const latencyStats = useMemo(() => {
    if (metrics.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        p95: 0,
      };
    }

    const latencies = metrics.map((m) => m.latency).sort((a, b) => a - b);
    return {
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      min: latencies[0],
      max: latencies[latencies.length - 1],
      p95: latencies[Math.floor(latencies.length * 0.95)],
    };
  }, [metrics]);

  const errorStats = useMemo(() => {
    const total = metrics.length;
    const avgErrorRate = total > 0
      ? metrics.reduce((acc, m) => acc + m.errorRate, 0) / total
      : 0;

    const errorCounts: Record<string, number> = {};
    metrics.forEach((m) => {
      const provider = providers.find((p) => p.id === m.providerId);
      if (provider) {
        errorCounts[provider.type] = (errorCounts[provider.type] || 0) + m.failureCount;
      }
    });

    return { avgErrorRate, errorCounts };
  }, [metrics, providers]);

  const handleExportMetrics = () => {
    const data = {
      timestamp: new Date().toISOString(),
      timeRange,
      metrics,
      latencyStats,
      errorStats,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voice-metrics-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="metrics-display">
      {/* Header */}
      <div className="metrics-header">
        <h2>Performance Metrics</h2>

        <div className="metrics-controls">
          <select
            className="time-range-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          <select
            className="refresh-interval-select"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(parseInt(e.target.value) as RefreshInterval)}
          >
            <option value={5000}>Refresh: 5s</option>
            <option value={10000}>Refresh: 10s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={60000}>Refresh: 1m</option>
          </select>

          <button className="export-button" onClick={handleExportMetrics}>
            Export Metrics
          </button>
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="statistics-bar">
        <div className="stat-card">
          <span className="stat-label">Avg Latency</span>
          <span className="stat-value">{latencyStats.avg.toFixed(2)}ms</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Min Latency</span>
          <span className="stat-value">{latencyStats.min.toFixed(2)}ms</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Max Latency</span>
          <span className="stat-value">{latencyStats.max.toFixed(2)}ms</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">P95 Latency</span>
          <span className="stat-value">{latencyStats.p95.toFixed(2)}ms</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Avg Error Rate</span>
          <span className="stat-value">{(errorStats.avgErrorRate * 100).toFixed(1)}%</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Total Requests</span>
          <span className="stat-value">
            {metrics.reduce((acc, m) => acc + m.successCount + m.failureCount, 0)}
          </span>
        </div>
      </div>

      {/* Latency Chart */}
      <div className="chart-container">
        <h3>Latency Trend ({timeRange})</h3>
        <div className="latency-chart">
          <svg viewBox="0 0 800 300" className="chart-svg">
            {/* Grid lines */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={`grid-${i}`}
                x1="50"
                y1={50 + (i * 50)}
                x2="750"
                y2={50 + (i * 50)}
                stroke="#e0e0e0"
                strokeDasharray="5,5"
              />
            ))}

            {/* Y-axis labels */}
            {[0, 1, 2, 3, 4].map((i) => (
              <text
                key={`y-label-${i}`}
                x="35"
                y={55 + (i * 50)}
                textAnchor="end"
                fontSize="12"
                fill="#666"
              >
                {((4 - i) * 50).toFixed(0)}ms
              </text>
            ))}

            {/* X-axis */}
            <line x1="50" y1="250" x2="750" y2="250" stroke="#333" strokeWidth="2" />

            {/* Y-axis */}
            <line x1="50" y1="50" x2="50" y2="250" stroke="#333" strokeWidth="2" />

            {/* X-axis labels */}
            {chartData.map((point, i) =>
              i % Math.ceil(chartData.length / 6) === 0 ? (
                <text
                  key={`x-label-${i}`}
                  x={50 + (i / chartData.length) * 700}
                  y="275"
                  textAnchor="middle"
                  fontSize="12"
                  fill="#666"
                >
                  {new Date(point.timestamp).toLocaleTimeString()}
                </text>
              ) : null
            )}

            {/* Sample latency line */}
            <polyline
              points={chartData
                .map((_, i) => {
                  const x = 50 + (i / chartData.length) * 700;
                  const y = 250 - (Math.random() * 150 + 50);
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>

      {/* Error Rate Pie Chart */}
      <div className="chart-container">
        <h3>Error Distribution</h3>
        <div className="error-pie-chart">
          <svg viewBox="0 0 200 200" className="pie-chart-svg">
            {/* STT errors (30%) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              fill="none"
              stroke="#ef4444"
              strokeWidth="20"
              strokeDasharray={`${0.3 * 2 * Math.PI * 70} ${(1 - 0.3) * 2 * Math.PI * 70}`}
              transform="rotate(-90 100 100)"
            />

            {/* TTS errors (20%) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              fill="none"
              stroke="#f97316"
              strokeWidth="20"
              strokeDasharray={`${0.2 * 2 * Math.PI * 70} ${(1 - 0.2) * 2 * Math.PI * 70}`}
              strokeDashoffset={`-${0.3 * 2 * Math.PI * 70}`}
              transform="rotate(-90 100 100)"
            />

            {/* Success (50%) */}
            <circle
              cx="100"
              cy="100"
              r="70"
              fill="none"
              stroke="#22c55e"
              strokeWidth="20"
              strokeDasharray={`${0.5 * 2 * Math.PI * 70} ${(1 - 0.5) * 2 * Math.PI * 70}`}
              strokeDashoffset={`-${(0.3 + 0.2) * 2 * Math.PI * 70}`}
              transform="rotate(-90 100 100)"
            />

            {/* Center text */}
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dy=".3em"
              fontSize="14"
              fontWeight="bold"
            >
              {metrics.length} Providers
            </text>
          </svg>

          <div className="pie-legend">
            <div className="legend-item stt">
              <span className="legend-dot" style={{ backgroundColor: '#ef4444' }} />
              STT Errors ({(errorStats.errorCounts.stt || 0).toFixed(0)})
            </div>
            <div className="legend-item tts">
              <span className="legend-dot" style={{ backgroundColor: '#f97316' }} />
              TTS Errors ({(errorStats.errorCounts.tts || 0).toFixed(0)})
            </div>
            <div className="legend-item success">
              <span className="legend-dot" style={{ backgroundColor: '#22c55e' }} />
              Success
            </div>
          </div>
        </div>
      </div>

      {/* Provider Comparison Table */}
      <div className="comparison-table-container">
        <h3>Provider Comparison</h3>
        <div className="table-scroll">
          <table className="providers-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Type</th>
                <th>Latency</th>
                <th>Error Rate</th>
                <th>Success Count</th>
                <th>Failure Count</th>
                <th>Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const provider = providers.find((p) => p.id === metric.providerId);
                const total = metric.successCount + metric.failureCount;
                const successRate = total > 0 ? (metric.successCount / total) * 100 : 0;

                return (
                  <tr key={metric.providerId}>
                    <td>{provider?.name || metric.providerId}</td>
                    <td>{provider?.type.toUpperCase()}</td>
                    <td>{metric.latency.toFixed(2)}ms</td>
                    <td>{(metric.errorRate * 100).toFixed(1)}%</td>
                    <td>{metric.successCount}</td>
                    <td>{metric.failureCount}</td>
                    <td>
                      <span
                        className={`success-rate ${
                          successRate > 95 ? 'excellent' : successRate > 85 ? 'good' : 'poor'
                        }`}
                      >
                        {successRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
