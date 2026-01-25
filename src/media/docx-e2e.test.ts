import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { afterEach, describe, expect, it } from "vitest";

import { createDocxTool } from "../agents/tools/docx-tool.js";
import { extractFileContentFromSource, type InputFileLimits } from "./input-files.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Type for tool result details
type ToolResultDetails = {
  success: boolean;
  action?: string;
  path?: string;
  text?: string;
  html?: string;
  messages?: string[];
  operationsApplied?: number;
  error?: string;
};

/**
 * Create a temp directory for test files.
 */
async function createTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Create default input file limits for DOCX.
 */
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

/**
 * Create a test DOCX with paragraphs.
 */
async function createTestDocxWithParagraphs(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map((text) => new Paragraph({ children: [new TextRun(text)] })),
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Create a test DOCX with paragraphs and a table.
 */
async function createTestDocxWithTable(
  paragraphs: string[],
  tableData: string[][],
): Promise<Buffer> {
  const paragraphElements = paragraphs.map(
    (text) => new Paragraph({ children: [new TextRun(text)] }),
  );

  const tableRows = tableData.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(cell)] })],
            }),
        ),
      }),
  );

  const table = new Table({ rows: tableRows });

  const doc = new Document({
    sections: [
      {
        children: [...paragraphElements, table],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

describe("DOCX E2E flow", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tempDirs = [];
  });

  describe("inbound flow: extract content from DOCX attachment", () => {
    it("extracts text content from inbound DOCX with paragraphs", async () => {
      const paragraphs = [
        "Welcome to the quarterly report.",
        "This document contains important information.",
        "Please review the following sections carefully.",
      ];
      const docxBuffer = await createTestDocxWithParagraphs(paragraphs);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: docxBuffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "quarterly-report.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(result.filename).toBe("quarterly-report.docx");
      expect(result.text).toBeDefined();
      for (const para of paragraphs) {
        expect(result.text).toContain(para);
      }
      expect(result.images).toBeUndefined();
    });

    it("extracts text content from inbound DOCX with table data", async () => {
      const paragraphs = ["Product Sales Report"];
      const tableData = [
        ["Product", "Q1", "Q2", "Q3"],
        ["Widget A", "100", "150", "200"],
        ["Widget B", "50", "75", "100"],
      ];
      const docxBuffer = await createTestDocxWithTable(paragraphs, tableData);

      const result = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: docxBuffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "sales-report.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(result.filename).toBe("sales-report.docx");
      expect(result.text).toBeDefined();
      expect(result.text).toContain("Product Sales Report");
      // mammoth extracts table cells as text
      expect(result.text).toContain("Widget A");
      expect(result.text).toContain("100");
      expect(result.text).toContain("150");
    });
  });

  describe("outbound flow: create DOCX via tool", () => {
    it("creates a new DOCX file with paragraphs via docx tool", async () => {
      const tempDir = await createTempDir("docx-e2e-outbound-");
      tempDirs.push(tempDir);
      const outputPath = path.join(tempDir, "output.docx");

      const tool = createDocxTool();
      const result = await tool.execute("test-call-1", {
        action: "create",
        path: outputPath,
        content: {
          paragraphs: [
            { text: "Meeting Notes", heading: 1 },
            { text: "Attendees discussed the project timeline." },
            { text: "Action items were assigned.", bold: true },
          ],
        },
      });

      const details = result.details as ToolResultDetails;
      expect(details.success).toBe(true);
      expect(details.action).toBe("create");

      // Verify file exists
      const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read back and verify content
      const readResult = await tool.execute("test-call-2", {
        action: "read",
        path: outputPath,
      });
      const readDetails = readResult.details as ToolResultDetails;
      expect(readDetails.text).toContain("Meeting Notes");
      expect(readDetails.text).toContain("Attendees discussed the project timeline");
      expect(readDetails.text).toContain("Action items were assigned");
    });

    it("creates a DOCX file with table via docx tool", async () => {
      const tempDir = await createTempDir("docx-e2e-table-");
      tempDirs.push(tempDir);
      const outputPath = path.join(tempDir, "table-output.docx");

      const tool = createDocxTool();
      const result = await tool.execute("test-call-3", {
        action: "create",
        path: outputPath,
        content: {
          paragraphs: [{ text: "Data Table", heading: 2 }],
          tables: [
            {
              rows: [
                ["Name", "Age", "City"],
                ["Alice", "30", "New York"],
                ["Bob", "25", "San Francisco"],
              ],
            },
          ],
        },
      });

      const details = result.details as ToolResultDetails;
      expect(details.success).toBe(true);

      // Read back and verify table content
      const readResult = await tool.execute("test-call-4", {
        action: "read",
        path: outputPath,
      });
      const readDetails = readResult.details as ToolResultDetails;
      expect(readDetails.text).toContain("Data Table");
      expect(readDetails.text).toContain("Alice");
      expect(readDetails.text).toContain("San Francisco");
    });
  });

  describe("full round-trip: extract, modify, create", () => {
    it("receives DOCX, extracts content, creates modified DOCX", async () => {
      const tempDir = await createTempDir("docx-e2e-roundtrip-");
      tempDirs.push(tempDir);

      // Step 1: Create input DOCX (simulating inbound attachment)
      const inputParagraphs = [
        "Original Document Title",
        "This is the first paragraph of the original document.",
        "This is the second paragraph with important data.",
      ];
      const inputTableData = [
        ["Item", "Value"],
        ["Alpha", "10"],
        ["Beta", "20"],
      ];
      const inputBuffer = await createTestDocxWithTable(inputParagraphs, inputTableData);

      // Step 2: Extract content via extractFileContentFromSource (inbound flow)
      const extractedResult = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: inputBuffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "input-document.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(extractedResult.text).toContain("Original Document Title");
      expect(extractedResult.text).toContain("Alpha");
      expect(extractedResult.text).toContain("10");

      // Step 3: Process extracted content (simulate agent processing)
      const extractedText = extractedResult.text ?? "";
      const processedParagraphs = [
        "Processed Document Title",
        `Summary: The original document contained ${extractedText.length} characters.`,
        "The following modifications have been applied:",
        "- Added processing summary",
        "- Updated table with new values",
      ];

      // Step 4: Create output DOCX via docx tool (outbound flow)
      const outputPath = path.join(tempDir, "processed-output.docx");
      const tool = createDocxTool();
      const createResult = await tool.execute("test-roundtrip-1", {
        action: "create",
        path: outputPath,
        content: {
          paragraphs: processedParagraphs.map((text, index) => ({
            text,
            heading: index === 0 ? 1 : undefined,
          })),
          tables: [
            {
              rows: [
                ["Item", "Original", "Modified"],
                ["Alpha", "10", "15"],
                ["Beta", "20", "25"],
                ["Gamma", "N/A", "30"],
              ],
            },
          ],
        },
      });

      const createDetails = createResult.details as ToolResultDetails;
      expect(createDetails.success).toBe(true);

      // Step 5: Verify the output DOCX can be read back correctly
      const readResult = await tool.execute("test-roundtrip-2", {
        action: "read",
        path: outputPath,
      });
      const readDetails = readResult.details as ToolResultDetails;
      expect(readDetails.text).toContain("Processed Document Title");
      expect(readDetails.text).toContain("Summary");
      expect(readDetails.text).toContain("modifications have been applied");
      expect(readDetails.text).toContain("Gamma");
      expect(readDetails.text).toContain("30");

      // Step 6: Also verify via extractFileContentFromSource (full loop)
      const outputBuffer = await fs.readFile(outputPath);
      const finalExtract = await extractFileContentFromSource({
        source: {
          type: "base64",
          data: outputBuffer.toString("base64"),
          mediaType: DOCX_MIME,
          filename: "processed-output.docx",
        },
        limits: createDefaultLimits(),
      });

      expect(finalExtract.text).toContain("Processed Document Title");
      expect(finalExtract.text).toContain("Gamma");
    });

    it("edits existing DOCX by appending content", async () => {
      const tempDir = await createTempDir("docx-e2e-edit-");
      tempDirs.push(tempDir);

      // Step 1: Create initial DOCX
      const initialPath = path.join(tempDir, "editable.docx");
      const tool = createDocxTool();
      await tool.execute("test-edit-1", {
        action: "create",
        path: initialPath,
        content: {
          paragraphs: [
            { text: "Initial Content", heading: 1 },
            { text: "This is the original paragraph." },
          ],
        },
      });

      // Step 2: Edit DOCX by appending new content
      const editResult = await tool.execute("test-edit-2", {
        action: "edit",
        path: initialPath,
        operations: [
          {
            type: "append",
            content: {
              paragraphs: [
                { text: "Appended Section", heading: 2 },
                { text: "This content was appended later.", italic: true },
              ],
            },
          },
        ],
      });

      const editDetails = editResult.details as ToolResultDetails;
      expect(editDetails.success).toBe(true);
      expect(editDetails.operationsApplied).toBe(1);

      // Step 3: Read back and verify both original and appended content
      const readResult = await tool.execute("test-edit-3", {
        action: "read",
        path: initialPath,
      });
      const readDetails = readResult.details as ToolResultDetails;
      expect(readDetails.text).toContain("Initial Content");
      expect(readDetails.text).toContain("original paragraph");
      expect(readDetails.text).toContain("Appended Section");
      expect(readDetails.text).toContain("appended later");
    });

    it("edits existing DOCX by prepending content", async () => {
      const tempDir = await createTempDir("docx-e2e-prepend-");
      tempDirs.push(tempDir);

      // Step 1: Create initial DOCX
      const initialPath = path.join(tempDir, "prepend-test.docx");
      const tool = createDocxTool();
      await tool.execute("test-prepend-1", {
        action: "create",
        path: initialPath,
        content: {
          paragraphs: [{ text: "Original Content" }],
        },
      });

      // Step 2: Edit DOCX by prepending new content
      const editResult = await tool.execute("test-prepend-2", {
        action: "edit",
        path: initialPath,
        operations: [
          {
            type: "prepend",
            content: {
              paragraphs: [
                { text: "Document Header", heading: 1, bold: true },
                { text: "This header was prepended." },
              ],
            },
          },
        ],
      });

      const editDetails = editResult.details as ToolResultDetails;
      expect(editDetails.success).toBe(true);

      // Step 3: Verify prepended content appears before original
      const readResult = await tool.execute("test-prepend-3", {
        action: "read",
        path: initialPath,
      });
      const readDetails = readResult.details as ToolResultDetails;
      expect(readDetails.text).toContain("Document Header");
      expect(readDetails.text).toContain("prepended");
      expect(readDetails.text).toContain("Original Content");
    });
  });

  describe("error handling in E2E flow", () => {
    it("handles extraction of corrupted DOCX gracefully", async () => {
      const corruptedData = Buffer.from("not a valid docx file at all");

      await expect(
        extractFileContentFromSource({
          source: {
            type: "base64",
            data: corruptedData.toString("base64"),
            mediaType: DOCX_MIME,
            filename: "corrupted.docx",
          },
          limits: createDefaultLimits(),
        }),
      ).rejects.toThrow();
    });

    it("handles tool create with missing content gracefully", async () => {
      const tempDir = await createTempDir("docx-e2e-error-");
      tempDirs.push(tempDir);
      const outputPath = path.join(tempDir, "error-test.docx");

      const tool = createDocxTool();
      const result = await tool.execute("test-error-1", {
        action: "create",
        path: outputPath,
        // missing content
      });

      const details = result.details as ToolResultDetails;
      expect(details.success).toBe(false);
      expect(details.error).toContain("content is required");
    });

    it("handles tool read with non-existent file gracefully", async () => {
      const tool = createDocxTool();
      const result = await tool.execute("test-error-2", {
        action: "read",
        path: "/nonexistent/path/to/file.docx",
      });

      const details = result.details as ToolResultDetails;
      expect(details.success).toBe(false);
      expect(details.error).toBeDefined();
    });

    it("handles tool edit with missing operations gracefully", async () => {
      const tempDir = await createTempDir("docx-e2e-edit-error-");
      tempDirs.push(tempDir);
      const filePath = path.join(tempDir, "edit-error-test.docx");

      // Create initial file
      const tool = createDocxTool();
      await tool.execute("test-edit-error-1", {
        action: "create",
        path: filePath,
        content: { paragraphs: [{ text: "Test" }] },
      });

      // Try to edit without operations
      const result = await tool.execute("test-edit-error-2", {
        action: "edit",
        path: filePath,
        // missing operations
      });

      const details = result.details as ToolResultDetails;
      expect(details.success).toBe(false);
      expect(details.error).toContain("operations array is required");
    });
  });
});
