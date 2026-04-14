/**
 * WeeklyPulse — minimal 7-dot weekly habit strip.
 * Shows each configured weekly goal with Mon–Sun dots and current count.
 * Reads from weekly_habits + weekly_habit_logs + integration sources.
 */
import { useState, useEffect, useCallback } from 'react'
import { GearSix } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { WeeklyHabit, WeeklyHabitLog } from '@/types'

interface WeeklyPulseProps {
  userId: string
  weekDates: string[]   // 7 dates Mon–Sun YYYY-MM-DD
  onSettingsClick?: () => void
}

interface HabitData {
  habit: WeeklyHabit
  logs: WeeklyHabitLog[]
  /** auto-sourced total (from interactions / english_sessions) */
  autoTotal: number
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function displayTotal(hd: HabitData): number {
  const manualTotal = hd.logs.reduce((s, l) => s + l.quantity, 0)
  return hd.habit.integration_source === 'manual'
    ? manualTotal
    : hd.autoTotal + manualTotal
}

function displayLabel(habit: WeeklyHabit, total: number): string {
  if (habit.type === 'minutes' || habit.type === 'hours') {
    const h = Math.floor(total / 60)
    const m = total % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${total}m`
  }
  return String(total)
}

function targetLabel(habit: WeeklyHabit): string {
  if (habit.type === 'minutes' || habit.type === 'hours') {
    const h = Math.floor(habit.weekly_target / 60)
    const m = habit.weekly_target % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${habit.weekly_target}m`
  }
  return String(habit.weekly_target)
}

export function WeeklyPulse({ userId, weekDates, onSettingsClick }: WeeklyPulseProps) {
  const [habits, setHabits] = useState<HabitData[]>([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null) // habitId being logged

  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const load = useCallback(async () => {
    if (!userId || !weekStart) return
    setLoading(true)

    const { data: habitsData } = await supabase
      .from('weekly_habits')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('position')

    if (!habitsData || habitsData.length === 0) {
      setHabits([])
      setLoading(false)
      return
    }

    const [logsRes, interactionsRes, englishRes] = await Promise.all([
      supabase.from('weekly_habit_logs').select('*').eq('user_id', userId)
        .gte('log_date', weekStart).lte('log_date', weekEnd),
      supabase.from('interactions').select('id, interaction_date').eq('user_id', userId)
        .gte('interaction_date', weekStart).lte('interaction_date', weekEnd),
      supabase.from('english_sessions').select('minutes, date').eq('user_id', userId)
        .gte('date', weekStart).lte('date', weekEnd),
    ])

    const allLogs = (logsRes.data ?? []) as WeeklyHabitLog[]
    const interactionsByDate = new Map<string, number>()
    ;(interactionsRes.data ?? []).forEach(i => {
      interactionsByDate.set(i.interaction_date, (interactionsByDate.get(i.interaction_date) ?? 0) + 1)
    })
    const totalInteractions = [...interactionsByDate.values()].reduce((s, v) => s + v, 0)
    const totalEnglishMin = (englishRes.data ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0)

    setHabits(habitsData.map(h => ({
      habit: h as WeeklyHabit,
      logs: allLogs.filter(l => l.habit_id === h.id),
      autoTotal: h.integration_source === 'interactions' ? totalInteractions
        : h.integration_source === 'english_sessions' ? totalEnglishMin
        : 0,
    })))
    setLoading(false)
  }, [userId, weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  const toggleDay = async (hd: HabitData, dateStr: string) => {
    if (hd.habit.integration_source !== 'manual') return // auto-sourced, read-only
    setLogging(hd.habit.id + dateStr)

    const existing = hd.logs.find(l => l.log_date === dateStr)
    if (existing) {
      await supabase.from('weekly_habit_logs').delete().eq('id', existing.id)
    } else {
      await supabase.from('weekly_habit_logs').upsert({
        user_id: userId,
        habit_id: hd.habit.id,
        log_date: dateStr,
        quantity: 1,
      }, { onConflict: 'habit_id,log_date' })
    }
    setLogging(null)
    load()
  }

  if (loading) return <div className="h-[72px]" />

  if (habits.length === 0) return (
    <div className="flex items-center gap-2 mb-6 text-[11px] text-shuttle/40">
      <span>No weekly goals configured</span>
      {onSettingsClick && (
        <button onClick={onSettingsClick} className="hover:text-burnham transition-colors">
          <GearSix size={12} />
        </button>
      )}
    </div>
  )

  const todayStr = weekDates.find(d => {
    const now = new Date()
    return d === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-medium text-shuttle/30 uppercase tracking-widest">This week</span>
        {onSettingsClick && (
          <button onClick={onSettingsClick} className="text-shuttle/20 hover:text-shuttle/40 transition-colors">
            <GearSix size={10} />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {habits.map(hd => {
          const total = displayTotal(hd)
          const pct = Math.min(1, total / hd.habit.weekly_target)
          const done = pct >= 1
          const isAuto = hd.habit.integration_source !== 'manual'

          return (
            <div key={hd.habit.id} className="flex items-center gap-2.5">
              {/* Emoji + name */}
              <div className="flex items-center gap-1 w-[110px] shrink-0">
                {hd.habit.emoji && (
                  <span className="text-[11px] leading-none" style={{ filter: 'grayscale(0.5)' }}>
                    {hd.habit.emoji}
                  </span>
                )}
                <span className="text-[11px] text-shuttle/50 truncate font-normal">
                  {hd.habit.name}
                </span>
              </div>

              {/* 7 dots — Mon to Sun */}
              <div className="flex items-center gap-[3px]">
                {weekDates.map((dateStr, i) => {
                  const hasLog = hd.logs.some(l => l.log_date === dateStr)
                  const filled = hasLog
                  const isToday = dateStr === todayStr
                  const isFuture = todayStr && dateStr > todayStr
                  const isActive = logging === hd.habit.id + dateStr

                  return (
                    <button
                      key={dateStr}
                      onClick={() => toggleDay(hd, dateStr)}
                      disabled={isAuto || isActive || !!isFuture}
                      title={`${DAY_LABELS[i]}${isAuto ? ' (auto)' : ''}`}
                      className={[
                        'w-[11px] h-[11px] rounded-[2px] transition-all duration-150',
                        isAuto ? 'cursor-default' : isFuture ? 'cursor-default' : 'hover:opacity-80 cursor-pointer',
                        filled
                          ? done ? 'bg-burnham/70' : 'bg-pastel/60'
                          : isFuture ? 'bg-mercury/20' : 'bg-mercury/50',
                        isToday && !filled ? 'ring-1 ring-shuttle/20' : '',
                        isActive ? 'opacity-40' : '',
                      ].join(' ')}
                    />
                  )
                })}
              </div>

              {/* Count / target */}
              <div className="flex items-baseline gap-0.5">
                <span className={`text-[11px] tabular-nums font-medium ${done ? 'text-shuttle/60' : 'text-shuttle/40'}`}>
                  {displayLabel(hd.habit, total)}
                </span>
                <span className="text-[9px] text-shuttle/25 font-mono">/{targetLabel(hd.habit)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
