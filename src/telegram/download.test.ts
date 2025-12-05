/**
 * Download Tests
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanOrphanedTempFiles,
  ensureTempDir,
  getTelegramTempDir,
  streamDownloadToTemp,
} from "./download.js";

// Mock global fetch
global.fetch = vi.fn();

describe("download", () => {
  const testTempDir = path.join(
    os.tmpdir(),
    `warelay-test-${process.pid}-download`,
  );

  beforeEach(async () => {
    // Clean test directory before each test
    await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe("getTelegramTempDir", () => {
    it("returns correct path", () => {
      const dir = getTelegramTempDir();
      // Should contain either .clawdis or .warelay (depending on which exists)
      const hasCorrectDir =
        dir.includes(".clawdis") || dir.includes(".warelay");
      expect(hasCorrectDir).toBe(true);
      expect(dir).toContain("telegram-temp");
      expect(path.isAbsolute(dir)).toBe(true);
    });
  });

  describe("ensureTempDir", () => {
    it("creates directory if not exists", async () => {
      // Use the real temp dir for this test
      const dir = getTelegramTempDir();

      // Clean it first
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

      // Verify it doesn't exist
      const existsBefore = await fs
        .access(dir)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(false);

      // Create it
      await ensureTempDir();

      // Verify it exists
      const existsAfter = await fs
        .access(dir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(true);
    });

    it("succeeds if already exists", async () => {
      const dir = getTelegramTempDir();

      // Create it twice
      await ensureTempDir();
      await ensureTempDir();

      // Should not throw
      const exists = await fs
        .access(dir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("streamDownloadToTemp", () => {
    it("downloads small file to temp directory", async () => {
      const testData = Buffer.from("test file content");

      // Mock fetch response with readable stream
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) =>
            name === "content-type" ? "text/plain" : null,
        },
        body: Readable.from([testData]),
      } as any);

      const result = await streamDownloadToTemp(
        "https://example.com/test.txt",
        1024 * 1024, // 1MB max
      );

      try {
        // Verify file exists and has correct content
        const content = await fs.readFile(result.tempPath);
        expect(content.equals(testData)).toBe(true);
        expect(result.size).toBe(testData.length);
        expect(result.contentType).toBe("text/plain");

        // Verify path is in temp directory
        expect(result.tempPath).toContain("telegram-temp");
        expect(result.tempPath).toMatch(/telegram-dl-.*\.tmp$/);
      } finally {
        await result.cleanup();
      }
    });

    it("throws on HTTP error (ok: false)", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      } as any);

      await expect(
        streamDownloadToTemp("https://example.com/missing.txt", 1024),
      ).rejects.toThrow(/Failed to download media.*Not Found/);
    });

    it("throws when size exceeds maxSize", async () => {
      // Create data larger than maxSize
      const largeData = Buffer.alloc(1024 * 10); // 10KB

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: () => null,
        },
        body: Readable.from([largeData]),
      } as any);

      await expect(
        streamDownloadToTemp(
          "https://example.com/large.bin",
          1024, // Only allow 1KB
        ),
      ).rejects.toThrow(/Download size.*exceeds maximum/);
    });

    it("cleans up temp file on error", async () => {
      const largeData = Buffer.alloc(1024 * 10);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: () => null,
        },
        body: Readable.from([largeData]),
      } as any);

      let _tempPath: string | undefined;
      try {
        await streamDownloadToTemp("https://example.com/large.bin", 1024);
      } catch {
        // Expected to fail
      }

      // Give cleanup a moment to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify no temp files left
      const tempDir = getTelegramTempDir();
      const files = await fs.readdir(tempDir).catch(() => []);
      const tempFiles = files.filter((f) => f.startsWith("telegram-dl-"));
      expect(tempFiles.length).toBe(0);
    });

    it("cleanup() removes temp file", async () => {
      const testData = Buffer.from("cleanup test");

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: () => null,
        },
        body: Readable.from([testData]),
      } as any);

      const result = await streamDownloadToTemp(
        "https://example.com/test.txt",
        1024,
      );

      // Verify file exists
      const existsBefore = await fs
        .access(result.tempPath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Cleanup
      await result.cleanup();

      // Verify file removed
      const existsAfter = await fs
        .access(result.tempPath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("handles missing response body (body: null)", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      await expect(
        streamDownloadToTemp("https://example.com/empty.txt", 1024),
      ).rejects.toThrow(/No response body/);
    });
  });

  describe("cleanOrphanedTempFiles", () => {
    it("removes old files (>TTL)", async () => {
      const tempDir = getTelegramTempDir();
      await ensureTempDir();

      // Create a temp file
      const oldFile = path.join(tempDir, "telegram-dl-old.tmp");
      await fs.writeFile(oldFile, "old content");

      // Mock stat to return old mtime
      const statSpy = vi.spyOn(fs, "stat");
      const oldDate = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      statSpy.mockResolvedValue({
        mtimeMs: oldDate,
      } as any);

      // Clean with 1 hour TTL
      await cleanOrphanedTempFiles(60 * 60 * 1000);

      // File should be removed
      const exists = await fs
        .access(oldFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);

      statSpy.mockRestore();
    });

    it("preserves recent files", async () => {
      const tempDir = getTelegramTempDir();
      await ensureTempDir();

      // Create a recent file
      const recentFile = path.join(tempDir, "telegram-dl-recent.tmp");
      await fs.writeFile(recentFile, "recent content");

      // Mock stat to return recent mtime
      const statSpy = vi.spyOn(fs, "stat");
      const recentDate = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      statSpy.mockResolvedValue({
        mtimeMs: recentDate,
      } as any);

      // Clean with 1 hour TTL
      await cleanOrphanedTempFiles(60 * 60 * 1000);

      // File should still exist
      const exists = await fs
        .access(recentFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Clean up
      await fs.rm(recentFile, { force: true });
      statSpy.mockRestore();
    });

    it("handles missing temp directory", async () => {
      const tempDir = getTelegramTempDir();

      // Delete temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      // Should not throw
      await expect(cleanOrphanedTempFiles()).resolves.not.toThrow();
    });

    it("continues on individual file errors", async () => {
      const tempDir = getTelegramTempDir();
      await ensureTempDir();

      // Create multiple files
      const file1 = path.join(tempDir, "telegram-dl-1.tmp");
      const file2 = path.join(tempDir, "telegram-dl-2.tmp");
      await fs.writeFile(file1, "content 1");
      await fs.writeFile(file2, "content 2");

      // Mock stat to return old dates
      const statSpy = vi.spyOn(fs, "stat");
      const oldDate = Date.now() - 2 * 60 * 60 * 1000;
      statSpy.mockResolvedValue({
        mtimeMs: oldDate,
      } as any);

      // Mock rm to fail on first file
      const rmSpy = vi.spyOn(fs, "rm");
      let callCount = 0;
      rmSpy.mockImplementation((async (filePath: string, options?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Permission denied");
        }
        // Use actual implementation for other calls
        return rmSpy.getMockImplementation
          ? Promise.resolve()
          : fs.rm(filePath, options);
      }) as any);

      // Should not throw, continues processing
      await expect(cleanOrphanedTempFiles()).resolves.not.toThrow();

      // Clean up
      await fs.rm(file1, { force: true }).catch(() => {});
      await fs.rm(file2, { force: true }).catch(() => {});
      statSpy.mockRestore();
      rmSpy.mockRestore();
    });
  });
});
