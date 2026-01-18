/**
 * VoiceDashboard Component
 * Main dashboard for managing voice providers and testing voice functionality
 */

import React, { useState } from 'react';
import { useVoiceProviders } from '../../hooks/useVoiceProviders.js';
import { useProviderMetrics } from '../../hooks/useProviderMetrics.js';
import { useVoiceStore, getSTTProviders, getTTSProviders } from '../../store/voice-store.js';
import { ProviderStatusCard } from './ProviderStatusCard.js';
import { ProviderSelector } from './ProviderSelector.js';
import { VoiceTestPanel } from './VoiceTestPanel.js';
import { MetricsDisplay } from './MetricsDisplay.js';
import { HealthMonitor } from './HealthMonitor.js';
import { VoiceSettings } from './VoiceSettings.js';
import * as voiceApi from '../../api/voice-api.js';
import '../../../provider-web/styles/voice-dashboard.css';

type DashboardTab = 'overview' | 'test' | 'metrics' | 'settings';

/**
 * Main Voice Provider Dashboard Component
 *
 * Features:
 * - Real-time provider status monitoring
 * - STT/TTS provider selection
 * - Voice testing capabilities
 * - Performance metrics and analytics
 * - System health monitoring
 * - Configuration management
 */
export const VoiceDashboard: React.FC = () => {
  // Initialize hooks
  useVoiceProviders();
  useProviderMetrics();

  // State management
  const store = useVoiceStore();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Get provider lists
  const sttProviders = getSTTProviders(store);
  const ttsProviders = getTTSProviders(store);

  // Handle provider switching
  const handleSwitchSTT = async (providerId: string) => {
    store.setActiveSTT(providerId);
    if (store.config) {
      const newConfig = {
        ...store.config,
        sttProvider: { ...store.config.sttProvider, id: providerId },
      };
      store.setConfig(newConfig);
      try {
        await voiceApi.setVoiceConfig(newConfig);
      } catch (error) {
        console.error('Failed to switch STT provider:', error);
      }
    }
  };

  const handleSwitchTTS = async (providerId: string) => {
    store.setActiveTTS(providerId);
    if (store.config) {
      const newConfig = {
        ...store.config,
        ttsProvider: { ...store.config.ttsProvider, id: providerId },
      };
      store.setConfig(newConfig);
      try {
        await voiceApi.setVoiceConfig(newConfig);
      } catch (error) {
        console.error('Failed to switch TTS provider:', error);
      }
    }
  };

  const handleQuickTest = (providerId: string) => {
    setTestingProvider(providerId);
    setActiveTab('test');
  };

  // Loading state
  if (store.loading && store.providers.length === 0) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading voice providers...</p>
      </div>
    );
  }

  // Error state
  if (store.error && store.providers.length === 0) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">⚠️</div>
        <h2>Failed to Load Dashboard</h2>
        <p>{store.error}</p>
        <button
          className="retry-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="voice-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Voice Provider Management</h1>
          <p className="header-subtitle">
            Manage and monitor your STT and TTS providers
          </p>
        </div>

        <div className="header-status">
          {store.wsConnected ? (
            <span className="status-badge connected">Live Updates</span>
          ) : (
            <span className="status-badge disconnected">Offline Mode</span>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => setActiveTab('test')}
        >
          Test Voice
        </button>
        <button
          className={`tab ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          Metrics
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tab-content overview-tab">
            {/* Health Monitor */}
            <section className="dashboard-section">
              <HealthMonitor />
            </section>

            {/* Provider Selector */}
            <section className="dashboard-section">
              <ProviderSelector
                onSTTChange={handleSwitchSTT}
                onTTSChange={handleSwitchTTS}
                onFallbackChainUpdate={(chain) => {
                  // Handle fallback chain update
                  console.log('Fallback chain updated:', chain);
                }}
              />
            </section>

            {/* STT Providers Status */}
            <section className="dashboard-section">
              <h2 className="section-title">STT Providers</h2>
              <div className="providers-grid">
                {sttProviders.map((provider) => (
                  <ProviderStatusCard
                    key={provider.id}
                    provider={provider}
                    healthStatus={store.healthStatus[provider.id]}
                    metrics={store.metrics.find((m) => m.providerId === provider.id)}
                    isActive={provider.id === store.activeSTT}
                    onQuickTest={() => handleQuickTest(provider.id)}
                    onSwitch={() => handleSwitchSTT(provider.id)}
                  />
                ))}
              </div>
            </section>

            {/* TTS Providers Status */}
            <section className="dashboard-section">
              <h2 className="section-title">TTS Providers</h2>
              <div className="providers-grid">
                {ttsProviders.map((provider) => (
                  <ProviderStatusCard
                    key={provider.id}
                    provider={provider}
                    healthStatus={store.healthStatus[provider.id]}
                    metrics={store.metrics.find((m) => m.providerId === provider.id)}
                    isActive={provider.id === store.activeTTS}
                    onQuickTest={() => handleQuickTest(provider.id)}
                    onSwitch={() => handleSwitchTTS(provider.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Test Tab */}
        {activeTab === 'test' && (
          <div className="tab-content test-tab">
            <section className="dashboard-section">
              <VoiceTestPanel
                onTestComplete={(result) => {
                  console.log('Test completed:', result);
                }}
              />
            </section>
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="tab-content metrics-tab">
            <section className="dashboard-section">
              <MetricsDisplay />
            </section>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="tab-content settings-tab">
            <section className="dashboard-section">
              <VoiceSettings
                onSave={() => {
                  console.log('Settings saved');
                }}
                onReset={() => {
                  console.log('Settings reset');
                }}
              />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>Voice Provider Management Dashboard</p>
        <p className="footer-meta">
          Last Updated: {new Date().toLocaleTimeString()}
        </p>
      </footer>
    </div>
  );
};

export default VoiceDashboard;
