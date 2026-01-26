import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'
import { ToolCall, ToolCallStatus } from '../models/types'
import { getToolColor } from '../theme/types'

interface Props {
  toolCall: ToolCall
  isExpanded: boolean
  onToggle: () => void
}

const ToolCallView: React.FC<Props> = ({ toolCall, isExpanded, onToggle }) => {
  const toolColor = getToolColor(toolCall.type)
  const isRunning = toolCall.status === ToolCallStatus.Running
  const isCompleted = toolCall.status === ToolCallStatus.Completed
  const isFailed = toolCall.status === ToolCallStatus.Failed

  const getStatusIcon = () => {
    if (isRunning) {
      return <ActivityIndicator size={14} color={toolColor} />
    }
    if (isFailed) {
      return <Ionicons name="close-circle" size={16} color={Colors.error} />
    }
    if (isCompleted) {
      return <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
    }
    return <Ionicons name="ellipse" size={16} color={Colors.tertiaryText} />
  }

  const getStatusText = () => {
    if (isRunning) return 'Running'
    if (isFailed) return 'Failed'
    if (isCompleted) return 'Completed'
    return 'Pending'
  }

  // Parse input to extract relevant info
  const getInputDisplay = () => {
    // For Write/Edit, show just the file path
    if (toolCall.type === 'Write' || toolCall.type === 'Edit') {
      const match = toolCall.input.match(/^[\s\S]{0,100}?/)
      return match ? match[0].trim() : toolCall.input
    }
    // For Bash, show the command
    if (toolCall.type === 'Bash') {
      const lines = toolCall.input.split('\n')
      return lines[0]?.trim() || toolCall.input
    }
    return toolCall.input
  }

  return (
    <View style={[styles.container, isFailed && styles.containerFailed]}>
      {/* Header */}
      <TouchableOpacity
        style={[styles.header, isExpanded && styles.headerExpanded]}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.toolInfo}>
          {getStatusIcon()}
          <Text style={[styles.toolType, { color: toolColor }]}>{toolCall.type}</Text>
          <Text style={styles.statusText}>({getStatusText()})</Text>
        </View>

        <Text style={styles.toolInput} numberOfLines={isExpanded ? undefined : 1}>
          {getInputDisplay()}
        </Text>

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.tertiaryText}
        />
      </TouchableOpacity>

      {/* Expanded input/output */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Input section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Input</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.inputText}>{toolCall.input}</Text>
            </ScrollView>
          </View>

          {/* Output section */}
          {toolCall.output && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Output</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.outputScroll}
              >
                <Text style={styles.outputText}>{toolCall.output}</Text>
              </ScrollView>
            </View>
          )}

          {/* Running indicator */}
          {isRunning && !toolCall.output && (
            <View style={styles.runningIndicator}>
              <ActivityIndicator size="small" color={toolColor} />
              <Text style={styles.runningText}>Executing...</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.MD,
    overflow: 'hidden',
    marginHorizontal: Spacing.LG,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  containerFailed: {
    borderColor: `${Colors.error}40`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  headerExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.chipBorder,
  },
  toolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
  },
  toolType: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 11,
    color: Colors.tertiaryText,
  },
  toolInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.secondaryText,
    fontFamily: 'Menlo',
  },
  expandedContent: {
    backgroundColor: Colors.surfaceBackground,
  },
  section: {
    paddingVertical: Spacing.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.chipBorder,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.tertiaryText,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.XS,
  },
  inputText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: Colors.primaryText,
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
  },
  outputScroll: {
    maxHeight: 200,
  },
  outputText: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: Colors.secondaryText,
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
  },
  runningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.SM,
    paddingVertical: Spacing.MD,
  },
  runningText: {
    fontSize: 12,
    color: Colors.tertiaryText,
  },
})

export default ToolCallView
