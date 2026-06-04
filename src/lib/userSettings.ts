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
  morningRitualStart: string     // 'HH:MM' — window when NOT_STARTED overlay appears
  morningRitualEnd: string       // 'HH:MM'
  // Focus
  focusDefaultMinutes: number    // 25 | 52 | 90
  focusShortBreak: number        // minutes
  focusLongBreak: number         // minutes
  focusAmbientSound: 'none' | 'brown' | 'rain'
  focusAmbientVolume: number     // 0–1
  // Performance
  adherenceTarget: number        // % below which adherence badge shows (default 90)
  gradeA: number                 // % threshold for A grade (default 90)
  gradeB: number                 // % threshold for B grade (default 75)
  gradeC: number                 // % threshold for C grade (default 60)
  // CRM
  crmWeeklyConvTarget: number    // Jacob's single KPI — conversations per week (default 6)
}

const DEFAULTS: UserSettings = {
  notifMorningEnabled: true,
  notifMorningTime: '08:00',
  notifEveningEnabled: true,
  notifEveningTime: '20:00',
  notifWeeklyEnabled: true,
  notifWeeklyDay: 0,
  notifWeeklyTime: '17:00',
  morningRitualStart: '05:00',
  morningRitualEnd: '10:00',
  focusDefaultMinutes: 25,
  focusShortBreak: 5,
  focusLongBreak: 15,
  focusAmbientSound: 'none',
  focusAmbientVolume: 0.25,
  adherenceTarget: 90,
  gradeA: 90,
  gradeB: 75,
  gradeC: 60,
  crmWeeklyConvTarget: 6,
}

const KEY = 'rethink_settings'
const SETTINGS_CHANGED_EVENT = 'rethink_settings_changed'

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
  const next = { ...current, ...partial }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent<UserSettings>(SETTINGS_CHANGED_EVENT, { detail: next }))
}

export function areNotificationsEnabled(settings: UserSettings = getSettings()): boolean {
  return settings.notifMorningEnabled || settings.notifEveningEnabled || settings.notifWeeklyEnabled
}

export function useUserSettings(): [UserSettings, (partial: Partial<UserSettings>) => void] {
  const [settings, setSettings] = useState<UserSettings>(getSettings)

  useEffect(() => {
    const syncSettings = () => setSettings(getSettings())
    const handleSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<UserSettings>
      setSettings(customEvent.detail ?? getSettings())
    }

    syncSettings()
    window.addEventListener('storage', syncSettings)
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    return () => {
      window.removeEventListener('storage', syncSettings)
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    }
  }, [])

  const update = (partial: Partial<UserSettings>) => {
    saveSettings(partial)
    setSettings(getSettings())
  }

  return [settings, update]
}
