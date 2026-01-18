/**
 * Tests for Telegram Voice Response Handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendVoiceResponse,
  VoiceResponseHandler,
  createVoiceResponseHandler,
  SimpleOggOpusEncoder,
  chunkTextForVoice,
  sendLongVoiceResponse,
  determineResponseModality,
  type VoiceResponseOptions,
  type TTSProvider,
  type AudioEncoder,
  type TelegramVoiceConfig,
} from "./response-handler.js";

// Mock TTS provider
const mockTTSProvider: TTSProvider = {
  synthesize: vi.fn().mockResolvedValue(Buffer.from("mock-pcm-audio-data")),
};

// Mock audio encoder
const mockAudioEncoder: AudioEncoder = {
  encodeToOggOpus: vi.fn().mockResolvedValue(Buffer.from("mock-ogg-opus-data")),
};

// Mock Telegram API
const mockBotApi = {
  sendVoice: vi.fn().mockResolvedValue({
    message_id: 123,
    date: Date.now(),
    chat: { id: 456, type: "private" },
  }),
  sendMessage: vi.fn().mockResolvedValue({
    message_id: 124,
    date: Date.now(),
    chat: { id: 456, type: "private" },
    text: "Test response",
  }),
} as any;

describe("sendVoiceResponse", () => {
  const baseOptions: VoiceResponseOptions = {
    botApi: mockBotApi,
    ttsProvider: mockTTSProvider,
    audioEncoder: mockAudioEncoder,
    defaultVoiceId: "test-voice",
    defaultSampleRate: 48000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send voice response successfully", async () => {
    const result = await sendVoiceResponse(
      "Hello, world!",
      { chatId: 456 },
      baseOptions,
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(123);
    expect(mockTTSProvider.synthesize).toHaveBeenCalledWith("Hello, world!", {
      voiceId: "test-voice",
      sampleRate: 48000,
    });
    expect(mockAudioEncoder.encodeToOggOpus).toHaveBeenCalled();
    expect(mockBotApi.sendVoice).toHaveBeenCalled();
  });

  it("should reject empty text", async () => {
    const result = await sendVoiceResponse(
      "",
      { chatId: 456 },
      baseOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Text cannot be empty");
  });

  it("should reject text exceeding max length", async () => {
    const longText = "a".repeat(5000);
    const result = await sendVoiceResponse(
      longText,
      { chatId: 456 },
      baseOptions,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Text exceeds maximum length (4096 characters)");
  });

  it("should use custom voice ID and sample rate", async () => {
    await sendVoiceResponse(
      "Test message",
      {
        chatId: 456,
        voiceId: "custom-voice",
        sampleRate: 24000,
      },
      baseOptions,
    );

    expect(mockTTSProvider.synthesize).toHaveBeenCalledWith("Test message", {
      voiceId: "custom-voice",
      sampleRate: 24000,
    });
  });

  it("should include reply parameters", async () => {
    await sendVoiceResponse(
      "Reply message",
      {
        chatId: 456,
        replyToMessageId: 789,
      },
      baseOptions,
    );

    expect(mockBotApi.sendVoice).toHaveBeenCalledWith(
      456,
      expect.anything(),
      expect.objectContaining({
        reply_to_message_id: 789,
      }),
    );
  });

  it("should include thread ID for forum groups", async () => {
    await sendVoiceResponse(
      "Thread message",
      {
        chatId: 456,
        threadId: 99,
      },
      baseOptions,
    );

    expect(mockBotApi.sendVoice).toHaveBeenCalledWith(
      456,
      expect.anything(),
      expect.objectContaining({
        message_thread_id: 99,
      }),
    );
  });

  it("should handle synthesis errors", async () => {
    const failingTTS: TTSProvider = {
      synthesize: vi.fn().mockRejectedValue(new Error("TTS failed")),
    };

    const result = await sendVoiceResponse(
      "Test",
      { chatId: 456 },
      { ...baseOptions, ttsProvider: failingTTS },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("TTS failed");
  });

  it("should handle encoding errors", async () => {
    const failingEncoder: AudioEncoder = {
      encodeToOggOpus: vi.fn().mockRejectedValue(new Error("Encoding failed")),
    };

    const result = await sendVoiceResponse(
      "Test",
      { chatId: 456 },
      { ...baseOptions, audioEncoder: failingEncoder },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Encoding failed");
  });
});

describe("VoiceResponseHandler", () => {
  const baseOptions: VoiceResponseOptions = {
    botApi: mockBotApi,
    ttsProvider: mockTTSProvider,
    audioEncoder: mockAudioEncoder,
    defaultVoiceId: "test-voice",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create handler with options", () => {
    const handler = createVoiceResponseHandler(baseOptions);
    expect(handler).toBeInstanceOf(VoiceResponseHandler);
  });

  it("should send voice message", async () => {
    const handler = createVoiceResponseHandler(baseOptions);
    const result = await handler.sendVoice("Hello", { chatId: 456 });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(123);
  });

  it("should reply with voice", async () => {
    const handler = createVoiceResponseHandler(baseOptions);
    const result = await handler.replyWithVoice("Reply", 456, 789);

    expect(result.success).toBe(true);
    expect(mockBotApi.sendVoice).toHaveBeenCalledWith(
      456,
      expect.anything(),
      expect.objectContaining({
        reply_to_message_id: 789,
      }),
    );
  });

  it("should track message count separately", async () => {
    const handler = createVoiceResponseHandler(baseOptions);

    await handler.sendVoice("Message 1", { chatId: 456 });
    await handler.sendVoice("Message 2", { chatId: 456 });
    await handler.sendText("Text 1", { chatId: 456 });

    const stats = handler.getStats();
    expect(stats.voiceMessagesSent).toBe(2);
    expect(stats.textMessagesSent).toBe(1);
  });

  it("should not increment count on failure", async () => {
    const handler = createVoiceResponseHandler(baseOptions);

    await handler.sendVoice("", { chatId: 456 }); // Will fail (empty text)
    await handler.sendText("", { chatId: 456 }); // Will fail (empty text)

    const stats = handler.getStats();
    expect(stats.voiceMessagesSent).toBe(0);
    expect(stats.textMessagesSent).toBe(0);
  });

  it("should reset statistics", async () => {
    const handler = createVoiceResponseHandler(baseOptions);

    await handler.sendVoice("Test", { chatId: 456 });
    await handler.sendText("Test", { chatId: 456 });
    const statsAfter = handler.getStats();
    expect(statsAfter.voiceMessagesSent).toBe(1);
    expect(statsAfter.textMessagesSent).toBe(1);

    handler.resetStats();
    const statsReset = handler.getStats();
    expect(statsReset.voiceMessagesSent).toBe(0);
    expect(statsReset.textMessagesSent).toBe(0);
  });

  it("should check group voice permission", () => {
    const handler1 = createVoiceResponseHandler({
      ...baseOptions,
      enableGroupVoiceReplies: true,
    });

    const handler2 = createVoiceResponseHandler({
      ...baseOptions,
      enableGroupVoiceReplies: false,
    });

    expect(handler1.canSendGroupVoice()).toBe(true);
    expect(handler2.canSendGroupVoice()).toBe(false);
  });

  it("should update TTS provider", async () => {
    const handler = createVoiceResponseHandler(baseOptions);
    const newProvider: TTSProvider = {
      synthesize: vi.fn().mockResolvedValue(Buffer.from("new-audio")),
    };

    handler.setTTSProvider(newProvider);
    await handler.sendVoice("Test", { chatId: 456 });

    expect(newProvider.synthesize).toHaveBeenCalled();
  });

  it("should update default voice settings", async () => {
    // Create fresh mocks for this test
    const freshTTSProvider: TTSProvider = {
      synthesize: vi.fn().mockResolvedValue(Buffer.from("mock-pcm-audio-data")),
    };
    const freshEncoder: AudioEncoder = {
      encodeToOggOpus: vi.fn().mockResolvedValue(Buffer.from("mock-ogg-opus-data")),
    };

    const handler = createVoiceResponseHandler({
      ...baseOptions,
      ttsProvider: freshTTSProvider,
      audioEncoder: freshEncoder,
    });

    handler.setDefaultVoice("new-voice", 24000);
    await handler.sendVoice("Test", { chatId: 456 });

    expect(freshTTSProvider.synthesize).toHaveBeenCalledWith("Test", {
      voiceId: "new-voice",
      sampleRate: 24000,
    });
  });
});

describe("SimpleOggOpusEncoder", () => {
  it("should validate sample rate", async () => {
    const encoder = new SimpleOggOpusEncoder();
    const buffer = Buffer.from("test-audio-data");

    await expect(encoder.encodeToOggOpus(buffer, 44100, 1)).rejects.toThrow(
      "Unsupported sample rate",
    );
  });

  it("should validate channel count", async () => {
    const encoder = new SimpleOggOpusEncoder();
    const buffer = Buffer.from("test-audio-data");

    await expect(encoder.encodeToOggOpus(buffer, 48000, 3)).rejects.toThrow(
      "Unsupported channel count",
    );
  });

  it("should accept valid parameters", async () => {
    const encoder = new SimpleOggOpusEncoder();
    const buffer = Buffer.from("test-audio-data");

    const result = await encoder.encodeToOggOpus(buffer, 48000, 1);
    expect(result).toBeInstanceOf(Buffer);
  });
});

describe("chunkTextForVoice", () => {
  it("should return single chunk for short text", () => {
    const text = "This is a short message.";
    const chunks = chunkTextForVoice(text, 500);

    expect(chunks).toEqual([text]);
  });

  it("should split long text by sentences", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const chunks = chunkTextForVoice(text, 30);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("First sentence");
  });

  it("should handle text without punctuation", () => {
    const text = "This is a very long text without any punctuation marks at all";
    const chunks = chunkTextForVoice(text, 20);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("should respect max chunk length", () => {
    const text = "A. ".repeat(100); // 200 chars
    const chunks = chunkTextForVoice(text, 50);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it("should handle very long words", () => {
    const longWord = "a".repeat(600);
    const chunks = chunkTextForVoice(longWord, 500);

    // Long word gets split but should still result in at least one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Verify the content is preserved
    expect(chunks.join("")).toContain("a");
  });
});

describe("sendLongVoiceResponse", () => {
  const baseOptions: VoiceResponseOptions = {
    botApi: mockBotApi,
    ttsProvider: mockTTSProvider,
    audioEncoder: mockAudioEncoder,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBotApi.sendVoice.mockResolvedValue({
      message_id: 123,
      date: Date.now(),
      chat: { id: 456, type: "private" },
    });
  });

  it("should send single chunk for short text", async () => {
    const result = await sendLongVoiceResponse(
      "Short message.",
      { chatId: 456 },
      baseOptions,
    );

    expect(result.success).toBe(true);
    expect(result.messageIds.length).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  it("should send multiple chunks for long text", async () => {
    const longText = "First sentence. ".repeat(100);
    const result = await sendLongVoiceResponse(
      longText,
      { chatId: 456 },
      baseOptions,
      50,
    );

    expect(result.messageIds.length).toBeGreaterThan(1);
    expect(result.success).toBe(true);
  }, 10000); // 10 second timeout for long text processing

  it("should only reply to first chunk", async () => {
    const longText = "A. ".repeat(100);
    await sendLongVoiceResponse(
      longText,
      { chatId: 456, replyToMessageId: 789 },
      baseOptions,
      20,
    );

    const calls = mockBotApi.sendVoice.mock.calls;
    const firstCall = calls[0][2];
    const secondCall = calls[1]?.[2];

    expect(firstCall?.reply_to_message_id).toBe(789);
    expect(secondCall?.reply_to_message_id).toBeUndefined();
  });

  it("should collect errors from failed chunks", async () => {
    let callCount = 0;
    mockBotApi.sendVoice.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Send failed");
      }
      return Promise.resolve({ message_id: 123, date: Date.now(), chat: { id: 456, type: "private" } });
    });

    const longText = "A. ".repeat(100);
    const result = await sendLongVoiceResponse(
      longText,
      { chatId: 456 },
      baseOptions,
      20,
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.messageIds.length).toBeGreaterThan(0);
  });
});

describe("determineResponseModality", () => {
  const baseOptions: VoiceResponseOptions = {
    botApi: mockBotApi,
    ttsProvider: mockTTSProvider,
    audioEncoder: mockAudioEncoder,
  };

  it("should return voice when input is voice with match modality", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: { messageResponse: "match" },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "voice" },
      options,
    );

    expect(modality).toBe("voice");
  });

  it("should return text when input is text with match modality", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: { messageResponse: "match" },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "text" },
      options,
    );

    expect(modality).toBe("text");
  });

  it("should default to match modality when none specified", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: {},
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "voice" },
      options,
    );

    expect(modality).toBe("voice");
  });

  it("should return voice when explicitly configured", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: { messageResponse: "voice" },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "text" },
      options,
    );

    expect(modality).toBe("voice");
  });

  it("should return text when explicitly configured", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: { messageResponse: "text" },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "voice" },
      options,
    );

    expect(modality).toBe("text");
  });

  it("should return both when configured", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: { messageResponse: "both" },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "text" },
      options,
    );

    expect(modality).toBe("both");
  });

  it("should apply per-chat override over default", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perChatOverride: { "456": "text" },
      },
    };

    const modality = determineResponseModality(
      { chatId: 456, inputModality: "voice" },
      options,
    );

    expect(modality).toBe("text");
  });

  it("should apply per-user override over per-chat override", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perChatOverride: { "456": "text" },
        perUserOverride: { "789": "both" },
      },
    };

    const modality = determineResponseModality(
      { chatId: 456, userId: 789, inputModality: "voice" },
      options,
    );

    expect(modality).toBe("both");
  });

  it("should respect match modality in per-chat override", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perChatOverride: { "456": "match" },
      },
    };

    const modalityVoice = determineResponseModality(
      { chatId: 456, inputModality: "voice" },
      options,
    );
    const modalityText = determineResponseModality(
      { chatId: 456, inputModality: "text" },
      options,
    );

    expect(modalityVoice).toBe("voice");
    expect(modalityText).toBe("text");
  });

  it("should respect match modality in per-user override", () => {
    const options: VoiceResponseOptions = {
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perUserOverride: { "789": "match" },
      },
    };

    const modalityVoice = determineResponseModality(
      { chatId: 456, userId: 789, inputModality: "voice" },
      options,
    );
    const modalityText = determineResponseModality(
      { chatId: 456, userId: 789, inputModality: "text" },
      options,
    );

    expect(modalityVoice).toBe("voice");
    expect(modalityText).toBe("text");
  });
});

describe("VoiceResponseHandler modality methods", () => {
  const baseOptions: VoiceResponseOptions = {
    botApi: mockBotApi,
    ttsProvider: mockTTSProvider,
    audioEncoder: mockAudioEncoder,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send text response", async () => {
    const handler = createVoiceResponseHandler(baseOptions);
    const result = await handler.sendText("Hello text", { chatId: 456 });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(124);
    expect(mockBotApi.sendMessage).toHaveBeenCalledWith(
      456,
      "Hello text",
      expect.any(Object),
    );
  });

  it("should reject empty text in sendText", async () => {
    const handler = createVoiceResponseHandler(baseOptions);
    const result = await handler.sendText("", { chatId: 456 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Text cannot be empty");
  });

  it("should send voice response when modality is voice", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: { messageResponse: "voice" },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "text",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendVoice).toHaveBeenCalled();
    expect(mockBotApi.sendMessage).not.toHaveBeenCalled();
  });

  it("should send text response when modality is text", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: { messageResponse: "text" },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "voice",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendMessage).toHaveBeenCalled();
    expect(mockBotApi.sendVoice).not.toHaveBeenCalled();
  });

  it("should match voice input with voice response", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: { messageResponse: "match" },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "voice",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendVoice).toHaveBeenCalled();
    expect(mockBotApi.sendMessage).not.toHaveBeenCalled();
  });

  it("should match text input with text response", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: { messageResponse: "match" },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "text",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendMessage).toHaveBeenCalled();
    expect(mockBotApi.sendVoice).not.toHaveBeenCalled();
  });

  it("should send both voice and text when modality is both", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: { messageResponse: "both" },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "text",
    });

    expect(result.success).toBe(true);
    expect(result.messageIds.length).toBe(2);
    expect(mockBotApi.sendVoice).toHaveBeenCalled();
    expect(mockBotApi.sendMessage).toHaveBeenCalled();
  });

  it("should apply per-chat override in sendResponse", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perChatOverride: { "456": "text" },
      },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      inputModality: "voice",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendMessage).toHaveBeenCalled();
    expect(mockBotApi.sendVoice).not.toHaveBeenCalled();
  });

  it("should apply per-user override in sendResponse", async () => {
    const handler = createVoiceResponseHandler({
      ...baseOptions,
      voiceConfig: {
        messageResponse: "voice",
        perUserOverride: { "789": "text" },
      },
    });

    const result = await handler.sendResponse("Test", {
      chatId: 456,
      userId: 789,
      inputModality: "voice",
    });

    expect(result.success).toBe(true);
    expect(mockBotApi.sendMessage).toHaveBeenCalled();
    expect(mockBotApi.sendVoice).not.toHaveBeenCalled();
  });
});
