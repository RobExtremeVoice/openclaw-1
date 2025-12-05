/**
 * Outbound Tests
 */

import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderMedia, SendOptions } from "../providers/base/types.js";
import * as downloadModule from "./download.js";
import {
  sendMediaMessage,
  sendTextMessage,
  sendTypingIndicator,
} from "./outbound.js";
import * as utilsModule from "./utils.js";

// Mock utils
vi.mock("./utils.js");

// Mock download module
vi.mock("./download.js");

// Mock global fetch
global.fetch = vi.fn();

describe("outbound", () => {
  let mockClient: Partial<TelegramClient>;
  let mockEntity: Api.User;

  beforeEach(() => {
    mockEntity = new Api.User({
      id: BigInt(12345),
      firstName: "Test",
    });

    mockClient = {
      sendMessage: vi.fn(),
      sendFile: vi.fn(),
      invoke: vi.fn(),
    };

    vi.mocked(utilsModule.resolveEntity).mockResolvedValue(mockEntity);
    vi.mocked(utilsModule.extractUserId).mockReturnValue("12345");

    vi.clearAllMocks();
  });

  describe("sendTextMessage", () => {
    it("sends text message with username", async () => {
      const mockResult = {
        id: 999,
        message: "test message",
      };

      vi.mocked(mockClient.sendMessage).mockResolvedValue(mockResult as any);

      const result = await sendTextMessage(
        mockClient as TelegramClient,
        "@testuser",
        "test message",
      );

      expect(utilsModule.resolveEntity).toHaveBeenCalledWith(
        mockClient,
        "@testuser",
      );
      expect(mockClient.sendMessage).toHaveBeenCalledWith(mockEntity, {
        message: "test message",
        replyTo: undefined,
      });
      expect(result).toEqual({
        messageId: "999",
        status: "sent",
        providerMeta: {
          jid: "12345",
        },
      });
    });

    it("sends text message with phone number", async () => {
      const mockResult = {
        id: 999,
        message: "test message",
      };

      vi.mocked(mockClient.sendMessage).mockResolvedValue(mockResult as any);

      const result = await sendTextMessage(
        mockClient as TelegramClient,
        "+1234567890",
        "test message",
      );

      expect(utilsModule.resolveEntity).toHaveBeenCalledWith(
        mockClient,
        "+1234567890",
      );
      expect(result.messageId).toBe("999");
    });

    it("sends text message with replyTo option", async () => {
      const mockResult = {
        id: 999,
        message: "test message",
      };

      vi.mocked(mockClient.sendMessage).mockResolvedValue(mockResult as any);

      const options: SendOptions = {
        replyTo: "123",
      };

      await sendTextMessage(
        mockClient as TelegramClient,
        "@testuser",
        "test message",
        options,
      );

      expect(mockClient.sendMessage).toHaveBeenCalledWith(mockEntity, {
        message: "test message",
        replyTo: 123,
      });
    });

    it("sends text message without options", async () => {
      const mockResult = {
        id: 999,
        message: "test message",
      };

      vi.mocked(mockClient.sendMessage).mockResolvedValue(mockResult as any);

      await sendTextMessage(
        mockClient as TelegramClient,
        "@testuser",
        "test message",
      );

      expect(mockClient.sendMessage).toHaveBeenCalledWith(mockEntity, {
        message: "test message",
        replyTo: undefined,
      });
    });
  });

  describe("sendMediaMessage", () => {
    it("sends image from buffer", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "image",
        buffer: Buffer.from("fake-image-data"),
        mimeType: "image/jpeg",
      };

      const result = await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Check this out!",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(mockEntity, {
        file: media.buffer,
        caption: "Check this out!",
        replyTo: undefined,
      });
      expect(result).toEqual({
        messageId: "999",
        status: "sent",
        providerMeta: {
          jid: "12345",
        },
      });
    });

    it("sends video with attributes", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "video",
        buffer: Buffer.from("fake-video-data"),
        mimeType: "video/mp4",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Watch this",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(
        mockEntity,
        expect.objectContaining({
          file: media.buffer,
          caption: "Watch this",
          attributes: expect.arrayContaining([
            expect.any(Api.DocumentAttributeVideo),
          ]),
        }),
      );
    });

    it("sends audio file", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "audio",
        buffer: Buffer.from("fake-audio-data"),
        mimeType: "audio/mp3",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Listen to this",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(mockEntity, {
        file: media.buffer,
        caption: "Listen to this",
        replyTo: undefined,
        voiceNote: false,
      });
    });

    it("sends voice note with voiceNote flag", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "voice",
        buffer: Buffer.from("fake-voice-data"),
        mimeType: "audio/ogg",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(mockEntity, {
        file: media.buffer,
        caption: undefined,
        replyTo: undefined,
        voiceNote: true,
      });
    });

    it("sends document with fileName attribute", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "document",
        buffer: Buffer.from("fake-doc-data"),
        fileName: "report.pdf",
        mimeType: "application/pdf",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Here's the report",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(
        mockEntity,
        expect.objectContaining({
          file: media.buffer,
          caption: "Here's the report",
          attributes: expect.arrayContaining([
            expect.any(Api.DocumentAttributeFilename),
          ]),
        }),
      );
    });

    it("sends document without fileName attribute", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "document",
        buffer: Buffer.from("fake-doc-data"),
        mimeType: "application/pdf",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Here's a file",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(mockEntity, {
        file: media.buffer,
        caption: "Here's a file",
        replyTo: undefined,
        attributes: undefined,
      });
    });

    it("downloads and sends media from URL", async () => {
      const mockResult = {
        id: 999,
      };

      const mockTempPath = "/tmp/test-image.tmp";
      const mockCleanup = vi.fn().mockResolvedValue(undefined);

      // Mock HEAD request for size check
      const mockHeadResponse = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "1024";
            return null;
          }),
        },
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockHeadResponse as any);

      // Mock streamDownloadToTemp
      vi.mocked(downloadModule.streamDownloadToTemp).mockResolvedValue({
        tempPath: mockTempPath,
        size: 1024,
        contentType: "image/jpeg",
        cleanup: mockCleanup,
      });

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "image",
        url: "https://example.com/image.jpg",
        mimeType: "image/jpeg",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Look at this",
        media,
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/image.jpg",
        { method: "HEAD" },
      );
      expect(downloadModule.streamDownloadToTemp).toHaveBeenCalledWith(
        "https://example.com/image.jpg",
        expect.any(Number),
      );
      expect(mockClient.sendFile).toHaveBeenCalledWith(
        mockEntity,
        expect.objectContaining({
          file: mockTempPath,
          caption: "Look at this",
        }),
      );
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it("warns but proceeds when content-length header is missing", async () => {
      const mockResult = {
        id: 999,
      };

      const mockTempPath = "/tmp/test-chunked.tmp";
      const mockCleanup = vi.fn().mockResolvedValue(undefined);

      // Mock HEAD request without content-length
      const mockHeadResponse = {
        headers: {
          get: vi.fn(() => null), // No content-length header
        },
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockHeadResponse as any);

      // Mock streamDownloadToTemp
      vi.mocked(downloadModule.streamDownloadToTemp).mockResolvedValue({
        tempPath: mockTempPath,
        size: 1024,
        contentType: "image/jpeg",
        cleanup: mockCleanup,
      });

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "image",
        url: "https://example.com/chunked.jpg",
      };

      const result = await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Image without size",
        media,
      );

      // No warning expected now - download proceeds without size check
      expect(result.messageId).toBe("999");
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it("falls back to GET when HEAD request fails", async () => {
      const mockResult = {
        id: 999,
      };

      const mockTempPath = "/tmp/test-no-head.tmp";
      const mockCleanup = vi.fn().mockResolvedValue(undefined);

      // Mock HEAD request failure (host blocks HEAD)
      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error("Method Not Allowed"),
      );

      // Mock streamDownloadToTemp
      vi.mocked(downloadModule.streamDownloadToTemp).mockResolvedValue({
        tempPath: mockTempPath,
        size: 1024,
        contentType: "image/jpeg",
        cleanup: mockCleanup,
      });

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      const media: ProviderMedia = {
        type: "image",
        url: "https://example.com/no-head.jpg",
      };

      const result = await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Image from host blocking HEAD",
        media,
      );

      // Should warn about HEAD failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("HEAD request failed"),
      );
      // Should still succeed
      expect(result.messageId).toBe("999");
      expect(mockCleanup).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockRestore();
    });

    it("throws error when URL download fails", async () => {
      // Mock HEAD request success
      const mockHeadResponse = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "1024";
            return null;
          }),
        },
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockHeadResponse as any);

      // Mock streamDownloadToTemp to throw
      vi.mocked(downloadModule.streamDownloadToTemp).mockRejectedValue(
        new Error(
          "Failed to download media from https://example.com/missing.jpg: Not Found",
        ),
      );

      const media: ProviderMedia = {
        type: "image",
        url: "https://example.com/missing.jpg",
      };

      await expect(
        sendMediaMessage(mockClient as TelegramClient, "@testuser", "", media),
      ).rejects.toThrow(
        "Failed to download media from https://example.com/missing.jpg: Not Found",
      );
    });

    it("throws error when media has neither buffer nor URL", async () => {
      const media: ProviderMedia = {
        type: "image",
        mimeType: "image/jpeg",
      };

      await expect(
        sendMediaMessage(mockClient as TelegramClient, "@testuser", "", media),
      ).rejects.toThrow("Media must have either buffer or url");
    });

    it("sends media with replyTo option", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "image",
        buffer: Buffer.from("fake-image-data"),
      };

      const options: SendOptions = {
        replyTo: "123",
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "Reply with image",
        media,
        options,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(mockEntity, {
        file: media.buffer,
        caption: "Reply with image",
        replyTo: 123,
      });
    });

    it("uses empty body as undefined caption", async () => {
      const mockResult = {
        id: 999,
      };

      vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

      const media: ProviderMedia = {
        type: "image",
        buffer: Buffer.from("fake-image-data"),
      };

      await sendMediaMessage(
        mockClient as TelegramClient,
        "@testuser",
        "",
        media,
      );

      expect(mockClient.sendFile).toHaveBeenCalledWith(
        mockEntity,
        expect.objectContaining({
          caption: undefined,
        }),
      );
    });

    describe("streaming downloads", () => {
      it("downloads URL to temp file and cleans up after send", async () => {
        const mockResult = {
          id: 999,
        };

        const mockTempPath = "/tmp/test-file.tmp";
        const mockCleanup = vi.fn().mockResolvedValue(undefined);

        // Mock HEAD request
        const mockHeadResponse = {
          headers: {
            get: vi.fn((name: string) => {
              if (name === "content-length") return "1024";
              return null;
            }),
          },
        };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockHeadResponse as any);

        // Mock streamDownloadToTemp
        vi.mocked(downloadModule.streamDownloadToTemp).mockResolvedValue({
          tempPath: mockTempPath,
          size: 1024,
          contentType: "image/jpeg",
          cleanup: mockCleanup,
        });

        vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

        const media: ProviderMedia = {
          type: "image",
          url: "https://example.com/test.jpg",
        };

        await sendMediaMessage(
          mockClient as TelegramClient,
          "@testuser",
          "Streamed image",
          media,
        );

        // Verify streamDownloadToTemp called
        expect(downloadModule.streamDownloadToTemp).toHaveBeenCalledWith(
          "https://example.com/test.jpg",
          expect.any(Number),
        );

        // Verify sendFile called with path (not buffer)
        expect(mockClient.sendFile).toHaveBeenCalledWith(
          mockEntity,
          expect.objectContaining({
            file: mockTempPath, // String path, not Buffer
            caption: "Streamed image",
          }),
        );

        // Verify cleanup was called
        expect(mockCleanup).toHaveBeenCalledTimes(1);
      });

      it("cleans up temp file even when sendFile fails", async () => {
        const mockTempPath = "/tmp/test-file.tmp";
        const mockCleanup = vi.fn().mockResolvedValue(undefined);

        // Mock HEAD request
        const mockHeadResponse = {
          headers: {
            get: vi.fn(() => "1024"),
          },
        };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockHeadResponse as any);

        // Mock streamDownloadToTemp
        vi.mocked(downloadModule.streamDownloadToTemp).mockResolvedValue({
          tempPath: mockTempPath,
          size: 1024,
          contentType: "image/jpeg",
          cleanup: mockCleanup,
        });

        // Mock sendFile to fail
        vi.mocked(mockClient.sendFile).mockRejectedValue(
          new Error("Network error"),
        );

        const media: ProviderMedia = {
          type: "image",
          url: "https://example.com/test.jpg",
        };

        await expect(
          sendMediaMessage(
            mockClient as TelegramClient,
            "@testuser",
            "Failed send",
            media,
          ),
        ).rejects.toThrow("Network error");

        // Verify cleanup was still called despite error
        expect(mockCleanup).toHaveBeenCalledTimes(1);
      });

      it("preserves buffer-based media path (backward compat)", async () => {
        const mockResult = {
          id: 999,
        };

        vi.mocked(mockClient.sendFile).mockResolvedValue(mockResult as any);

        const media: ProviderMedia = {
          type: "image",
          buffer: Buffer.from("test-buffer"),
          mimeType: "image/jpeg",
        };

        await sendMediaMessage(
          mockClient as TelegramClient,
          "@testuser",
          "Buffer image",
          media,
        );

        // Verify streamDownloadToTemp NOT called for buffers
        expect(downloadModule.streamDownloadToTemp).not.toHaveBeenCalled();

        // Verify sendFile called with Buffer (not path)
        expect(mockClient.sendFile).toHaveBeenCalledWith(
          mockEntity,
          expect.objectContaining({
            file: media.buffer,
            caption: "Buffer image",
          }),
        );
      });
    });
  });

  describe("sendTypingIndicator", () => {
    it("sends typing indicator to user", async () => {
      vi.mocked(mockClient.invoke).mockResolvedValue(undefined as any);

      await sendTypingIndicator(mockClient as TelegramClient, "@testuser");

      expect(utilsModule.resolveEntity).toHaveBeenCalledWith(
        mockClient,
        "@testuser",
      );
      expect(mockClient.invoke).toHaveBeenCalledWith(
        expect.any(Api.messages.SetTyping),
      );
    });

    it("sends typing indicator with phone number", async () => {
      vi.mocked(mockClient.invoke).mockResolvedValue(undefined as any);

      await sendTypingIndicator(mockClient as TelegramClient, "+1234567890");

      expect(utilsModule.resolveEntity).toHaveBeenCalledWith(
        mockClient,
        "+1234567890",
      );
    });

    it("uses SendMessageTypingAction", async () => {
      vi.mocked(mockClient.invoke).mockResolvedValue(undefined as any);

      await sendTypingIndicator(mockClient as TelegramClient, "@testuser");

      const callArgs = vi.mocked(mockClient.invoke).mock.calls[0][0];
      expect(callArgs).toBeInstanceOf(Api.messages.SetTyping);
      expect(callArgs.peer).toBe(mockEntity);
      expect(callArgs.action).toBeInstanceOf(Api.SendMessageTypingAction);
    });
  });
});
