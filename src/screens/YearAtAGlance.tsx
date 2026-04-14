/**
 * YearAtAGlance — contribution-graph view of the whole year.
 * Two view modes:
 *   • Daily  — 7-row × 53-col GitHub grid, per-day cells with date numbers
 *   • Weekly — one cell per week, colored by % of weekly target
 * Three data layers: Weekly Goals | Daily Habits | Energy
 */
import { useState, useEffect, useCallback } from 'react'
import { CaretLeft, CaretRight, Plus, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { HabitLog, Habit, Milestone, Review, WeeklyHabit, WeeklyHabitLog } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO(): string { return toISO(new Date()) }

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Build array of week-columns for a year.
 *  Each week = { monday: Date, days: (Date|null)[] length 7 }
 *  Null = outside the year boundary. */
function buildWeekGrid(year: number) {
  const jan1 = new Date(year, 0, 1)
  const dec31 = new Date(year, 11, 31)

  // Find the Monday on or before Jan 1
  const dayOfWeek = jan1.getDay() // 0=Sun
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // days back to Monday
  const firstMon = new Date(jan1)
  firstMon.setDate(jan1.getDate() + offset)

  const weeks: { monday: Date; days: (Date | null)[] }[] = []
  for (let w = 0; w < 54; w++) {
    const mon = new Date(firstMon)
    mon.setDate(firstMon.getDate() + w * 7)
    if (mon > dec31 && mon.getDay() !== 1) break // past year
    const days: (Date | null)[] = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(mon)
      day.setDate(mon.getDate() + d)
      days.push(day.getFullYear() === year ? day : null)
    }
    if (days.some(d => d !== null)) weeks.push({ monday: mon, days })
  }
  return weeks
}

/** Build month header spans from the week grid */
function buildMonthSpans(weeks: ReturnType<typeof buildWeekGrid>) {
  const spans: { month: number; label: string; start: number; count: number }[] = []
  let curMonth = -1
  let spanStart = 0
  weeks.forEach((w, i) => {
    // Month = the month of the first non-null day in this week
    const firstDay = w.days.find(d => d !== null)
    if (!firstDay) return
    const m = firstDay.getMonth()
    if (m !== curMonth) {
      if (curMonth >= 0) spans.push({ month: curMonth, label: MONTH_NAMES[curMonth], start: spanStart, count: i - spanStart })
      curMonth = m
      spanStart = i
    }
  })
  if (curMonth >= 0) spans.push({ month: curMonth, label: MONTH_NAMES[curMonth], start: spanStart, count: weeks.length - spanStart })
  return spans
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'daily' | 'weekly'
type Layer = 'goals' | 'habits' | 'energy'

interface TooltipState {
  content: string[]
  x: number
  y: number
}

// ─── Color scales ────────────────────────────────────────────────────────────

function goalDailyColor(hasLog: boolean, qty: number, isFuture: boolean): string {
  if (isFuture) return '#EBEDF0'
  if (!hasLog || qty === 0) return '#EBEDF0'
  if (qty >= 3) return '#003720'
  if (qty >= 2) return '#30A14E'
  return '#9BE9A8'
}

function goalWeeklyColor(pct: number, isFuture: boolean): string {
  if (isFuture) return '#EBEDF0'
  if (pct === 0) return '#EBEDF0'
  if (pct < 0.5) return '#E5F9BD'
  if (pct < 0.8) return '#79D65E'
  if (pct < 1) return '#30A14E'
  return '#003720'
}

function habitColor(ratio: number, isFuture: boolean): string {
  if (isFuture || ratio === 0) return '#EBEDF0'
  if (ratio >= 0.9) return '#216E39'
  if (ratio >= 0.6) return '#30A14E'
  if (ratio >= 0.3) return '#9BE9A8'
  return '#CAEBBE'
}

function energyColor(e: number | undefined, isFuture: boolean): string {
  if (isFuture || !e) return '#EBEDF0'
  if (e >= 9) return '#1D4ED8'
  if (e >= 7) return '#60A5FA'
  if (e >= 5) return '#BFDBFE'
  return '#DBEAFE'
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function YearAtAGlance() {
  const { user } = useAuth()
  const userId = user?.id
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [layer, setLayer] = useState<Layer>('goals')

  // Data
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabit[]>([])
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyHabitLog[]>([])
  // Auto-source daily data
  const [interactionDays, setInteractionDays] = useState<Map<string, number>>(new Map())
  const [englishDays, setEnglishDays] = useState<Map<string, number>>(new Map())

  // UI state
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null) // `${habitId}-${date}`

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const start = `${year}-01-01`
    const end = `${year}-12-31`
    const [habitsRes, logsRes, reviewsRes, milestonesRes, wHabitsRes, wLogsRes, interactionsRes, englishRes] = await Promise.all([
      supabase.from('habits').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('habit_logs').select('*').eq('user_id', userId).gte('log_date', start).lte('log_date', end),
      supabase.from('reviews').select('date, energy_level, one_thing').eq('user_id', userId).gte('date', start).lte('date', end),
      supabase.from('milestones').select('*').eq('user_id', userId).eq('status', 'COMPLETE').gte('target_date', start).lte('target_date', end),
      supabase.from('weekly_habits').select('*').eq('user_id', userId).eq('is_active', true).order('position'),
      supabase.from('weekly_habit_logs').select('*').eq('user_id', userId).gte('log_date', start).lte('log_date', end),
      supabase.from('interactions').select('interaction_date').eq('user_id', userId).gte('interaction_date', start).lte('interaction_date', end),
      supabase.from('english_sessions').select('date, minutes').eq('user_id', userId).gte('date', start).lte('date', end),
    ])
    setHabits(habitsRes.data ?? [])
    setHabitLogs(logsRes.data ?? [])
    setReviews((reviewsRes.data ?? []) as Review[])
    setMilestones(milestonesRes.data ?? [])
    setWeeklyHabits((wHabitsRes.data ?? []) as WeeklyHabit[])
    setWeeklyLogs((wLogsRes.data ?? []) as WeeklyHabitLog[])

    // Build daily interaction/english maps
    const intMap = new Map<string, number>()
    ;(interactionsRes.data ?? []).forEach((r: { interaction_date: string }) => {
      intMap.set(r.interaction_date, (intMap.get(r.interaction_date) ?? 0) + 1)
    })
    const engMap = new Map<string, number>()
    ;(englishRes.data ?? []).forEach((r: { date: string; minutes: number }) => {
      engMap.set(r.date, (engMap.get(r.date) ?? 0) + (r.minutes ?? 0))
    })
    setInteractionDays(intMap)
    setEnglishDays(engMap)
    setLoading(false)
  }, [userId, year])

  useEffect(() => { load() }, [load])

  // ── Derived maps ──────────────────────────────────────────────────────────
  const logMap = new Map<string, number>()
  habitLogs.forEach(l => { if (l.value === 1) logMap.set(l.log_date, (logMap.get(l.log_date) ?? 0) + 1) })

  const energyMap = new Map<string, number>()
  const oneThingMap = new Map<string, string>()
  reviews.forEach(r => {
    if (r.date && r.energy_level) energyMap.set(r.date, r.energy_level)
    if (r.date && r.one_thing) oneThingMap.set(r.date, r.one_thing)
  })

  const milestoneSet = new Set<string>()
  milestones.forEach(m => { if (m.target_date) milestoneSet.add(m.target_date.split('T')[0]) })

  // ── Grid structure ────────────────────────────────────────────────────────
  const weeks = buildWeekGrid(year)
  const monthSpans = buildMonthSpans(weeks)
  const todayStr = todayISO()
  const CELL = 13 // cell size px
  const GAP = 2

  // ── Toggle manual weekly habit log ────────────────────────────────────────
  const toggleDailyLog = async (habitId: string, dateStr: string) => {
    if (!userId) return
    const key = `${habitId}-${dateStr}`
    setLogging(key)
    const existing = weeklyLogs.find(l => l.habit_id === habitId && l.log_date === dateStr)
    if (existing) {
      await supabase.from('weekly_habit_logs').delete().eq('id', existing.id)
      setWeeklyLogs(prev => prev.filter(l => l.id !== existing.id))
    } else {
      const { data } = await supabase.from('weekly_habit_logs').upsert({
        user_id: userId, habit_id: habitId, log_date: dateStr, quantity: 1,
      }, { onConflict: 'habit_id,log_date' }).select().single()
      if (data) setWeeklyLogs(prev => [...prev, data as WeeklyHabitLog])
    }
    setLogging(null)
  }

  // ── Render grid ───────────────────────────────────────────────────────────

  function renderDailyGrid(
    getColor: (dateStr: string, isFuture: boolean) => string,
    getTooltip: (dateStr: string) => string[],
    onClickDay?: (dateStr: string) => void,
    isAutoSource?: boolean,
  ) {
    return (
      <div>
        {/* Month headers */}
        <div className="flex mb-0.5" style={{ marginLeft: 20 }}>
          {monthSpans.map(s => (
            <div
              key={s.month}
              className="text-[9px] font-mono text-shuttle/40 text-left overflow-hidden"
              style={{ width: s.count * (CELL + GAP) - GAP, flexShrink: 0 }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Week column Monday date row */}
        <div className="flex mb-1" style={{ marginLeft: 20 }}>
          {weeks.map((w, wi) => {
            const mon = w.days[0] // first day (Monday) — may be null if < Jan 1
            const dayNum = mon ? mon.getDate() : ''
            const isFirst = mon && mon.getDate() <= 7 // first week of month
            return (
              <div
                key={wi}
                className="text-[8px] font-mono text-shuttle/25 text-center overflow-hidden shrink-0"
                style={{ width: CELL, marginRight: GAP }}
              >
                {isFirst ? dayNum : ''}
              </div>
            )
          })}
        </div>

        {/* Day rows */}
        <div className="flex">
          {/* Day-of-week labels */}
          <div className="flex flex-col shrink-0" style={{ width: 16, gap: GAP }}>
            {DAY_LABELS.map((l, i) => (
              <div
                key={i}
                className="text-[9px] font-mono text-shuttle/30 text-right flex items-center justify-end pr-1"
                style={{ height: CELL }}
              >
                {i % 2 === 0 ? l : ''}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {w.days.map((day, di) => {
                  if (!day) {
                    return <div key={di} style={{ width: CELL, height: CELL }} />
                  }
                  const dateStr = toISO(day)
                  const isFuture = dateStr > todayStr
                  const isToday = dateStr === todayStr
                  const color = getColor(dateStr, isFuture)
                  const isClickable = !isFuture && !isAutoSource && onClickDay
                  const isLogging = logging?.endsWith(`-${dateStr}`)

                  return (
                    <div
                      key={di}
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: color,
                        borderRadius: 2,
                        cursor: isClickable ? 'pointer' : 'default',
                        opacity: isLogging ? 0.4 : 1,
                        outline: isToday ? '1.5px solid #536471' : undefined,
                        outlineOffset: isToday ? 1 : undefined,
                        transition: 'opacity 0.1s',
                      }}
                      onMouseEnter={e => {
                        const tips = getTooltip(dateStr)
                        if (tips.length) setTooltip({ content: tips, x: e.clientX, y: e.clientY })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => isClickable && !isLogging && onClickDay(dateStr)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Section renders ───────────────────────────────────────────────────────

  function renderGoalsDailySection() {
    return (
      <div className="space-y-5">
        {weeklyHabits.length === 0 && (
          <p className="text-[12px] text-shuttle/40">No weekly goals configured yet.</p>
        )}
        {weeklyHabits.map(wh => {
          const logsForHabit = weeklyLogs.filter(l => l.habit_id === wh.id)
          const isManual = wh.integration_source === 'manual'

          const getColor = (dateStr: string, isFuture: boolean) => {
            let qty = 0
            if (wh.integration_source === 'interactions') qty = interactionDays.get(dateStr) ?? 0
            else if (wh.integration_source === 'english_sessions') qty = englishDays.get(dateStr) ?? 0
            else qty = logsForHabit.filter(l => l.log_date === dateStr).reduce((s, l) => s + l.quantity, 0)
            return goalDailyColor(qty > 0, qty, isFuture)
          }

          const getTooltip = (dateStr: string) => {
            const d = new Date(dateStr + 'T12:00:00')
            const label = `${DAY_LABELS[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
            let qty = 0
            if (wh.integration_source === 'interactions') qty = interactionDays.get(dateStr) ?? 0
            else if (wh.integration_source === 'english_sessions') qty = englishDays.get(dateStr) ?? 0
            else qty = logsForHabit.filter(l => l.log_date === dateStr).reduce((s, l) => s + l.quantity, 0)
            const lines = [label]
            if (qty > 0) {
              if (wh.type === 'minutes') lines.push(`${qty}m ${wh.name}`)
              else lines.push(`${qty} ${wh.name}`)
            } else {
              lines.push(`No ${wh.name}`)
            }
            if (!isManual) lines.push('(auto-tracked)')
            return lines
          }

          const onClickDay = isManual ? (dateStr: string) => toggleDailyLog(wh.id, dateStr) : undefined

          const totalLogged = logsForHabit.reduce((s, l) => s + l.quantity, 0)
          const totalInteractions = [...interactionDays.values()].reduce((s, v) => s + v, 0)
          const totalEnglish = [...englishDays.values()].reduce((s, v) => s + v, 0)
          const displayTotal = wh.integration_source === 'interactions' ? totalInteractions
            : wh.integration_source === 'english_sessions' ? totalEnglish
            : totalLogged

          return (
            <div key={wh.id}>
              <div className="flex items-center gap-2 mb-2">
                {wh.emoji && <span className="text-[13px] leading-none">{wh.emoji}</span>}
                <span className="text-[12px] font-medium text-burnham">{wh.name}</span>
                <span className="text-[10px] font-mono text-shuttle/35 ml-auto">
                  {wh.type === 'minutes'
                    ? `${Math.floor(displayTotal / 60)}h ${displayTotal % 60}m total`
                    : `${displayTotal} total`}
                  {!isManual && ' (auto)'}
                  {isManual && ' · click to log'}
                </span>
              </div>
              {renderDailyGrid(getColor, getTooltip, onClickDay, !isManual)}
            </div>
          )
        })}
      </div>
    )
  }

  function renderGoalsWeeklySection() {
    return (
      <div className="space-y-5">
        {weeklyHabits.length === 0 && (
          <p className="text-[12px] text-shuttle/40">No weekly goals configured yet.</p>
        )}
        {weeklyHabits.map(wh => {
          const logsForHabit = weeklyLogs.filter(l => l.habit_id === wh.id)

          const getWeekTotal = (wStart: string, wEnd: string) => {
            let total = 0
            if (wh.integration_source === 'interactions') {
              interactionDays.forEach((v, d) => { if (d >= wStart && d <= wEnd) total += v })
            } else if (wh.integration_source === 'english_sessions') {
              englishDays.forEach((v, d) => { if (d >= wStart && d <= wEnd) total += v })
            } else {
              total = logsForHabit.filter(l => l.log_date >= wStart && l.log_date <= wEnd).reduce((s, l) => s + l.quantity, 0)
            }
            return total
          }

          const weeksHit = weeks.filter(w => {
            const validDays = w.days.filter(d => d !== null) as Date[]
            if (!validDays.length) return false
            const wStart = toISO(validDays[0])
            const wEnd = toISO(validDays[validDays.length - 1])
            const wStartMon = toISO(w.monday)
            const total = getWeekTotal(wStartMon, wEnd)
            return total >= wh.weekly_target
          }).length

          const totalLogged = logsForHabit.reduce((s, l) => s + l.quantity, 0)
          const totalInteractions = [...interactionDays.values()].reduce((s, v) => s + v, 0)
          const totalEnglish = [...englishDays.values()].reduce((s, v) => s + v, 0)
          const displayTotal = wh.integration_source === 'interactions' ? totalInteractions
            : wh.integration_source === 'english_sessions' ? totalEnglish
            : totalLogged

          return (
            <div key={wh.id}>
              <div className="flex items-center gap-2 mb-2">
                {wh.emoji && <span className="text-[13px] leading-none">{wh.emoji}</span>}
                <span className="text-[12px] font-medium text-burnham">{wh.name}</span>
                <span className="text-[10px] font-mono text-shuttle/35 ml-auto">
                  {weeksHit}w hit · {wh.type === 'minutes'
                    ? `${Math.floor(displayTotal / 60)}h total`
                    : `${displayTotal} total`}
                </span>
              </div>

              {/* Week cells — month headers + day-of-week stub for alignment, then just week cells */}
              <div>
                {/* Month headers */}
                <div className="flex mb-1" style={{ marginLeft: 0 }}>
                  {monthSpans.map(s => (
                    <div
                      key={s.month}
                      className="text-[9px] font-mono text-shuttle/40 text-left overflow-hidden"
                      style={{ width: s.count * (CELL + GAP) - GAP, flexShrink: 0 }}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
                {/* Week row with Monday date labels */}
                <div className="flex mb-1">
                  {weeks.map((w, wi) => {
                    const mon = w.days[0]
                    const isFirst = mon && mon.getDate() <= 7
                    return (
                      <div
                        key={wi}
                        className="text-[8px] font-mono text-shuttle/25 text-center overflow-hidden shrink-0"
                        style={{ width: CELL, marginRight: GAP }}
                      >
                        {isFirst && mon ? mon.getDate() : ''}
                      </div>
                    )
                  })}
                </div>
                {/* Single row of week cells */}
                <div className="flex" style={{ gap: GAP }}>
                  {weeks.map((w, wi) => {
                    const validDays = w.days.filter(d => d !== null) as Date[]
                    if (!validDays.length) return <div key={wi} style={{ width: CELL }} />
                    const wStart = toISO(w.monday)
                    const wEnd = toISO(validDays[validDays.length - 1])
                    const total = getWeekTotal(wStart, wEnd)
                    const pct = wh.weekly_target > 0 ? Math.min(1, total / wh.weekly_target) : 0
                    const isFuture = wStart > todayStr
                    const color = goalWeeklyColor(pct, isFuture)

                    const d = validDays[0]
                    const tipLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}–${validDays[validDays.length - 1].getDate()}`
                    const tipValue = wh.type === 'minutes'
                      ? `${Math.floor(total / 60)}h ${total % 60}m / ${Math.floor(wh.weekly_target / 60)}h`
                      : `${total} / ${wh.weekly_target}`

                    return (
                      <div
                        key={wi}
                        style={{ width: CELL, height: CELL, backgroundColor: color, borderRadius: 2, cursor: 'default', flexShrink: 0 }}
                        onMouseEnter={e => setTooltip({ content: [tipLabel, `${tipValue} (${Math.round(pct * 100)}%)`], x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {/* Legend */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] text-shuttle/40">0%</span>
          {['#EBEDF0','#E5F9BD','#79D65E','#30A14E','#003720'].map(c => (
            <div key={c} style={{ width: CELL, height: CELL, backgroundColor: c, borderRadius: 2 }} />
          ))}
          <span className="text-[10px] text-shuttle/40">100%+</span>
        </div>
      </div>
    )
  }

  function renderHabitsSection() {
    const totalHabits = habits.length

    const getColor = (dateStr: string, isFuture: boolean) => {
      const count = logMap.get(dateStr) ?? 0
      if (totalHabits === 0) return habitColor(0, isFuture)
      return habitColor(count / totalHabits, isFuture)
    }

    const getTooltip = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00')
      const label = `${DAY_LABELS[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
      const count = logMap.get(dateStr) ?? 0
      const one = oneThingMap.get(dateStr)
      const lines = [label, `${count}/${totalHabits} habits`]
      if (one) lines.push(`"${one.slice(0, 40)}"`)
      return lines
    }

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[12px] font-medium text-burnham">Daily Habits</span>
          <span className="text-[10px] font-mono text-shuttle/35 ml-auto">{habits.length} habits</span>
        </div>
        {renderDailyGrid(getColor, getTooltip)}
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[10px] text-shuttle/40">0%</span>
          {['#EBEDF0','#CAEBBE','#9BE9A8','#30A14E','#216E39'].map(c => (
            <div key={c} style={{ width: CELL, height: CELL, backgroundColor: c, borderRadius: 2 }} />
          ))}
          <span className="text-[10px] text-shuttle/40">100%</span>
        </div>
      </div>
    )
  }

  function renderEnergySection() {
    const getColor = (dateStr: string, isFuture: boolean) => energyColor(energyMap.get(dateStr), isFuture)
    const getTooltip = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00')
      const label = `${DAY_LABELS[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
      const e = energyMap.get(dateStr)
      const one = oneThingMap.get(dateStr)
      const lines = [label, e ? `Energy ${e}/10` : 'No entry']
      if (one) lines.push(`"${one.slice(0, 40)}"`)
      return lines
    }
    const avgEnergy = (() => {
      const rs = reviews.filter(r => r.energy_level)
      return rs.length ? (rs.reduce((s, r) => s + (r.energy_level ?? 0), 0) / rs.length).toFixed(1) : '—'
    })()

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[12px] font-medium text-burnham">Energy</span>
          <span className="text-[10px] font-mono text-shuttle/35 ml-auto">avg {avgEnergy}/10</span>
        </div>
        {renderDailyGrid(getColor, getTooltip)}
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[10px] text-shuttle/40">Low</span>
          {['#EBEDF0','#DBEAFE','#BFDBFE','#60A5FA','#1D4ED8'].map(c => (
            <div key={c} style={{ width: CELL, height: CELL, backgroundColor: c, borderRadius: 2 }} />
          ))}
          <span className="text-[10px] text-shuttle/40">High</span>
        </div>
      </div>
    )
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalHabitDays = [...logMap.values()].filter(v => v > 0).length
  const totalInteractionsYear = [...interactionDays.values()].reduce((s, v) => s + v, 0)
  const totalEnglishYear = [...englishDays.values()].reduce((s, v) => s + v, 0)

  return (
    <div className="h-screen bg-white text-burnham font-sans flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-12 py-10 pb-20">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-shuttle/50 mb-1 font-mono">Year at a Glance</p>
              <h1 className="text-2xl font-semibold text-burnham">{year}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded hover:bg-mercury/30 text-shuttle hover:text-burnham transition-colors">
                <CaretLeft size={14} />
              </button>
              <span className="text-sm font-mono text-burnham">{year}</span>
              <button onClick={() => setYear(y => y + 1)} disabled={year >= currentYear}
                className="p-1.5 rounded hover:bg-mercury/30 text-shuttle hover:text-burnham disabled:opacity-30 transition-colors">
                <CaretRight size={14} />
              </button>
            </div>
          </div>

          {/* Layer + view mode toggles */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1.5">
              {(['goals', 'habits', 'energy'] as const).map(l => (
                <button key={l} onClick={() => setLayer(l)}
                  className={[
                    'text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors',
                    layer === l ? 'border-burnham text-burnham bg-gossip/20' : 'border-mercury text-shuttle/60 hover:border-burnham/30 hover:text-burnham',
                  ].join(' ')}
                >
                  {l === 'goals' ? 'Weekly Goals' : l === 'habits' ? 'Daily Habits' : 'Energy'}
                </button>
              ))}
            </div>
            {layer === 'goals' && (
              <div className="flex gap-1 bg-mercury/30 rounded-lg p-0.5">
                {(['daily', 'weekly'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className={[
                      'text-[10px] px-3 py-1 rounded-md transition-colors font-medium',
                      viewMode === v ? 'bg-white text-burnham shadow-sm' : 'text-shuttle/60 hover:text-burnham',
                    ].join(' ')}
                  >
                    {v === 'daily' ? 'Daily' : 'Weekly'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-shuttle/40 font-mono">Loading...</p>
          ) : (
            <div className="overflow-x-auto pb-4">
              {layer === 'goals' && viewMode === 'daily' && renderGoalsDailySection()}
              {layer === 'goals' && viewMode === 'weekly' && renderGoalsWeeklySection()}
              {layer === 'habits' && renderHabitsSection()}
              {layer === 'energy' && renderEnergySection()}
            </div>
          )}

          {/* Stats footer */}
          {!loading && (
            <div className="border-t border-mercury/50 pt-6">
              <div className="flex gap-8 text-sm flex-wrap">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono mb-1">Habit Days</p>
                  <p className="text-2xl font-bold text-burnham">{totalHabitDays}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono mb-1">Conversations</p>
                  <p className="text-2xl font-bold text-burnham">{totalInteractionsYear}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono mb-1">English</p>
                  <p className="text-2xl font-bold text-burnham">
                    {Math.floor(totalEnglishYear / 60)}h {totalEnglishYear % 60}m
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono mb-1">Milestones</p>
                  <p className="text-2xl font-bold text-burnham">{milestones.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-mercury/60 rounded-lg shadow-lg px-3 py-2 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 48 }}
        >
          {tooltip.content.map((line, i) => (
            <p key={i} className={i === 0 ? 'text-[10px] font-mono text-burnham font-semibold mb-0.5' : 'text-[10px] text-shuttle/70'}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
