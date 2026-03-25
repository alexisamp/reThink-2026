import { openUrl } from '@tauri-apps/plugin-opener'

/**
 * Opens a URL in the system's default browser.
 * Always tries Tauri's plugin-opener first (correct path in the desktop app).
 * Falls back to window.open if Tauri IPC is unavailable (pure browser context).
 */
export function openLink(url: string): void {
  if (!url) return
  openUrl(url).catch(() => {
    // Fallback for non-Tauri contexts (e.g. web browser preview)
    window.open(url, '_blank', 'noopener,noreferrer')
  })
}
