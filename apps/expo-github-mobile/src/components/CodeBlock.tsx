import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'

interface Props {
  code: string
  language?: string
}

const CodeBlock: React.FC<Props> = ({ code, language = 'text' }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format language for display
  const displayLanguage = language || 'text'

  return (
    <View style={styles.container}>
      {/* Header with language and copy button */}
      <View style={styles.header}>
        <Text style={styles.language}>{displayLanguage}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={Colors.secondaryText}
          />
          <Text style={styles.copyText}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Code content */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceBackground,
    borderRadius: Radius.MD,
    overflow: 'hidden',
    marginVertical: Spacing.SM,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.chipBorder,
  },
  language: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.secondaryText,
    textTransform: 'uppercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XS,
  },
  copyText: {
    fontSize: 12,
    color: Colors.secondaryText,
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 20,
    color: Colors.primaryText,
    padding: Spacing.MD,
  },
})

export default CodeBlock
