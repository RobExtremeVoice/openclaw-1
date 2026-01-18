/**
 * VoiceTestPanel Component
 * Provides STT and TTS testing capabilities
 */

import React, { useState } from 'react';
import { useVoiceTest } from '../../hooks/useVoiceTest.js';
import { useVoiceStore } from '../../store/voice-store.js';
import type { TestResult } from '../../store/voice-store.js';

interface VoiceTestPanelProps {
  onTestComplete?: (result: TestResult) => void;
}

type TestTab = 'stt' | 'tts';

export const VoiceTestPanel: React.FC<VoiceTestPanelProps> = ({ onTestComplete }) => {
  const [activeTab, setActiveTab] = useState<TestTab>('stt');
  const { testSTT, testTTS, loading } = useVoiceTest({
    onSuccess: onTestComplete,
  });

  return (
    <div className="voice-test-panel">
      <div className="test-tabs">
        <button
          className={`tab-button ${activeTab === 'stt' ? 'active' : ''}`}
          onClick={() => setActiveTab('stt')}
        >
          STT Test
        </button>
        <button
          className={`tab-button ${activeTab === 'tts' ? 'active' : ''}`}
          onClick={() => setActiveTab('tts')}
        >
          TTS Test
        </button>
      </div>

      <div className="test-content">
        {activeTab === 'stt' ? (
          <STTTestTab testSTT={testSTT} loading={loading} />
        ) : (
          <TTSTestTab testTTS={testTTS} loading={loading} />
        )}
      </div>
    </div>
  );
};

interface STTTestTabProps {
  testSTT: (providerId: string, file: File, language?: string) => Promise<TestResult>;
  loading: boolean;
}

const STTTestTab: React.FC<STTTestTabProps> = ({ testSTT, loading }) => {
  const { activeSTT, providers, testResult } = useVoiceStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('en');
  const [dragActive, setDragActive] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleTest = async () => {
    if (!selectedFile || !activeSTT) return;
    try {
      await testSTT(activeSTT, selectedFile, language);
    } catch (error) {
      console.error('STT test failed:', error);
    }
  };

  return (
    <div className="stt-test-tab">
      <div className="test-section">
        <h3>Audio Upload</h3>

        <div
          className={`file-dropzone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p>Drag and drop audio file here or click to select</p>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="file-input"
          />
        </div>

        {selectedFile && (
          <div className="file-info">
            Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
          </div>
        )}
      </div>

      <div className="test-section">
        <h3>Settings</h3>

        <div className="setting-group">
          <label>Provider:</label>
          <select className="setting-select" disabled>
            <option>
              {providers.find((p) => p.id === activeSTT)?.name || 'Select Provider'}
            </option>
          </select>
        </div>

        <div className="setting-group">
          <label>Language:</label>
          <select
            className="setting-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
      </div>

      <button
        className="test-button primary"
        onClick={handleTest}
        disabled={!selectedFile || !activeSTT || loading}
      >
        {loading ? 'Testing...' : 'Test Transcription'}
      </button>

      {testResult && !testResult.audioUrl && (
        <div className="test-result">
          <h4>Result</h4>
          {testResult.success ? (
            <>
              <p className="transcript">{testResult.transcript}</p>
              <div className="result-info">
                <span>Confidence: {(testResult.confidence || 0).toFixed(1)}%</span>
                <span>Duration: {(testResult.duration / 1000).toFixed(2)}s</span>
              </div>
            </>
          ) : (
            <p className="error">{testResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface TTSTestTabProps {
  testTTS: (
    providerId: string,
    text: string,
    voice?: string,
    speed?: number
  ) => Promise<TestResult>;
  loading: boolean;
}

const TTSTestTab: React.FC<TTSTestTabProps> = ({ testTTS, loading }) => {
  const { activeTTS, providers, testResult } = useVoiceStore();
  const [text, setText] = useState('Hello, how are you today?');
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [language, setLanguage] = useState('en');

  const activeTTSProvider = providers.find((p) => p.id === activeTTS);

  const handleTest = async () => {
    if (!text || !activeTTS) return;
    try {
      await testTTS(activeTTS, text, voice || undefined, speed);
    } catch (error) {
      console.error('TTS test failed:', error);
    }
  };

  return (
    <div className="tts-test-tab">
      <div className="test-section">
        <h3>Text Input</h3>
        <textarea
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to synthesize"
          maxLength={1000}
        />
        <div className="character-count">
          {text.length} / 1000 characters
        </div>
      </div>

      <div className="test-section">
        <h3>Settings</h3>

        <div className="setting-group">
          <label>Provider:</label>
          <select className="setting-select" disabled>
            <option>
              {activeTTSProvider?.name || 'Select Provider'}
            </option>
          </select>
        </div>

        <div className="setting-group">
          <label>Voice:</label>
          <select
            className="setting-select"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          >
            <option value="">Default Voice</option>
            {activeTTSProvider?.config.voices?.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label>Language:</label>
          <select
            className="setting-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
          </select>
        </div>

        <div className="setting-group">
          <label>Speed: {speed.toFixed(1)}x</label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="slider"
          />
        </div>
      </div>

      <button
        className="test-button primary"
        onClick={handleTest}
        disabled={!text || !activeTTS || loading}
      >
        {loading ? 'Generating...' : 'Generate Audio'}
      </button>

      {testResult && testResult.audioUrl && (
        <div className="test-result">
          <h4>Result</h4>
          {testResult.success ? (
            <>
              <audio controls className="audio-player">
                <source src={testResult.audioUrl} type="audio/wav" />
                Your browser does not support the audio element.
              </audio>
              <div className="result-info">
                <span>Duration: {(testResult.duration / 1000).toFixed(2)}s</span>
              </div>
              <div className="result-actions">
                <a href={testResult.audioUrl} download="voice-output.wav" className="download-button">
                  Download WAV
                </a>
              </div>
            </>
          ) : (
            <p className="error">{testResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
};
