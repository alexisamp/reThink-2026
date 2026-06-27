import { invoke, isTauri } from '@tauri-apps/api/core'

export const TAURI_OAUTH_REDIRECT = 'rethink://oauth-callback'

export function isRunningInTauri() {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown
    isTauri?: boolean
  }
  return (
    isTauri() ||
    tauriWindow.isTauri === true ||
    typeof tauriWindow.__TAURI_INTERNALS__ !== 'undefined' ||
    window.location.protocol === 'tauri:' ||
    window.location.origin === 'http://localhost:1420'
  )
}

export async function openInSystemBrowser(url: string) {
  try {
    await invoke('open_url_in_browser', { url })
  } catch {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  }
}
