// src/screens/Monthly.tsx
import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { House, CaretDown, ArrowRight, ArrowSquareOut } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  Goal,
  LeadingIndicator,
  Habit,
  HabitLog,
  Milestone,
  MonthlyPlan,
  MonthlyKpiEntry,
} from '@/types'

// Month abbreviations
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Monthly() {
  const { user } = useAuth()
  const { goalId } = useParams()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1 // 1-based

  const [goals, setGoals] = useState<Goal[]>([])
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null)
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [kpiEntries, setKpiEntries] = useState<MonthlyKpiEntry[]>([])
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])

  // Load goals
  useEffect(() => {
    if (!user) return
    supabase
      .from('workbooks')
      .select('id')
      .eq('user_id', user.id)
      .eq('year', currentYear)
      .maybeSingle()
      .then(({ data: wb }) => {
        if (!wb) {
          setLoading(false)
          return
        }
        supabase
          .from('goals')
          .select('*')
          .eq('workbook_id', wb.id)
          .eq('goal_type', 'ACTIVE')
          .order('position')
          .then(({ data }) => {
            if (data) {
              setGoals(data)
              const found = goalId ? data.find(g => g.id === goalId) : data[0]
              setActiveGoal(found || data[0] || null)
            }
            setLoading(false)
          })
      })
  }, [user, currentYear, goalId])

  // Load data for active goal
  useEffect(() => {
    if (!activeGoal || !user) return

    const load = async () => {
      const [indRes, habitRes, msRes] = await Promise.all([
        supabase
          .from('leading_indicators')
          .select('*')
          .eq('goal_id', activeGoal.id),
        supabase
          .from('habits')
          .select('*')
          .eq('goal_id', activeGoal.id)
          .eq('is_active', true),
        supabase
          .from('milestones')
          .select('*')
          .eq('goal_id', activeGoal.id)
          .order('target_date'),
      ])

      setIndicators(indRes.data || [])
      setHabits(habitRes.data || [])
      setMilestones(msRes.data || [])

      // KPI entries for this year
      if (indRes.data && indRes.data.length > 0) {
        const ids = indRes.data.map(i => i.id)
        const { data: kpis } = await supabase
          .from('monthly_kpi_entries')
          .select('*')
          .in('leading_indicator_id', ids)
          .eq('year', currentYear)
        setKpiEntries(kpis || [])
      } else {
        setKpiEntries([])
      }

      // Habit logs for current month
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const lastDay = new Date(currentYear, currentMonth, 0).getDate()
      const endOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      if (habitRes.data && habitRes.data.length > 0) {
        const habitIds = habitRes.data.map(h => h.id)
        const { data: logs } = await supabase
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('log_date', startOfMonth)
          .lte('log_date', endOfMonth)
        setHabitLogs(logs || [])
      }

      // Monthly plan
      const { data: plan } = await supabase
        .from('monthly_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_id', activeGoal.id)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .maybeSingle()
      setMonthlyPlan(plan)
      setNotes(plan?.reflection || '')
    }

    load()
  }, [activeGoal, user, currentYear, currentMonth])

  const getKpiValue = (indicatorId: string, month: number): number | null => {
    const entry = kpiEntries.find(
      e => e.leading_indicator_id === indicatorId && e.month === month
    )
    return entry?.actual_value ?? null
  }

  const handleKpiChange = async (indicatorId: string, month: number, value: string) => {
    if (!user) return
    const numVal = value === '' ? null : Number(value)

    // Optimistic update
    setKpiEntries(prev => {
      const existing = prev.find(
        e => e.leading_indicator_id === indicatorId && e.month === month
      )
      if (existing) {
        return prev.map(e =>
          e.leading_indicator_id === indicatorId && e.month === month
            ? { ...e, actual_value: numVal }
            : e
        )
      }
      return [
        ...prev,
        {
          id: `optimistic-${indicatorId}-${month}`,
          user_id: user.id,
          leading_indicator_id: indicatorId,
          year: currentYear,
          month,
          actual_value: numVal,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
    })

    await supabase.from('monthly_kpi_entries').upsert(
      {
        user_id: user.id,
        leading_indicator_id: indicatorId,
        year: currentYear,
        month,
        actual_value: numVal,
      },
      { onConflict: 'user_id,leading_indicator_id,year,month' }
    )
  }

  const handleSaveNotes = async () => {
    if (!user || !activeGoal) return
    setSaving(true)
    await supabase.from('monthly_plans').upsert(
      {
        user_id: user.id,
        goal_id: activeGoal.id,
        year: currentYear,
        month: currentMonth,
        reflection: notes,
      },
      { onConflict: 'user_id,goal_id,year,month' }
    )
    setSaving(false)
  }

  const getDaysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate()

  const toggleMilestone = async (msId: string) => {
    const ms = milestones.find(m => m.id === msId)
    if (!ms) return
    const newStatus = ms.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
    setMilestones(prev => prev.map(m => m.id === msId ? { ...m, status: newStatus } : m))
    await supabase.from('milestones').update({ status: newStatus }).eq('id', msId)
  }

  const getHabitConsistency = (habit: Habit) => {
    const logs = habitLogs.filter(l => l.habit_id === habit.id && l.value === 1)
    const total =
      habit.frequency === 'WEEKLY'
        ? Math.ceil(getDaysInMonth(currentMonth, currentYear) / 7)
        : getDaysInMonth(currentMonth, currentYear)
    return { done: logs.length, total }
  }

  const switchGoal = (goal: Goal) => {
    setActiveGoal(goal)
    navigate(`/monthly/${goal.id}`)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    )
  }

  if (!activeGoal) {
    return (
      <div className="h-screen flex items-center justify-center text-shuttle text-sm">
        No active goals. Complete your assessment first.
      </div>
    )
  }

  const completedMilestones = milestones.filter(m => m.status === 'COMPLETE').length
  const totalMilestones = milestones.length

  return (
    <div className="h-screen flex overflow-hidden text-burnham relative">
      {/* Goal switcher pill — floats above the AppShell nav */}
      <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-40">
        <div className="bg-white/90 backdrop-blur-md border border-mercury shadow-sm rounded-full p-1 flex items-center gap-1">
          {goals.map(goal => (
            <button
              key={goal.id}
              onClick={() => switchGoal(goal)}
              className={`px-5 py-2 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                activeGoal?.id === goal.id
                  ? 'bg-mercury/30 ring-1 ring-mercury text-burnham shadow-sm'
                  : 'text-shuttle hover:text-burnham hover:bg-white/50'
              }`}
            >
              {goal.text.length > 12
                ? goal.text.slice(0, 12) + '\u2026'
                : goal.text.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main panel — 70% */}
      <main className="w-[70%] h-full flex flex-col bg-white">
        <div className="flex-1 overflow-y-auto px-16 py-12 pb-40">
          <div className="max-w-5xl mx-auto w-full">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs font-medium text-shuttle mb-6">
              <Link
                to="/today"
                className="flex items-center gap-1 hover:text-burnham transition-colors"
              >
                <House size={12} />
              </Link>
              <span>/</span>
              <Link to="/strategy" className="hover:text-burnham transition-colors">
                Strategy
              </Link>
              <span>/</span>
              <span className="text-burnham">{activeGoal.text}</span>
            </div>

            {/* Goal header */}
            <div className="flex items-start justify-between border-b border-mercury pb-6 mb-10">
              <div>
                <h1 className="text-2xl font-medium text-burnham">{activeGoal.text}</h1>
                {activeGoal.metric && (
                  <p className="text-sm text-shuttle mt-1">{activeGoal.metric}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 border border-transparent hover:bg-gray-100 transition-colors">
                  <span className="text-[11px] font-semibold text-shuttle tracking-wider uppercase">
                    {MONTH_NAMES[currentMonth - 1]} {currentYear}
                  </span>
                  <CaretDown size={10} className="text-shuttle" weight="bold" />
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-16">
              {/* KPI Table */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[11px] font-bold text-shuttle uppercase tracking-[0.2em]">
                    Key Performance Indicators
                  </h3>
                  <span className="text-[11px] font-mono text-shuttle">FY {currentYear}</span>
                </div>

                {indicators.length === 0 ? (
                  <p className="text-sm text-shuttle">
                    No leading indicators added yet. Set them up in Strategy.
                  </p>
                ) : (
                  <div className="w-full text-xs overflow-x-auto">
                    {/* Header row */}
                    <div
                      className="grid gap-1 mb-4 text-shuttle font-mono text-[10px] uppercase"
                      style={{ gridTemplateColumns: '140px repeat(12, 1fr)' }}
                    >
                      <div className="font-semibold text-shuttle pl-2">Metric</div>
                      {MONTHS.map(m => (
                        <div key={m} className="text-center">
                          {m}
                        </div>
                      ))}
                    </div>

                    {/* Data rows */}
                    <div className="space-y-1">
                      {indicators.map((ind, idx) => {
                        const monthlyTarget = ind.target
                          ? Math.round(ind.target / 12)
                          : null
                        return (
                          <div
                            key={ind.id}
                            className={`grid gap-1 items-center py-3 -mx-2 px-2 ${
                              idx === 0
                                ? 'border-t border-b border-mercury/50 bg-mercury/10'
                                : 'border-b border-mercury/30'
                            }`}
                            style={{ gridTemplateColumns: '140px repeat(12, 1fr)' }}
                          >
                            <div className="pl-2">
                              <span
                                className={`block ${
                                  idx === 0
                                    ? 'text-sm font-semibold text-burnham'
                                    : 'text-xs font-medium text-burnham'
                                }`}
                              >
                                {ind.name}
                              </span>
                              <span className="text-[10px] text-shuttle mt-0.5 block">
                                {idx === 0 ? 'Primary' : 'Leading'}
                              </span>
                            </div>
                            {MONTHS.map((_, mIdx) => {
                              const m = mIdx + 1
                              const actual = getKpiValue(ind.id, m)
                              const isPast = m <= currentMonth
                              return (
                                <div
                                  key={m}
                                  className={`text-center group font-mono ${
                                    !isPast ? 'opacity-30' : ''
                                  }`}
                                >
                                  {isPast ? (
                                    <input
                                      type="number"
                                      value={actual ?? ''}
                                      onChange={e =>
                                        handleKpiChange(ind.id, m, e.target.value)
                                      }
                                      className="w-full text-center bg-transparent border-none focus:outline-none text-[11px] font-semibold text-burnham focus:bg-gossip/30 rounded transition-colors"
                                      placeholder="-"
                                    />
                                  ) : (
                                    <div className="font-semibold text-burnham text-[11px]">
                                      -
                                    </div>
                                  )}
                                  <div className="text-[9px] text-gray-300 mt-0.5 group-hover:text-shuttle transition-colors">
                                    {monthlyTarget ?? '-'}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Supporting Habits */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold text-shuttle uppercase tracking-[0.2em]">
                    Supporting Habits
                  </h3>
                  <span className="text-[11px] font-mono text-shuttle">
                    {MONTH_NAMES[currentMonth - 1]}
                  </span>
                </div>
                <div className="space-y-1">
                  {habits.length === 0 ? (
                    <p className="text-sm text-shuttle">
                      No habits linked. Add them in Strategy.
                    </p>
                  ) : (
                    habits.map(habit => {
                      const { done, total } = getHabitConsistency(habit)
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0
                      return (
                        <div
                          key={habit.id}
                          className="flex items-center gap-4 py-3 border-b border-mercury/50 hover:bg-gray-50 px-2 -mx-2 rounded transition-colors"
                        >
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-baseline gap-3">
                              <span className="text-sm font-medium text-burnham">
                                {habit.text}
                              </span>
                              <span className="text-[9px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded tracking-wide uppercase">
                                {habit.frequency}
                              </span>
                            </div>
                            <div className="flex items-center gap-6">
                              <span className="text-[10px] font-mono text-shuttle">
                                {done}/{total}{' '}
                                {habit.frequency === 'WEEKLY' ? 'weeks' : 'days'}
                              </span>
                              <div className="w-20 h-[1px] bg-mercury rounded-full overflow-hidden">
                                <div
                                  className="bg-pastel h-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              {/* Milestones Timeline */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold text-shuttle uppercase tracking-[0.2em]">
                    Milestones Timeline
                  </h3>
                </div>
                <div className="space-y-4">
                  {milestones.length === 0 ? (
                    <p className="text-sm text-shuttle">
                      No milestones yet. Add them in Strategy.
                    </p>
                  ) : (
                    milestones.map(ms => {
                      const date = ms.target_date ? new Date(ms.target_date) : null
                      const dateStr = date
                        ? `${MONTHS[date.getMonth()]} ${date.getDate()}`
                        : ''
                      return (
                        <div
                          key={ms.id}
                          className={`flex items-start gap-3 py-2 px-2 -mx-2 rounded transition-colors ${
                            ms.status === 'COMPLETE' ? 'opacity-30' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={ms.status === 'COMPLETE'}
                            onChange={() => toggleMilestone(ms.id)}
                            className="custom-checkbox mt-0.5 focus:ring-0 cursor-pointer"
                          />
                          <div className="flex-1 flex justify-between items-baseline">
                            <span
                              className={`text-sm font-medium ${
                                ms.status === 'COMPLETE'
                                  ? 'text-shuttle line-through decoration-mercury'
                                  : 'text-burnham'
                              }`}
                            >
                              {ms.text}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-shuttle">
                                {dateStr}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Right aside — 30% */}
      <aside className="w-[30%] min-w-[280px] bg-white border-l border-mercury h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-burnham">Monthly Recap</h2>
          <Link
            to={`/dashboard/goal/${activeGoal.id}`}
            className="text-shuttle hover:text-burnham transition-colors p-1 hover:bg-gray-100 rounded-full"
          >
            <ArrowSquareOut size={16} />
          </Link>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-2 space-y-10 pb-6">
          {/* Progress bars */}
          <div>
            <h3 className="text-[11px] font-bold text-shuttle uppercase tracking-[0.2em] mb-6">
              Progress
            </h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-medium text-burnham">Milestones</span>
                  <span className="text-[10px] font-mono text-shuttle">
                    {completedMilestones}/{totalMilestones}
                  </span>
                </div>
                <div className="h-[3px] w-full bg-mercury rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pastel transition-all"
                    style={{
                      width:
                        totalMilestones > 0
                          ? `${(completedMilestones / totalMilestones) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
              </div>
              {(() => {
                const habitsDone = habitLogs.filter(l => l.value === 1).length
                const habitsTotal = habits.reduce((sum, h) => {
                  return sum + (h.frequency === 'WEEKLY'
                    ? Math.ceil(getDaysInMonth(currentMonth, currentYear) / 7)
                    : getDaysInMonth(currentMonth, currentYear))
                }, 0)
                const habitsPct = habitsTotal > 0 ? Math.round((habitsDone / habitsTotal) * 100) : 0
                return (
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-medium text-burnham">Habits</span>
                      <span className="text-[10px] font-mono text-shuttle">
                        {habitsDone}/{habitsTotal}
                      </span>
                    </div>
                    <div className="h-[3px] w-full bg-mercury rounded-full overflow-hidden">
                      <div className="h-full bg-pastel transition-all" style={{ width: `${habitsPct}%` }} />
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Reflection notes */}
          <div>
            <h3 className="text-[11px] font-bold text-shuttle uppercase tracking-[0.2em] mb-4">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Reflections on this month's progress..."
              className="w-full bg-white border border-mercury rounded-lg p-4 text-xs leading-relaxed text-burnham h-40 resize-none placeholder-gray-400 focus:border-mercury focus:ring-1 focus:ring-mercury outline-none"
            />
          </div>
        </div>

        {/* Confirm CTA */}
        <div className="p-8 border-t border-mercury bg-white">
          <button
            onClick={handleSaveNotes}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-[#002817] text-white py-4 rounded-lg text-[13px] font-semibold tracking-wide transition-all shadow-sm hover:shadow-md disabled:opacity-60"
          >
            <span>{saving ? 'SAVING\u2026' : 'CONFIRM & COMMIT'}</span>
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </aside>
    </div>
  )
}
