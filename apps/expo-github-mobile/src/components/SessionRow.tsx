import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing } from '../theme/colors'
import { Session, getFullName } from '../models/types'

interface Props {
  session: Session
  onPress: () => void
}

const SessionRow: React.FC<Props> = ({ session, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {session.title}
        </Text>
        <Text style={styles.repoName}>{getFullName(session.repository)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
  },
  textContainer: {
    flex: 1,
    gap: Spacing.XS,
  },
  title: {
    fontSize: 16,
    color: Colors.primaryText,
  },
  repoName: {
    fontSize: 14,
    color: Colors.secondaryText,
  },
})

export default SessionRow
