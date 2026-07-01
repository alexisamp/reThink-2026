// Today — daily cockpit, rebuilt to the reThink design bundle.
// Planner = time-block calendar + unscheduled todos, wired to live Supabase data.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowCounterClockwise, ArrowDown, CalendarBlank, CalendarDots, Check, ChartLineUp, MoonStars, Pause, PencilSimple, Play, Plus, SidebarSimple, Target, Timer, TrashSimple, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { isActiveOpportunityStage } from '@/lib/opportunityStages'
import type { Todo, Milestone, Goal, Review, TodoContentSegment, TodoMentionKind } from '@/types'
import MilestonePanel from '@/components/MilestonePanel'
import DayStartDrawer from '@/components/DayStartDrawer'
import EndOfDayDrawer from '@/components/EndOfDayDrawer'
import FocusTimer from './today/FocusTimer'
import DayCalendar from './today/DayCalendar'
import TodoScheduleList from './today/TodoScheduleList'
import RightRail, { type RailSectionDef } from './today/RightRail'
import MilestoneRows, { type MilestoneRowData } from './today/MilestoneRows'
import ThisWeek from './today/ThisWeek'
import { useFocusTimer } from './today/useFocusTimer'
import type { Mention, TodoMilestoneOption } from './today/types'
import { companyImage, createCrmObject, firstRelation, mentionFromCompany, mentionFromContact, mentionFromOpportunity } from '@/lib/crmObjects'

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type GoalLite = Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>
interface MsTodo { id: string; milestone_id: string | null; completed: boolean }

const POINTER_DAY_START = 7 * 60
const POINTER_DAY_END = 23 * 60
const POINTER_SNAP = 5
const POINTER_DEFAULT_DURATION = 10
const POINTER_PX_PER_MINUTE = 1.8

type PointerDropTarget =
  | { kind: 'calendar'; minute: number }
  | { kind: 'todos' }
  | { kind: 'backlog' }

type PointerTodoDrag = {
  id: string
  text: string
  x: number
  y: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapPointerMinute(value: number) {
  return Math.round(value / POINTER_SNAP) * POINTER_SNAP
}

function pointerMinuteFromGrid(clientY: number, grid: HTMLElement) {
  const rect = grid.getBoundingClientRect()
  const minutes = POINTER_DAY_START + ((clientY - rect.top + grid.scrollTop) / POINTER_PX_PER_MINUTE)
  return clampNumber(snapPointerMinute(minutes), POINTER_DAY_START, POINTER_DAY_END - POINTER_DEFAULT_DURATION)
}

function isPointInside(clientX: number, clientY: number, rect: DOMRect) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}
interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}
interface RelationCompany {
  id: string
  name?: string | null
  logo_url?: string | null
  domain?: string | null
  website_url?: string | null
}
interface OpportunityMentionRow {
  id: string
  title: string | null
  stage?: string | null
  type?: string | null
  company_id?: string | null
  company?: RelationCompany | RelationCompany[] | null
}
type TodayReviewRow = Pick<Review, 'notes' | 'one_thing' | 'one_thing_done' | 'energy_level' | 'tomorrow_focus' | 'tomorrow_reviewed' | 'day_locked_at'>
interface DayCloseSummary {
  removedTodoIds: string[]
  removedBacklogIds?: string[]
  plannedItems?: Array<{ id: string; text: string; src: 'pending' | 'backlog' | 'new' }>
  carriedCount: number
  clearedCount: number
  completedCount: number
  pendingCount: number
  energyLevel: number | null
  goalDone: boolean | null
  tomorrowGoal?: string
}

const FALLBACK_COLORS = ['#3E7A4E', '#536471', '#7A3E68', '#3E5F7A', '#9A6B4F']

function shouldFallbackWithoutContentSegments(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return /content_segments|schema cache|column .*does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
}

function legacyTextFromContentSegments(segments: TodoContentSegment[], fallback: string) {
  if (!segments.some(segment => segment.type !== 'text')) return fallback
  return segments.map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'mention') return `[[mention:${segment.kind}:${segment.id}]]`
    return segment.label
  }).join('').replace(/\s{2,}/g, ' ').trim()
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todoIdFromDrag(dataTransfer: DataTransfer) {
  return dataTransfer.getData('text/todo-id') || dataTransfer.getData('text/plain')
}

function hasSchedule(todo: Todo) {
  return todo.scheduled_start_minutes != null && todo.scheduled_duration_minutes != null
}

function formatDue(target: string | null, today: string): { label: string | null; urgent: boolean } {
  if (!target) return { label: null, urgent: false }
  const t = new Date(today + 'T12:00:00')
  const d = new Date(target + 'T12:00:00')
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days < 0) return { label: `${-days}d ago`, urgent: true }
  if (days === 0) return { label: 'today', urgent: true }
  return { label: `${days}d`, urgent: days <= 7 }
}

function addDays(base: string, n: number) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDate(d)
}

function relLabel(dateKey: string | null | undefined, todayK: string) {
  if (!dateKey) return null
  const diff = Math.round((new Date(dateKey).getTime() - new Date(todayK).getTime()) / 86400000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff < 7) return `in ${diff}d`
  if (diff < 14) return 'next week'
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function ObjectiveBar({
  objective,
  onChange,
}: {
  objective: string
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(objective || '')
  useEffect(() => setText(objective || ''), [objective])
  const commit = () => {
    onChange(text.trim())
    setEditing(false)
  }
  return (
    <div className="objective-bar" onClick={() => !editing && setEditing(true)}>
      <span className="obj-icon"><Target size={13} weight="bold" /></span>
      <span className="obj-label">Day objective</span>
      {editing ? (
        <input
          autoFocus
          className="obj-input"
          value={text}
          placeholder="What's the one big thing today?"
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(objective || '')
              setEditing(false)
            }
          }}
        />
      ) : (
        <span className={`obj-text${objective ? '' : ' empty'}`}>{objective || "Set today's objective..."}</span>
      )}
      <span className="obj-edit"><PencilSimple size={12} /></span>
    </div>
  )
}

function BacklogBin({
  count,
  armed,
  activeDragTodoId,
  activeCount = 0,
  onOpen,
  onDropTodo,
  onParkAll,
}: {
  count: number
  armed?: boolean
  activeDragTodoId?: string | null
  activeCount?: number
  onOpen: () => void
  onDropTodo?: (id: string) => void
  onParkAll?: () => void
}) {
  const [over, setOver] = useState(false)
  const hasTodoDrag = (types: DOMStringList | readonly string[]) => {
    const list = Array.from(types)
    return armed || Boolean(activeDragTodoId) || list.includes('text/todo-id') || list.includes('text/plain')
  }
  return (
    <>
      <button
        data-todo-backlog-drop
        className={`backlog-bin${armed ? ' armed' : ''}${over ? ' over' : ''}`}
        onClick={onOpen}
        title="Backlog — drag a todo here to park it"
        onDragOver={e => {
          if (hasTodoDrag(e.dataTransfer.types)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setOver(true)
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          const id = todoIdFromDrag(e.dataTransfer) || activeDragTodoId || ''
          setOver(false)
          if (id) onDropTodo?.(id)
        }}
      >
        <Archive size={14} />
        <span className="bl-word">Backlog</span>
        {count > 0 && <span className="bl-count">{count}</span>}
      </button>
      {activeCount > 0 && onParkAll && (
        <button className="backlog-bin backlog-all" onClick={onParkAll} title="Move all active todos to Backlog">
          <Archive size={13} />
          <span className="bl-word">All</span>
        </button>
      )}
    </>
  )
}

function ReturnDatePicker({
  value,
  todayK,
  onPick,
}: {
  value: string | null | undefined
  todayK: string
  onPick: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const label = relLabel(value, todayK)
  return (
    <span ref={wrap} style={{ position: 'relative' }}>
      <button className={`bl-date${value ? '' : ' empty'}`} onClick={() => setOpen(o => !o)}>
        <CalendarBlank size={10} />
        {label || 'no date'}
      </button>
      {open && (
        <div className="date-popover" style={{ top: '100%', right: 0, marginTop: 6, minWidth: 200 }}>
          <button onClick={() => { onPick(addDays(todayK, 1)); setOpen(false) }}>Tomorrow<span className="meta">auto</span></button>
          <button onClick={() => { onPick(addDays(todayK, 3)); setOpen(false) }}>In 3 days<span className="meta">auto</span></button>
          <button onClick={() => { onPick(addDays(todayK, 7)); setOpen(false) }}>Next week<span className="meta">auto</span></button>
          <div className="sep" />
          <input type="date" value={value || ''} min={todayK} onChange={e => onPick(e.target.value || null)} />
          <div className="sep" />
          <button onClick={() => { onPick(null); setOpen(false) }} className="bl-clear">No date · manual only</button>
        </div>
      )}
    </span>
  )
}

function BacklogPanel({
  items,
  todayK,
  activeDragTodoId,
  activeCount = 0,
  onClose,
  onDropTodo,
  onParkAll,
  onRestore,
  onSetDate,
  onRemove,
}: {
  items: Todo[]
  todayK: string
  activeDragTodoId?: string | null
  activeCount?: number
  onClose: () => void
  onDropTodo?: (id: string) => void
  onParkAll?: () => void
  onRestore: (id: string) => void
  onSetDate: (id: string, value: string | null) => void
  onRemove: (id: string) => void
}) {
  const [dropOver, setDropOver] = useState(false)
  const hasTodoDrag = (types: DOMStringList | readonly string[]) => {
    const list = Array.from(types)
    return Boolean(activeDragTodoId) || list.includes('text/todo-id') || list.includes('text/plain')
  }
  return (
    <>
      <div className="bl-scrim" onClick={onClose} />
      <aside className="bl-panel" role="dialog" aria-label="Backlog">
        <header className="bl-hd">
          <div className="bl-hd-title">
            <Archive size={15} />
            <h3>Backlog</h3>
            <span className="bl-hd-count">{items.length}</span>
          </div>
          <div className="bl-hd-actions">
            {activeCount > 0 && onParkAll && (
              <button className="bl-move-all" onClick={onParkAll} title="Move all active todos to Backlog">
                <Archive size={12} />
                All active
              </button>
            )}
            <button className="bl-close" onClick={onClose} title="Close"><X size={13} /></button>
          </div>
        </header>
        <p className="bl-sub">Tasks on hold — not deleted. Pull one back with <b>+</b>, or give it a tentative date so it returns on its own.</p>
        <div
          data-todo-backlog-drop
          className={`bl-list${dropOver ? ' drop' : ''}`}
          onDragOver={(e) => {
            if (!onDropTodo) return
            if (hasTodoDrag(e.dataTransfer.types)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropOver(true)
            }
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDropOver(false)
            const id = todoIdFromDrag(e.dataTransfer) || activeDragTodoId || ''
            if (id && onDropTodo) onDropTodo(id)
          }}
        >
          {items.length === 0 && (
            <div className="bl-empty">
              <Archive size={22} />
              <span>Nothing on hold.</span>
              <small>Park a todo from Today to clear it without deleting it.</small>
            </div>
          )}
          {items.map(it => (
            <div className="bl-item" key={it.id}>
              <button className="bl-restore" onClick={() => onRestore(it.id)} title="Bring back to Today"><Plus size={12} /></button>
              <span className="bl-text">{it.text}</span>
              <ReturnDatePicker value={it.return_date} todayK={todayK} onPick={d => onSetDate(it.id, d)} />
              <button className="bl-trash" onClick={() => onRemove(it.id)} title="Delete for good"><TrashSimple size={12} /></button>
            </div>
          ))}
        </div>
        {items.some(i => i.return_date) && (
          <div className="bl-foot"><CalendarBlank size={11} /> Dated items flow back into Today when that day starts.</div>
        )}
      </aside>
    </>
  )
}

function AgendaRows({ items = [] }: { items?: Array<never> }) {
  if (!items.length) {
    return <div className="ns-empty">No meetings booked. A quiet week — or time to reach out.</div>
  }
  return (
    <div className="agenda">
      <div className="ag-feeds"><ArrowDown size={10} />{items.length} this week feed <b>Scheduled</b></div>
    </div>
  )
}

function ContextDrawer({
  open,
  sections,
  journal,
  onJournalChange,
  onClose,
}: {
  open: boolean
  sections: RailSectionDef[]
  journal: string
  onJournalChange: (value: string) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <>
      <div className="ctx-scrim" onClick={onClose} />
      <aside className="ctx-drawer" aria-label="Today context">
        <header className="ctx-hd">
          <div>
            <h3>Context</h3>
            <span>Milestones, week, agenda, journal</span>
          </div>
          <button onClick={onClose} title="Close context"><X size={13} /></button>
        </header>
        <RightRail sections={sections.map(section => section.id === 'journal'
          ? {
              ...section,
              body: (
                <textarea
                  className="journal-area"
                  placeholder="What's on your mind?"
                  value={journal}
                  onChange={event => onJournalChange(event.target.value)}
                />
              ),
            }
          : section)}
        />
      </aside>
    </>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const today = localDate()
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const weekDates = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday); x.setDate(monday.getDate() + i)
      return localDate(x)
    })
  }, [])

  const [userId, setUserId] = useState<string | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [backlog, setBacklog] = useState<Todo[]>([])
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [dragArmed, setDragArmed] = useState(false)
  const [activeDragTodoId, setActiveDragTodoId] = useState<string | null>(null)
  const [pointerTodoDrag, setPointerTodoDrag] = useState<PointerTodoDrag | null>(null)
  const [pointerDropTarget, setPointerDropTarget] = useState<PointerDropTarget | null>(null)
  const [msTodos, setMsTodos] = useState<MsTodo[]>([])      // all milestone-linked todos (for progress)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [goalsMap, setGoalsMap] = useState<Map<string, GoalLite>>(new Map())
  const [goals, setGoals] = useState<GoalLite[]>([])
  const [mentions, setMentions] = useState<Map<string, Mention>>(new Map())  // key: `${kind}:${id}`
  const [mentionOptions, setMentionOptions] = useState<Mention[]>([])
  const [expandedMs, setExpandedMs] = useState<string | null>(null)
  const [journal, setJournal] = useState('')
  const [dailyGoal, setDailyGoal] = useState('')
  const [userName, setUserName] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dayClosed, setDayClosed] = useState(false)
  const [closedSummary, setClosedSummary] = useState<DayCloseSummary | null>(null)
  const focus = useFocusTimer(userId)
  const journalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const journalInit = useRef(false)

  const setTodoDrag = useCallback((id: string | null) => {
    setActiveDragTodoId(id)
    setDragArmed(Boolean(id))
  }, [])

  const getPointerDropTarget = useCallback((clientX: number, clientY: number): PointerDropTarget | null => {
    const grid = document.querySelector<HTMLElement>('[data-day-calendar-grid]')
    if (grid && isPointInside(clientX, clientY, grid.getBoundingClientRect())) {
      return { kind: 'calendar', minute: pointerMinuteFromGrid(clientY, grid) }
    }

    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (element?.closest('[data-todo-unschedule-drop]')) return { kind: 'todos' }
    if (element?.closest('[data-todo-backlog-drop]')) return { kind: 'backlog' }
    return null
  }, [])

  // ── load mentions for a set of todos ───────────────────────────
  const loadMentions = useCallback(async (uid: string, list: Todo[]) => {
    const contactIds = [...new Set(list.map(t => t.contact_id).filter(Boolean))] as string[]
    const companyIds = [...new Set(list.map(t => t.company_id).filter(Boolean))] as string[]
    const oppIds = [...new Set(list.map(t => t.opportunity_id).filter(Boolean))] as string[]
    const map = new Map<string, Mention>()
    await Promise.all([
      contactIds.length
        ? supabase.from('outreach_logs').select('id, name, profile_photo_url').in('id', contactIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`person:${c.id}`, { id: c.id, name: c.name, kind: 'person', imageUrl: c.profile_photo_url })))
        : null,
      companyIds.length
        ? supabase.from('companies').select('id, name, logo_url, domain, website_url').in('id', companyIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`company:${c.id}`, { id: c.id, name: c.name, kind: 'company', imageUrl: companyImage(c.logo_url, c.domain ?? c.website_url) })))
        : null,
      oppIds.length
        ? supabase.from('opportunities').select('id, title, company_id, company:companies(id, name, logo_url, domain, website_url)').in('id', oppIds).eq('user_id', uid)
            .then(({ data }) => ((data ?? []) as OpportunityMentionRow[]).forEach(o => {
              const company = firstRelation(o.company)
              map.set(`opportunity:${o.id}`, {
                id: o.id,
                name: o.title ?? 'Opportunity',
                kind: 'opportunity',
                sub: company?.name ?? null,
                imageUrl: companyImage(company?.logo_url, company?.domain ?? company?.website_url),
                companyId: o.company_id ?? company?.id ?? null,
              })
            }))
        : null,
    ])
    setMentions(map)
  }, [])

  // ── initial load ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setUserId(user.id)
      const rawName = typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === 'string'
          ? user.user_metadata.name
          : user.email?.split('@')[0]
      setUserName(rawName ? rawName.split(/\s+/)[0] : null)

      const [todosRes, overdueTodosRes, dueBacklogRes, backlogRes, msTodosRes, msRes, goalsRes, reviewRes, contactsRes, companiesRes, oppsRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id).eq('date', today).is('backlog_at', null).order('sort_order').order('created_at'),
        supabase.from('todos').select('*').eq('user_id', user.id).lt('date', today).eq('completed', false).is('backlog_at', null).order('date').order('sort_order').order('created_at'),
        supabase.from('todos').select('*').eq('user_id', user.id).eq('completed', false).not('backlog_at', 'is', null).not('return_date', 'is', null).lte('return_date', today).order('return_date').order('created_at'),
        supabase.from('todos').select('*').eq('user_id', user.id).eq('completed', false).not('backlog_at', 'is', null).order('backlog_at', { ascending: false }),
        supabase.from('todos').select('id, milestone_id, completed').eq('user_id', user.id).not('milestone_id', 'is', null),
        supabase.from('milestones').select('*').eq('user_id', user.id).neq('status', 'COMPLETE').order('target_date', { nullsFirst: false }),
        supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE').order('position'),
        supabase.from('reviews').select('notes, one_thing, one_thing_done, energy_level, tomorrow_focus, tomorrow_reviewed, day_locked_at').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('outreach_logs').select('id, name, profile_photo_url, company, job_title, email').eq('user_id', user.id).order('name'),
        supabase.from('companies').select('id, name, logo_url, domain, website_url, sector, headline').eq('user_id', user.id).order('name'),
        supabase.from('opportunities').select('id, title, stage, type, company_id, company:companies(id, name, logo_url, domain, website_url)').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      if (cancelled) return

      const overdueTodos = ((overdueTodosRes.data ?? []) as Todo[]).map(t => ({ ...t, date: today }))
      const dueBacklogTodos = ((dueBacklogRes.data ?? []) as Todo[]).map(t => ({
        ...t,
        date: today,
        backlog_at: null,
        return_date: null,
        scheduled_start_minutes: null,
        scheduled_duration_minutes: null,
      }))
      if (overdueTodos.length > 0) {
        supabase.from('todos').update({ date: today }).in('id', overdueTodos.map(t => t.id)).then(() => {})
      }
      if (dueBacklogTodos.length > 0) {
        supabase.from('todos').update({
          date: today,
          backlog_at: null,
          return_date: null,
          scheduled_start_minutes: null,
          scheduled_duration_minutes: null,
        }).in('id', dueBacklogTodos.map(t => t.id)).then(() => {})
      }
      const byTodo = new Map<string, Todo>()
      ;[...dueBacklogTodos, ...overdueTodos, ...((todosRes.data ?? []) as Todo[])].forEach(t => byTodo.set(t.id, t))
      const todoList = [...byTodo.values()]
      const restoredIds = new Set(dueBacklogTodos.map(t => t.id))
      const backlogList = ((backlogRes.data ?? []) as Todo[]).filter(t => !restoredIds.has(t.id))
      const peopleOptions: Mention[] = (contactsRes.data ?? []).map(c => mentionFromContact(c))
      const companyOptions: Mention[] = (companiesRes.data ?? []).map(c => mentionFromCompany(c))
      const oppOptions: Mention[] = ((oppsRes.data ?? []) as OpportunityMentionRow[])
        .filter(o => isActiveOpportunityStage(o.stage))
        .map(o => mentionFromOpportunity(o))
      const review = reviewRes.data as TodayReviewRow | null
      setTodos(todoList)
      setBacklog(backlogList)
      setMsTodos((msTodosRes.data ?? []) as MsTodo[])
      setMilestones((msRes.data ?? []) as Milestone[])
      setMentionOptions([...peopleOptions, ...companyOptions, ...oppOptions])
      const gl = (goalsRes.data ?? []) as GoalLite[]
      setGoals(gl)
      setGoalsMap(new Map(gl.map(g => [g.id, g])))
      if (!journalInit.current) { setJournal(review?.notes ?? ''); journalInit.current = true }
      const savedGoal = review?.one_thing?.trim() ?? ''
      setDailyGoal(savedGoal)
      setDayClosed(Boolean(review?.tomorrow_reviewed || review?.day_locked_at))
      setClosedSummary(review?.tomorrow_reviewed || review?.day_locked_at ? {
        removedTodoIds: [],
        carriedCount: 0,
        clearedCount: 0,
        completedCount: todoList.filter(t => t.completed).length,
        pendingCount: todoList.filter(t => !t.completed).length,
        energyLevel: review?.energy_level ?? null,
        goalDone: review?.one_thing_done ?? null,
        tomorrowGoal: review?.tomorrow_focus ?? undefined,
      } : null)
      const dayStartKey = `rethink.today.started:${today}`
      if (savedGoal) {
        localStorage.setItem(dayStartKey, '1')
        setStartOpen(false)
      } else if (!localStorage.getItem(dayStartKey)) {
        localStorage.setItem(dayStartKey, '1')
        setStartOpen(true)
      }
      loadMentions(user.id, todoList)
    })()
    return () => { cancelled = true }
  }, [today, loadMentions])

  // ── milestone progress (done/total) from milestone-linked todos ──
  const msProgress = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    for (const t of msTodos) {
      if (!t.milestone_id) continue
      const cur = m.get(t.milestone_id) ?? { done: 0, total: 0 }
      cur.total++; if (t.completed) cur.done++
      m.set(t.milestone_id, cur)
    }
    return m
  }, [msTodos])

  const colorForGoal = useCallback((goalId: string | null) => {
    const g = goalId ? goalsMap.get(goalId) : null
    if (g?.color) return g.color
    // stable fallback by goal id hash
    const idx = goalId ? [...goalId].reduce((s, c) => s + c.charCodeAt(0), 0) % FALLBACK_COLORS.length : 0
    return FALLBACK_COLORS[idx]
  }, [goalsMap])

  const milestoneRows: MilestoneRowData[] = useMemo(() => {
    return [...milestones]
      .filter(m => m.focused)
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31'))
      .slice(0, 6)
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          emoji: m.emoji ?? g?.emoji ?? null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  const milestoneOptions: TodoMilestoneOption[] = useMemo(() => {
    return [...milestones]
      .filter(m => m.focused)
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31') ||
        a.text.localeCompare(b.text))
      .slice(0, 6)
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          goalId: m.goal_id,
          goalLabel: g?.alias || g?.text || null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  const resolveMentions = useCallback((t: Todo): Mention[] => {
    const out: Mention[] = []
    if (t.contact_id) { const m = mentions.get(`person:${t.contact_id}`); if (m) out.push(m) }
    if (t.company_id) { const m = mentions.get(`company:${t.company_id}`); if (m) out.push(m) }
    if (t.opportunity_id) { const m = mentions.get(`opportunity:${t.opportunity_id}`); if (m) out.push(m) }
    return out
  }, [mentions])

  // ── todo handlers ──────────────────────────────────────────────
  const syncMsTodo = (id: string, patch: Partial<MsTodo>) =>
    setMsTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  const reportSaveError = (action: string, error: { message?: string; code?: string } | null) => {
    console.error(`Failed to ${action}`, error)
    const missingColumn = error?.message?.includes('scheduled_') || error?.code === 'PGRST204'
    setSaveError(missingColumn
      ? 'Could not save the day plan because the database schema was missing. Reload and try again.'
      : 'Could not save that change. Reload and try again.')
    window.setTimeout(() => setSaveError(null), 7000)
  }

  const toggleTodo = async (id: string) => {
    const t = todos.find(x => x.id === id); if (!t) return
    const next = !t.completed
    const completedAt = next ? new Date().toISOString() : null
    setTodos(prev => prev.map(x => x.id === id ? { ...x, completed: next, completed_at: completedAt } : x))
    syncMsTodo(id, { completed: next })
    const { error } = await supabase
      .from('todos')
      .update({ completed: next, completed_at: completedAt })
      .eq('id', id)
      .select('id, completed, completed_at')
      .single()
    if (error) {
      setTodos(prev => prev.map(x => x.id === id ? t : x))
      syncMsTodo(id, { completed: t.completed })
      reportSaveError('toggle todo', error)
    }
  }
  const parkTodo = async (id: string) => {
    const t = todos.find(x => x.id === id)
    if (!t) return
    const patch = { backlog_at: new Date().toISOString(), return_date: null, date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setTodos(prev => prev.filter(x => x.id !== id))
    setBacklog(prev => [{ ...t, ...patch }, ...prev])
    setBacklogOpen(true)
    await supabase.from('todos').update(patch).eq('id', id)
  }
  const parkAllTodos = async () => {
    const activeTodos = todos.filter(t => !t.completed)
    if (activeTodos.length === 0) return
    const ids = activeTodos.map(t => t.id)
    const idSet = new Set(ids)
    const patch = { backlog_at: new Date().toISOString(), return_date: null, date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setTodos(prev => prev.filter(t => !idSet.has(t.id)))
    setBacklog(prev => {
      const existing = new Set(prev.map(t => t.id))
      const parked = activeTodos.filter(t => !existing.has(t.id)).map(t => ({ ...t, ...patch }))
      return [...parked, ...prev]
    })
    setBacklogOpen(true)
    await supabase.from('todos').update(patch).in('id', ids)
  }
  const scheduleTodo = async (id: string, startMinutes: number, durationMinutes: number) => {
    const previous = todos.find(t => t.id === id)
    if (!previous) return
    const patch = {
      scheduled_start_minutes: startMinutes,
      scheduled_duration_minutes: durationMinutes,
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await supabase
      .from('todos')
      .update(patch)
      .eq('id', id)
      .select('id, scheduled_start_minutes, scheduled_duration_minutes')
      .single()
    if (error) {
      setTodos(prev => prev.map(t => t.id === id ? previous : t))
      reportSaveError('schedule todo', error)
    }
  }
  const unscheduleTodo = async (id: string) => {
    const previous = todos.find(t => t.id === id)
    if (!previous) return
    const patch = {
      scheduled_start_minutes: null,
      scheduled_duration_minutes: null,
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await supabase
      .from('todos')
      .update(patch)
      .eq('id', id)
      .select('id, scheduled_start_minutes, scheduled_duration_minutes')
      .single()
    if (error) {
      setTodos(prev => prev.map(t => t.id === id ? previous : t))
      reportSaveError('unschedule todo', error)
    }
  }

  const scheduleTodoRef = useRef(scheduleTodo)
  const unscheduleTodoRef = useRef(unscheduleTodo)
  const parkTodoRef = useRef(parkTodo)

  useEffect(() => {
    scheduleTodoRef.current = scheduleTodo
    unscheduleTodoRef.current = unscheduleTodo
    parkTodoRef.current = parkTodo
  })

  const startPointerTodoDrag = useCallback((todo: Todo, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setTodoDrag(todo.id)
    setPointerDropTarget(getPointerDropTarget(event.clientX, event.clientY))
    setPointerTodoDrag({
      id: todo.id,
      text: todo.text || 'Untitled todo',
      x: event.clientX,
      y: event.clientY,
    })
  }, [getPointerDropTarget, setTodoDrag])

  const activePointerDragId = pointerTodoDrag?.id ?? null

  useEffect(() => {
    if (!activePointerDragId) return

    const move = (event: globalThis.PointerEvent) => {
      event.preventDefault()
      setPointerTodoDrag(current => current ? { ...current, x: event.clientX, y: event.clientY } : current)
      setPointerDropTarget(getPointerDropTarget(event.clientX, event.clientY))
    }

    const finish = (event: globalThis.PointerEvent) => {
      event.preventDefault()
      const drop = getPointerDropTarget(event.clientX, event.clientY)
      const id = activePointerDragId
      setPointerTodoDrag(null)
      setPointerDropTarget(null)
      setTodoDrag(null)

      if (drop?.kind === 'calendar') {
        void scheduleTodoRef.current(id, drop.minute, POINTER_DEFAULT_DURATION)
      } else if (drop?.kind === 'todos') {
        void unscheduleTodoRef.current(id)
      } else if (drop?.kind === 'backlog') {
        void parkTodoRef.current(id)
      }
    }

    const cancel = () => {
      setPointerTodoDrag(null)
      setPointerDropTarget(null)
      setTodoDrag(null)
    }

    document.body.classList.add('today-pointer-dragging')
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', finish, { once: true, passive: false })
    window.addEventListener('pointercancel', cancel, { once: true })
    return () => {
      document.body.classList.remove('today-pointer-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [activePointerDragId, getPointerDropTarget, setTodoDrag])

  const restoreBacklogTodo = async (id: string) => {
    const t = backlog.find(x => x.id === id)
    if (!t) return
    const restored: Todo = { ...t, date: today, backlog_at: null, return_date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setBacklog(prev => prev.filter(x => x.id !== id))
    setTodos(prev => [...prev, restored])
    await supabase.from('todos').update({ date: today, backlog_at: null, return_date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }).eq('id', id)
    if (userId) loadMentions(userId, [...todos, restored])
  }
  const setBacklogReturnDate = async (id: string, returnDate: string | null) => {
    setBacklog(prev => prev.map(x => x.id === id ? { ...x, return_date: returnDate } : x))
    await supabase.from('todos').update({ return_date: returnDate }).eq('id', id)
  }
  const deleteBacklogTodo = async (id: string) => {
    setBacklog(prev => prev.filter(x => x.id !== id))
    await supabase.from('todos').delete().eq('id', id)
  }
  const createMention = useCallback(async (kind: TodoMentionKind, name: string, companyId?: string | null) => {
    if (!userId) return null
    const created = await createCrmObject(supabase, userId, kind, name, { today, companyId })
    if (!created) return null
    setMentionOptions(prev => {
      const exists = prev.some(m => m.kind === created.mention.kind && m.id === created.mention.id)
      return exists ? prev : [...prev, created.mention].sort((a, b) => a.name.localeCompare(b.name))
    })
    setMentions(prev => {
      const next = new Map(prev)
      if (created.mention.id) next.set(`${created.mention.kind}:${created.mention.id}`, created.mention)
      return next
    })
    return created.mention
  }, [today, userId])

  const editTodoText = async (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => {
    const patch: Partial<Todo> = { text, content_segments: contentSegments }
    if (links?.contactId !== undefined) patch.contact_id = links.contactId
    if (links?.companyId !== undefined) patch.company_id = links.companyId
    if (links?.opportunityId !== undefined) patch.opportunity_id = links.opportunityId
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    const updatePayload = {
      text,
      content_segments: contentSegments,
      ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
      ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
      ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
    }
    const { error } = await supabase.from('todos').update(updatePayload).eq('id', id)
    if (shouldFallbackWithoutContentSegments(error)) {
      const { error: fallbackError } = await supabase
        .from('todos')
        .update({
          text: legacyTextFromContentSegments(contentSegments, text),
          ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
          ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
          ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
        })
        .eq('id', id)
      if (fallbackError) console.error('editTodoText fallback failed:', fallbackError)
    } else if (error) {
      console.error('editTodoText failed:', error)
    }
    if (userId && links) loadMentions(userId, todos.map(x => x.id === id ? { ...x, ...patch } as Todo : x))
  }
  const addTodo = async (text: string, milestoneId: string | null, contentSegments: TodoContentSegment[], links: TodoLinks = {}) => {
    if (!userId) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const selectedOpp = links.opportunityId ? mentionOptions.find(m => m.kind === 'opportunity' && m.id === links.opportunityId) : null
    const companyId = links.companyId ?? selectedOpp?.companyId ?? null
    const todoId = crypto.randomUUID()
    const optimisticTodo: Todo = {
      id: todoId,
      text,
      user_id: userId,
      date: today,
      content_segments: contentSegments,
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: companyId,
      opportunity_id: links.opportunityId ?? null,
      effort: null,
      block: null,
      completed: false,
      waiting: false,
      completed_at: null,
      scheduled_start_minutes: null,
      scheduled_duration_minutes: null,
      sort_order: todos.length,
      url: null,
      outreach_log_id: null,
      attio_task_id: null,
      is_featured: false,
      created_at: new Date().toISOString(),
    }
    setTodos(prev => [...prev, optimisticTodo])
    if (milestoneId) setMsTodos(prev => [...prev, { id: todoId, milestone_id: milestoneId, completed: false }])

    const insertPayload = {
      id: todoId, text, user_id: userId, date: today,
      content_segments: contentSegments,
      milestone_id: milestoneId, goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: companyId,
      opportunity_id: links.opportunityId ?? null,
    }
    const { error } = await supabase.from('todos').insert(insertPayload)
    if (shouldFallbackWithoutContentSegments(error)) {
      const { error: fallbackError } = await supabase
        .from('todos')
        .insert({
          id: todoId,
          text: legacyTextFromContentSegments(contentSegments, text),
          user_id: userId,
          date: today,
          milestone_id: milestoneId,
          goal_id: milestone?.goal_id ?? null,
          contact_id: links.contactId ?? null,
          company_id: companyId,
          opportunity_id: links.opportunityId ?? null,
        })
      if (fallbackError) {
        console.error('addTodo fallback failed:', fallbackError)
        return
      }
    } else if (error) {
      console.error('addTodo failed:', error)
      return
    }
    loadMentions(userId, [...todos, optimisticTodo])
  }

  const changeTodoMilestone = async (id: string, milestoneId: string | null) => {
    const todo = todos.find(x => x.id === id)
    if (!todo) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const patch: Partial<Todo> = {
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    setMsTodos(prev => {
      const without = prev.filter(x => x.id !== id)
      if (!milestoneId) return without
      return [...without, { id, milestone_id: milestoneId, completed: todo.completed }]
    })
    await supabase.from('todos').update({
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }).eq('id', id)
  }

  // ── milestone panel todo sync ──────────────────────────────────
  const onPanelTodoCreate = (t: Todo) => {
    if (t.milestone_id) setMsTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, { id: t.id, milestone_id: t.milestone_id, completed: t.completed }])
    if (t.date === today) setTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, t])
  }
  const onPanelTodoUpdate = (t: Todo) => {
    if (t.milestone_id) syncMsTodo(t.id, { completed: t.completed, milestone_id: t.milestone_id })
    setTodos(prev => {
      const inToday = t.date === today
      const exists = prev.some(x => x.id === t.id)
      if (inToday) return exists ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]
      return prev.filter(x => x.id !== t.id)
    })
  }
  const onPanelTodoDelete = (id: string) => {
    setTodos(prev => prev.filter(x => x.id !== id))
    setMsTodos(prev => prev.filter(x => x.id !== id))
  }

  const expandedMilestone = milestones.find(m => m.id === expandedMs) ?? null
  const expandedGoal = expandedMilestone ? goalsMap.get(expandedMilestone.goal_id) ?? null : null

  const activeTodoCount = todos.filter(t => !t.completed).length
  const scheduledTodos = todos.filter(hasSchedule)
  const unscheduledTodos = todos
    .filter(t => !hasSchedule(t))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const onJournalChange = (value: string) => {
    setJournal(value)
    if (!userId) return
    if (journalTimer.current) clearTimeout(journalTimer.current)
    journalTimer.current = setTimeout(() => {
      supabase.from('reviews').upsert({ user_id: userId, date: today, notes: value }, { onConflict: 'user_id,date' }).then(() => {})
    }, 700)
  }

  const contextSections: RailSectionDef[] = userId ? [
    {
      id: 'milestones', title: 'Milestones', icon: <Target size={13} />, count: milestoneRows.length,
      body: <MilestoneRows rows={milestoneRows} activeId={expandedMs} onExpand={setExpandedMs} onManage={() => navigate('/milestones')} />,
    },
    {
      id: 'thisweek', title: 'This week', icon: <ChartLineUp size={13} />, tone: 'lagging',
      body: <ThisWeek userId={userId} weekDates={weekDates} today={today} onManage={() => navigate('/milestones')} />,
    },
    {
      id: 'agenda', title: 'Agenda', icon: <CalendarDots size={13} />, count: 0,
      body: <AgendaRows />,
    },
    {
      id: 'journal', title: 'Journal', icon: <PencilSimple size={13} />,
      body: null,
    },
  ] : []

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.closest('input, textarea, [contenteditable="true"]')
      if (editing) return
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setContextOpen(open => !open)
      }
      if (event.key === 'Escape') setContextOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reopenDay = async () => {
    if (!userId) return
    setDayClosed(false)
    const ids = closedSummary?.removedTodoIds ?? []
    const reviewPayload = { user_id: userId, date: today, tomorrow_reviewed: false, day_locked_at: null }
    const { error } = await supabase.from('reviews').upsert(reviewPayload, { onConflict: 'user_id,date' })
    if (error) {
      await supabase.from('reviews').upsert({ user_id: userId, date: today, tomorrow_reviewed: false }, { onConflict: 'user_id,date' })
    }
    if (ids.length > 0) {
      await supabase.from('todos').update({ date: today }).in('id', ids)
      const { data } = await supabase.from('todos').select('*').in('id', ids)
      if (data) {
        setTodos(prev => {
          const byId = new Map(prev.map(t => [t.id, t]))
          ;(data as Todo[]).forEach(t => byId.set(t.id, t))
          return [...byId.values()]
        })
        setMsTodos(prev => {
          const byId = new Map(prev.map(t => [t.id, t]))
          ;(data as Todo[]).forEach(t => {
            if (t.milestone_id) byId.set(t.id, { id: t.id, milestone_id: t.milestone_id, completed: t.completed })
          })
          return [...byId.values()]
        })
      }
    }
    setClosedSummary(null)
  }

  return (
    <div className="page">
      <div className="day-bar">
        <div className="day-bar-l">
          <h1 className="day-date">{todayLabel}</h1>
          <span className="day-state"><span className="day-pip" /> {dayClosed ? 'day closed' : 'day in progress'}</span>
        </div>
        <div className="day-bar-r">
        {focus.complete ? (
          <div className="day-timer" title={focus.intention || 'Focus complete'}>
            <Check size={12} weight="bold" />
            <span className="dt-clock">done</span>
            <button className="dt-toggle" onClick={focus.dismiss} title="Dismiss"><X size={12} /></button>
          </div>
        ) : focus.active ? (
          <div className={`day-timer${focus.running ? ' running' : ''}`} title={focus.intention || 'Focus session'}>
            <button className="dt-toggle" onClick={focus.running ? focus.pause : focus.resume} title={focus.running ? 'Pause' : 'Resume'}>
              {focus.running ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
            </button>
            <span className="dt-clock">{fmtClock(focus.remaining)}</span>
            <button className={`dt-focus${focus.intention ? ' set' : ''}`} onClick={() => setFocusOpen(true)}>
              <Target size={12} />
              <span className="dt-focus-tx">{focus.intention || 'Focus'}</span>
            </button>
            <button className="dt-toggle" onClick={focus.cancel} title="Cancel"><X size={12} /></button>
          </div>
        ) : (
          <button className="backlog-bin" onClick={() => setFocusOpen(true)} title="Start a focus session">
            <Timer size={13} />
            <span className="bl-word">Focus</span>
          </button>
        )}
        <button className="backlog-bin context-bin" onClick={() => setContextOpen(true)} title="Context (J)">
          <SidebarSimple size={13} />
          <span className="bl-word">Context</span>
          <span className="keycap">J</span>
        </button>
        <BacklogBin
          count={backlog.length}
          armed={dragArmed}
          activeDragTodoId={activeDragTodoId}
          activeCount={activeTodoCount}
          onOpen={() => setBacklogOpen(true)}
          onDropTodo={parkTodo}
          onParkAll={parkAllTodos}
        />
        {dayClosed ? (
          <button className="close-day-btn" onClick={reopenDay} title="Reopen the day">
            <ArrowCounterClockwise size={13} /> Reopen
          </button>
        ) : (
          <button className="close-day-btn" onClick={() => setEndOpen(true)} title="Close the day">
            <MoonStars size={13} /> Close day
          </button>
        )}
        </div>
      </div>

      {!dayClosed && (
        <ObjectiveBar
          objective={dailyGoal}
          onChange={async value => {
            setDailyGoal(value)
            if (userId) await supabase.from('reviews').upsert({ user_id: userId, date: today, one_thing: value }, { onConflict: 'user_id,date' })
          }}
        />
      )}

      {saveError && (
        <div className="day-save-alert" role="status">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} title="Dismiss"><X size={12} /></button>
        </div>
      )}

      {pointerTodoDrag && (
        <div
          className={`todo-pointer-ghost${pointerDropTarget ? ` over-${pointerDropTarget.kind}` : ''}`}
          style={{ transform: `translate3d(${pointerTodoDrag.x + 12}px, ${pointerTodoDrag.y + 12}px, 0)` }}
        >
          <span>{pointerTodoDrag.text}</span>
          {pointerDropTarget?.kind === 'calendar' && <b>Schedule</b>}
          {pointerDropTarget?.kind === 'todos' && <b>Todos</b>}
          {pointerDropTarget?.kind === 'backlog' && <b>Backlog</b>}
        </div>
      )}

      {!dayClosed && (
        <div className="today-planner">
          <DayCalendar
            todos={scheduledTodos}
            today={today}
            onSchedule={scheduleTodo}
            onToggle={toggleTodo}
            onUnschedule={unscheduleTodo}
            onBacklog={parkTodo}
            onDragArm={setDragArmed}
            activeDragTodoId={activeDragTodoId}
            onDragTodo={setTodoDrag}
            pointerOverMinute={pointerDropTarget?.kind === 'calendar' ? pointerDropTarget.minute : null}
            onPointerDragStart={startPointerTodoDrag}
            resolveMentions={resolveMentions}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            onEditText={editTodoText}
            onCreateMention={createMention}
            onChangeMilestone={changeTodoMilestone}
          />
          <TodoScheduleList
            todos={unscheduledTodos}
            onToggle={toggleTodo}
            onAdd={addTodo}
            onDropTodo={unscheduleTodo}
            onDragArm={setDragArmed}
            activeDragTodoId={activeDragTodoId}
            onDragTodo={setTodoDrag}
            onPointerDragStart={startPointerTodoDrag}
            resolveMentions={resolveMentions}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            onEditText={editTodoText}
            onCreateMention={createMention}
            onChangeMilestone={changeTodoMilestone}
          />
        </div>
      )}

      {backlogOpen && (
        <BacklogPanel
          items={backlog}
          todayK={today}
          activeDragTodoId={activeDragTodoId}
          activeCount={activeTodoCount}
          onClose={() => setBacklogOpen(false)}
          onDropTodo={parkTodo}
          onParkAll={parkAllTodos}
          onRestore={restoreBacklogTodo}
          onSetDate={setBacklogReturnDate}
          onRemove={deleteBacklogTodo}
        />
      )}

      <ContextDrawer
        open={contextOpen}
        sections={contextSections}
        journal={journal}
        onJournalChange={onJournalChange}
        onClose={() => setContextOpen(false)}
      />

      {!contextOpen && !dayClosed && (
        <button className="context-tab" onClick={() => setContextOpen(true)} title="Open context column (J)">
          <SidebarSimple size={14} />
          <span>Context</span>
          <kbd>J</kbd>
        </button>
      )}

      {userId && expandedMilestone && (
        <MilestonePanel
          milestone={expandedMilestone}
          goal={expandedGoal}
          userId={userId}
          today={today}
          onClose={() => setExpandedMs(null)}
          onMilestoneUpdate={(m) => {
            if (m.status === 'COMPLETE') {
              setMilestones(prev => prev.filter(x => x.id !== m.id))
              setExpandedMs(null)
            } else {
              setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
            }
          }}
          onMilestoneDelete={(id) => { setMilestones(prev => prev.filter(x => x.id !== id)); setExpandedMs(null) }}
          onTodoCreate={onPanelTodoCreate}
          onTodoUpdate={onPanelTodoUpdate}
          onTodoDelete={onPanelTodoDelete}
        />
      )}

      {userId && (
        <FocusTimer
          open={focusOpen}
          onClose={() => setFocusOpen(false)}
          onStart={focus.start}
          goals={goals.map(g => ({ id: g.id, text: g.text, emoji: g.emoji }))}
        />
      )}

      {userId && startOpen && (
        <DayStartDrawer
          today={today}
          userId={userId}
          initialGoal={dailyGoal}
          todos={todos}
          userName={userName}
          onClose={() => { localStorage.setItem(`rethink.today.started:${today}`, '1'); setStartOpen(false) }}
          onSave={(goal) => { localStorage.setItem(`rethink.today.started:${today}`, '1'); setDailyGoal(goal); setStartOpen(false) }}
        />
      )}

      {userId && endOpen && (
        <EndOfDayDrawer
          todos={todos}
          backlog={backlog}
          today={today}
          userId={userId}
          dailyGoal={dailyGoal}
          onClose={() => setEndOpen(false)}
          onComplete={(summary) => {
            const { removedTodoIds, removedBacklogIds } = summary
            setTodos(prev => prev.filter(t => !removedTodoIds.includes(t.id)))
            if (removedBacklogIds?.length) setBacklog(prev => prev.filter(t => !removedBacklogIds.includes(t.id)))
            setClosedSummary(summary)
            setDayClosed(true)
            setEndOpen(false)
          }}
        />
      )}

      {userId && dayClosed && (
        <EndOfDayDrawer
          todos={todos}
          backlog={backlog}
          today={today}
          userId={userId}
          dailyGoal={dailyGoal}
          committed
          savedNote={journal}
          savedPlan={closedSummary?.plannedItems}
          savedTomorrowObjective={closedSummary?.tomorrowGoal}
          onClose={() => {}}
          onReopen={reopenDay}
          onNewDay={() => navigate('/today')}
          onComplete={() => {}}
        />
      )}
    </div>
  )
}
