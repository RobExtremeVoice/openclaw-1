/**
 * Core Provider Interface
 *
 * All messaging providers must implement this interface.
 */

import type {
  DeliveryStatus,
  MessageHandler,
  ProviderCapabilities,
  ProviderConfig,
  ProviderKind,
  SendOptions,
  SendResult,
} from "./types.js";

export interface Provider {
  /** Provider type identifier */
  readonly kind: ProviderKind;

  /** Declared capabilities */
  readonly capabilities: ProviderCapabilities;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the provider with configuration.
   * Must be called before any other methods.
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if the provider is connected and ready.
   */
  isConnected(): boolean;

  /**
   * Gracefully disconnect and cleanup resources.
   */
  disconnect(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Outbound Messaging
  // ---------------------------------------------------------------------------

  /**
   * Send a message to a recipient.
   *
   * @param to - Recipient identifier (phone, user ID, username)
   * @param body - Message text
   * @param options - Optional send options
   * @returns Send result with message ID
   */
  send(to: string, body: string, options?: SendOptions): Promise<SendResult>;

  /**
   * Send typing indicator to a chat.
   *
   * @param to - Recipient identifier
   */
  sendTyping(to: string): Promise<void>;

  /**
   * Query delivery status of a sent message.
   *
   * @param messageId - Message identifier returned from send()
   * @returns Current delivery status
   */
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;

  // ---------------------------------------------------------------------------
  // Inbound Messaging
  // ---------------------------------------------------------------------------

  /**
   * Register a handler for inbound messages.
   * The provider will call this handler when new messages arrive.
   *
   * @param handler - Function to handle incoming messages
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Start listening for inbound messages.
   * This starts the message polling/monitoring loop.
   */
  startListening(): Promise<void>;

  /**
   * Stop listening for inbound messages.
   */
  stopListening(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Authentication & Session Management
  // ---------------------------------------------------------------------------

  /**
   * Check if provider has valid authentication.
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Interactive login flow (QR code, phone + 2FA, etc.).
   * Implementation is provider-specific.
   */
  login(): Promise<void>;

  /**
   * Clear authentication and session data.
   */
  logout(): Promise<void>;

  /**
   * Get current session identifier (phone, user ID, etc.).
   */
  getSessionId(): Promise<string | null>;
}
