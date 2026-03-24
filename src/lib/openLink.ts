/**
 * Opens a URL in the system's default browser.
 * Uses Tauri's plugin-opener when running inside the desktop app,
 * falls back to a normal anchor click in plain browser contexts.
 */
export function openLink(url: string): void {
  if (!url) return
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url)).catch(() => {})
  } else {
    const a = Object.assign(document.createElement('a'), {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}
