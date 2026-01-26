import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import Markdown, { RenderRules } from 'react-native-markdown-display'
import CodeBlock from './CodeBlock'
import { Colors, Spacing, Radius } from '../theme/colors'

interface Props {
  content: string
}

const MarkdownView: React.FC<Props> = ({ content }) => {
  // Function to extract language and code from fenced code block
  const parseCodeBlock = (content: string): { language: string; code: string } => {
    const lines = content.split('\n')
    if (lines.length === 0) return { language: 'text', code: content }

    const firstLine = lines[0].trim()
    // Check if first line looks like a language identifier
    if (firstLine.length > 0 && firstLine.length < 20 && /^[a-zA-Z0-9+#+-]*$/.test(firstLine)) {
      return {
        language: firstLine,
        code: lines.slice(1).join('\n'),
      }
    }

    return { language: 'text', code: content }
  }

  // Custom render rules
  const rules: RenderRules = {
    // Code blocks (fenced)
    fence: (node, children, parent, styles) => {
      const { language, code } = parseCodeBlock(node.content)
      return <CodeBlock key={node.key} code={code} language={language} />
    },
    // Inline code
    codeinline: (node, children, parent, styles) => {
      return (
        <Text key={node.key} style={markdownStyles.codeinline}>
          {children}
        </Text>
      )
    },
    // Headings
    heading1: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading1}>
        {children}
      </Text>
    ),
    heading2: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading2}>
        {children}
      </Text>
    ),
    heading3: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading3}>
        {children}
      </Text>
    ),
    heading4: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading4}>
        {children}
      </Text>
    ),
    heading5: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading5}>
        {children}
      </Text>
    ),
    heading6: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.heading6}>
        {children}
      </Text>
    ),
    // Lists
    bullet_list: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.bulletList}>
        {children}
      </View>
    ),
    ordered_list: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.bulletList}>
        {children}
      </View>
    ),
    list_item: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.listItem}>
        <Text style={markdownStyles.bullet}>{'\u2022 '}</Text>
        <View style={markdownStyles.listItemContent}>{children}</View>
      </View>
    ),
    // Blockquote
    blockquote: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.blockquote}>
        {children}
      </View>
    ),
    // Links
    link: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.link}>
        {children}
      </Text>
    ),
    // Bold
    strong: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.strong}>
        {children}
      </Text>
    ),
    // Italic
    italic: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.italic}>
        {children}
      </Text>
    ),
    // Strikethrough
    s: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.s}>
        {children}
      </Text>
    ),
    // Horizontal rule
    hr: (node, children, parent, styles) => <View key={node.key} style={markdownStyles.hr} />,
    // Paragraph
    paragraph: (node, children, parent, styles) => (
      <Text key={node.key} style={markdownStyles.paragraph}>
        {children}
      </Text>
    ),
    // Hard break
    hardbreak: (node, children, parent, styles) => <Text key={node.key}>{"\n"}</Text>,
    // Soft break
    softbreak: (node, children, parent, styles) => <Text key={node.key}>{"\n"}</Text>,
    // Table
    table: (node, children, parent, styles) => (
      <ScrollView horizontal key={node.key} style={markdownStyles.tableContainer}>
        <View>{children}</View>
      </ScrollView>
    ),
    tbody: (node, children, parent, styles) => (
      <View key={node.key}>{children}</View>
    ),
    thead: (node, children, parent, styles) => (
      <View key={node.key}>{children}</View>
    ),
    tr: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.tableRow}>
        {children}
      </View>
    ),
    th: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.tableCellHeader}>
        <Text style={markdownStyles.tableCellText}>{children}</Text>
      </View>
    ),
    td: (node, children, parent, styles) => (
      <View key={node.key} style={markdownStyles.tableCell}>
        <Text style={markdownStyles.tableCellText}>{children}</Text>
      </View>
    ),
  }

  const markdownStyles = StyleSheet.create({
    body: {
      color: Colors.primaryText,
      fontSize: 16,
      lineHeight: 24,
    },
    paragraph: {
      marginBottom: Spacing.MD,
      lineHeight: 24,
    },
    heading1: {
      fontSize: 24,
      fontWeight: '700',
      color: Colors.primaryText,
      marginTop: Spacing.LG,
      marginBottom: Spacing.SM,
    },
    heading2: {
      fontSize: 20,
      fontWeight: '600',
      color: Colors.primaryText,
      marginTop: Spacing.MD,
      marginBottom: Spacing.SM,
    },
    heading3: {
      fontSize: 18,
      fontWeight: '600',
      color: Colors.primaryText,
      marginTop: Spacing.SM,
      marginBottom: Spacing.XS,
    },
    heading4: {
      fontSize: 16,
      fontWeight: '600',
      color: Colors.primaryText,
      marginTop: Spacing.SM,
      marginBottom: Spacing.XS,
    },
    heading5: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.primaryText,
      marginTop: Spacing.SM,
      marginBottom: Spacing.XS,
    },
    heading6: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.primaryText,
      marginTop: Spacing.SM,
      marginBottom: Spacing.XS,
    },
    codeinline: {
      backgroundColor: Colors.inputBackground,
      color: Colors.accentLight,
      fontFamily: 'Menlo',
      fontSize: 13,
      paddingHorizontal: Spacing.SM,
      paddingVertical: 2,
      borderRadius: 4,
    },
    bulletList: {
      marginVertical: Spacing.SM,
    },
    listItem: {
      flexDirection: 'row',
      marginBottom: Spacing.XS,
    },
    bullet: {
      color: Colors.primaryText,
      marginRight: Spacing.SM,
    },
    listItemContent: {
      flex: 1,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: Colors.accent,
      paddingLeft: Spacing.MD,
      marginVertical: Spacing.SM,
      opacity: 0.85,
    },
    link: {
      color: Colors.accent,
      textDecorationLine: 'underline',
    },
    strong: {
      fontWeight: '700',
      color: Colors.primaryText,
    },
    italic: {
      fontStyle: 'italic',
    },
    s: {
      textDecorationLine: 'line-through',
    },
    hr: {
      height: 1,
      backgroundColor: Colors.chipBorder,
      marginVertical: Spacing.MD,
    },
    tableContainer: {
      marginVertical: Spacing.SM,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: Colors.chipBorder,
    },
    tableCell: {
      padding: Spacing.SM,
      borderRightWidth: 1,
      borderRightColor: Colors.chipBorder,
    },
    tableCellHeader: {
      padding: Spacing.SM,
      borderRightWidth: 1,
      borderRightColor: Colors.chipBorder,
      backgroundColor: Colors.inputBackground,
    },
    tableCellText: {
      fontSize: 14,
      color: Colors.primaryText,
    },
  })

  return (
    <Markdown style={markdownStyles} rules={rules} mergeStyle={false}>
      {content}
    </Markdown>
  )
}

export default MarkdownView
