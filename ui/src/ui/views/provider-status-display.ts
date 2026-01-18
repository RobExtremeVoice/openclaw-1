/**
 * Provider Status Display
 *
 * Component showing provider availability, capabilities, and system resources.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  loadProviderStatus,
  loadProviderCapabilities,
  type ProviderStatus,
} from "../controllers/voice";
import type { ClawdbotApp } from "../app";

@customElement("provider-status-display")
export class ProviderStatusDisplay extends LitElement {
  static override styles = css`
    :host {
      display: block;
      --success-color: #10b981;
      --error-color: #ef4444;
      --warning-color: #f59e0b;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --bg-secondary: #f9fafb;
      --border-color: #e5e7eb;
    }

    .status-card {
      padding: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .status-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-indicator.healthy {
      background: var(--success-color);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    }

    .status-indicator.unhealthy {
      background: var(--error-color);
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    .status-indicator.warning {
      background: var(--warning-color);
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
    }

    .status-name {
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .status-badge {
      font-size: 12px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-badge.healthy {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success-color);
    }

    .status-badge.unhealthy {
      background: rgba(239, 68, 68, 0.1);
      color: var(--error-color);
    }

    .status-badge.warning {
      background: rgba(245, 158, 11, 0.1);
      color: var(--warning-color);
    }

    .status-details {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .detail-row:last-child {
      margin-bottom: 0;
    }

    .detail-label {
      font-weight: 500;
    }

    .detail-value {
      color: var(--text-primary);
      font-family: "Monaco", "Courier New", monospace;
    }

    .warning-list {
      margin-top: 8px;
      padding-left: 20px;
    }

    .warning-item {
      color: var(--warning-color);
      font-size: 12px;
      margin-bottom: 4px;
    }

    .warning-item::before {
      content: "⚠ ";
      margin-right: 4px;
    }

    .capabilities-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
    }

    .capabilities-title {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 12px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .capability-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .capability-tag {
      font-size: 11px;
      padding: 4px 8px;
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 3px;
      color: var(--text-secondary);
    }

    .loading {
      font-size: 13px;
      color: var(--text-secondary);
      font-style: italic;
    }
  `;

  @property({ type: String }) providerId = "";
  @property({ type: String }) providerName = "";
  @property({ type: Object }) host?: ClawdbotApp;

  @state() private status: ProviderStatus | null = null;
  @state() private capabilities: Record<string, unknown> | null = null;
  @state() private loading = true;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadData();
  }

  private async loadData() {
    if (!this.providerId || !this.host) {
      this.loading = false;
      return;
    }

    try {
      const [status, caps] = await Promise.all([
        loadProviderStatus(this.host, this.providerId),
        loadProviderCapabilities(this.host, this.providerId),
      ]);

      this.status = status;
      this.capabilities = caps;
    } catch (err) {
      console.error("Failed to load provider data:", err);
    } finally {
      this.loading = false;
    }
  }

  private getStatusClass(): string {
    if (!this.status) return "warning";
    if (!this.status.available) return "unhealthy";
    if (!this.status.healthy) return "warning";
    return "healthy";
  }

  private getStatusText(): string {
    if (!this.status) return "Unknown";
    if (!this.status.available) return "Unavailable";
    if (!this.status.healthy) return "Degraded";
    return "Healthy";
  }

  private renderResourceUsage() {
    if (!this.status?.resourceUsage) {
      return html``;
    }

    const usage = this.status.resourceUsage;

    return html`
      <div class="detail-row">
        <span class="detail-label">GPU:</span>
        <span class="detail-value">${usage.gpu ? "Enabled" : "Disabled"}</span>
      </div>
      ${usage.memory
        ? html`
            <div class="detail-row">
              <span class="detail-label">Memory:</span>
              <span class="detail-value">${usage.memory}MB</span>
            </div>
          `
        : ""}
      ${usage.cpu
        ? html`
            <div class="detail-row">
              <span class="detail-label">CPU:</span>
              <span class="detail-value">${usage.cpu.toFixed(1)}%</span>
            </div>
          `
        : ""}
    `;
  }

  private renderWarnings() {
    if (!this.status?.warnings || this.status.warnings.length === 0) {
      return html``;
    }

    return html`
      <div class="warning-list">
        ${this.status.warnings.map(
          (warning) => html`<div class="warning-item">${warning}</div>`,
        )}
      </div>
    `;
  }

  private renderCapabilities() {
    if (!this.capabilities) {
      return html``;
    }

    const caps: string[] = [];

    if ((this.capabilities as any).voices?.length) {
      caps.push(`${(this.capabilities as any).voices.length} Voices`);
    }
    if ((this.capabilities as any).models?.length) {
      caps.push(`${(this.capabilities as any).models.length} Models`);
    }
    if ((this.capabilities as any).languages?.length) {
      caps.push(`${(this.capabilities as any).languages.length} Languages`);
    }
    if ((this.capabilities as any).speeds) {
      caps.push("Variable Speed");
    }

    if (caps.length === 0) {
      return html``;
    }

    return html`
      <div class="capabilities-section">
        <div class="capabilities-title">Capabilities</div>
        <div class="capability-list">
          ${caps.map((cap) => html`<span class="capability-tag">${cap}</span>`)}
        </div>
      </div>
    `;
  }

  override render() {
    const statusClass = this.getStatusClass();
    const statusText = this.getStatusText();
    const lastChecked = this.status
      ? new Date(this.status.lastChecked).toLocaleTimeString()
      : "Never";

    return html`
      <div class="status-card">
        <div class="status-header">
          <div class="status-indicator ${statusClass}"></div>
          <div class="status-name">${this.providerName}</div>
          <div class="status-badge ${statusClass}">${statusText}</div>
        </div>

        ${this.loading
          ? html`<div class="loading">Loading status...</div>`
          : html`
              <div class="status-details">
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value">
                    ${this.status?.available ? "Available" : "Not Available"}
                  </span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Last Checked:</span>
                  <span class="detail-value">${lastChecked}</span>
                </div>
                ${this.renderResourceUsage()}
              </div>

              ${this.renderWarnings()} ${this.renderCapabilities()}
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "provider-status-display": ProviderStatusDisplay;
  }
}
