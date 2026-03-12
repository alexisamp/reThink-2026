import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

type ShortcutMap = Record<string, () => void>

/**
 * Global keyboard shortcut handler.
 * Ignores shortcuts when focus is inside an input/textarea/contenteditable.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'

      // Build key string: "cmd+1", "cmd+shift+r", "1", etc.
      const parts: string[] = []
      if (e.metaKey) parts.push('cmd')
      if (e.ctrlKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')
      parts.push(e.key.toLowerCase())
      const key = parts.join('+')

      const action = shortcuts[key]
      if (!action) return

      // Allow cmd+* shortcuts even in inputs (nav shortcuts)
      const isCmdShortcut = e.metaKey || e.ctrlKey
      if (inInput && !isCmdShortcut) return

      e.preventDefault()
      action()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}

/**
 * App-level navigation shortcuts.
 * ⌘1 → Today, ⌘2 → Monthly, ⌘3 → Dashboard
 */
export function useNavShortcuts() {
  const navigate = useNavigate()

  useKeyboardShortcuts({
    'cmd+1': () => navigate('/today'),
    'cmd+2': () => navigate('/monthly'),
    'cmd+3': () => navigate('/dashboard'),
  })
}
