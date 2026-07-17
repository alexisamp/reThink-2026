import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TodoContentSegment, TodoMentionKind } from '@/types'
import { urlToFileSegment, type TodoFileSegment } from '@/lib/todoContent'
import { openLink } from '@/lib/openLink'
import type { Mention, TodoMilestoneOption } from './types'
import { Icon, Logo } from './TodayIcons'

export type EditorSegment =
  | { type: 'text'; text: string }
  | { type: 'file'; file: TodoFileSegment }
  | {
      type: 'mention'
      kind: TodoMentionKind
      id: string
      name: string
      label?: string
      logo?: string
      sub?: string | null
      imageUrl?: string | null
      companyId?: string | null
    }

export interface EditorMeta {
  segments: EditorSegment[]
  ms: string | null
  msColor: string | null
  priority: boolean
  schedule: boolean
}

type PickerItem =
  | (Mention & { type?: never; key?: never; label?: never; icon?: never; color?: never; hint?: never })
  | { type: 'cmd'; key: 'schedule' | 'priority' | 'clearms'; label: string; icon: 'calendar' | 'star' | 'x'; hint?: string }
  | { type: 'ms'; key: string; label: string; color: string; icon: null }

interface PickerState {
  mode: 'mention' | 'command'
  query: string
  items: PickerItem[]
  active: number
  rect: DOMRect
  tokenStart: number
  tokenEnd: number
  node: Text
}

const BRAND: Record<string, { bg: string; fg: string }> = {
  attio: { bg: '#111', fg: '#fff' },
  ramp: { bg: '#f7d417', fg: '#111' },
  granola: { bg: '#e8542a', fg: '#fff' },
  wander: { bg: '#1f6feb', fg: '#fff' },
}

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi
const TRAILING_URL_PUNCT = /[),.;:!?]+$/

function textToSegments(text: string): EditorSegment[] {
  const out: EditorSegment[] = []
  let cursor = 0
  URL_RE.lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const token = match[0]
    const index = match.index ?? 0
    const file = urlToFileSegment(token)
    if (!file) continue
    const clean = token.replace(TRAILING_URL_PUNCT, '')
    const end = index + clean.length
    if (index > cursor) out.push({ type: 'text', text: text.slice(cursor, index) })
    out.push({ type: 'file', file })
    if (end < index + token.length) out.push({ type: 'text', text: token.slice(clean.length) })
    cursor = index + token.length
  }
  if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor) })
  return out.length ? out : [{ type: 'text', text }]
}

function normalizeSegments(segments: EditorSegment[]): EditorSegment[] {
  const out: EditorSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += text
    else out.push({ type: 'text', text })
  }
  for (const segment of segments) {
    if (segment.type === 'text') textToSegments(segment.text).forEach(next => next.type === 'text' ? pushText(next.text) : out.push(next))
    else out.push(segment)
  }
  return out.filter(segment => segment.type !== 'text' || Boolean(segment.text))
}

export function toEditorSegments(segments: TodoContentSegment[] | null | undefined, fallback: string): EditorSegment[] {
  if (segments?.length) {
    return normalizeSegments(segments.flatMap<EditorSegment>(segment => {
      if (segment.type === 'text') return [{ type: 'text', text: segment.text }]
      if (segment.type === 'mention') {
        return [{
          type: 'mention',
          kind: segment.kind,
          id: segment.id,
          name: segment.label,
          label: segment.label,
          imageUrl: segment.imageUrl,
          companyId: segment.companyId,
        }]
      }
      return [{ type: 'file', file: segment }]
    }))
  }
  return fallback ? textToSegments(fallback) : []
}

export function editorSegmentsToTodo(segments: EditorSegment[]): TodoContentSegment[] {
  return normalizeSegments(segments).map(segment => {
    if (segment.type === 'text') return segment
    if (segment.type === 'file') return segment.file
    return {
      type: 'mention',
      kind: segment.kind,
      id: segment.id,
      label: segment.name || segment.label || '',
      imageUrl: segment.imageUrl,
      companyId: segment.companyId,
    }
  })
}

export function editorText(segments: EditorSegment[]) {
  return normalizeSegments(segments).map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'file') return segment.file.label
    return segment.name
  }).join('').replace(/\s{2,}/g, ' ').trim()
}

function avatarHTML(m: EditorSegment & { type: 'mention' }) {
  if (m.kind === 'opportunity') return '<span class="tp-chip-av opp">$</span>'
  const b = BRAND[m.logo || ''] || { bg: 'var(--mercury)', fg: 'var(--shuttle)' }
  const cls = m.kind === 'company' ? 'tp-chip-av sq' : 'tp-chip-av'
  return `<span class="${cls}" style="background:${b.bg};color:${b.fg}">${(m.name || '?')[0].toUpperCase()}</span>`
}

function makeChip(m: Mention | EditorSegment & { type: 'mention' }) {
  const span = document.createElement('span')
  span.className = 'tp-chip'
  span.setAttribute('contenteditable', 'false')
  span.dataset.kind = m.kind
  span.dataset.id = m.id || ''
  span.dataset.name = 'name' in m ? m.name : ''
  if ('sub' in m && m.sub) span.dataset.sub = m.sub
  if ('imageUrl' in m && m.imageUrl) span.dataset.imageUrl = m.imageUrl
  if ('companyId' in m && m.companyId) span.dataset.companyId = m.companyId
  span.innerHTML = avatarHTML({ type: 'mention', kind: m.kind, id: m.id || '', name: m.name, sub: m.sub } as EditorSegment & { type: 'mention' }) +
    `<span class="tp-chip-nm">${m.name}</span>`
  return span
}

function makeFileChip(file: TodoFileSegment) {
  const span = document.createElement('span')
  span.className = 'tp-chip tp-file-chip'
  span.setAttribute('contenteditable', 'false')
  span.dataset.file = 'true'
  span.dataset.id = file.id
  span.dataset.label = file.label
  span.dataset.source = file.source
  span.dataset.mimeType = file.mimeType ?? ''
  span.dataset.path = file.path ?? ''
  span.dataset.url = file.url ?? ''
  span.dataset.googleFileId = file.googleFileId ?? ''
  span.dataset.openMode = file.openMode
  const avatar = document.createElement('span')
  avatar.className = 'tp-chip-av sq'
  avatar.textContent = 'URL'
  const label = document.createElement('span')
  label.className = 'tp-chip-nm'
  label.textContent = file.label
  span.append(avatar, label)
  return span
}

function readSegments(el: HTMLElement): EditorSegment[] {
  const segs: EditorSegment[] = []
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent) return
      const last = segs[segs.length - 1]
      if (last?.type === 'text') last.text += node.textContent
      else segs.push({ type: 'text', text: node.textContent })
      return
    }
    const element = node as HTMLElement
    if (element.dataset?.file === 'true') {
      segs.push({
        type: 'file',
        file: {
          type: 'file',
          id: element.dataset.id || `url:${element.dataset.url || element.dataset.label || crypto.randomUUID()}`,
          label: element.dataset.label || 'Link',
          source: (element.dataset.source as TodoFileSegment['source']) || 'url',
          mimeType: element.dataset.mimeType || null,
          path: element.dataset.path || null,
          url: element.dataset.url || null,
          googleFileId: element.dataset.googleFileId || null,
          openMode: (element.dataset.openMode as TodoFileSegment['openMode']) || 'browser',
        },
      })
      return
    }
    if (element.dataset?.kind) {
      segs.push({
        type: 'mention',
        kind: element.dataset.kind as TodoMentionKind,
        id: element.dataset.id || '',
        name: element.dataset.name || '',
        sub: element.dataset.sub,
        imageUrl: element.dataset.imageUrl,
        companyId: element.dataset.companyId,
      })
      return
    }
    if (node.textContent) segs.push({ type: 'text', text: node.textContent })
  })
  if (segs[0]?.type === 'text') segs[0].text = segs[0].text.replace(/^\s+/, '')
  const last = segs[segs.length - 1]
  if (last?.type === 'text') {
    last.text = last.text.replace(/\s+$/, '')
    if (!last.text) segs.pop()
  }
  return normalizeSegments(segs.filter(segment => segment.type !== 'text' || Boolean(segment.text)))
}

function segEmpty(segs: EditorSegment[]) {
  return !segs.some(segment => segment.type === 'mention' || segment.type === 'file' || (segment.text && segment.text.trim()))
}

export function MentionChip({ m }: { m: EditorSegment & { type: 'mention' } }) {
  const displayName = m.name.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || m.name
  if (m.kind === 'opportunity') {
    return <span className="mchip opp"><span className="ico"><Icon name="dollar" size={11} /></span>{displayName}</span>
  }
  return <span className={`mchip ${m.kind}`}><Logo id={m.imageUrl || m.logo || displayName} size={13} sq={m.kind === 'company'} />{displayName}</span>
}

export function SegmentText({ segments }: { segments?: EditorSegment[] }) {
  return (
    <>
      {normalizeSegments(segments || []).map((segment, i) => {
        if (segment.type === 'mention') return <MentionChip key={i} m={segment} />
        if (segment.type === 'file') {
          return (
            <button
              key={i}
              type="button"
              className="mchip linkchip"
              title={segment.file.url ?? segment.file.label}
              onClick={(event) => { event.stopPropagation(); if (segment.file.url) openLink(segment.file.url) }}
            >
              <span className="ico"><Icon name="link" size={10} /></span>{segment.file.label}
            </button>
          )
        }
        return <span key={i} className="seg-t">{segment.text}</span>
      })}
    </>
  )
}

export function TodoEditor({
  initialSegments,
  initialMs,
  initialMsColor,
  initialPriority,
  milestoneOptions,
  mentionOptions,
  autoFocus,
  placeholder,
  oneLine,
  onCommit,
  onCancel,
}: {
  initialSegments?: EditorSegment[]
  initialMs?: string | null
  initialMsColor?: string | null
  initialPriority?: boolean
  milestoneOptions: TodoMilestoneOption[]
  mentionOptions: Mention[]
  autoFocus?: boolean
  placeholder?: string
  oneLine?: boolean
  onCommit: (meta: EditorMeta) => void
  onCancel?: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pick, setPick] = useState<PickerState | null>(null)
  const [ms, setMs] = useState(initialMs || null)
  const [msColor, setMsColor] = useState(initialMsColor || null)
  const [priority, setPriority] = useState(Boolean(initialPriority))
  const [schedule, setSchedule] = useState(false)
  const stateRef = useRef({ pick, ms, msColor, priority, schedule })
  stateRef.current = { pick, ms, msColor, priority, schedule }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    ;(initialSegments || []).forEach(segment => {
      if (segment.type === 'mention') el.appendChild(makeChip(segment))
      else if (segment.type === 'file') el.appendChild(makeFileChip(segment.file))
      else el.appendChild(document.createTextNode(segment.text))
    })
    if (autoFocus) {
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closePick = () => setPick(null)
  const caretRect = () => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return ref.current?.getBoundingClientRect() ?? new DOMRect()
    const range = sel.getRangeAt(0).cloneRange()
    range.collapse(true)
    return range.getClientRects()[0] ?? ref.current?.getBoundingClientRect() ?? new DOMRect()
  }
  const commandsFor = (q: string): PickerItem[] => {
    const base: PickerItem[] = [
      { type: 'cmd', key: 'schedule', label: 'Schedule on plan', icon: 'calendar', hint: 'add a time block' },
      { type: 'cmd', key: 'priority', label: priority ? 'Remove priority' : 'High priority', icon: 'star' },
    ]
    const msItems: PickerItem[] = milestoneOptions.map(m => ({ type: 'ms', key: m.id, label: m.name, color: m.color, icon: null }))
    if (ms) base.push({ type: 'cmd', key: 'clearms', label: 'Clear milestone', icon: 'x' })
    const ql = q.toLowerCase()
    return [...base, ...msItems].filter(item => ('type' in item && item.type ? item.label : item.name).toLowerCase().includes(ql))
  }
  const mentionsFor = (q: string): PickerItem[] => {
    const ql = q.toLowerCase()
    const matches = mentionOptions.filter(m => m.name.toLowerCase().includes(ql) || (m.sub || '').toLowerCase().includes(ql))
    return (['person', 'company', 'opportunity'] as const)
      .flatMap(kind => matches.filter(m => m.kind === kind).slice(0, 6))
      .slice(0, 18)
  }
  const scan = () => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return closePick()
    const rng = sel.getRangeAt(0)
    let node = rng.startContainer
    let offset = rng.startOffset
    if (node.nodeType !== Node.TEXT_NODE) {
      const child = node.childNodes[offset - 1]
      if (child && child.nodeType === Node.TEXT_NODE) {
        node = child
        offset = child.textContent?.length ?? 0
      } else return closePick()
    }
    const textNode = node as Text
    const before = textNode.textContent?.slice(0, offset) ?? ''
    const match = before.match(/(?:^|\s)([@/])([\w-]*)$/)
    if (!match) return closePick()
    const trigger = match[1]
    const query = match[2]
    const items = trigger === '@' ? mentionsFor(query) : commandsFor(query)
    setPick({ mode: trigger === '@' ? 'mention' : 'command', query, items, active: 0, rect: caretRect(), tokenStart: before.length - (1 + query.length), tokenEnd: offset, node: textNode })
  }

  const replaceToken = (insertNode: Node | null) => {
    const p = stateRef.current.pick
    if (!p) return
    const end = Math.min(p.tokenEnd, p.node.textContent?.length ?? 0)
    const sel = window.getSelection()
    const range = document.createRange()
    range.setStart(p.node, Math.min(p.tokenStart, end))
    range.setEnd(p.node, end)
    range.deleteContents()
    if (insertNode) {
      range.insertNode(insertNode)
      const space = document.createTextNode('\u00A0')
      insertNode.parentNode?.insertBefore(space, insertNode.nextSibling)
      const after = document.createRange()
      after.setStartAfter(space)
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)
    } else {
      const after = document.createRange()
      after.setStart(p.node, Math.min(p.tokenStart, p.node.textContent?.length ?? 0))
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)
    }
  }
  const choose = (item: PickerItem | undefined) => {
    if (!item) return
    if (!('type' in item) || !item.type) replaceToken(makeChip(item))
    else if (item.type === 'ms') {
      replaceToken(null)
      setMs(item.label)
      setMsColor(item.color)
    } else {
      replaceToken(null)
      if (item.key === 'priority') setPriority(v => !v)
      if (item.key === 'schedule') setSchedule(true)
      if (item.key === 'clearms') { setMs(null); setMsColor(null) }
    }
    closePick()
    ref.current?.focus()
  }
  const commit = () => {
    const el = ref.current
    if (!el) return
    const segments = readSegments(el)
    if (segEmpty(segments)) {
      onCancel?.()
      return
    }
    onCommit({ segments, ms: stateRef.current.ms, msColor: stateRef.current.msColor, priority: stateRef.current.priority, schedule: stateRef.current.schedule })
  }

  return (
    <div className="tp-editor-wrap">
      <div
        ref={ref}
        className={`tp-editor${oneLine ? ' one' : ''}`}
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder || 'Write a task...  @ to mention · / for commands'}
        onInput={scan}
        onKeyUp={event => {
          if (['Arrow', 'Home', 'End'].some(key => event.key.startsWith(key))) scan()
        }}
        onKeyDown={event => {
          const p = stateRef.current.pick
          if (p && p.items.length) {
            if (event.key === 'ArrowDown') { event.preventDefault(); setPick(x => x && { ...x, active: (x.active + 1) % x.items.length }); return }
            if (event.key === 'ArrowUp') { event.preventDefault(); setPick(x => x && { ...x, active: (x.active - 1 + x.items.length) % x.items.length }); return }
            if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(p.items[p.active]); return }
            if (event.key === 'Escape') { event.preventDefault(); closePick(); return }
          }
          if (event.key === 'Enter') { event.preventDefault(); commit(); return }
          if (event.key === 'Escape') { event.preventDefault(); onCancel?.() }
        }}
        onBlur={() => window.setTimeout(() => { if (!stateRef.current.pick) commit() }, 120)}
      />
      {(ms || priority || schedule) && (
        <div className="tp-editor-meta">
          {priority && <span className="tp-flag pri" onMouseDown={e => { e.preventDefault(); setPriority(false) }}><Icon name="star" size={10} fill /> Priority <Icon name="x" size={9} /></span>}
          {schedule && <span className="tp-flag sch" onMouseDown={e => { e.preventDefault(); setSchedule(false) }}><Icon name="calendar" size={10} /> Schedule <Icon name="x" size={9} /></span>}
          {ms && <span className="tp-flag ms" style={{ '--c': msColor || 'var(--moss)' } as React.CSSProperties} onMouseDown={e => { e.preventDefault(); setMs(null); setMsColor(null) }}><span className="d" style={{ background: msColor || 'var(--moss)' }} />{ms} <Icon name="x" size={9} /></span>}
        </div>
      )}
      {pick && pick.items.length > 0 && <MentionPopover pick={pick} onChoose={choose} onHover={i => setPick(x => x && { ...x, active: i })} />}
    </div>
  )
}

function MentionPopover({ pick, onChoose, onHover }: { pick: PickerState; onChoose: (item: PickerItem) => void; onHover: (i: number) => void }) {
  const style = { position: 'fixed' as const, left: Math.min(pick.rect.left, window.innerWidth - 320), top: pick.rect.bottom + 6, width: 300 }
  let idx = -1
  const sections: Array<{ header: string; rows: PickerItem[] }> = []
  if (pick.mode === 'mention') {
    ;(['person', 'company', 'opportunity'] as const).forEach(kind => {
      const rows = pick.items.filter(item => !('type' in item) && item.kind === kind)
      if (rows.length) sections.push({ header: kind === 'opportunity' ? 'Deals' : kind === 'company' ? 'Companies' : 'People', rows })
    })
  } else sections.push({ header: 'Commands', rows: pick.items })

  return createPortal(
    <div className="tp-pop" style={style}>
      {sections.map((section, si) => (
        <div key={si} className="tp-pop-sec">
          <div className="tp-pop-h">{section.header}</div>
          {section.rows.map(item => {
            idx += 1
            const active = idx === pick.active
            if (!('type' in item) || !item.type) {
              return (
                <button key={`${item.kind}${item.id}`} className={`tp-pop-row${active ? ' on' : ''}`} onMouseEnter={() => onHover(idx)} onMouseDown={e => { e.preventDefault(); onChoose(item) }}>
                  {item.kind === 'opportunity' ? <span className="tp-pop-av opp"><Icon name="dollar" size={12} /></span> : <Logo id={item.id} size={22} sq={item.kind === 'company'} />}
                  <span className="tp-pop-copy"><span className="nm">{item.name}</span>{item.sub && <span className="sb">{item.sub}</span>}</span>
                </button>
              )
            }
            return (
              <button key={`${item.type}${item.key}`} className={`tp-pop-row cmd${active ? ' on' : ''}`} onMouseEnter={() => onHover(idx)} onMouseDown={e => { e.preventDefault(); onChoose(item) }}>
                {item.type === 'ms' ? <span className="tp-pop-dot" style={{ background: item.color }} /> : <span className="tp-pop-ci"><Icon name={item.icon} size={13} /></span>}
                <span className="tp-pop-copy"><span className="nm">{item.label}</span>{item.type === 'cmd' && item.hint && <span className="sb">{item.hint}</span>}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>,
    document.body,
  )
}
