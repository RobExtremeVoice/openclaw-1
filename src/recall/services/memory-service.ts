import fs from "node:fs/promises";
import path from "node:path";

import type { ClawdbotConfig } from "../../config/config.js";
import {
  getMemorySearchManager,
  type MemoryIndexManager,
  type MemorySearchResult,
} from "../../memory/index.js";
import type {
  FileInfo,
  MemoryChunkRecord,
  MemorySource,
  SearchResult,
  StatusResponse,
} from "../types.js";
import { createFileService, type FileService } from "./file-service.js";

export interface MemoryServiceOptions {
  cfg: ClawdbotConfig;
  agentId: string;
}

/**
 * Service wrapper around MemoryIndexManager for the Recall UI
 */
export class MemoryService {
  private manager: MemoryIndexManager | null = null;
  private fileService: FileService | null = null;
  private readonly cfg: ClawdbotConfig;
  private readonly agentId: string;
  private initError: string | null = null;

  constructor(options: MemoryServiceOptions) {
    this.cfg = options.cfg;
    this.agentId = options.agentId;
  }

  async init(): Promise<void> {
    const result = await getMemorySearchManager({
      cfg: this.cfg,
      agentId: this.agentId,
    });
    if (!result.manager) {
      this.initError = result.error ?? "Memory search unavailable";
      return;
    }
    this.manager = result.manager;
    const status = this.manager.status();
    this.fileService = createFileService(status.workspaceDir);
  }

  isAvailable(): boolean {
    return this.manager !== null;
  }

  getError(): string | null {
    return this.initError;
  }

  getStatus(): StatusResponse {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    const status = this.manager.status();
    return {
      files: status.files,
      chunks: status.chunks,
      dirty: status.dirty,
      workspaceDir: status.workspaceDir,
      provider: status.provider,
      model: status.model,
      sources: status.sources,
      sourceCounts: status.sourceCounts,
      vector: {
        enabled: status.vector?.enabled ?? false,
        available: status.vector?.available ?? false,
        dims: status.vector?.dims,
      },
      fts: {
        enabled: status.fts?.enabled ?? false,
        available: status.fts?.available ?? false,
      },
    };
  }

  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number },
  ): Promise<SearchResult[]> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    const results = await this.manager.search(query, options);
    return results.map((r: MemorySearchResult) => ({
      id: this.buildChunkId(r),
      path: r.path,
      source: r.source,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.score,
      snippet: r.snippet,
    }));
  }

  async listMemories(options: {
    page?: number;
    limit?: number;
    source?: MemorySource;
  }): Promise<{ memories: MemoryChunkRecord[]; total: number }> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    const status = this.manager.status();
    const _page = options.page ?? 1;
    const _limit = Math.min(options.limit ?? 50, 200);

    // Note: MemoryIndexManager doesn't expose direct database access
    // For the initial implementation, return the total count from status
    // Full list implementation would require database schema access
    return {
      memories: [],
      total: status.chunks,
    };
  }

  async getMemory(id: string): Promise<MemoryChunkRecord | null> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    // Parse the ID to extract chunk info
    const parts = id.split(":");
    if (parts.length < 4) return null;

    // Note: Full implementation would require database access
    return null;
  }

  async listFiles(): Promise<FileInfo[]> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    // Note: Full implementation would query the files table
    return [];
  }

  async readFile(relPath: string): Promise<{ text: string; path: string }> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    return this.manager.readFile({ relPath });
  }

  async writeFile(relPath: string, content: string): Promise<{ success: boolean; error?: string }> {
    if (!this.fileService) {
      return { success: false, error: "File service not initialized" };
    }
    return this.fileService.writeFile(relPath, content);
  }

  async updateMemory(
    id: string,
    newContent: string,
  ): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
    if (!this.manager || !this.fileService) {
      return { success: false, error: "Service not initialized" };
    }

    // Parse the chunk ID to get file path and line numbers
    const parts = id.split(":");
    if (parts.length < 4) {
      return { success: false, error: "Invalid memory ID", notFound: true };
    }

    const [source, ...pathParts] = parts;
    // Reconstruct path (may contain colons)
    const pathAndLines = pathParts.join(":");
    const lineMatch = pathAndLines.match(/^(.+):(\d+):(\d+)$/);
    if (!lineMatch) {
      return { success: false, error: "Invalid memory ID format", notFound: true };
    }

    const [, filePath, startLineStr, endLineStr] = lineMatch;
    const startLine = Number.parseInt(startLineStr, 10);
    const endLine = Number.parseInt(endLineStr, 10);

    // Only allow editing memory source files
    if (source !== "memory") {
      return { success: false, error: "Can only edit memory source files" };
    }

    const result = await this.fileService.updateLines(filePath, startLine, endLine, newContent);
    if (result.success) {
      // Trigger reindex
      void this.manager.sync({ reason: "recall-edit" }).catch(() => {});
    }
    return result;
  }

  async deleteMemory(
    id: string,
  ): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
    if (!this.manager || !this.fileService) {
      return { success: false, error: "Service not initialized" };
    }

    // Parse the chunk ID
    const parts = id.split(":");
    if (parts.length < 4) {
      return { success: false, error: "Invalid memory ID", notFound: true };
    }

    const [source, ...pathParts] = parts;
    const pathAndLines = pathParts.join(":");
    const lineMatch = pathAndLines.match(/^(.+):(\d+):(\d+)$/);
    if (!lineMatch) {
      return { success: false, error: "Invalid memory ID format", notFound: true };
    }

    const [, filePath, startLineStr, endLineStr] = lineMatch;
    const startLine = Number.parseInt(startLineStr, 10);
    const endLine = Number.parseInt(endLineStr, 10);

    // Only allow deleting from memory source files
    if (source !== "memory") {
      return { success: false, error: "Can only delete from memory source files" };
    }

    const result = await this.fileService.deleteLines(filePath, startLine, endLine);
    if (result.success) {
      // Trigger reindex
      void this.manager.sync({ reason: "recall-delete" }).catch(() => {});
    }
    return result;
  }

  async sync(options?: {
    force?: boolean;
    progress?: (update: { completed: number; total: number; label?: string }) => void;
  }): Promise<void> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }
    await this.manager.sync({
      reason: "recall-ui",
      force: options?.force,
      progress: options?.progress,
    });
  }

  async exportMemories(format: "json" | "md"): Promise<string> {
    if (!this.manager) {
      throw new Error(this.initError ?? "Memory service not initialized");
    }

    const status = this.manager.status();
    const workspaceDir = status.workspaceDir;

    // Read MEMORY.md and memory/*.md files
    const memoryFiles: string[] = [];

    // Check for MEMORY.md
    const mainMemoryPath = path.join(workspaceDir, "MEMORY.md");
    try {
      const content = await fs.readFile(mainMemoryPath, "utf-8");
      memoryFiles.push(content);
    } catch {
      // File doesn't exist
    }

    // Check memory directory
    const memoryDir = path.join(workspaceDir, "memory");
    try {
      const entries = await fs.readdir(memoryDir);
      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const content = await fs.readFile(path.join(memoryDir, entry), "utf-8");
          memoryFiles.push(`# ${entry}\n\n${content}`);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    if (format === "md") {
      return memoryFiles.join("\n\n---\n\n");
    }

    // JSON format
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        agentId: this.agentId,
        workspaceDir,
        stats: {
          files: status.files,
          chunks: status.chunks,
        },
        content: memoryFiles,
      },
      null,
      2,
    );
  }

  async close(): Promise<void> {
    if (this.manager) {
      await this.manager.close();
      this.manager = null;
    }
  }

  private buildChunkId(result: MemorySearchResult): string {
    // Create a deterministic ID from the chunk properties
    return `${result.source}:${result.path}:${result.startLine}:${result.endLine}`;
  }
}

/**
 * Create a memory service instance
 */
export async function createMemoryService(
  cfg: ClawdbotConfig,
  agentId: string,
): Promise<MemoryService> {
  const service = new MemoryService({ cfg, agentId });
  await service.init();
  return service;
}
