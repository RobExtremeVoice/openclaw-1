import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'
import { useSettings } from '../hooks/useSettings'

interface Props {
  onBack: () => void
}

const SettingsView: React.FC<Props> = ({ onBack }) => {
  const { settings, updateSettings } = useSettings()
  const [githubUsername, setGithubUsername] = useState(settings.githubUsername)
  const [gatewayUrl, setGatewayUrl] = useState(settings.gatewayUrl)
  const [gatewayToken, setGatewayToken] = useState(settings.gatewayToken || '')

  const handleSave = async () => {
    await updateSettings({
      githubUsername,
      gatewayUrl: gatewayUrl.trim(),
      gatewayToken: gatewayToken.trim() || undefined,
    })
    Alert.alert('Settings Saved', 'Your settings have been saved successfully.')
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* GitHub Username */}
        <View style={styles.section}>
          <Text style={styles.label}>GitHub Username</Text>
          <TextInput
            style={styles.input}
            value={githubUsername}
            onChangeText={setGithubUsername}
            placeholder="Enter your GitHub username"
            placeholderTextColor={Colors.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>Used to fetch your public repositories</Text>
        </View>

        {/* Gateway URL */}
        <View style={styles.section}>
          <Text style={styles.label}>Gateway URL</Text>
          <TextInput
            style={styles.input}
            value={gatewayUrl}
            onChangeText={setGatewayUrl}
            placeholder="ws://192.168.1.x:18789"
            placeholderTextColor={Colors.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>WebSocket URL of your clawdbot gateway</Text>
        </View>

        {/* Gateway Token */}
        <View style={styles.section}>
          <Text style={styles.label}>Gateway Token (Optional)</Text>
          <TextInput
            style={styles.input}
            value={gatewayToken}
            onChangeText={setGatewayToken}
            placeholder="Enter gateway token if required"
            placeholderTextColor={Colors.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>Required if gateway auth is enabled (check ~/.clawdbot/clawdbot.json)</Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  content: {
    flex: 1,
    padding: Spacing.LG,
  },
  section: {
    marginBottom: Spacing.XL,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
    marginBottom: Spacing.SM,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: Radius.MD,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.MD,
    fontSize: 16,
    color: Colors.primaryText,
    marginBottom: Spacing.XS,
  },
  hint: {
    fontSize: 12,
    color: Colors.tertiaryText,
  },
  saveButton: {
    backgroundColor: Colors.buttonPrimary,
    borderRadius: Radius.Full,
    paddingVertical: Spacing.MD,
    alignItems: 'center',
    marginTop: Spacing.LG,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.buttonPrimaryText,
  },
})

export default SettingsView
