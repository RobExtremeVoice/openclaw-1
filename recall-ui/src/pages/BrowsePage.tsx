import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, Download, FileText, Database, ChevronRight } from "lucide-react";
import { api, type MemorySource } from "../api/client";

export function BrowsePage() {
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<MemorySource | undefined>();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["status"],
    queryFn: () => api.getStatus(),
  });

  const syncMutation = useMutation({
    mutationFn: (force: boolean) => api.sync(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: "json" | "md") => api.exportMemories(format),
    onSuccess: (data) => {
      const blob = new Blob([data.data], {
        type: data.filename.endsWith(".json") ? "application/json" : "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Memory Browser</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Browse and manage your AI's memories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncMutation.mutate(false)}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-md hover:bg-[hsl(var(--secondary))]/80 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button
            onClick={() => exportMutation.mutate("md")}
            disabled={exportMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-md hover:bg-[hsl(var(--secondary))]/80 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Source filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSelectedSource(undefined)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            !selectedSource
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80"
          }`}
        >
          All Sources
        </button>
        {status?.sources.map((source) => (
          <button
            key={source}
            onClick={() => setSelectedSource(source)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              selectedSource === source
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80"
            }`}
          >
            {source === "memory" ? <FileText className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
            {source}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {status.sourceCounts.map((sc) => (
            <div
              key={sc.source}
              className={`p-4 rounded-lg border ${
                selectedSource === sc.source
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {sc.source === "memory" ? (
                  <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                ) : (
                  <Database className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                )}
                <span className="font-medium capitalize">{sc.source}</span>
              </div>
              <div className="text-2xl font-semibold">{sc.chunks}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {sc.files} {sc.files === 1 ? "file" : "files"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-[hsl(var(--secondary))]">
            <FileText className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div>
            <h3 className="font-medium mb-1">Memory Files Location</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
              Memories are stored in your workspace directory:
            </p>
            <code className="text-xs bg-[hsl(var(--secondary))] px-2 py-1 rounded">
              {status?.workspaceDir || "Loading..."}
            </code>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <ChevronRight className="w-4 h-4" />
                <code className="bg-[hsl(var(--secondary))] px-1.5 py-0.5 rounded text-xs">MEMORY.md</code>
                <span>- Main memory file</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <ChevronRight className="w-4 h-4" />
                <code className="bg-[hsl(var(--secondary))] px-1.5 py-0.5 rounded text-xs">memory/*.md</code>
                <span>- Additional memory files</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search hint */}
      <div className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Use the <strong>Search</strong> tab to find specific memories using semantic search.
      </div>
    </div>
  );
}
