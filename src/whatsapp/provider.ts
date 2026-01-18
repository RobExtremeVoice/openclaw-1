/**
 * WhatsApp Provider Setup
 *
 * Initializes WhatsApp messaging provider with optional Twilio calling integration.
 *
 * Configuration structure:
 * ```yaml
 * whatsapp:
 *   messaging:
 *     phoneNumberId: "..."
 *     apiToken: "..."
 *   calling:
 *     enabled: true
 *     twilio:
 *       accountSid: "..."
 *       authToken: "..."
 *       phoneNumber: "+1234567890"
 * ```
 */

import type { RuntimeEnv } from '../runtime.js';
import { logVerbose } from '../globals.js';

export interface WhatsAppMessagingConfig {
  phoneNumberId: string;
  apiToken: string;
  businessAccountId?: string;
}

export interface TwilioCallingConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export interface WhatsAppCallingConfig {
  enabled: boolean;
  twilio: TwilioCallingConfig;
}

export interface WhatsAppProviderConfig {
  messaging: WhatsAppMessagingConfig;
  calling?: WhatsAppCallingConfig;
}

/**
 * Twilio Call Provider for WhatsApp calling integration
 */
export class TwilioCallProvider {
  private twilio: any;

  constructor(
    private config: TwilioCallingConfig,
    private runtime?: RuntimeEnv,
  ) {
    this.initializeTwilio();
  }

  /**
   * Initialize Twilio client
   */
  private initializeTwilio(): void {
    try {
      // Dynamically import Twilio SDK
      const Twilio = require('twilio');
      this.twilio = Twilio(this.config.accountSid, this.config.authToken);
      logVerbose(`whatsapp-calling: Twilio client initialized (account: ${this.config.accountSid})`);
    } catch (error) {
      this.runtime?.error?.(
        `Failed to initialize Twilio: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Initiate a call using Twilio
   */
  async initiateCall(params: {
    to: string;
    from?: string;
    voiceUrl?: string;
    method?: 'GET' | 'POST';
  }): Promise<{ callSid: string; status: string }> {
    try {
      logVerbose(`whatsapp-calling: initiating call to ${params.to}`);

      const call = await this.twilio.calls.create({
        to: params.to,
        from: params.from || this.config.phoneNumber,
        url: params.voiceUrl || '',
        method: params.method || 'POST',
      });

      logVerbose(`whatsapp-calling: call initiated (SID: ${call.sid}, status: ${call.status})`);

      return {
        callSid: call.sid,
        status: call.status,
      };
    } catch (error) {
      this.runtime?.error?.(
        `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Hang up a call using Twilio
   */
  async hangupCall(callSid: string): Promise<void> {
    try {
      logVerbose(`whatsapp-calling: hanging up call (SID: ${callSid})`);

      await this.twilio.calls(callSid).update({ status: 'completed' });

      logVerbose(`whatsapp-calling: call ended (SID: ${callSid})`);
    } catch (error) {
      this.runtime?.error?.(
        `Failed to hangup call: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callSid: string): Promise<string> {
    try {
      const call = await this.twilio.calls(callSid).fetch();
      return call.status;
    } catch (error) {
      this.runtime?.error?.(
        `Failed to get call status: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Handle webhook event from Twilio
   */
  handleTwilioWebhook(body: Record<string, any>): {
    callSid: string;
    event: string;
    direction: string;
  } {
    return {
      callSid: body.CallSid || '',
      event: body.CallStatus || 'unknown',
      direction: body.Direction || 'inbound',
    };
  }
}

/**
 * WhatsApp Provider - Main entry point
 */
export class WhatsAppProvider {
  private callingProvider?: TwilioCallProvider;

  constructor(
    private config: WhatsAppProviderConfig,
    private runtime?: RuntimeEnv,
  ) {
    if (config.calling?.enabled) {
      this.initializeCallingProvider();
    }
  }

  /**
   * Initialize calling provider (Twilio)
   */
  private initializeCallingProvider(): void {
    if (!this.config.calling?.twilio) {
      this.runtime?.error?.('Twilio config missing for WhatsApp calling');
      return;
    }

    try {
      this.callingProvider = new TwilioCallProvider(this.config.calling.twilio, this.runtime);
      logVerbose('whatsapp: Twilio calling provider initialized');
    } catch (error) {
      this.runtime?.error?.(
        `Failed to initialize calling provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get calling provider instance
   */
  getCallingProvider(): TwilioCallProvider | undefined {
    return this.callingProvider;
  }

  /**
   * Check if calling is enabled
   */
  isCallingEnabled(): boolean {
    return (this.config.calling?.enabled ?? false) && this.callingProvider !== undefined;
  }

  /**
   * Handle inbound Twilio call webhook
   */
  handleInboundCall(webhookBody: Record<string, any>): void {
    if (!this.callingProvider) {
      logVerbose('whatsapp: received inbound call but calling provider not initialized');
      return;
    }

    const callInfo = this.callingProvider.handleTwilioWebhook(webhookBody);
    logVerbose(
      `whatsapp: inbound call received (SID: ${callInfo.callSid}, status: ${callInfo.event})`,
    );
  }
}
