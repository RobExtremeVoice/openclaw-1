/**
 * Provider Configuration Panel
 *
 * Generic component for configuring provider-specific settings.
 * Handles voices, models, languages, speed, and other options.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { loadProviderCapabilities } from "../controllers/voice";
import type { ClawdbotApp } from "../app";

interface ProviderCapability {
  voices?: Array<{ id: string; name: string; language?: string }>;
  models?: Array<{ id: string; name: string; description?: string }>;
  languages?: Array<{ code: string; name: string }>;
  speeds?: { min: number; max: number; default: number };
  [key: string]: unknown;
}

@customElement("provider-config-panel")
export class ProviderConfigPanel extends LitElement {
  static override styles = css`
    :host {
      display: block;
      --primary-color: #3b82f6;
      --bg-secondary: #f9fafb;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --border-color: #e5e7eb;
    }

    .config-group {
      margin-bottom: 16px;
    }

    .config-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
    }

    select,
    input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
    }

    select:focus,
    input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    input[type="range"] {
      padding: 0;
      width: 100%;
    }

    .range-display {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .range-value {
      font-weight: 600;
      color: var(--text-primary);
    }
  `;

  @property({ type: String }) providerId = "";
  @property({ type: String }) providerType: "stt" | "tts" = "tts";
  @property({ type: Object }) config?: Record<string, unknown>;
  @property({ type: Object }) host?: ClawdbotApp;

  @state() private capabilities: ProviderCapability | null = null;
  @state() private loading = true;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadCapabilities();
  }

  private async loadCapabilities() {
    if (!this.providerId || !this.host) {
      this.loading = false;
      return;
    }

    try {
      const caps = await loadProviderCapabilities(this.host, this.providerId);
      this.capabilities = caps as ProviderCapability;
    } catch (err) {
      console.error("Failed to load capabilities:", err);
    } finally {
      this.loading = false;
    }
  }

  private handleConfigChange(key: string, value: unknown) {
    this.dispatchEvent(
      new CustomEvent("config-change", {
        detail: { key, value },
        composed: true,
      }),
    );
  }

  private renderVoiceSelector() {
    if (!this.capabilities?.voices || this.capabilities.voices.length === 0) {
      return html``;
    }

    const currentVoice = this.config?.voice || "";

    return html`
      <div class="config-group">
        <label class="config-label">Voice</label>
        <select
          @change=${(e: Event) =>
            this.handleConfigChange("voice", (e.target as HTMLSelectElement).value)}
          .value=${currentVoice}
        >
          <option value="">Default</option>
          ${(this.capabilities.voices as ProviderCapability["voices"]).map(
            (voice) =>
              html`
                <option value=${voice.id}>
                  ${voice.name}
                  ${voice.language ? ` (${voice.language})` : ""}
                </option>
              `,
          )}
        </select>
      </div>
    `;
  }

  private renderModelSelector() {
    if (!this.capabilities?.models || this.capabilities.models.length === 0) {
      return html``;
    }

    const currentModel = this.config?.model || "";

    return html`
      <div class="config-group">
        <label class="config-label">Model</label>
        <select
          @change=${(e: Event) =>
            this.handleConfigChange("model", (e.target as HTMLSelectElement).value)}
          .value=${currentModel}
        >
          <option value="">Default</option>
          ${(this.capabilities.models as ProviderCapability["models"]).map(
            (model) =>
              html`
                <option value=${model.id} title=${model.description || ""}>
                  ${model.name}
                </option>
              `,
          )}
        </select>
      </div>
    `;
  }

  private renderLanguageSelector() {
    if (!this.capabilities?.languages || this.capabilities.languages.length === 0) {
      return html``;
    }

    const currentLanguage = this.config?.language || "";

    return html`
      <div class="config-group">
        <label class="config-label">Language</label>
        <select
          @change=${(e: Event) =>
            this.handleConfigChange("language", (e.target as HTMLSelectElement).value)}
          .value=${currentLanguage}
        >
          <option value="">Auto-detect</option>
          ${(this.capabilities.languages as ProviderCapability["languages"]).map(
            (lang) =>
              html`
                <option value=${lang.code}>${lang.name}</option>
              `,
          )}
        </select>
      </div>
    `;
  }

  private renderSpeedSlider() {
    if (!this.capabilities?.speeds) {
      return html``;
    }

    const speeds = this.capabilities.speeds;
    const currentSpeed = (this.config?.speed as number) || speeds.default;

    return html`
      <div class="config-group">
        <label class="config-label">Speed</label>
        <input
          type="range"
          min=${speeds.min}
          max=${speeds.max}
          step="0.1"
          .value=${currentSpeed}
          @change=${(e: Event) =>
            this.handleConfigChange(
              "speed",
              parseFloat((e.target as HTMLInputElement).value),
            )}
        />
        <div class="range-display">
          <span>Slower</span>
          <span class="range-value">${currentSpeed.toFixed(1)}x</span>
          <span>Faster</span>
        </div>
      </div>
    `;
  }

  private renderInstructionsInput() {
    if (this.providerType !== "tts") {
      return html``;
    }

    const currentInstructions = (this.config?.instructions as string) || "";

    return html`
      <div class="config-group">
        <label class="config-label">Style Instructions</label>
        <input
          type="text"
          placeholder="e.g., friendly, professional, casual"
          .value=${currentInstructions}
          @change=${(e: Event) =>
            this.handleConfigChange("instructions", (e.target as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  override render() {
    if (this.loading) {
      return html`<div>Loading capabilities...</div>`;
    }

    if (!this.capabilities) {
      return html`<div>No configuration options available</div>`;
    }

    return html`
      ${this.renderVoiceSelector()} ${this.renderModelSelector()}
      ${this.renderLanguageSelector()} ${this.renderSpeedSlider()}
      ${this.renderInstructionsInput()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "provider-config-panel": ProviderConfigPanel;
  }
}
