/**
 * Utils Tests
 */

import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractUserId, resolveEntity } from "./utils.js";

describe("utils", () => {
  let mockClient: Partial<TelegramClient>;

  beforeEach(() => {
    mockClient = {
      getEntity: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe("resolveEntity", () => {
    it("resolves entity with @username", async () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
      });

      vi.mocked(mockClient.getEntity).mockResolvedValue(mockUser);

      const result = await resolveEntity(
        mockClient as TelegramClient,
        "@testuser",
      );

      expect(result).toBe(mockUser);
      expect(mockClient.getEntity).toHaveBeenCalledWith("@testuser");
    });

    it("resolves entity with phone number", async () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
        phone: "1234567890",
      });

      vi.mocked(mockClient.getEntity).mockResolvedValue(mockUser);

      const result = await resolveEntity(
        mockClient as TelegramClient,
        "+1234567890",
      );

      expect(result).toBe(mockUser);
      expect(mockClient.getEntity).toHaveBeenCalledWith("+1234567890");
    });

    it("resolves entity with user ID", async () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
      });

      vi.mocked(mockClient.getEntity).mockResolvedValue(mockUser);

      const result = await resolveEntity(mockClient as TelegramClient, "12345");

      expect(result).toBe(mockUser);
      expect(mockClient.getEntity).toHaveBeenCalledWith("12345");
    });

    it("adds @ prefix automatically if first attempt fails", async () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
      });

      vi.mocked(mockClient.getEntity)
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(mockUser);

      const result = await resolveEntity(
        mockClient as TelegramClient,
        "testuser",
      );

      expect(result).toBe(mockUser);
      expect(mockClient.getEntity).toHaveBeenCalledTimes(2);
      expect(mockClient.getEntity).toHaveBeenNthCalledWith(1, "testuser");
      expect(mockClient.getEntity).toHaveBeenNthCalledWith(2, "@testuser");
    });

    it("does not add @ prefix if identifier already starts with @", async () => {
      vi.mocked(mockClient.getEntity).mockRejectedValue(new Error("Not found"));

      await expect(
        resolveEntity(mockClient as TelegramClient, "@testuser"),
      ).rejects.toThrow("Could not resolve Telegram entity: @testuser");

      expect(mockClient.getEntity).toHaveBeenCalledTimes(1);
      expect(mockClient.getEntity).toHaveBeenCalledWith("@testuser");
    });

    it("throws descriptive error when entity cannot be resolved", async () => {
      vi.mocked(mockClient.getEntity).mockRejectedValue(new Error("Not found"));

      await expect(
        resolveEntity(mockClient as TelegramClient, "unknown"),
      ).rejects.toThrow(
        "Could not resolve Telegram entity: unknown. Use @username, phone number (+1234567890), or user ID.",
      );
    });

    it("trims whitespace from identifier", async () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
      });

      vi.mocked(mockClient.getEntity).mockResolvedValue(mockUser);

      await resolveEntity(mockClient as TelegramClient, "  @testuser  ");

      expect(mockClient.getEntity).toHaveBeenCalledWith("@testuser");
    });
  });

  describe("extractUserId", () => {
    it("extracts user ID from User entity as string", () => {
      const mockUser = new Api.User({
        id: BigInt(12345),
        firstName: "Test",
      });

      const userId = extractUserId(mockUser);
      expect(userId).toBe("12345");
    });

    it("extracts user ID from Chat entity as string", () => {
      const mockChat = new Api.Chat({
        id: BigInt(67890),
        title: "Test Chat",
      });

      const userId = extractUserId(mockChat);
      expect(userId).toBe("67890");
    });

    it("returns '0' for entity without id field", () => {
      const mockEntity = {} as Api.User;
      const userId = extractUserId(mockEntity);
      expect(userId).toBe("0");
    });

    it("returns '0' for entity with non-bigint id", () => {
      const mockEntity = { id: "12345" } as unknown as Api.User;
      const userId = extractUserId(mockEntity);
      expect(userId).toBe("0");
    });

    it("handles large user IDs without precision loss", () => {
      const mockUser = new Api.User({
        id: BigInt("9007199254740992"), // MAX_SAFE_INTEGER + 1
        firstName: "Test",
      });

      const userId = extractUserId(mockUser);
      expect(userId).toBe("9007199254740992");
    });
  });
});
