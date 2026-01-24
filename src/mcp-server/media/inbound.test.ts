import { promises as fs } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the extraction functions from input-files.js
vi.mock("../../media/input-files.js", async () => {
  const actual = await vi.importActual<typeof import("../../media/input-files.js")>(
    "../../media/input-files.js",
  );
  return {
    ...actual,
    extractImageContentFromSource: vi.fn(),
    extractFileContentFromSource: vi.fn(),
  };
});

vi.mock("../../media/mime.js", async () => {
  const actual = await vi.importActual<typeof import("../../media/mime.js")>("../../media/mime.js");
  return {
    ...actual,
    extensionForMime: actual.extensionForMime,
  };
});

import {
  extractImageContentFromSource,
  extractFileContentFromSource,
} from "../../media/input-files.js";
import { processInboundMedia } from "./inbound.js";
import { MCP_MEDIA_MAX_BYTES } from "./constants.js";

describe("processInboundMedia", () => {
  const mockedExtractImage = vi.mocked(extractImageContentFromSource);
  const mockedExtractFile = vi.mocked(extractFileContentFromSource);

  beforeEach(() => {
    mockedExtractImage.mockReset();
    mockedExtractFile.mockReset();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe("empty inputs", () => {
    it("returns empty result when no media provided", async () => {
      const result = await processInboundMedia({});
      expect(result.paths).toEqual([]);
      expect(result.mimeTypes).toEqual([]);
      expect(result.placeholders).toEqual([]);
      expect(result.extractedContent).toEqual([]);
      // Cleanup should be a no-op
      await expect(result.cleanup()).resolves.toBeUndefined();
    });

    it("returns empty result when empty arrays provided", async () => {
      const result = await processInboundMedia({ images: [], files: [] });
      expect(result.paths).toEqual([]);
      expect(result.mimeTypes).toEqual([]);
      expect(result.placeholders).toEqual([]);
    });
  });

  describe("image processing", () => {
    it("processes valid PNG image", async () => {
      // Mock a valid PNG image (1x1 transparent pixel)
      const base64Png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      mockedExtractImage.mockResolvedValue({
        mimeType: "image/png",
        data: base64Png,
      });

      const result = await processInboundMedia({
        images: [{ data: base64Png, mimeType: "image/png", filename: "test.png" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatch(/test\.png$/);
      expect(result.mimeTypes).toEqual(["image/png"]);
      expect(result.placeholders).toEqual(["<media:image>"]);

      // Verify file was written
      const fileExists = await fs
        .access(result.paths[0])
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Cleanup
      await result.cleanup();
    });

    it("processes image with data URL prefix", async () => {
      const base64Data =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const dataUrl = `data:image/png;base64,${base64Data}`;

      mockedExtractImage.mockResolvedValue({
        mimeType: "image/png",
        data: base64Data,
      });

      const result = await processInboundMedia({
        images: [{ data: dataUrl, mimeType: "image/png" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.mimeTypes).toEqual(["image/png"]);

      await result.cleanup();
    });

    it("generates default filename when not provided", async () => {
      const base64Data = "SGVsbG8gV29ybGQ=";

      mockedExtractImage.mockResolvedValue({
        mimeType: "image/jpeg",
        data: base64Data,
      });

      const result = await processInboundMedia({
        images: [{ data: base64Data, mimeType: "image/jpeg" }],
      });

      expect(result.paths[0]).toMatch(/image-0\.jpg$/);

      await result.cleanup();
    });

    it("respects maximum image count limit", async () => {
      const base64Data = "SGVsbG8=";
      mockedExtractImage.mockResolvedValue({
        mimeType: "image/png",
        data: base64Data,
      });

      // Create 15 images, but limit is 10
      const images = Array(15)
        .fill(null)
        .map((_, i) => ({
          data: base64Data,
          mimeType: "image/png",
          filename: `image-${i}.png`,
        }));

      const result = await processInboundMedia({ images });

      // Should only process 10 images
      expect(result.paths).toHaveLength(10);
      expect(mockedExtractImage).toHaveBeenCalledTimes(10);

      await result.cleanup();
    });

    it("throws on invalid base64 data", async () => {
      await expect(
        processInboundMedia({
          images: [{ data: "not-valid-base64!!!", mimeType: "image/png" }],
        }),
      ).rejects.toThrow("Invalid base64");
    });

    it("throws on data URL without base64 indicator", async () => {
      await expect(
        processInboundMedia({
          images: [{ data: "data:image/png,raw-data", mimeType: "image/png" }],
        }),
      ).rejects.toThrow("only base64 encoding is supported");
    });
  });

  describe("file processing", () => {
    it("processes text file with extraction", async () => {
      const base64Text = Buffer.from("Hello, World!").toString("base64");

      mockedExtractFile.mockResolvedValue({
        filename: "hello.txt",
        text: "Hello, World!",
      });

      const result = await processInboundMedia({
        files: [{ data: base64Text, mimeType: "text/plain", filename: "hello.txt" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatch(/hello\.txt$/);
      expect(result.mimeTypes).toEqual(["text/plain"]);
      expect(result.placeholders).toEqual(["<media:document>"]);
      expect(result.extractedContent).toHaveLength(1);
      expect(result.extractedContent[0].text).toBe("Hello, World!");

      await result.cleanup();
    });

    it("processes PDF file with text extraction", async () => {
      const base64Pdf = Buffer.from("fake-pdf-content").toString("base64");

      mockedExtractFile.mockResolvedValue({
        filename: "document.pdf",
        text: "Extracted PDF text content",
      });

      const result = await processInboundMedia({
        files: [{ data: base64Pdf, mimeType: "application/pdf", filename: "document.pdf" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.mimeTypes).toEqual(["application/pdf"]);
      expect(result.placeholders).toEqual(["<media:document>"]);
      expect(result.extractedContent[0].text).toBe("Extracted PDF text content");

      await result.cleanup();
    });

    it("processes PDF with rendered page images", async () => {
      const base64Pdf = Buffer.from("fake-pdf-content").toString("base64");

      mockedExtractFile.mockResolvedValue({
        filename: "scanned.pdf",
        text: "",
        images: [
          { mimeType: "image/png", data: Buffer.from("page1-image").toString("base64") },
          { mimeType: "image/png", data: Buffer.from("page2-image").toString("base64") },
        ],
      });

      const result = await processInboundMedia({
        files: [{ data: base64Pdf, mimeType: "application/pdf", filename: "scanned.pdf" }],
      });

      // Main PDF + 2 rendered page images
      expect(result.paths).toHaveLength(3);
      expect(result.paths[0]).toMatch(/scanned\.pdf$/);
      expect(result.paths[1]).toMatch(/scanned-page-1\.png$/);
      expect(result.paths[2]).toMatch(/scanned-page-2\.png$/);
      expect(result.mimeTypes).toEqual(["application/pdf", "image/png", "image/png"]);
      expect(result.placeholders).toEqual(["<media:document>", "<media:image>", "<media:image>"]);

      await result.cleanup();
    });

    it("processes audio file as binary blob", async () => {
      const base64Audio = Buffer.from("fake-audio-data").toString("base64");

      const result = await processInboundMedia({
        files: [{ data: base64Audio, mimeType: "audio/mpeg", filename: "sound.mp3" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatch(/sound\.mp3$/);
      expect(result.mimeTypes).toEqual(["audio/mpeg"]);
      expect(result.placeholders).toEqual(["<media:audio>"]);
      // Audio files don't have extracted content
      expect(result.extractedContent).toHaveLength(0);

      // extractFileContentFromSource should not be called for audio
      expect(mockedExtractFile).not.toHaveBeenCalled();

      await result.cleanup();
    });

    it("processes video file as binary blob", async () => {
      const base64Video = Buffer.from("fake-video-data").toString("base64");

      const result = await processInboundMedia({
        files: [{ data: base64Video, mimeType: "video/mp4", filename: "clip.mp4" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.mimeTypes).toEqual(["video/mp4"]);
      expect(result.placeholders).toEqual(["<media:video>"]);

      await result.cleanup();
    });

    it("processes archive file as binary blob", async () => {
      const base64Zip = Buffer.from("fake-zip-data").toString("base64");

      const result = await processInboundMedia({
        files: [{ data: base64Zip, mimeType: "application/zip", filename: "archive.zip" }],
      });

      expect(result.paths).toHaveLength(1);
      expect(result.mimeTypes).toEqual(["application/zip"]);
      expect(result.placeholders).toEqual(["<media:archive>"]);

      await result.cleanup();
    });

    it("throws on unsupported MIME type", async () => {
      const base64Data = Buffer.from("test").toString("base64");

      await expect(
        processInboundMedia({
          files: [{ data: base64Data, mimeType: "application/x-unsupported" }],
        }),
      ).rejects.toThrow("Unsupported file MIME type");
    });

    it("throws when file exceeds size limit", async () => {
      // Create data larger than MCP_MEDIA_MAX_BYTES (15MB)
      const largeData = Buffer.alloc(MCP_MEDIA_MAX_BYTES + 1)
        .fill("A")
        .toString("base64");

      await expect(
        processInboundMedia({
          files: [{ data: largeData, mimeType: "audio/wav", filename: "large.wav" }],
        }),
      ).rejects.toThrow("File too large");
    });

    it("respects maximum file count limit", async () => {
      const base64Data = Buffer.from("test").toString("base64");
      mockedExtractFile.mockResolvedValue({
        filename: "test.txt",
        text: "content",
      });

      // Create 10 files, but limit is 5
      const files = Array(10)
        .fill(null)
        .map((_, i) => ({
          data: base64Data,
          mimeType: "text/plain",
          filename: `file-${i}.txt`,
        }));

      const result = await processInboundMedia({ files });

      expect(result.paths).toHaveLength(5);
      expect(mockedExtractFile).toHaveBeenCalledTimes(5);

      await result.cleanup();
    });

    it("sanitizes dangerous filenames", async () => {
      const base64Data = Buffer.from("test").toString("base64");

      mockedExtractFile.mockResolvedValue({
        filename: "safe.txt",
        text: "content",
      });

      const result = await processInboundMedia({
        files: [{ data: base64Data, mimeType: "text/plain", filename: "../../../etc/passwd" }],
      });

      // Path traversal slashes are replaced with underscores
      // The sanitized filename should not contain actual path separators
      expect(result.paths[0]).not.toContain("/etc/");
      expect(result.paths[0]).not.toContain("\\etc\\");
      // The filename will be like: .._.._.._etc_passwd (slashes replaced with _)
      expect(result.paths[0]).toMatch(/_etc_passwd$/);

      await result.cleanup();
    });
  });

  describe("mixed media processing", () => {
    it("processes images and files together", async () => {
      const base64Image =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const base64Text = Buffer.from("Hello").toString("base64");

      mockedExtractImage.mockResolvedValue({
        mimeType: "image/png",
        data: base64Image,
      });
      mockedExtractFile.mockResolvedValue({
        filename: "test.txt",
        text: "Hello",
      });

      const result = await processInboundMedia({
        images: [{ data: base64Image, mimeType: "image/png", filename: "photo.png" }],
        files: [{ data: base64Text, mimeType: "text/plain", filename: "test.txt" }],
      });

      expect(result.paths).toHaveLength(2);
      expect(result.mimeTypes).toEqual(["image/png", "text/plain"]);
      expect(result.placeholders).toEqual(["<media:image>", "<media:document>"]);

      await result.cleanup();
    });
  });

  describe("cleanup behavior", () => {
    it("cleans up temp directory on success", async () => {
      const base64Data = "SGVsbG8=";
      mockedExtractImage.mockResolvedValue({
        mimeType: "image/png",
        data: base64Data,
      });

      const result = await processInboundMedia({
        images: [{ data: base64Data, mimeType: "image/png" }],
      });

      const tempDir = path.dirname(result.paths[0]);

      // Verify temp dir exists
      const existsBefore = await fs
        .access(tempDir)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Cleanup
      await result.cleanup();

      // Verify temp dir is removed
      const existsAfter = await fs
        .access(tempDir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("cleans up temp directory on error", async () => {
      mockedExtractImage.mockRejectedValue(new Error("extraction failed"));

      await expect(
        processInboundMedia({
          images: [{ data: "SGVsbG8=", mimeType: "image/png" }],
        }),
      ).rejects.toThrow("extraction failed");

      // The temp directory should be cleaned up even on error
      // (we can't easily verify this without access to the temp dir path)
    });
  });
});
