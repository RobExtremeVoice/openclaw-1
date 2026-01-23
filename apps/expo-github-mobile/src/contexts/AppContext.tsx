import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import {
  Session,
  Repository,
  Message,
  MessageRole,
  AIModel,
  mockSessions,
  mockRepositories,
  mockActiveSession,
  SessionStatus,
} from '../models/types'

interface AppContextType {
  sessions: Session[]
  repositories: Repository[]
  activeSession: Session | null
  openSession: (session: Session) => void
  closeSession: () => void
  createNewSession: (title: string, repository: Repository) => Session
  sendMessage: (content: string, toSession: Session) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([mockActiveSession, ...mockSessions])
  const [repositories] = useState<Repository[]>(mockRepositories)
  const [activeSession, setActiveSession] = useState<Session | null>(null)

  const openSession = useCallback((session: Session) => {
    setActiveSession(session)
  }, [])

  const closeSession = useCallback(() => {
    setActiveSession(null)
  }, [])

  const createNewSession = useCallback(
    (title: string, repository: Repository): Session => {
      const newSession: Session = {
        id: `session-${Date.now()}`,
        title,
        repository,
        createdAt: new Date(),
        status: SessionStatus.Running,
        messages: [],
      }
      setSessions((prev) => [newSession, ...prev])
      return newSession
    },
    []
  )

  const sendMessage = useCallback((content: string, toSession: Session) => {
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      role: MessageRole.User,
      content,
      timestamp: new Date(),
      toolCalls: [],
    }

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === toSession.id) {
          return {
            ...s,
            messages: [...s.messages, newMessage],
          }
        }
        return s
      })
    )
  }, [])

  return (
    <AppContext.Provider
      value={{
        sessions,
        repositories,
        activeSession,
        openSession,
        closeSession,
        createNewSession,
        sendMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useAppState = () => {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppProvider')
  }
  return context
}

// Re-export types for convenience
export type { Session, Repository, Message, AIModel }
export { MessageRole, SessionStatus, ToolType, ToolCallStatus } from '../models/types'
