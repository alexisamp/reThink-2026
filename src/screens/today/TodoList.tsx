// TodoList — Today's todos (the HERO). Priority / milestone grouping, featured
// star, milestone + mention chips, AM/PM block, inline edit, add, done section.
// Visual contract ported from the reThink design bundle (TodoList.jsx).
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Star, TrashSimple, Plus, CaretDown, DotsSixVertical, HourglassMedium } from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Todo } from '@/types'
import type { GroupBy, Mention } from './types'

interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}

const KIND_LABEL: Record<Mention['kind'], string> = {
  person: 'People',
  company: 'Companies',
  opportunity: 'Opportunities',
}

function mentionKey(m: Mention) {
  return `${m.kind}:${m.id ?? m.name}`
}

const MENTION_TOKEN_RE = /\[\[mention:(person|company|opportunity):([^\]]+)\]\]/g
const MENTION_CLIPBOARD = 'application/x-rethink-mention-segments'

type EditorSegment = { type: 'text'; text: string } | { type: 'mention'; mention: Mention }

function groupedMentionOptions(options: Mention[], query: string) {
  const q = query.trim().toLowerCase()
  return (['person', 'company', 'opportunity'] as Mention['kind'][]).map(kind => ({
    kind,
    items: options
      .filter(m => m.kind === kind)
      .filter(m => !q || `${m.name} ${m.sub ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6),
  })).filter(g => g.items.length > 0)
}

function mentionToken(m: Mention) {
  return m.id ? `[[mention:${m.kind}:${m.id}]]` : ''
}

function hasMentionTokens(text: string) {
  MENTION_TOKEN_RE.lastIndex = 0
  return MENTION_TOKEN_RE.test(text)
}

function stripMentionTokens(text: string) {
  MENTION_TOKEN_RE.lastIndex = 0
  return text.replace(MENTION_TOKEN_RE, '').replace(/\s{2,}/g, ' ').trim()
}

function mentionByKindId(kind: Mention['kind'], id: string, mentions: Mention[]) {
  return mentions.find(m => m.kind === kind && m.id === id) ?? null
}

function linksFromMentions(items: Mention[]): TodoLinks {
  return {
    contactId: items.find(m => m.kind === 'person')?.id ?? null,
    companyId: items.find(m => m.kind === 'company')?.id ?? items.find(m => m.kind === 'opportunity')?.companyId ?? null,
    opportunityId: items.find(m => m.kind === 'opportunity')?.id ?? null,
  }
}

function linksForTodoEdit(todo: Todo, originalMentions: Mention[], linked: Mention[]): TodoLinks {
  const selected = linksFromMentions(linked)
  return {
    contactId: originalMentions.some(m => m.kind === 'person') || !todo.contact_id ? selected.contactId : todo.contact_id,
    companyId: originalMentions.some(m => m.kind === 'company') || !todo.company_id ? selected.companyId : todo.company_id,
    opportunityId: originalMentions.some(m => m.kind === 'opportunity') || !todo.opportunity_id ? selected.opportunityId : todo.opportunity_id,
  }
}

function MentionChip({ name, kind, imageUrl, onClick }: Mention & { onClick?: () => void }) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const squared = kind === 'company' || kind === 'opportunity'
  const label = kind === 'person' ? name.split(' ')[0] : name
  return (
    <span
      className={`td-chip-mention${onClick ? ' clickable' : ''}`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={`av${squared ? ' sq' : ''}`}>
        {imageUrl ? <img src={imageUrl} alt="" /> : initial}
      </span>
      {label}
    </span>
  )
}

function MentionPicker({
  groups, activeKey, onSelect,
}: {
  groups: ReturnType<typeof groupedMentionOptions>
  activeKey: string | null
  onSelect: (m: Mention) => void
}) {
  return (
    <div className="td-mention-picker">
      {groups.length === 0 ? (
        <div className="td-mention-empty">No matches</div>
      ) : groups.map(group => (
        <div className="td-mention-section" key={group.kind}>
          <div className="td-mention-header">{KIND_LABEL[group.kind]}</div>
          {group.items.map(item => {
            const initial = (item.name || '?').charAt(0).toUpperCase()
            const squared = item.kind !== 'person'
            return (
              <button
                key={mentionKey(item)}
                type="button"
                className={`td-mention-row${activeKey === mentionKey(item) ? ' active' : ''}`}
                onMouseDown={e => { e.preventDefault(); onSelect(item) }}
              >
                <span className={`td-mention-avatar${squared ? ' sq' : ''}`}>
                  {item.imageUrl ? <img src={item.imageUrl} alt="" /> : initial}
                </span>
                <span className="td-mention-copy">
                  <span className="name">{item.name}</span>
                  {item.sub && <span className="sub">{item.sub}</span>}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function createEditorChip(item: Mention) {
  const chip = document.createElement('span')
  chip.className = 'td-editor-chip'
  chip.contentEditable = 'false'
  chip.dataset.mention = 'true'
  chip.dataset.kind = item.kind
  chip.dataset.id = item.id ?? ''
  chip.dataset.name = item.name
  chip.dataset.imageUrl = item.imageUrl ?? ''
  chip.dataset.companyId = item.companyId ?? ''
  const initial = (item.name || '?').charAt(0).toUpperCase()
  const squared = item.kind === 'company' || item.kind === 'opportunity'
  const label = item.kind === 'person' ? item.name.split(' ')[0] : item.name
  const avatar = document.createElement('span')
  avatar.className = `av${squared ? ' sq' : ''}`
  if (item.imageUrl) {
    const img = document.createElement('img')
    img.src = item.imageUrl
    img.alt = ''
    avatar.append(img)
  } else {
    avatar.textContent = initial
  }
  const labelEl = document.createElement('span')
  labelEl.textContent = label
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.dataset.removeMention = 'true'
  remove.textContent = '×'
  chip.append(avatar, labelEl, remove)
  return chip
}

function chipToMention(node: HTMLElement): Mention {
  return {
    id: node.dataset.id || undefined,
    kind: (node.dataset.kind as Mention['kind']) || 'person',
    name: node.dataset.name || 'Mention',
    imageUrl: node.dataset.imageUrl || null,
    companyId: node.dataset.companyId || null,
  }
}

function renderEditorContent(el: HTMLDivElement, text: string, linked: Mention[], mentionOptions: Mention[]) {
  el.innerHTML = ''
  const sourceMentions = [...linked, ...mentionOptions]
  if (hasMentionTokens(text)) {
    let last = 0
    MENTION_TOKEN_RE.lastIndex = 0
    text.replace(MENTION_TOKEN_RE, (token, kind: Mention['kind'], id: string, index: number) => {
      if (index > last) el.append(document.createTextNode(text.slice(last, index)))
      const mention = mentionByKindId(kind, id, sourceMentions)
      if (mention) el.append(createEditorChip(mention))
      last = index + token.length
      return token
    })
    if (last < text.length) el.append(document.createTextNode(text.slice(last)))
  } else {
    el.append(document.createTextNode(text))
    linked.forEach(m => { el.append(document.createTextNode(' ')); el.append(createEditorChip(m)) })
  }
}

function readEditorMentions(el: HTMLDivElement): Mention[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-mention="true"]')).map(chipToMention)
}

function serializeEditor(el: HTMLDivElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node instanceof HTMLElement && node.dataset.mention === 'true') {
      const kind = node.dataset.kind as Mention['kind']
      const id = node.dataset.id
      return kind && id ? ` ${mentionToken({ kind, id, name: node.dataset.name || '' })} ` : ''
    }
    return Array.from(node.childNodes).map(walk).join('')
  }
  return Array.from(el.childNodes).map(walk).join('').replace(/\s{2,}/g, ' ').trim()
}

function plainEditorText(el: HTMLDivElement) {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-mention="true"]').forEach(n => n.remove())
  return (clone.textContent ?? '').replace(/\s{2,}/g, ' ').trim()
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
  return out
}

function plainFromSegments(segments: EditorSegment[]) {
  return segments.map(s => s.type === 'text' ? s.text : `@${s.mention.name}`).join('').replace(/\s{2,}/g, ' ').trim()
}

function insertSegments(root: HTMLDivElement, segments: EditorSegment[]) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return
  range.deleteContents()
  const frag = document.createDocumentFragment()
  let last: Node | null = null
  segments.forEach(segment => {
    const node = segment.type === 'text'
      ? document.createTextNode(segment.text)
      : createEditorChip(segment.mention)
    frag.append(node)
    last = node
  })
  range.insertNode(frag)
  if (last) placeCaretAfter(last)
}

function segmentsFromTokenText(text: string, mentionOptions: Mention[]): EditorSegment[] {
  const segments: EditorSegment[] = []
  let last = 0
  MENTION_TOKEN_RE.lastIndex = 0
  text.replace(MENTION_TOKEN_RE, (token, kind: Mention['kind'], id: string, index: number) => {
    if (index > last) segments.push({ type: 'text', text: text.slice(last, index) })
    const mention = mentionByKindId(kind, id, mentionOptions)
    segments.push(mention ? { type: 'mention', mention } : { type: 'text', text: token })
    last = index + token.length
    return token
  })
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) })
  return segments
}

function getMentionTriggerRange(root: HTMLDivElement): { range: Range; query: string } | null {
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
  return { range: triggerRange, query: match[2] ?? '' }
}

function placeCaretAfter(node: Node) {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function MentionTextInput({
  value, linked, mentionOptions, placeholder, autoFocus,
  onCommit, onCancel,
}: {
  value: string
  linked: Mention[]
  mentionOptions: Mention[]
  placeholder?: string
  autoFocus?: boolean
  onCommit: (value: string, linked: Mention[]) => void
  onCancel: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Range | null>(null)
  const [trigger, setTrigger] = useState<{ query: string } | null>(null)
  const [active, setActive] = useState(0)
  const groups = useMemo(() => groupedMentionOptions(mentionOptions, trigger?.query ?? ''), [mentionOptions, trigger])
  const flat = groups.flatMap(g => g.items)
  const activeKey = flat[active] ? mentionKey(flat[active]) : null

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    renderEditorContent(el, value, linked, mentionOptions)
    if (autoFocus) {
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshTrigger = () => {
    const el = editorRef.current
    if (!el) return
    const next = getMentionTriggerRange(el)
    triggerRef.current = next?.range ?? null
    setTrigger(next ? { query: next.query } : null)
    setActive(0)
  }

  const selectMention = (item: Mention) => {
    const el = editorRef.current
    const range = triggerRef.current
    if (!el || !range) return
    range.deleteContents()
    const chip = createEditorChip(item)
    range.insertNode(chip)
    chip.after(document.createTextNode(' '))
    placeCaretAfter(chip.nextSibling ?? chip)
    if (item.kind === 'opportunity' && item.companyId && !readEditorMentions(el).some(m => m.kind === 'company')) {
      const company = mentionOptions.find(m => m.kind === 'company' && m.id === item.companyId)
      if (company) {
        const c = createEditorChip(company)
        chip.after(document.createTextNode(' '), c)
        placeCaretAfter(c)
      }
    }
    setTrigger(null)
    triggerRef.current = null
    window.requestAnimationFrame(() => el.focus())
  }

  const commit = () => {
    const el = editorRef.current
    if (!el) return
    onCommit(serializeEditor(el), readEditorMentions(el))
  }

  const removePreviousChip = () => {
    const sel = window.getSelection()
    const el = editorRef.current
    if (!sel || !el || sel.rangeCount === 0 || !sel.isCollapsed) return false
    const range = sel.getRangeAt(0)
    let prev: Node | null = null
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) prev = range.startContainer.previousSibling
    if (range.startContainer === el && range.startOffset > 0) prev = el.childNodes[range.startOffset - 1]
    if (prev instanceof HTMLElement && prev.dataset.mention === 'true') {
      const after = prev.nextSibling
      prev.remove()
      if (after?.nodeType === Node.TEXT_NODE && after.textContent?.startsWith(' ')) after.textContent = after.textContent.slice(1)
      return true
    }
    return false
  }

  const handleCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection()
    const el = editorRef.current
    if (!sel || !el || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return
    const fragment = range.cloneContents()
    const segments = segmentsFromNodes(Array.from(fragment.childNodes))
    e.clipboardData.setData(MENTION_CLIPBOARD, JSON.stringify(segments))
    e.clipboardData.setData('text/plain', plainFromSegments(segments))
    e.preventDefault()
  }

  const handleCut = (e: ClipboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection()
    const el = editorRef.current
    if (!sel || !el || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return
    const fragment = range.cloneContents()
    const segments = segmentsFromNodes(Array.from(fragment.childNodes))
    e.clipboardData.setData(MENTION_CLIPBOARD, JSON.stringify(segments))
    e.clipboardData.setData('text/plain', plainFromSegments(segments))
    range.deleteContents()
    refreshTrigger()
    e.preventDefault()
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const el = editorRef.current
    if (!el) return
    const rawSegments = e.clipboardData.getData(MENTION_CLIPBOARD)
    const rawText = e.clipboardData.getData('text/plain')
    let segments: EditorSegment[] | null = null
    if (rawSegments) {
      try { segments = JSON.parse(rawSegments) as EditorSegment[] } catch { segments = null }
    }
    if (!segments) segments = hasMentionTokens(rawText) ? segmentsFromTokenText(rawText, mentionOptions) : [{ type: 'text', text: rawText }]
    insertSegments(el, segments)
    setTrigger(null)
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
        onInput={refreshTrigger}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onMouseDown={e => {
          const target = e.target as HTMLElement
          if (target.dataset.removeMention === 'true') {
            e.preventDefault()
            target.closest('[data-mention="true"]')?.remove()
            editorRef.current?.focus()
          }
        }}
        onClick={e => {
          const target = e.target as HTMLElement
          if (target.dataset.removeMention === 'true') {
            target.closest('[data-mention="true"]')?.remove()
            editorRef.current?.focus()
            return
          }
          refreshTrigger()
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (trigger) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => flat.length ? (i + 1) % flat.length : 0); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => flat.length ? (i - 1 + flat.length) % flat.length : 0); return }
            if ((e.key === 'Enter' || e.key === 'Tab') && flat[active]) { e.preventDefault(); selectMention(flat[active]); return }
            if (e.key === 'Escape') { e.preventDefault(); setTrigger(null); return }
          }
          if (e.key === 'Backspace' && removePreviousChip()) { e.preventDefault(); return }
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') onCancel()
        }}
      />
      {trigger && <MentionPicker groups={groups} activeKey={activeKey} onSelect={selectMention} />}
    </div>
  )
}

interface RowProps {
  todo: Todo
  priorityNumber?: number
  milestone?: string | null
  hideMilestone?: boolean
  mentions: Mention[]
  mentionOptions: Mention[]
  milestoneColor?: string | null
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, links?: TodoLinks) => void
  onMilestoneClick?: (id: string) => void
  dragRef?: (el: HTMLElement | null) => void
  dragStyle?: CSSProperties
  dragHandle?: ReactNode
}

function TodoRow({
  todo, priorityNumber, milestone, hideMilestone, mentions, mentionOptions, milestoneColor,
  onToggle, onDelete, onStar, onToggleWaiting, onEditText, onMilestoneClick,
  dragRef, dragStyle, dragHandle,
}: RowProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [linked, setLinked] = useState<Mention[]>(mentions)
  useEffect(() => { if (!editing) setLinked(mentions) }, [mentions, editing])

  const goToMention = (m: Mention) => {
    if (!m.id) return
    if (m.kind === 'person') navigate(`/people/${m.id}`)
    if (m.kind === 'company') navigate(`/people/companies/${m.id}`)
    if (m.kind === 'opportunity') navigate(`/people/opportunities/${m.id}`)
  }

  const renderBody = () => {
    const allMentions = [...mentions, ...mentionOptions]
    if (!hasMentionTokens(todo.text)) {
      return (
        <>
          <span className="body">{todo.text}</span>
          {mentions.map((m, i) => <MentionChip key={i} {...m} onClick={() => goToMention(m)} />)}
        </>
      )
    }
    const out: ReactNode[] = []
    let last = 0
    MENTION_TOKEN_RE.lastIndex = 0
    todo.text.replace(MENTION_TOKEN_RE, (token, kind: Mention['kind'], id: string, index: number) => {
      if (index > last) out.push(<span className="body" key={`t-${index}`}>{todo.text.slice(last, index)}</span>)
      const mention = mentionByKindId(kind, id, allMentions)
      if (mention) out.push(<MentionChip key={`${kind}:${id}:${index}`} {...mention} onClick={() => goToMention(mention)} />)
      last = index + token.length
      return token
    })
    if (last < todo.text.length) out.push(<span className="body" key="tail">{todo.text.slice(last)}</span>)
    return out
  }

  const commit = (nextText: string, nextLinked: Mention[]) => {
    if (stripMentionTokens(nextText) || nextLinked.length > 0) {
      const links = linksForTodoEdit(todo, mentions, nextLinked)
      const changedLinks =
        links.contactId !== (todo.contact_id ?? null) ||
        links.companyId !== (todo.company_id ?? null) ||
        links.opportunityId !== (todo.opportunity_id ?? null)
      if (nextText !== todo.text || changedLinks) onEditText(todo.id, nextText, links)
    }
    setEditing(false)
  }
  const cancel = () => { setLinked(mentions); setEditing(false) }

  return (
    <div ref={dragRef} style={dragStyle} className={`td-todo${editing ? ' editing' : ''}${todo.is_featured ? ' featured' : ''}${todo.completed ? ' done' : ''}${todo.waiting ? ' waiting' : ''}`}>
      {dragHandle}
      <span className="pri">{priorityNumber ?? ''}</span>
      <button className={`td-cb${todo.completed ? ' checked' : ''}`} onClick={() => onToggle(todo.id)} aria-label="Toggle done">
        {todo.completed && <Check size={9} weight="bold" />}
      </button>
      <div className="text-area" onClick={() => !editing && !todo.completed && setEditing(true)}>
        {editing ? (
          <MentionTextInput
            autoFocus
            value={todo.text}
            linked={linked}
            mentionOptions={mentionOptions}
            placeholder="Type @ to link CRM"
            onCommit={(nextText, nextLinked) => { setLinked(nextLinked); commit(nextText, nextLinked) }}
            onCancel={cancel}
          />
        ) : (
          <>
            {renderBody()}
            {todo.waiting && <span className="td-chip-waiting"><HourglassMedium size={10} /> on hold</span>}
            {milestone && !hideMilestone && (
              <button
                className="td-chip-ms"
                style={milestoneColor ? { ['--ms' as string]: milestoneColor } : undefined}
                onClick={(e) => { e.stopPropagation(); if (todo.milestone_id && onMilestoneClick) onMilestoneClick(todo.milestone_id) }}
              >
                {milestone}
              </button>
            )}
          </>
        )}
      </div>
      {todo.block && <span className="block">{todo.block}</span>}
      <span className="actions">
        <button
          className={`star${todo.is_featured ? ' on' : ''}`}
          title={todo.is_featured ? 'Unstar' : 'Star as one thing'}
          onClick={() => onStar(todo.id)}
        >
          <Star size={12} weight={todo.is_featured ? 'fill' : 'regular'} />
        </button>
        <button
          className={`hold${todo.waiting ? ' on' : ''}`}
          title={todo.waiting ? 'Remove on hold' : 'Mark on hold'}
          onClick={() => onToggleWaiting(todo.id)}
        >
          <HourglassMedium size={12} weight={todo.waiting ? 'fill' : 'regular'} />
        </button>
        <button title="Delete" onClick={() => onDelete(todo.id)}><TrashSimple size={12} /></button>
      </span>
    </div>
  )
}

function SortableTodoRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.todo.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 20 : undefined,
  }
  const handle = (
    <button className="grip-todo" {...attributes} {...listeners} title="Drag to reorder" aria-label="Drag to reorder">
      <DotsSixVertical size={11} />
    </button>
  )
  return <TodoRow {...props} dragRef={setNodeRef} dragStyle={style} dragHandle={handle} />
}

function AddTodo({
  onAdd, mentionOptions, label = 'Add a task',
}: {
  onAdd: (text: string, links: TodoLinks) => void
  mentionOptions: Mention[]
  label?: string
}) {
  const [editing, setEditing] = useState(false)
  const commit = (nextText: string, nextLinked: Mention[]) => {
    if (stripMentionTokens(nextText) || nextLinked.length > 0) onAdd(nextText, linksFromMentions(nextLinked))
    setEditing(false)
  }
  const cancel = () => {
    setEditing(false)
  }

  if (!editing) {
    return (
      <button className="td-add" onClick={() => setEditing(true)}>
        <Plus size={13} />
        <span>{label}</span>
      </button>
    )
  }
  return (
    <div className="td-add">
      <span className="td-cb" />
      <MentionTextInput
        autoFocus
        placeholder="What's next? Type @ to link CRM"
        value=""
        linked={[]}
        mentionOptions={mentionOptions}
        onCommit={commit}
        onCancel={cancel}
      />
    </div>
  )
}

function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (g: GroupBy) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span ref={wrap} style={{ position: 'relative' }}>
      <button className="group-toggle" onClick={() => setOpen(o => !o)}>
        group: {value}
        <CaretDown size={9} />
      </button>
      {open && (
        <div className="td-popover">
          {(['priority', 'milestone'] as GroupBy[]).map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}>
              {opt}
              {value === opt && <Check size={10} />}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

interface TodoListProps {
  todos: Todo[]
  milestoneName: (id: string | null) => string | null
  milestoneColor: (id: string | null) => string | null
  milestoneTotal: (id: string) => number
  milestoneOrder: string[]
  resolveMentions: (todo: Todo) => Mention[]
  mentionOptions: Mention[]
  groupBy: GroupBy
  onChangeGroup: (g: GroupBy) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, links?: TodoLinks) => void
  onAdd: (text: string, milestoneId: string | null, links?: TodoLinks) => void
  onMilestoneClick: (id: string) => void
  onReorder?: (orderedActiveIds: string[]) => void
}

export default function TodoList({
  todos, milestoneName, milestoneColor, milestoneTotal, milestoneOrder, resolveMentions, mentionOptions,
  groupBy, onChangeGroup, onToggle, onDelete, onStar, onToggleWaiting, onEditText, onAdd, onMilestoneClick, onReorder,
}: TodoListProps) {
  const active = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e
    if (!over || a.id === over.id || !onReorder) return
    const ids = active.map(t => t.id)
    const from = ids.indexOf(a.id as string)
    const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  // priority numbers global to active list (1..3)
  const priMap = new Map<string, number>()
  active.forEach((t, i) => { if (i < 3) priMap.set(t.id, i + 1) })

  const groups = useMemo(() => {
    if (groupBy !== 'milestone') return null
    const map = new Map<string, Todo[]>()
    active.forEach(t => {
      const key = t.milestone_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    const out: { id: string; name: string; todos: Todo[]; total: number }[] = []
    milestoneOrder.forEach(mid => {
      if (map.has(mid)) out.push({ id: mid, name: milestoneName(mid) ?? 'Milestone', todos: map.get(mid)!, total: milestoneTotal(mid) })
    })
    if (map.has('__none__')) out.push({ id: '__none__', name: 'No milestone', todos: map.get('__none__')!, total: 0 })
    return out
  }, [active, groupBy, milestoneOrder, milestoneName, milestoneTotal])

  return (
    <section className="td-section">
      <div className="td-section-hd">
        <h3>Today's todos</h3>
        <div className="rule" />
        <span className="count">{active.length} active · {done.length} done</span>
        <GroupToggle value={groupBy} onChange={onChangeGroup} />
      </div>

      {groupBy === 'priority' && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={active.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {active.map(t => (
                <SortableTodoRow
                  key={t.id} todo={t} priorityNumber={priMap.get(t.id)}
                  milestone={milestoneName(t.milestone_id)} mentions={resolveMentions(t)}
                  mentionOptions={mentionOptions}
                  milestoneColor={milestoneColor(t.milestone_id)}
                  onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
                />
              ))}
            </SortableContext>
          </DndContext>
          {active.length === 0 && (
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
          )}
          <AddTodo mentionOptions={mentionOptions} onAdd={(text, links) => onAdd(text, null, links)} />
        </>
      )}

      {groupBy === 'milestone' && groups && (
        groups.length === 0 ? (
          <>
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
            <AddTodo mentionOptions={mentionOptions} onAdd={(text, links) => onAdd(text, null, links)} />
          </>
        ) : groups.map(g => (
          <div key={g.id}>
            <div className={`td-group-hd${g.id === '__none__' ? ' no-ms' : ''}`}>
              <span className="dot" />
              <span className="name">{g.name}</span>
              <span className="rule" />
              <span className="count">
                {g.todos.length}{g.total ? ` of ${g.total} here` : ` todo${g.todos.length === 1 ? '' : 's'}`}
              </span>
            </div>
            {g.todos.map(t => (
              <TodoRow
                key={t.id} todo={t} priorityNumber={priMap.get(t.id)}
                milestone={milestoneName(t.milestone_id)} hideMilestone={g.id !== '__none__'}
                mentions={resolveMentions(t)}
                mentionOptions={mentionOptions}
                milestoneColor={milestoneColor(t.milestone_id)}
                onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
              />
            ))}
            <AddTodo
              mentionOptions={mentionOptions}
              onAdd={(text, links) => onAdd(text, g.id === '__none__' ? null : g.id, links)}
              label={g.id === '__none__' ? 'Add a task' : `Add to ${g.name}…`}
            />
          </div>
        ))
      )}

      {done.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="td-group-hd no-ms">
            <span className="dot" style={{ background: 'color-mix(in oklab, var(--shuttle) 20%, transparent)' }} />
            <span className="name">Done</span>
            <span className="rule" />
            <span className="count">{done.length}</span>
          </div>
          {done.map(t => (
            <TodoRow
              key={t.id} todo={t} milestone={milestoneName(t.milestone_id)} mentions={resolveMentions(t)}
              mentionOptions={mentionOptions}
              milestoneColor={milestoneColor(t.milestone_id)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
            />
          ))}
        </div>
      )}
    </section>
  )
}
