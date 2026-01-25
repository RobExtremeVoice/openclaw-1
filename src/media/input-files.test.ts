import { Document, Packer, Paragraph, TextRun } from "docx";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_INPUT_FILE_MIMES,
  extractFileContentFromSource,
  type InputFileLimits,
} from "./input-files.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function createTestDocx(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [new Paragraph({ children: [new TextRun(text)] })],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function createMultiParagraphDocx(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map((text) => new Paragraph({ children: [new TextRun(text)] })),
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function createDefaultLimits(overrides?: Partial<InputFileLimits>): InputFileLimits {
  return {
    allowUrl: false,
    allowedMimes: new Set([DOCX_MIME]),
    maxBytes: 5 * 1024 * 1024,
    maxChars: 200_000,
    maxRedirects: 3,
    timeoutMs: 10_000,
    pdf: {
      maxPages: 4,
      maxPixels: 4_000_000,
      minTextChars: 200,
    },
    ...overrides,
  };
}

describe("DOCX extraction", () => {
  describe("basic extraction", () => {
    it("extracts text from a simple DOCX with a single paragraph", async () => {
      const testText = "Hello, this is a test document.";
      const buffer = await createTestDocx(testText);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "test.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(result.filename).toBe("test.docx");
      // mammoth adds trailing newlines for paragraphs
      expect(result.text?.trim()).toBe(testText);
      expect(result.images).toBeUndefined();
    });

    it("extracts text from a DOCX with multiple paragraphs", async () => {
      const paragraphs = ["First paragraph.", "Second paragraph.", "Third paragraph."];
      const buffer = await createMultiParagraphDocx(paragraphs);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "multi.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(result.text).toContain("First paragraph.");
      expect(result.text).toContain("Second paragraph.");
      expect(result.text).toContain("Third paragraph.");
    });

    it("handles empty DOCX documents", async () => {
      const buffer = await createTestDocx("");

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "empty.docx",
        },
        limits: createDefaultLimits(),
      });

      // mammoth may add whitespace for empty paragraphs
      expect(result.text?.trim()).toBe("");
    });

    it("uses default filename when not provided", async () => {
      const buffer = await createTestDocx("Test content");

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
        },
        limits: createDefaultLimits(),
      });

      expect(result.filename).toBe("file");
    });
  });

  describe("maxChars limit", () => {
    it("clamps output to maxChars limit when text exceeds it", async () => {
      const longText = "A".repeat(500);
      const buffer = await createTestDocx(longText);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "long.docx",
        },
        limits: createDefaultLimits({ maxChars: 100 }),
      });

      expect(result.text).toHaveLength(100);
      expect(result.text).toBe("A".repeat(100));
    });

    it("returns full text when under maxChars limit", async () => {
      const shortText = "Short text content.";
      const buffer = await createTestDocx(shortText);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: buffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "short.docx",
        },
        limits: createDefaultLimits({ maxChars: 1000 }),
      });

      // mammoth adds trailing newlines for paragraphs
      expect(result.text?.trim()).toBe(shortText);
    });
  });

  describe("MIME type handling", () => {
    it("includes DOCX MIME type in DEFAULT_INPUT_FILE_MIMES", () => {
      expect(DEFAULT_INPUT_FILE_MIMES).toContain(DOCX_MIME);
    });

    it("rejects unsupported MIME types", async () => {
      const buffer = await createTestDocx("Test content");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: buffer.toString("base64"),
            mediaType: "application/octet-stream",
            filename: "test.bin",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow("Unsupported file MIME type: application/octet-stream");
    });

    it("rejects when DOCX MIME is not in allowed list", async () => {
      const buffer = await createTestDocx("Test content");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: buffer.toString("base64"),
            mediaType: DOCX_MIME,
            filename: "test.docx",
          },
          limits: createDefaultLimits({ allowedMimes: new Set(["text/plain"]) }),
        }),
      ).rejects.toThrow(`Unsupported file MIME type: ${DOCX_MIME}`);
    });

    it("throws when media type is missing", async () => {
      const buffer = await createTestDocx("Test content");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: buffer.toString("base64"),
            filename: "test.docx",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow("input_file missing media type");
    });
  });

  describe("error handling", () => {
    it("throws on invalid/corrupted buffer", async () => {
      const corruptedBuffer = Buffer.from("not a valid docx file");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: corruptedBuffer.toString("base64"),
            mediaType: DOCX_MIME,
            filename: "corrupted.docx",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow();
    });

    it("throws when base64 data is missing", async () => {
      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            mediaType: DOCX_MIME,
            filename: "test.docx",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow("input_file base64 source missing 'data' field");
    });

    it("throws when file exceeds maxBytes limit", async () => {
      const buffer = await createTestDocx("Test content");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: buffer.toString("base64"),
            mediaType: DOCX_MIME,
            filename: "test.docx",
          },
          limits: createDefaultLimits({ maxBytes: 100 }),
        }),
      ).rejects.toThrow(/File too large/);
    });

    it("throws on truncated zip data", async () => {
      const validBuffer = await createTestDocx("Test content");
      // Truncate the buffer to create an invalid zip
      const truncatedBuffer = validBuffer.subarray(0, Math.floor(validBuffer.length / 2));

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: truncatedBuffer.toString("base64"),
            mediaType: DOCX_MIME,
            filename: "truncated.docx",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow();
    });
  });

  describe("source type handling", () => {
    it("throws when URL sources are disabled", async () => {
      await expect(
        extractFileContentFromSource({
          source: {
            type: "url",
            url: "https://example.com/test.docx",
            mediaType: DOCX_MIME,
            filename: "test.docx",
          },
          limits: createDefaultLimits({ allowUrl: false }),
        }),
      ).rejects.toThrow("input_file URL sources are disabled by config");
    });

    it("throws when source type is invalid", async () => {
      await expect(
        extractFileContentFromSource({
          source: {
            type: "url",
            mediaType: DOCX_MIME,
            filename: "test.docx",
          },
          limits: createDefaultLimits({ allowUrl: true }),
        }),
      ).rejects.toThrow("input_file must have 'source.url' or 'source.data'");
    });
  });
});
