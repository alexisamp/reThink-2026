import { useState, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Habit, Goal } from '@/types'

interface HabitEditModalProps {
  habit: Habit | null
  goals: Pick<Goal, 'id' | 'text' | 'alias'>[]
  onClose: () => void
  onUpdate: (updated: Habit) => void
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function HabitEditModal({ habit, goals, onClose, onUpdate }: HabitEditModalProps) {
  const [text, setText] = useState('')
  const [alias, setAlias] = useState('')
  const [emoji, setEmoji] = useState('')
  const [habitType, setHabitType] = useState<'BINARY' | 'QUANTIFIED'>('BINARY')
  const [dailyTarget, setDailyTarget] = useState('')
  const [unit, setUnit] = useState('')
  const [goalId, setGoalId] = useState('')
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null)
  const [tracksOutreach, setTracksOutreach] = useState<'networking' | 'prospecting' | ''>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!habit) return
    setText(habit.text)
    setAlias(habit.alias ?? '')
    setEmoji(habit.emoji ?? '')
    setHabitType(habit.habit_type ?? 'BINARY')
    setDailyTarget(habit.daily_target?.toString() ?? '')
    setUnit(habit.unit ?? '')
    setGoalId(habit.goal_id ?? '')
    setScheduledDays(habit.scheduled_days ?? null)
    setTracksOutreach(habit.tracks_outreach ?? '')
  }, [habit?.id])

  if (!habit) return null

  const toggleDay = (day: number) => {
    setScheduledDays(prev => {
      if (!prev) return [day]
      if (prev.includes(day)) {
        const next = prev.filter(d => d !== day)
        return next.length === 0 ? null : next
      }
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const patch = {
      text: text.trim(),
      alias: alias.trim() || null,
      emoji: emoji.trim() || null,
      habit_type: habitType,
      daily_target: habitType === 'QUANTIFIED' && dailyTarget ? parseFloat(dailyTarget) : null,
      unit: habitType === 'QUANTIFIED' ? (unit.trim() || null) : null,
      goal_id: goalId || null,
      scheduled_days: scheduledDays,
      tracks_outreach: tracksOutreach || null,
    }
    const { data } = await supabase.from('habits').update(patch).eq('id', habit.id).select().single()
    if (data) onUpdate(data as Habit)
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[220] bg-black/15 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 z-[225] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >

        <div className="flex items-center justify-between px-5 py-4 border-b border-mercury shrink-0">
          <p className="text-[10px] font-semibold text-burnham uppercase tracking-wide">Edit habit</p>
          <button onClick={onClose} className="text-shuttle/30 hover:text-shuttle transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Habit name</label>
            <input value={text} onChange={e => setText(e.target.value)}
              className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Alias (≤20 chars)</label>
              <input value={alias} onChange={e => setAlias(e.target.value.slice(0, 20))} maxLength={20}
                className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                placeholder="gym, read…" />
            </div>
            <div className="w-20">
              <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Emoji</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)}
                className={`w-full text-[11px] text-center border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors ${!emoji ? 'opacity-60' : ''}`}
                style={emoji ? { filter: 'grayscale(0.5)' } : undefined}
                placeholder="🏋️" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-2">Type</label>
            <div className="flex gap-2">
              {(['BINARY', 'QUANTIFIED'] as const).map(t => (
                <button key={t} onClick={() => setHabitType(t)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
                    habitType === t ? 'bg-burnham text-gossip border-burnham' : 'bg-white border border-mercury text-shuttle'
                  }`}>
                  {t === 'BINARY' ? 'Yes / No' : 'Quantified'}
                </button>
              ))}
            </div>
          </div>

          {habitType === 'QUANTIFIED' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Daily target</label>
                <input type="number" min={0} value={dailyTarget} onChange={e => setDailyTarget(e.target.value)}
                  className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                  placeholder="8" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Unit</label>
                <input value={unit} onChange={e => setUnit(e.target.value)}
                  className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                  placeholder="glasses, km, pages…" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Goal</label>
            <select value={goalId} onChange={e => setGoalId(e.target.value)}
              className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors bg-white">
              <option value="">No goal</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.alias ?? g.text}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">Tracks outreach</label>
            <select value={tracksOutreach} onChange={e => setTracksOutreach(e.target.value as 'networking' | 'prospecting' | '')}
              className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors bg-white">
              <option value="">None</option>
              <option value="networking">People talked to today</option>
              <option value="prospecting">New contacts mapped</option>
            </select>
            <p className="text-[9px] text-shuttle/30 mt-1">Auto-increments this habit when a contact is logged in Outreach</p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-2">
              Schedule
              <span className="normal-case text-shuttle/30 ml-2">empty = every day</span>
            </label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, day) => (
                <button key={day} onClick={() => toggleDay(day)}
                  title={DAY_NAMES[day]}
                  className={`w-6 h-6 rounded text-[10px] font-mono font-semibold transition-colors ${
                    !scheduledDays || scheduledDays.includes(day)
                      ? 'bg-burnham text-gossip'
                      : 'bg-mercury/40 text-shuttle/50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-shuttle/30 mt-1 font-mono">
              {scheduledDays ? `${scheduledDays.length} day${scheduledDays.length !== 1 ? 's' : ''} / week` : 'Every day'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-mercury/50 shrink-0">
          <button onClick={onClose} className="text-[10px] text-shuttle/50 hover:text-shuttle transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 bg-burnham text-gossip text-[10px] font-semibold rounded-lg hover:bg-burnham/80 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
