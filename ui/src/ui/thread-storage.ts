import type { ThreadDescriptor } from './thread-state'

const STORAGE_KEY = 'openclaw.control.threads.v1'

export function loadThreadDescriptors(): ThreadDescriptor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is ThreadDescriptor =>
        entry != null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.sessionKey === 'string' &&
        typeof entry.label === 'string' &&
        typeof entry.createdAt === 'number' &&
        typeof entry.lastActivityAt === 'number' &&
        typeof entry.parentSessionKey === 'string',
    )
  } catch {
    return []
  }
}

export function saveThreadDescriptors(descriptors: ThreadDescriptor[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(descriptors))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}
