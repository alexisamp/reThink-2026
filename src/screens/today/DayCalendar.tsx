import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { Archive, ArrowBendUpLeft, Check, DotsSixVertical } from '@phosphor-icons/react'
import type { Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import EditableTodoText from './EditableTodoText'
import TodoPreviewTarget from './TodoPreviewTarget'
import type { Mention, TodoMilestoneOption } from './types'
import type { TodoLinks } from '@/lib/todoContent'

const DAY_START = 7 * 60
const DAY_END = 23 * 60
const SNAP = 5
const DEFAULT_DURATION = 10
const MIN_DURATION = 5
const PX_PER_MINUTE = 1.8

type Interaction =
  | { type: 'move'; id: string; startY: number; start: number; duration: number }
  | { type: 'resize-start'; id: string; startY: number; start: number; duration: number }
  | { type: 'resize-end'; id: string; startY: number; start: number; duration: number }

interface LayoutBlock {
  todo: Todo
  start: number
  duration: number
  col: number
  cols: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snap(value: number) {
  return Math.round(value / SNAP) * SNAP
}

function minutesFromPoint(clientY: number, grid: HTMLDivElement | null) {
  if (!grid) return DAY_START
  const rect = grid.getBoundingClientRect()
  const minutes = DAY_START + ((clientY - rect.top + grid.scrollTop) / PX_PER_MINUTE)
  return clamp(snap(minutes), DAY_START, DAY_END - DEFAULT_DURATION)
}

function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function isScheduled(todo: Todo) {
  return todo.scheduled_start_minutes != null && todo.scheduled_duration_minutes != null
}

function layoutBlocks(todos: Todo[]): LayoutBlock[] {
  const sorted = todos
    .filter(isScheduled)
    .map(todo => ({
      todo,
      start: todo.scheduled_start_minutes as number,
      duration: todo.scheduled_duration_minutes as number,
    }))
    .sort((a, b) => a.start - b.start || a.duration - b.duration)

  const out: LayoutBlock[] = []
  let cluster: typeof sorted = []
  let clusterEnd = -1

  const flush = () => {
    const colEnds: number[] = []
    const placed: LayoutBlock[] = []
    for (const item of cluster) {
      const col = colEnds.findIndex(end => end <= item.start)
      const nextCol = col === -1 ? colEnds.length : col
      colEnds[nextCol] = item.start + item.duration
      placed.push({ ...item, col: nextCol, cols: 1 })
    }
    const cols = Math.max(1, colEnds.length)
    placed.forEach(item => out.push({ ...item, cols }))
    cluster = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.start + item.duration)
  }
  if (cluster.length) flush()
  return out
}

function todoDragId(dataTransfer: DataTransfer) {
  return dataTransfer.getData('text/todo-id') || dataTransfer.getData('text/plain')
}

export default function DayCalendar({
  todos,
  today,
  onSchedule,
  onToggle,
  onUnschedule,
  onBacklog,
  onDragArm,
  activeDragTodoId,
  onDragTodo,
  pointerOverMinute,
  onPointerDragStart,
  resolveMentions,
  mentionOptions,
  milestoneOptions,
  onEditText,
  onCreateMention,
  onChangeMilestone,
}: {
  todos: Todo[]
  today: string
  onSchedule: (id: string, startMinutes: number, durationMinutes: number) => void
  onToggle: (id: string) => void
  onUnschedule: (id: string) => void
  onBacklog: (id: string) => void
  onDragArm?: (armed: boolean) => void
  activeDragTodoId?: string | null
  onDragTodo?: (id: string | null) => void
  pointerOverMinute?: number | null
  onPointerDragStart?: (todo: Todo, event: PointerEvent<HTMLElement>) => void
  resolveMentions: (todo: Todo) => Mention[]
  mentionOptions: Mention[]
  milestoneOptions: TodoMilestoneOption[]
  onEditText: (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onChangeMilestone: (id: string, milestoneId: string | null) => void
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const draftsRef = useRef<Record<string, { start: number; duration: number }>>({})
  const centeredDayRef = useRef<string | null>(null)
  const [overMinute, setOverMinute] = useState<number | null>(null)
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { start: number; duration: number }>>({})
  const [now, setNow] = useState(() => new Date())
  const hours = useMemo(() => Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60), [])
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MINUTE
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNow = today === todayLocal && nowMinutes >= DAY_START && nowMinutes <= DAY_END

  const displayTodos = useMemo(() => {
    return todos.map(todo => {
      const draft = drafts[todo.id]
      return draft ? { ...todo, scheduled_start_minutes: draft.start, scheduled_duration_minutes: draft.duration } : todo
    })
  }, [todos, drafts])
  const blocks = useMemo(() => layoutBlocks(displayTodos), [displayTodos])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !showNow || centeredDayRef.current === today) return
    const nowTop = (nowMinutes - DAY_START) * PX_PER_MINUTE
    grid.scrollTop = clamp(nowTop - grid.clientHeight / 2, 0, grid.scrollHeight - grid.clientHeight)
    centeredDayRef.current = today
  }, [nowMinutes, showNow, today])

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  useEffect(() => {
    if (!interaction) return

    const move = (event: PointerEvent | globalThis.PointerEvent) => {
      const delta = snap((event.clientY - interaction.startY) / PX_PER_MINUTE)
      const originalEnd = interaction.start + interaction.duration
      let nextStart = interaction.start
      let nextDuration = interaction.duration

      if (interaction.type === 'move') {
        nextStart = clamp(interaction.start + delta, DAY_START, DAY_END - interaction.duration)
      } else if (interaction.type === 'resize-start') {
        nextStart = clamp(interaction.start + delta, DAY_START, originalEnd - MIN_DURATION)
        nextDuration = originalEnd - nextStart
      } else {
        nextDuration = clamp(snap(interaction.duration + delta), MIN_DURATION, DAY_END - interaction.start)
      }
      const nextDrafts = { ...draftsRef.current, [interaction.id]: { start: nextStart, duration: nextDuration } }
      draftsRef.current = nextDrafts
      setDrafts(nextDrafts)
    }

    const up = () => {
      const draft = draftsRef.current[interaction.id]
      if (draft) onSchedule(interaction.id, draft.start, draft.duration)
      setInteraction(null)
      const next = { ...draftsRef.current }
      delete next[interaction.id]
      draftsRef.current = next
      setDrafts(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [interaction, onSchedule])

  const visibleOverMinute = overMinute ?? pointerOverMinute ?? null

  const startInteraction = (type: Interaction['type'], todo: Todo, event: PointerEvent<HTMLElement>) => {
    if (!isScheduled(todo)) return
    event.preventDefault()
    event.stopPropagation()
    setInteraction({
      type,
      id: todo.id,
      startY: event.clientY,
      start: todo.scheduled_start_minutes as number,
      duration: todo.scheduled_duration_minutes as number,
    })
  }

  const startBlockDrag = (todo: Todo, event: DragEvent<HTMLElement>) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/todo-id', todo.id)
    event.dataTransfer.setData('text/plain', todo.id)
    onDragArm?.(true)
    onDragTodo?.(todo.id)
  }

  const hasTodoDrag = (event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer.types)
    return Boolean(activeDragTodoId) || types.includes('text/todo-id') || types.includes('text/plain')
  }

  const jumpToNow = () => {
    const grid = gridRef.current
    if (!grid || !showNow) return
    const nowTop = (nowMinutes - DAY_START) * PX_PER_MINUTE
    grid.scrollTo({ top: clamp(nowTop - grid.clientHeight / 2, 0, grid.scrollHeight - grid.clientHeight), behavior: 'smooth' })
  }

  return (
    <section className="day-calendar" aria-label="Daily calendar">
      <header className="day-calendar-hd">
        <div>
          <h3>Day plan</h3>
          <span>{formatClock(DAY_START)} - {formatClock(DAY_END)}</span>
        </div>
        <div className="day-calendar-tools">
          {showNow && <button onClick={jumpToNow}>Now {formatClock(nowMinutes)}</button>}
          <span className="day-calendar-count">{blocks.length} scheduled</span>
        </div>
      </header>
      <div
        ref={gridRef}
        data-day-calendar-grid
        className={`day-calendar-grid${visibleOverMinute != null ? ' drop-over' : ''}`}
        style={{ ['--cal-height' as string]: `${gridHeight}px` }}
        onDragOver={event => {
          if (!hasTodoDrag(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setOverMinute(minutesFromPoint(event.clientY, gridRef.current))
        }}
        onDragLeave={() => setOverMinute(null)}
        onDrop={event => {
          event.preventDefault()
          const id = todoDragId(event.dataTransfer) || activeDragTodoId || ''
          const start = minutesFromPoint(event.clientY, gridRef.current)
          setOverMinute(null)
          if (id) onSchedule(id, start, DEFAULT_DURATION)
        }}
      >
        <div className="day-calendar-hours" aria-hidden>
          {hours.map(hour => (
            <div
              key={hour}
              className="day-calendar-hour"
              style={{ top: `${(hour - DAY_START) * PX_PER_MINUTE}px` }}
            >
              <span>{formatClock(hour)}</span>
            </div>
          ))}
        </div>

        {visibleOverMinute != null && (
          <div className="day-calendar-drop-line" style={{ top: `${(visibleOverMinute - DAY_START) * PX_PER_MINUTE}px` }}>
            <span>Schedule at {formatClock(visibleOverMinute)}</span>
          </div>
        )}

        {showNow && (
          <div className="day-calendar-now" style={{ top: `${(nowMinutes - DAY_START) * PX_PER_MINUTE}px` }}>
            <span />
          </div>
        )}

        <div className="day-calendar-block-layer">
          {blocks.map(({ todo, start, duration, col, cols }) => {
            const width = `calc(${100 / cols}% - 4px)`
            const left = `calc(${(100 / cols) * col}% + 2px)`
            const sizeClass = duration <= 5 ? ' micro' : duration <= 10 ? ' dense' : duration >= 45 ? ' roomy' : ''
            const blockMentions = resolveMentions(todo)
            const scheduleLabel = `${formatClock(start)} - ${formatClock(start + duration)} (${duration}m)`
            return (
              <TodoPreviewTarget
                as="article"
                key={todo.id}
                todo={todo}
                mentions={blockMentions}
                mentionOptions={mentionOptions}
                scheduleLabel={scheduleLabel}
                className={`day-calendar-block${todo.completed ? ' done' : ''}${sizeClass}${interaction?.id === todo.id ? ' moving' : ''}`}
                style={{
                  top: `${(start - DAY_START) * PX_PER_MINUTE}px`,
                  height: `${Math.max(10, duration * PX_PER_MINUTE - 2)}px`,
                  left,
                  width,
                }}
                onPointerDown={event => startInteraction('move', todo, event)}
              >
                <span
                  className="cal-grip"
                  draggable
                  onDragStart={event => startBlockDrag(todo, event)}
                  onDragEnd={() => {
                    onDragArm?.(false)
                    onDragTodo?.(null)
                  }}
                  onPointerDown={event => {
                    event.stopPropagation()
                    onPointerDragStart?.(todo, event)
                  }}
                  title="Drag to Todos or Backlog"
                >
                  <DotsSixVertical size={11} />
                </span>
                <button
                  className={`cal-check${todo.completed ? ' checked' : ''}`}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => onToggle(todo.id)}
                  title={todo.completed ? 'Mark active' : 'Mark complete'}
                >
                  {todo.completed && <Check size={9} weight="bold" />}
                </button>
                <div className="cal-copy" onPointerDown={event => event.stopPropagation()}>
                  <div className="cal-title-row">
                    <span className="cal-time">{formatClock(start)} - {formatClock(start + duration)}</span>
                    <EditableTodoText
                      todo={todo}
                      mentions={blockMentions}
                      mentionOptions={mentionOptions}
                      milestoneOptions={milestoneOptions}
                      className="cal-editable-title"
                      onEditText={onEditText}
                      onCreateMention={onCreateMention}
                      onChangeMilestone={onChangeMilestone}
                    />
                  </div>
                </div>
                <div className="cal-actions" onPointerDown={event => event.stopPropagation()}>
                  <button onClick={() => onUnschedule(todo.id)} title="Return to unscheduled list"><ArrowBendUpLeft size={11} /></button>
                  <button onClick={() => onBacklog(todo.id)} title="Move to Backlog"><Archive size={11} /></button>
                </div>
                <span className="cal-resize top" onPointerDown={event => startInteraction('resize-start', todo, event)} />
                <span className="cal-resize bottom" onPointerDown={event => startInteraction('resize-end', todo, event)} />
              </TodoPreviewTarget>
            )
          })}
        </div>
      </div>
    </section>
  )
}
