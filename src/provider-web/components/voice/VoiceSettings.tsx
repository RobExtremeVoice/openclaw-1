/**
 * VoiceSettings Component
 * Manages voice provider configuration and health check settings
 */

import React, { useState, useEffect } from 'react';
import { useVoiceStore } from '../../store/voice-store.js';
import * as voiceApi from '../../api/voice-api.js';

interface VoiceSettingsProps {
  onSave?: () => void;
  onReset?: () => void;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ onSave, onReset }) => {
  const { setConfig, config } = useVoiceStore();
  const [settings, setSettings] = useState({
    healthCheckInterval: 10,
    maxConcurrentSessions: 5,
    enableFallback: true,
    loggingLevel: 'info' as const,
    autoRecover: true,
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await voiceApi.getVoiceConfig();
        setConfig(cfg);
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    loadConfig();
  }, [setConfig]);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      if (config) {
        await voiceApi.setVoiceConfig(config);
        setMessage({ type: 'success', text: 'Settings saved successfully' });
        onSave?.();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save settings';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSettings({
      healthCheckInterval: 10,
      maxConcurrentSessions: 5,
      enableFallback: true,
      loggingLevel: 'info',
      autoRecover: true,
    });
    onReset?.();
  };

  return (
    <div className="voice-settings">
      <div className="settings-header">
        <h2>Voice Provider Settings</h2>
      </div>

      {message && (
        <div className={`settings-message ${message.type}`}>
          {message.type === 'success' ? '✓' : '✗'} {message.text}
        </div>
      )}

      <div className="settings-section">
        <h3>Health Monitoring</h3>

        <div className="setting-group">
          <label htmlFor="health-check-interval">Health Check Interval (seconds)</label>
          <div className="input-group">
            <input
              id="health-check-interval"
              type="range"
              min="5"
              max="60"
              value={settings.healthCheckInterval}
              onChange={(e) =>
                setSettings({ ...settings, healthCheckInterval: parseInt(e.target.value) })
              }
              className="slider"
            />
            <span className="slider-value">{settings.healthCheckInterval}s</span>
          </div>
        </div>

        <div className="setting-group checkbox">
          <input
            id="auto-recover"
            type="checkbox"
            checked={settings.autoRecover}
            onChange={(e) => setSettings({ ...settings, autoRecover: e.target.checked })}
          />
          <label htmlFor="auto-recover">Automatic Recovery</label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Resource Management</h3>

        <div className="setting-group">
          <label htmlFor="max-concurrent">Max Concurrent Sessions</label>
          <select
            id="max-concurrent"
            value={settings.maxConcurrentSessions}
            onChange={(e) =>
              setSettings({ ...settings, maxConcurrentSessions: parseInt(e.target.value) })
            }
            className="settings-select"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h3>Fallback Behavior</h3>

        <div className="setting-group checkbox">
          <input
            id="enable-fallback"
            type="checkbox"
            checked={settings.enableFallback}
            onChange={(e) => setSettings({ ...settings, enableFallback: e.target.checked })}
          />
          <label htmlFor="enable-fallback">Enable Fallback Chain</label>
        </div>

        <p className="setting-description">
          When enabled, the system will automatically switch to fallback providers if the primary
          provider fails.
        </p>
      </div>

      <div className="settings-section">
        <h3>Logging</h3>

        <div className="setting-group">
          <label htmlFor="logging-level">Logging Level</label>
          <select
            id="logging-level"
            value={settings.loggingLevel}
            onChange={(e) =>
              setSettings({
                ...settings,
                loggingLevel: e.target.value as typeof settings.loggingLevel,
              })
            }
            className="settings-select"
          >
            <option value="debug">Debug (Verbose)</option>
            <option value="info">Info (Normal)</option>
            <option value="warn">Warn (Warnings Only)</option>
            <option value="error">Error (Errors Only)</option>
          </select>
        </div>

        <p className="setting-description">
          Logging level controls the amount of detail logged to the console and log files.
        </p>
      </div>

      <div className="settings-actions">
        <button
          className="button save-button"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>

        <button
          className="button reset-button"
          onClick={handleReset}
          disabled={loading}
        >
          Reset to Defaults
        </button>
      </div>

      <div className="settings-section info-section">
        <h3>About Voice Providers</h3>
        <p>
          Voice providers enable speech-to-text (STT) and text-to-speech (TTS) capabilities.
          The system monitors their health continuously and can automatically switch to fallback
          providers if issues are detected.
        </p>

        <h4>Configuration Tips</h4>
        <ul>
          <li>Set health check interval based on your needs (faster checks = more overhead)</li>
          <li>Adjust max concurrent sessions based on your system resources</li>
          <li>Enable fallback chain to ensure service continuity</li>
          <li>Use debug logging during development and troubleshooting</li>
        </ul>
      </div>
    </div>
  );
};
