/**
 * Transient UI state for each visible pane.
 *
 * This is separate from ThreadState (which holds chat data).
 * PaneState tracks per-pane UI concerns like scroll position,
 * sidebar visibility, and tool stream routing.
 */

import type { ToolStreamEntry } from './app-tool-stream'

export interface PaneState {
  paneId: string
  threadId: string
  scrollUserNearBottom: boolean
  sidebarOpen: boolean
  sidebarContent: string | null
  sidebarError: string | null
  sidebarSplitRatio: number
  toolStreamById: Map<string, ToolStreamEntry>
  toolStreamOrder: string[]
}

export function createPaneState(paneId: string, threadId: string): PaneState {
  return {
    paneId,
    threadId,
    scrollUserNearBottom: true,
    sidebarOpen: false,
    sidebarContent: null,
    sidebarError: null,
    sidebarSplitRatio: 0.6,
    toolStreamById: new Map(),
    toolStreamOrder: [],
  }
}

/**
 * Sync pane states map with the current layout.
 * Creates new PaneState entries for new panes, removes stale ones.
 */
export function syncPaneStates(
  current: Map<string, PaneState>,
  leafEntries: Array<{ paneId: string; threadId: string }>,
): Map<string, PaneState> {
  const next = new Map<string, PaneState>()
  for (const entry of leafEntries) {
    const existing = current.get(entry.paneId)
    if (existing) {
      // Update threadId if changed (e.g. drag-and-drop replaced thread)
      if (existing.threadId !== entry.threadId) {
        next.set(entry.paneId, {
          ...createPaneState(entry.paneId, entry.threadId),
          sidebarSplitRatio: existing.sidebarSplitRatio,
        })
      } else {
        next.set(entry.paneId, existing)
      }
    } else {
      next.set(entry.paneId, createPaneState(entry.paneId, entry.threadId))
    }
  }
  return next
}
