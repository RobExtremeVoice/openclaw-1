/**
 * Thin wrapper around renderChat() that scopes a chat view to a specific pane.
 * Adds a data-pane-id attribute, focus indicator, and pane-specific callbacks.
 */
import { html } from 'lit'
import { renderChat, type ChatProps } from './chat'
import type { AppViewState } from '../app-view-state'
import type { PaneState } from '../pane-state'
import type { SplitLeaf } from '../split-tree'
import { allLeafIds } from '../split-tree'
import { getDragData, hasDragData, resolveDropZone, dropZoneToDirection } from '../split-dnd'
import { createThreadDescriptor, createThreadState } from '../thread-state'
import { saveThreadDescriptors } from '../thread-storage'
import type { PaneContextMenuCallbacks } from '../components/pane-context-menu'
import '../components/pane-context-menu'
import { humanizeSessionKey } from './thread-list'

export interface ChatPaneProps {
  leaf: SplitLeaf
  state: AppViewState
  paneState: PaneState | undefined
  isFocused: boolean
}

export function renderChatPane(props: ChatPaneProps) {
  const { leaf, state, paneState, isFocused } = props
  const sessionKey = leaf.threadId
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking
  const chatDisabledReason = state.connected ? null : 'Disconnected from gateway.'
  const chatFocus = state.settings.chatFocusMode || state.onboarding

  // For the focused pane, use the app's live reactive state.
  // For non-focused panes, read from the stored ThreadState.
  const isActiveSession = sessionKey === state.sessionKey
  const threadMapId = state.sessionKeyToThreadId.get(sessionKey)
  const thread = threadMapId ? state.threads.get(threadMapId) : null

  const chatProps: ChatProps = {
    sessionKey,
    onSessionKeyChange: (next) => {
      state.setThreadInPane(leaf.id, next)
    },
    thinkingLevel: isActiveSession ? state.chatThinkingLevel : (thread?.chatThinkingLevel ?? null),
    showThinking,
    loading: isActiveSession ? state.chatLoading : (thread?.chatLoading ?? false),
    sending: isActiveSession ? state.chatSending : (thread?.chatSending ?? false),
    compactionStatus: isActiveSession ? state.compactionStatus : null,
    assistantAvatarUrl: state.chatAvatarUrl,
    messages: isActiveSession ? state.chatMessages : (thread?.chatMessages ?? []),
    toolMessages: isActiveSession ? state.chatToolMessages : (thread?.chatToolMessages ?? []),
    stream: isActiveSession ? state.chatStream : (thread?.chatStream ?? null),
    streamStartedAt: isActiveSession ? state.chatStreamStartedAt : (thread?.chatStreamStartedAt ?? null),
    draft: isActiveSession ? state.chatMessage : (thread?.chatMessage ?? ''),
    queue: isActiveSession ? state.chatQueue : (thread?.chatQueue ?? []),
    connected: state.connected,
    canSend: state.connected,
    disabledReason: chatDisabledReason,
    error: isActiveSession ? state.lastError : null,
    sessions: state.sessionsResult,
    focusMode: chatFocus,
    onRefresh: () => {
      state.resetToolStream()
    },
    onToggleFocusMode: () => {
      if (state.onboarding) return
      state.applySettings({
        ...state.settings,
        chatFocusMode: !state.settings.chatFocusMode,
      })
    },
    onChatScroll: (event) => state.handleChatScroll(event),
    onDraftChange: (next) => {
      if (isActiveSession) {
        state.chatMessage = next
      } else if (thread) {
        thread.chatMessage = next
      }
    },
    attachments: isActiveSession ? state.chatAttachments : (thread?.chatAttachments ?? []),
    onAttachmentsChange: (next) => {
      if (isActiveSession) {
        state.chatAttachments = next
      } else if (thread) {
        thread.chatAttachments = next
      }
    },
    onSend: () => void state.handleSendChat(),
    canAbort: isActiveSession ? Boolean(state.chatRunId) : Boolean(thread?.chatRunId),
    onAbort: () => void state.handleAbortChat(),
    onQueueRemove: (id) => state.removeQueuedMessage(id),
    onNewSession: () => void state.handleSendChat('/new', { restoreDraft: true }),
    sidebarOpen: paneState?.sidebarOpen ?? false,
    sidebarContent: paneState?.sidebarContent ?? null,
    sidebarError: paneState?.sidebarError ?? null,
    splitRatio: paneState?.sidebarSplitRatio ?? 0.6,
    onOpenSidebar: (content: string) => {
      if (paneState) {
        paneState.sidebarContent = content
        paneState.sidebarError = null
        paneState.sidebarOpen = true
        // Trigger reactivity through app state
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleOpenSidebar(content)
      }
    },
    onCloseSidebar: () => {
      if (paneState) {
        paneState.sidebarOpen = false
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleCloseSidebar()
      }
    },
    onSplitRatioChange: (ratio: number) => {
      if (paneState) {
        paneState.sidebarSplitRatio = Math.max(0.4, Math.min(0.7, ratio))
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleSplitRatioChange(ratio)
      }
    },
    assistantName: state.assistantName,
    assistantAvatar: state.assistantAvatar,
  }

  const handleDragOver = (e: DragEvent) => {
    if (!hasDragData(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    const sessionKey = getDragData(e)
    if (!sessionKey) return
    const zone = resolveDropZone(e, e.currentTarget as HTMLElement)
    const direction = dropZoneToDirection(zone)
    if (direction) {
      // Edge drop: split this pane
      state.focusPane(leaf.id)
      state.splitPane(direction)
      // Set the new pane's thread to the dragged session
      // The newly created pane is now focused
      if (state.focusedPaneId) {
        state.setThreadInPane(state.focusedPaneId, sessionKey)
      }
    } else {
      // Center drop: replace this pane's thread
      state.setThreadInPane(leaf.id, sessionKey)
    }
  }

  // -- Context menu --
  const paneCount = state.splitLayout
    ? allLeafIds(state.splitLayout.root).length
    : 1
  const isMultiPane = paneCount > 1

  const ctxCallbacks: PaneContextMenuCallbacks = {
    onSplitHorizontal: () => {
      state.focusPane(leaf.id)
      state.splitPane('horizontal')
    },
    onSplitVertical: () => {
      state.focusPane(leaf.id)
      state.splitPane('vertical')
    },
    onClosePane: () => {
      state.closePane(leaf.id)
    },
    onNewThread: () => {
      // Create a thread without switching the global active session
      const parentKey = state.sessionKey
      const desc = createThreadDescriptor(parentKey)
      const thread = createThreadState(desc)
      state.threads.set(desc.id, thread)
      state.sessionKeyToThreadId.set(desc.sessionKey, desc.id)
      saveThreadDescriptors(state.getThreadDescriptors())
      state.threads = new Map(state.threads)
      state.setThreadInPane(leaf.id, desc.sessionKey)
    },
    onFocusNext: () => {
      state.focusNextPane()
    },
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    state.focusPane(leaf.id)
    const paneEl = e.currentTarget as HTMLElement
    const menu = paneEl.querySelector('pane-context-menu') as
      import('../components/pane-context-menu').PaneContextMenu | null
    if (menu) {
      menu.callbacks = ctxCallbacks
      menu.show(e.clientX, e.clientY, {
        showClosePane: isMultiPane,
        showFocusNext: isMultiPane,
      })
    }
  }

  // Resolve the display title for this pane
  const sessionEntry = state.sessionsResult?.sessions?.find(
    (s) => s.key === sessionKey,
  )
  const paneTitle =
    sessionEntry?.displayName ||
    sessionEntry?.label ||
    humanizeSessionKey(sessionKey)
  const isStreaming = isActiveSession
    ? Boolean(state.chatStream)
    : Boolean(thread?.chatStream)
  const msgCount = isActiveSession
    ? state.chatMessages.length
    : (thread?.chatMessages.length ?? 0)

  return html`
    <div
      class="split-pane ${isFocused ? 'split-pane--focused' : ''}"
      data-pane-id=${leaf.id}
      @click=${() => state.focusPane(leaf.id)}
      @focusin=${() => state.focusPane(leaf.id)}
      @dragover=${handleDragOver}
      @drop=${handleDrop}
      @contextmenu=${handleContextMenu}
    >
      <div class="split-pane__titlebar ${isFocused ? 'split-pane__titlebar--focused' : ''}">
        <span class="split-pane__titlebar-label" title=${sessionKey}>
          ${paneTitle}
        </span>
        <span class="split-pane__titlebar-meta">
          ${isStreaming
            ? html`<span class="split-pane__titlebar-status split-pane__titlebar-status--streaming">streaming</span>`
            : msgCount > 0
              ? html`<span class="split-pane__titlebar-status">${msgCount} msgs</span>`
              : html`<span class="split-pane__titlebar-status split-pane__titlebar-status--empty">empty</span>`}
        </span>
        <button
          class="split-pane__titlebar-close"
          title="Close pane"
          @click=${(e: Event) => {
            e.stopPropagation()
            state.closePane(leaf.id)
          }}
        >&times;</button>
      </div>
      ${renderChat(chatProps)}
      <pane-context-menu .callbacks=${ctxCallbacks}></pane-context-menu>
    </div>
  `
}
