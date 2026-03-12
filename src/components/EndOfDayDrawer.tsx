import { useState, useEffect, useRef } from 'react'
import { X, Check, ArrowRight, Moon } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/types'

interface EndOfDayDrawerProps {
  todos: Todo[]
  today: string
  userId: string
  onClose: () => void
  onComplete: () => void
}

export default function EndOfDayDrawer({ todos, today, userId, onClose, onComplete }: EndOfDayDrawerProps) {
  const pending = todos.filter(t => !t.completed)
  const [carry, setCarry] = useState<Record<string, boolean>>({})
  const [tomorrowObjective, setTomorrowObjective] = useState('')
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Default: carry all pending todos
    const init: Record<string, boolean> = {}
    pending.forEach(t => { init[t.id] = true })
    setCarry(init)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const tomorrow = (() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()

  const handleClose = async () => {
    setSaving(true)
    try {
      // Carry selected todos to tomorrow
      const toCarry = pending.filter(t => carry[t.id]).map(t => t.id)
      if (toCarry.length > 0) {
        await supabase.from('todos').update({ date: tomorrow }).in('id', toCarry)
      }
      // Save tomorrow's objective as tomorrow's review.one_thing
      if (tomorrowObjective.trim()) {
        await supabase.from('reviews').upsert(
          { user_id: userId, date: tomorrow, one_thing: tomorrowObjective.trim() },
          { onConflict: 'user_id,date' }
        )
      }
      // Mark today as complete (tomorrow_reviewed) + save energy level
      await supabase.from('reviews').upsert(
        { user_id: userId, date: today, tomorrow_reviewed: true, ...(energyLevel !== null ? { energy_level: energyLevel } : {}) },
        { onConflict: 'user_id,date' }
      )
    } catch (err) {
      console.error('End of day save failed:', err)
    } finally {
      setSaving(false)
      onComplete()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[170] bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-[180] w-full max-w-sm bg-white border-l border-mercury flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-mercury flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-burnham" weight="fill" />
            <h2 className="text-sm font-semibold text-burnham">Closing the day</h2>
          </div>
          <button
            onClick={onClose}
            className="text-shuttle hover:text-burnham transition-colors p-1 rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Pending todos */}
          {pending.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 mb-3">
                Carry to tomorrow?
              </p>
              <div className="space-y-2">
                {pending.map(todo => (
                  <label key={todo.id} className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={carry[todo.id] ?? false}
                      onChange={e => setCarry(prev => ({ ...prev, [todo.id]: e.target.checked }))}
                      className="custom-checkbox mt-0.5 shrink-0"
                    />
                    <span className={`text-sm transition-colors ${carry[todo.id] ? 'text-burnham' : 'text-shuttle line-through'}`}>
                      {todo.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-pastel">
              <Check size={16} weight="bold" />
              <p className="text-sm font-medium text-burnham">All todos done today!</p>
            </div>
          )}

          {/* Energy level */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 mb-3">
              Today's energy level
            </p>
            <div className="grid grid-cols-10 gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setEnergyLevel(prev => prev === n ? null : n)}
                  className={`h-7 rounded text-[9px] font-medium transition-all ${
                    energyLevel === n
                      ? 'bg-gossip border border-pastel text-burnham font-bold'
                      : 'bg-white border border-mercury text-shuttle hover:border-pastel'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Tomorrow's objective */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 mb-2">
              Tomorrow's one thing
            </p>
            <input
              ref={inputRef}
              type="text"
              value={tomorrowObjective}
              onChange={e => setTomorrowObjective(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClose()}
              placeholder="What will make tomorrow a win?"
              className="w-full text-sm text-burnham border-b border-mercury focus:border-burnham outline-none bg-transparent pb-1 placeholder-mercury transition-colors"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-mercury">
          <button
            onClick={handleClose}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 disabled:opacity-60 text-white py-3 rounded-lg text-sm font-medium transition-all"
          >
            {saving ? (
              <span>Saving...</span>
            ) : (
              <>
                <span>Close the day</span>
                <ArrowRight size={14} weight="bold" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
