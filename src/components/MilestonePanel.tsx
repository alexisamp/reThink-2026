/**
 * MilestonePanel — right-side sliding detail panel for a single milestone.
 *
 * Features:
 * - Editable target date in header (click date to edit)
 * - Delete milestone with inline confirmation
 * - Full vertical timeline of ALL todos (no date filter)
 * - Toggle steps done/pending, edit step date, drag-to-reorder pending steps
 * - Add steps for today, a custom date, or no date (pure future backlog)
 * - Smooth 280ms slide-in from right
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Plus, Check, Circle, HourglassMedium,
  DotsSixVertical, Trash, CalendarBlank, Pencil, Warning,
} from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
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
  onMilestoneDelete: (id: string) => void
  onTodoCreate: (todo: Todo) => void
  onTodoUpdate: (todo: Todo) => void
  onTodoDelete: (todoId: string) => void
}

// ── Single step in the timeline ──────────────────────────────────────────────
function StepRow({
  todo,
  pendingIds,
  today,
  onToggle,
  onDelete,
  onDateChange,
}: {
  todo: Todo
  pendingIds: string[]
  today: string
  onToggle: () => void
  onDelete: () => void
  onDateChange: (date: string | null) => void
}) {
  const isPending = pendingIds.includes(todo.id)
  const [editingDate, setEditingDate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const dateLabel = (() => {
    if (!todo.date) return null
    if (todo.date === today) return 'today'
    return todo.date
  })()

  return (
    <div ref={setNodeRef} style={style} className="flex gap-0 group/step mb-1">
      {/* Spine node */}
      <div className="flex flex-col items-center shrink-0 w-6">
        <div className={`w-1.5 h-1.5 rounded-full border-[1.5px] mt-3.5 z-10 transition-all ${
          isDone ? 'bg-pastel border-pastel' : 'bg-white border-mercury/80 group-hover/step:border-shuttle/30'
        }`} />
      </div>

      {/* Row content */}
      <div className={`flex-1 flex items-center gap-2 px-2 py-2.5 rounded-lg transition-colors ${
        isDone ? 'opacity-40' : 'hover:bg-gossip/[0.07]'
      }`}>
        {/* Drag handle */}
        {isPending && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover/step:opacity-30 cursor-grab active:cursor-grabbing text-shuttle shrink-0 touch-none transition-opacity"
          >
            <DotsSixVertical size={10} />
          </div>
        )}

        {/* Checkbox */}
        <button onClick={onToggle} className="shrink-0 hover:opacity-70 transition-opacity">
          {isDone
            ? <Check size={11} className="text-pastel" weight="bold" />
            : isWaiting
            ? <HourglassMedium size={11} className="text-shuttle/30" />
            : <Circle size={11} className="text-mercury/80" />}
        </button>

        {/* Text */}
        <span className={`flex-1 text-[12px] leading-snug min-w-0 ${
          isDone ? 'line-through text-shuttle/35' : 'text-burnham/75'
        }`}>
          {todo.text}
        </span>

        {/* Date + delete - right side, hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover/step:opacity-100 transition-opacity shrink-0">
          {editingDate ? (
            <input
              type="date"
              autoFocus
              defaultValue={todo.date ?? ''}
              className="text-[9px] font-mono border border-burnham/20 rounded px-1 py-0.5 focus:outline-none focus:border-burnham/40 bg-white w-24"
              onChange={e => {
                onDateChange(e.target.value || null)
                setEditingDate(false)
              }}
              onBlur={() => setEditingDate(false)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingDate(false) }}
            />
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded hover:bg-mercury/30 transition-colors ${
                dateLabel === 'today' ? 'text-pastel/80' : 'text-shuttle/30 hover:text-shuttle/60'
              }`}
            >
              {dateLabel ?? '—'}
            </button>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-0.5">
              <button
                onClick={onDelete}
                className="text-[8px] font-mono text-red-400 px-1 py-0.5 rounded border border-red-200/70"
              >
                del
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-shuttle/25 p-0.5"
              >
                <X size={8} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-shuttle/15 hover:text-red-400 p-0.5 transition-colors"
            >
              <Trash size={9} />
            </button>
          )}
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
  onMilestoneDelete,
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

  // Editable target date
  const [editingTargetDate, setEditingTargetDate] = useState(false)

  // Delete milestone
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const addInputRef = useRef<HTMLInputElement>(null)

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
    // ALL todos for this milestone — no date filter
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('milestone_id', milestone.id)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    const loaded = data ?? []
    setTodos(loaded)
    setLoading(false)

    // Auto-complete milestone if all todos are already done (catches previously-completed sets)
    if (loaded.length > 0 && loaded.every(t => t.completed) && milestone.status !== 'COMPLETE') {
      await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', milestone.id)
      onMilestoneUpdate({ ...milestone, status: 'COMPLETE' } as any)
    }
  }, [milestone?.id, userId])

  useEffect(() => {
    if (!milestone) return
    setDescription((milestone as any).description ?? '')
    setTodos([])
    setConfirmDelete(false)
    setAddingTodo(false)
    fetchTodos()
  }, [milestone?.id])

  useEffect(() => {
    if (!loading && todos.length === 0 && milestone) {
      setAddingTodo(true)
      setTimeout(() => addInputRef.current?.focus(), 50)
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

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  const handleTargetDateChange = async (val: string) => {
    setEditingTargetDate(false)
    const newDate = val || null
    await supabase.from('milestones').update({ target_date: newDate }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, target_date: newDate ?? undefined } as any)
  }

  const handleDeleteMilestone = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    // Delete all todos first, then milestone
    await supabase.from('todos').delete().eq('milestone_id', milestone.id)
    await supabase.from('milestones').delete().eq('id', milestone.id)
    onMilestoneDelete(milestone.id)
    handleClose()
  }

  const handleToggleTodo = async (todo: Todo) => {
    const markingComplete = !todo.completed
    const patch = {
      completed: markingComplete,
      completed_at: markingComplete ? new Date().toISOString() : null,
    }
    const updated = { ...todo, ...patch }
    const newTodos = todos.map(t => (t.id === todo.id ? updated : t))
    setTodos(newTodos)
    await supabase.from('todos').update(patch).eq('id', todo.id)
    onTodoUpdate(updated)

    // Auto-complete milestone when all steps are done
    if (markingComplete && milestone.status !== 'COMPLETE') {
      const allDone = newTodos.every(t => t.completed)
      if (allDone) {
        await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', milestone.id)
        onMilestoneUpdate({ ...milestone, status: 'COMPLETE' } as any)
      }
    }
  }

  const handleDeleteTodo = async (todoId: string) => {
    setTodos(prev => prev.filter(t => t.id !== todoId))
    await supabase.from('todos').delete().eq('id', todoId)
    onTodoDelete(todoId)
  }

  const handleTodoDateChange = async (todo: Todo, newDate: string | null) => {
    await supabase.from('todos').update({ date: newDate }).eq('id', todo.id)
    const updated = { ...todo, date: newDate }
    setTodos(prev => prev.map(t => (t.id === todo.id ? updated : t)))
    onTodoUpdate(updated)
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[210] bg-black/8 backdrop-blur-[0.5px] transition-opacity duration-280"
        style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[215] flex flex-col bg-white border-l border-mercury/50 shadow-2xl"
        style={{
          width: 440,
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-burnham px-5 pt-5 pb-4">
          {/* Goal label */}
          {goal && (
            <div className="mb-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-gossip/40">
                {goal.emoji ? `${goal.emoji} ` : ''}
                {goal.alias ?? goal.text.slice(0, 28)}
              </span>
            </div>
          )}

          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-white leading-snug flex-1 min-w-0">
              {milestone.text}
            </h2>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {/* Delete milestone */}
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <Warning size={11} className="text-red-300" />
                  <span className="text-[9px] text-red-300 font-mono">delete milestone?</span>
                  <button
                    onClick={handleDeleteMilestone}
                    disabled={deleting}
                    className="text-[9px] font-mono text-red-300 border border-red-400/40 px-1.5 py-0.5 rounded hover:bg-red-400/10 transition-colors"
                  >
                    {deleting ? '…' : 'yes'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-white/30 hover:text-white/60"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-white/20 hover:text-red-300 transition-colors p-0.5"
                  title="Delete milestone"
                >
                  <Trash size={12} />
                </button>
              )}
              <button
                onClick={handleClose}
                className="text-white/30 hover:text-white/70 transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Target date — click to edit */}
          <div className="flex items-center gap-2 mt-2.5">
            <CalendarBlank size={10} className="text-gossip/35 shrink-0" />
            {editingTargetDate ? (
              <input
                type="date"
                autoFocus
                defaultValue={milestone.target_date ?? ''}
                className="text-[10px] font-mono text-burnham bg-white border-0 rounded px-1 py-0.5 focus:outline-none w-32"
                onChange={e => handleTargetDateChange(e.target.value)}
                onBlur={() => setEditingTargetDate(false)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setEditingTargetDate(false)
                  if (e.key === 'Enter') {
                    const el = e.target as HTMLInputElement
                    handleTargetDateChange(el.value)
                  }
                }}
              />
            ) : (
              <button
                onClick={() => setEditingTargetDate(true)}
                className="text-[10px] font-mono text-gossip/40 hover:text-gossip/70 transition-colors flex items-center gap-1 group/date"
              >
                {milestone.target_date ?? 'No target date'}
                <Pencil size={8} className="opacity-0 group-hover/date:opacity-60 transition-opacity" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono text-gossip/35">
                  {doneCount} / {totalCount} done
                </span>
                <span className="text-[9px] font-mono text-gossip/35">{progressPct}%</span>
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

        {/* ── Description ─────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-2.5 border-b border-mercury/25 bg-white">
          <input
            value={description}
            onChange={e => handleDescChange(e.target.value)}
            placeholder="Add a note…"
            className="w-full text-[11px] text-shuttle/55 bg-transparent border-none outline-none placeholder-shuttle/20"
          />
        </div>

        {/* ── Steps timeline ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[11px] text-shuttle/25 animate-pulse font-mono">loading…</span>
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[12px] text-shuttle/30">Add the first step toward this milestone</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical spine */}
              <div className="absolute left-[8px] top-0 bottom-0 w-px bg-mercury/40" />

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
                      onDateChange={date => handleTodoDateChange(todo, date)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* ── Add step ────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3.5 border-t border-mercury/35 bg-white">
          {addingTodo ? (
            <div className="space-y-2">
              <input
                ref={addInputRef}
                autoFocus
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTodo(false) }
                  if (e.key === 'Escape') {
                    setAddingTodo(false)
                    setNewTodoText('')
                    setNewTodoDate('')
                  }
                }}
                placeholder="Describe this step…"
                className="w-full text-[13px] text-burnham/80 bg-transparent border-none outline-none placeholder-shuttle/20"
              />
              <div className="flex items-center gap-2 flex-wrap">
                {/* Today */}
                <button
                  onClick={() => handleAddTodo(true)}
                  disabled={!newTodoText.trim()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-burnham text-gossip text-[10px] font-semibold rounded-lg hover:bg-burnham/85 transition-colors disabled:opacity-30"
                >
                  <Plus size={9} />
                  Today
                </button>

                {/* Date picker */}
                <input
                  type="date"
                  value={newTodoDate}
                  onChange={e => setNewTodoDate(e.target.value)}
                  className="text-[10px] font-mono text-shuttle/45 border border-mercury/60 rounded px-2 py-1 focus:outline-none focus:border-shuttle/35"
                  title="Schedule for a specific date"
                />

                {/* Add on date */}
                {newTodoDate && (
                  <button
                    onClick={() => handleAddTodo(false)}
                    disabled={!newTodoText.trim()}
                    className="text-[10px] font-mono text-shuttle/45 hover:text-burnham px-2 py-1 rounded border border-mercury/50 hover:border-burnham/25 transition-colors disabled:opacity-30"
                  >
                    add on date
                  </button>
                )}

                {/* No date — pure future backlog */}
                <button
                  onClick={() => handleAddTodo(false)}
                  disabled={!newTodoText.trim() || !!newTodoDate}
                  className="text-[10px] font-mono text-shuttle/30 hover:text-shuttle/60 transition-colors disabled:opacity-20"
                  title="Add with no date (backlog)"
                >
                  no date
                </button>

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
              <p className="text-[9px] text-shuttle/20 font-mono">↵ add no-date · Esc cancel</p>
            </div>
          ) : (
            <button
              onClick={() => { setAddingTodo(true); setTimeout(() => addInputRef.current?.focus(), 50) }}
              className="flex items-center gap-2 text-[11px] text-shuttle/30 hover:text-shuttle transition-colors"
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
