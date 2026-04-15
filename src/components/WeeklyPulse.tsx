/**
 * WeeklyPulse — minimal 7-dot weekly habit strip.
 * Shows each configured weekly goal with Mon–Sun dots and current count.
 * Reads from weekly_habits + weekly_habit_logs + integration sources.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GearSix, ArrowRight } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { WeeklyHabit, WeeklyHabitLog } from '@/types'

interface WeeklyPulseProps {
  userId: string
  weekDates: string[]   // 7 dates Mon–Sun YYYY-MM-DD
  onSettingsClick?: () => void
  compact?: boolean     // strip header/history, render inline
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

export function WeeklyPulse({ userId, weekDates, onSettingsClick, compact }: WeeklyPulseProps) {
  const [habits, setHabits] = useState<HabitData[]>([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null) // habitId being logged
  const navigate = useNavigate()

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

  if (loading) return <div className={compact ? 'h-10' : 'h-[72px]'} />

  if (habits.length === 0) {
    if (compact) return (
      <span className="text-[10px] text-shuttle/30">No goals yet</span>
    )
    return (
      <div className="mb-4 py-3 px-3 border border-dashed border-mercury rounded-xl flex items-center justify-between">
        <span className="text-[11px] text-shuttle/40">No weekly goals yet</span>
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="flex items-center gap-1 text-[11px] text-shuttle/50 hover:text-burnham transition-colors font-medium"
          >
            <GearSix size={12} />
            Configure
          </button>
        )}
      </div>
    )
  }

  const todayStr = weekDates.find(d => {
    const now = new Date()
    return d === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  return (
    <div className={compact ? '' : 'mb-4'}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-medium text-shuttle/30 uppercase tracking-widest">This week</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/year?layer=weekly')}
              className="flex items-center gap-0.5 text-[9px] text-shuttle/25 hover:text-shuttle/50 transition-colors font-mono"
              title="View history"
            >
              history <ArrowRight size={9} />
            </button>
            {onSettingsClick && (
              <button onClick={onSettingsClick} className="text-shuttle/20 hover:text-shuttle/50 transition-colors" title="Manage goals">
                <GearSix size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'space-y-1'}>
        {habits.map(hd => {
          const total = displayTotal(hd)
          const pct = Math.min(1, total / hd.habit.weekly_target)
          const done = pct >= 1
          const isAuto = hd.habit.integration_source !== 'manual'

          if (compact) {
            /* ── Compact widget mode: 2-line layout, progress bar, no dots ── */
            return (
              <div key={hd.habit.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {hd.habit.emoji && (
                      <span className="text-[12px] leading-none shrink-0">
                        {hd.habit.emoji}
                      </span>
                    )}
                    <span className="text-[11px] text-shuttle/55 font-normal leading-none">
                      {hd.habit.name}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-[2px] shrink-0">
                    <span className={`text-[11px] tabular-nums font-medium leading-none ${done ? 'text-burnham/60' : 'text-shuttle/50'}`}>
                      {displayLabel(hd.habit, total)}
                    </span>
                    <span className="text-[9px] text-shuttle/25 font-mono">/{targetLabel(hd.habit)}</span>
                  </div>
                </div>
                {/* Thin progress bar */}
                <div className="w-full h-[3px] bg-mercury/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pct * 100, pct > 0 ? 4 : 0)}%`,
                      backgroundColor: done ? '#003720' : '#79D65E',
                      opacity: done ? 0.7 : 0.8,
                    }}
                  />
                </div>
              </div>
            )
          }

          /* ── Normal strip mode: dots layout ── */
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
