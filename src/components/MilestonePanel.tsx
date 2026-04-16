/**
 * MilestonePanel — right-side sliding panel for milestone detail + timeline of ALL steps
 *
 * Design: refined editorial. Burnham dark header, clean white body, vertical timeline.
 * Shows ALL todos linked to the milestone — no date filter.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  X, Plus, Check, Circle, HourglassMedium,
  DotsSixVertical, Trash, CalendarBlank,
} from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Milestone, Todo, Goal } from '@/types'

interface MilestonePanelProps {
  milestone: Milestone | null
  goal: Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'> | null
  userId: string
  today: string
  onClose: () => void
  onMilestoneUpdate: (m: Milestone & { description?: string }) => void
  onTodoCreate: (todo: Todo) => void
  onTodoUpdate: (todo: Todo) => void
  onTodoDelete: (todoId: string) => void
}

// ── Single step row in the timeline ─────────────────────────────────────────
function StepRow({
  todo,
  pendingIds,
  today,
  onToggle,
  onDelete,
  onScheduleToday,
}: {
  todo: Todo
  pendingIds: string[]
  today: string
  onToggle: () => void
  onDelete: () => void
  onScheduleToday?: () => void
}) {
  const isPending = pendingIds.includes(todo.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: !isPending,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  const isDone = todo.completed
  const isWaiting = !todo.completed && !!(todo as any).waiting

  return (
    <div ref={setNodeRef} style={style} className="flex gap-0 group/step">
      {/* Timeline spine + node */}
      <div className="flex flex-col items-center shrink-0 w-8 relative">
        {/* Node */}
        <div className={`w-2.5 h-2.5 rounded-full border-[1.5px] mt-3.5 shrink-0 z-10 transition-colors ${
          isDone
            ? 'bg-pastel border-pastel'
            : isWaiting
            ? 'bg-mercury border-shuttle/30'
            : 'bg-white border-mercury'
        }`} />
      </div>

      {/* Step card */}
      <div className={`flex-1 mb-2.5 rounded-xl border px-3.5 py-2.5 transition-all ${
        isDone
          ? 'border-mercury/25 opacity-45'
          : 'border-mercury bg-white hover:border-burnham/15 hover:shadow-sm'
      }`}>
        <div className="flex items-center gap-2">
          {/* Drag handle — pending only */}
          {isPending && (
            <div
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover/step:opacity-25 cursor-grab active:cursor-grabbing text-shuttle shrink-0 touch-none transition-opacity"
            >
              <DotsSixVertical size={11} />
            </div>
          )}

          {/* Toggle */}
          <button onClick={onToggle} className="shrink-0 hover:opacity-70 transition-opacity">
            {isDone
              ? <Check size={13} className="text-pastel" weight="bold" />
              : isWaiting
              ? <HourglassMedium size={13} className="text-shuttle/35" />
              : <Circle size={13} className="text-mercury" />}
          </button>

          {/* Text */}
          <span className={`flex-1 text-[12px] leading-snug min-w-0 ${
            isDone ? 'line-through text-shuttle/35' : 'text-burnham/80'
          }`}>
            {todo.text}
          </span>

          {/* Date / schedule */}
          <div className="flex items-center gap-1.5 shrink-0">
            {todo.date && todo.date !== today && (
              <span className="text-[9px] text-shuttle/30 font-mono">{todo.date}</span>
            )}
            {todo.date === today && (
              <span className="text-[9px] text-pastel/70 font-mono">today</span>
            )}
            {!todo.completed && todo.date !== today && onScheduleToday && (
              <button
                onClick={onScheduleToday}
                className="opacity-0 group-hover/step:opacity-100 transition-opacity text-[9px] font-mono text-shuttle/35 hover:text-burnham px-1 py-0.5 rounded border border-transparent hover:border-mercury"
                title="Schedule for today"
              >
                →today
              </button>
            )}
            <button
              onClick={onDelete}
              className="opacity-0 group-hover/step:opacity-100 transition-opacity text-shuttle/25 hover:text-red-400 p-0.5"
            >
              <Trash size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────
export default function MilestonePanel({
  milestone,
  goal,
  userId,
  today,
  onClose,
  onMilestoneUpdate,
  onTodoCreate,
  onTodoUpdate,
  onTodoDelete,
}: MilestonePanelProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [descTimer, setDescTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoDate, setNewTodoDate] = useState('')
  const [addingTodo, setAddingTodo] = useState(false)
  const [visible, setVisible] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Slide-in on mount
  useEffect(() => {
    if (milestone) {
      const t = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(t)
    }
    setVisible(false)
  }, [milestone?.id])

  const fetchTodos = useCallback(async () => {
    if (!milestone || !userId) return
    setLoading(true)
    // Fetch ALL todos linked to this milestone — no date filter
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('milestone_id', milestone.id)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setTodos(data ?? [])
    setLoading(false)
  }, [milestone?.id, userId])

  useEffect(() => {
    if (!milestone) return
    setDescription((milestone as any).description ?? '')
    setTodos([])
    setAddingTodo(false)
    fetchTodos()
  }, [milestone?.id])

  // Auto-open add when no steps yet
  useEffect(() => {
    if (!loading && todos.length === 0 && milestone) {
      setAddingTodo(true)
    }
  }, [loading, todos.length, milestone?.id])

  if (!milestone) return null

  const pendingTodos = todos.filter(t => !t.completed && !(t as any).waiting)
  const waitingTodos = todos.filter(t => !t.completed && !!(t as any).waiting)
  const doneTodos = todos.filter(t => t.completed)
  const orderedTodos = [...pendingTodos, ...waitingTodos, ...doneTodos]
  const pendingIds = pendingTodos.map(t => t.id)

  const doneCount = doneTodos.length
  const totalCount = todos.length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const handleDescChange = (val: string) => {
    setDescription(val)
    if (descTimer) clearTimeout(descTimer)
    setDescTimer(
      setTimeout(async () => {
        await supabase.from('milestones').update({ description: val } as any).eq('id', milestone.id)
        onMilestoneUpdate({ ...milestone, description: val } as any)
      }, 600)
    )
  }

  const handleToggleTodo = async (todo: Todo) => {
    const patch = {
      completed: !todo.completed,
      completed_at: !todo.completed ? new Date().toISOString() : null,
    }
    const updated = { ...todo, ...patch }
    setTodos(prev => prev.map(t => (t.id === todo.id ? updated : t)))
    await supabase.from('todos').update(patch).eq('id', todo.id)
    onTodoUpdate(updated)
  }

  const handleDeleteTodo = async (todoId: string) => {
    setTodos(prev => prev.filter(t => t.id !== todoId))
    await supabase.from('todos').delete().eq('id', todoId)
    onTodoDelete(todoId)
  }

  const handleAddTodo = async (forToday = false) => {
    if (!newTodoText.trim() || !userId) return
    const date = forToday ? today : newTodoDate || null
    const { data } = await supabase
      .from('todos')
      .insert({
        text: newTodoText.trim(),
        user_id: userId,
        milestone_id: milestone.id,
        goal_id: goal?.id ?? null,
        date,
        effort: 'NORMAL',
        sort_order: todos.length,
        completed: false,
      })
      .select()
      .single()
    if (data) {
      setTodos(prev => [...prev, data])
      onTodoCreate(data)
    }
    setNewTodoText('')
    setNewTodoDate('')
    setAddingTodo(false)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = pendingTodos.findIndex(t => t.id === active.id)
    const newIdx = pendingTodos.findIndex(t => t.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(pendingTodos, oldIdx, newIdx)
    const updates = reordered.map((t, i) => ({ ...t, sort_order: i }))
    setTodos(prev => {
      const rest = prev.filter(t => t.completed || !!(t as any).waiting)
      return [...updates, ...rest]
    })
    await Promise.all(
      updates.map(t =>
        supabase.from('todos').update({ sort_order: t.sort_order }).eq('id', t.id)
      )
    )
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  // Goal color accent — first word of color token or fallback
  const accentColor = goal?.color ?? '#003720'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[210] bg-black/10 backdrop-blur-[0.5px] transition-opacity duration-280"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[220] flex flex-col bg-white border-l border-mercury/60 shadow-2xl"
        style={{
          width: 440,
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-burnham px-5 pt-5 pb-4">
          {/* Goal label */}
          {goal && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-gossip/50 text-[9px] font-mono uppercase tracking-widest">
                {goal.emoji ? `${goal.emoji} ` : ''}
                {goal.alias ?? goal.text.slice(0, 24)}
              </span>
            </div>
          )}

          {/* Milestone title */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-white leading-snug flex-1 min-w-0">
              {milestone.text}
            </h2>
            <button
              onClick={handleClose}
              className="text-white/30 hover:text-white/70 transition-colors shrink-0 mt-0.5"
            >
              <X size={15} />
            </button>
          </div>

          {/* Target date */}
          {milestone.target_date && (
            <div className="flex items-center gap-1.5 mt-2">
              <CalendarBlank size={10} className="text-gossip/40" />
              <span className="text-[10px] text-gossip/40 font-mono">{milestone.target_date}</span>
            </div>
          )}

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono text-gossip/40">
                  {doneCount} / {totalCount} steps
                </span>
                <span className="text-[9px] font-mono text-gossip/40">{progressPct}%</span>
              </div>
              <div className="h-[2px] rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-pastel transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Description ────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-2.5 border-b border-mercury/30 bg-white">
          <input
            value={description}
            onChange={e => handleDescChange(e.target.value)}
            placeholder="Add a description…"
            className="w-full text-[11px] text-shuttle/60 bg-transparent border-none outline-none placeholder-shuttle/20"
          />
        </div>

        {/* ── Steps timeline ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[11px] text-shuttle/30 animate-pulse font-mono">loading steps…</span>
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[12px] text-shuttle/35">
                Add the first step toward this milestone
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical spine */}
              <div className="absolute left-[14px] top-0 bottom-0 w-px bg-mercury/50" />

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={pendingIds} strategy={verticalListSortingStrategy}>
                  {orderedTodos.map(todo => (
                    <StepRow
                      key={todo.id}
                      todo={todo}
                      pendingIds={pendingIds}
                      today={today}
                      onToggle={() => handleToggleTodo(todo)}
                      onDelete={() => handleDeleteTodo(todo.id)}
                      onScheduleToday={async () => {
                        await supabase.from('todos').update({ date: today }).eq('id', todo.id)
                        const updated = { ...todo, date: today }
                        setTodos(prev => prev.map(t => (t.id === todo.id ? updated : t)))
                        onTodoUpdate(updated)
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* ── Add step ───────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3.5 border-t border-mercury/40 bg-white">
          {addingTodo ? (
            <div className="space-y-2.5">
              <input
                autoFocus
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddTodo(true)
                  if (e.key === 'Escape') {
                    setAddingTodo(false)
                    setNewTodoText('')
                    setNewTodoDate('')
                  }
                }}
                placeholder="Describe this step…"
                className="w-full text-[13px] text-burnham/80 bg-transparent border-none outline-none placeholder-shuttle/20"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAddTodo(true)}
                  disabled={!newTodoText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-burnham text-gossip text-[11px] font-semibold rounded-lg hover:bg-burnham/85 transition-colors disabled:opacity-30"
                >
                  <Plus size={10} />
                  Add to today
                </button>
                <input
                  type="date"
                  value={newTodoDate}
                  onChange={e => setNewTodoDate(e.target.value)}
                  className="text-[10px] text-shuttle/45 border border-mercury/60 rounded px-2 py-1.5 focus:outline-none focus:border-shuttle/40 font-mono"
                  title="Schedule for a future date"
                />
                {newTodoDate && (
                  <button
                    onClick={() => handleAddTodo(false)}
                    disabled={!newTodoText.trim()}
                    className="text-[10px] font-mono text-shuttle/45 hover:text-burnham transition-colors px-2 py-1.5 rounded border border-mercury/60 hover:border-burnham/25 disabled:opacity-30"
                  >
                    add on date
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setAddingTodo(false)
                    setNewTodoText('')
                    setNewTodoDate('')
                  }}
                  className="text-shuttle/25 hover:text-shuttle transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="text-[9px] text-shuttle/25 font-mono">↵ add to today · Esc cancel</p>
            </div>
          ) : (
            <button
              onClick={() => setAddingTodo(true)}
              className="flex items-center gap-2 text-[11px] text-shuttle/35 hover:text-shuttle transition-colors"
            >
              <Plus size={11} />
              <span>Add step</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
