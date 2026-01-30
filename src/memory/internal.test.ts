import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  chunkMarkdown,
  isOldMemoryFormat,
  listMemoryFiles,
  migrateAllMemoryFiles,
  migrateMemoryFile,
  normalizeExtraMemoryPaths,
} from "./internal.js";

describe("normalizeExtraMemoryPaths", () => {
  it("trims, resolves, and dedupes paths", () => {
    const workspaceDir = path.join(os.tmpdir(), "memory-test-workspace");
    const absPath = path.resolve(path.sep, "shared-notes");
    const result = normalizeExtraMemoryPaths(workspaceDir, [
      " notes ",
      "./notes",
      absPath,
      absPath,
      "",
    ]);
    expect(result).toEqual([path.resolve(workspaceDir, "notes"), absPath]);
  });
});

describe("listMemoryFiles", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("includes files from additional paths (directory)", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Default memory");
    const extraDir = path.join(tmpDir, "extra-notes");
    await fs.mkdir(extraDir, { recursive: true });
    await fs.writeFile(path.join(extraDir, "note1.md"), "# Note 1");
    await fs.writeFile(path.join(extraDir, "note2.md"), "# Note 2");
    await fs.writeFile(path.join(extraDir, "ignore.txt"), "Not a markdown file");

    const files = await listMemoryFiles(tmpDir, [extraDir]);
    expect(files).toHaveLength(3);
    expect(files.some((file) => file.endsWith("MEMORY.md"))).toBe(true);
    expect(files.some((file) => file.endsWith("note1.md"))).toBe(true);
    expect(files.some((file) => file.endsWith("note2.md"))).toBe(true);
    expect(files.some((file) => file.endsWith("ignore.txt"))).toBe(false);
  });

  it("includes files from additional paths (single file)", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Default memory");
    const singleFile = path.join(tmpDir, "standalone.md");
    await fs.writeFile(singleFile, "# Standalone");

    const files = await listMemoryFiles(tmpDir, [singleFile]);
    expect(files).toHaveLength(2);
    expect(files.some((file) => file.endsWith("standalone.md"))).toBe(true);
  });

  it("handles relative paths in additional paths", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Default memory");
    const extraDir = path.join(tmpDir, "subdir");
    await fs.mkdir(extraDir, { recursive: true });
    await fs.writeFile(path.join(extraDir, "nested.md"), "# Nested");

    const files = await listMemoryFiles(tmpDir, ["subdir"]);
    expect(files).toHaveLength(2);
    expect(files.some((file) => file.endsWith("nested.md"))).toBe(true);
  });

  it("ignores non-existent additional paths", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Default memory");

    const files = await listMemoryFiles(tmpDir, ["/does/not/exist"]);
    expect(files).toHaveLength(1);
  });

  it("ignores symlinked files and directories", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Default memory");
    const extraDir = path.join(tmpDir, "extra");
    await fs.mkdir(extraDir, { recursive: true });
    await fs.writeFile(path.join(extraDir, "note.md"), "# Note");

    const targetFile = path.join(tmpDir, "target.md");
    await fs.writeFile(targetFile, "# Target");
    const linkFile = path.join(extraDir, "linked.md");

    const targetDir = path.join(tmpDir, "target-dir");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "nested.md"), "# Nested");
    const linkDir = path.join(tmpDir, "linked-dir");

    let symlinksOk = true;
    try {
      await fs.symlink(targetFile, linkFile, "file");
      await fs.symlink(targetDir, linkDir, "dir");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        symlinksOk = false;
      } else {
        throw err;
      }
    }

    const files = await listMemoryFiles(tmpDir, [extraDir, linkDir]);
    expect(files.some((file) => file.endsWith("note.md"))).toBe(true);
    if (symlinksOk) {
      expect(files.some((file) => file.endsWith("linked.md"))).toBe(false);
      expect(files.some((file) => file.endsWith("nested.md"))).toBe(false);
    }
  });
});

describe("chunkMarkdown", () => {
  it("splits overly long lines into max-sized chunks", () => {
    const chunkTokens = 400;
    const maxChars = chunkTokens * 4;
    const content = "a".repeat(maxChars * 3 + 25);
    const chunks = chunkMarkdown(content, { tokens: chunkTokens, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
    }
  });
});

describe("isOldMemoryFormat", () => {
  it("matches old-format date files", () => {
    expect(isOldMemoryFormat("memory/2025-01-27.md")).toBe(true);
    expect(isOldMemoryFormat("memory/2024-12-31.md")).toBe(true);
    expect(isOldMemoryFormat("memory/2023-06-15.md")).toBe(true);
  });

  it("matches old-format date files with slugs", () => {
    expect(isOldMemoryFormat("memory/2025-01-27-discussion.md")).toBe(true);
    expect(isOldMemoryFormat("memory/2025-01-27-bug-fix.md")).toBe(true);
    expect(isOldMemoryFormat("memory/2024-12-31-year-end.md")).toBe(true);
  });

  it("does not match new hierarchical format", () => {
    expect(isOldMemoryFormat("memory/2025/01/2025-01-27.md")).toBe(false);
    expect(isOldMemoryFormat("memory/2025/01/2025-01-27-discussion.md")).toBe(false);
    expect(isOldMemoryFormat("memory/2024/12/2024-12-31.md")).toBe(false);
  });

  it("does not match MEMORY.md or memory.md", () => {
    expect(isOldMemoryFormat("MEMORY.md")).toBe(false);
    expect(isOldMemoryFormat("memory.md")).toBe(false);
  });

  it("does not match invalid date patterns", () => {
    expect(isOldMemoryFormat("memory/2025-1-27.md")).toBe(false); // single digit month
    expect(isOldMemoryFormat("memory/25-01-27.md")).toBe(false); // 2-digit year
    expect(isOldMemoryFormat("memory/2025-01-27")).toBe(false); // no .md extension
    expect(isOldMemoryFormat("memory/2025-01-27.txt")).toBe(false); // wrong extension
    expect(isOldMemoryFormat("memory/notes/2025-01-27.md")).toBe(false); // subdirectory
  });

  it("does not match files outside memory directory", () => {
    expect(isOldMemoryFormat("2025-01-27.md")).toBe(false);
    expect(isOldMemoryFormat("notes/2025-01-27.md")).toBe(false);
  });
});

describe("migrateMemoryFile", () => {
  let tempDir: string;
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-migration-test-"));
    await fs.mkdir(path.join(tempDir, "memory"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("migrates old-format file to new location", async () => {
    const oldPath = path.join(tempDir, "memory", "2025-01-27.md");
    await fs.writeFile(oldPath, "# Test content\n", "utf-8");

    const result = await migrateMemoryFile(oldPath, tempDir, logger);

    expect(result.status).toBe("migrated");
    expect(result.path).toBe(path.join(tempDir, "memory", "2025", "01", "2025-01-27.md"));

    // Verify new file exists
    const newContent = await fs.readFile(result.path, "utf-8");
    expect(newContent).toBe("# Test content\n");

    // Verify old file still exists (backup)
    const oldExists = await fs
      .access(oldPath)
      .then(() => true)
      .catch(() => false);
    expect(oldExists).toBe(true);
  });

  it("migrates file with slug", async () => {
    const oldPath = path.join(tempDir, "memory", "2025-01-27-discussion.md");
    await fs.writeFile(oldPath, "# Discussion\n", "utf-8");

    const result = await migrateMemoryFile(oldPath, tempDir, logger);

    expect(result.status).toBe("migrated");
    expect(result.path).toBe(
      path.join(tempDir, "memory", "2025", "01", "2025-01-27-discussion.md"),
    );
  });

  it("skips migration if new file already exists", async () => {
    const oldPath = path.join(tempDir, "memory", "2025-01-27.md");
    const newPath = path.join(tempDir, "memory", "2025", "01", "2025-01-27.md");

    await fs.writeFile(oldPath, "# Old content\n", "utf-8");
    await fs.mkdir(path.join(tempDir, "memory", "2025", "01"), { recursive: true });
    await fs.writeFile(newPath, "# New content\n", "utf-8");

    const result = await migrateMemoryFile(oldPath, tempDir, logger);

    expect(result.status).toBe("skipped");
    expect(result.path).toBe(newPath);

    // Verify new file was not overwritten
    const content = await fs.readFile(newPath, "utf-8");
    expect(content).toBe("# New content\n");
  });

  it("fails for invalid filename format", async () => {
    const oldPath = path.join(tempDir, "memory", "invalid-file.md");
    await fs.writeFile(oldPath, "# Content\n", "utf-8");

    const result = await migrateMemoryFile(oldPath, tempDir, logger);

    expect(result.status).toBe("failed");
  });

  it("fails for invalid date", async () => {
    const oldPath = path.join(tempDir, "memory", "2025-13-40.md");
    await fs.writeFile(oldPath, "# Content\n", "utf-8");

    const result = await migrateMemoryFile(oldPath, tempDir, logger);

    expect(result.status).toBe("failed");
  });

  it("handles multiple migrations to same target gracefully (race condition)", async () => {
    const oldPath1 = path.join(tempDir, "memory", "2025-01-27.md");
    const oldPath2 = path.join(tempDir, "memory-copy", "2025-01-27.md");

    await fs.writeFile(oldPath1, "# First\n", "utf-8");
    await fs.mkdir(path.join(tempDir, "memory-copy"), { recursive: true });
    await fs.writeFile(oldPath2, "# Second\n", "utf-8");

    // Simulate concurrent migrations
    const [result1, result2] = await Promise.all([
      migrateMemoryFile(oldPath1, tempDir, logger),
      migrateMemoryFile(oldPath2, tempDir, logger),
    ]);

    // One should succeed, one should skip or fail
    const statuses = [result1.status, result2.status].sort();
    expect(statuses).toContain("migrated");
    expect(statuses.some((s) => s === "skipped" || s === "failed")).toBe(true);
  });
});

describe("migrateAllMemoryFiles", () => {
  let tempDir: string;
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-migration-all-test-"));
    await fs.mkdir(path.join(tempDir, "memory"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("migrates all old-format files", async () => {
    // Create old-format files
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-27.md"), "# Day 1\n", "utf-8");
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-28.md"), "# Day 2\n", "utf-8");
    await fs.writeFile(
      path.join(tempDir, "memory", "2025-01-29-discussion.md"),
      "# Discussion\n",
      "utf-8",
    );

    const result = await migrateAllMemoryFiles(tempDir, { logger });

    expect(result.migrated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.migratedFiles).toHaveLength(3);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify new files exist
    const file1Exists = await fs
      .access(path.join(tempDir, "memory", "2025", "01", "2025-01-27.md"))
      .then(() => true)
      .catch(() => false);
    const file2Exists = await fs
      .access(path.join(tempDir, "memory", "2025", "01", "2025-01-28.md"))
      .then(() => true)
      .catch(() => false);
    const file3Exists = await fs
      .access(path.join(tempDir, "memory", "2025", "01", "2025-01-29-discussion.md"))
      .then(() => true)
      .catch(() => false);
    expect(file1Exists).toBe(true);
    expect(file2Exists).toBe(true);
    expect(file3Exists).toBe(true);
  });

  it("only migrates files directly in memory/ not in subdirectories", async () => {
    // Create files: one in memory/ root (old format), one in subdirectory (user custom, should not migrate)
    await fs.mkdir(path.join(tempDir, "memory", "archive"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-27.md"), "# Root\n", "utf-8");
    await fs.writeFile(
      path.join(tempDir, "memory", "archive", "2024-12-31.md"),
      "# Archived\n",
      "utf-8",
    );

    const result = await migrateAllMemoryFiles(tempDir, { logger });

    // Only the root file should be migrated
    expect(result.migrated).toBe(1);
    expect(result.migratedFiles).toContain("memory/2025/01/2025-01-27.md");
    expect(result.migratedFiles).not.toContain("memory/2024/12/2024-12-31.md");

    // Archived file should still exist in original location
    const archivedExists = await fs
      .access(path.join(tempDir, "memory", "archive", "2024-12-31.md"))
      .then(() => true)
      .catch(() => false);
    expect(archivedExists).toBe(true);
  });

  it("skips year directories (new format)", async () => {
    // Create new-format files (should be skipped)
    await fs.mkdir(path.join(tempDir, "memory", "2025", "01"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "memory", "2025", "01", "2025-01-27.md"),
      "# New format\n",
      "utf-8",
    );

    // Create old-format file
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-28.md"), "# Old format\n", "utf-8");

    const result = await migrateAllMemoryFiles(tempDir, { logger });

    expect(result.migrated).toBe(1);
    expect(result.migratedFiles).toEqual(["memory/2025/01/2025-01-28.md"]);
  });

  it("handles dry-run mode without actual migration", async () => {
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-27.md"), "# Test\n", "utf-8");

    const result = await migrateAllMemoryFiles(tempDir, { dryRun: true, logger });

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify file was NOT migrated
    const newExists = await fs
      .access(path.join(tempDir, "memory", "2025", "01", "2025-01-27.md"))
      .then(() => true)
      .catch(() => false);
    expect(newExists).toBe(false);
  });

  it("returns empty result if no memory directory", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-"));

    const result = await migrateAllMemoryFiles(emptyDir, { logger });

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.migratedFiles).toEqual([]);

    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it("tracks failed migrations", async () => {
    // Create invalid date file
    await fs.writeFile(path.join(tempDir, "memory", "2025-99-99.md"), "# Invalid\n", "utf-8");

    const result = await migrateAllMemoryFiles(tempDir, { logger });

    expect(result.failed).toBe(1);
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.path).toBe("memory/2025-99-99.md");
  });

  it("calculates total bytes migrated", async () => {
    const content1 = "# Content 1\n".repeat(100);
    const content2 = "# Content 2\n".repeat(200);

    await fs.writeFile(path.join(tempDir, "memory", "2025-01-27.md"), content1, "utf-8");
    await fs.writeFile(path.join(tempDir, "memory", "2025-01-28.md"), content2, "utf-8");

    const result = await migrateAllMemoryFiles(tempDir, { logger });

    const expectedBytes =
      Buffer.byteLength(content1, "utf-8") + Buffer.byteLength(content2, "utf-8");
    expect(result.totalBytes).toBe(expectedBytes);
  });
});
