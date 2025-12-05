/**
 * Telegram Inbound Message Tests
 */

import type { TelegramClient } from "telegram";
import type { NewMessageEvent } from "telegram/events";
import { Api } from "telegram/tl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MessageHandler,
  ProviderMessage,
} from "../providers/base/types.js";
import {
  convertTelegramMessage,
  isAllowedSender,
  startMessageListener,
} from "./inbound.js";

// Mock telegram events
vi.mock("telegram/events", () => ({
  NewMessage: class NewMessage {},
}));

describe("convertTelegramMessage", () => {
  let mockClient: Partial<TelegramClient>;
  let mockEvent: Partial<NewMessageEvent>;

  beforeEach(() => {
    mockClient = {
      downloadMedia: vi.fn(),
    };
  });

  it("converts text message successfully", async () => {
    const mockSender = {
      username: "testuser",
      firstName: "Test",
      lastName: "User",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello, world!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result).toEqual({
      id: "999",
      from: "@testuser",
      to: "me",
      body: "Hello, world!",
      timestamp: 1234567890000,
      displayName: "Test User",
      media: undefined,
      raw: mockMessage,
      provider: "telegram",
    });
  });

  it("returns null for outgoing messages", async () => {
    const mockMessage = {
      id: 999,
      message: "Hello!",
      out: true,
    };

    mockEvent = {
      message: mockMessage as any,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result).toBeNull();
  });

  it("returns null when sender is not available", async () => {
    const mockMessage = {
      id: 999,
      message: "Hello!",
      out: false,
      getSender: vi.fn().mockResolvedValue(null),
    };

    mockEvent = {
      message: mockMessage as any,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result).toBeNull();
  });

  it("uses phone number when username not available", async () => {
    const mockSender = {
      phone: "+1234567890",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result?.from).toBe("+1234567890");
  });

  it("uses ID when neither username nor phone available", async () => {
    const mockSender = {
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result?.from).toBe("12345");
  });

  it("uses Unknown when no identifiable info available", async () => {
    const mockSender = {};

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result?.from).toBe("unknown");
    expect(result?.displayName).toBe("Unknown");
  });

  it("uses title for chat display name", async () => {
    const mockSender = {
      title: "Test Group",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result?.displayName).toBe("Test Group");
  });

  it("extracts photo media", async () => {
    const mockBuffer = Buffer.from("fake-image-data");
    mockClient.downloadMedia = vi.fn().mockResolvedValue(mockBuffer);

    const mockPhoto = new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: BigInt(123),
        accessHash: BigInt(456),
        fileReference: Buffer.from([]),
        date: 1234567890,
        sizes: [],
        dcId: 1,
      }),
    });

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Check this out",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockPhoto,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result?.media).toHaveLength(1);
    expect(result?.media?.[0]).toEqual({
      type: "image",
      buffer: mockBuffer,
      mimeType: "image/jpeg",
    });
  });

  it("extracts document media with voice attribute", async () => {
    const mockBuffer = Buffer.from("fake-audio-data");
    mockClient.downloadMedia = vi.fn().mockResolvedValue(mockBuffer);

    // Create mock document with voice attribute
    const mockDocument = {
      className: "MessageMediaDocument",
      document: {
        id: BigInt(123),
        mimeType: "audio/ogg",
        size: BigInt(1024),
        attributes: [
          {
            className: "DocumentAttributeVoice",
          },
        ],
      },
    } as any;

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockDocument,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result?.media).toHaveLength(1);
    expect(result?.media?.[0]?.type).toBe("voice");
    expect(result?.media?.[0]?.mimeType).toBe("audio/ogg");
  });

  it("extracts document media with video attribute", async () => {
    const mockBuffer = Buffer.from("fake-video-data");
    mockClient.downloadMedia = vi.fn().mockResolvedValue(mockBuffer);

    const mockDocument = {
      className: "MessageMediaDocument",
      document: {
        id: BigInt(123),
        mimeType: "video/mp4",
        size: BigInt(2048),
        attributes: [
          {
            className: "DocumentAttributeVideo",
            duration: 10,
            w: 1920,
            h: 1080,
          },
        ],
      },
    } as any;

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockDocument,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result?.media).toHaveLength(1);
    expect(result?.media?.[0]?.type).toBe("video");
    expect(result?.media?.[0]?.mimeType).toBe("video/mp4");
  });

  it("extracts document media with audio attribute", async () => {
    const mockBuffer = Buffer.from("fake-audio-data");
    mockClient.downloadMedia = vi.fn().mockResolvedValue(mockBuffer);

    const mockDocument = {
      className: "MessageMediaDocument",
      document: {
        id: BigInt(123),
        mimeType: "audio/mp3",
        size: BigInt(1024),
        attributes: [
          {
            className: "DocumentAttributeAudio",
            duration: 180,
          },
        ],
      },
    } as any;

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockDocument,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result?.media).toHaveLength(1);
    expect(result?.media?.[0]?.type).toBe("audio");
    expect(result?.media?.[0]?.mimeType).toBe("audio/mp3");
  });

  it("extracts document media with filename", async () => {
    const mockBuffer = Buffer.from("fake-doc-data");
    mockClient.downloadMedia = vi.fn().mockResolvedValue(mockBuffer);

    const mockDocument = {
      className: "MessageMediaDocument",
      document: {
        id: BigInt(123),
        mimeType: "application/pdf",
        size: BigInt(4096),
        attributes: [
          {
            className: "DocumentAttributeFilename",
            fileName: "test.pdf",
          },
        ],
      },
    } as any;

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Here's a document",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockDocument,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);

    expect(result?.media).toHaveLength(1);
    expect(result?.media?.[0]?.type).toBe("document");
    expect(result?.media?.[0]?.fileName).toBe("test.pdf");
    expect(result?.media?.[0]?.size).toBe(4096);
  });

  it("handles media download failure gracefully", async () => {
    mockClient.downloadMedia = vi
      .fn()
      .mockRejectedValue(new Error("Download failed"));

    const mockPhoto = new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: BigInt(123),
        accessHash: BigInt(456),
        fileReference: Buffer.from([]),
        date: 1234567890,
        sizes: [],
        dcId: 1,
      }),
    });

    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Check this out",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: mockPhoto,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    // Should not throw, just omit media
    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    expect(result?.media).toBeUndefined();
  });

  it("uses current timestamp when message date is missing", async () => {
    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 0,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    mockEvent = {
      message: mockMessage as any,
      client: mockClient as TelegramClient,
    };

    const beforeTime = Date.now();
    const result = await convertTelegramMessage(mockEvent as NewMessageEvent);
    const afterTime = Date.now();

    expect(result?.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(result?.timestamp).toBeLessThanOrEqual(afterTime);
  });
});

describe("isAllowedSender", () => {
  it("allows all senders when no whitelist provided", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@testuser",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, undefined)).toBe(true);
    expect(isAllowedSender(message, [])).toBe(true);
  });

  it("allows sender with matching username", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@testuser",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["@testuser"])).toBe(true);
    expect(isAllowedSender(message, ["testuser"])).toBe(true); // Without @
  });

  it("allows sender with matching phone", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "+1234567890",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["+1234567890"])).toBe(true);
  });

  it("rejects sender not in whitelist", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@unauthorized",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["@testuser", "+1234567890"])).toBe(false);
  });

  it("is case insensitive", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@TestUser",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["@testuser"])).toBe(true);
    expect(isAllowedSender(message, ["TESTUSER"])).toBe(true);
  });

  it("trims whitespace from whitelist entries", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@testuser",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["  @testuser  "])).toBe(true);
  });

  it("allows sender in multi-entry whitelist", () => {
    const message: ProviderMessage = {
      id: "1",
      from: "@user2",
      to: "me",
      body: "Hello",
      timestamp: Date.now(),
      provider: "telegram",
    };

    expect(isAllowedSender(message, ["@user1", "@user2", "+1234567890"])).toBe(
      true,
    );
  });
});

describe("startMessageListener", () => {
  let mockClient: Partial<TelegramClient>;
  let mockHandler: MessageHandler;

  beforeEach(() => {
    mockClient = {
      addEventHandler: vi.fn(),
      removeEventHandler: vi.fn(),
      downloadMedia: vi.fn(),
    };
    mockHandler = vi.fn().mockResolvedValue(undefined);
  });

  it("registers event handler on client", async () => {
    await startMessageListener(mockClient as TelegramClient, mockHandler);

    expect(mockClient.addEventHandler).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("returns cleanup function that removes event handler", async () => {
    const cleanup = await startMessageListener(
      mockClient as TelegramClient,
      mockHandler,
    );

    expect(typeof cleanup).toBe("function");

    cleanup();

    expect(mockClient.removeEventHandler).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("calls handler for valid incoming messages", async () => {
    let capturedHandler: ((event: NewMessageEvent) => Promise<void>) | null =
      null;

    mockClient.addEventHandler = vi.fn().mockImplementation((handler) => {
      capturedHandler = handler;
    });

    await startMessageListener(mockClient as TelegramClient, mockHandler);

    expect(capturedHandler).not.toBeNull();

    // Simulate incoming message
    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    const mockEvent = {
      message: mockMessage,
      client: mockClient,
    } as any;

    await capturedHandler?.(mockEvent);

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "999",
        from: "@testuser",
        body: "Hello!",
      }),
    );
  });

  it("does not call handler for outgoing messages", async () => {
    let capturedHandler: ((event: NewMessageEvent) => Promise<void>) | null =
      null;

    mockClient.addEventHandler = vi.fn().mockImplementation((handler) => {
      capturedHandler = handler;
    });

    await startMessageListener(mockClient as TelegramClient, mockHandler);

    // Simulate outgoing message
    const mockMessage = {
      id: 999,
      message: "Hello!",
      out: true,
    };

    const mockEvent = {
      message: mockMessage,
      client: mockClient,
    } as any;

    await capturedHandler?.(mockEvent);

    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("filters messages by allowFrom whitelist", async () => {
    let capturedHandler: ((event: NewMessageEvent) => Promise<void>) | null =
      null;

    mockClient.addEventHandler = vi.fn().mockImplementation((handler) => {
      capturedHandler = handler;
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await startMessageListener(mockClient as TelegramClient, mockHandler, [
      "@allowed",
    ]);

    // Simulate message from non-whitelisted user
    const mockSender = {
      username: "unauthorized",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    const mockEvent = {
      message: mockMessage,
      client: mockClient,
    } as any;

    await capturedHandler?.(mockEvent);

    expect(mockHandler).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Ignored message from @unauthorized (not in allowFrom list)",
    );

    consoleLogSpy.mockRestore();
  });

  it("allows messages from whitelisted users", async () => {
    let capturedHandler: ((event: NewMessageEvent) => Promise<void>) | null =
      null;

    mockClient.addEventHandler = vi.fn().mockImplementation((handler) => {
      capturedHandler = handler;
    });

    await startMessageListener(mockClient as TelegramClient, mockHandler, [
      "@testuser",
    ]);

    // Simulate message from whitelisted user
    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    const mockEvent = {
      message: mockMessage,
      client: mockClient,
    } as any;

    await capturedHandler?.(mockEvent);

    expect(mockHandler).toHaveBeenCalled();
  });

  it("handles errors in message handler gracefully", async () => {
    let capturedHandler: ((event: NewMessageEvent) => Promise<void>) | null =
      null;

    mockClient.addEventHandler = vi.fn().mockImplementation((handler) => {
      capturedHandler = handler;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const errorHandler = vi.fn().mockRejectedValue(new Error("Handler failed"));

    await startMessageListener(mockClient as TelegramClient, errorHandler);

    // Simulate incoming message
    const mockSender = {
      username: "testuser",
      firstName: "Test",
      id: BigInt(12345),
    };

    const mockMessage = {
      id: 999,
      message: "Hello!",
      date: 1234567890,
      out: false,
      getSender: vi.fn().mockResolvedValue(mockSender),
      media: null,
    };

    const mockEvent = {
      message: mockMessage,
      client: mockClient,
    } as any;

    // Should not throw
    await expect(capturedHandler?.(mockEvent)).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error handling Telegram message"),
    );

    consoleErrorSpy.mockRestore();
  });

  it("uses same NewMessage instance for add and remove", async () => {
    let addedFilter: any = null;
    let removedFilter: any = null;

    mockClient.addEventHandler = vi
      .fn()
      .mockImplementation((_handler, filter) => {
        addedFilter = filter;
      });

    mockClient.removeEventHandler = vi
      .fn()
      .mockImplementation((_handler, filter) => {
        removedFilter = filter;
      });

    const cleanup = await startMessageListener(
      mockClient as TelegramClient,
      mockHandler,
    );

    cleanup();

    // Verify same instance used for both add and remove (strict equality)
    expect(addedFilter).toBe(removedFilter);
    expect(addedFilter).not.toBeNull();
  });

  it("cleanup can be called multiple times safely", async () => {
    const cleanup = await startMessageListener(
      mockClient as TelegramClient,
      mockHandler,
    );

    cleanup();
    cleanup(); // Should not throw

    expect(mockClient.removeEventHandler).toHaveBeenCalled();
  });
});
