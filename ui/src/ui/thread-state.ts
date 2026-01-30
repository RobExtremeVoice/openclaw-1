import { generateUUID } from './uuid'
import type { ChatAttachment, ChatQueueItem } from './ui-types'

export interface ThreadDescriptor {
  id: string
  sessionKey: string
  label: string
  createdAt: number
  lastActivityAt: number
  parentSessionKey: string
}

export interface ThreadState {
  descriptor: ThreadDescriptor
  chatMessages: unknown[]
  chatToolMessages: unknown[]
  chatStream: string | null
  chatStreamStartedAt: number | null
  chatRunId: string | null
  chatSending: boolean
  chatMessage: string
  chatAttachments: ChatAttachment[]
  chatQueue: ChatQueueItem[]
  chatLoading: boolean
  chatThinkingLevel: string | null
  unreadCount: number
  hasNewMessages: boolean
}

export function createThreadDescriptor(
  parentSessionKey: string,
  label?: string,
): ThreadDescriptor {
  const id = generateUUID()
  const now = Date.now()
  return {
    id,
    sessionKey: `${parentSessionKey}:thread:${id}`,
    label: label ?? 'New thread',
    createdAt: now,
    lastActivityAt: now,
    parentSessionKey,
  }
}

export function createThreadState(descriptor: ThreadDescriptor): ThreadState {
  return {
    descriptor,
    chatMessages: [],
    chatToolMessages: [],
    chatStream: null,
    chatStreamStartedAt: null,
    chatRunId: null,
    chatSending: false,
    chatMessage: '',
    chatAttachments: [],
    chatQueue: [],
    chatLoading: false,
    chatThinkingLevel: null,
    unreadCount: 0,
    hasNewMessages: false,
  }
}

type SnapshotHost = {
  chatMessages: unknown[]
  chatToolMessages: unknown[]
  chatStream: string | null
  chatStreamStartedAt: number | null
  chatRunId: string | null
  chatSending: boolean
  chatMessage: string
  chatAttachments: ChatAttachment[]
  chatQueue: ChatQueueItem[]
  chatLoading: boolean
  chatThinkingLevel: string | null
}

export function snapshotThreadState(host: SnapshotHost): Omit<ThreadState, 'descriptor' | 'unreadCount' | 'hasNewMessages'> {
  return {
    chatMessages: host.chatMessages,
    chatToolMessages: host.chatToolMessages,
    chatStream: host.chatStream,
    chatStreamStartedAt: host.chatStreamStartedAt,
    chatRunId: host.chatRunId,
    chatSending: host.chatSending,
    chatMessage: host.chatMessage,
    chatAttachments: host.chatAttachments,
    chatQueue: host.chatQueue,
    chatLoading: host.chatLoading,
    chatThinkingLevel: host.chatThinkingLevel,
  }
}

export function restoreThreadState(host: SnapshotHost, thread: ThreadState): void {
  host.chatMessages = thread.chatMessages
  host.chatToolMessages = thread.chatToolMessages
  host.chatStream = thread.chatStream
  host.chatStreamStartedAt = thread.chatStreamStartedAt
  host.chatRunId = thread.chatRunId
  host.chatSending = thread.chatSending
  host.chatMessage = thread.chatMessage
  host.chatAttachments = thread.chatAttachments
  host.chatQueue = thread.chatQueue
  host.chatLoading = thread.chatLoading
  host.chatThinkingLevel = thread.chatThinkingLevel
}
