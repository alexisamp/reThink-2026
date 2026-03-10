// src/screens/GoalDetail.tsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { House, ArrowLeft, Check, TrendUp, TrendDown } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Milestone, Habit, HabitLog, LeadingIndicator, MonthlyKpiEntry } from '@/types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LETTERS = ['J','F','M','A','M','J','J','A','S','O','N','D']

// ── Helpers ──────────────────────────────────────────────────────────

function calcStreak(logs: HabitLog[]): number {
  const sorted = [...logs]
    .filter(l => l.value === 1)
    .map(l => l.log_date)
    .sort()
    .reverse()
  if (!sorted.length) return 0
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  for (const dateStr of sorted) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setHours(0, 0, 0, 0)
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000)
    if (diff <= 1) { streak++; cursor.setTime(d.getTime()) }
    else break
  }
  return streak
}

function daysFromFirst(logs: HabitLog[]): number {
  if (!logs.length) return 0
  const dates = logs.map(l => new Date(l.log_date + 'T00:00:00').getTime())
  const first = Math.min(...dates)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.max(1, Math.floor((now.getTime() - first) / 86400000) + 1)
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60000)
  if (diff < 1) return 'just now'
  if (diff === 1) return '1 min ago'
  return `${diff} min ago`
}

// ── Last-30-day dot grid ─────────────────────────────────────────────

function HabitDotGrid30({ logs }: { logs: HabitLog[] }) {
  const completedDates = new Set(logs.filter(l => l.value === 1).map(l => l.log_date))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dots: { dateStr: string; done: boolean; future: boolean }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    dots.push({ dateStr: ds, done: completedDates.has(ds), future: false })
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {dots.map(dot => (
        <div
          key={dot.dateStr}
          title={dot.dateStr}
          className={`w-3 h-3 rounded-full ${
            dot.done
              ? 'bg-pastel'
              : 'border border-mercury bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}

// ── Inline editable text ─────────────────────────────────────────────

function InlineText({
  value,
  onSave,
  className = '',
}: {
  value: string
  onSave: (v: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-gossip/10 rounded px-1 -mx-1 transition-colors ${className}`}
        onClick={() => setEditing(true)}
      >
        {value}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
      className={`bg-white border border-mercury rounded px-1 -mx-1 outline-none focus:border-pastel ${className}`}
    />
  )
}

function InlineDate({
  value,
  onSave,
  className = '',
}: {
  value: string
  onSave: (v: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const displayStr = value
    ? (() => {
        const d = new Date(value + 'T00:00:00')
        return `${MONTHS[d.getMonth()]} ${d.getDate()}`
      })()
    : ''

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-gossip/10 rounded px-1 -mx-1 transition-colors ${className}`}
        onClick={() => setEditing(true)}
      >
        {displayStr}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      className={`bg-white border border-mercury rounded px-1 -mx-1 outline-none focus:border-pastel text-sm ${className}`}
    />
  )
}

// ── Main Component ───────────────────────────────────────────────────

export default function GoalDetail() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [kpiEntries, setKpiEntries] = useState<MonthlyKpiEntry[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data loading ─────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !id) return
    const load = async () => {
      const { data: goalData } = await supabase
        .from('goals')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (!goalData) { setLoading(false); return }
      setGoal(goalData)
      setNotes(goalData.notes || '')

      const [msRes, habitRes, indRes] = await Promise.all([
        supabase.from('milestones').select('*').eq('goal_id', id).order('target_date'),
        supabase.from('habits').select('*').eq('goal_id', id).eq('is_active', true).order('created_at'),
        supabase.from('leading_indicators').select('*').eq('goal_id', id).eq('is_active', true).order('created_at'),
      ])
      setMilestones(msRes.data || [])
      const fetchedHabits: Habit[] = habitRes.data || []
      setHabits(fetchedHabits)
      setIndicators(indRes.data || [])

      // Habit logs
      if (fetchedHabits.length > 0) {
        const habitIds = fetchedHabits.map(h => h.id)
        const { data: logs } = await supabase
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('log_date', `${currentYear}-01-01`)
          .lte('log_date', new Date().toISOString().split('T')[0])
        setHabitLogs(logs || [])
      }

      // KPI entries
      const fetchedIndicators: LeadingIndicator[] = indRes.data || []
      if (fetchedIndicators.length > 0) {
        const indIds = fetchedIndicators.map(i => i.id)
        const { data: entries } = await supabase
          .from('monthly_kpi_entries')
          .select('*')
          .in('leading_indicator_id', indIds)
          .eq('year', currentYear)
        setKpiEntries(entries || [])
      }

      setLoading(false)
    }
    load()
  }, [user, id, currentYear])

  // ── Computed values ──────────────────────────────────────────────

  // Consistency: habit_logs value=1 / days since first log for goal's habits
  const consistency = useMemo(() => {
    if (!habits.length) return 0
    const completedTotal = habitLogs.filter(l => l.value === 1).length
    // Days since the first log across all habits for this goal
    const allDays = daysFromFirst(habitLogs)
    const possible = allDays * habits.length
    if (!possible) return 0
    return Math.round((completedTotal / possible) * 100)
  }, [habits, habitLogs])

  const repsYTD = useMemo(() => {
    return habitLogs.filter(l => l.value === 1).length
  }, [habitLogs])

  const nextMilestone = useMemo(() => {
    return milestones.find(m => m.status !== 'COMPLETE')
  }, [milestones])

  const nextMilestoneStr = useMemo(() => {
    if (!nextMilestone) return 'All milestones complete!'
    const d = nextMilestone.target_date ? new Date(nextMilestone.target_date + 'T00:00:00') : null
    return d
      ? `${nextMilestone.text} — ${MONTHS[d.getMonth()]} ${d.getDate()}`
      : nextMilestone.text
  }, [nextMilestone])

  // Per-habit stats
  const habitStats = useMemo(() => {
    return habits.map(h => {
      const hLogs = habitLogs.filter(l => l.habit_id === h.id)
      const active = daysFromFirst(hLogs)
      const completed = hLogs.filter(l => l.value === 1).length
      return {
        habit: h,
        logs: hLogs,
        streak: calcStreak(hLogs),
        successRate: active > 0 ? Math.round((completed / active) * 100) : 0,
      }
    })
  }, [habits, habitLogs])

  // ── Notes autosave ───────────────────────────────────────────────

  const saveNotes = useCallback(async (text: string) => {
    if (!user || !goal) return
    await supabase.from('goals').update({ notes: text }).eq('id', goal.id)
    setSavedAt(Date.now())
  }, [user, goal])

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setNotes(v)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotes(v), 800)
  }

  // Keep "saved X min ago" ticking
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!savedAt) return
    const iv = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(iv)
  }, [savedAt])

  // ── Milestone inline edits ───────────────────────────────────────

  const updateMilestoneText = async (msId: string, text: string) => {
    await supabase.from('milestones').update({ text }).eq('id', msId)
    setMilestones(prev => prev.map(m => m.id === msId ? { ...m, text } : m))
  }

  const updateMilestoneDate = async (msId: string, target_date: string) => {
    await supabase.from('milestones').update({ target_date }).eq('id', msId)
    setMilestones(prev =>
      prev.map(m => m.id === msId ? { ...m, target_date } : m)
        .sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''))
    )
  }

  // ── KPI entry upsert ────────────────────────────────────────────

  const upsertKpi = async (indicatorId: string, month: number, value: string) => {
    if (!user) return
    const numVal = value === '' ? null : parseFloat(value)
    const existing = kpiEntries.find(
      e => e.leading_indicator_id === indicatorId && e.month === month
    )
    if (existing) {
      await supabase
        .from('monthly_kpi_entries')
        .update({ actual_value: numVal })
        .eq('id', existing.id)
      setKpiEntries(prev =>
        prev.map(e => e.id === existing.id ? { ...e, actual_value: numVal } : e)
      )
    } else {
      const { data } = await supabase
        .from('monthly_kpi_entries')
        .insert({
          user_id: user.id,
          leading_indicator_id: indicatorId,
          year: currentYear,
          month,
          actual_value: numVal,
        })
        .select()
        .single()
      if (data) setKpiEntries(prev => [...prev, data])
    }
  }

  // ── Milestone state helper ───────────────────────────────────────

  const getMilestoneState = (ms: Milestone, idx: number) => {
    if (ms.status === 'COMPLETE') return 'completed'
    if (!milestones.slice(0, idx).some(m => m.status !== 'COMPLETE')) return 'current'
    return 'pending'
  }

  // ── KPI helpers ──────────────────────────────────────────────────

  const getKpiValue = (indicatorId: string, month: number): number | null => {
    const entry = kpiEntries.find(
      e => e.leading_indicator_id === indicatorId && e.month === month
    )
    return entry?.actual_value ?? null
  }

  const getYtd = (indicatorId: string): number => {
    return kpiEntries
      .filter(e => e.leading_indicator_id === indicatorId)
      .reduce((sum, e) => sum + (e.actual_value || 0), 0)
  }

  const getTrendArrow = (indicatorId: string): 'up' | 'down' | null => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // 1-indexed
    // Last 3 months vs prior 3 months
    const last3 = [currentMonth, currentMonth - 1, currentMonth - 2].filter(m => m >= 1)
    const prior3 = [currentMonth - 3, currentMonth - 4, currentMonth - 5].filter(m => m >= 1)
    if (last3.length === 0 || prior3.length === 0) return null

    const avgLast = last3.reduce((s, m) => s + (getKpiValue(indicatorId, m) || 0), 0) / last3.length
    const avgPrior = prior3.reduce((s, m) => s + (getKpiValue(indicatorId, m) || 0), 0) / prior3.length
    if (avgLast === avgPrior) return null
    return avgLast > avgPrior ? 'up' : 'down'
  }

  // ── Loading / not found ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="min-h-screen flex items-center justify-center text-shuttle text-sm">
        Goal not found.
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white pb-40">
      <main className="w-full max-w-[960px] mx-auto px-6 py-8 flex flex-col gap-12">

        {/* Breadcrumbs + back */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Link to="/today" className="flex items-center gap-1 text-shuttle hover:text-pastel transition-colors">
              <House size={14} />
            </Link>
            <span className="text-mercury">/</span>
            <Link to="/dashboard" className="text-shuttle hover:text-pastel transition-colors">Dashboard</Link>
            <span className="text-mercury">/</span>
            <span className="text-burnham">{goal.text}</span>
          </nav>
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 pl-3 pr-5 py-2 rounded-full border border-mercury hover:border-burnham/20 bg-transparent hover:bg-gray-50 transition-all"
          >
            <ArrowLeft size={16} className="text-burnham" />
            <span className="text-xs font-bold tracking-wider text-burnham">BACK</span>
          </button>
        </header>

        {/* ── Header ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-burnham">{goal.text}</h1>
          <p className="text-sm text-shuttle">Annual Target: {goal.metric || 'Not set'}</p>
        </section>

        {/* ── Summary Bar ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-mercury pt-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Current Consistency</span>
            <span className="text-2xl font-bold text-burnham">{consistency}%</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Reps YTD</span>
            <span className="text-2xl font-bold text-burnham">{repsYTD}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Next Critical Milestone</span>
            <span className="text-sm font-bold text-burnham leading-tight">{nextMilestoneStr}</span>
          </div>
        </section>

        {/* ── Milestone Roadmap ─────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Milestone Roadmap</h3>
          {milestones.length === 0 ? (
            <p className="text-sm text-shuttle">No milestones yet. Set them up in Strategy.</p>
          ) : (
            <div className="relative flex flex-col pl-4">
              <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-mercury -z-10" />
              {milestones.map((ms, idx) => {
                const state = getMilestoneState(ms, idx)
                return (
                  <div
                    key={ms.id}
                    className={`group relative flex items-start gap-4 ${
                      state === 'current'
                        ? 'py-4 px-3 -mx-3 rounded-lg bg-gossip/20'
                        : 'py-3'
                    } transition-all`}
                  >
                    {/* Circle */}
                    <div className="flex-shrink-0 relative z-10 bg-white py-0.5">
                      {state === 'completed' && (
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-pastel text-white">
                          <Check size={12} weight="bold" />
                        </div>
                      )}
                      {state === 'current' && (
                        <div className="relative flex items-center justify-center w-7 h-7">
                          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-pastel opacity-30" />
                          <div className="relative flex items-center justify-center w-7 h-7 rounded-full border-2 border-pastel bg-white">
                            <div className="w-2 h-2 rounded-full bg-pastel" />
                          </div>
                        </div>
                      )}
                      {state === 'pending' && (
                        <div className="flex items-center justify-center w-7 h-7 rounded-full border border-mercury bg-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex justify-between items-center gap-2 pt-1">
                      <InlineText
                        value={ms.text}
                        onSave={v => updateMilestoneText(ms.id, v)}
                        className={`text-sm ${
                          state === 'completed'
                            ? 'text-shuttle line-through'
                            : state === 'current'
                            ? 'font-bold text-burnham'
                            : 'text-shuttle'
                        }`}
                      />
                      <InlineDate
                        value={ms.target_date || ''}
                        onSave={v => updateMilestoneDate(ms.id, v)}
                        className={`text-xs flex-shrink-0 ${
                          state === 'current' ? 'font-bold text-burnham' : 'text-shuttle'
                        }`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Linked Habits — Streak Dot Grid ──────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Linked Habits</h3>
            <span className="text-xs text-shuttle">Last 30 Days</span>
          </div>

          {habitStats.length === 0 ? (
            <p className="text-sm text-shuttle">No habits linked. Add them in Strategy.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {habitStats.map((hs, idx) => (
                <div key={hs.habit.id}>
                  <div className="flex flex-col gap-2 mb-2">
                    <h4 className="text-sm font-bold text-burnham">{hs.habit.text}</h4>
                    <HabitDotGrid30 logs={hs.logs} />
                    <p className="text-xs text-shuttle">
                      Current Streak: {hs.streak} Days &middot; Success Rate: {hs.successRate}%
                    </p>
                  </div>
                  {idx < habitStats.length - 1 && <div className="w-full h-px bg-mercury mt-4" />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Leading Indicators YTD Table ──────────────────────── */}
        {indicators.length > 0 && (
          <section className="flex flex-col gap-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Leading Indicators YTD</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-mercury">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-shuttle py-2 pr-3 min-w-[140px]">Indicator</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-shuttle py-2 px-2 min-w-[40px]">Unit</th>
                    {MONTH_LETTERS.map((m, i) => (
                      <th key={i} className="text-center text-[10px] font-semibold uppercase tracking-widest text-shuttle py-2 px-1 min-w-[40px]">{m}</th>
                    ))}
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-shuttle py-2 px-2 min-w-[50px]">YTD</th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-shuttle py-2 px-1 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map(ind => {
                    const trend = getTrendArrow(ind.id)
                    const ytd = getYtd(ind.id)
                    return (
                      <tr key={ind.id} className="border-b border-mercury/50">
                        <td className="py-2 pr-3 text-sm text-burnham font-medium">
                          {ind.name}
                          {ind.target != null && (
                            <span className="text-xs text-shuttle ml-1">(target: {ind.target}/mo)</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs text-shuttle">{ind.unit || ''}</td>
                        {Array.from({ length: 12 }).map((_, mi) => {
                          const month = mi + 1
                          const val = getKpiValue(ind.id, month)
                          return (
                            <td key={mi} className="py-1 px-0.5">
                              <input
                                type="number"
                                defaultValue={val ?? ''}
                                onBlur={e => upsertKpi(ind.id, month, e.target.value)}
                                className="w-full min-w-[36px] text-center text-sm text-burnham bg-transparent border border-transparent hover:border-mercury focus:border-pastel focus:bg-white rounded px-0.5 py-1 outline-none transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            </td>
                          )
                        })}
                        <td className="py-2 px-2 text-center text-sm font-bold text-burnham">{ytd || ''}</td>
                        <td className="py-2 px-1 text-center">
                          {trend === 'up' && <TrendUp size={14} className="text-pastel inline" />}
                          {trend === 'down' && <TrendDown size={14} className="text-red-400 inline" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Execution Notes ──────────────────────────────────── */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Execution Notes</h3>
            {savedAt && (
              <span className="text-xs text-shuttle">Saved {formatTimeAgo(savedAt)}</span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="Identify blockers, pivot notes, or resource needs..."
            className="w-full min-h-[140px] p-4 rounded-lg border border-mercury focus:border-pastel focus:ring-0 bg-white font-mono text-sm text-burnham placeholder:text-shuttle/40 resize-none outline-none transition-colors"
          />
        </section>

      </main>
    </div>
  )
}
