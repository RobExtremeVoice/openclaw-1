/**
 * API types for the Recall memory manager UI
 */

export type MemorySource = "memory" | "sessions";

export interface StatusResponse {
  files: number;
  chunks: number;
  dirty: boolean;
  workspaceDir: string;
  provider: string;
  model: string;
  sources: MemorySource[];
  sourceCounts: Array<{ source: MemorySource; files: number; chunks: number }>;
  vector: { enabled: boolean; available: boolean; dims?: number };
  fts: { enabled: boolean; available: boolean };
}

export interface MemoryChunkRecord {
  id: string;
  path: string;
  source: MemorySource;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
  model: string;
  updatedAt: number;
}

export interface MemoriesListResponse {
  memories: MemoryChunkRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface MemoryDetailResponse {
  memory: MemoryChunkRecord;
  fileContent?: string;
}

export interface SearchRequest {
  query: string;
  maxResults?: number;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  path: string;
  source: MemorySource;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface FileInfo {
  path: string;
  source: MemorySource;
  size: number;
  hash: string;
  mtime: number;
  chunks: number;
}

export interface FilesListResponse {
  files: FileInfo[];
}

export interface FileContentResponse {
  path: string;
  content: string;
}

export interface UpdateMemoryRequest {
  content: string;
}

export interface SyncProgressEvent {
  type: "progress" | "complete" | "error";
  completed?: number;
  total?: number;
  label?: string;
  error?: string;
}

export interface ExportResponse {
  format: "json" | "md";
  data: string;
  filename: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
