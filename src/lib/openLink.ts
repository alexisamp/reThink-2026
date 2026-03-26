import { invoke } from '@tauri-apps/api/core'

/**
 * Opens a URL in the system's default browser.
 * In Tauri: uses a custom Rust command (open on macOS) — most reliable approach.
 * In browser: falls back to window.open.
 */
export function openLink(url: string): void {
  if (!url) return
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    invoke('open_url_in_browser', { url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
