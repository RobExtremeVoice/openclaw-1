import { useMutation } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Search, FileText, Database, ExternalLink, Copy, Check } from "lucide-react";
import { api, type SearchResult } from "../api/client";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchMutation = useMutation({
    mutationFn: (q: string) => api.search(q, { maxResults: 20 }),
    onSuccess: (data) => {
      setResults(data.results);
    },
  });

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        searchMutation.mutate(query.trim());
      }
    },
    [query, searchMutation],
  );

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1) + "%";
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Search Memories</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Search your AI's memories using natural language
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memories... (e.g., 'user preferences', 'project setup')"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searchMutation.isPending}
            className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searchMutation.isPending ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {/* Results */}
      {searchMutation.isError && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm mb-6">
          Search failed: {searchMutation.error?.message || "Unknown error"}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-[hsl(var(--muted-foreground))]">
            Found {results.length} result{results.length === 1 ? "" : "s"}
          </div>

          {results.map((result) => (
            <div
              key={result.id}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]">
                <div className="flex items-center gap-2">
                  {result.source === "memory" ? (
                    <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  ) : (
                    <Database className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  )}
                  <span className="text-sm font-mono text-[hsl(var(--muted-foreground))]">
                    {result.path}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    L{result.startLine}-{result.endLine}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      result.score >= 0.8
                        ? "bg-green-500/20 text-green-600"
                        : result.score >= 0.6
                          ? "bg-yellow-500/20 text-yellow-600"
                          : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {formatScore(result.score)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(result.snippet, result.id)}
                    className="p-1 rounded hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]"
                    title="Copy snippet"
                  >
                    {copiedId === result.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <pre className="text-sm whitespace-pre-wrap font-mono text-[hsl(var(--foreground))] leading-relaxed">
                  {result.snippet}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!searchMutation.isPending && results.length === 0 && query && !searchMutation.isError && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
          <h3 className="font-medium mb-2">No results found</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Try a different search term or add more memories.
          </p>
        </div>
      )}

      {/* Initial state */}
      {!query && results.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
          <h3 className="font-medium mb-2">Search Your Memories</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-md mx-auto">
            Enter a search query above to find relevant memories. The search uses semantic matching
            to find related content even if the exact words don't match.
          </p>
        </div>
      )}
    </div>
  );
}
