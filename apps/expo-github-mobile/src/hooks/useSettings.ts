import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SETTINGS_KEY = '@clawdbot_settings'

export interface Settings {
  githubUsername: string
  gatewayUrl: string
  gatewayToken?: string
}

// Default settings from environment variables
const DEFAULT_SETTINGS: Settings = {
  githubUsername: process.env.EXPO_PUBLIC_GITHUB_USERNAME || '',
  gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || 'ws://localhost:18789',
  gatewayToken: process.env.EXPO_PUBLIC_GATEWAY_TOKEN || '',
}

export const loadSettings = async (): Promise<Settings> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>
      // Merge with defaults (env vars take precedence for empty saved values)
      return {
        githubUsername: saved.githubUsername || DEFAULT_SETTINGS.githubUsername,
        gatewayUrl: saved.gatewayUrl || DEFAULT_SETTINGS.gatewayUrl,
        gatewayToken: saved.gatewayToken || DEFAULT_SETTINGS.gatewayToken,
      }
    }
    return DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const saveSettings = async (settings: Settings): Promise<void> => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings', e)
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates }
    setSettings(newSettings)
    await saveSettings(newSettings)
  }, [settings])

  return { settings, updateSettings, loading }
}
