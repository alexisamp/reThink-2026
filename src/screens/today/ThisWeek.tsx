// ThisWeek — right-rail KPI rows (the "lagging" scoreboard). Reuses the proven
// weekly-habit aggregation from WeeklyPulse (interactions / english / tier touches /
// pipeline expansion auto-sources + manual logs) and renders the design's row style.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Sparkle } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { WeeklyHabit, WeeklyHabitLog } from '@/types'

interface HabitData {
  habit: WeeklyHabit
  logs: WeeklyHabitLog[]
  autoTotal: number
}

function weeklyTotal(hd: HabitData): number {
  const manual = hd.logs.reduce((s, l) => s + l.quantity, 0)
  return hd.habit.integration_source === 'manual' ? manual : hd.autoTotal + manual
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

interface Props {
  userId: string
  weekDates: string[]
  today: string
  onManage?: () => void
}

export default function ThisWeek({ userId, weekDates, today, onManage }: Props) {
  const [habits, setHabits] = useState<HabitData[]>([])
  const [loading, setLoading] = useState(true)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const load = useCallback(async () => {
    if (!userId || !weekStart) return
    const { data: habitsData } = await supabase
      .from('weekly_habits').select('*')
      .eq('user_id', userId).eq('is_active', true).order('position')

    if (!habitsData || habitsData.length === 0) { setHabits([]); setLoading(false); return }

    const weekStartDate = new Date(weekStart + 'T00:00:00')
    const sixtyDaysBefore = new Date(weekStartDate); sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60)
    const sixtyDaysBeforeStr = sixtyDaysBefore.toISOString().split('T')[0]
    const dayBefore = new Date(weekStartDate); dayBefore.setDate(dayBefore.getDate() - 1)
    const dayBeforeStr = dayBefore.toISOString().split('T')[0]
    const weekEndEnd = weekEnd + 'T23:59:59.999Z'

    const [logsRes, interactionsRes, englishRes, contactsRes, histInteractionsRes] = await Promise.all([
      supabase.from('weekly_habit_logs').select('*').eq('user_id', userId).gte('log_date', weekStart).lte('log_date', weekEnd),
      supabase.from('interactions').select('id, interaction_date').eq('user_id', userId).gte('interaction_date', weekStart).lte('interaction_date', weekEnd),
      supabase.from('english_sessions').select('minutes, date').eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('outreach_logs').select('id, tier, referred_by, created_at').eq('user_id', userId),
      supabase.from('interactions').select('contact_id, interaction_date').eq('user_id', userId).gte('interaction_date', sixtyDaysBeforeStr).lte('interaction_date', weekEnd),
    ])

    const allLogs = (logsRes.data ?? []) as WeeklyHabitLog[]
    const totalInteractions = (interactionsRes.data ?? []).length
    const totalEnglishMin = (englishRes.data ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0)

    const tierById = new Map<string, number | null>()
    const contactRows = (contactsRes.data ?? []) as Array<{ id: string; tier: number | null; referred_by: string | null; created_at: string }>
    for (const c of contactRows) tierById.set(c.id, c.tier)

    const tier12ThisWeek = new Set<string>()
    const datesByContact = new Map<string, string[]>()
    for (const i of (histInteractionsRes.data ?? []) as Array<{ contact_id: string; interaction_date: string }>) {
      if (!datesByContact.has(i.contact_id)) datesByContact.set(i.contact_id, [])
      datesByContact.get(i.contact_id)!.push(i.interaction_date)
      const t = tierById.get(i.contact_id)
      if (t !== 1 && t !== 2) continue
      if (i.interaction_date >= weekStart && i.interaction_date <= weekEnd) tier12ThisWeek.add(i.contact_id)
    }
    const tierTouchesTotal = tier12ThisWeek.size

    const newReferredCount = contactRows.filter(c => c.referred_by && c.created_at >= weekStart && c.created_at <= weekEndEnd).length
    let reactivationsCount = 0
    for (const contactId of tier12ThisWeek) {
      const dates = datesByContact.get(contactId) ?? []
      if (dates.some(d => d >= sixtyDaysBeforeStr && d <= dayBeforeStr)) continue
      reactivationsCount++
    }
    const expansionTotal = newReferredCount + reactivationsCount

    setHabits(habitsData.map(h => ({
      habit: h as WeeklyHabit,
      logs: allLogs.filter(l => l.habit_id === h.id),
      autoTotal: h.integration_source === 'interactions' ? totalInteractions
        : h.integration_source === 'english_sessions' ? totalEnglishMin
        : h.integration_source === 'networkhub_tier_touches' ? tierTouchesTotal
        : h.integration_source === 'networkhub_expansion' ? expansionTotal
        : 0,
    })))
    setLoading(false)
  }, [userId, weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  const logOne = async (hd: HabitData) => {
    const inc = (hd.habit.type === 'minutes' || hd.habit.type === 'hours') ? 15 : 1
    const existing = hd.logs.find(l => l.log_date === today)
    await supabase.from('weekly_habit_logs').upsert({
      user_id: userId, habit_id: hd.habit.id, log_date: today,
      quantity: (existing?.quantity ?? 0) + inc,
    }, { onConflict: 'habit_id,log_date' })
    load()
  }

  if (loading) return <div className="td-tw-empty">Loading...</div>
  if (habits.length === 0) return <div className="td-tw-empty">No weekly goals yet.</div>

  return (
    <div className="td-tw-rows">
      {habits.map(hd => {
        const total = weeklyTotal(hd)
        const pct = Math.min(100, hd.habit.weekly_target > 0 ? (total / hd.habit.weekly_target) * 100 : 0)
        return (
          <div key={hd.habit.id}>
            <div className="td-tw-row">
              <span className="emoji">{hd.habit.emoji || '•'}</span>
              <span className="name">{hd.habit.name}</span>
              <span className="val">{fmtAmount(hd.habit, total)}<span className="target">/{fmtTarget(hd.habit)}</span></span>
              <button className="add" onClick={() => logOne(hd)} title="Log progress"><Plus size={13} /></button>
            </div>
            <div className="td-tw-bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
        )
      })}
      <div className="td-tw-foot">
        <button onClick={onManage}>
          <Sparkle size={11} />
          <span>Manage goals</span>
        </button>
      </div>
    </div>
  )
}
