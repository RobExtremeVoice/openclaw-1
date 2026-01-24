import { describe, expect, it } from "vitest";

import {
  validateBase64,
  stripDataUrlPrefix,
  sanitizeFilename,
  resolveMediaPlaceholder,
  isArchiveMime,
  formatBytes,
  estimateBlockSize,
} from "./helpers.js";
import type { McpContentBlock } from "./types.js";

describe("validateBase64", () => {
  it("accepts valid base64 strings", () => {
    expect(() => validateBase64("SGVsbG8gV29ybGQ=")).not.toThrow();
    expect(() => validateBase64("YWJjZA==")).not.toThrow();
    expect(() => validateBase64("YWJjZGU=")).not.toThrow();
    expect(() => validateBase64("YWJjZGVm")).not.toThrow();
  });

  it("accepts empty string", () => {
    expect(() => validateBase64("")).not.toThrow();
  });

  it("rejects strings with incorrect padding length", () => {
    expect(() => validateBase64("SGVsbG8")).toThrow("incorrect padding");
    expect(() => validateBase64("YWJj")).not.toThrow(); // 4 chars is valid
    expect(() => validateBase64("YWJjZ")).toThrow("incorrect padding");
  });

  it("rejects strings with too much padding", () => {
    // "YWI===" has 5 chars which is not a multiple of 4, so it fails with incorrect padding
    expect(() => validateBase64("YWI===")).toThrow("incorrect padding");
    // "YWJj====" has 8 chars, but 4 = signs is too much padding
    expect(() => validateBase64("YWJj====")).toThrow("too much padding");
  });

  it("rejects strings with invalid characters", () => {
    expect(() => validateBase64("SGVs!G8=")).toThrow("invalid characters");
    expect(() => validateBase64("SGVs@G8=")).toThrow("invalid characters");
    expect(() => validateBase64("SGVs#G8=")).toThrow("invalid characters");
    expect(() => validateBase64("SGVs G8=")).toThrow("invalid characters");
  });

  it("accepts valid base64 characters including + and /", () => {
    expect(() => validateBase64("a+b/c+d=")).not.toThrow();
  });

  it("uses sampling for large strings (>1MB)", () => {
    // Create a large valid base64 string (>1MB)
    const largeValid = "A".repeat(1024 * 1024 + 100);
    // Pad to multiple of 4
    const paddedLargeValid = largeValid + "A".repeat(4 - (largeValid.length % 4));
    expect(() => validateBase64(paddedLargeValid)).not.toThrow();
  });
});

describe("stripDataUrlPrefix", () => {
  it("returns data unchanged if not a data URL", () => {
    expect(stripDataUrlPrefix("SGVsbG8gV29ybGQ=")).toBe("SGVsbG8gV29ybGQ=");
    expect(stripDataUrlPrefix("YWJjZA==")).toBe("YWJjZA==");
  });

  it("strips valid base64 data URL prefixes", () => {
    expect(stripDataUrlPrefix("data:image/png;base64,SGVsbG8=")).toBe("SGVsbG8=");
    expect(stripDataUrlPrefix("data:application/pdf;base64,YWJjZA==")).toBe("YWJjZA==");
    expect(stripDataUrlPrefix("data:text/plain;base64,dGVzdA==")).toBe("dGVzdA==");
  });

  it("handles data URLs with parameters", () => {
    expect(stripDataUrlPrefix("data:image/png;charset=utf-8;base64,SGVsbG8=")).toBe("SGVsbG8=");
  });

  it("throws for data URLs without base64 indicator", () => {
    expect(() => stripDataUrlPrefix("data:text/plain,Hello")).toThrow(
      "only base64 encoding is supported",
    );
  });

  it("throws for malformed data URLs", () => {
    expect(() => stripDataUrlPrefix("data:image/png;base64,")).toThrow("Invalid data URL format");
  });
});

describe("sanitizeFilename", () => {
  it("returns undefined for undefined input", () => {
    expect(sanitizeFilename(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(sanitizeFilename("")).toBeUndefined();
  });

  it("removes path traversal characters", () => {
    // Slashes and backslashes are replaced with underscores
    expect(sanitizeFilename("../../../etc/passwd")).toBe(".._.._.._etc_passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32")).toBe(".._.._windows_system32");
  });

  it("removes special characters", () => {
    expect(sanitizeFilename("file:name*.txt")).toBe("file_name_.txt");
    expect(sanitizeFilename('test"file?.pdf')).toBe("test_file_.pdf");
    expect(sanitizeFilename("doc<>file|.doc")).toBe("doc__file_.doc");
  });

  it("preserves valid filenames", () => {
    expect(sanitizeFilename("document.pdf")).toBe("document.pdf");
    expect(sanitizeFilename("my-file_v2.txt")).toBe("my-file_v2.txt");
    expect(sanitizeFilename("image 001.png")).toBe("image 001.png");
  });

  it("truncates filenames to 255 characters", () => {
    const longName = "a".repeat(300);
    expect(sanitizeFilename(longName)).toHaveLength(255);
  });
});

describe("resolveMediaPlaceholder", () => {
  it("returns image placeholder for image MIME types", () => {
    expect(resolveMediaPlaceholder("image/png")).toBe("<media:image>");
    expect(resolveMediaPlaceholder("image/jpeg")).toBe("<media:image>");
    expect(resolveMediaPlaceholder("image/gif")).toBe("<media:image>");
    expect(resolveMediaPlaceholder("image/webp")).toBe("<media:image>");
  });

  it("returns audio placeholder for audio MIME types", () => {
    expect(resolveMediaPlaceholder("audio/mpeg")).toBe("<media:audio>");
    expect(resolveMediaPlaceholder("audio/wav")).toBe("<media:audio>");
    expect(resolveMediaPlaceholder("audio/ogg")).toBe("<media:audio>");
  });

  it("returns video placeholder for video MIME types", () => {
    expect(resolveMediaPlaceholder("video/mp4")).toBe("<media:video>");
    expect(resolveMediaPlaceholder("video/webm")).toBe("<media:video>");
    expect(resolveMediaPlaceholder("video/quicktime")).toBe("<media:video>");
  });

  it("returns document placeholder for PDF", () => {
    expect(resolveMediaPlaceholder("application/pdf")).toBe("<media:document>");
  });

  it("returns archive placeholder for archive types", () => {
    expect(resolveMediaPlaceholder("application/zip")).toBe("<media:archive>");
    expect(resolveMediaPlaceholder("application/gzip")).toBe("<media:archive>");
    expect(resolveMediaPlaceholder("application/x-tar")).toBe("<media:archive>");
  });

  it("returns document placeholder for other types", () => {
    expect(resolveMediaPlaceholder("text/plain")).toBe("<media:document>");
    expect(resolveMediaPlaceholder("application/json")).toBe("<media:document>");
    expect(resolveMediaPlaceholder("application/octet-stream")).toBe("<media:document>");
  });
});

describe("isArchiveMime", () => {
  it("returns true for archive MIME types", () => {
    expect(isArchiveMime("application/zip")).toBe(true);
    expect(isArchiveMime("application/x-zip-compressed")).toBe(true);
    expect(isArchiveMime("application/gzip")).toBe(true);
    expect(isArchiveMime("application/x-gzip")).toBe(true);
    expect(isArchiveMime("application/x-tar")).toBe(true);
    expect(isArchiveMime("application/x-compressed-tar")).toBe(true);
  });

  it("returns false for non-archive MIME types", () => {
    expect(isArchiveMime("application/pdf")).toBe(false);
    expect(isArchiveMime("image/png")).toBe(false);
    expect(isArchiveMime("text/plain")).toBe(false);
    expect(isArchiveMime("application/json")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1KB", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1023)).toBe("1023B");
  });

  it("formats bytes in KB range", () => {
    expect(formatBytes(1024)).toBe("1.0KB");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(10240)).toBe("10.0KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0KB");
  });

  it("formats bytes in MB range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5MB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0MB");
  });
});

describe("estimateBlockSize", () => {
  it("estimates text block size correctly", () => {
    const block: McpContentBlock = { type: "text", text: "Hello, World!" };
    expect(estimateBlockSize(block)).toBe(Buffer.byteLength("Hello, World!", "utf-8"));
  });

  it("estimates text block size for multi-byte characters", () => {
    const block: McpContentBlock = { type: "text", text: "Hello \u4e16\u754c!" };
    expect(estimateBlockSize(block)).toBe(Buffer.byteLength("Hello \u4e16\u754c!", "utf-8"));
  });

  it("estimates image block size from base64", () => {
    // 100 bytes of base64 represents ~75 bytes of binary data
    const base64Data = "A".repeat(100);
    const block: McpContentBlock = { type: "image", data: base64Data, mimeType: "image/png" };
    expect(estimateBlockSize(block)).toBe(75);
  });

  it("estimates audio block size from base64", () => {
    const base64Data = "B".repeat(200);
    const block: McpContentBlock = { type: "audio", data: base64Data, mimeType: "audio/mpeg" };
    expect(estimateBlockSize(block)).toBe(150);
  });

  it("estimates resource block size with text content", () => {
    const block: McpContentBlock = {
      type: "resource",
      resource: {
        uri: "attachment://doc.txt",
        mimeType: "text/plain",
        text: "Sample text content",
      },
    };
    expect(estimateBlockSize(block)).toBe(Buffer.byteLength("Sample text content", "utf-8"));
  });

  it("estimates resource block size with blob content", () => {
    const base64Data = "C".repeat(400);
    const block: McpContentBlock = {
      type: "resource",
      resource: {
        uri: "attachment://file.bin",
        mimeType: "application/octet-stream",
        blob: base64Data,
      },
    };
    expect(estimateBlockSize(block)).toBe(300);
  });

  it("returns 0 for resource blocks without text or blob", () => {
    const block: McpContentBlock = {
      type: "resource",
      resource: {
        uri: "attachment://empty",
      },
    };
    expect(estimateBlockSize(block)).toBe(0);
  });
});
