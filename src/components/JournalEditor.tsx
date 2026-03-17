import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { CaptureType } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────
const CAPTURE_TYPES: CaptureType[] = ['idea', 'learning', 'reflection', 'decision', 'win', 'question']

const CAPTURE_MENU = [
  { type: 'idea'       as CaptureType, label: '/idea',       desc: 'idea o concepto' },
  { type: 'learning'   as CaptureType, label: '/learning',   desc: 'algo aprendido' },
  { type: 'reflection' as CaptureType, label: '/reflection', desc: 'reflexión personal' },
  { type: 'decision'   as CaptureType, label: '/decision',   desc: 'decisión tomada' },
  { type: 'win'        as CaptureType, label: '/win',        desc: 'logro o victoria' },
  { type: 'question'   as CaptureType, label: '/question',   desc: 'pregunta abierta' },
]

// Inline styles per capture type (avoids Tailwind purge issues in innerHTML)
// goal/milestone/win/idea/learning/decision → green tones; question/reflection → gray
const PILL_STYLE: Record<CaptureType, string> = {
  idea:       'background:#E5F9BD;border:1px solid rgba(121,214,94,0.4);color:#003720',
  learning:   'background:rgba(121,214,94,0.3);border:1px solid rgba(121,214,94,0.4);color:#003720',
  reflection: 'background:rgba(227,227,227,0.4);border:1px solid rgba(227,227,227,0.8);color:rgba(83,100,113,0.7)',
  decision:   'background:rgba(0,55,32,0.08);border:1px solid rgba(0,55,32,0.15);color:#003720',
  win:        'background:#79D65E;border:1px solid rgba(121,214,94,0.6);color:#003720',
  question:   'background:rgba(227,227,227,0.5);border:1px solid #E3E3E3;color:#536471',
}

const PILL_BASE = [
  'display:inline-flex',
  'align-items:center',
  'padding:1px 9px',
  'border-radius:9999px',
  'font-size:11px',
  'font-weight:500',
  'cursor:pointer',
  'margin:0 2px',
  'vertical-align:middle',
  'user-select:none',
  'white-space:nowrap',
].join(';')

// ── Serialization helpers ──────────────────────────────────────────────────────

/** Stored text → innerHTML with pill spans */
export function deserializeToHTML(text: string): string {
  // Backward compat: convert old block format /type title lines
  const normalized = text.replace(/^\/(\w+)\s+(.+)$/gm, (_, t, title) =>
    CAPTURE_TYPES.includes(t as CaptureType) ? `[~${t}:${title}~]` : `/${t} ${title}`
  )
  // Escape HTML
  const escaped = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Replace inline markers with pill spans.
  // Handles both 2-part [~type:title~] and 5-part [~type:title:gid:mid:tid~] formats.
  const withPills = escaped.replace(
    /\[~(\w+):([^\]~:]+)(?::([^~\]]*):([^~\]]*):([^~\]]*))?~\]/g,
    (_, type, title, gid, mid, tid) => {
      if (!CAPTURE_TYPES.includes(type as CaptureType)) return `[~${type}:${title}~]`
      const s = PILL_STYLE[type as CaptureType]
      return (
        `<span ` +
        `data-capture-pill="" ` +
        `data-type="${type}" ` +
        `data-title="${title}" ` +
        `data-goal-id="${gid ?? ''}" ` +
        `data-milestone-id="${mid ?? ''}" ` +
        `data-todo-id="${tid ?? ''}" ` +
        `contenteditable="false" ` +
        `style="${s};${PILL_BASE}"` +
        `>${type} · ${title}</span>`
      )
    }
  )
  // Newlines → <br>
  return withPills.replace(/\n/g, '<br>')
}

/** contentEditable DOM → stored text with [~type:title:gid:mid:tid~] markers (new 5-part format) */
export function serializeFromDOM(div: HTMLDivElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    const el = node as HTMLElement
    if (el.hasAttribute('data-capture-pill')) {
      const type = el.getAttribute('data-type') ?? ''
      const title = el.getAttribute('data-title') ?? ''
      const gid = el.getAttribute('data-goal-id') ?? ''
      const mid = el.getAttribute('data-milestone-id') ?? ''
      const tid = el.getAttribute('data-todo-id') ?? ''
      return `[~${type}:${title}:${gid}:${mid}:${tid}~]`
    }
    if (el.tagName === 'BR') return '\n'
    // Chrome wraps new paragraphs in <div> when pressing Enter
    if (el.tagName === 'DIV') {
      const inner = Array.from(el.childNodes).map(walk).join('')
      // Only prepend \n if not the very first child of the root
      return '\n' + inner
    }
    return Array.from(el.childNodes).map(walk).join('')
  }
  const lines = Array.from(div.childNodes).map(walk).join('')
  return lines.trimEnd()
}

// ── Component ──────────────────────────────────────────────────────────────────

interface JournalEditorProps {
  value: string
  onChange: (value: string) => void
  onPillClick: (type: CaptureType, title: string) => void
  onCaptureCreate?: (type: CaptureType, title: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  onScoreText?: (text: string) => void
  hasAiScorer?: boolean
}

export function JournalEditor({
  value,
  onChange,
  onPillClick,
  onCaptureCreate,
  onFocus,
  onBlur,
  placeholder = "What's on your mind…",
  className = '',
  onScoreText,
  hasAiScorer = false,
}: JournalEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  // Track the last value we set externally so we don't re-render on our own changes
  const lastExternal = useRef<string>('')

  const [dropdown, setDropdown] = useState<{
    items: typeof CAPTURE_MENU
    selectedIdx: number
  } | null>(null)
  const dropdownRef = useRef(dropdown)
  dropdownRef.current = dropdown

  // ── Sync external value → DOM ────────────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value === lastExternal.current) return // our own change, skip
    lastExternal.current = value
    const html = deserializeToHTML(value)
    el.innerHTML = html
    attachPillListeners(el)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function attachPillListeners(el: HTMLDivElement) {
    el.querySelectorAll('[data-capture-pill]').forEach(pill => {
      ;(pill as HTMLElement).onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const type = pill.getAttribute('data-type') as CaptureType
        const title = pill.getAttribute('data-title') || ''
        onPillClick(type, title)
      }
    })
  }

  // ── Replace /type... text with /type + space so user can type the title ──
  const startTitleInput = useCallback((type: CaptureType) => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cur = range.startOffset
      const slashIdx = text.lastIndexOf('/', cur)
      if (slashIdx >= 0) {
        const prefix = `/${type} `
        textNode.textContent = text.slice(0, slashIdx) + prefix + text.slice(cur)
        const newOffset = slashIdx + prefix.length
        const r = document.createRange()
        r.setStart(textNode, newOffset)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
    setDropdown(null)
    // Emit updated value
    if (el) {
      const s = serializeFromDOM(el)
      lastExternal.current = s
      onChange(s)
    }
  }, [onChange])

  // ── Insert a pill at cursor ────────────────────────────────────────────────
  const insertPill = useCallback(
    (type: CaptureType, title: string, goalId?: string | null, milestoneId?: string | null, todoId?: string | null) => {
      const el = editorRef.current
      if (!el) return
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return

      // Remove the /type... text before cursor in the current text node
      const range = sel.getRangeAt(0)
      const textNode = range.startContainer
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent || ''
        const cur = range.startOffset
        const slashIdx = text.lastIndexOf('/', cur - 1)
        if (slashIdx >= 0) {
          textNode.textContent = text.slice(0, slashIdx) + text.slice(cur)
          range.setStart(textNode, slashIdx)
          range.setEnd(textNode, slashIdx)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }

      // Build pill element with new 5-part data attributes
      const pill = document.createElement('span')
      pill.setAttribute('data-capture-pill', '')
      pill.setAttribute('data-type', type)
      pill.setAttribute('data-title', title)
      pill.setAttribute('data-goal-id', goalId ?? '')
      pill.setAttribute('data-milestone-id', milestoneId ?? '')
      pill.setAttribute('data-todo-id', todoId ?? '')
      pill.setAttribute('contenteditable', 'false')
      pill.style.cssText = `${PILL_STYLE[type]};${PILL_BASE}`
      pill.textContent = `${type} · ${title}`
      pill.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onPillClick(type, title)
      }

      // Insert pill at cursor
      const cur = sel.getRangeAt(0)
      cur.collapse(true)
      cur.insertNode(pill)

      // Insert a text node right after pill so the user can continue typing
      // on the same line without Chrome creating a new block element
      const spacerText = document.createTextNode('\u00A0') // non-breaking space
      pill.after(spacerText)

      // Move cursor to the start of the spacer text node
      const after = document.createRange()
      after.setStart(spacerText, 0)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)

      // Emit updated value
      const serialized = serializeFromDOM(el)
      lastExternal.current = serialized
      onChange(serialized)
      setDropdown(null)
    },
    [onChange, onPillClick]
  )

  // ── Input handler ──────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    const el = editorRef.current
    if (!el) return

    const serialized = serializeFromDOM(el)
    lastExternal.current = serialized
    onChange(serialized)

    // Detect /type trigger for dropdown
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const cur = range.startOffset
      const before = text.slice(0, cur)
      const m = before.match(/\/(\w*)$/)
      if (m) {
        const q = m[1].toLowerCase()
        const filtered = CAPTURE_MENU.filter(t => t.type.startsWith(q))
        if (filtered.length > 0) {
          setDropdown({ items: filtered, selectedIdx: 0 })
          return
        }
      }
    }
    setDropdown(null)
  }, [onChange])

  // ── KeyDown handler ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dd = dropdownRef.current

      // ── Dropdown navigation ──
      if (dd && dd.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setDropdown(d => d ? { ...d, selectedIdx: Math.min(d.selectedIdx + 1, d.items.length - 1) } : d)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setDropdown(d => d ? { ...d, selectedIdx: Math.max(d.selectedIdx - 1, 0) } : d)
          return
        }
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          setDropdown(null)
          return
        }
      }

      // ── Enter: commit capture or insert line break ──
      if (e.key === 'Enter') {
        e.preventDefault()
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) return
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || ''
          const cur = range.startOffset
          const before = text.slice(0, cur)
          // Check for /type title pattern before cursor
          const m = before.match(/\/(\w+)\s+(.+)$/)
          if (m && CAPTURE_TYPES.includes(m[1] as CaptureType)) {
            const captureType = m[1] as CaptureType
            const captureTitle = m[2].trim()
            insertPill(captureType, captureTitle)
            onCaptureCreate?.(captureType, captureTitle)
            return
          }
          // If dropdown open and user presses Enter — switch to title-input mode
          if (dd && dd.items.length > 0) {
            const selected = dd.items[dd.selectedIdx]
            startTitleInput(selected.type)
            return
          }
        }
        // Normal Enter → insert <br>
        const br = document.createElement('br')
        const range2 = sel.getRangeAt(0)
        range2.deleteContents()
        range2.insertNode(br)
        // Insert a second br if at the end so cursor is visible
        const afterBr = document.createRange()
        afterBr.setStartAfter(br)
        afterBr.collapse(true)
        // Check if br is at end of its parent with nothing after
        if (!br.nextSibling || (br.nextSibling.nodeType === Node.TEXT_NODE && br.nextSibling.textContent === '')) {
          const spacer = document.createElement('br')
          br.after(spacer)
          afterBr.setStartBefore(spacer)
          afterBr.collapse(true)
        }
        sel.removeAllRanges()
        sel.addRange(afterBr)
        // Emit
        const el = editorRef.current
        if (el) {
          const s = serializeFromDOM(el)
          lastExternal.current = s
          onChange(s)
        }
        setDropdown(null)
        return
      }

      // ── Prevent keyboard deletion of pills ──
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) return
        const range = sel.getRangeAt(0)

        // If selection contains a pill → block
        if (!range.collapsed) {
          if (range.cloneContents().querySelector('[data-capture-pill]')) {
            e.preventDefault()
            return
          }
          return // allow normal deletion of non-pill selection
        }

        // Collapsed: check adjacency
        if (e.key === 'Backspace') {
          const { startContainer, startOffset } = range
          if (startOffset === 0) {
            const prev = startContainer.previousSibling
            if (prev && (prev as HTMLElement).hasAttribute?.('data-capture-pill')) {
              e.preventDefault()
            }
          }
        }
        if (e.key === 'Delete') {
          const { startContainer, startOffset } = range
          const textLen =
            startContainer.nodeType === Node.TEXT_NODE
              ? (startContainer.textContent || '').length
              : 0
          if (startOffset === textLen) {
            const next = startContainer.nextSibling
            if (next && (next as HTMLElement).hasAttribute?.('data-capture-pill')) {
              e.preventDefault()
            }
          }
        }
      }
    },
    [insertPill, startTitleInput, onCaptureCreate, onChange]
  )

  // ── Paste: strip HTML, keep plain text ────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  return (
    <div className="relative">
      {/* ── Dropdown ── */}
      {dropdown && dropdown.items.length > 0 && (
        <div className="mb-1 bg-white border border-mercury rounded-xl shadow-sm overflow-hidden min-w-[180px]">
          {dropdown.items.map((item, idx) => (
            <button
              key={item.type}
              onMouseDown={e => {
                e.preventDefault()
                startTitleInput(item.type)
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                idx === dropdown.selectedIdx
                  ? 'bg-gossip/30 text-burnham'
                  : 'text-shuttle hover:bg-mercury/30'
              }`}
            >
              <span className="font-mono text-burnham">{item.label}</span>
              <span className="text-shuttle/50">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Hint: shown after type is selected, waiting for title ── */}
      {!dropdown && (() => {
        const el = editorRef.current
        if (!el) return null
        const text = el.innerText || ''
        const m = text.match(/\/(\w+) $/)
        if (m && CAPTURE_TYPES.includes(m[1] as CaptureType)) {
          return (
            <p className="text-[10px] text-shuttle/30 font-mono mb-1">
              type title, then ↵ to create {m[1]}
            </p>
          )
        }
        return null
      })()}

      {/* ── Editor ── */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={onFocus}
          onBlur={onBlur}
          data-placeholder={placeholder}
          className={`min-h-[160px] w-full text-xs text-burnham leading-relaxed outline-none journal-editor ${className}`}
          style={{ wordBreak: 'break-word' }}
        />
        {/* AI wand lives in CaptureModal title, not here */}
      </div>
    </div>
  )
}
