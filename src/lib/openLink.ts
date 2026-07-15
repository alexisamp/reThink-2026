import { invoke } from '@tauri-apps/api/core'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Opens a URL in the system's default browser.
 * In Tauri: uses a custom Rust command (open on macOS) — most reliable approach.
 * In browser: falls back to window.open.
 */
export function openLink(url: string): void {
  if (!url) return
  if (isTauriRuntime()) {
    invoke('open_url_in_browser', { url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export async function openFileInBrowser(pathOrUrl: string): Promise<void> {
  if (!pathOrUrl) return
  if (isTauriRuntime()) {
    await invoke('open_file_in_default_browser', { pathOrUrl })
    return
  }
  window.open(pathOrUrl, '_blank', 'noopener,noreferrer')
}
