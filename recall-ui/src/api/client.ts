// API types matching the server types
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

export interface ApiError {
  error: string;
  code?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as ApiError;
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>("/api/status");
  }

  async getMemories(params?: {
    page?: number;
    limit?: number;
    source?: MemorySource;
  }): Promise<MemoriesListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.source) searchParams.set("source", params.source);
    const query = searchParams.toString();
    return this.request<MemoriesListResponse>(`/api/memories${query ? `?${query}` : ""}`);
  }

  async search(query: string, options?: { maxResults?: number; minScore?: number }): Promise<SearchResponse> {
    return this.request<SearchResponse>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query, ...options }),
    });
  }

  async updateMemory(id: string, content: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async deleteMemory(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async getFiles(): Promise<{ files: FileInfo[] }> {
    return this.request<{ files: FileInfo[] }>("/api/files");
  }

  async readFile(path: string): Promise<{ path: string; content: string }> {
    return this.request<{ path: string; content: string }>(`/api/files/${encodeURIComponent(path)}`);
  }

  async writeFile(path: string, content: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/files/${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async sync(force = false): Promise<void> {
    // Uses SSE for progress, so we handle it differently
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`/api/sync${force ? "?force=true" : ""}`);

      eventSource.addEventListener("complete", () => {
        eventSource.close();
        resolve();
      });

      eventSource.addEventListener("error", (event) => {
        eventSource.close();
        reject(new Error("Sync failed"));
      });

      eventSource.onerror = () => {
        eventSource.close();
        reject(new Error("Connection lost"));
      };
    });
  }

  async exportMemories(format: "json" | "md" = "json"): Promise<{ data: string; filename: string }> {
    return this.request<{ format: string; data: string; filename: string }>(`/api/export?format=${format}`);
  }
}

export const api = new ApiClient();
