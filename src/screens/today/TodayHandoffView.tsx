import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Todo } from '@/types'
import type { Mention, TodoMilestoneOption } from './types'
import type { RecurringSeries } from './Recurring'
import { minToHHMM, RecurringForm, RecurringPanel, ScopeMenu, type RecurringFormFields, type RecurringFormMode, type RecurringScope, type RecurringScopeAction } from './Recurring'
import { Icon, Logo, type TodayIconName } from './TodayIcons'
import { editorSegmentsToTodo, editorText, SegmentText, TodoEditor, toEditorSegments, type EditorMeta, type EditorSegment } from './TodayHandoffEditor'
import { CommandPalette, MeetingModal, ObjLinkPop, TimePickPop, type MeetingDetail, type TodayCommand } from './TodayOverlays'

const DAY_START = 7 * 60
const DAY_END = 23 * 60
const DEFAULT_DURATION = 30

type CalendarItem = {
  id: string
  type: 'todo' | 'meeting' | 'internal'
  start: number
  dur: number
  segments?: EditorSegment[]
  title?: string
  sub?: string
  with?: string
  logo?: string
  completed?: boolean
  mustDo?: boolean
  recurringId?: string | null
  source?: Todo
  fyi?: boolean
  col?: number
  cols?: number
}

export interface TodayCalendarEvent {
  id: string
  title: string
  start: number
  dur: number
  type: 'meeting' | 'internal'
  sub?: string | null
  with?: string | null
  fyi?: boolean
  attendees?: MeetingDetail['attendees']
  conferenceUrl?: string | null
  platform?: string | null
  logo?: string | null
}

export interface FunnelPerson {
  id: string
  name: string
  sub: string | null
  imageUrl: string | null
}

type ScopeMenuState = {
  item: Todo
  isScheduled: boolean
  seriesId: string
  rect: DOMRect
}

type RecurringFormState = {
  mode: RecurringFormMode
  initial?: Partial<RecurringFormFields>
  itemId?: string
  isScheduled?: boolean
  seriesId?: string
}

export interface TodayFunnelStage {
  id: string
  label: string
  value: number
  target: number
  weeklyValue: number
  weeklyTarget: number
  prevValue: number
  people: FunnelPerson[]
  weeklyPeople: FunnelPerson[]
}

export interface TodayGoalStat {
  id: string
  icon: TodayIconName
  label: string
  value: number
  target: number
  period: 'daily' | 'weekly'
  state: 'hit' | 'ok' | 'warn' | 'risk' | 'neutral'
  onBump?: () => void
}

export interface TodayHandoffViewProps {
  today: string
  todayLabel: string
  isHistorical: boolean
  dailyGoal: string
  objectiveLink: Mention | null
  dayClosed: boolean
  saveError: string | null
  todos: Todo[]
  backlog: Todo[]
  calendarEvents: TodayCalendarEvent[]
  calendarError: string | null
  funnelStages: TodayFunnelStage[]
  goalStats: TodayGoalStat[]
  milestoneOptions: TodoMilestoneOption[]
  mentionOptions: Mention[]
  recurSeries: RecurringSeries[]
  recurPanelOpen: boolean
  recurRect: DOMRect | null
  recurForm: RecurringFormState | null
  scopeMenu: ScopeMenuState | null
  focus: {
    active: boolean
    running: boolean
    complete: boolean
    remaining: number
    intention: string
    pause: () => void
    resume: () => void
    cancel: () => void
    dismiss: () => void
  }
  toast: { icon: TodayIconName; text: string; actionLabel?: string; onAction?: () => void } | null
  onDailyGoalChange: (value: string) => void
  onPreviousDay: () => void
  onNextDay: () => void
  onObjectiveLinkChange: (value: Mention | null) => void
  onOpenRecord: (mention: Mention) => void
  onOpenFunnel: (stageId: string) => void
  onReconnectGoogle: () => void
  onToggleCalendarFyi: (id: string) => void
  onDismissSaveError: () => void
  onToggleTodo: (id: string) => void
  onToggleMustDoTodo: (id: string) => void
  onToggleMustDoSched: (id: string) => void
  onScheduleTodo: (id: string, start: number, duration: number) => void
  onUnscheduleTodo: (id: string) => void
  onBacklogTodo: (id: string) => void
  onRestoreBacklogTodo: (id: string) => void
  onDeleteTodo: (id: string, rect?: DOMRect, isScheduled?: boolean) => void
  onAddEditor: (meta: EditorMeta) => void
  onUpdateEditor: (todo: Todo, meta: EditorMeta) => void
  onOpenFocus: () => void
  onOpenEndDay: () => void
  onReopenDay: () => void
  onManageMilestones: () => void
  onRecurringPanelToggle: (rect: DOMRect) => void
  onRecurringPanelClose: () => void
  onRecurringNew: () => void
  onRecurringEditSeries: (seriesId: string) => void
  onRecurringDeleteSeries: (seriesId: string) => void
  onRecurringFormClose: () => void
  onRecurringFormSave: (fields: RecurringFormFields) => void
  onRecurringFormDelete?: () => void
  onScopeClose: () => void
  onScopePick: (action: RecurringScopeAction, scope: RecurringScope) => void
  onRecurringIconClick: (item: Todo, isScheduled: boolean, rect: DOMRect) => void
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}

function snap(v: number) {
  return Math.round(v / 5) * 5
}

function layout(items: CalendarItem[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.dur - b.dur)
  const out: CalendarItem[] = []
  let cluster: CalendarItem[] = []
  let end = -1
  const flush = () => {
    const colEnds: number[] = []
    const placed: CalendarItem[] = []
    for (const item of cluster) {
      let col = colEnds.findIndex(e => e <= item.start)
      if (col === -1) col = colEnds.length
      colEnds[col] = item.start + item.dur
      placed.push({ ...item, col })
    }
    const cols = Math.max(1, colEnds.length)
    placed.forEach(item => out.push({ ...item, cols }))
    cluster = []
    end = -1
  }
  for (const item of sorted) {
    if (cluster.length && item.start >= end) flush()
    cluster.push(item)
    end = Math.max(end, item.start + item.dur)
  }
  if (cluster.length) flush()
  return out
}

function hasSchedule(todo: Todo) {
  return todo.scheduled_start_minutes != null && todo.scheduled_duration_minutes != null
}

function todoSegments(todo: Todo) {
  return toEditorSegments(todo.content_segments, todo.text)
}

function milestoneName(todo: Todo, options: TodoMilestoneOption[]) {
  return options.find(option => option.id === todo.milestone_id)?.name ?? null
}

function milestoneColor(todo: Todo, options: TodoMilestoneOption[]) {
  return options.find(option => option.id === todo.milestone_id)?.color ?? null
}

function funnelState(value: number, target: number, elapsed: number): 'hit' | 'ok' | 'risk' | 'neutral' {
  if (target <= 0) return value > 0 ? 'ok' : 'neutral'
  if (value >= target) return 'hit'
  if (value >= Math.max(1, Math.floor(target * elapsed * 0.8))) return 'ok'
  return value > 0 ? 'risk' : 'neutral'
}

function Funnel({ stages, goals, onOpen, historical }: { stages: TodayFunnelStage[]; goals: TodayGoalStat[]; onOpen: (stageId: string) => void; historical: boolean }) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [hoverStage, setHoverStage] = useState<{ stage: TodayFunnelStage; rect: DOMRect } | null>(null)
  const now = new Date()
  const dayElapsed = clamp((now.getHours() * 60 + now.getMinutes() - DAY_START) / (DAY_END - DAY_START), 0.08, 1)
  const jsDay = now.getDay()
  const weekday = jsDay === 0 ? 7 : jsDay
  const weekElapsed = clamp((weekday - 1 + dayElapsed) / 5, 0.08, 1)
  const elapsed = historical ? 1 : mode === 'day' ? dayElapsed : weekElapsed
  const visibleStages = stages.map((stage, index) => {
    const value = mode === 'day' ? stage.value : stage.weeklyValue
    const target = mode === 'day' ? stage.target : stage.weeklyTarget
    const previous = index > 0 ? (mode === 'day' ? stages[index - 1].value : stages[index - 1].weeklyValue) : null
    return {
      ...stage,
      value,
      target,
      conversion: previous && previous > 0 ? Math.round((value / previous) * 100) : null,
      delta: mode === 'day' ? value - stage.prevValue : 0,
      state: funnelState(value, target, elapsed),
    }
  })
  const conversions = visibleStages.map(stage => stage.conversion).filter((value): value is number => value != null)
  const bottleneck = conversions.length > 1 ? Math.min(...conversions) : null
  if (stages.length === 0 && goals.length === 0) return null
  return (
    <div className="fn">
      <div className="fn-lead" title="Networking funnel"><span className="fl-ic"><Icon name="activity" size={13} /></span></div>
      <div className="fn-stages">
        {visibleStages.map((stage, i) => (
          <Fragment key={stage.id}>
            {i > 0 && <span className={`fn-conv${stage.conversion === bottleneck ? ' bottleneck' : ''}`}>{stage.conversion != null ? `${stage.conversion}%` : '—'}</span>}
            <div className={`fn-stage ${stage.state}`} onMouseEnter={event => setHoverStage({ stage, rect: event.currentTarget.getBoundingClientRect() })} onMouseLeave={() => setHoverStage(current => current?.stage.id === stage.id ? null : current)} onClick={() => { setHoverStage(null); onOpen(stage.id) }}>
              <span className="fn-dot" />
              <span className="fn-v">{stage.value}</span>{stage.target != null && <span className="fn-tg">/{stage.target}</span>}<span className="fn-l">{stage.label}</span>
              {stage.delta !== 0 && <span className={`fn-trend ${stage.delta > 0 ? 'up' : 'down'}`}><Icon name={stage.delta > 0 ? 'caretUp' : 'caretDown'} size={8} />{Math.abs(stage.delta)}</span>}
            </div>
          </Fragment>
        ))}
      </div>
      {hoverStage && (() => {
        const people = mode === 'week' ? hoverStage.stage.weeklyPeople : hoverStage.stage.people
        const total = mode === 'week' ? hoverStage.stage.weeklyValue : hoverStage.stage.value
        return createPortal(<div className="fn-peoplecard" style={{ top: hoverStage.rect.bottom + 8, left: clamp(hoverStage.rect.left, 8, window.innerWidth - 260) }}><div className="fnp-hd">{hoverStage.stage.label}<span className="n">{people.length}{people.length < total ? '+' : ''}</span></div><div className="fnp-list">{people.map(person => <div className="fnp-row" key={person.id}><Logo id={person.imageUrl || person.name} size={24} sq={false} /><div className="fnp-txt"><span className="nm">{person.name}</span><span className="jt">{person.sub}</span></div></div>)}</div><div className="fnp-foot">Click to view all in People</div></div>, document.body)
      })()}
      <div className="fn-seg">
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Day</button>
        <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Week</button>
      </div>
      <div className="fn-goals">
        {goals.map(goal => (
          <div key={goal.id} className={`fn-goal ${goal.state}`}>
            <span className="fg-em"><Icon name={goal.icon} size={13} /></span>
            <span className="fg-copy"><span className="fg-l">{goal.label}</span><span className="fg-v"><span className="fg-dot" />{goal.value}<span className="tg">/{goal.target}</span></span></span>
            {goal.onBump && <button className="fg-bump" title={`Log ${goal.label}`} onClick={goal.onBump}><Icon name="plus" size={11} /></button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MsChip({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return null
  return <span className="ms-chip"><span className="d" style={{ background: color || 'var(--burnham)' }} />{name}</span>
}

function NowBand({
  current,
  next,
  liveNow,
  unscheduledCount,
  onFocus,
  onComplete,
}: {
  current?: CalendarItem
  next?: CalendarItem
  liveNow: number
  unscheduledCount: number
  onFocus: () => void
  onComplete: (id: string) => void
}) {
  const title = (block: CalendarItem) => block.segments ? <SegmentText segments={block.segments} /> : block.title
  if (current) {
    const left = current.start + current.dur - liveNow
    const pct = clamp(((liveNow - current.start) / current.dur) * 100, 0, 100)
    const risk = current.type === 'todo' && left <= 5
    return (
      <div className={`now-band live ${current.type}${risk ? ' risk' : ''}`}>
        <span className="nb-ey"><span className="nb-pip" />{risk ? 'Wrapping up' : 'Now'}</span>
        <span className="nb-title">{title(current)}</span>
        <span className="nb-meta">{minToHHMM(current.start)}-{minToHHMM(current.start + current.dur)}</span>
        <span className="sp" />
        {next && <span className="nb-next">{minToHHMM(next.start)} {title(next)}</span>}
        {current.type === 'todo' && <button className="nb-act primary" title="Mark done" onClick={() => onComplete(current.id)}><Icon name="check" size={12} sw={2.2} /></button>}
        <button className="nb-act" title="Focus session" onClick={onFocus}><Icon name="clock" size={12} /></button>
        <span className="nb-rem">{left}m left</span>
        <span className="nb-prog" style={{ width: `${pct}%` }} />
      </div>
    )
  }
  if (next) {
    return (
      <div className="now-band next">
        <span className="nb-ey">Next</span>
        <span className="nb-title">{title(next)}</span>
        <span className="nb-meta">{minToHHMM(next.start)}-{minToHHMM(next.start + next.dur)}</span>
        <span className="sp" />
        <button className="nb-act" title="Focus session" onClick={onFocus}><Icon name="clock" size={12} /></button>
        <span className="nb-rem soft">in {next.start - liveNow}m</span>
      </div>
    )
  }
  return (
    <div className="now-band free">
      <span className="nb-ey">Clear</span>
      <span className="nb-title-sm">No blocks ahead{unscheduledCount > 0 ? ` · ${unscheduledCount} unscheduled · drag one onto the plan` : ' · plan is done'}</span>
    </div>
  )
}

export default function TodayHandoffView(props: TodayHandoffViewProps) {
  const [editingObj, setEditingObj] = useState(false)
  const [objective, setObjective] = useState(props.dailyGoal)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addKey, setAddKey] = useState(0)
  const [dropList, setDropList] = useState(false)
  const [dropBacklog, setDropBacklog] = useState(false)
  const [dragTodoId, setDragTodoId] = useState<string | null>(null)
  const [dropMin, setDropMin] = useState<number | null>(null)
  const [railW, setRailW] = useState(() => Number(localStorage.getItem('rethink.today.railW')) || 340)
  const [railDrag, setRailDrag] = useState(false)
  const [hoverB, setHoverB] = useState<{ b: CalendarItem; rect: DOMRect } | null>(null)
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [msOpen, setMsOpen] = useState(false)
  const [msRect, setMsRect] = useState<DOMRect | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [meetingModal, setMeetingModal] = useState<MeetingDetail | null>(null)
  const [schedulePop, setSchedulePop] = useState<{ rect: DOMRect; todoId?: string; blockId?: string; initial: number } | null>(null)
  const [objLinkRect, setObjLinkRect] = useState<DOMRect | null>(null)
  const [hourPx, setHourPx] = useState(() => Number(localStorage.getItem('rethink.today.hourPx')) || 0.82)
  const [interaction, setInteraction] = useState<{ kind: 'move' | 'resize'; id: string; startY: number; start: number; dur: number } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { start: number; dur: number }>>({})
  const gridRef = useRef<HTMLDivElement | null>(null)
  const addBoxRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<Record<string, { start: number; dur: number }>>({})
  const msBtn = useRef<HTMLButtonElement | null>(null)
  const recurBtn = useRef<HTMLButtonElement | null>(null)

  const isPointerOverBacklogTarget = (event: PointerEvent) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)
    return target instanceof Element && Boolean(target.closest('.tp-backlog-drop,.tp-backlog-tray'))
  }

  useEffect(() => setObjective(props.dailyGoal), [props.dailyGoal])
  useEffect(() => {
    const openCommand = () => setPaletteOpen(true)
    const onKey = (event: KeyboardEvent) => {
      const editing = (event.target as HTMLElement | null)?.closest('input,textarea,[contenteditable="true"]')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); return }
      if (!props.isHistorical && !editing && event.key.toLowerCase() === 'n') { event.preventDefault(); (addBoxRef.current?.querySelector('[contenteditable="true"]') as HTMLElement | null)?.focus() }
    }
    window.addEventListener('rethink:today-command', openCommand)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('rethink:today-command', openCommand); window.removeEventListener('keydown', onKey) }
  }, [props.isHistorical])
  useEffect(() => {
    if (!railDrag) return
    const move = (event: PointerEvent) => setRailW(clamp(window.innerWidth - event.clientX, 260, 520))
    const up = () => {
      setRailDrag(false)
      localStorage.setItem('rethink.today.railW', String(railW))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [railDrag, railW])
  useEffect(() => {
    if (!interaction) return
    const move = (event: PointerEvent) => {
      if (Math.abs(event.clientY - interaction.startY) < 4) return
      const delta = snap((event.clientY - interaction.startY) / hourPx)
      const start = interaction.kind === 'move' ? clamp(interaction.start + delta, DAY_START, DAY_END - interaction.dur) : interaction.start
      const dur = interaction.kind === 'resize' ? clamp(interaction.dur + delta, 10, DAY_END - interaction.start) : interaction.dur
      if (interaction.kind === 'move') setDropBacklog(event.clientY > window.innerHeight - 118 || isPointerOverBacklogTarget(event))
      setDrafts(current => {
        const next = { ...current, [interaction.id]: { start, dur } }
        draftRef.current = next
        return next
      })
    }
    const up = (event: PointerEvent) => {
      if (interaction.kind === 'move' && (event.clientY > window.innerHeight - 118 || isPointerOverBacklogTarget(event))) {
        props.onBacklogTodo(interaction.id)
        setInteraction(null)
        setDragTodoId(null)
        setDropBacklog(false)
        setDrafts(current => { const next = { ...current }; delete next[interaction.id]; draftRef.current = next; return next })
        setBacklogOpen(true)
        return
      }
      const draft = draftRef.current[interaction.id]
      if (draft) props.onScheduleTodo(interaction.id, draft.start, draft.dur)
      setInteraction(null)
      setDragTodoId(null)
      setDropBacklog(false)
      setDrafts(current => { const next = { ...current }; delete next[interaction.id]; draftRef.current = next; return next })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [hourPx, interaction, props.onBacklogTodo, props.onScheduleTodo])

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const inRange = nowMin >= DAY_START && nowMin <= DAY_END
  const displayNow = inRange ? nowMin : 12 * 60
  const liveNow = props.isHistorical ? -1 : displayNow
  const scheduledTodos = props.todos.filter(hasSchedule)
  const unscheduledTodos = props.todos
    .filter(todo => !hasSchedule(todo) && !todo.completed)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(Boolean(b.must_do)) - Number(Boolean(a.must_do)) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const activeTodos = unscheduledTodos
  const doneTodos = props.todos.filter(todo => todo.completed).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const calItems = useMemo(() => {
    const todoItems: CalendarItem[] = scheduledTodos.map(todo => ({
      id: todo.id,
      type: 'todo',
      start: drafts[todo.id]?.start ?? todo.scheduled_start_minutes ?? DAY_START,
      dur: drafts[todo.id]?.dur ?? todo.scheduled_duration_minutes ?? DEFAULT_DURATION,
      segments: todoSegments(todo),
      completed: todo.completed,
      mustDo: Boolean(todo.must_do),
      recurringId: todo.recurring_id,
      source: todo,
    }))
    const eventItems: CalendarItem[] = props.calendarEvents.map(event => ({
      id: event.id,
      type: event.type,
      start: event.start,
      dur: event.dur,
      title: event.title,
      sub: event.sub ?? undefined,
      with: event.with ?? undefined,
      logo: event.logo ?? undefined,
      fyi: event.fyi,
    }))
    return layout([...todoItems, ...eventItems])
  }, [drafts, scheduledTodos, props.calendarEvents])
  const currentBlock = calItems.find(block => liveNow >= block.start && liveNow < block.start + block.dur && !block.completed)
  const nextBlock = calItems.filter(block => block.start > liveNow && !block.completed).sort((a, b) => a.start - b.start)[0]
  const gridH = (DAY_END - DAY_START) * hourPx
  const minutesAt = (clientY: number) => {
    const grid = gridRef.current
    if (!grid) return DAY_START
    const rect = grid.getBoundingClientRect()
    return clamp(snap(DAY_START + (clientY - rect.top + grid.scrollTop) / hourPx), DAY_START, DAY_END - 10)
  }
  const centerNow = (behavior: ScrollBehavior = 'smooth') => {
    const grid = gridRef.current
    if (!grid) return
    grid.scrollTo({ top: clamp((displayNow - DAY_START) * hourPx - grid.clientHeight / 2, 0, gridH - grid.clientHeight), behavior })
  }
  useEffect(() => {
    if (props.isHistorical) gridRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    else centerNow('auto')
  }, [props.isHistorical, props.today])

  const commitObjective = () => {
    props.onDailyGoalChange(objective.trim())
    setEditingObj(false)
  }
  const scheduleDrop = (id: string, start: number) => props.onScheduleTodo(id, start, DEFAULT_DURATION)
  const dragTypes = (event: ReactDragEvent<HTMLElement>) => Array.from(event.dataTransfer.types)
  const hasTodoPayload = (event: ReactDragEvent<HTMLElement>) => dragTypes(event).some(type => type === 'text/todo' || type === 'text/todo-id' || type === 'text/sched')
  const todoIdFromDrop = (event: ReactDragEvent<HTMLElement>) => event.dataTransfer.getData('text/todo') || event.dataTransfer.getData('text/todo-id') || event.dataTransfer.getData('text/sched')
  const leaveDropTarget = (event: ReactDragEvent<HTMLElement>, setter: (value: boolean) => void) => {
    const next = event.relatedTarget
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setter(false)
  }
  const dropToBacklog = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasTodoPayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    const id = todoIdFromDrop(event)
    setDropBacklog(false)
    setDragTodoId(null)
    if (id) {
      props.onBacklogTodo(id)
      setBacklogOpen(true)
    }
  }
  const endTodoDrag = () => {
    setDragTodoId(null)
    setDropBacklog(false)
  }
  const startResize = (event: ReactPointerEvent<HTMLElement>, block: CalendarItem) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setHoverB(null)
    setInteraction({ kind: 'resize', id: block.id, startY: event.clientY, start: block.start, dur: block.dur })
  }
  const stopBlockControlPointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }
  const openMs = () => {
    if (msBtn.current) setMsRect(msBtn.current.getBoundingClientRect())
    setMsOpen(open => !open)
  }
  const commands: TodayCommand[] = props.isHistorical ? [
    { key: 'backlog', label: 'Open backlog', hint: `${props.backlog.length} tasks`, icon: 'folder', run: () => setBacklogOpen(true) },
  ] : [
    { key: 'new', label: 'New task', hint: 'N', icon: 'plus', run: () => (addBoxRef.current?.querySelector('[contenteditable="true"]') as HTMLElement | null)?.focus() },
    { key: 'focus', label: 'Start focus session', hint: '25 minutes', icon: 'clock', run: props.onOpenFocus },
    { key: 'recurring', label: 'New recurring task', hint: 'schedule a series', icon: 'repeat', run: props.onRecurringNew },
    { key: 'backlog', label: 'Open backlog', hint: `${props.backlog.length} tasks`, icon: 'folder', run: () => setBacklogOpen(true) },
    { key: 'close', label: 'Close day', hint: 'recap and plan tomorrow', icon: 'checkcircle', run: props.onOpenEndDay },
  ]

  const renderTodoRow = (todo: Todo, done: boolean) => {
    const msName = milestoneName(todo, props.milestoneOptions)
    const msColor = milestoneColor(todo, props.milestoneOptions)
    if (editingId === todo.id) {
      return (
        <div key={todo.id} className="tp-row editing">
          <span style={{ width: 17 }} />
          <TodoEditor
            initialSegments={todoSegments(todo)}
            initialMs={msName}
            initialMsColor={msColor}
            initialPriority={todo.is_featured}
            milestoneOptions={props.milestoneOptions}
            mentionOptions={props.mentionOptions}
            autoFocus
            onCommit={meta => { props.onUpdateEditor(todo, meta); setEditingId(null) }}
            onCancel={() => setEditingId(null)}
          />
          <span />
        </div>
      )
    }
    return (
      <div
        key={todo.id}
        className={`tp-row${done ? ' done' : ''}${todo.is_featured && !done ? ' pri' : ''}${todo.must_do && !done ? ' mustdo' : ''}`}
        draggable={!done && !props.isHistorical}
        onDragStart={event => {
          event.dataTransfer.setData('text/todo', todo.id)
          event.dataTransfer.setData('text/todo-id', todo.id)
          event.dataTransfer.effectAllowed = 'move'
          setDragTodoId(todo.id)
          event.currentTarget.classList.add('dragging')
        }}
        onDragEnd={event => { event.currentTarget.classList.remove('dragging'); endTodoDrag() }}
      >
        <button disabled={props.isHistorical} className={`tp-check${done ? ' on' : ''}`} onClick={() => props.onToggleTodo(todo.id)}>{done && <Icon name="check" size={10} sw={2.4} />}</button>
        <div className="tp-body-cell" onClick={() => { if (!props.isHistorical) setEditingId(todo.id) }}>
          <span className="tp-txt">{todo.is_featured && !done && <span className="tp-pflag"><Icon name="star" size={11} fill /></span>}<SegmentText segments={todoSegments(todo)} /></span>
          {msName && <span className="tp-meta"><MsChip name={msName} color={msColor} /></span>}
        </div>
        <span className="tp-row-acts">
          {!props.isHistorical && !done && <button className={`tp-star${todo.must_do ? ' on' : ''}`} title={todo.must_do ? 'Must-do' : 'Mark as must-do (max 2/day)'} onClick={event => { event.stopPropagation(); props.onToggleMustDoTodo(todo.id) }}><Icon name="star" size={12} fill={Boolean(todo.must_do)} /></button>}
          {!props.isHistorical && !done && <button className={`tp-recur${todo.recurring_id ? ' on' : ''}`} title={todo.recurring_id ? 'Recurring task' : 'Make recurring'} onClick={event => { event.stopPropagation(); props.onRecurringIconClick(todo, false, event.currentTarget.getBoundingClientRect()) }}><Icon name="repeat" size={11} /></button>}
          {!props.isHistorical && !done && <button className="tp-backlog-act" title="Move to Backlog" onClick={event => { event.stopPropagation(); props.onBacklogTodo(todo.id) }}><Icon name="folder" size={11} /></button>}
          {!props.isHistorical && <button className="tp-delete" title="Delete todo" onClick={event => { event.stopPropagation(); props.onDeleteTodo(todo.id, event.currentTarget.getBoundingClientRect(), false) }}><Icon name="trash" size={11} /></button>}
          {!props.isHistorical && <span className="grab" title="Drag onto the day plan"><Icon name="grip" size={13} /></span>}
        </span>
      </div>
    )
  }

  return (
    <>
      <div className={`today${props.isHistorical ? ' historical' : ''}`}>
        <div className="tp-head">
          <div className="tp-head-row">
            <span className="tp-day-nav"><button title="Previous day" onClick={props.onPreviousDay}><Icon name="caretLeft" size={12} /></button><h1 className="tp-date">{props.todayLabel.split(',')[0]}<span className="dim">, {props.todayLabel.split(', ').slice(1).join(', ')}</span></h1><button title="Next day" disabled={!props.isHistorical} onClick={props.onNextDay}><Icon name="caretRight" size={12} /></button></span>
            <span className={`tp-daystate${props.isHistorical ? ' past' : ''}`}><span className="tp-pip" /> {props.isHistorical ? 'past day' : props.dayClosed ? 'day closed' : 'in progress'}</span>
            <span className="sp" />
            <div className="tp-head-r">
              <button ref={msBtn} className={`tp-chip-btn${msOpen ? ' on' : ''}`} onClick={openMs}><Icon name="target" size={13} /> Milestones</button>
              {!props.isHistorical && <button
                ref={recurBtn}
                className={`tp-chip-btn recur${props.recurPanelOpen ? ' on' : ''}`}
                onClick={() => {
                  if (recurBtn.current) props.onRecurringPanelToggle(recurBtn.current.getBoundingClientRect())
                }}
              ><Icon name="repeat" size={13} /> Recurring</button>}
              <button
                className={`tp-chip-btn tp-backlog-drop${dropBacklog ? ' dropping' : ''}`}
                onClick={() => setBacklogOpen(true)}
                onDragOver={event => {
                  if (!hasTodoPayload(event)) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropBacklog(true)
                }}
                onDragLeave={event => leaveDropTarget(event, setDropBacklog)}
                onDrop={dropToBacklog}
              ><Icon name="folder" size={13} /> Backlog{props.backlog.length > 0 && <span className="count">{props.backlog.length}</span>}</button>
              {!props.isHistorical && <button className="tp-close" onClick={props.dayClosed ? props.onReopenDay : props.onOpenEndDay}><Icon name="checkcircle" size={13} /> {props.dayClosed ? 'Reopen' : 'Close day'}</button>}
            </div>
          </div>
          <div className="tp-obj">
            {editingObj ? (
              <input
                autoFocus
                value={objective}
                onChange={event => setObjective(event.target.value)}
                onBlur={commitObjective}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitObjective()
                  if (event.key === 'Escape') { setObjective(props.dailyGoal); setEditingObj(false) }
                }}
              />
            ) : (
              <span className={`ot${objective ? '' : ' empty'}`} onClick={() => { if (!props.isHistorical) setEditingObj(true) }}>{objective || (props.isHistorical ? 'No objective set' : "Set today's objective...")}{!props.isHistorical && <span className="oedit"><Icon name="pencil" size={12} /></span>}</span>
            )}
            {props.objectiveLink ? <button className="obj-link on" onClick={() => props.onOpenRecord(props.objectiveLink as Mention)}><Logo id={props.objectiveLink.imageUrl || props.objectiveLink.name} size={14} sq={props.objectiveLink.kind !== 'person'} /> {props.objectiveLink.name}{!props.isHistorical && <span className="x" onClick={event => { event.stopPropagation(); props.onObjectiveLinkChange(null) }}><Icon name="x" size={10} /></span>}</button> : !props.isHistorical && <button className="obj-link" onClick={event => setObjLinkRect(event.currentTarget.getBoundingClientRect())}><Icon name="link" size={12} /> Link record</button>}
          </div>
        </div>

        <Funnel stages={props.funnelStages} goals={props.goalStats} onOpen={props.onOpenFunnel} historical={props.isHistorical} />

        {props.saveError && (
          <div className="day-save-alert today-save-alert" role="status">
            <span>{props.saveError}</span>
            <button onClick={props.onDismissSaveError} title="Dismiss"><Icon name="x" size={12} /></button>
          </div>
        )}

        <div className={`tp-body${railDrag ? ' dragging-rail' : ''}`} style={{ '--rail-w': `${railW}px` } as CSSProperties}>
          <section className="tp-todos">
            {props.isHistorical ? <div className="now-band free historical"><span className="nb-ey">Past day</span><span className="nb-title-sm">{doneTodos.length} completed · {scheduledTodos.length} scheduled</span></div> : <NowBand current={currentBlock} next={nextBlock} liveNow={liveNow} unscheduledCount={activeTodos.length} onFocus={props.onOpenFocus} onComplete={props.onToggleTodo} />}
            <div className="tp-todos-hd">
              <h2>Unscheduled</h2>
              <span className="sub">{props.isHistorical ? 'Read-only snapshot' : <><kbd>N</kbd> new · <kbd>@</kbd> mention · <kbd>/</kbd> command · drag to plan</>}</span>
              <span className="sp" />
              <span className="n">{activeTodos.length} open</span>
            </div>
            <div
              className={`tp-todos-scroll${dropList ? ' dropping' : ''}`}
              onDragOver={event => {
                if (![...event.dataTransfer.types].includes('text/sched')) return
                event.preventDefault()
                setDropList(true)
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropList(false)
              }}
              onDrop={event => {
                event.preventDefault()
                setDropList(false)
                const id = event.dataTransfer.getData('text/sched')
                if (id) props.onUnscheduleTodo(id)
                endTodoDrag()
              }}
            >
              {!props.isHistorical && <div ref={addBoxRef} className="tp-add-box">
                <span className="pl"><Icon name="plus" size={13} /></span>
                <TodoEditor
                  key={addKey}
                  milestoneOptions={props.milestoneOptions}
                  mentionOptions={props.mentionOptions}
                  placeholder="Add a task...  @ mention · / command"
                  onCommit={meta => {
                    props.onAddEditor(meta)
                    setAddKey(key => key + 1)
                  }}
                  onCancel={() => {}}
                />
              </div>}
              {activeTodos.map(todo => renderTodoRow(todo, false))}
              {activeTodos.length === 0 && doneTodos.length === 0 && (
                <div className="tp-todo-empty"><Icon name="checkcircle" size={22} /><span>All scheduled</span><small>Every task is on the plan. Drag a block back here to unschedule it.</small></div>
              )}
              {doneTodos.length > 0 && <div className="tp-group-hd"><span className="lab">Done</span><span className="rule" /><span className="n">{doneTodos.length}</span></div>}
              {doneTodos.map(todo => renderTodoRow(todo, true))}
            </div>
          </section>

          <aside className="tp-rail">
            <div className="tp-rail-resize" onPointerDown={event => { event.preventDefault(); setRailDrag(true) }} />
            <div className="tp-rail-hd">
              <h2>Day plan</h2><span className="sub">{minToHHMM(DAY_START)}-{minToHHMM(DAY_END)}</span>
              <span className="sp" />
              <div className="hourzoom"><button title="Zoom out" disabled={hourPx <= 0.5} onClick={() => setHourPx(value => { const next = Math.max(0.5, +(value - 0.15).toFixed(2)); localStorage.setItem('rethink.today.hourPx', String(next)); return next })}><Icon name="minus" size={10} /></button><button title="Zoom in" disabled={hourPx >= 2} onClick={() => setHourPx(value => { const next = Math.min(2, +(value + 0.15).toFixed(2)); localStorage.setItem('rethink.today.hourPx', String(next)); return next })}><Icon name="plus" size={10} /></button></div>
              {!props.isHistorical && <button className="now-btn" onClick={() => centerNow()}><Icon name="clock" size={10} /> {minToHHMM(displayNow)}</button>}
            </div>
            {props.calendarError && <div className="tp-calendar-error"><Icon name="calendar" size={12} /><span>{props.calendarError}</span><button onClick={props.onReconnectGoogle}>Reconnect</button></div>}
            <div
              ref={gridRef}
              className={`tp-cal${dropMin != null ? ' dropping' : ''}`}
              onDragOver={event => {
                if (![...event.dataTransfer.types].includes('text/todo')) return
                event.preventDefault()
                setDropMin(minutesAt(event.clientY))
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropMin(null)
              }}
              onDrop={event => {
                event.preventDefault()
                const id = event.dataTransfer.getData('text/todo') || event.dataTransfer.getData('text/todo-id')
                const start = minutesAt(event.clientY)
                setDropMin(null)
                if (id) scheduleDrop(id, start)
                endTodoDrag()
              }}
            >
              <div className="tp-cal-spacer" style={{ height: gridH }} />
              {!props.isHistorical && <div className="tp-cal-past" style={{ height: Math.max(0, (displayNow - DAY_START) * hourPx) }} />}
              <div className="tp-hours">
                {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60).map(hour => (
                  <div key={hour} className="tp-hour" style={{ top: (hour - DAY_START) * hourPx }}><span className="hl">{minToHHMM(hour)}</span><span className="hr" /></div>
                ))}
              </div>
              {dropMin != null && <div className="tp-dropline" style={{ top: (dropMin - DAY_START) * hourPx }}><span className="lab">Drop · {minToHHMM(dropMin)}</span></div>}
              {!props.isHistorical && <div className="tp-now" style={{ top: (displayNow - DAY_START) * hourPx }}><span className="dot" /><span className="lab">{minToHHMM(displayNow)}</span></div>}
              <div className="tp-blocklayer">
                {calItems.map(block => {
                  const source = block.source
                  const top = (block.start - DAY_START) * hourPx
                  const height = Math.max(18, block.dur * hourPx - 2)
                  const cols = block.cols || 1
                  const col = block.col || 0
                  const width = `calc(${100 / cols}% - 4px)`
                  const left = `calc(${(100 / cols) * col}% + 2px)`
                  const compact = block.dur * hourPx < 34
                  const current = displayNow >= block.start && displayNow < block.start + block.dur && !block.completed
                  const cls = `tp-block ${block.type}${block.completed ? ' done' : ''}${compact ? ' compact' : ''}${current ? ' current' : ''}${block.mustDo ? ' mustdo' : ''}${block.fyi ? ' fyi' : ''}`
                  return (
                    <article
                      key={block.id}
                      className={cls}
                      style={{ top, height, left, width }}
                      onMouseEnter={event => setHoverB({ b: block, rect: event.currentTarget.getBoundingClientRect() })}
                      onMouseLeave={() => setHoverB(h => h?.b.id === block.id ? null : h)}
                      onClick={() => { if (!source && block.type === 'meeting') setMeetingModal({ id: block.id, title: block.title || 'Meeting', start: block.start, dur: block.dur, logo: block.logo, attendees: props.calendarEvents.find(event => event.id === block.id)?.attendees || [], conferenceUrl: props.calendarEvents.find(event => event.id === block.id)?.conferenceUrl, platform: props.calendarEvents.find(event => event.id === block.id)?.platform }) }}
                      onPointerDown={event => { if (props.isHistorical || !source || (event.target as HTMLElement).closest('button,.tp-resize')) return; setHoverB(null); setDragTodoId(block.id); setInteraction({ kind: 'move', id: block.id, startY: event.clientY, start: block.start, dur: block.dur }) }}
                    >
                      {source ? (
                        <button
                          disabled={props.isHistorical}
                          draggable={false}
                          className={`tp-check${block.completed ? ' on' : ''}`}
                          onPointerDown={stopBlockControlPointer}
                          onClick={event => { event.stopPropagation(); props.onToggleTodo(block.id) }}
                        >{block.completed && <Icon name="check" size={9} sw={2.4} />}</button>
                      ) : (
                        <span className="mtile"><Icon name={block.type === 'meeting' ? 'calendar' : 'clock'} size={10} /></span>
                      )}
                      <div className="bl-body">
                        <span className="bl-toprow">
                          <span className="bl-time">{minToHHMM(block.start)}-{minToHHMM(block.start + block.dur)}</span>
                          {source?.recurring_id && <button className="tp-recur-badge" draggable={false} onPointerDown={stopBlockControlPointer} onClick={event => { event.stopPropagation(); props.onRecurringIconClick(source, true, event.currentTarget.getBoundingClientRect()) }} title="Recurring task"><Icon name="repeat" size={9} /></button>}
                          {!source && block.fyi && <span className="tp-fyi-badge">FYI</span>}
                        </span>
                        <span className="bl-title">{block.segments ? <SegmentText segments={block.segments} /> : block.title}</span>
                        {block.sub && <span className="bl-sub">{block.sub}</span>}
                      </div>
                      {source && !props.isHistorical && (
                        <div className="bl-acts">
                          <button draggable={false} onPointerDown={stopBlockControlPointer} className={block.mustDo ? 'on' : ''} title={block.mustDo ? 'Must-do' : 'Mark as must-do (max 2/day)'} onClick={event => { event.stopPropagation(); props.onToggleMustDoSched(block.id) }}><Icon name="star" size={11} fill={Boolean(block.mustDo)} /></button>
                          {!source.recurring_id && <button draggable={false} onPointerDown={stopBlockControlPointer} className="tp-recur" title="Make recurring" onClick={event => { event.stopPropagation(); props.onRecurringIconClick(source, true, event.currentTarget.getBoundingClientRect()) }}><Icon name="repeat" size={11} /></button>}
                          <button draggable={false} onPointerDown={stopBlockControlPointer} title="Change time" onClick={event => { event.stopPropagation(); setSchedulePop({ rect: event.currentTarget.getBoundingClientRect(), blockId: block.id, initial: block.start }) }}><Icon name="clock" size={11} /></button>
                          <button draggable={false} onPointerDown={stopBlockControlPointer} title="Move to to-do list" onClick={event => { event.stopPropagation(); props.onUnscheduleTodo(block.id) }}><Icon name="enter" size={11} /></button>
                          <button draggable={false} onPointerDown={stopBlockControlPointer} title="Move to Backlog" onClick={event => { event.stopPropagation(); props.onBacklogTodo(block.id) }}><Icon name="folder" size={11} /></button>
                          <button draggable={false} onPointerDown={stopBlockControlPointer} title="Delete todo" onClick={event => { event.stopPropagation(); props.onDeleteTodo(block.id, event.currentTarget.getBoundingClientRect(), true) }}><Icon name="trash" size={11} /></button>
                        </div>
                      )}
                      {!source && block.type === 'meeting' && !props.isHistorical && (
                        <div className="bl-acts">
                          <button
                            className={block.fyi ? 'on' : ''}
                            title={block.fyi ? 'Count as my meeting' : 'FYI only, not my meeting'}
                            draggable={false}
                            onPointerDown={stopBlockControlPointer}
                            onClick={event => { event.stopPropagation(); props.onToggleCalendarFyi(block.id) }}
                          ><Icon name={block.fyi ? 'eyeOff' : 'eye'} size={11} /></button>
                        </div>
                      )}
                      {source && !props.isHistorical && <span className="tp-resize" draggable={false} onDragStart={event => event.preventDefault()} onPointerDown={event => startResize(event, block)} />}
                    </article>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {hoverB && (() => {
        const { b, rect } = hoverB
        const width = 264
        let left = rect.left - width - 10
        if (left < 8) left = rect.right + 10
        const top = clamp(rect.top - 4, 8, window.innerHeight - 150)
        return createPortal(
          <div className="tp-hovercard" style={{ left, top, width }}>
            <div className="hc-hd"><span className={`k ${b.type}`}>{b.type === 'meeting' ? 'Meeting' : b.type === 'internal' ? 'Block' : 'Task'}</span><span>{minToHHMM(b.start)}-{minToHHMM(b.start + b.dur)} · {b.dur}m</span></div>
            <div className="hc-title">{b.segments ? <SegmentText segments={b.segments} /> : b.title}</div>
          </div>,
          document.body,
        )
      })()}

      {msOpen && msRect && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 139 }} onClick={() => setMsOpen(false)} />
          <div className="ms-panel" style={{ top: msRect.bottom + 6, left: Math.min(msRect.left, window.innerWidth - 336) }}>
            <div className="msp-hd"><Icon name="target" size={14} /><h3>Milestones</h3><button className="go" onClick={props.onManageMilestones}>Manage</button></div>
            {props.milestoneOptions.length === 0 && <div className="rec-panel-empty">No focused milestones.</div>}
            {props.milestoneOptions.slice(0, 6).map(milestone => (
              <div key={milestone.id} className="ms-item" style={{ '--c': milestone.color } as CSSProperties}>
                <div className="ms-top"><span className="em"><Icon name="target" size={12} /></span><span className="nm">{milestone.name}</span><span className="fr">{milestone.done}/{milestone.total}</span><span className={`due${milestone.urgent ? ' urgent' : ''}`}>{milestone.due || 'open'}</span></div>
                <div className="ms-bar"><span style={{ width: `${milestone.total ? (milestone.done / milestone.total) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      {backlogOpen && (
        <>
          <div className="tp-scrim" onClick={() => setBacklogOpen(false)} />
          <aside
            className={`tp-drawer${dropBacklog ? ' dropping' : ''}`}
            onDragOver={event => {
              if (!hasTodoPayload(event)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropBacklog(true)
            }}
            onDragLeave={event => leaveDropTarget(event, setDropBacklog)}
            onDrop={dropToBacklog}
          >
            <div className="tp-drawer-hd"><Icon name="folder" size={15} /><h3>Backlog</h3><button className="x" onClick={() => setBacklogOpen(false)}><Icon name="x" size={13} /></button></div>
            <p className="sub">Tasks on hold. Pull one back with plus.</p>
            {props.backlog.length === 0
              ? <div className="tp-bl-empty"><Icon name="folder" size={22} /><span>Nothing on hold.</span><small>Park a task from the plan to clear it without deleting.</small></div>
              : props.backlog.map(todo => <div key={todo.id} className="tp-bl-item"><button className="rr" onClick={() => props.onRestoreBacklogTodo(todo.id)}><Icon name="plus" size={12} /></button><span className="tx"><SegmentText segments={todoSegments(todo)} /></span><button className="tp-bl-trash" title="Delete todo" onClick={() => props.onDeleteTodo(todo.id)}><Icon name="trash" size={12} /></button></div>)}
          </aside>
        </>
      )}

      {!props.isHistorical && dragTodoId && (
        <div
          className={`tp-backlog-tray${dropBacklog ? ' over' : ''}`}
          onDragEnter={event => {
            if (!hasTodoPayload(event)) return
            event.preventDefault()
            setDropBacklog(true)
          }}
          onDragOver={event => {
            if (!hasTodoPayload(event)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropBacklog(true)
          }}
          onDragLeave={event => leaveDropTarget(event, setDropBacklog)}
          onDrop={dropToBacklog}
        >
          <span className="tray-icon"><Icon name="folder" size={18} /></span>
          <span className="tray-copy"><strong>Backlog</strong><small>Drop to park this task</small></span>
        </div>
      )}

      {props.toast && <div className="tp-toast"><span className="e"><Icon name={props.toast.icon} size={12} sw={2} /></span>{props.toast.text}{props.toast.actionLabel && props.toast.onAction && <button className="tp-toast-undo" onClick={props.toast.onAction}>{props.toast.actionLabel}</button>}</div>}

      {props.recurPanelOpen && props.recurRect && (
        <RecurringPanel
          rect={props.recurRect}
          series={props.recurSeries}
          onClose={props.onRecurringPanelClose}
          onNew={props.onRecurringNew}
          onEdit={series => props.onRecurringEditSeries(series.id)}
          onDelete={series => props.onRecurringDeleteSeries(series.id)}
        />
      )}
      {props.recurForm && (
        <RecurringForm
          mode={props.recurForm.mode}
          initial={props.recurForm.initial}
          onClose={props.onRecurringFormClose}
          onSave={props.onRecurringFormSave}
          onDeleteSeries={props.onRecurringFormDelete}
        />
      )}
      {props.scopeMenu && (
        <ScopeMenu rect={props.scopeMenu.rect} onClose={props.onScopeClose} onPick={props.onScopePick} />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      {meetingModal && <MeetingModal meeting={meetingModal} onClose={() => setMeetingModal(null)} />}
      {schedulePop && <TimePickPop rect={schedulePop.rect} initial={schedulePop.initial} onClose={() => setSchedulePop(null)} onPick={minutes => {
        if (schedulePop.todoId) props.onScheduleTodo(schedulePop.todoId, minutes, DEFAULT_DURATION)
        if (schedulePop.blockId) {
          const block = calItems.find(item => item.id === schedulePop.blockId)
          if (block) props.onScheduleTodo(block.id, minutes, block.dur)
        }
      }} />}
      {objLinkRect && <ObjLinkPop rect={objLinkRect} options={props.mentionOptions} onClose={() => setObjLinkRect(null)} onPick={props.onObjectiveLinkChange} />}
    </>
  )
}

export { editorSegmentsToTodo, editorText }
