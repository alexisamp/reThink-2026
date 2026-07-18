/**
 * WeeklyPulse — weekly goal strip + compact bottom-right widget.
 *
 * Strip mode  : 7-dot layout (normal scroll content)
 * Compact mode: segmented progress bar per goal, today's contribution
 *               highlighted as a brighter segment, with inline quick-log.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GearSix, ArrowRight, Check, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { WeeklyHabit, WeeklyHabitLog } from '@/types'

interface WeeklyPulseProps {
  userId: string
  weekDates: string[]     // 7 dates Mon–Sun YYYY-MM-DD
  onSettingsClick?: () => void
  compact?: boolean       // compact widget mode (no header, progress bars)
  today?: string          // YYYY-MM-DD — enables today's contribution tracking
}

interface HabitData {
  habit: WeeklyHabit
  logs: WeeklyHabitLog[]
  autoTotal: number       // weekly total from auto-source (interactions / english_sessions)
  todayAutoTotal: number  // today's portion of autoTotal
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function weeklyTotal(hd: HabitData): number {
  const manual = hd.logs.reduce((s, l) => s + l.quantity, 0)
  return hd.habit.integration_source === 'manual' ? manual : hd.autoTotal + manual
}

function todayContrib(hd: HabitData, today?: string): number {
  const manualToday = today
    ? hd.logs.filter(l => l.log_date === today).reduce((s, l) => s + l.quantity, 0)
    : 0
  return hd.habit.integration_source === 'manual'
    ? manualToday
    : hd.todayAutoTotal + manualToday
}

function fmtAmount(habit: WeeklyHabit, total: number): string {
  if (habit.type === 'minutes' || habit.type === 'hours') {
    const h = Math.floor(total / 60), m = total % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${total}m`
  }
  return String(total)
}

function fmtTarget(habit: WeeklyHabit): string {
  if (habit.type === 'minutes' || habit.type === 'hours') {
    const h = Math.floor(habit.weekly_target / 60), m = habit.weekly_target % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${habit.weekly_target}m`
  }
  return String(habit.weekly_target)
}

export function WeeklyPulse({ userId, weekDates, onSettingsClick, compact, today }: WeeklyPulseProps) {
  const [habits, setHabits] = useState<HabitData[]>([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null)  // strip mode: habitId+date
  const [loggingGoalId, setLoggingGoalId] = useState<string | null>(null)  // compact mode
  const [logInput, setLogInput] = useState('')
  const logInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const weekStart = weekDates[0]
  const weekEnd   = weekDates[6]

  const load = useCallback(async () => {
    if (!userId || !weekStart) return
    setLoading(true)

    const { data: habitsData } = await supabase
      .from('weekly_habits').select('*')
      .eq('user_id', userId).eq('is_active', true).order('position')

    if (!habitsData || habitsData.length === 0) {
      setHabits([]); setLoading(false); return
    }

    // 60 days before weekStart (for reactivation gap check)
    const weekStartDate = new Date(weekStart + 'T00:00:00')
    const sixtyDaysBefore = new Date(weekStartDate); sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60)
    const sixtyDaysBeforeStr = sixtyDaysBefore.toISOString().split('T')[0]
    const dayBefore = new Date(weekStartDate); dayBefore.setDate(dayBefore.getDate() - 1)
    const dayBeforeStr = dayBefore.toISOString().split('T')[0]
    const weekEndEnd = weekEnd + 'T23:59:59.999Z'

    const [logsRes, interactionsRes, englishRes, contactsRes, histInteractionsRes] = await Promise.all([
      supabase.from('weekly_habit_logs').select('*').eq('user_id', userId)
        .gte('log_date', weekStart).lte('log_date', weekEnd),
      supabase.from('interactions').select('id, interaction_date').eq('user_id', userId)
        .gte('interaction_date', weekStart).lte('interaction_date', weekEnd),
      supabase.from('english_sessions').select('minutes, date').eq('user_id', userId)
        .gte('date', weekStart).lte('date', weekEnd),
      supabase.from('outreach_logs')
        .select('id, tier, referred_by, created_at')
        .eq('user_id', userId),
      supabase.from('interactions')
        .select('contact_id, interaction_date')
        .eq('user_id', userId)
        .gte('interaction_date', sixtyDaysBeforeStr)
        .lte('interaction_date', weekEnd),
    ])

    const allLogs = (logsRes.data ?? []) as WeeklyHabitLog[]

    const interactionsByDate = new Map<string, number>()
    ;(interactionsRes.data ?? []).forEach(i => {
      interactionsByDate.set(i.interaction_date, (interactionsByDate.get(i.interaction_date) ?? 0) + 1)
    })
    const totalInteractions  = [...interactionsByDate.values()].reduce((s, v) => s + v, 0)
    const todayInteractions  = interactionsByDate.get(today ?? '') ?? 0

    const englishRows        = englishRes.data ?? []
    const totalEnglishMin    = englishRows.reduce((s, r) => s + (r.minutes ?? 0), 0)
    const todayEnglishMin    = englishRows
      .filter(r => r.date === today)
      .reduce((s, r) => s + (r.minutes ?? 0), 0)

    // ── networkhub metrics ──────────────────────────────────────────────────
    const tierById = new Map<string, number | null>()
    const contactRows = (contactsRes.data ?? []) as Array<{ id: string; tier: number | null; referred_by: string | null; created_at: string }>
    for (const c of contactRows) tierById.set(c.id, c.tier)

    // Tier 1/2 touches: distinct Tier 1/2 contacts with any interaction this week
    const tier12ThisWeek = new Set<string>()
    const tier12Today = new Set<string>()
    // Per-contact dates for reactivation gap analysis
    const datesByContact = new Map<string, string[]>()
    for (const i of (histInteractionsRes.data ?? []) as Array<{ contact_id: string; interaction_date: string }>) {
      const t = tierById.get(i.contact_id)
      if (!datesByContact.has(i.contact_id)) datesByContact.set(i.contact_id, [])
      datesByContact.get(i.contact_id)!.push(i.interaction_date)
      if (t !== 1 && t !== 2) continue
      if (i.interaction_date >= weekStart && i.interaction_date <= weekEnd) {
        tier12ThisWeek.add(i.contact_id)
        if (today && i.interaction_date === today) tier12Today.add(i.contact_id)
      }
    }
    const tierTouchesTotal = tier12ThisWeek.size
    const tierTouchesToday = tier12Today.size

    // Pipeline expansion: (new contacts with referred_by created this week) + (Tier 1/2 reactivations)
    const newReferredThisWeek = contactRows.filter(c =>
      c.referred_by &&
      c.created_at >= weekStart &&
      c.created_at <= weekEndEnd
    )
    const newReferredCount = newReferredThisWeek.length
    const newReferredTodayCount = today
      ? newReferredThisWeek.filter(c => c.created_at.startsWith(today)).length
      : 0

    // Reactivations: Tier 1/2 contact, touched this week, with no interactions in [weekStart-60d, weekStart-1d]
    let reactivationsCount = 0
    let reactivationsTodayCount = 0
    for (const contactId of tier12ThisWeek) {
      const dates = datesByContact.get(contactId) ?? []
      const hadRecentContact = dates.some(d => d >= sixtyDaysBeforeStr && d <= dayBeforeStr)
      if (hadRecentContact) continue
      reactivationsCount++
      if (today && dates.includes(today)) reactivationsTodayCount++
    }

    const expansionTotal = newReferredCount + reactivationsCount
    const expansionToday = newReferredTodayCount + reactivationsTodayCount

    setHabits(habitsData.map(h => ({
      habit: h as WeeklyHabit,
      logs:  allLogs.filter(l => l.habit_id === h.id),
      autoTotal: h.integration_source === 'interactions'              ? totalInteractions
               : h.integration_source === 'english_sessions'          ? totalEnglishMin
               : h.integration_source === 'networkhub_tier_touches'   ? tierTouchesTotal
               : h.integration_source === 'networkhub_expansion'      ? expansionTotal
               : 0,
      todayAutoTotal: h.integration_source === 'interactions'            ? todayInteractions
                    : h.integration_source === 'english_sessions'        ? todayEnglishMin
                    : h.integration_source === 'networkhub_tier_touches' ? tierTouchesToday
                    : h.integration_source === 'networkhub_expansion'    ? expansionToday
                    : 0,
    })))
    setLoading(false)
  }, [userId, weekStart, weekEnd, today])

  useEffect(() => { load() }, [load])

  // compact mode: focus log input when it opens
  useEffect(() => {
    if (loggingGoalId) logInputRef.current?.focus()
  }, [loggingGoalId])

  // Strip mode: toggle a day dot
  const toggleDay = async (hd: HabitData, dateStr: string) => {
    if (hd.habit.integration_source !== 'manual') return
    setLogging(hd.habit.id + dateStr)
    const existing = hd.logs.find(l => l.log_date === dateStr)
    if (existing) {
      await supabase.from('weekly_habit_logs').delete().eq('id', existing.id)
    } else {
      await supabase.from('weekly_habit_logs').upsert({
        user_id: userId, habit_id: hd.habit.id, log_date: dateStr, quantity: 1,
      }, { onConflict: 'habit_id,log_date' })
    }
    setLogging(null); load()
  }

  // Compact mode: quick-log today (with value input)
  const handleQuickLog = async (hd: HabitData) => {
    const qty = parseInt(logInput, 10)
    if (!qty || qty <= 0 || !today) return
    await supabase.from('weekly_habit_logs').upsert({
      user_id: userId, habit_id: hd.habit.id, log_date: today, quantity: qty,
    }, { onConflict: 'habit_id,log_date' })
    setLoggingGoalId(null); setLogInput(''); load()
  }

  // Compact mode: instant log 1 for count-type habits (binary — did it or didn't)
  const handleQuickLogOne = async (hd: HabitData) => {
    if (!today) return
    await supabase.from('weekly_habit_logs').upsert({
      user_id: userId, habit_id: hd.habit.id, log_date: today, quantity: 1,
    }, { onConflict: 'habit_id,log_date' })
    load()
  }

  if (loading) return <div className={compact ? 'h-12' : 'h-[72px]'} />

  if (habits.length === 0) {
    if (compact) return <span className="text-[10px] text-shuttle/30">No goals yet</span>
    return (
      <div className="mb-4 py-3 px-3 border border-dashed border-mercury rounded-lg flex items-center justify-between">
        <span className="text-[11px] text-shuttle/40">No weekly goals yet</span>
        {onSettingsClick && (
          <button onClick={onSettingsClick}
            className="flex items-center gap-1 text-[11px] text-shuttle/50 hover:text-burnham transition-colors font-medium">
            <GearSix size={12} /> Configure
          </button>
        )}
      </div>
    )
  }

  const todayStr = weekDates.find(d => d === today)

  /* ─────────────────────────────────────────────────────── compact widget ── */
  if (compact) {
    return (
      <div className="space-y-3.5">
        {habits.map(hd => {
          const total    = weeklyTotal(hd)
          const tAmt     = todayContrib(hd, today)
          const prevAmt  = Math.max(0, total - tAmt)
          const target   = hd.habit.weekly_target
          const prevPct  = target > 0 ? Math.min(100, (prevAmt / target) * 100) : 0
          const todayPct = target > 0 ? Math.min(100 - prevPct, (tAmt / target) * 100) : 0
          const done     = total >= target
          const isLogging = loggingGoalId === hd.habit.id
          const isMinutes = hd.habit.type === 'minutes' || hd.habit.type === 'hours'

          return (
            <div key={hd.habit.id} className="space-y-[5px]">

              {/* ── Row 1: emoji · name · today badge · value/log ── */}
              <div className="flex items-center gap-1.5">

                {hd.habit.emoji && (
                  <span className="text-[12px] leading-none shrink-0">{hd.habit.emoji}</span>
                )}

                <span className="text-[11px] text-shuttle/55 font-normal leading-none flex-1 min-w-0 truncate">
                  {hd.habit.name}
                </span>

                {/* Today's contribution badge, only when > 0 */}
                {tAmt > 0 && !isLogging && (
                  <span className="text-[10px] font-mono shrink-0 leading-none"
                    style={{ color: '#266DF0', opacity: 0.9 }}>
                    +{fmtAmount(hd.habit, tAmt)}
                  </span>
                )}

                {/* Value / target OR log input */}
                {isLogging ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      ref={logInputRef}
                      type="number" min="1"
                      value={logInput}
                      onChange={e => setLogInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleQuickLog(hd)
                        if (e.key === 'Escape') { setLoggingGoalId(null); setLogInput('') }
                      }}
                      placeholder={isMinutes ? 'min' : 'n'}
                      className="w-10 text-[10px] font-mono text-burnham bg-mercury/20 border border-mercury/60 rounded px-1 py-0.5 focus:outline-none focus:border-burnham/30 text-center"
                    />
                    <button
                      onClick={() => handleQuickLog(hd)}
                      aria-label="Save quick log"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-burnham hover:text-burnham hover:bg-mercury/30 transition-colors"
                    >
                      <Check size={11} weight="bold" />
                    </button>
                    <button
                      onClick={() => { setLoggingGoalId(null); setLogInput('') }}
                      aria-label="Cancel quick log"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-shuttle/35 hover:text-shuttle hover:bg-mercury/30 transition-colors"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-[2px] shrink-0">
                    <span className={`text-[11px] tabular-nums font-medium leading-none ${done ? 'text-burnham/60' : 'text-shuttle/45'}`}>
                      {fmtAmount(hd.habit, total)}
                    </span>
                    <span className="text-[10px] text-shuttle/22 font-mono">/{fmtTarget(hd.habit)}</span>
                  </div>
                )}

                {/* Log + button — count type logs 1 immediately, time type shows input */}
                {!isLogging && today && (
                  <button
                    onClick={() => {
                      if (isMinutes) { setLoggingGoalId(hd.habit.id); setLogInput('') }
                      else handleQuickLogOne(hd)
                    }}
                    title={isMinutes ? 'Log minutes for today' : 'Log +1 for today'}
                    className="text-[11px] font-mono text-shuttle/22 hover:text-shuttle/60 transition-colors shrink-0 leading-none w-3 text-center">
                    +
                  </button>
                )}
              </div>

              {/* ── Row 2: segmented progress bar ── */}
              <div className="relative h-[3px] w-full rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgb(227 227 227 / 0.35)' }}>

                {/* Previous days — dim */}
                {prevPct > 0 && (
                  <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(prevPct, 2)}%`,
                      backgroundColor: done ? '#266DF0' : '#BAD0FA',
                      opacity: 0.32,
                    }}
                  />
                )}

                {/* Today — vivid */}
                {todayPct > 0 && (
                  <div className="absolute top-0 h-full rounded-full transition-all duration-500"
                    style={{
                      left: `${prevPct}%`,
                      width: `${Math.max(todayPct, 2)}%`,
                      backgroundColor: done ? '#266DF0' : '#BAD0FA',
                      opacity: 0.88,
                    }}
                  />
                )}

                {/* Done pulse — tiny accent at 100% */}
                {done && (
                  <div className="absolute right-0 top-0 h-full w-[3px] rounded-full"
                    style={{ backgroundColor: '#266DF0', opacity: 0.5 }} />
                )}
              </div>

            </div>
          )
        })}
      </div>
    )
  }

  /* ─────────────────────────────────────────────────── normal strip mode ── */
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-shuttle/30 uppercase tracking-widest">This week</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/year?layer=weekly')}
            className="flex items-center gap-0.5 text-[10px] text-shuttle/25 hover:text-shuttle/50 transition-colors font-mono"
            title="View history">
            history <ArrowRight size={9} />
          </button>
          {onSettingsClick && (
            <button onClick={onSettingsClick}
              className="text-shuttle/20 hover:text-shuttle/50 transition-colors" title="Manage goals">
              <GearSix size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {habits.map(hd => {
          const total  = weeklyTotal(hd)
          const pct    = Math.min(1, total / hd.habit.weekly_target)
          const done   = pct >= 1
          const isAuto = hd.habit.integration_source !== 'manual'

          return (
            <div key={hd.habit.id} className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 w-[110px] shrink-0">
                {hd.habit.emoji && (
                  <span className="text-[11px] leading-none" style={{ filter: 'grayscale(0.5)' }}>
                    {hd.habit.emoji}
                  </span>
                )}
                <span className="text-[11px] text-shuttle/50 truncate font-normal">{hd.habit.name}</span>
              </div>

              <div className="flex items-center gap-[3px]">
                {weekDates.map((dateStr, i) => {
                  const filled   = hd.logs.some(l => l.log_date === dateStr)
                  const isToday  = dateStr === todayStr
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
                        filled ? (done ? 'bg-burnham/70' : 'bg-burnham/35') : (isFuture ? 'bg-mercury/20' : 'bg-mercury/50'),
                        isToday && !filled ? 'ring-1 ring-shuttle/20' : '',
                        isActive ? 'opacity-40' : '',
                      ].join(' ')}
                    />
                  )
                })}
              </div>

              <div className="flex items-baseline gap-0.5">
                <span className={`text-[11px] tabular-nums font-medium ${done ? 'text-shuttle/60' : 'text-shuttle/40'}`}>
                  {fmtAmount(hd.habit, total)}
                </span>
                <span className="text-[10px] text-shuttle/25 font-mono">/{fmtTarget(hd.habit)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
