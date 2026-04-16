/**
 * MilestoneCapture — keyboard-first overlay for creating milestones.
 * Triggered by `/milestone` in the quick-add input.
 * Creates a milestone + milestone_todos in one flow.
 * Features: smart date chips, per-todo "add to today" toggle.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Check, Flag, CalendarBlank } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/types'

interface MilestoneCaptureProps {
  userId: string
  today: string // YYYY-MM-DD
  goals: Pick<Goal, 'id' | 'text' | 'alias' | 'emoji'>[]
  onClose: () => void
  onCreated: (milestoneId: string, todayTodoTexts: string[]) => void
}

function addDays(base: string, n: number): string {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextMonday(base: string): string {
  const d = new Date(base + 'T12:00:00')
  const day = d.getDay() // 0=Sun
  const daysUntil = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntil)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatChipDate(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, 1)) return 'Tomorrow'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MilestoneCapture({ userId, today, goals, onClose, onCreated }: MilestoneCaptureProps) {
  const [name, setName] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [customDateOpen, setCustomDateOpen] = useState(false)
  const [goalId, setGoalId] = useState<string>('')
  const [todos, setTodos] = useState<{ text: string; addToday: boolean }[]>([
    { text: '', addToday: false },
    { text: '', addToday: false },
  ])
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const DATE_CHIPS = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: '+3d', value: addDays(today, 3) },
    { label: 'Next week', value: nextMonday(today) },
  ]

  useEffect(() => {
    nameRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const addTodoRow = useCallback(() => {
    setTodos(prev => [...prev, { text: '', addToday: false }])
  }, [])

  const updateTodo = (i: number, text: string) => {
    setTodos(prev => prev.map((t, idx) => idx === i ? { ...t, text } : t))
  }

  const toggleAddToday = (i: number) => {
    setTodos(prev => prev.map((t, idx) => idx === i ? { ...t, addToday: !t.addToday } : t))
  }

  const removeTodo = (i: number) => {
    setTodos(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleTodoKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i === todos.length - 1) {
        addTodoRow()
        setTimeout(() => document.getElementById(`mc-todo-${i + 1}`)?.focus(), 10)
      } else {
        document.getElementById(`mc-todo-${i + 1}`)?.focus()
      }
    }
    if (e.key === 'Backspace' && todos[i].text === '' && todos.length > 1) {
      e.preventDefault()
      removeTodo(i)
      setTimeout(() => document.getElementById(`mc-todo-${i - 1}`)?.focus(), 10)
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
          target_date: selectedDate || null,
          status: 'PENDING',
        })
        .select('id')
        .single()

      if (error || !ms) throw error

      // Save ALL non-empty todos directly into the `todos` table (linked to this milestone)
      const filteredTodos = todos.filter(t => t.text.trim().length > 0)
      if (filteredTodos.length > 0) {
        await supabase.from('todos').insert(
          filteredTodos.map((t, i) => ({
            user_id: userId,
            milestone_id: ms.id,
            text: t.text.trim(),
            sort_order: i,
            date: t.addToday ? today : null,
            effort: 'NORMAL',
            completed: false,
          }))
        )
      }

      // Pass empty array — todos already saved above; Today.tsx just refreshes
      onCreated(ms.id, [])
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
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="What's the milestone?"
            className="w-full text-[15px] font-medium text-burnham placeholder-shuttle/30 bg-transparent border-0 border-b border-mercury/60 focus:border-burnham/40 focus:outline-none pb-2 transition-colors"
          />

          {/* Goal picker */}
          {goals.length > 0 && (
            <select
              value={goalId}
              onChange={e => setGoalId(e.target.value)}
              className="w-full text-[12px] text-shuttle/70 bg-transparent border border-mercury/50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-burnham/30 cursor-pointer"
            >
              <option value="">No goal link</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>
                  {g.emoji ? `${g.emoji} ` : ''}{g.alias ?? g.text.slice(0, 40)}
                </option>
              ))}
            </select>
          )}

          {/* Date chips */}
          <div>
            <p className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest mb-2">Target date</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Clear chip */}
              {selectedDate && (
                <button
                  onClick={() => { setSelectedDate(''); setCustomDateOpen(false) }}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-red-200 text-red-400 hover:border-red-300 transition-colors"
                >
                  <X size={9} />
                  {formatChipDate(selectedDate, today)}
                </button>
              )}
              {!selectedDate && DATE_CHIPS.map(chip => (
                <button
                  key={chip.value}
                  onClick={() => { setSelectedDate(chip.value); setCustomDateOpen(false) }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-mercury text-shuttle/60 hover:border-burnham/30 hover:text-burnham transition-colors"
                >
                  {chip.label}
                </button>
              ))}
              {!selectedDate && (
                <button
                  onClick={() => setCustomDateOpen(v => !v)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-mercury text-shuttle/50 hover:border-burnham/30 hover:text-burnham transition-colors"
                >
                  <CalendarBlank size={10} />
                  Custom
                </button>
              )}
            </div>
            {customDateOpen && (
              <input
                type="date"
                autoFocus
                className="mt-2 text-[12px] text-shuttle border border-mercury rounded-lg px-3 py-1.5 focus:outline-none focus:border-burnham/30 bg-white w-full"
                onChange={e => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value)
                    setCustomDateOpen(false)
                  }
                }}
              />
            )}
          </div>

          {/* Todos */}
          <div>
            <p className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest mb-2">
              Tasks <span className="normal-case font-normal opacity-60">· toggle + to add to today</span>
            </p>
            <div className="space-y-1">
              {todos.map((t, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <div className="w-3 h-3 rounded border border-mercury/70 shrink-0" />
                  <input
                    id={`mc-todo-${i}`}
                    value={t.text}
                    onChange={e => updateTodo(i, e.target.value)}
                    onKeyDown={e => handleTodoKeyDown(e, i)}
                    placeholder={i === 0 ? 'First task...' : i === 1 ? 'Second task...' : 'Another task...'}
                    className="flex-1 text-[13px] text-burnham placeholder-shuttle/25 bg-transparent border-0 focus:outline-none"
                  />
                  {/* Add to today toggle */}
                  {t.text.trim().length > 0 && (
                    <button
                      onClick={() => toggleAddToday(i)}
                      title={t.addToday ? 'Remove from today' : 'Add to today'}
                      className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded transition-all ${
                        t.addToday
                          ? 'bg-gossip text-burnham border border-pastel/50'
                          : 'border border-mercury/50 text-shuttle/30 hover:border-shuttle/30 hover:text-shuttle/50'
                      }`}
                    >
                      +today
                    </button>
                  )}
                  {todos.length > 1 && t.text === '' && (
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
          <span className="text-[10px] text-shuttle/30 font-mono">esc · ⌘↵ to save</span>
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
