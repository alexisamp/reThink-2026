import { useState, useEffect } from 'react'

export interface UserSettings {
  // Notifications
  notifMorningEnabled: boolean
  notifMorningTime: string       // 'HH:MM'
  notifEveningEnabled: boolean
  notifEveningTime: string       // 'HH:MM'
  notifWeeklyEnabled: boolean
  notifWeeklyDay: number         // 0=Sun, 1=Mon ... 6=Sat
  notifWeeklyTime: string        // 'HH:MM'
  // Focus
  focusDefaultMinutes: number    // 25 | 52 | 90
  focusAmbientSound: 'none' | 'brown' | 'rain'
  focusAmbientVolume: number     // 0–1
}

const DEFAULTS: UserSettings = {
  notifMorningEnabled: true,
  notifMorningTime: '08:00',
  notifEveningEnabled: true,
  notifEveningTime: '20:00',
  notifWeeklyEnabled: true,
  notifWeeklyDay: 0,
  notifWeeklyTime: '17:00',
  focusDefaultMinutes: 25,
  focusAmbientSound: 'none',
  focusAmbientVolume: 0.25,
}

const KEY = 'rethink_settings'

export function getSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial: Partial<UserSettings>): void {
  const current = getSettings()
  localStorage.setItem(KEY, JSON.stringify({ ...current, ...partial }))
}

export function useUserSettings(): [UserSettings, (partial: Partial<UserSettings>) => void] {
  const [settings, setSettings] = useState<UserSettings>(getSettings)

  useEffect(() => {
    setSettings(getSettings())
  }, [])

  const update = (partial: Partial<UserSettings>) => {
    saveSettings(partial)
    setSettings(getSettings())
  }

  return [settings, update]
}
