import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties } from 'react'
import type { TodoMentionKind } from '@/types'
import type { Mention } from './types'
import {
  MENTION_CLIPBOARD,
  hasMentionTokens,
  legacyTextToEditorSegments,
  mentionKey,
  normalizeEditorSegments,
  plainTextFromEditorSegments,
  type EditorSegment,
} from '@/lib/todoContent'
import { hasStrongCrmMatch, rankCrmObjects } from '@/lib/crmObjects'

const KIND_LABEL: Record<TodoMentionKind, string> = {
  person: 'People',
  company: 'Companies',
  opportunity: 'Opportunities',
}

interface PickerAction {
  type: 'mention' | 'create'
  key: string
  kind: TodoMentionKind
  mention?: Mention
  label: string
}

function chipLabel(mention: Mention) {
  return mention.kind === 'person' ? mention.name.split(' ')[0] : mention.name
}

export function MentionChip({
  mention,
  onClick,
  selected,
  editor,
}: {
  mention: Mention
  onClick?: () => void
  selected?: boolean
  editor?: boolean
}) {
  const initial = (mention.name || '?').charAt(0).toUpperCase()
  const squared = mention.kind === 'company' || mention.kind === 'opportunity'
  return (
    <span
      className={[
        editor ? 'td-editor-chip' : 'td-chip-mention',
        onClick ? 'clickable' : '',
        selected ? 'selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={`av${squared ? ' sq' : ''}`}>
        {mention.imageUrl ? <img src={mention.imageUrl} alt="" /> : initial}
      </span>
      <span>{chipLabel(mention)}</span>
    </span>
  )
}

function createEditorChip(mention: Mention, selectedKey: string | null) {
  const chip = document.createElement('span')
  chip.className = `td-editor-chip${selectedKey === mentionKey(mention) ? ' selected' : ''}`
  chip.contentEditable = 'false'
  chip.dataset.mention = 'true'
  chip.dataset.kind = mention.kind
  chip.dataset.id = mention.id ?? ''
  chip.dataset.name = mention.name
  chip.dataset.imageUrl = mention.imageUrl ?? ''
  chip.dataset.companyId = mention.companyId ?? ''
  chip.dataset.key = mentionKey(mention)

  const initial = (mention.name || '?').charAt(0).toUpperCase()
  const squared = mention.kind !== 'person'
  const avatar = document.createElement('span')
  avatar.className = `av${squared ? ' sq' : ''}`
  if (mention.imageUrl) {
    const img = document.createElement('img')
    img.src = mention.imageUrl
    img.alt = ''
    avatar.append(img)
  } else {
    avatar.textContent = initial
  }
  const label = document.createElement('span')
  label.textContent = chipLabel(mention)
  chip.append(avatar, label)
  return chip
}

function chipToMention(node: HTMLElement): Mention {
  return {
    id: node.dataset.id || undefined,
    kind: (node.dataset.kind as TodoMentionKind) || 'person',
    name: node.dataset.name || 'Mention',
    imageUrl: node.dataset.imageUrl || null,
    companyId: node.dataset.companyId || null,
  }
}

function segmentsFromNodes(nodes: Node[]): EditorSegment[] {
  const out: EditorSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += text
    else out.push({ type: 'text', text })
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '')
      return
    }
    if (node instanceof HTMLElement && node.dataset.mention === 'true') {
      out.push({ type: 'mention', mention: chipToMention(node) })
      return
    }
    node.childNodes.forEach(walk)
  }
  nodes.forEach(walk)
  return normalizeEditorSegments(out)
}

function readSegments(root: HTMLElement): EditorSegment[] {
  return segmentsFromNodes(Array.from(root.childNodes))
}

function renderSegments(root: HTMLElement, segments: EditorSegment[], selectedKey: string | null) {
  root.innerHTML = ''
  for (const segment of segments) {
    root.append(segment.type === 'text'
      ? document.createTextNode(segment.text)
      : createEditorChip(segment.mention, selectedKey))
  }
}

function placeCaretAfter(node: Node) {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function placeCaretAtEnd(root: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function caretRect(range: Range) {
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  if (rect && (rect.width || rect.height)) return rect
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  range.insertNode(marker)
  const next = marker.getBoundingClientRect()
  marker.remove()
  return next
}

function getMentionTrigger(root: HTMLElement): { range: Range; query: string; rect: DOMRect } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null
  const text = range.startContainer.textContent ?? ''
  const left = text.slice(0, range.startOffset)
  const match = /(^|\s)@([^\s@/]*)$/.exec(left)
  if (!match || match.index === undefined) return null
  const triggerRange = document.createRange()
  triggerRange.setStart(range.startContainer, match.index + match[1].length)
  triggerRange.setEnd(range.startContainer, range.startOffset)
  return { range: triggerRange, query: match[2] ?? '', rect: caretRect(range.cloneRange()) }
}

function currentCompanyId(root: HTMLElement) {
  const company = Array.from(root.querySelectorAll<HTMLElement>('[data-mention="true"]'))
    .map(chipToMention)
    .find(m => m.kind === 'company')
  return company?.id ?? null
}

function insertSegments(root: HTMLElement, segments: EditorSegment[]) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return
  range.deleteContents()
  const frag = document.createDocumentFragment()
  let last: Node | null = null
  for (const segment of segments) {
    const node = segment.type === 'text'
      ? document.createTextNode(segment.text)
      : createEditorChip(segment.mention, null)
    frag.append(node)
    last = node
  }
  range.insertNode(frag)
  if (last) placeCaretAfter(last)
}

function chipNearCaret(root: HTMLElement, direction: 'previous' | 'next') {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  let node: Node | null = null
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    if (direction === 'previous' && range.startOffset === 0) node = range.startContainer.previousSibling
    if (direction === 'next' && range.startOffset === (range.startContainer.textContent ?? '').length) node = range.startContainer.nextSibling
  }
  if (range.startContainer === root) {
    node = direction === 'previous'
      ? root.childNodes[range.startOffset - 1]
      : root.childNodes[range.startOffset]
  }
  return node instanceof HTMLElement && node.dataset.mention === 'true' ? node : null
}

function removeChip(chip: HTMLElement) {
  const next = chip.nextSibling
  const prev = chip.previousSibling
  chip.remove()
  if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith(' ')) {
    next.textContent = next.textContent.slice(1)
  } else if (prev?.nodeType === Node.TEXT_NODE && prev.textContent?.endsWith(' ')) {
    prev.textContent = prev.textContent.slice(0, -1)
  }
}

function pickerActions(options: Mention[], query: string, usedKeys: Set<string>) {
  const ranked = rankCrmObjects(options, query, usedKeys, 18)
  const actions: PickerAction[] = ranked.map(mention => ({
    type: 'mention',
    key: mentionKey(mention),
    kind: mention.kind,
    mention,
    label: mention.name,
  }))
  const trimmed = query.trim()
  if (trimmed && !hasStrongCrmMatch(ranked, trimmed)) {
    ;(['person', 'company', 'opportunity'] as TodoMentionKind[]).forEach(kind => {
      actions.push({ type: 'create', key: `create:${kind}`, kind, label: trimmed })
    })
  }
  return actions
}

function MentionPicker({
  actions,
  selected,
  style,
  onPick,
}: {
  actions: PickerAction[]
  selected: number
  style: CSSProperties
  onPick: (action: PickerAction) => void
}) {
  const sections = (['person', 'company', 'opportunity'] as TodoMentionKind[]).map(kind => ({
    kind,
    actions: actions.filter(action => action.kind === kind),
  })).filter(section => section.actions.length > 0)

  return (
    <div className="td-mention-picker fixed" style={style}>
      {sections.length === 0 ? (
        <div className="td-mention-empty">No matches</div>
      ) : sections.map(section => (
        <div className="td-mention-section" key={section.kind}>
          <div className="td-mention-header">{KIND_LABEL[section.kind]}</div>
          {section.actions.map(action => {
            const globalIdx = actions.indexOf(action)
            const item = action.mention
            const initial = (item?.name || action.label || '?').charAt(0).toUpperCase()
            const squared = action.kind !== 'person'
            return (
              <button
                key={action.key}
                type="button"
                className={`td-mention-row${globalIdx === selected ? ' active' : ''}${action.type === 'create' ? ' create' : ''}`}
                onMouseDown={e => { e.preventDefault(); onPick(action) }}
              >
                <span className={`td-mention-avatar${squared ? ' sq' : ''}`}>
                  {item?.imageUrl ? <img src={item.imageUrl} alt="" /> : action.type === 'create' ? '+' : initial}
                </span>
                <span className="td-mention-copy">
                  <span className="name">{action.type === 'create' ? `Create ${action.kind} "${action.label}"` : action.label}</span>
                  {item?.sub && <span className="sub">{item.sub}</span>}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface MentionEditorProps {
  initialSegments: EditorSegment[]
  mentionOptions: Mention[]
  placeholder?: string
  autoFocus?: boolean
  onCommit: (segments: EditorSegment[]) => void
  onCancel: () => void
  onOpenMention: (mention: Mention) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
}

export default function MentionEditor({
  initialSegments,
  mentionOptions,
  placeholder,
  autoFocus,
  onCommit,
  onCancel,
  onOpenMention,
  onCreateMention,
}: MentionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Range | null>(null)
  const [trigger, setTrigger] = useState<{ query: string; rect: DOMRect } | null>(null)
  const [selected, setSelected] = useState(0)
  const [selectedChip, setSelectedChip] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const usedKeys = useMemo(() => new Set(initialSegments
    .filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention')
    .map(s => mentionKey(s.mention))), [initialSegments])
  const actions = useMemo(
    () => pickerActions(mentionOptions, trigger?.query ?? '', usedKeys),
    [mentionOptions, trigger?.query, usedKeys],
  )

  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    renderSegments(root, initialSegments, null)
    if (autoFocus) {
      root.focus()
      placeCaretAtEnd(root)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-mention="true"]').forEach(chip => {
      chip.classList.toggle('selected', chip.dataset.key === selectedChip)
    })
  }, [selectedChip])

  const refreshTrigger = () => {
    const root = editorRef.current
    if (!root) return
    const next = getMentionTrigger(root)
    triggerRef.current = next?.range ?? null
    setTrigger(next ? { query: next.query, rect: next.rect } : null)
    setSelected(0)
  }

  const commit = () => {
    const root = editorRef.current
    if (!root) return
    const segments = readSegments(root)
    if (plainTextFromEditorSegments(segments) || segments.some(s => s.type === 'mention')) onCommit(segments)
    else onCancel()
  }

  const pickAction = async (action: PickerAction) => {
    const root = editorRef.current
    const range = triggerRef.current
    if (!root || !range || creating) return
    setCreating(true)
    let mention = action.mention ?? null
    if (!mention && action.type === 'create') {
      mention = await onCreateMention(action.kind, action.label, action.kind === 'opportunity' ? currentCompanyId(root) : null)
    }
    setCreating(false)
    if (!mention) return
    range.deleteContents()
    const chip = createEditorChip(mention, null)
    range.insertNode(chip)
    const spacer = document.createTextNode(' ')
    chip.after(spacer)
    placeCaretAfter(spacer)
    if (mention.kind === 'opportunity' && mention.companyId && !readSegments(root).some(s => s.type === 'mention' && s.mention.kind === 'company')) {
      const company = mentionOptions.find(m => m.kind === 'company' && m.id === mention.companyId)
      if (company) {
        const companyChip = createEditorChip(company, null)
        spacer.after(companyChip, document.createTextNode(' '))
        placeCaretAfter(companyChip.nextSibling ?? companyChip)
      }
    }
    setTrigger(null)
    triggerRef.current = null
    setSelectedChip(null)
    window.requestAnimationFrame(() => root.focus())
  }

  const copySelection = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = editorRef.current
    const selectedNode = selectedChip ? root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedChip)}"]`) : null
    if (root && selectedNode) {
      const segment: EditorSegment = { type: 'mention', mention: chipToMention(selectedNode) }
      e.clipboardData.setData(MENTION_CLIPBOARD, JSON.stringify([segment]))
      e.clipboardData.setData('text/plain', plainTextFromEditorSegments([segment]))
      if (cut) removeChip(selectedNode)
      setSelectedChip(null)
      e.preventDefault()
      return
    }

    const sel = window.getSelection()
    if (!sel || !root || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const segments = segmentsFromNodes(Array.from(range.cloneContents().childNodes))
    e.clipboardData.setData(MENTION_CLIPBOARD, JSON.stringify(segments))
    e.clipboardData.setData('text/plain', plainTextFromEditorSegments(segments))
    if (cut) range.deleteContents()
    e.preventDefault()
  }

  const pickerStyle = trigger ? {
    left: Math.min(trigger.rect.left, window.innerWidth - 380),
    top: trigger.rect.bottom + 8,
  } : undefined

  return (
    <div className="td-mention-wrap">
      <div
        ref={editorRef}
        className="td-mention-editor"
        contentEditable
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={() => { setSelectedChip(null); refreshTrigger() }}
        onCopy={e => copySelection(e, false)}
        onCut={e => copySelection(e, true)}
        onPaste={e => {
          const root = editorRef.current
          if (!root) return
          const rawSegments = e.clipboardData.getData(MENTION_CLIPBOARD)
          const rawText = e.clipboardData.getData('text/plain')
          let segments: EditorSegment[] | null = null
          if (rawSegments) {
            try { segments = JSON.parse(rawSegments) as EditorSegment[] } catch { segments = null }
          }
          if (!segments) segments = hasMentionTokens(rawText) ? legacyTextToEditorSegments(rawText, mentionOptions) : [{ type: 'text', text: rawText }]
          insertSegments(root, segments)
          setTrigger(null)
          setSelectedChip(null)
          e.preventDefault()
        }}
        onMouseDown={e => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-mention="true"]')
          if (!chip) return
          e.preventDefault()
          setSelectedChip(chip.dataset.key ?? null)
          editorRef.current?.focus()
        }}
        onDoubleClick={e => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-mention="true"]')
          if (!chip) return
          e.preventDefault()
          onOpenMention(chipToMention(chip))
        }}
        onClick={() => refreshTrigger()}
        onBlur={() => {
          window.setTimeout(() => {
            if (!document.activeElement?.closest?.('.td-mention-picker')) commit()
          }, 0)
        }}
        onKeyDown={e => {
          if (trigger) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => actions.length ? (i + 1) % actions.length : 0); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => actions.length ? (i - 1 + actions.length) % actions.length : 0); return }
            if ((e.key === 'Enter' || e.key === 'Tab') && actions[selected]) { e.preventDefault(); void pickAction(actions[selected]); return }
            if (e.key === 'Escape') { e.preventDefault(); setTrigger(null); return }
          }
          if (selectedChip && (e.key === 'Backspace' || e.key === 'Delete')) {
            const chip = editorRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedChip)}"]`)
            if (chip) removeChip(chip)
            setSelectedChip(null)
            e.preventDefault()
            return
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            const chip = chipNearCaret(editorRef.current!, e.key === 'Backspace' ? 'previous' : 'next')
            if (chip) {
              setSelectedChip(chip.dataset.key ?? null)
              e.preventDefault()
              return
            }
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setSelectedChip(null)
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
      />
      {trigger && pickerStyle && (
        <MentionPicker actions={actions} selected={selected} style={pickerStyle} onPick={action => { void pickAction(action) }} />
      )}
    </div>
  )
}
