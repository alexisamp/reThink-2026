/**
 * MilestoneCapture — keyboard-first inline overlay for creating milestones.
 * Triggered by `/milestone` in the quick-add input.
 * Creates a milestone + milestone_todos in one flow.
 */
import { useState, useEffect, useRef } from 'react'
import { X, Plus, Check, Flag, CalendarBlank } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/types'

interface MilestoneCaptureProps {
  userId: string
  goals: Pick<Goal, 'id' | 'text' | 'alias' | 'emoji'>[]
  onClose: () => void
  onCreated: (milestoneId: string) => void
}

export function MilestoneCapture({ userId, goals, onClose, onCreated }: MilestoneCaptureProps) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [goalId, setGoalId] = useState<string>('')
  const [todos, setTodos] = useState<string[]>(['', ''])
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const addTodoRow = () => setTodos(prev => [...prev, ''])

  const updateTodo = (i: number, val: string) => {
    setTodos(prev => prev.map((t, idx) => idx === i ? val : t))
  }

  const removeTodo = (i: number) => {
    setTodos(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleTodoKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i === todos.length - 1) addTodoRow()
      // focus next
      const next = document.getElementById(`milestone-todo-${i + 1}`)
      next?.focus()
    }
    if (e.key === 'Backspace' && todos[i] === '' && todos.length > 1) {
      e.preventDefault()
      removeTodo(i)
      const prev = document.getElementById(`milestone-todo-${i - 1}`)
      prev?.focus()
    }
  }

  const canSave = name.trim().length > 0

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const { data: ms, error } = await supabase
        .from('milestones')
        .insert({
          user_id: userId,
          text: name.trim(),
          goal_id: goalId || null,
          target_date: date || null,
          status: 'PENDING',
        })
        .select('id')
        .single()

      if (error || !ms) throw error

      const filteredTodos = todos.map(t => t.trim()).filter(t => t.length > 0)
      if (filteredTodos.length > 0) {
        await supabase.from('milestone_todos').insert(
          filteredTodos.map((t, i) => ({
            user_id: userId,
            milestone_id: ms.id,
            text: t,
            position: i,
          }))
        )
      }

      onCreated(ms.id)
    } catch {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-burnham/10 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative bg-white border border-mercury rounded-2xl shadow-2xl shadow-burnham/5 w-full max-w-md mx-4 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-mercury/50">
          <Flag size={14} className="text-burnham shrink-0" />
          <span className="text-[12px] font-semibold text-burnham uppercase tracking-widest">New milestone</span>
          <button
            onClick={onClose}
            className="ml-auto text-shuttle/30 hover:text-shuttle transition-colors p-0.5 rounded"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What's the milestone?"
              className="w-full text-[15px] font-medium text-burnham placeholder-shuttle/30 bg-transparent border-0 border-b border-mercury/60 focus:border-burnham/40 focus:outline-none pb-2 transition-colors"
            />
          </div>

          {/* Date + Goal row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 flex-1">
              <CalendarBlank size={12} className="text-shuttle/40 shrink-0" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-[12px] text-shuttle bg-transparent border-0 focus:outline-none flex-1 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <select
                value={goalId}
                onChange={e => setGoalId(e.target.value)}
                className="text-[12px] text-shuttle bg-transparent border-0 focus:outline-none flex-1 cursor-pointer truncate"
              >
                <option value="">No goal link</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.emoji ? `${g.emoji} ` : ''}{g.alias ?? g.text.slice(0, 30)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Todos */}
          <div>
            <p className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest mb-2">Tasks</p>
            <div className="space-y-1">
              {todos.map((t, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <div className="w-3.5 h-3.5 rounded border border-mercury/60 shrink-0" />
                  <input
                    id={`milestone-todo-${i}`}
                    value={t}
                    onChange={e => updateTodo(i, e.target.value)}
                    onKeyDown={e => handleTodoKeyDown(e, i)}
                    placeholder={i === 0 ? 'First task...' : i === 1 ? 'Second task...' : 'Another task...'}
                    className="flex-1 text-[13px] text-burnham placeholder-shuttle/25 bg-transparent border-0 focus:outline-none"
                  />
                  {todos.length > 1 && t === '' && (
                    <button
                      onClick={() => removeTodo(i)}
                      className="opacity-0 group-hover:opacity-100 text-shuttle/30 hover:text-shuttle/60 transition-all"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addTodoRow}
              className="flex items-center gap-1.5 mt-2 text-[11px] text-shuttle/40 hover:text-shuttle/70 transition-colors"
            >
              <Plus size={11} /> Add task
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <span className="text-[10px] text-shuttle/30 font-mono">esc to cancel · ⌘↵ to save</span>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className={[
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all',
              canSave && !saving
                ? 'bg-burnham text-gossip hover:bg-burnham/90 active:scale-[0.98]'
                : 'bg-mercury text-shuttle/40 cursor-not-allowed',
            ].join(' ')}
          >
            <Check size={12} />
            {saving ? 'Saving...' : 'Create milestone'}
          </button>
        </div>
      </div>
    </div>
  )
}
