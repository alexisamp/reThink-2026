import { useState, useEffect } from 'react'
import { ChatCircle, BookOpen, Baby } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

interface GoalKPIWidgetProps {
  userId: string
  weekStart: string   // YYYY-MM-DD
  /** Habit IDs that belong to the "Domingo" / family goal */
  domingoHabitIds?: string[]
  habitsLog: Array<{ habit_id: string; log_date: string; value: number }>
  weekDates: string[] // all dates Mon–today
  onConversationClick?: () => void
  onEnglishClick?: () => void
}

const CONV_TARGET = 6
const ENGLISH_TARGET_MIN = 300 // 5 hours

export function GoalKPIWidget({
  userId,
  weekStart,
  domingoHabitIds = [],
  habitsLog,
  weekDates,
  onConversationClick,
  onEnglishClick,
}: GoalKPIWidgetProps) {
  const [convCount, setConvCount] = useState(0)
  const [englishMin, setEnglishMin] = useState(0)

  // Fetch conversations this week from interactions
  useEffect(() => {
    if (!userId || !weekStart) return
    const weekEnd = (() => {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + 6)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    supabase
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('interaction_date', weekStart)
      .lte('interaction_date', weekEnd)
      .then(({ count }) => setConvCount(count ?? 0))
  }, [userId, weekStart])

  // Fetch English minutes this week (english_sessions table — created in Sprint 3)
  useEffect(() => {
    if (!userId || !weekStart) return
    const weekEnd = (() => {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + 6)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    supabase
      .from('english_sessions')
      .select('minutes')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .then(({ data }) => {
        if (data) setEnglishMin(data.reduce((s, r) => s + (r.minutes ?? 0), 0))
      })
  }, [userId, weekStart])

  // Compute Domingo adherence: % of (habit × day) combos completed this week
  const domingoAdherence = (() => {
    if (!domingoHabitIds.length || !weekDates.length) return null
    const total = domingoHabitIds.length * weekDates.length
    const done = habitsLog.filter(
      l => domingoHabitIds.includes(l.habit_id) && weekDates.includes(l.log_date) && l.value > 0
    ).length
    return total > 0 ? Math.round((done / total) * 100) : null
  })()

  const convPct = Math.min(100, Math.round((convCount / CONV_TARGET) * 100))
  const englishHours = Math.floor(englishMin / 60)
  const englishMinRem = englishMin % 60
  const englishPct = Math.min(100, Math.round((englishMin / ENGLISH_TARGET_MIN) * 100))
  const englishLabel = englishMin > 0
    ? `${englishHours > 0 ? `${englishHours}h ` : ''}${englishMinRem > 0 ? `${englishMinRem}m` : ''}`
    : '0m'

  return (
    <div className="flex gap-3 mb-6">
      {/* Conversations */}
      <button
        onClick={onConversationClick}
        className="flex-1 border border-mercury rounded-xl p-3 text-left hover:border-burnham/20 hover:bg-gossip/10 transition-all group"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <ChatCircle size={13} className="text-shuttle shrink-0" />
          <span className="text-[10px] font-semibold text-shuttle uppercase tracking-wider">Revenue &amp; Network</span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-xl font-semibold text-burnham tabular-nums">{convCount}</span>
          <span className="text-xs text-shuttle/50">/ {CONV_TARGET} convos</span>
        </div>
        <div className="w-full bg-mercury rounded-full h-1">
          <div className="h-1 rounded-full bg-pastel transition-all" style={{ width: `${convPct}%` }} />
        </div>
        <p className="text-[9px] text-shuttle/40 mt-1.5 font-mono">this week</p>
      </button>

      {/* English */}
      <button
        onClick={onEnglishClick}
        className="flex-1 border border-mercury rounded-xl p-3 text-left hover:border-burnham/20 hover:bg-gossip/10 transition-all group"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen size={13} className="text-shuttle shrink-0" />
          <span className="text-[10px] font-semibold text-shuttle uppercase tracking-wider">English</span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-xl font-semibold text-burnham tabular-nums">{englishLabel}</span>
          <span className="text-xs text-shuttle/50">/ 5h</span>
        </div>
        <div className="w-full bg-mercury rounded-full h-1">
          <div className="h-1 rounded-full bg-pastel transition-all" style={{ width: `${englishPct}%` }} />
        </div>
        <p className="text-[9px] text-shuttle/40 mt-1.5 font-mono">this week</p>
      </button>

      {/* Domingo */}
      <div className="flex-1 border border-mercury rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Baby size={13} className="text-shuttle shrink-0" />
          <span className="text-[10px] font-semibold text-shuttle uppercase tracking-wider">Domingo</span>
        </div>
        {domingoAdherence !== null ? (
          <>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-xl font-semibold text-burnham tabular-nums">{domingoAdherence}%</span>
              <span className="text-xs text-shuttle/50">habits</span>
            </div>
            <div className="w-full bg-mercury rounded-full h-1">
              <div className="h-1 rounded-full bg-pastel transition-all" style={{ width: `${domingoAdherence}%` }} />
            </div>
          </>
        ) : (
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xl font-semibold text-burnham/30">—</span>
          </div>
        )}
        <p className="text-[9px] text-shuttle/40 mt-1.5 font-mono">this week</p>
      </div>
    </div>
  )
}
