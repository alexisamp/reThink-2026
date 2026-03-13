import { useState, useCallback } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdaterState {
  status: UpdateStatus
  update: Update | null
  progress: number        // 0-100, only meaningful during 'downloading'
  error: string | null
  lastChecked: Date | null
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    status: 'idle',
    update: null,
    progress: 0,
    error: null,
    lastChecked: null,
  })

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const checkForUpdates = useCallback(async () => {
    if (!isTauri) return
    setState(s => ({ ...s, status: 'checking', error: null }))
    try {
      const update = await check()
      const now = new Date()
      if (!update) {
        setState(s => ({ ...s, status: 'up-to-date', lastChecked: now }))
        return
      }
      setState(s => ({ ...s, status: 'available', update, lastChecked: now }))
    } catch (e) {
      setState(s => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        lastChecked: new Date(),
      }))
    }
  }, [isTauri])

  const downloadAndInstall = useCallback(async () => {
    if (!state.update) return
    setState(s => ({ ...s, status: 'downloading', progress: 0 }))
    try {
      let downloaded = 0
      let total = 0
      await state.update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0
          setState(s => ({ ...s, progress: pct }))
        } else if (event.event === 'Finished') {
          setState(s => ({ ...s, status: 'ready', progress: 100 }))
        }
      })
      // If Finished event didn't fire (older plugin versions)
      setState(s => s.status === 'downloading' ? { ...s, status: 'ready', progress: 100 } : s)
    } catch (e) {
      setState(s => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }, [state.update])

  const restartApp = useCallback(async () => {
    await relaunch()
  }, [])

  return { ...state, isTauri, checkForUpdates, downloadAndInstall, restartApp }
}
