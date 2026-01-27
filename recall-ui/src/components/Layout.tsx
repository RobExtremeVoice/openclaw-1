import { Link, NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Brain, Search, FolderOpen, RefreshCw } from "lucide-react";
import { api } from "../api/client";

export function Layout() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["status"],
    queryFn: () => api.getStatus(),
    refetchInterval: 30000,
  });

  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col">
        <div className="p-4 border-b border-[hsl(var(--border))]">
          <Link to="/" className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-[hsl(var(--primary))]" />
            <span className="font-semibold text-lg">Recall</span>
          </Link>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Memory Manager</p>
        </div>

        <nav className="flex-1 p-2">
          <NavLink
            to="/browse"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
              }`
            }
          >
            <FolderOpen className="w-4 h-4" />
            Browse
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
              }`
            }
          >
            <Search className="w-4 h-4" />
            Search
          </NavLink>
        </nav>

        {/* Status Bar */}
        <div className="p-4 border-t border-[hsl(var(--border))]">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : status ? (
            <div className="space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between">
                <span>Files:</span>
                <span className="font-mono">{status.files}</span>
              </div>
              <div className="flex justify-between">
                <span>Chunks:</span>
                <span className="font-mono">{status.chunks}</span>
              </div>
              <div className="flex justify-between">
                <span>Provider:</span>
                <span className="font-mono truncate max-w-[100px]" title={status.provider}>
                  {status.provider}
                </span>
              </div>
              {status.dirty && (
                <div className="flex items-center gap-1 text-amber-500">
                  <RefreshCw className="w-3 h-3" />
                  <span>Index out of date</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-red-500">Unable to connect</div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
