import { useState, useEffect } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { HabitLog, Habit, Milestone, Review } from '@/types'

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

type Layer = 'habits' | 'energy'

export default function YearAtAGlance() {
  const { user } = useAuth()
  const userId = user?.id
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [layer, setLayer] = useState<Layer>('habits')
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      setLoading(true)
      const [habitsRes, logsRes, reviewsRes, milestonesRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', userId).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', userId)
          .gte('log_date', `${year}-01-01`).lte('log_date', `${year}-12-31`),
        supabase.from('reviews').select('review_date, energy_level, one_thing').eq('user_id', userId)
          .gte('review_date', `${year}-01-01`).lte('review_date', `${year}-12-31`),
        supabase.from('milestones').select('*').eq('user_id', userId)
          .eq('status', 'COMPLETE').gte('target_date', `${year}-01-01`).lte('target_date', `${year}-12-31`),
      ])
      setHabits(habitsRes.data ?? [])
      setHabitLogs(logsRes.data ?? [])
      setReviews((reviewsRes.data ?? []) as Review[])
      setMilestones(milestonesRes.data ?? [])
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
    if (r.review_date && r.energy_level) energyMap.set(r.review_date, r.energy_level)
    if (r.review_date && r.one_thing) oneThingMap.set(r.review_date, r.one_thing)
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
          <div className="flex gap-2">
            {(['habits', 'energy'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={[
                  'text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border transition-colors',
                  layer === l ? 'border-burnham text-burnham' : 'border-mercury text-shuttle hover:border-burnham/30',
                ].join(' ')}
              >
                {l === 'habits' ? 'Habit Layer' : 'Energy Layer'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-shuttle">Loading...</p>
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
