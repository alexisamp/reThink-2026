import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Sun, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

interface DayStartDrawerProps {
  today: string
  userId: string
  initialGoal?: string | null
  onClose: () => void
  onSave: (goal: string) => void
}

export default function DayStartDrawer({ today, userId, initialGoal, onClose, onSave }: DayStartDrawerProps) {
  const [goal, setGoal] = useState(initialGoal ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setGoal(initialGoal ?? '')
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [initialGoal])

  const save = async () => {
    const next = goal.trim()
    if (!next) return
    setSaving(true)
    await supabase.from('reviews').upsert(
      { user_id: userId, date: today, one_thing: next },
      { onConflict: 'user_id,date' }
    )
    setSaving(false)
    onSave(next)
  }

  return (
    <>
      <div className="td-drawer-bg" onClick={onClose} />
      <div className="td-day-drawer">
        <div className="td-day-drawer-hd">
          <span className="icon"><Sun size={15} weight="fill" /></span>
          <div>
            <h2>Start the day</h2>
            <p>Set the one thing that makes today count.</p>
          </div>
          <button className="close" onClick={onClose} title="Close"><X size={15} /></button>
        </div>
        <div className="td-day-drawer-body">
          <label>Today's goal</label>
          <input
            ref={inputRef}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
            placeholder="What needs to be true by tonight?"
          />
        </div>
        <div className="td-day-drawer-foot">
          <button onClick={save} disabled={saving || !goal.trim()}>
            {saving ? 'Saving…' : 'Set goal'}
            {!saving && <ArrowRight size={13} weight="bold" />}
          </button>
        </div>
      </div>
    </>
  )
}
