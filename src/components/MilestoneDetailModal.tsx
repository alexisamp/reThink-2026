import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Check, HourglassMedium, Circle, DotsSixVertical, Trash } from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Milestone, Todo, Goal } from '@/types'

interface MilestoneDetailModalProps {
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

function TimelineTodoRow({
  todo,
  pendingIds,
  onToggle,
  onDelete,
}: {
  todo: Todo
  pendingIds: string[]
  onToggle: () => void
  onDelete: () => void
}) {
  const isPending = pendingIds.includes(todo.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: !isPending,
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const isDone = todo.completed
  const isWaiting = !todo.completed && !!(todo as any).waiting

  return (
    <div ref={setNodeRef} style={style} className="flex gap-3 group">
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={`w-3 h-3 rounded-full border-2 mt-3.5 shrink-0 z-10 ${
          isDone ? 'bg-pastel border-pastel' :
          isWaiting ? 'bg-mercury border-shuttle/40' :
          'bg-white border-mercury'
        }`} />
      </div>

      <div className={`flex-1 mb-3 rounded-xl border px-4 py-3 transition-colors ${
        isDone ? 'border-mercury/30 opacity-50' : 'border-mercury bg-white hover:border-shuttle/30'
      }`}>
        <div className="flex items-center gap-2">
          {isPending && (
            <div {...attributes} {...listeners}
              className="opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing text-shuttle shrink-0 touch-none">
              <DotsSixVertical size={12} />
            </div>
          )}

          <button onClick={onToggle} className="shrink-0 hover:opacity-70 transition-opacity">
            {isDone ? <Check size={14} className="text-pastel" weight="bold" /> :
             isWaiting ? <HourglassMedium size={14} className="text-shuttle/40" /> :
             <Circle size={14} className="text-mercury" />}
          </button>

          <span className={`flex-1 text-sm leading-snug min-w-0 truncate ${
            isDone ? 'line-through text-shuttle/40' : 'text-burnham'
          }`}>
            {todo.text}
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {todo.date && (
              <span className="text-[9px] text-shuttle/30 font-mono">{todo.date}</span>
            )}
            <button onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle/30 hover:text-red-400">
              <Trash size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MilestoneDetailModal({
  milestone, goal, userId, today, onClose, onMilestoneUpdate, onTodoCreate, onTodoUpdate, onTodoDelete
}: MilestoneDetailModalProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [descTimer, setDescTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoDate, setNewTodoDate] = useState('')
  const [addingTodo, setAddingTodo] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchTodos = useCallback(async () => {
    if (!milestone) return
    setLoading(true)
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('milestone_id', milestone.id)
      .order('sort_order', { ascending: true })
    setTodos(data ?? [])
    setLoading(false)
  }, [milestone?.id])

  useEffect(() => {
    if (!milestone) return
    setDescription((milestone as any).description ?? '')
    fetchTodos()
  }, [milestone?.id])

  if (!milestone) return null

  const pendingTodos = todos.filter(t => !t.completed && !(t as any).waiting)
  const waitingTodos = todos.filter(t => !t.completed && !!(t as any).waiting)
  const doneTodos = todos.filter(t => t.completed)
  const orderedTodos = [...pendingTodos, ...waitingTodos, ...doneTodos]
  const pendingIds = pendingTodos.map(t => t.id)

  const handleDescChange = (val: string) => {
    setDescription(val)
    if (descTimer) clearTimeout(descTimer)
    setDescTimer(setTimeout(async () => {
      await supabase.from('milestones').update({ description: val } as any).eq('id', milestone.id)
      onMilestoneUpdate({ ...milestone, description: val } as any)
    }, 600))
  }

  const handleToggleTodo = async (todo: Todo) => {
    const patch = { completed: !todo.completed, completed_at: !todo.completed ? new Date().toISOString() : null }
    const updated = { ...todo, ...patch }
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t))
    await supabase.from('todos').update(patch).eq('id', todo.id)
    onTodoUpdate(updated)
  }

  const handleDeleteTodo = async (todoId: string) => {
    setTodos(prev => prev.filter(t => t.id !== todoId))
    await supabase.from('todos').delete().eq('id', todoId)
    onTodoDelete(todoId)
  }

  const handleAddTodo = async () => {
    if (!newTodoText.trim() || !userId) return
    const { data } = await supabase.from('todos').insert({
      text: newTodoText.trim(),
      user_id: userId,
      milestone_id: milestone.id,
      goal_id: goal?.id ?? null,
      date: newTodoDate || null,
      effort: 'NORMAL',
      sort_order: todos.length,
      completed: false,
    }).select().single()
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
    await Promise.all(updates.map(t =>
      supabase.from('todos').update({ sort_order: t.sort_order }).eq('id', t.id)
    ))
  }

  return (
    <>
      <div className="fixed inset-0 z-[210] bg-black/15 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[215] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[560px] max-h-[82vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col overflow-hidden">

          <div className="flex items-start justify-between px-6 py-5 border-b border-mercury/50 shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              {goal && (
                <span className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">
                  {goal.emoji ? `${goal.emoji} ` : ''}{goal.alias ?? goal.text.slice(0, 20)}
                </span>
              )}
              <h2 className="text-base font-semibold text-burnham leading-snug">{milestone.text}</h2>
              {milestone.target_date && (
                <p className="text-[10px] text-shuttle/40 font-mono mt-0.5">{milestone.target_date}</p>
              )}
            </div>
            <button onClick={onClose} className="text-shuttle/30 hover:text-shuttle transition-colors shrink-0 mt-0.5">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-3 border-b border-mercury/30 shrink-0">
            <input value={description} onChange={e => handleDescChange(e.target.value)}
              placeholder="Descripción opcional…"
              className="w-full text-[12px] text-shuttle bg-transparent border-none outline-none placeholder-shuttle/25" />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-5 pb-2 min-h-0">
            {loading ? (
              <p className="text-[11px] text-shuttle/30 text-center py-10 animate-pulse">Cargando…</p>
            ) : todos.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[12px] text-shuttle/40">Añadí el primer paso hacia este hito</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[9px] top-0 bottom-0 w-px bg-mercury/40" />
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={pendingIds} strategy={verticalListSortingStrategy}>
                    {orderedTodos.map(todo => (
                      <TimelineTodoRow
                        key={todo.id}
                        todo={todo}
                        pendingIds={pendingIds}
                        onToggle={() => handleToggleTodo(todo)}
                        onDelete={() => handleDeleteTodo(todo.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-mercury/50 shrink-0">
            {addingTodo ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={newTodoText} onChange={e => setNewTodoText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddTodo(); if (e.key === 'Escape') { setAddingTodo(false); setNewTodoText('') } }}
                  placeholder="Descripción del paso…"
                  className="flex-1 text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors" />
                <input type="date" value={newTodoDate} onChange={e => setNewTodoDate(e.target.value)}
                  className="text-[11px] text-shuttle border border-mercury rounded-lg px-2 py-2 focus:outline-none focus:border-shuttle font-mono" />
                <button onClick={handleAddTodo} className="px-3 py-2 bg-burnham text-white text-xs font-semibold rounded-lg hover:bg-burnham/80 transition-colors">ok</button>
                <button onClick={() => { setAddingTodo(false); setNewTodoText('') }} className="text-shuttle/40 hover:text-shuttle"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setAddingTodo(true)}
                className="flex items-center gap-2 text-[11px] text-shuttle/40 hover:text-shuttle transition-colors font-mono">
                <Plus size={12} />
                <span>Añadir paso</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
