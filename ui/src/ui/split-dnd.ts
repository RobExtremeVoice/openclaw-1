/**
 * Native HTML5 drag-and-drop support for split panes.
 *
 * Sessions can be dragged from the sidebar thread list into panes.
 * Drop zones: center (replace thread), edges (create split).
 */

export const DRAG_DATA_TYPE = 'application/x-openclaw-session'

export function setDragData(event: DragEvent, sessionKey: string) {
  event.dataTransfer?.setData(DRAG_DATA_TYPE, sessionKey)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

export function getDragData(event: DragEvent): string | null {
  return event.dataTransfer?.getData(DRAG_DATA_TYPE) || null
}

export function hasDragData(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(DRAG_DATA_TYPE) ?? false
}

export type DropZone = 'center' | 'top' | 'bottom' | 'left' | 'right'

/**
 * Determine which drop zone the cursor is in based on position within the element.
 * Edge zones are 25% from each edge, center is the remaining area.
 */
export function resolveDropZone(event: DragEvent, target: HTMLElement): DropZone {
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const edgeThreshold = 0.25

  const relX = x / rect.width
  const relY = y / rect.height

  if (relY < edgeThreshold) return 'top'
  if (relY > 1 - edgeThreshold) return 'bottom'
  if (relX < edgeThreshold) return 'left'
  if (relX > 1 - edgeThreshold) return 'right'
  return 'center'
}

/**
 * Map a drop zone to a split direction.
 * 'center' means replace the thread (no split).
 */
export function dropZoneToDirection(zone: DropZone): 'horizontal' | 'vertical' | null {
  if (zone === 'left' || zone === 'right') return 'horizontal'
  if (zone === 'top' || zone === 'bottom') return 'vertical'
  return null // center = replace, no split
}
