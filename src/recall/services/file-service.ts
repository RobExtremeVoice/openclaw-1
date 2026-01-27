import fs from "node:fs/promises";
import path from "node:path";

/**
 * Service for file operations within a workspace boundary
 */
export class FileService {
  private readonly workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = path.resolve(workspaceDir);
  }

  /**
   * Validate and resolve a relative path within the workspace
   */
  private resolveSafePath(relPath: string): string {
    if (!relPath?.trim()) {
      throw new Error("path required");
    }

    // Normalize the path
    const normalized = path.normalize(relPath);

    // Check for path traversal attempts
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      throw new Error("path escapes workspace");
    }

    const absPath = path.resolve(this.workspaceDir, normalized);

    // Double-check it's within workspace
    if (!absPath.startsWith(this.workspaceDir + path.sep) && absPath !== this.workspaceDir) {
      throw new Error("path escapes workspace");
    }

    return absPath;
  }

  /**
   * Read a file from the workspace
   */
  async readFile(relPath: string): Promise<{ text: string; path: string }> {
    const absPath = this.resolveSafePath(relPath);
    const text = await fs.readFile(absPath, "utf-8");
    return { text, path: relPath };
  }

  /**
   * Write a file to the workspace
   */
  async writeFile(relPath: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const absPath = this.resolveSafePath(relPath);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(absPath), { recursive: true });

      await fs.writeFile(absPath, content, "utf-8");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Check if a file exists in the workspace
   */
  async exists(relPath: string): Promise<boolean> {
    try {
      const absPath = this.resolveSafePath(relPath);
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async stat(relPath: string): Promise<{
    size: number;
    mtime: number;
    isFile: boolean;
    isDirectory: boolean;
  } | null> {
    try {
      const absPath = this.resolveSafePath(relPath);
      const stats = await fs.stat(absPath);
      return {
        size: stats.size,
        mtime: stats.mtimeMs,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Update specific lines in a file
   */
  async updateLines(
    relPath: string,
    startLine: number,
    endLine: number,
    newContent: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const absPath = this.resolveSafePath(relPath);
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");

      // Lines are 1-indexed
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      const updated = [...before, ...newContent.split("\n"), ...after];

      await fs.writeFile(absPath, updated.join("\n"), "utf-8");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Delete specific lines from a file
   */
  async deleteLines(
    relPath: string,
    startLine: number,
    endLine: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const absPath = this.resolveSafePath(relPath);
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");

      // Lines are 1-indexed
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      const updated = [...before, ...after];

      await fs.writeFile(absPath, updated.join("\n"), "utf-8");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

/**
 * Create a file service for a workspace
 */
export function createFileService(workspaceDir: string): FileService {
  return new FileService(workspaceDir);
}
