import { useState, useEffect, useRef } from 'react'
import { X, Check, ArrowRight, Moon } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/types'

function cleanTodoText(text: string) {
  return text.replace(/\[\[mention:(person|company|opportunity):[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

interface EndOfDayDrawerProps {
  todos: Todo[]
  today: string
  userId: string
  dailyGoal?: string | null
  onClose: () => void
  onComplete: (result: { tomorrowGoal?: string; removedTodoIds: string[] }) => void
}

export default function EndOfDayDrawer({ todos, today, userId, dailyGoal, onClose, onComplete }: EndOfDayDrawerProps) {
  const pending = todos.filter(t => !t.completed)
  const [carry, setCarry] = useState<Record<string, boolean>>({})
  const [tomorrowObjective, setTomorrowObjective] = useState('')
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [goalDone, setGoalDone] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  useEffect(() => {
    // Default: carry all pending todos
    const init: Record<string, boolean> = {}
    pending.forEach(t => { init[t.id] = true })
    setCarry(init)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const tomorrow = (() => {
    const [y, m, day] = today.split('-').map(Number)
    const d = new Date(y, m - 1, day + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const handleClose = async () => {
    setSaving(true)
    let removedTodoIds: string[] = []
    try {
      // Carry selected todos to tomorrow
      const toCarry = pending.filter(t => carry[t.id]).map(t => t.id)
      if (toCarry.length > 0) {
        await supabase.from('todos').update({ date: tomorrow }).in('id', toCarry)
      }
      const toClear = pending.filter(t => !carry[t.id]).map(t => t.id)
      if (toClear.length > 0) {
        await supabase.from('todos').update({ date: null }).in('id', toClear)
      }
      removedTodoIds = [...toCarry, ...toClear]
      // Save tomorrow's objective as tomorrow's review.one_thing
      if (tomorrowObjective.trim()) {
        await supabase.from('reviews').upsert(
          { user_id: userId, date: tomorrow, one_thing: tomorrowObjective.trim() },
          { onConflict: 'user_id,date' }
        )
      }
      // Mark today as complete. one_thing_done is backed by a migration, but the
      // fallback keeps older databases from blocking the close-day flow.
      const reviewPayload = {
        user_id: userId,
        date: today,
        tomorrow_reviewed: true,
        ...(energyLevel !== null ? { energy_level: energyLevel } : {}),
        ...(goalDone !== null ? { one_thing_done: goalDone } : {}),
      }
      const { error } = await supabase.from('reviews').upsert(reviewPayload, { onConflict: 'user_id,date' })
      if (error && goalDone !== null) {
        const { one_thing_done: _ignored, ...fallback } = reviewPayload
        await supabase.from('reviews').upsert(fallback, { onConflict: 'user_id,date' })
      }
    } catch (err) {
      console.error('End of day save failed:', err)
    } finally {
      setSaving(false)
      onComplete({ tomorrowGoal: tomorrowObjective.trim() || undefined, removedTodoIds })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="td-drawer-bg" onClick={onClose} />

      {/* Drawer */}
      <div className="td-day-drawer close-day">
        {/* Header */}
        <div className="td-day-drawer-hd">
          <span className="icon"><Moon size={15} weight="fill" /></span>
          <div>
            <h2>Close the day</h2>
            <p>{dayLabel}</p>
          </div>
          <button className="close" onClick={onClose} title="Close"><X size={15} /></button>
        </div>

        {/* Content */}
        <div className="td-day-drawer-body">

          {dailyGoal && (
            <div className="td-day-block">
              <label>Today's goal</label>
              <p className="td-day-goal-text">{dailyGoal}</p>
              <div className="td-day-segment">
                <button className={goalDone === true ? 'on' : ''} onClick={() => setGoalDone(true)}>Done</button>
                <button className={goalDone === false ? 'on' : ''} onClick={() => setGoalDone(false)}>Not yet</button>
              </div>
            </div>
          )}

          {/* Pending todos */}
          {pending.length > 0 ? (
            <div className="td-day-block">
              <label>Carry to tomorrow?</label>
              <div className="td-day-carry">
                {pending.map(todo => (
                  <label key={todo.id}>
                    <input
                      type="checkbox"
                      checked={carry[todo.id] ?? false}
                      onChange={e => setCarry(prev => ({ ...prev, [todo.id]: e.target.checked }))}
                    />
                    <span className={carry[todo.id] ? '' : 'skip'}>
                      {cleanTodoText(todo.text)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="td-day-done">
              <Check size={16} weight="bold" />
              <p>All todos done today.</p>
            </div>
          )}

          {/* Energy level */}
          <div className="td-day-block">
            <label>Energy level</label>
            <div className="td-energy-grid">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setEnergyLevel(prev => prev === n ? null : n)}
                  className={energyLevel === n ? 'on' : ''}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Tomorrow's objective */}
          <div className="td-day-block">
            <label>Tomorrow's one thing</label>
            <input
              ref={inputRef}
              value={tomorrowObjective}
              onChange={e => setTomorrowObjective(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClose()}
              placeholder="What will make tomorrow a win?"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="td-day-drawer-foot">
          <button
            onClick={handleClose}
            disabled={saving}
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
