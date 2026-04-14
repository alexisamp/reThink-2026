import { useState, useEffect } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { HabitLog, Habit, Milestone, Review, WeeklyHabit, WeeklyHabitLog } from '@/types'

function getDaysInYear(year: number): Date[] {
  const days: Date[] = []
  const end = new Date(year, 11, 31)
  for (let d = new Date(year, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

type Layer = 'habits' | 'energy' | 'weekly'

export default function YearAtAGlance() {
  const { user } = useAuth()
  const userId = user?.id
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabit[]>([])
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyHabitLog[]>([])
  const [layer, setLayer] = useState<Layer>('weekly')
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      setLoading(true)
      const [habitsRes, logsRes, reviewsRes, milestonesRes, weeklyHabitsRes, weeklyLogsRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', userId).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', userId)
          .gte('log_date', `${year}-01-01`).lte('log_date', `${year}-12-31`),
        supabase.from('reviews').select('date, energy_level, one_thing').eq('user_id', userId)
          .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
        supabase.from('milestones').select('*').eq('user_id', userId)
          .eq('status', 'COMPLETE').gte('target_date', `${year}-01-01`).lte('target_date', `${year}-12-31`),
        supabase.from('weekly_habits').select('*').eq('user_id', userId).eq('is_active', true).order('position'),
        supabase.from('weekly_habit_logs').select('*').eq('user_id', userId)
          .gte('log_date', `${year}-01-01`).lte('log_date', `${year}-12-31`),
      ])
      setHabits(habitsRes.data ?? [])
      setHabitLogs(logsRes.data ?? [])
      setReviews((reviewsRes.data ?? []) as Review[])
      setMilestones(milestonesRes.data ?? [])
      setWeeklyHabits((weeklyHabitsRes.data ?? []) as WeeklyHabit[])
      setWeeklyLogs((weeklyLogsRes.data ?? []) as WeeklyHabitLog[])
      setLoading(false)
    }
    load()
  }, [userId, year])

  const days = getDaysInYear(year)
  const totalHabits = habits.length

  // Build maps for O(1) lookup
  const logMap = new Map<string, number>()
  habitLogs.forEach(l => {
    if (l.value === 1) {
      logMap.set(l.log_date, (logMap.get(l.log_date) ?? 0) + 1)
    }
  })

  const energyMap = new Map<string, number>()
  const oneThingMap = new Map<string, string>()
  reviews.forEach(r => {
    if (r.date && r.energy_level) energyMap.set(r.date, r.energy_level)
    if (r.date && r.one_thing) oneThingMap.set(r.date, r.one_thing)
  })

  const milestoneSet = new Set<string>()
  milestones.forEach(m => { if (m.target_date) milestoneSet.add(m.target_date.split('T')[0]) })

  function getCellColor(date: string): string {
    const today = toISO(new Date())
    if (date > today) return 'bg-[#EBEDF0]'

    if (layer === 'energy') {
      const e = energyMap.get(date)
      if (!e) return 'bg-[#EBEDF0]'
      if (e >= 9) return 'bg-blue-600'
      if (e >= 7) return 'bg-blue-400'
      if (e >= 5) return 'bg-blue-200'
      return 'bg-blue-100'
    }

    // habits layer
    const count = logMap.get(date) ?? 0
    if (totalHabits === 0 || count === 0) return 'bg-[#EBEDF0]'
    const ratio = count / totalHabits
    if (ratio >= 0.9) return 'bg-[#216E39]'
    if (ratio >= 0.6) return 'bg-[#30A14E]'
    if (ratio >= 0.3) return 'bg-[#9BE9A8]'
    return 'bg-[#CAEBBE]'
  }

  // Group days by month
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const months: { name: string; days: Date[] }[] = []
  for (let m = 0; m < 12; m++) {
    months.push({
      name: MONTH_NAMES[m],
      days: days.filter(d => d.getMonth() === m)
    })
  }

  // Summary stats
  const totalHabitDays = [...logMap.values()].filter(v => v > 0).length
  const reviewsWithEnergy = reviews.filter(r => r.energy_level)
  const avgEnergy = reviewsWithEnergy.length > 0
    ? (reviewsWithEnergy.reduce((sum, r) => sum + (r.energy_level ?? 0), 0) / reviewsWithEnergy.length).toFixed(1)
    : '\u2014'

  const tooltipData = tooltip ? {
    habitCount: logMap.get(tooltip.date) ?? 0,
    energy: energyMap.get(tooltip.date),
    oneThing: oneThingMap.get(tooltip.date),
    isMilestone: milestoneSet.has(tooltip.date),
  } : null

  return (
    <div className="h-screen bg-white text-burnham font-sans flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-16 py-12 pb-28">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-shuttle mb-1">Year at a Glance</p>
              <h1 className="text-2xl font-semibold text-burnham">{year}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded hover:bg-mercury/30 text-shuttle hover:text-burnham">
                <CaretLeft size={14} />
              </button>
              <span className="text-sm font-mono text-burnham">{year}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                disabled={year >= currentYear}
                className="p-1.5 rounded hover:bg-mercury/30 text-shuttle hover:text-burnham disabled:opacity-30"
              >
                <CaretRight size={14} />
              </button>
            </div>
          </div>

          {/* Layer toggle */}
          <div className="flex gap-2 flex-wrap">
            {(['weekly', 'habits', 'energy'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={[
                  'text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border transition-colors',
                  layer === l ? 'border-burnham text-burnham' : 'border-mercury text-shuttle hover:border-burnham/30',
                ].join(' ')}
              >
                {l === 'habits' ? 'Habits' : l === 'energy' ? 'Energy' : 'Weekly Goals'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-shuttle">Loading...</p>
          ) : layer === 'weekly' ? (
            /* ── Weekly Goals — one row per habit, 52 weeks ── */
            <div className="space-y-6">
              {weeklyHabits.length === 0 ? (
                <p className="text-[12px] text-shuttle/40">No weekly goals configured yet.</p>
              ) : weeklyHabits.map(wh => {
                // Build week-by-week totals for this habit
                const logsByHabit = weeklyLogs.filter(l => l.habit_id === wh.id)
                // Get all Monday dates for the year
                const weeks: { weekStart: string; weekEnd: string; pct: number }[] = []
                const jan1 = new Date(year, 0, 1)
                // Find first Monday on or before Jan 1
                const firstMon = new Date(jan1)
                const dayOfWeek = jan1.getDay()
                firstMon.setDate(jan1.getDate() - (dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 6 : dayOfWeek - 1))

                for (let w = 0; w < 54; w++) {
                  const mon = new Date(firstMon)
                  mon.setDate(firstMon.getDate() + w * 7)
                  if (mon.getFullYear() > year && mon.getMonth() > 0) break
                  const sun = new Date(mon)
                  sun.setDate(mon.getDate() + 6)
                  const wStart = toISO(mon)
                  const wEnd = toISO(sun)
                  const weekTotal = logsByHabit
                    .filter(l => l.log_date >= wStart && l.log_date <= wEnd)
                    .reduce((s, l) => s + l.quantity, 0)
                  const pct = wh.weekly_target > 0 ? Math.min(1, weekTotal / wh.weekly_target) : 0
                  weeks.push({ weekStart: wStart, weekEnd: wEnd, pct })
                }
                // Filter to weeks that fall in this year
                const yearWeeks = weeks.filter(w => {
                  const d = new Date(w.weekStart + 'T12:00:00')
                  const d2 = new Date(w.weekEnd + 'T12:00:00')
                  return d.getFullYear() === year || d2.getFullYear() === year
                }).slice(0, 53)

                const todayStr = toISO(new Date())
                const totalLogged = logsByHabit.reduce((s, l) => s + l.quantity, 0)
                const weeksHit = yearWeeks.filter(w => w.pct >= 1).length

                return (
                  <div key={wh.id}>
                    <div className="flex items-center gap-3 mb-2">
                      {wh.emoji && <span className="text-[14px] leading-none" style={{ filter: 'grayscale(0.2)' }}>{wh.emoji}</span>}
                      <span className="text-[12px] font-medium text-burnham">{wh.name}</span>
                      <span className="text-[10px] font-mono text-shuttle/40 ml-auto">
                        {weeksHit} weeks hit · {wh.type === 'minutes' || wh.type === 'hours'
                          ? `${Math.floor(totalLogged / 60)}h total`
                          : `${totalLogged} total`}
                      </span>
                    </div>
                    <div className="flex gap-[3px] flex-wrap">
                      {yearWeeks.map((w, i) => {
                        const isFuture = w.weekStart > todayStr
                        const bg = isFuture ? 'bg-[#EBEDF0]'
                          : w.pct === 0 ? 'bg-[#EBEDF0]'
                          : w.pct < 0.5 ? 'bg-gossip/60'
                          : w.pct < 0.8 ? 'bg-pastel/70'
                          : w.pct < 1 ? 'bg-pastel'
                          : 'bg-burnham'
                        return (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-sm cursor-default relative transition-opacity hover:opacity-80 ${bg}`}
                            onMouseEnter={e => setTooltip({ date: `${w.weekStart}..${w.weekEnd}`, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {/* Legend */}
              <div className="flex items-center gap-1.5 pt-2">
                <span className="text-[10px] text-shuttle/40">0%</span>
                {['bg-[#EBEDF0]', 'bg-gossip/60', 'bg-pastel/70', 'bg-pastel', 'bg-burnham'].map(c => (
                  <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
                <span className="text-[10px] text-shuttle/40">100%+</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1 relative">
              {months.map(({ name, days: mDays }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-shuttle/60 w-6 shrink-0">{name}</span>
                  <div className="flex gap-[3px] flex-wrap">
                    {mDays.map(d => {
                      const dateStr = toISO(d)
                      const isMilestone = milestoneSet.has(dateStr)
                      return (
                        <div
                          key={dateStr}
                          className={`w-3 h-3 rounded-sm cursor-pointer relative transition-opacity hover:opacity-80 ${getCellColor(dateStr)}`}
                          onMouseEnter={e => setTooltip({ date: dateStr, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {isMilestone && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-white" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tooltip */}
          {tooltip && tooltipData && (
            <div
              className="fixed z-50 bg-white border border-mercury rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none"
              style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
            >
              <p className="font-mono text-shuttle/60 mb-1">{tooltip.date}</p>
              {tooltipData.habitCount > 0 && <p className="text-burnham">{tooltipData.habitCount}/{totalHabits} habits</p>}
              {tooltipData.energy && <p className="text-shuttle">Energy: {tooltipData.energy}/10</p>}
              {tooltipData.oneThing && <p className="text-shuttle italic truncate max-w-[180px]">"{tooltipData.oneThing}"</p>}
              {tooltipData.isMilestone && <p className="text-emerald-700 font-semibold">Milestone</p>}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-6">
            {layer === 'habits' ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-shuttle/60">Less</span>
                {['bg-[#EBEDF0]','bg-[#CAEBBE]','bg-[#9BE9A8]','bg-[#30A14E]','bg-[#216E39]'].map(c => (
                  <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
                <span className="text-[10px] text-shuttle/60">More</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-shuttle/60">Low energy</span>
                {['bg-blue-100','bg-blue-200','bg-blue-400','bg-blue-600'].map(c => (
                  <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
                <span className="text-[10px] text-shuttle/60">High</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#30A14E] relative flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-white" />
              </div>
              <span className="text-[10px] text-shuttle/60">Milestone completed</span>
            </div>
          </div>

          {/* Summary footer */}
          <div className="border-t border-mercury pt-6">
            <div className="flex gap-8 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-shuttle mb-1">Habit Days</p>
                <p className="text-2xl font-bold text-burnham">{totalHabitDays}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-shuttle mb-1">Milestones Hit</p>
                <p className="text-2xl font-bold text-burnham">{milestones.length}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-shuttle mb-1">Avg Energy</p>
                <p className="text-2xl font-bold text-burnham">{avgEnergy}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
