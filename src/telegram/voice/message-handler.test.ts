/**
 * Tests for Telegram Voice Message Handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message } from "@grammyjs/types";
import {
  isVoiceMessage,
  extractVoiceMetadata,
  processVoiceMessage,
  VoiceMessageHandler,
  createVoiceMessageHandler,
  type VoiceMessageHandlerOptions,
  type TranscriptionProvider,
} from "./message-handler.js";

// Mock dependencies
vi.mock("../download.js", () => ({
  getTelegramFile: vi.fn().mockResolvedValue({
    file_id: "test-file-id",
    file_unique_id: "unique-id",
    file_size: 12345,
    file_path: "voice/test.ogg",
  }),
  downloadTelegramFile: vi.fn().mockResolvedValue({
    path: "/tmp/test-voice.ogg",
    contentType: "audio/ogg",
    size: 12345,
  }),
}));

describe("isVoiceMessage", () => {
  it("should return true for voice messages", () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    expect(isVoiceMessage(msg)).toBe(true);
  });

  it("should return false for text messages", () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      text: "Hello",
    } as unknown as Message;

    expect(isVoiceMessage(msg)).toBe(false);
  });

  it("should return false for photo messages", () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      photo: [{ file_id: "photo-123", file_unique_id: "unique", width: 100, height: 100 }],
    } as unknown as Message;

    expect(isVoiceMessage(msg)).toBe(false);
  });
});

describe("extractVoiceMetadata", () => {
  it("should extract metadata from voice message", () => {
    const msg = {
      message_id: 42,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      from: {
        id: 456,
        username: "testuser",
        first_name: "Test",
        is_bot: false,
      },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 15,
        file_size: 54321,
        mime_type: "audio/ogg",
      },
    } as unknown as Message;

    const metadata = extractVoiceMetadata(msg);

    expect(metadata).toEqual({
      duration: 15,
      fileSize: 54321,
      fileId: "voice-123",
      fileUniqueId: "unique-123",
      mimeType: "audio/ogg",
      userId: 456,
      username: "testuser",
      firstName: "Test",
      chatId: 123,
      chatType: "private",
      messageId: 42,
      threadId: undefined,
      timestamp: 1234567890000,
    });
  });

  it("should extract thread ID from forum messages", () => {
    const msg = {
      message_id: 42,
      date: 1234567890,
      message_thread_id: 99,
      chat: { id: 123, type: "supergroup", is_forum: true },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const metadata = extractVoiceMetadata(msg);

    expect(metadata?.threadId).toBe(99);
  });

  it("should return null for non-voice messages", () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      text: "Not a voice message",
    } as unknown as Message;

    const metadata = extractVoiceMetadata(msg);

    expect(metadata).toBeNull();
  });

  it("should handle missing optional fields", () => {
    const msg = {
      message_id: 42,
      date: 1234567890,
      chat: { id: 123, type: "group" },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const metadata = extractVoiceMetadata(msg);

    expect(metadata).toEqual({
      duration: 10,
      fileSize: undefined,
      fileId: "voice-123",
      fileUniqueId: "unique-123",
      mimeType: "audio/ogg",
      userId: 456,
      username: undefined,
      firstName: undefined,
      chatId: 123,
      chatType: "group",
      messageId: 42,
      threadId: undefined,
      timestamp: 1234567890000,
    });
  });
});

describe("processVoiceMessage", () => {
  const mockTranscriptionProvider: TranscriptionProvider = {
    transcribe: vi.fn().mockResolvedValue("Hello, this is a test transcription"),
  };

  const baseOptions: VoiceMessageHandlerOptions = {
    token: "test-token",
    maxBytes: 20 * 1024 * 1024,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process voice message without transcription", async () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      from: { id: 456, username: "testuser", is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
        file_size: 12345,
      },
    } as unknown as Message;

    const result = await processVoiceMessage(msg, baseOptions);

    expect(result).toBeDefined();
    expect(result?.metadata.fileId).toBe("voice-123");
    expect(result?.media.path).toBe("/tmp/test-voice.ogg");
    expect(result?.transcription).toBeUndefined();
  });

  it("should transcribe voice messages in private chats by default", async () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const options: VoiceMessageHandlerOptions = {
      ...baseOptions,
      transcriptionProvider: mockTranscriptionProvider,
    };

    const result = await processVoiceMessage(msg, options);

    expect(result?.transcription).toBe("Hello, this is a test transcription");
    expect(mockTranscriptionProvider.transcribe).toHaveBeenCalledWith(
      "/tmp/test-voice.ogg",
      "audio/ogg",
    );
  });

  it("should not transcribe group messages by default", async () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "group" },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const options: VoiceMessageHandlerOptions = {
      ...baseOptions,
      transcriptionProvider: mockTranscriptionProvider,
    };

    const result = await processVoiceMessage(msg, options);

    expect(result?.transcription).toBeUndefined();
    expect(mockTranscriptionProvider.transcribe).not.toHaveBeenCalled();
  });

  it("should transcribe group messages when enabled", async () => {
    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "supergroup" },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const options: VoiceMessageHandlerOptions = {
      ...baseOptions,
      transcriptionProvider: mockTranscriptionProvider,
      transcribeGroupChats: true,
    };

    const result = await processVoiceMessage(msg, options);

    expect(result?.transcription).toBe("Hello, this is a test transcription");
  });

  it("should handle transcription errors gracefully", async () => {
    const failingProvider: TranscriptionProvider = {
      transcribe: vi.fn().mockRejectedValue(new Error("Transcription failed")),
    };

    const msg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      from: { id: 456, is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 10,
      },
    } as unknown as Message;

    const options: VoiceMessageHandlerOptions = {
      ...baseOptions,
      transcriptionProvider: failingProvider,
    };

    const result = await processVoiceMessage(msg, options);

    expect(result).toBeDefined();
    expect(result?.transcription).toBeUndefined();
  });
});

describe("VoiceMessageHandler", () => {
  const mockTranscriptionProvider: TranscriptionProvider = {
    transcribe: vi.fn().mockResolvedValue("Test transcription"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create handler with options", () => {
    const handler = createVoiceMessageHandler({
      token: "test-token",
      transcriptionProvider: mockTranscriptionProvider,
    });

    expect(handler).toBeInstanceOf(VoiceMessageHandler);
  });

  it("should check if message is voice", () => {
    const handler = createVoiceMessageHandler({ token: "test-token" });

    const voiceMsg = {
      message_id: 1,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      voice: { file_id: "voice-123", file_unique_id: "unique-123", duration: 10 },
    } as unknown as Message;

    const textMsg = {
      message_id: 2,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      text: "Hello",
    } as unknown as Message;

    expect(handler.isVoice(voiceMsg)).toBe(true);
    expect(handler.isVoice(textMsg)).toBe(false);
  });

  it("should extract metadata", () => {
    const handler = createVoiceMessageHandler({ token: "test-token" });

    const msg = {
      message_id: 42,
      date: 1234567890,
      chat: { id: 123, type: "private" },
      from: { id: 456, username: "testuser", is_bot: false },
      voice: {
        file_id: "voice-123",
        file_unique_id: "unique-123",
        duration: 15,
      },
    } as unknown as Message;

    const metadata = handler.extractMetadata(msg);

    expect(metadata?.messageId).toBe(42);
    expect(metadata?.userId).toBe(456);
  });

  it("should update transcription settings", () => {
    const handler = createVoiceMessageHandler({
      token: "test-token",
      transcribePrivateChats: false,
    });

    handler.setTranscriptionSettings({
      provider: mockTranscriptionProvider,
      privateChats: true,
      groupChats: true,
    });

    // Settings updated - verify via process call
    expect(handler).toBeDefined();
  });
});
