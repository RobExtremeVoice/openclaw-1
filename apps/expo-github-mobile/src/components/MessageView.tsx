import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Colors, Spacing } from '../theme/colors'
import { Message, MessageRole } from '../models/types'
import ToolCallView from './ToolCallView'
import MarkdownView from './MarkdownView'

interface Props {
  message: Message
}

const MessageView: React.FC<Props> = ({ message }) => {
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())

  const toggleToolCall = (id: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const isUser = message.role === MessageRole.User

  return (
    <View style={styles.container}>
      {/* Message content */}
      {message.content && (
        <View style={isUser ? styles.userMessageWrapper : styles.assistantMessageWrapper}>
          {isUser ? (
            <View style={styles.userBubble}>
              <MarkdownView content={message.content} />
            </View>
          ) : (
            <MarkdownView content={message.content} />
          )}
        </View>
      )}

      {/* Tool calls */}
      {message.toolCalls.map((toolCall) => (
        <ToolCallView
          key={toolCall.id}
          toolCall={toolCall}
          isExpanded={expandedToolCalls.has(toolCall.id)}
          onToggle={() => toggleToolCall(toolCall.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.MD,
  },
  userMessageWrapper: {
    alignItems: 'flex-end',
  },
  assistantMessageWrapper: {
    alignItems: 'stretch',
  },
  userBubble: {
    backgroundColor: '#3a3a3a',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    maxWidth: '80%',
  },
})

export default MessageView
