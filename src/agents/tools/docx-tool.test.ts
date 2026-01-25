import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDocxTool } from "./docx-tool.js";

describe("docx tool", () => {
  let tempDir: string;
  let tool: ReturnType<typeof createDocxTool>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-docx-"));
    tool = createDocxTool();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("create action", () => {
    it("creates DOCX with single paragraph", async () => {
      const filePath = path.join(tempDir, "single.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Hello, World!" }],
        },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);
      expect(details.path).toBe(filePath);

      // Verify file exists and is a valid DOCX
      const stat = await fs.stat(filePath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it("creates DOCX with multiple paragraphs and formatting", async () => {
      const filePath = path.join(tempDir, "formatted.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [
            { text: "Title", heading: 1 },
            { text: "Bold text", bold: true },
            { text: "Italic text", italic: true },
            { text: "Underlined text", underline: true },
            { text: "Mixed formatting", bold: true, italic: true },
          ],
        },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);

      // Read back and verify content
      const readResult = await tool.execute("call2", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      expect(readDetails.text).toContain("Title");
      expect(readDetails.text).toContain("Bold text");
      expect(readDetails.text).toContain("Italic text");
      expect(readDetails.text).toContain("Underlined text");
      expect(readDetails.text).toContain("Mixed formatting");
    });

    it("creates DOCX with a table", async () => {
      const filePath = path.join(tempDir, "table.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          tables: [
            {
              rows: [
                ["Header 1", "Header 2", "Header 3"],
                ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
                ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"],
              ],
            },
          ],
        },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);

      // Read back and verify table content
      const readResult = await tool.execute("call2", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      expect(readDetails.text).toContain("Header 1");
      expect(readDetails.text).toContain("Row 1 Col 2");
      expect(readDetails.text).toContain("Row 2 Col 3");
    });

    it("creates DOCX with paragraphs and tables combined", async () => {
      const filePath = path.join(tempDir, "combined.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Report Title", heading: 1 }, { text: "Introduction paragraph." }],
          tables: [
            {
              rows: [
                ["Name", "Value"],
                ["Item A", "100"],
              ],
            },
          ],
        },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);

      const readResult = await tool.execute("call2", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      expect(readDetails.text).toContain("Report Title");
      expect(readDetails.text).toContain("Introduction paragraph");
      expect(readDetails.text).toContain("Item A");
    });

    it("creates nested directories if needed", async () => {
      const filePath = path.join(tempDir, "nested", "dir", "file.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Nested content" }],
        },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);
      expect(await fs.stat(filePath)).toBeDefined();
    });

    it("returns error when content is missing", async () => {
      const filePath = path.join(tempDir, "no-content.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toContain("content is required");
    });
  });

  describe("read action", () => {
    it("reads a DOCX file and extracts text", async () => {
      // First create a file
      const filePath = path.join(tempDir, "read-test.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "First paragraph" }, { text: "Second paragraph" }],
        },
      });

      // Then read it
      const result = await tool.execute("call2", {
        action: "read",
        path: filePath,
      });

      const details = result.details as {
        success: boolean;
        path: string;
        text: string;
        html: string;
        messages: string[];
      };
      expect(details.success).toBe(true);
      expect(details.path).toBe(filePath);
      expect(details.text).toContain("First paragraph");
      expect(details.text).toContain("Second paragraph");
      expect(details.html).toBeTruthy();
      expect(Array.isArray(details.messages)).toBe(true);
    });

    it("returns error when reading non-existent file", async () => {
      const filePath = path.join(tempDir, "does-not-exist.docx");
      const result = await tool.execute("call1", {
        action: "read",
        path: filePath,
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toMatch(/ENOENT|no such file/i);
    });
  });

  describe("edit action", () => {
    it("appends paragraph to existing DOCX", async () => {
      // Create initial file
      const filePath = path.join(tempDir, "edit-append.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Original content" }],
        },
      });

      // Append content
      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
        operations: [
          {
            type: "append",
            content: {
              paragraphs: [{ text: "Appended content" }],
            },
          },
        ],
      });

      const details = result.details as {
        success: boolean;
        operationsApplied: number;
      };
      expect(details.success).toBe(true);
      expect(details.operationsApplied).toBe(1);

      // Verify content
      const readResult = await tool.execute("call3", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      expect(readDetails.text).toContain("Original content");
      expect(readDetails.text).toContain("Appended content");
    });

    it("prepends content to DOCX", async () => {
      // Create initial file
      const filePath = path.join(tempDir, "edit-prepend.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Original content" }],
        },
      });

      // Prepend content
      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
        operations: [
          {
            type: "prepend",
            content: {
              paragraphs: [{ text: "Prepended header", heading: 1 }],
            },
          },
        ],
      });

      const details = result.details as { success: boolean };
      expect(details.success).toBe(true);

      // Verify prepended content appears before original
      const readResult = await tool.execute("call3", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      const prependIndex = readDetails.text.indexOf("Prepended header");
      const originalIndex = readDetails.text.indexOf("Original content");
      expect(prependIndex).toBeLessThan(originalIndex);
    });

    it("applies multiple operations in sequence", async () => {
      const filePath = path.join(tempDir, "edit-multi.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Middle content" }],
        },
      });

      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
        operations: [
          {
            type: "prepend",
            content: { paragraphs: [{ text: "First" }] },
          },
          {
            type: "append",
            content: { paragraphs: [{ text: "Last" }] },
          },
        ],
      });

      const details = result.details as { operationsApplied: number };
      expect(details.operationsApplied).toBe(2);

      const readResult = await tool.execute("call3", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      const firstIndex = readDetails.text.indexOf("First");
      const middleIndex = readDetails.text.indexOf("Middle content");
      const lastIndex = readDetails.text.indexOf("Last");
      expect(firstIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(lastIndex);
    });

    it("returns error when editing non-existent file", async () => {
      const filePath = path.join(tempDir, "edit-missing.docx");
      const result = await tool.execute("call1", {
        action: "edit",
        path: filePath,
        operations: [
          {
            type: "append",
            content: { paragraphs: [{ text: "New content" }] },
          },
        ],
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toMatch(/ENOENT|no such file/i);
    });

    it("edits DOCX files containing tables (preserves formatting)", async () => {
      const filePath = path.join(tempDir, "edit-with-table.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: {
          paragraphs: [{ text: "Original paragraph" }],
          tables: [
            {
              rows: [
                ["Header 1", "Header 2"],
                ["Row 1", "Row 2"],
              ],
            },
          ],
        },
      });

      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
        operations: [
          {
            type: "append",
            content: { paragraphs: [{ text: "Appended content" }] },
          },
        ],
      });

      const details = result.details as { success: boolean; operationsApplied: number };
      expect(details.success).toBe(true);
      expect(details.operationsApplied).toBe(1);

      // Verify both original and appended content exist
      const readResult = await tool.execute("call3", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { text: string };
      expect(readDetails.text).toContain("Original paragraph");
      expect(readDetails.text).toContain("Header 1");
      expect(readDetails.text).toContain("Appended content");
    });

    it("returns error when operations array is empty", async () => {
      const filePath = path.join(tempDir, "edit-empty-ops.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: { paragraphs: [{ text: "Content" }] },
      });

      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
        operations: [],
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toContain("operations array is required");
    });

    it("returns error when operations is missing", async () => {
      const filePath = path.join(tempDir, "edit-no-ops.docx");
      await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: { paragraphs: [{ text: "Content" }] },
      });

      const result = await tool.execute("call2", {
        action: "edit",
        path: filePath,
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toContain("operations array is required");
    });
  });

  describe("error handling", () => {
    it("returns error for missing path parameter", async () => {
      await expect(
        tool.execute("call1", {
          action: "create",
          content: { paragraphs: [{ text: "Test" }] },
        }),
      ).rejects.toThrow(/path required/i);
    });

    it("returns error for missing action parameter", async () => {
      const filePath = path.join(tempDir, "test.docx");
      await expect(
        tool.execute("call1", {
          path: filePath,
          content: { paragraphs: [{ text: "Test" }] },
        }),
      ).rejects.toThrow(/action required/i);
    });
  });

  describe("round-trip test", () => {
    it("creates, reads, and verifies content matches", async () => {
      const filePath = path.join(tempDir, "roundtrip.docx");
      const originalContent = {
        paragraphs: [
          { text: "Document Title", heading: 1 },
          { text: "This is a test document with various content." },
          { text: "Bold section", bold: true },
          { text: "Italic section", italic: true },
        ],
        tables: [
          {
            rows: [
              ["Column A", "Column B"],
              ["Value 1", "Value 2"],
            ],
          },
        ],
      };

      // Create
      const createResult = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: originalContent,
      });
      expect((createResult.details as { success: boolean }).success).toBe(true);

      // Read
      const readResult = await tool.execute("call2", {
        action: "read",
        path: filePath,
      });
      const readDetails = readResult.details as { success: boolean; text: string };
      expect(readDetails.success).toBe(true);

      // Verify all content is present
      expect(readDetails.text).toContain("Document Title");
      expect(readDetails.text).toContain("This is a test document");
      expect(readDetails.text).toContain("Bold section");
      expect(readDetails.text).toContain("Italic section");
      expect(readDetails.text).toContain("Column A");
      expect(readDetails.text).toContain("Value 1");
    });
  });

  describe("path resolution", () => {
    it("resolves relative paths", async () => {
      // Use tempDir as base and provide a relative-ish absolute path
      const filePath = path.join(tempDir, "relative.docx");
      const result = await tool.execute("call1", {
        action: "create",
        path: filePath,
        content: { paragraphs: [{ text: "Test" }] },
      });

      const details = result.details as { success: boolean; path: string };
      expect(details.success).toBe(true);
      expect(path.isAbsolute(details.path)).toBe(true);
    });
  });

  describe("sandbox guard", () => {
    it("blocks paths outside the sandbox root", async () => {
      const sandboxRoot = path.join(tempDir, "sandbox-root");
      await fs.mkdir(sandboxRoot, { recursive: true });
      const sandboxedTool = createDocxTool({ sandboxRoot });
      const result = await sandboxedTool.execute("call1", {
        action: "create",
        path: path.join(tempDir, "escape.docx"),
        content: { paragraphs: [{ text: "Sandboxed content" }] },
      });

      const details = result.details as { success: boolean; error: string };
      expect(details.success).toBe(false);
      expect(details.error).toContain("Path escapes sandbox root");
    });

    it("resolves relative paths within the sandbox root", async () => {
      const sandboxRoot = path.join(tempDir, "sandbox-root-2");
      await fs.mkdir(sandboxRoot, { recursive: true });
      const sandboxedTool = createDocxTool({ sandboxRoot });
      const result = await sandboxedTool.execute("call1", {
        action: "create",
        path: path.join("nested", "sandboxed.docx"),
        content: { paragraphs: [{ text: "Sandboxed content" }] },
      });

      const details = result.details as { success: boolean; path: string };
      const expectedPath = path.join(sandboxRoot, "nested", "sandboxed.docx");
      expect(details.success).toBe(true);
      expect(details.path).toBe(expectedPath);
      expect(await fs.stat(expectedPath)).toBeDefined();
    });
  });

  describe("tool metadata", () => {
    it("has correct name and label", () => {
      expect(tool.name).toBe("docx");
      expect(tool.label).toBe("DOCX");
    });

    it("has description", () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description).toContain("create");
      expect(tool.description).toContain("read");
      expect(tool.description).toContain("edit");
    });

    it("has parameters schema", () => {
      expect(tool.parameters).toBeDefined();
    });
  });
});
