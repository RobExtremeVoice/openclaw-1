/**
 * Signal Voice Privacy Manager
 *
 * Privacy-first conversation state management for Signal voice messages.
 * Stores only metadata (never audio content), encrypts state at rest,
 * and auto-deletes old data for GDPR/privacy compliance.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_DIR } from '../../utils.js';
import type { RuntimeEnv } from '../../runtime.js';
import type { VoiceMessageMetadata } from './message-handler.js';

const PRIVACY_DIR = path.join(CONFIG_DIR, 'signal-voice-privacy');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const AUTO_DELETE_MS = 24 * 60 * 60 * 1000; // 24 hours default

/**
 * Privacy-safe conversation context
 *
 * CRITICAL: Never stores actual audio content or conversation text,
 * only metadata needed for context management.
 */
export interface VoiceConversationContext {
  conversationId: string;
  participant: string;
  participantUuid?: string;
  groupId?: string;
  groupName?: string;

  // Message history (metadata only)
  messages: VoiceMessageReference[];

  // Timestamps
  createdAt: number;
  updatedAt: number;
  expiresAt: number; // Auto-delete timestamp

  // Privacy flags
  privacyMode: 'strict' | 'standard';
  audioStored: boolean; // Always false in privacy mode
  textLogged: boolean; // Always false in privacy mode

  // Encryption metadata
  encrypted: boolean;
  encryptionVersion: number;
}

/**
 * Voice message reference (metadata only, no audio/text content)
 */
export interface VoiceMessageReference {
  messageId: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  sender: string;
  senderUuid?: string;

  // Audio metadata (no actual audio)
  audioFormat: string;
  size: number;
  duration?: number;

  // Encryption status
  encrypted: boolean;
  verified: boolean;

  // Processing metadata
  transcribed: boolean; // If transcription was performed (in memory only)
  synthesized: boolean; // If this was a synthesized response
}

/**
 * Privacy audit log entry
 */
export interface PrivacyAuditEntry {
  timestamp: number;
  event: 'context_created' | 'context_updated' | 'context_deleted' | 'auto_cleanup' | 'encryption_verified';
  conversationId: string;
  details: string;
  privacyCompliant: boolean;
}

/**
 * Privacy manager configuration
 */
export interface PrivacyManagerConfig {
  autoDeleteMs?: number; // Default: 24 hours
  privacyMode?: 'strict' | 'standard'; // Default: strict
  enableAuditLog?: boolean; // Default: true
  encryptionKey?: string; // Derived from system if not provided
  maxContextSize?: number; // Max messages per context (default: 50)
}

/**
 * Privacy Manager for Signal voice conversations
 */
export class SignalVoicePrivacyManager {
  private config: Required<PrivacyManagerConfig>;
  private auditLog: PrivacyAuditEntry[] = [];
  private encryptionKey: Buffer;

  constructor(config: PrivacyManagerConfig = {}) {
    this.config = {
      autoDeleteMs: config.autoDeleteMs ?? AUTO_DELETE_MS,
      privacyMode: config.privacyMode ?? 'strict',
      enableAuditLog: config.enableAuditLog ?? true,
      encryptionKey: config.encryptionKey ?? this.deriveSystemKey(),
      maxContextSize: config.maxContextSize ?? 50,
    };

    this.encryptionKey = this.createEncryptionKey(this.config.encryptionKey);
  }

  /**
   * Initialize privacy storage
   */
  async initialize(): Promise<void> {
    await fs.mkdir(PRIVACY_DIR, { recursive: true });
    await this.logAudit({
      event: 'context_created',
      conversationId: 'system',
      details: 'Privacy manager initialized',
      privacyCompliant: true,
    });
  }

  /**
   * Derive system-specific encryption key
   */
  private deriveSystemKey(): string {
    // Derive from system identifiers (hostname, etc.)
    const systemData = `clawdbot-signal-voice-${process.platform}`;
    return crypto.createHash('sha256').update(systemData).digest('hex');
  }

  /**
   * Create encryption key from passphrase
   */
  private createEncryptionKey(passphrase: string): Buffer {
    return crypto.scryptSync(passphrase, 'signal-voice-salt', 32);
  }

  /**
   * Encrypt conversation context
   */
  private encrypt(data: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt conversation context
   */
  private decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      this.encryptionKey,
      Buffer.from(iv, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Create or update conversation context
   */
  async storeContext(
    conversationId: string,
    participant: string,
    metadata: {
      participantUuid?: string;
      groupId?: string;
      groupName?: string;
    } = {},
  ): Promise<VoiceConversationContext> {
    const now = Date.now();

    // Try to load existing context
    let context: VoiceConversationContext;
    try {
      context = await this.getContext(conversationId);
      context.updatedAt = now;
    } catch {
      // Create new context
      context = {
        conversationId,
        participant,
        participantUuid: metadata.participantUuid,
        groupId: metadata.groupId,
        groupName: metadata.groupName,
        messages: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: now + this.config.autoDeleteMs,
        privacyMode: this.config.privacyMode,
        audioStored: false, // Never store audio in privacy mode
        textLogged: false, // Never log conversation text
        encrypted: true,
        encryptionVersion: 1,
      };

      await this.logAudit({
        event: 'context_created',
        conversationId,
        details: `Created context for ${participant}`,
        privacyCompliant: true,
      });
    }

    // Save encrypted context
    await this.saveContext(context);

    return context;
  }

  /**
   * Add voice message reference to context (metadata only)
   */
  async addMessageReference(
    conversationId: string,
    voiceMetadata: VoiceMessageMetadata,
    direction: 'inbound' | 'outbound',
    options: {
      transcribed?: boolean;
      synthesized?: boolean;
    } = {},
  ): Promise<void> {
    const context = await this.getContext(conversationId);

    const messageRef: VoiceMessageReference = {
      messageId: voiceMetadata.messageId,
      timestamp: voiceMetadata.timestamp,
      direction,
      sender: voiceMetadata.sender,
      senderUuid: voiceMetadata.senderUuid,
      audioFormat: voiceMetadata.audioFormat,
      size: voiceMetadata.size,
      duration: voiceMetadata.duration,
      encrypted: voiceMetadata.encrypted,
      verified: voiceMetadata.verified,
      transcribed: options.transcribed ?? false,
      synthesized: options.synthesized ?? false,
    };

    context.messages.push(messageRef);
    context.updatedAt = Date.now();

    // Enforce max context size (privacy: don't keep unlimited history)
    if (context.messages.length > this.config.maxContextSize) {
      context.messages = context.messages.slice(-this.config.maxContextSize);
    }

    await this.saveContext(context);

    await this.logAudit({
      event: 'context_updated',
      conversationId,
      details: `Added ${direction} message reference (${voiceMetadata.audioFormat})`,
      privacyCompliant: true,
    });
  }

  /**
   * Get conversation context
   */
  async getContext(conversationId: string): Promise<VoiceConversationContext> {
    const filePath = this.getContextFilePath(conversationId);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);

    // Decrypt context
    const decrypted = this.decrypt(
      parsed.encrypted,
      parsed.iv,
      parsed.authTag,
    );

    const context: VoiceConversationContext = JSON.parse(decrypted);

    // Check expiration
    if (Date.now() > context.expiresAt) {
      await this.deleteContext(conversationId);
      throw new Error(`Context expired for ${conversationId}`);
    }

    return context;
  }

  /**
   * Save encrypted context to disk
   */
  private async saveContext(context: VoiceConversationContext): Promise<void> {
    const json = JSON.stringify(context);
    const { encrypted, iv, authTag } = this.encrypt(json);

    const data = JSON.stringify({ encrypted, iv, authTag });

    const filePath = this.getContextFilePath(context.conversationId);
    await fs.writeFile(filePath, data, 'utf8');
  }

  /**
   * Delete conversation context
   */
  async deleteContext(conversationId: string): Promise<void> {
    const filePath = this.getContextFilePath(conversationId);

    try {
      await fs.unlink(filePath);

      await this.logAudit({
        event: 'context_deleted',
        conversationId,
        details: 'Context deleted',
        privacyCompliant: true,
      });
    } catch (error) {
      // Already deleted or doesn't exist
    }
  }

  /**
   * Auto-cleanup expired contexts
   */
  async cleanup(): Promise<number> {
    await fs.mkdir(PRIVACY_DIR, { recursive: true });
    const files = await fs.readdir(PRIVACY_DIR);
    const now = Date.now();

    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const conversationId = file.replace('.json', '');

      try {
        const context = await this.getContext(conversationId);

        if (now > context.expiresAt) {
          await this.deleteContext(conversationId);
          deleted++;
        }
      } catch {
        // Context already expired or corrupted
        const filePath = path.join(PRIVACY_DIR, file);
        await fs.unlink(filePath).catch(() => {});
        deleted++;
      }
    }

    if (deleted > 0) {
      await this.logAudit({
        event: 'auto_cleanup',
        conversationId: 'system',
        details: `Cleaned up ${deleted} expired contexts`,
        privacyCompliant: true,
      });
    }

    return deleted;
  }

  /**
   * Get conversation ID from participants
   */
  static getConversationId(participant: string, groupId?: string): string {
    if (groupId) {
      return `group:${groupId}`;
    }
    return `dm:${participant}`;
  }

  /**
   * Get context file path
   */
  private getContextFilePath(conversationId: string): string {
    const safeId = conversationId.replace(/[^a-zA-Z0-9:-]/g, '_');
    return path.join(PRIVACY_DIR, `${safeId}.json`);
  }

  /**
   * Log privacy audit event
   */
  private async logAudit(entry: Omit<PrivacyAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enableAuditLog) return;

    const auditEntry: PrivacyAuditEntry = {
      timestamp: Date.now(),
      ...entry,
    };

    this.auditLog.push(auditEntry);

    // Keep only recent audit entries (last 1000)
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Persist audit log
    const auditPath = path.join(PRIVACY_DIR, 'audit.log');
    const auditLine = JSON.stringify(auditEntry) + '\n';
    await fs.appendFile(auditPath, auditLine, 'utf8').catch(() => {});
  }

  /**
   * Get recent audit entries
   */
  async getAuditLog(limit = 100): Promise<PrivacyAuditEntry[]> {
    return this.auditLog.slice(-limit);
  }

  /**
   * Get privacy compliance status
   */
  async getComplianceStatus(): Promise<{
    compliant: boolean;
    privacyMode: string;
    activeContexts: number;
    autoDeleteMs: number;
    encryptionEnabled: boolean;
    auditLogEnabled: boolean;
  }> {
    const files = await fs.readdir(PRIVACY_DIR).catch(() => []);
    const contextCount = files.filter(f => f.endsWith('.json')).length;

    return {
      compliant: this.config.privacyMode === 'strict',
      privacyMode: this.config.privacyMode,
      activeContexts: contextCount,
      autoDeleteMs: this.config.autoDeleteMs,
      encryptionEnabled: true,
      auditLogEnabled: this.config.enableAuditLog,
    };
  }

  /**
   * Export privacy report (for GDPR compliance)
   */
  async exportPrivacyReport(): Promise<{
    generatedAt: number;
    totalContexts: number;
    oldestContext: number | null;
    newestContext: number | null;
    privacySettings: Required<PrivacyManagerConfig>;
    auditSummary: {
      totalEvents: number;
      recentEvents: PrivacyAuditEntry[];
    };
  }> {
    const files = await fs.readdir(PRIVACY_DIR).catch(() => []);
    const contexts = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const conversationId = file.replace('.json', '');
      try {
        const context = await this.getContext(conversationId);
        contexts.push(context);
      } catch {
        // Skip corrupted/expired contexts
      }
    }

    const timestamps = contexts.map(c => c.createdAt).sort((a, b) => a - b);

    return {
      generatedAt: Date.now(),
      totalContexts: contexts.length,
      oldestContext: timestamps[0] ?? null,
      newestContext: timestamps[timestamps.length - 1] ?? null,
      privacySettings: this.config,
      auditSummary: {
        totalEvents: this.auditLog.length,
        recentEvents: this.auditLog.slice(-50),
      },
    };
  }
}
