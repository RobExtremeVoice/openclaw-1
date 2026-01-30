/**
 * Keyboard shortcuts for split-pane management.
 *
 * Cmd+D       -> Split horizontal (side-by-side)
 * Shift+Cmd+D -> Split vertical (top/bottom)
 * Cmd+]       -> Focus next pane
 *
 * Note: Cmd+W is not interceptable in Chrome (browser closes the tab at
 * the process level before JS can preventDefault). Close pane is available
 * via the right-click context menu instead.
 */

type ShortcutHost = {
  tab: string
  splitLayout: unknown | null
  splitPane: (direction: 'horizontal' | 'vertical') => void
  closePane: (paneId?: string) => void
  focusNextPane: () => void
}

let handler: ((e: KeyboardEvent) => void) | null = null

export function installKeyboardShortcuts(host: ShortcutHost) {
  removeKeyboardShortcuts()

  handler = (e: KeyboardEvent) => {
    // Only active on the chat tab
    if (host.tab !== 'chat') return

    const isMeta = e.metaKey || e.ctrlKey

    // Cmd+D -> split horizontal
    if (isMeta && !e.shiftKey && e.key === 'd') {
      e.preventDefault()
      e.stopPropagation()
      host.splitPane('horizontal')
      return
    }

    // Shift+Cmd+D -> split vertical
    if (isMeta && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault()
      e.stopPropagation()
      host.splitPane('vertical')
      return
    }

    // Cmd+] -> focus next pane
    if (isMeta && e.key === ']') {
      if (host.splitLayout) {
        e.preventDefault()
        e.stopPropagation()
        host.focusNextPane()
      }
    }
  }

  document.addEventListener('keydown', handler, true)
}

export function removeKeyboardShortcuts() {
  if (handler) {
    document.removeEventListener('keydown', handler, true)
    handler = null
  }
}
