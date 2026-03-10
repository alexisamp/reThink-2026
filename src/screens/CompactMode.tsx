import { useState, useEffect } from 'react'
import { X, Check } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Habit, HabitLog, Milestone, Review } from '@/types'

export default function CompactMode() {
  const today = new Date().toISOString().split('T')[0]
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [habitsRes, logsRes, msRes, reviewRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).limit(5),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('milestones').select('*').eq('user_id', user.id)
          .eq('status', 'PENDING').order('target_date').limit(3),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      ])
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setMilestones(msRes.data ?? [])
      setReview(reviewRes.data)
    }
    load()
  }, [today])

  const toggleHabit = async (habitId: string) => {
    if (!userId) return
    const existing = logs.find(l => l.habit_id === habitId)
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      await supabase.from('habit_logs').update({ value: newVal }).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
    } else {
      const { data } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: 1 })
        .select().single()
      if (data) setLogs(prev => [...prev, data])
    }
  }

  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const doneCount = habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1)).length

  return (
    <div className="h-screen w-screen bg-white text-burnham font-sans flex flex-col select-none overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-mercury bg-[#F8F9F9]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-burnham tracking-widest">rT</span>
          <span className="text-[10px] text-shuttle">{weekday}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-shuttle">{doneCount}/{habits.length} habits</span>
          <button
            onClick={() => window.close()}
            className="text-mercury hover:text-shuttle transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Habits */}
        {habits.map(h => {
          const done = logs.some(l => l.habit_id === h.id && l.value === 1)
          return (
            <button
              key={h.id}
              onClick={() => toggleHabit(h.id)}
              className={`w-full flex items-center gap-3 py-2 px-3 rounded-lg border text-left transition-all ${
                done
                  ? 'bg-gossip/30 border-pastel/30 opacity-70'
                  : 'bg-white border-mercury hover:border-shuttle'
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                done ? 'bg-pastel border-pastel' : 'border-mercury'
              }`}>
                {done && <Check size={9} weight="bold" className="text-burnham" />}
              </div>
              <span className={`text-xs font-medium ${done ? 'text-shuttle line-through' : 'text-burnham'}`}>
                {h.text}
              </span>
              {h.default_time && (
                <span className="ml-auto text-[9px] font-mono text-shuttle/50">{h.default_time}</span>
              )}
            </button>
          )
        })}

        {/* Divider */}
        {milestones.length > 0 && <div className="h-px bg-mercury" />}

        {/* Milestones */}
        {milestones.map(m => (
          <div key={m.id} className="flex items-center gap-3 py-1.5 px-3">
            <div className="w-1.5 h-1.5 rounded-full bg-mercury shrink-0" />
            <span className="text-xs text-shuttle truncate flex-1">{m.text}</span>
            {m.target_date && (
              <span className="text-[9px] font-mono text-shuttle/50 shrink-0">
                {new Date(m.target_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        ))}

        {/* One Thing */}
        {review?.one_thing && (
          <>
            <div className="h-px bg-mercury" />
            <div className="px-3 py-1.5">
              <p className="text-[9px] uppercase tracking-widest text-shuttle/60 mb-1">One Thing</p>
              <p className="text-xs font-medium text-burnham">{review.one_thing}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
