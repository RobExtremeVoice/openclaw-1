import { html, nothing } from 'lit'
import type { TemplateResult } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { setDragData } from '../split-dnd'

/** Compact relative time for thread sidebar (e.g. "3m", "2h", "5d") */
function compactAgo(ms?: number | null): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 0) return 'now'
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d`
  const mo = Math.round(day / 30)
  return `${mo}mo`
}

export interface NavSessionEntry {
  key: string
  displayName?: string
  label?: string
  icon?: string
  kind?: string
  updatedAt?: number | null
  derivedTitle?: string
}

export interface NavThreadListProps {
  sessions: NavSessionEntry[]
  activeSessionKey: string
  unreadCounts: Map<string, number>
  onSelect: (sessionKey: string) => void
  onRename: (sessionKey: string, label: string) => void
  onDelete: (sessionKey: string) => void
  onNewSession: () => void
  onRequestUpdate: () => void
}

// Module-level UI state for group collapse/expand (persists across re-renders)
const collapsedGroups = new Set<string>(['Automated'])
const expandedGroups = new Set<string>()

// Module-level search state (persists across re-renders)
let threadSearchQuery = ''

const MAX_VISIBLE = 8

function handleInlineRename(
  event: Event,
  sessionKey: string,
  currentLabel: string,
  onRename: (key: string, label: string) => void,
) {
  const target = event.target as HTMLElement
  const input = document.createElement('input')
  input.className = 'nav-thread-item__rename-input'
  input.value = currentLabel
  input.setAttribute('aria-label', 'Rename thread')

  const commit = () => {
    const next = input.value.trim()
    if (next && next !== currentLabel) {
      onRename(sessionKey, next)
    }
    if (input.parentNode) {
      input.parentNode.replaceChild(labelSpan, input)
    }
  }

  const labelSpan = target
  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    }
    if (e.key === 'Escape') {
      input.value = currentLabel
      input.blur()
    }
  })

  if (labelSpan.parentNode) {
    labelSpan.parentNode.replaceChild(input, labelSpan)
    input.focus()
    input.select()
  }
}

/** Extract the channel name from a session key like "agent:main:telegram:dm:123" */
function parseChannel(key: string): string {
  const parts = key.split(':')
  // Patterns: "agent:<id>:<channel>:..." or "<channel>:..." or just "main"
  if (parts.length >= 3 && parts[0] === 'agent') return parts[2]
  if (parts.length >= 2) return parts[0]
  return 'web'
}

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈️',
  discord: '🎮',
  whatsapp: '💬',
  slack: '💼',
  signal: '🔒',
  imessage: '🍎',
  web: '🌐',
  matrix: '🔷',
  msteams: '🟣',
  line: '🟢',
  nostr: '🟡',
  voice: '🎙️',
  cron: '⏰',
  main: '💻',
}

function channelIcon(key: string): string {
  const ch = parseChannel(key)
  return CHANNEL_ICONS[ch] ?? '💻'
}

/** Check if a session is a cron/automated session */
function isCronSession(entry: NavSessionEntry): boolean {
  const key = entry.key.toLowerCase()
  return key.includes(':cron:') || key.includes(':cron-') || entry.kind === 'global'
}

function sessionDisplayLabel(entry: NavSessionEntry): string {
  return entry.displayName || entry.label || humanizeSessionKey(entry.key)
}

/** Turn a raw session key into a human-readable short label. */
export function humanizeSessionKey(key: string): string {
  const parts = key.split(':')

  // "agent:<id>:<channel>:..." patterns
  if (parts[0] === 'agent' && parts.length >= 3) {
    const channel = parts[2]
    // Thread: "agent:main:main:thread:<uuid>" -> "Thread ab12"
    if (parts[3] === 'thread' && parts[4]) {
      return `Thread ${parts[4].slice(0, 6)}`
    }
    // Cron: "agent:main:cron:<uuid>" -> "Cron ab12"
    if (channel === 'cron' && parts[3]) {
      return `Cron ${parts[3].slice(0, 6)}`
    }
    // Channel DM: "agent:main:telegram:dm:123" -> "Telegram dm:123"
    const rest = parts.slice(3).join(':')
    const name = channel.charAt(0).toUpperCase() + channel.slice(1)
    return rest ? `${name} ${rest.slice(0, 24)}` : name
  }

  // Simple keys: "slack:U123" -> "Slack U123"
  if (parts.length >= 2) {
    const channel = parts[0]
    const rest = parts.slice(1).join(':')
    const name = channel.charAt(0).toUpperCase() + channel.slice(1)
    return `${name} ${rest.slice(0, 24)}`
  }

  return key.slice(0, 30)
}

function matchesThreadSearch(entry: NavSessionEntry, needle: string): boolean {
  if (!needle) return true
  const lower = needle.toLowerCase()
  return (
    (entry.displayName?.toLowerCase().includes(lower) ?? false) ||
    (entry.label?.toLowerCase().includes(lower) ?? false) ||
    (entry.derivedTitle?.toLowerCase().includes(lower) ?? false) ||
    entry.key.toLowerCase().includes(lower)
  )
}

interface SessionGroup {
  label: string
  icon: string
  sessions: NavSessionEntry[]
}

function groupSessions(sessions: NavSessionEntry[]): SessionGroup[] {
  const direct: NavSessionEntry[] = []
  const automated: NavSessionEntry[] = []

  for (const s of sessions) {
    if (isCronSession(s)) {
      automated.push(s)
    } else {
      direct.push(s)
    }
  }

  const groups: SessionGroup[] = []

  if (direct.length > 0) {
    groups.push({ label: 'Conversations', icon: '💬', sessions: direct })
  }
  if (automated.length > 0) {
    groups.push({ label: 'Automated', icon: '⏰', sessions: automated })
  }

  return groups
}

export function renderNavThreadList(props: NavThreadListProps): TemplateResult {
  const { sessions, activeSessionKey, unreadCounts, onSelect, onRename, onDelete, onNewSession, onRequestUpdate } = props
  const filtered = threadSearchQuery
    ? sessions.filter((s) => matchesThreadSearch(s, threadSearchQuery))
    : sessions
  const groups = groupSessions(filtered)

  return html`
    <div class="nav-threads">
      <button
        class="nav-thread-item nav-thread-item__new"
        @click=${onNewSession}
        title="Start a new session"
        aria-label="New session"
      >
        <span class="nav-thread-item__icon">+</span>
        <span class="nav-thread-item__new-label">New session</span>
      </button>
      <div class="nav-threads__search">
        <input
          class="nav-threads__search-input"
          type="text"
          placeholder="Search threads…"
          .value=${threadSearchQuery}
          @input=${(e: Event) => {
            threadSearchQuery = (e.target as HTMLInputElement).value
            onRequestUpdate()
          }}
          aria-label="Search threads"
        />
        ${threadSearchQuery ? html`
          <button
            class="nav-threads__search-clear"
            @click=${() => {
              threadSearchQuery = ''
              onRequestUpdate()
            }}
            title="Clear search"
            aria-label="Clear search"
          >×</button>
        ` : nothing}
      </div>
      ${groups.length === 0 && threadSearchQuery ? html`
        <div class="nav-threads__empty">No threads match "${threadSearchQuery}"</div>
      ` : nothing}
      ${groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.label)
        const isFullyExpanded = expandedGroups.has(group.label)
        const allSessions = group.sessions
        const visibleSessions = isFullyExpanded || allSessions.length <= MAX_VISIBLE
          ? allSessions
          : allSessions.slice(0, MAX_VISIBLE)
        const hiddenCount = allSessions.length - visibleSessions.length

        return html`
          <div class="nav-threads__group">
            <button
              class="nav-threads__group-label"
              @click=${() => {
                if (collapsedGroups.has(group.label)) {
                  collapsedGroups.delete(group.label)
                } else {
                  collapsedGroups.add(group.label)
                }
                onRequestUpdate()
              }}
              title="${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}"
            >
              <span class="nav-threads__group-chevron">${isCollapsed ? '▸' : '▾'}</span>
              <span>${group.icon}</span>
              <span class="nav-threads__group-text">${group.label}</span>
              <span class="nav-threads__group-count">${allSessions.length}</span>
            </button>
            ${!isCollapsed ? html`
              <div class="nav-threads__group-items">
                ${repeat(
                  visibleSessions,
                  (s) => s.key,
                  (s) => {
                    const isActive = s.key === activeSessionKey
                    const unread = unreadCounts.get(s.key) ?? 0
                    const label = sessionDisplayLabel(s)
                    const icon = s.icon || channelIcon(s.key)
                    return html`
                      <button
                        class="nav-thread-item ${isActive ? 'nav-thread-item--active' : ''}"
                        draggable="true"
                        @dragstart=${(e: DragEvent) => setDragData(e, s.key)}
                        @click=${() => onSelect(s.key)}
                        title="${label}\n${s.key}"
                      >
                        <span class="nav-thread-item__icon">${icon}</span>
                        <span
                          class="nav-thread-item__label"
                          @dblclick=${(e: Event) => handleInlineRename(e, s.key, label, onRename)}
                        >${label}</span>
                        ${unread > 0
                          ? html`<span class="nav-thread-item__unread" aria-label="${unread} unread">${unread}</span>`
                          : nothing}
                        ${s.updatedAt ? html`<span class="nav-thread-item__time">${compactAgo(s.updatedAt)}</span>` : nothing}
                        <button
                          class="nav-thread-item__delete"
                          @click=${(e: Event) => {
                            e.stopPropagation()
                            onDelete(s.key)
                          }}
                          title="Delete session"
                          aria-label="Delete session"
                        >×</button>
                      </button>
                    `
                  },
                )}
                ${hiddenCount > 0 ? html`
                  <button
                    class="nav-threads__show-more"
                    @click=${() => {
                      expandedGroups.add(group.label)
                      onRequestUpdate()
                    }}
                  >
                    Show all ${allSessions.length} sessions
                  </button>
                ` : nothing}
              </div>
            ` : nothing}
          </div>
        `
      })}
    </div>
  `
}
