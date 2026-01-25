import fs from "node:fs/promises";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import type DocxMerger from "docx-merger";

import { stringEnum } from "../schema/typebox.js";

// Lazy-load mammoth to avoid loading the dependency when not needed (e.g., create-only usage)
type MammothModule = typeof import("mammoth");
let mammothModulePromise: Promise<MammothModule> | null = null;

async function loadMammoth(): Promise<MammothModule> {
  if (!mammothModulePromise) {
    mammothModulePromise = import("mammoth").catch((err) => {
      mammothModulePromise = null;
      throw new Error(`Failed to load mammoth for DOCX reading: ${String(err)}`);
    });
  }
  return mammothModulePromise;
}

// Lazy-load docx-merger to avoid loading when not needed
let docxMergerModulePromise: Promise<typeof DocxMerger> | null = null;

async function loadDocxMerger(): Promise<typeof DocxMerger> {
  if (!docxMergerModulePromise) {
    docxMergerModulePromise = import("docx-merger")
      .then((mod) => (mod as { default?: typeof DocxMerger }).default || mod)
      .catch((err) => {
        docxMergerModulePromise = null;
        throw new Error(`Failed to load docx-merger for DOCX editing: ${String(err)}`);
      }) as Promise<typeof DocxMerger>;
  }
  return docxMergerModulePromise;
}
import { assertSandboxPath } from "../sandbox-paths.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const DOCX_ACTIONS = ["create", "read", "edit"] as const;
type DocxAction = (typeof DOCX_ACTIONS)[number];

/**
 * Schema for paragraph formatting options.
 */
const ParagraphSchema = Type.Object({
  text: Type.String({ description: "The text content of the paragraph." }),
  heading: Type.Optional(
    Type.Number({
      description: "Heading level (1-6). Omit for normal paragraph.",
      minimum: 1,
      maximum: 6,
    }),
  ),
  bold: Type.Optional(Type.Boolean({ description: "Apply bold formatting." })),
  italic: Type.Optional(Type.Boolean({ description: "Apply italic formatting." })),
  underline: Type.Optional(Type.Boolean({ description: "Apply underline formatting." })),
});

/**
 * Schema for table data.
 */
const TableSchema = Type.Object({
  rows: Type.Array(Type.Array(Type.String()), {
    description: "2D array of cell values. Each inner array is a row.",
  }),
});

/**
 * Schema for document content.
 */
const ContentSchema = Type.Object({
  paragraphs: Type.Optional(Type.Array(ParagraphSchema)),
  tables: Type.Optional(Type.Array(TableSchema)),
});

/**
 * Schema for edit operations.
 */
const EditOperationSchema = Type.Object({
  type: stringEnum(["append", "prepend"] as const, {
    description: "Type of edit operation.",
  }),
  content: ContentSchema,
});

/**
 * Main tool schema for the docx tool.
 */
const DocxToolSchema = Type.Object({
  action: stringEnum(DOCX_ACTIONS, {
    description: "The action to perform: create, read, or edit.",
  }),
  path: Type.String({ description: "Path to the DOCX file." }),
  content: Type.Optional(ContentSchema),
  operations: Type.Optional(Type.Array(EditOperationSchema)),
});

type ParagraphInput = {
  text: string;
  heading?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type TableInput = {
  rows: string[][];
};

type ContentInput = {
  paragraphs?: ParagraphInput[];
  tables?: TableInput[];
};

type EditOperationInput = {
  type: "append" | "prepend";
  content: ContentInput;
};

type DocxToolOptions = {
  sandboxRoot?: string;
};

/**
 * Map heading level number to docx HeadingLevel enum.
 */
function getHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    case 6:
      return HeadingLevel.HEADING_6;
    default:
      return HeadingLevel.HEADING_1;
  }
}

/**
 * Create a Paragraph from input specification.
 */
function createParagraph(input: ParagraphInput): Paragraph {
  const textRun = new TextRun({
    text: input.text,
    bold: input.bold,
    italics: input.italic,
    underline: input.underline ? {} : undefined,
  });

  if (input.heading && input.heading >= 1 && input.heading <= 6) {
    return new Paragraph({
      heading: getHeadingLevel(input.heading),
      children: [textRun],
    });
  }

  return new Paragraph({
    children: [textRun],
  });
}

/**
 * Create a Table from input specification.
 */
function createTable(input: TableInput): Table {
  const rows = input.rows.map(
    (rowData) =>
      new TableRow({
        children: rowData.map(
          (cellText) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(cellText)] })],
            }),
        ),
      }),
  );

  return new Table({
    rows,
  });
}

/**
 * Build document children (paragraphs and tables) from content input.
 */
function buildDocumentChildren(content: ContentInput): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  if (content.paragraphs) {
    for (const para of content.paragraphs) {
      children.push(createParagraph(para));
    }
  }

  if (content.tables) {
    for (const table of content.tables) {
      children.push(createTable(table));
    }
  }

  return children;
}

/**
 * Create a new DOCX file with the specified content.
 */
async function createDocx(filePath: string, content: ContentInput): Promise<{ path: string }> {
  const children = buildDocumentChildren(content);

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return { path: filePath };
}

/**
 * Read and extract text content from a DOCX file using mammoth.
 */
async function readDocx(
  filePath: string,
): Promise<{ path: string; text: string; html: string; messages: string[] }> {
  const mammoth = await loadMammoth();
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.convertToHtml({ buffer });
  const textResult = await mammoth.extractRawText({ buffer });

  return {
    path: filePath,
    text: textResult.value,
    html: result.value,
    messages: result.messages.map((m) => `${m.type}: ${m.message}`),
  };
}

function resolveHostPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(process.env.HOME ?? "", filePath.slice(1));
  }
  return path.resolve(filePath);
}

async function resolveDocxPath(params: {
  filePath: string;
  sandboxRoot?: string;
}): Promise<string> {
  if (params.sandboxRoot) {
    const out = await assertSandboxPath({
      filePath: params.filePath,
      cwd: params.sandboxRoot,
      root: params.sandboxRoot,
    });
    return out.resolved;
  }
  return resolveHostPath(params.filePath);
}

/**
 * Create a DOCX buffer from content input (used for merging).
 */
async function createDocxBuffer(content: ContentInput): Promise<Buffer> {
  const children = buildDocumentChildren(content);
  const doc = new Document({
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Merge DOCX files using docx-merger, returning a promise.
 */
async function mergeDocxFiles(
  files: Buffer[],
  options: { pageBreak?: boolean } = {},
): Promise<Buffer> {
  const DocxMergerClass = await loadDocxMerger();
  return new Promise((resolve, reject) => {
    try {
      // Convert Buffer to binary string as expected by docx-merger
      const binaryFiles = files.map((f) => f.toString("binary"));
      const merger = new DocxMergerClass(options, binaryFiles);
      merger.save("nodebuffer", (data: Buffer) => {
        resolve(data);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Edit an existing DOCX file by appending or prepending content.
 *
 * Uses docx-merger to preserve ALL formatting (styles, tables, images, etc.)
 * from the original document. New content is merged as separate document sections.
 */
async function editDocx(
  filePath: string,
  operations: EditOperationInput[],
): Promise<{ path: string; operationsApplied: number }> {
  // Read the original document
  const originalBuffer = await fs.readFile(filePath);

  // Separate prepend and append operations
  const prependContents: ContentInput[] = [];
  const appendContents: ContentInput[] = [];

  for (const op of operations) {
    if (op.type === "prepend") {
      prependContents.push(op.content);
    } else {
      appendContents.push(op.content);
    }
  }

  // Build the list of documents to merge in order:
  // [prepend docs...] + [original] + [append docs...]
  const documentsToMerge: Buffer[] = [];

  // Add prepend documents (in order)
  for (const content of prependContents) {
    const prependBuffer = await createDocxBuffer(content);
    documentsToMerge.push(prependBuffer);
  }

  // Add the original document
  documentsToMerge.push(originalBuffer);

  // Add append documents (in order)
  for (const content of appendContents) {
    const appendBuffer = await createDocxBuffer(content);
    documentsToMerge.push(appendBuffer);
  }

  // Merge all documents (pageBreak: false to avoid page breaks between sections)
  const mergedBuffer = await mergeDocxFiles(documentsToMerge, { pageBreak: false });

  // Write the merged document back
  await fs.writeFile(filePath, mergedBuffer);

  return { path: filePath, operationsApplied: operations.length };
}

/**
 * Create the DOCX agent tool.
 */
export function createDocxTool(options?: DocxToolOptions): AnyAgentTool {
  const sandboxRoot = options?.sandboxRoot?.trim();
  return {
    label: "DOCX",
    name: "docx",
    description:
      "Create, read, and edit Microsoft Word DOCX files. Actions: create (new document with paragraphs/tables), read (extract text/html), edit (append/prepend content to existing).",
    parameters: DocxToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as DocxAction;
      const filePath = readStringParam(params, "path", { required: true });
      let resolvedPath = "";

      try {
        resolvedPath = await resolveDocxPath({ filePath, sandboxRoot });
        switch (action) {
          case "create": {
            const content = params.content as ContentInput | undefined;
            if (!content) {
              throw new Error("content is required for create action");
            }
            const result = await createDocx(resolvedPath, content);
            return jsonResult({
              success: true,
              action: "create",
              ...result,
            });
          }

          case "read": {
            const result = await readDocx(resolvedPath);
            return jsonResult({
              success: true,
              action: "read",
              ...result,
            });
          }

          case "edit": {
            const operations = params.operations as EditOperationInput[] | undefined;
            if (!operations || operations.length === 0) {
              throw new Error("operations array is required for edit action");
            }
            const result = await editDocx(resolvedPath, operations);
            return jsonResult({
              success: true,
              action: "edit",
              ...result,
            });
          }

          default: {
            const exhaustiveCheck: never = action;
            throw new Error(`Unknown action: ${exhaustiveCheck as string}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({
          success: false,
          action,
          path: resolvedPath || filePath,
          error: message,
        });
      }
    },
  };
}
