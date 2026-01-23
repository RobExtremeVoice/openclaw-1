import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'
import { useAppState } from '../contexts/AppContext'
import {
  Repository,
  Session,
  AIModel,
  AIModels,
  allModels,
} from '../models/types'
import MessageInputView from './MessageInputView'
import Chip from './Chip'

interface Props {
  visible: boolean
  onClose: () => void
  onSessionCreate: (session: Session) => void
}

const NewSessionSheet: React.FC<Props> = ({ visible, onClose, onSessionCreate }) => {
  const { repositories, createNewSession, sendMessage } = useAppState()
  const [messageText, setMessageText] = useState('')
  const [selectedRepository, setSelectedRepository] = useState<Repository | undefined>()
  const [selectedModel, setSelectedModel] = useState<AIModel>(AIModels.sonnet)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showRepoPicker, setShowRepoPicker] = useState(false)

  useEffect(() => {
    if (visible && repositories.length > 0 && !selectedRepository) {
      setSelectedRepository(repositories[0])
    }
  }, [visible, repositories])

  const handleCreateSession = () => {
    if (!messageText.trim() || !selectedRepository) return

    const session = createNewSession(messageText.slice(0, 50), selectedRepository)
    sendMessage(messageText, session)
    setMessageText('')
    onSessionCreate(session)
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Session</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Content with keyboard avoidance */}
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1 }} />

          {/* Message input area */}
          <View style={styles.inputContainer}>
            <MessageInputView
              text={messageText}
              placeholder="Ask Claude to help with code..."
              onChangeText={setMessageText}
              onSend={handleCreateSession}
            />

            {/* Bottom chips */}
            <View style={styles.chipsContainer}>
              <TouchableOpacity
                style={styles.chip}
                onPress={() => setShowModelPicker(true)}
              >
                <Ionicons name="cube-outline" size={16} color={Colors.primaryText} />
                <Text style={styles.chipText}>{selectedModel.displayName}</Text>
                <Ionicons name="chevron-down" size={12} color={Colors.primaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.chip}
                onPress={() => setShowRepoPicker(true)}
              >
                <Ionicons name="folder-outline" size={16} color={Colors.primaryText} />
                <Text style={styles.chipText}>
                  {selectedRepository?.name || 'Select repo'}
                </Text>
              </TouchableOpacity>

              {selectedRepository && (
                <View style={styles.chip}>
                  <Ionicons name="git-branch-outline" size={16} color={Colors.primaryText} />
                  <Text style={styles.chipText}>{selectedRepository.defaultBranch}</Text>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Model Picker Modal */}
        <PickerModal
          visible={showModelPicker}
          onClose={() => setShowModelPicker(false)}
          title="Select Model"
        >
          {allModels.map((model) => (
            <PickerItem
              key={model.id}
              title={model.displayName}
              selected={selectedModel.id === model.id}
              onPress={() => {
                setSelectedModel(model)
                setShowModelPicker(false)
              }}
            />
          ))}
        </PickerModal>

        {/* Repository Picker Modal */}
        <PickerModal
          visible={showRepoPicker}
          onClose={() => setShowRepoPicker(false)}
          title="Select Repository"
        >
          {repositories.map((repo) => (
            <PickerItem
              key={repo.id}
              title={repo.name}
              subtitle={`${repo.owner}/${repo.name}`}
              selected={selectedRepository?.id === repo.id}
              onPress={() => {
                setSelectedRepository(repo)
                setShowRepoPicker(false)
              }}
            />
          ))}
        </PickerModal>
      </SafeAreaView>
    </Modal>
  )
}

// Picker Modal Component
const PickerModal: React.FC<{
  visible: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}> = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancelButton}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView>{children}</ScrollView>
    </SafeAreaView>
  </Modal>
)

// Picker Item Component
const PickerItem: React.FC<{
  title: string
  subtitle?: string
  selected: boolean
  onPress: () => void
}> = ({ title, subtitle, selected, onPress }) => (
  <TouchableOpacity style={styles.pickerItem} onPress={onPress}>
    <View>
      <Text style={styles.pickerItemTitle}>{title}</Text>
      {subtitle && <Text style={styles.pickerItemSubtitle}>{subtitle}</Text>}
    </View>
    {selected && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBackground,
  },
  cancelButton: {
    fontSize: 16,
    color: Colors.primaryText,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inputContainer: {
    paddingBottom: Spacing.LG,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
  },
  chip: {
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
  chipText: {
    fontSize: 14,
    color: Colors.primaryText,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBackground,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBackground,
  },
  pickerItemTitle: {
    fontSize: 16,
    color: Colors.primaryText,
  },
  pickerItemSubtitle: {
    fontSize: 13,
    color: Colors.secondaryText,
    marginTop: 2,
  },
})

export default NewSessionSheet
