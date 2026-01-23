import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AppProvider } from './src/contexts/AppContext'
import { Session } from './src/models/types'
import SessionListView from './src/views/SessionListView'
import ChatView from './src/views/ChatView'

export default function App() {
  const [currentView, setCurrentView] = useState<'list' | 'chat'>('list')
  const [activeSession, setActiveSession] = useState<Session | null>(null)

  const handleSessionPress = (session: Session) => {
    setActiveSession(session)
    setCurrentView('chat')
  }

  const handleBackToList = () => {
    setCurrentView('list')
    setActiveSession(null)
  }

  return (
    <AppProvider>
      <StatusBar style="light" />
      {currentView === 'list' ? (
        <SessionListView onSessionPress={handleSessionPress} />
      ) : activeSession ? (
        <ChatView session={activeSession} onBack={handleBackToList} />
      ) : null}
    </AppProvider>
  )
}
