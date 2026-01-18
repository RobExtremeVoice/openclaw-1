/**
 * Tests for Signal Voice Privacy Manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignalVoicePrivacyManager } from './privacy-manager.js';
import type { VoiceMessageMetadata } from './message-handler.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('SignalVoicePrivacyManager', () => {
  let manager: SignalVoicePrivacyManager;
  const testConfig = {
    autoDeleteMs: 1000, // 1 second for testing
    privacyMode: 'strict' as const,
    enableAuditLog: true,
  };

  beforeEach(async () => {
    manager = new SignalVoicePrivacyManager(testConfig);
    await manager.initialize();
  });

  afterEach(async () => {
    // Cleanup test data
    await manager.cleanup();
  });

  describe('Conversation context management', () => {
    it('should create encrypted conversation context', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      const context = await manager.storeContext(conversationId, participant);

      expect(context.conversationId).toBe(conversationId);
      expect(context.participant).toBe(participant);
      expect(context.encrypted).toBe(true);
      expect(context.audioStored).toBe(false); // Never store audio
      expect(context.textLogged).toBe(false); // Never log text
    });

    it('should retrieve encrypted context', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);
      const retrieved = await manager.getContext(conversationId);

      expect(retrieved.conversationId).toBe(conversationId);
      expect(retrieved.participant).toBe(participant);
      expect(retrieved.encrypted).toBe(true);
    });

    it('should support group conversations', async () => {
      const groupId = 'group-abc-123';
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890', groupId);
      const participant = '+1234567890';

      const context = await manager.storeContext(conversationId, participant, {
        groupId,
        groupName: 'Test Group',
      });

      expect(context.groupId).toBe(groupId);
      expect(context.groupName).toBe('Test Group');
      expect(conversationId).toContain('group:');
    });
  });

  describe('Message references (metadata only)', () => {
    it('should store voice message metadata without audio content', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      const metadata: VoiceMessageMetadata = {
        messageId: 'msg-123',
        sender: '+1234567890',
        timestamp: Date.now(),
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 1024,
        duration: 5000,
      };

      await manager.addMessageReference(conversationId, metadata, 'inbound');

      const context = await manager.getContext(conversationId);

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].messageId).toBe('msg-123');
      expect(context.messages[0].direction).toBe('inbound');
      expect(context.messages[0].encrypted).toBe(true);

      // Ensure no audio content stored
      expect(context.messages[0]).not.toHaveProperty('audioBuffer');
      expect(context.messages[0]).not.toHaveProperty('audioData');
    });

    it('should enforce max context size', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      // Add messages beyond max size (default: 50)
      for (let i = 0; i < 60; i++) {
        const metadata: VoiceMessageMetadata = {
          messageId: `msg-${i}`,
          sender: '+1234567890',
          timestamp: Date.now(),
          encrypted: true,
          verified: true,
          audioFormat: 'opus',
          size: 1024,
        };

        await manager.addMessageReference(conversationId, metadata, 'inbound');
      }

      const context = await manager.getContext(conversationId);

      // Should keep only the last 50 messages
      expect(context.messages.length).toBeLessThanOrEqual(50);
      expect(context.messages[0].messageId).not.toBe('msg-0'); // Oldest should be removed
    });

    it('should track inbound and outbound messages', async () => {
      // Use unique conversation ID for this test
      const conversationId = SignalVoicePrivacyManager.getConversationId('+9999999999');
      const participant = '+9999999999';

      await manager.storeContext(conversationId, participant);

      const inboundMetadata: VoiceMessageMetadata = {
        messageId: 'msg-inbound',
        sender: '+9999999999',
        timestamp: Date.now(),
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 1024,
      };

      const outboundMetadata: VoiceMessageMetadata = {
        messageId: 'msg-outbound',
        sender: 'bot',
        timestamp: Date.now(),
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 2048,
      };

      await manager.addMessageReference(conversationId, inboundMetadata, 'inbound');
      await manager.addMessageReference(conversationId, outboundMetadata, 'outbound', {
        synthesized: true,
      });

      const context = await manager.getContext(conversationId);

      expect(context.messages).toHaveLength(2);
      expect(context.messages[0].direction).toBe('inbound');
      expect(context.messages[1].direction).toBe('outbound');
      expect(context.messages[1].synthesized).toBe(true);
    });
  });

  describe('Auto-cleanup and expiration', () => {
    it('should auto-delete expired contexts', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      // Wait for expiration (1 second in test config)
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(manager.getContext(conversationId)).rejects.toThrow('expired');
    });

    it('should cleanup multiple expired contexts', async () => {
      const ids = ['+1111111111', '+2222222222', '+3333333333'];

      for (const id of ids) {
        const conversationId = SignalVoicePrivacyManager.getConversationId(id);
        await manager.storeContext(conversationId, id);
      }

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const deleted = await manager.cleanup();

      expect(deleted).toBeGreaterThanOrEqual(3);
    });

    it('should not delete active contexts', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      // Cleanup immediately (context not expired)
      const deleted = await manager.cleanup();

      expect(deleted).toBe(0);

      // Context should still exist
      const context = await manager.getContext(conversationId);
      expect(context).toBeDefined();
    });
  });

  describe('Privacy audit logging', () => {
    it('should log context creation', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      const auditLog = await manager.getAuditLog();

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog.some(entry => entry.event === 'context_created')).toBe(true);
      expect(auditLog.some(entry => entry.privacyCompliant === true)).toBe(true);
    });

    it('should log context updates', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      const metadata: VoiceMessageMetadata = {
        messageId: 'msg-123',
        sender: '+1234567890',
        timestamp: Date.now(),
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 1024,
      };

      await manager.addMessageReference(conversationId, metadata, 'inbound');

      const auditLog = await manager.getAuditLog();

      expect(auditLog.some(entry => entry.event === 'context_updated')).toBe(true);
    });

    it('should log cleanup events', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      await manager.cleanup();

      const auditLog = await manager.getAuditLog();

      expect(auditLog.some(entry => entry.event === 'auto_cleanup')).toBe(true);
    });
  });

  describe('Privacy compliance', () => {
    it('should report compliance status', async () => {
      const status = await manager.getComplianceStatus();

      expect(status.compliant).toBe(true); // Strict mode
      expect(status.privacyMode).toBe('strict');
      expect(status.encryptionEnabled).toBe(true);
      expect(status.auditLogEnabled).toBe(true);
      expect(status.autoDeleteMs).toBe(testConfig.autoDeleteMs);
    });

    it('should export privacy report', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      await manager.storeContext(conversationId, participant);

      const report = await manager.exportPrivacyReport();

      expect(report.generatedAt).toBeDefined();
      expect(report.totalContexts).toBeGreaterThanOrEqual(1);
      expect(report.privacySettings.privacyMode).toBe('strict');
      expect(report.auditSummary.totalEvents).toBeGreaterThan(0);
    });

    it('should never store audio content', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      const context = await manager.storeContext(conversationId, participant);

      expect(context.audioStored).toBe(false);

      // Add message reference
      const metadata: VoiceMessageMetadata = {
        messageId: 'msg-123',
        sender: '+1234567890',
        timestamp: Date.now(),
        encrypted: true,
        verified: true,
        audioFormat: 'opus',
        size: 1024,
      };

      await manager.addMessageReference(conversationId, metadata, 'inbound');

      const updated = await manager.getContext(conversationId);

      expect(updated.audioStored).toBe(false);
      expect(updated.messages[0]).not.toHaveProperty('audioBuffer');
    });

    it('should never log conversation text', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      const context = await manager.storeContext(conversationId, participant);

      expect(context.textLogged).toBe(false);
    });
  });

  describe('Encryption', () => {
    it('should encrypt context at rest', async () => {
      const conversationId = SignalVoicePrivacyManager.getConversationId('+1234567890');
      const participant = '+1234567890';

      const context = await manager.storeContext(conversationId, participant);

      expect(context.encrypted).toBe(true);
      expect(context.encryptionVersion).toBe(1);
    });

    it('should decrypt context correctly', async () => {
      // Use unique conversation ID for this test
      const conversationId = SignalVoicePrivacyManager.getConversationId('+8888888888');
      const participant = '+8888888888';

      await manager.storeContext(conversationId, participant, {
        participantUuid: 'uuid-abc-123',
      });

      const retrieved = await manager.getContext(conversationId);

      expect(retrieved.participant).toBe(participant);
      expect(retrieved.participantUuid).toBe('uuid-abc-123');
    });
  });

  describe('Conversation ID generation', () => {
    it('should generate DM conversation IDs', () => {
      const id = SignalVoicePrivacyManager.getConversationId('+1234567890');
      expect(id).toBe('dm:+1234567890');
    });

    it('should generate group conversation IDs', () => {
      const id = SignalVoicePrivacyManager.getConversationId('+1234567890', 'group-123');
      expect(id).toBe('group:group-123');
    });
  });
});
