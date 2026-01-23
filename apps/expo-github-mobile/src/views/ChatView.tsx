import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAppState } from '../contexts/AppContext'
import { Session, getFullName } from '../models/types'
import { Colors, Spacing, Radius } from '../theme/colors'
import MessageView from '../components/MessageView'
import MessageInputView from '../components/MessageInputView'
import Chip from '../components/Chip'

interface Props {
  session: Session
  onBack: () => void
}

const ChatView: React.FC<Props> = ({ session, onBack }) => {
  const { sessions, sendMessage } = useAppState()
  const [messageText, setMessageText] = useState('')
  const [showCreatePR, setShowCreatePR] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)

  // Get current session from state to see updates
  const currentSession = sessions.find((s) => s.id === session.id) || session

  const hasToolCalls = currentSession.messages.some((m) => m.toolCalls.length > 0)

  const handleSendMessage = () => {
    if (messageText.trim()) {
      sendMessage(messageText, currentSession)
      setMessageText('')
    }
  }

  // Auto scroll to bottom when messages change
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [currentSession.messages.length])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentSession.title.length > 30
              ? currentSession.title.slice(0, 30) + '...'
              : currentSession.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            {getFullName(currentSession.repository)} · Default
          </Text>
        </View>

        <TouchableOpacity style={styles.menuButton}>
          <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Messages + Input with keyboard avoidance */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
        >
          {currentSession.messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}

          {/* Create PR button */}
          {hasToolCalls && (
            <View style={styles.prButtonContainer}>
              <Text style={styles.branchName} numberOfLines={1}>
                claude/add-popular-tweets-dy04J
              </Text>
              <TouchableOpacity style={styles.createPRButton} onPress={() => setShowCreatePR(true)}>
                <Text style={styles.createPRText}>Create PR</Text>
                <Ionicons name="open-outline" size={14} color={Colors.primaryText} />
                <Ionicons name="ellipsis-horizontal" size={14} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <MessageInputView
            text={messageText}
            placeholder="Add feedback..."
            onChangeText={setMessageText}
            onSend={handleSendMessage}
          />

          {/* Bottom chips */}
          <View style={styles.chipsContainer}>
            <Chip icon="code-working" text="Branch" secondaryText="claude/add-popular-tweets..." />
            <TouchableOpacity style={styles.createPRChip} onPress={() => setShowCreatePR(true)}>
              <Text style={styles.chipText}>Create PR</Text>
              <Ionicons name="open-outline" size={12} color={Colors.primaryText} />
              <Ionicons name="ellipsis-horizontal" size={12} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  backButton: {
    width: 24,
    height: 24,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.secondaryText,
  },
  menuButton: {
    width: 24,
    height: 24,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  messagesContainer: {
    padding: Spacing.MD,
    gap: Spacing.LG,
  },
  prButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.MD,
    padding: Spacing.MD,
    marginTop: Spacing.SM,
  },
  branchName: {
    flex: 1,
    fontSize: 14,
    color: Colors.secondaryText,
  },
  createPRButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
  },
  createPRText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
  },
  inputContainer: {
    backgroundColor: Colors.background,
    paddingBottom: Spacing.MD,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
  },
  createPRChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.MD,
  },
  chipText: {
    fontSize: 12,
    color: Colors.primaryText,
  },
})

export default ChatView
