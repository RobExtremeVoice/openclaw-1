import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'
import { ToolCall } from '../models/types'
import { getToolColor } from '../theme/types'

interface Props {
  toolCall: ToolCall
  isExpanded: boolean
  onToggle: () => void
}

const ToolCallView: React.FC<Props> = ({ toolCall, isExpanded, onToggle }) => {
  const toolColor = getToolColor(toolCall.type)

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={onToggle}>
        <Text style={[styles.toolType, { color: toolColor }]}>{toolCall.type}</Text>
        <Text style={styles.toolInput} numberOfLines={1}>
          {toolCall.input}
        </Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={Colors.tertiaryText}
        />
      </TouchableOpacity>

      {/* Expanded content */}
      {isExpanded && toolCall.output && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.outputContainer}
        >
          <Text style={styles.outputText}>{toolCall.output}</Text>
        </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  toolType: {
    fontSize: 14,
    fontWeight: '500',
  },
  toolInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.secondaryText,
  },
  outputContainer: {
    backgroundColor: Colors.surfaceBackground,
    maxHeight: 200,
  },
  outputText: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: Colors.secondaryText,
    padding: Spacing.MD,
  },
})

export default ToolCallView
