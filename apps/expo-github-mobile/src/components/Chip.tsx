import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'

interface Props {
  icon?: string
  text: string
  secondaryText?: string
}

const Chip: React.FC<Props> = ({ icon, text, secondaryText }) => {
  return (
    <View style={styles.container}>
      {icon && <Ionicons name={icon as any} size={16} color={Colors.primaryText} />}
      {secondaryText ? (
        <>
          <Text style={styles.secondaryLabel}>{text}</Text>
          <Text style={styles.text}>{secondaryText}</Text>
        </>
      ) : (
        <Text style={styles.text}>{text}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.Full,
    borderWidth: 1,
    borderColor: Colors.chipBorder,
  },
  secondaryLabel: {
    fontSize: 12,
    color: Colors.secondaryText,
  },
  text: {
    fontSize: 14,
    color: Colors.primaryText,
  },
})

export default Chip
