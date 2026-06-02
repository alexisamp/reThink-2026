import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties } from 'react'
import type { TodoMentionKind } from '@/types'
import type { Mention, TodoMilestoneOption } from './types'
import {
  MENTION_CLIPBOARD,
  fileKey,
  hasMentionTokens,
  legacyTextToEditorSegments,
  mentionKey,
  normalizeEditorSegments,
  plainTextFromEditorSegments,
  type TodoFileSegment,
  type EditorSegment,
} from '@/lib/todoContent'
import { hasStrongCrmMatch, rankCrmObjects } from '@/lib/crmObjects'
import { chooseTodoFile, fileSegmentFromUrl, isSpreadsheetFileName, openTodoFile, spreadsheetFileToSegment } from '@/lib/filePills'

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

interface MilestoneAction {
  type: 'milestone' | 'clear'
  key: string
  label: string
  milestone?: TodoMilestoneOption
}

type TriggerState = { type: 'mention' | 'milestone' | 'file'; query: string; rect: DOMRect }

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

function fileKindLabel(file: Pick<TodoFileSegment, 'label' | 'openMode' | 'mimeType'>) {
  if (file.openMode === 'sheets') return 'Sheet'
  const label = file.label.toLowerCase()
  if (label.endsWith('.pdf') || file.mimeType === 'application/pdf') return 'PDF'
  if (label.endsWith('.md') || file.mimeType === 'text/markdown') return 'MD'
  if (label.endsWith('.txt') || file.mimeType === 'text/plain') return 'TXT'
  return 'File'
}

export function FileChip({
  file,
  onClick,
  selected,
  editor,
}: {
  file: TodoFileSegment
  onClick?: () => void
  selected?: boolean
  editor?: boolean
}) {
  return (
    <span
      className={[
        editor ? 'td-editor-chip td-file-chip' : 'td-chip-mention td-file-chip',
        onClick ? 'clickable' : '',
        selected ? 'selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={file.label}
    >
      <span className="av sq">{fileKindLabel(file)}</span>
      <span>{file.label}</span>
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

function createEditorFileChip(file: TodoFileSegment, selectedKey: string | null) {
  const chip = document.createElement('span')
  chip.className = `td-editor-chip td-file-chip${selectedKey === fileKey(file) ? ' selected' : ''}`
  chip.contentEditable = 'false'
  chip.dataset.file = 'true'
  chip.dataset.id = file.id
  chip.dataset.label = file.label
  chip.dataset.source = file.source
  chip.dataset.mimeType = file.mimeType ?? ''
  chip.dataset.path = file.path ?? ''
  chip.dataset.url = file.url ?? ''
  chip.dataset.googleFileId = file.googleFileId ?? ''
  chip.dataset.openMode = file.openMode
  chip.dataset.key = fileKey(file)

  const icon = document.createElement('span')
  icon.className = 'av sq'
  icon.textContent = fileKindLabel(file)
  const label = document.createElement('span')
  label.textContent = file.label
  chip.append(icon, label)
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

function chipToFile(node: HTMLElement): TodoFileSegment {
  return {
    type: 'file',
    id: node.dataset.id || crypto.randomUUID(),
    label: node.dataset.label || 'File',
    source: (node.dataset.source as TodoFileSegment['source']) || 'url',
    mimeType: node.dataset.mimeType || null,
    path: node.dataset.path || null,
    url: node.dataset.url || null,
    googleFileId: node.dataset.googleFileId || null,
    openMode: (node.dataset.openMode as TodoFileSegment['openMode']) || 'browser',
  }
}

function chipToSegment(node: HTMLElement): EditorSegment | null {
  if (node.dataset.mention === 'true') return { type: 'mention', mention: chipToMention(node) }
  if (node.dataset.file === 'true') return { type: 'file', file: chipToFile(node) }
  return null
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
    if (node instanceof HTMLElement) {
      const segment = chipToSegment(node)
      if (segment) {
        out.push(segment)
        return
      }
    }
    if (node instanceof HTMLAnchorElement) {
      const file = fileSegmentFromUrl(node.href)
      if (file) {
        out.push({ type: 'file', file })
        return
      }
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
    if (segment.type === 'text') root.append(document.createTextNode(segment.text))
    else if (segment.type === 'mention') root.append(createEditorChip(segment.mention, selectedKey))
    else root.append(createEditorFileChip(segment.file, selectedKey))
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

function getEditorTrigger(root: HTMLElement): { type: 'mention' | 'milestone' | 'file'; range: Range; query: string; rect: DOMRect } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null
  const text = range.startContainer.textContent ?? ''
  const left = text.slice(0, range.startOffset)
  const match = /(^|\s)([@/])([^\s@/]*)$/.exec(left)
  if (!match || match.index === undefined) return null
  const query = match[3] ?? ''
  const type = match[2] === '@' ? 'mention' : query.toLowerCase().startsWith('file') ? 'file' : 'milestone'
  const triggerRange = document.createRange()
  triggerRange.setStart(range.startContainer, match.index + match[1].length)
  triggerRange.setEnd(range.startContainer, range.startOffset)
  return { type, range: triggerRange, query, rect: caretRect(range.cloneRange()) }
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
      : segment.type === 'mention'
        ? createEditorChip(segment.mention, null)
        : createEditorFileChip(segment.file, null)
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
  return node instanceof HTMLElement && (node.dataset.mention === 'true' || node.dataset.file === 'true') ? node : null
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

function scoreMilestone(option: TodoMilestoneOption, rawQuery: string) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 1
  const haystack = [option.name, option.goalLabel, option.due].filter(Boolean).join(' ').toLowerCase()
  const name = option.name.toLowerCase()
  if (!haystack.includes(q)) return 0
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (haystack.split(/\s+/).some(word => word.startsWith(q))) return 55
  return 25
}

function milestoneActions(options: TodoMilestoneOption[], query: string, currentMilestoneId?: string | null): MilestoneAction[] {
  const ranked = options
    .map(option => ({ option, score: scoreMilestone(option, query) + (option.id === currentMilestoneId ? 6 : 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name))
    .slice(0, 8)
    .map(item => ({
      type: 'milestone' as const,
      key: `milestone:${item.option.id}`,
      label: item.option.name,
      milestone: item.option,
    }))

  if (currentMilestoneId) {
    return [{ type: 'clear', key: 'milestone:clear', label: 'No milestone' }, ...ranked]
  }
  return ranked
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

function MilestonePicker({
  actions,
  selected,
  style,
  onPick,
}: {
  actions: MilestoneAction[]
  selected: number
  style: CSSProperties
  onPick: (action: MilestoneAction) => void
}) {
  return (
    <div className="td-mention-picker td-ms-picker fixed" style={style}>
      <div className="td-mention-header">Milestones</div>
      {actions.length === 0 ? (
        <div className="td-mention-empty">No milestones match</div>
      ) : actions.map((action, index) => {
        const milestone = action.milestone
        return (
          <button
            key={action.key}
            type="button"
            className={`td-mention-row td-ms-option${index === selected ? ' active' : ''}${action.type === 'clear' ? ' clear' : ''}`}
            onMouseDown={e => { e.preventDefault(); onPick(action) }}
          >
            <span
              className="td-ms-option-dot"
              style={milestone ? { ['--ms' as string]: milestone.color } : undefined}
            />
            <span className="td-mention-copy">
              <span className="name">{action.label}</span>
              {milestone && (
                <span className="sub">
                  {[milestone.goalLabel, milestone.due, milestone.total ? `${milestone.done}/${milestone.total}` : null].filter(Boolean).join(' · ')}
                </span>
              )}
              {action.type === 'clear' && <span className="sub">Remove milestone from this todo</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FilePicker({
  selected,
  style,
  importing,
  onChoose,
}: {
  selected: number
  style: CSSProperties
  importing: boolean
  onChoose: () => void
}) {
  return (
    <div className="td-mention-picker td-file-picker fixed" style={style}>
      <div className="td-mention-header">Files</div>
      <button
        type="button"
        className={`td-mention-row${selected === 0 ? ' active' : ''}`}
        onMouseDown={e => { e.preventDefault(); onChoose() }}
        disabled={importing}
      >
        <span className="td-mention-avatar sq">+</span>
        <span className="td-mention-copy">
          <span className="name">{importing ? 'Importing…' : 'Choose local file'}</span>
          <span className="sub">Excel and CSV files are converted to Google Sheets</span>
        </span>
      </button>
      <div className="td-mention-empty compact">Paste a Drive, Docs, Sheets, or PDF URL to create a file pill.</div>
    </div>
  )
}

interface MentionEditorProps {
  initialSegments: EditorSegment[]
  mentionOptions: Mention[]
  milestoneOptions?: TodoMilestoneOption[]
  currentMilestoneId?: string | null
  placeholder?: string
  autoFocus?: boolean
  onCommit: (segments: EditorSegment[]) => void
  onCancel: () => void
  onOpenMention: (mention: Mention) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onSelectMilestone?: (milestoneId: string | null) => void
}

export default function MentionEditor({
  initialSegments,
  mentionOptions,
  milestoneOptions = [],
  currentMilestoneId,
  placeholder,
  autoFocus,
  onCommit,
  onCancel,
  onOpenMention,
  onCreateMention,
  onSelectMilestone,
}: MentionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Range | null>(null)
  const fileBusyRef = useRef(false)
  const [trigger, setTrigger] = useState<TriggerState | null>(null)
  const [selected, setSelected] = useState(0)
  const [selectedChip, setSelectedChip] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const usedKeys = useMemo(() => new Set(initialSegments
    .filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention')
    .map(s => mentionKey(s.mention))), [initialSegments])
  const actions = useMemo(
    () => trigger?.type === 'mention' ? pickerActions(mentionOptions, trigger.query, usedKeys) : [],
    [mentionOptions, trigger, usedKeys],
  )
  const msActions = useMemo(
    () => trigger?.type === 'milestone' ? milestoneActions(milestoneOptions, trigger.query, currentMilestoneId) : [],
    [trigger, milestoneOptions, currentMilestoneId],
  )

  const setFileBusyState = (busy: boolean) => {
    fileBusyRef.current = busy
    setFileBusy(busy)
  }

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
    root.querySelectorAll<HTMLElement>('[data-file="true"]').forEach(chip => {
      chip.classList.toggle('selected', chip.dataset.key === selectedChip)
    })
  }, [selectedChip])

  const refreshTrigger = () => {
    const root = editorRef.current
    if (!root) return
    const next = getEditorTrigger(root)
    triggerRef.current = next?.range ?? null
    setTrigger(next ? { type: next.type, query: next.query, rect: next.rect } : null)
    setSelected(0)
  }

  const commit = () => {
    const root = editorRef.current
    if (!root) return
    const segments = readSegments(root)
    if (plainTextFromEditorSegments(segments) || segments.some(s => s.type !== 'text')) onCommit(segments)
    else onCancel()
  }

  const insertFile = (file: TodoFileSegment, replaceRange?: Range | null) => {
    const root = editorRef.current
    if (!root) return
    const range = replaceRange ?? window.getSelection()?.getRangeAt(0)
    if (!range || !root.contains(range.startContainer)) return
    range.deleteContents()
    const chip = createEditorFileChip(file, null)
    range.insertNode(chip)
    const spacer = document.createTextNode(' ')
    chip.after(spacer)
    placeCaretAfter(spacer)
    setTrigger(null)
    triggerRef.current = null
    setSelectedChip(null)
    window.requestAnimationFrame(() => root.focus())
  }

  const chooseFile = async () => {
    const range = triggerRef.current?.cloneRange() ?? null
    setFileBusyState(true)
    try {
      const file = await chooseTodoFile()
      if (file) insertFile(file, range)
    } catch (err) {
      console.error('chooseTodoFile failed:', err)
    } finally {
      setFileBusyState(false)
    }
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

  const pickMilestone = (action: MilestoneAction) => {
    const root = editorRef.current
    const range = triggerRef.current
    if (!root || !range || !onSelectMilestone) return
    range.deleteContents()
    const spacer = document.createTextNode(' ')
    range.insertNode(spacer)
    placeCaretAfter(spacer)
    onSelectMilestone(action.type === 'clear' ? null : action.milestone?.id ?? null)
    setTrigger(null)
    triggerRef.current = null
    setSelectedChip(null)
    window.requestAnimationFrame(() => root.focus())
  }

  const copySelection = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = editorRef.current
    const selectedNode = selectedChip ? root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedChip)}"]`) : null
    if (root && selectedNode) {
      const segment = chipToSegment(selectedNode)
      if (!segment) return
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

  const pasteSegments = async (e: ClipboardEvent<HTMLDivElement>) => {
    const root = editorRef.current
    if (!root) return

    const files = Array.from(e.clipboardData.files)
    const spreadsheet = files.find(file => isSpreadsheetFileName(file.name))
    if (spreadsheet) {
      e.preventDefault()
      setFileBusyState(true)
      try {
        insertFile(await spreadsheetFileToSegment(spreadsheet))
      } catch (err) {
        console.error('spreadsheet paste failed:', err)
      } finally {
        setFileBusyState(false)
      }
      return
    }

    const rawSegments = e.clipboardData.getData(MENTION_CLIPBOARD)
    const rawText = e.clipboardData.getData('text/plain')
    let segments: EditorSegment[] | null = null
    if (rawSegments) {
      try { segments = JSON.parse(rawSegments) as EditorSegment[] } catch { segments = null }
    }
    const file = fileSegmentFromUrl(rawText)
    if (!segments && file) segments = [{ type: 'file', file }]
    if (!segments) segments = hasMentionTokens(rawText) ? legacyTextToEditorSegments(rawText, mentionOptions) : [{ type: 'text', text: rawText }]
    insertSegments(root, segments)
    setTrigger(null)
    setSelectedChip(null)
    e.preventDefault()
  }

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
        onPaste={e => { void pasteSegments(e) }}
        onDragOver={e => {
          if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) e.preventDefault()
        }}
        onDrop={e => {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
          const file = fileSegmentFromUrl(url)
          const spreadsheet = Array.from(e.dataTransfer.files).find(item => isSpreadsheetFileName(item.name))
          if (!file && !spreadsheet) return
          e.preventDefault()
          if (file) {
            insertFile(file)
            return
          }
          if (spreadsheet) {
            setFileBusyState(true)
            spreadsheetFileToSegment(spreadsheet)
              .then(segment => insertFile(segment))
              .catch(err => console.error('spreadsheet drop failed:', err))
              .finally(() => setFileBusyState(false))
          }
        }}
        onMouseDown={e => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-mention="true"], [data-file="true"]')
          if (!chip) return
          e.preventDefault()
          setSelectedChip(chip.dataset.key ?? null)
          editorRef.current?.focus()
        }}
        onDoubleClick={e => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-mention="true"], [data-file="true"]')
          if (!chip) return
          e.preventDefault()
          if (chip.dataset.mention === 'true') onOpenMention(chipToMention(chip))
          if (chip.dataset.file === 'true') openTodoFile(chipToFile(chip))
        }}
        onClick={() => refreshTrigger()}
        onBlur={() => {
          window.setTimeout(() => {
            if (fileBusyRef.current) return
            if (!document.activeElement?.closest?.('.td-mention-picker')) commit()
          }, 0)
        }}
        onKeyDown={e => {
          if (trigger) {
            const listLength = trigger.type === 'mention' ? actions.length : trigger.type === 'file' ? 1 : msActions.length
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => listLength ? (i + 1) % listLength : 0); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => listLength ? (i - 1 + listLength) % listLength : 0); return }
            if ((e.key === 'Enter' || e.key === 'Tab') && trigger.type === 'mention') {
              e.preventDefault()
              if (actions[selected]) void pickAction(actions[selected])
              return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && trigger.type === 'milestone') {
              e.preventDefault()
              if (msActions[selected]) pickMilestone(msActions[selected])
              return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && trigger.type === 'file') {
              e.preventDefault()
              void chooseFile()
              return
            }
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
        trigger.type === 'mention'
          ? <MentionPicker actions={actions} selected={selected} style={pickerStyle} onPick={action => { void pickAction(action) }} />
          : trigger.type === 'file'
            ? <FilePicker selected={selected} style={pickerStyle} importing={fileBusy} onChoose={() => { void chooseFile() }} />
            : <MilestonePicker actions={msActions} selected={selected} style={pickerStyle} onPick={pickMilestone} />
      )}
    </div>
  )
}
