/**
 * Fallback Chain Manager
 *
 * Component for managing provider fallback chain.
 * Allows reordering and adding/removing providers from fallback list.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { VoiceProvider } from "../controllers/voice";

@customElement("fallback-chain-manager")
export class FallbackChainManager extends LitElement {
  static override styles = css`
    :host {
      display: block;
      --primary-color: #3b82f6;
      --success-color: #10b981;
      --error-color: #ef4444;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --bg-secondary: #f9fafb;
      --border-color: #e5e7eb;
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .manager {
      padding: 16px;
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: var(--shadow);
    }

    .manager-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }

    .description {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }

    .chain-list {
      margin-bottom: 16px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
    }

    .chain-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
      cursor: grab;
      transition: background-color 0.2s;
    }

    .chain-item:last-child {
      border-bottom: none;
    }

    .chain-item:hover {
      background: white;
    }

    .chain-item.dragging {
      opacity: 0.5;
      background: var(--primary-color);
      color: white;
    }

    .drag-handle {
      cursor: grab;
      user-select: none;
      font-size: 16px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .chain-item.dragging .drag-handle {
      color: white;
    }

    .chain-item:active .drag-handle {
      cursor: grabbing;
    }

    .chain-position {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: var(--primary-color);
      color: white;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .chain-item.dragging .chain-position {
      background: white;
      color: var(--primary-color);
    }

    .chain-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .chain-item.dragging .chain-name {
      color: white;
    }

    .chain-status {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(16, 185, 129, 0.1);
      color: var(--success-color);
      flex-shrink: 0;
    }

    .chain-remove {
      padding: 4px 8px;
      border: none;
      background: rgba(239, 68, 68, 0.1);
      color: var(--error-color);
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .chain-remove:hover {
      background: var(--error-color);
      color: white;
    }

    .empty-state {
      padding: 24px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .add-section {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    select {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: white;
      color: var(--text-primary);
      font-size: 13px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--primary-color);
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    button:hover:not(:disabled) {
      background: #2563eb;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .behavior-info {
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.2);
      padding: 12px;
      border-radius: 4px;
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .behavior-info strong {
      color: var(--text-primary);
    }
  `;

  @property({ type: Array }) providers: VoiceProvider[] = [];
  @property({ type: Array }) chainProviders: string[] = [];

  @state() private draggedIndex: number | null = null;
  @state() private selectedProvider = "";

  private handleDragStart(index: number) {
    this.draggedIndex = index;
    this.requestUpdate();
  }

  private handleDragEnd() {
    this.draggedIndex = null;
    this.requestUpdate();
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  private handleDrop(targetIndex: number) {
    if (this.draggedIndex === null || this.draggedIndex === targetIndex) {
      return;
    }

    const newChain = [...this.chainProviders];
    const [draggedItem] = newChain.splice(this.draggedIndex, 1);
    newChain.splice(targetIndex, 0, draggedItem);

    this.chainProviders = newChain;
    this.draggedIndex = null;

    this.dispatchEvent(
      new CustomEvent("chain-updated", {
        detail: { chain: newChain },
        composed: true,
      }),
    );

    this.requestUpdate();
  }

  private handleRemoveProvider(index: number) {
    const newChain = this.chainProviders.filter((_, i) => i !== index);
    this.chainProviders = newChain;

    this.dispatchEvent(
      new CustomEvent("chain-updated", {
        detail: { chain: newChain },
        composed: true,
      }),
    );

    this.requestUpdate();
  }

  private handleAddProvider() {
    if (!this.selectedProvider) return;

    // Check if already in chain
    if (this.chainProviders.includes(this.selectedProvider)) {
      return;
    }

    const newChain = [...this.chainProviders, this.selectedProvider];
    this.chainProviders = newChain;
    this.selectedProvider = "";

    this.dispatchEvent(
      new CustomEvent("chain-updated", {
        detail: { chain: newChain },
        composed: true,
      }),
    );

    this.requestUpdate();
  }

  private getProviderName(providerId: string): string {
    return this.providers.find((p) => p.id === providerId)?.name || providerId;
  }

  private getAvailableProviders() {
    return this.providers.filter((p) => !this.chainProviders.includes(p.id));
  }

  override render() {
    return html`
      <div class="manager">
        <div class="manager-title">Fallback Chain</div>
        <p class="description">
          Configure which providers to use in order when one fails
        </p>

        ${this.chainProviders.length === 0
          ? html`
              <div class="empty-state">
                No providers in fallback chain. Add one to get started.
              </div>
            `
          : html`
              <div class="chain-list">
                ${this.chainProviders.map(
                  (providerId, index) =>
                    html`
                      <div
                        class="chain-item ${this.draggedIndex === index ? "dragging" : ""}"
                        draggable="true"
                        @dragstart=${() => this.handleDragStart(index)}
                        @dragend=${() => this.handleDragEnd()}
                        @dragover=${this.handleDragOver}
                        @drop=${() => this.handleDrop(index)}
                      >
                        <span class="drag-handle">⋮⋮</span>
                        <div class="chain-position">${index + 1}</div>
                        <div class="chain-name">${this.getProviderName(providerId)}</div>
                        <div class="chain-status">Primary</div>
                        <button
                          class="chain-remove"
                          @click=${() => this.handleRemoveProvider(index)}
                        >
                          Remove
                        </button>
                      </div>
                    `,
                )}
              </div>
            `}

        <div class="add-section">
          <select
            .value=${this.selectedProvider}
            @change=${(e: Event) =>
              (this.selectedProvider = (e.target as HTMLSelectElement).value)}
          >
            <option value="">Select provider to add...</option>
            ${this.getAvailableProviders().map(
              (provider) =>
                html`<option value=${provider.id}>${provider.name}</option>`,
            )}
          </select>
          <button
            @click=${this.handleAddProvider}
            ?disabled=${!this.selectedProvider}
          >
            Add
          </button>
        </div>

        <div class="behavior-info">
          <strong>How it works:</strong> When a call comes in, the system tries
          providers in order. If one fails or times out, it moves to the next.
          Drag to reorder priority.
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "fallback-chain-manager": FallbackChainManager;
  }
}
