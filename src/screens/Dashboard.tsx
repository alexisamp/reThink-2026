// src/screens/Dashboard.tsx
import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { House, ArrowRight, Lightning } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Milestone, LeadingIndicator, Habit, HabitLog, Review } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Wed', 'Fri']

// Build 48 weeks × 7 days heatmap data from habit logs
function buildHeatmap(logs: HabitLog[], _goalId: string, year: number) {
  // Get start of this year
  const startOfYear = new Date(year, 0, 1)
  // Build a set of dates with logged completions for this goal's habits
  const logSet = new Set(logs.filter(l => l.value === 1).map(l => l.log_date))

  const cells: number[] = [] // 0-4 intensity per day
  // 48 weeks = 336 days, starting from Jan 1
  for (let week = 0; week < 48; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startOfYear)
      date.setDate(1 + week * 7 + day)
      const dateStr = date.toISOString().split('T')[0]
      if (logSet.has(dateStr)) {
        cells.push(Math.random() > 0.5 ? 3 : 2) // completed = level 2-3
      } else if (date > new Date()) {
        cells.push(-1) // future = empty
      } else {
        cells.push(0) // missed
      }
    }
  }
  return cells
}

const LEVEL_CLASSES = [
  'bg-[#EBEDF0]',   // 0
  'bg-[#9BE9A8]',   // 1
  'bg-[#79D65E]',   // 2
  'bg-[#30A14E]',   // 3
  'bg-[#216E39]',   // 4
]

function Heatmap({ cells }: { cells: number[] }) {
  // Render 48 columns × 7 rows
  const weeks: number[][] = []
  for (let w = 0; w < 48; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-4 items-start">
        <div className="flex flex-col justify-between h-[74px] text-[9px] font-medium text-shuttle leading-none py-[3px]">
          {DAYS.map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="flex flex-col gap-1 flex-1 overflow-hidden">
          <div className="flex justify-between text-[9px] text-burnham font-medium w-full">
            {MONTHS.map(m => <span key={m}>{m}</span>)}
          </div>
          <div className="flex gap-[2px] w-full">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px] flex-1">
                {week.map((level, di) => (
                  <div
                    key={di}
                    className={`w-full h-2.5 rounded-[1px] ${
                      level < 0 ? 'bg-[#EBEDF0] opacity-20' : LEVEL_CLASSES[Math.min(level, 4)]
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end pt-5 min-w-[32px]">
          <div className="px-2 py-0.5 bg-burnham text-white rounded-md text-[9px] font-bold w-full text-center">2026</div>
          <div className="px-2 py-0.5 text-mercury rounded-md text-[9px] font-medium w-full text-center">2025</div>
          <div className="px-2 py-0.5 text-mercury rounded-md text-[9px] font-medium w-full text-center">2024</div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const [goals, setGoals] = useState<Goal[]>([])
  const [filteredGoal, setFilteredGoal] = useState<string | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      // Get workbook
      const { data: wb } = await supabase
        .from('workbooks')
        .select('id')
        .eq('user_id', user.id)
        .eq('year', currentYear)
        .maybeSingle()
      if (!wb) { setLoading(false); return }

      // Goals
      const { data: goalsData } = await supabase
        .from('goals')
        .select('*')
        .eq('workbook_id', wb.id)
        .eq('goal_type', 'ACTIVE')
        .order('created_at')
      const g = goalsData || []
      setGoals(g)

      if (g.length === 0) { setLoading(false); return }
      const goalIds = g.map(x => x.id)

      // Parallel loads
      const [msRes, indRes, habitRes, reviewRes] = await Promise.all([
        supabase.from('milestones').select('*').in('goal_id', goalIds).order('target_date'),
        supabase.from('leading_indicators').select('*').in('goal_id', goalIds),
        supabase.from('habits').select('*').in('goal_id', goalIds).eq('is_active', true),
        supabase.from('reviews').select('*').eq('user_id', user.id)
          .gte('review_date', `${currentYear}-01-01`)
          .lte('review_date', `${currentYear}-12-31`),
      ])
      setMilestones(msRes.data || [])
      setIndicators(indRes.data || [])
      setHabits(habitRes.data || [])
      setReviews(reviewRes.data || [])

      // Habit logs for year
      if (habitRes.data && habitRes.data.length > 0) {
        const habitIds = habitRes.data.map(h => h.id)
        const { data: logs } = await supabase
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('log_date', `${currentYear}-01-01`)
          .lte('log_date', `${currentYear}-12-31`)
        setHabitLogs(logs || [])
      }

      setLoading(false)
    }
    load()
  }, [user, currentYear])

  // Computed metrics
  const avgEnergy = useMemo(() => {
    const valid = reviews.filter(r => r.energy_level)
    if (!valid.length) return 0
    return (valid.reduce((s, r) => s + (r.energy_level || 0), 0) / valid.length).toFixed(1)
  }, [reviews])

  const totalHabitDays = useMemo(() => {
    return new Set(habitLogs.filter(l => l.value === 1).map(l => l.log_date)).size
  }, [habitLogs])

  const completedMilestones = milestones.filter(m => m.status === 'COMPLETE').length
  const totalMilestones = milestones.length

  const consistencyPct = useMemo(() => {
    const totalPossible = Math.floor((Date.now() - new Date(currentYear, 0, 1).getTime()) / 86400000)
    if (totalPossible <= 0) return 0
    return Math.round((totalHabitDays / Math.max(totalPossible, 1)) * 100)
  }, [habitLogs, currentYear, totalHabitDays])

  const displayGoals = filteredGoal
    ? goals.filter(g => g.id === filteredGoal)
    : goals

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-burnham pb-40">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Top nav: breadcrumbs + filter pills */}
        <div className="pt-8 pb-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xs font-medium text-shuttle">
            <Link to="/today" className="flex items-center gap-1 hover:text-burnham transition-colors">
              <House size={12} />
            </Link>
            <span>/</span>
            <span className="text-burnham font-semibold">Dashboard</span>
          </div>
          <div className="flex items-center p-1 bg-gray-50 rounded-full gap-1">
            <button
              onClick={() => setFilteredGoal(null)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${
                filteredGoal === null ? 'bg-burnham text-white shadow-sm' : 'text-shuttle hover:text-burnham'
              }`}
            >
              All Goals
            </button>
            {goals.map(g => (
              <button
                key={g.id}
                onClick={() => setFilteredGoal(g.id)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  filteredGoal === g.id ? 'bg-burnham text-white shadow-sm' : 'text-shuttle hover:text-burnham'
                }`}
              >
                {g.text.length > 10 ? g.text.slice(0, 10) + '…' : g.text}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics Header */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-b border-mercury">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-shuttle text-[10px] font-bold tracking-widest uppercase">
              Avg Energy
            </div>
            <div className="flex items-baseline gap-2">
              <div className="flex items-center gap-1 text-burnham text-4xl font-bold tracking-tight">
                <Lightning size={28} weight="fill" />
                {avgEnergy}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-bold tracking-widest uppercase">Consistency</div>
            <p className="text-burnham text-4xl font-bold tracking-tight">{consistencyPct}%</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-bold tracking-widest uppercase">Velocity</div>
            <div className="flex items-baseline gap-1">
              <p className="text-burnham text-4xl font-bold tracking-tight">{totalHabitDays}</p>
              <span className="text-shuttle text-sm">/ 365</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-bold tracking-widest uppercase">Deep Work</div>
            <div className="flex items-baseline gap-2">
              <p className="text-burnham text-4xl font-bold tracking-tight">{reviews.length}</p>
              <span className="text-shuttle text-sm font-normal">days</span>
            </div>
          </div>
        </section>

        {/* Progress bars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-b border-mercury">
          {[
            {
              label: 'Strategic Advance',
              value: completedMilestones > 0 ? Math.round((completedMilestones / Math.max(totalMilestones, 1)) * 100) : 0,
              display: `${completedMilestones > 0 ? Math.round((completedMilestones / Math.max(totalMilestones, 1)) * 100) : 0}%`
            },
            {
              label: 'Milestone Success',
              value: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
              display: `${completedMilestones}/${totalMilestones}`
            },
            {
              label: 'System Consistency',
              value: consistencyPct,
              display: `${consistencyPct}%`
            },
          ].map(({ label, value, display }) => (
            <div key={label} className="flex flex-col gap-3">
              <div className="flex justify-between text-[10px] font-bold tracking-widest uppercase text-shuttle">
                <span>{label}</span>
                <span className="text-burnham">{display}</span>
              </div>
              <div className="h-[2px] w-full bg-mercury/30 overflow-hidden">
                <div className="h-full bg-[#79D65E] transition-all" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </section>

        {/* Goals Heatmaps */}
        <section className="flex flex-col gap-12 pt-12">
          <div className="flex items-baseline justify-between border-b border-mercury pb-4">
            <h2 className="text-2xl text-burnham font-semibold tracking-tight">Active Strategic Goals</h2>
            <span className="text-xs text-shuttle">Performance Audit {currentYear}</span>
          </div>

          <div className="flex flex-col gap-16">
            {displayGoals.map((goal, i) => {
              const goalHabits = habits.filter(h => h.goal_id === goal.id)
              const goalLogs = habitLogs.filter(l => goalHabits.some(h => h.id === l.habit_id))
              const goalMilestones = milestones.filter(m => m.goal_id === goal.id)
              const goalIndicators = indicators.filter(ind => ind.goal_id === goal.id)
              const heatmapCells = buildHeatmap(goalLogs, goal.id, currentYear)
              const completedCount = goalLogs.filter(l => l.value === 1).length

              return (
                <div key={goal.id}>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                    {/* Left: name + progress */}
                    <div className="lg:col-span-3 flex flex-col h-full pt-1 pr-4">
                      <div className="mb-6">
                        <h3 className="text-lg font-bold text-burnham">{goal.text}</h3>
                        {goal.metric && <p className="text-xs text-shuttle mt-1 font-medium">{goal.metric}</p>}
                      </div>
                      <div className="space-y-6">
                        {goalIndicators.slice(0, 3).map(ind => (
                          <div key={ind.id} className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-end">
                              <span className="text-[11px] text-shuttle">{ind.name}</span>
                              <span className="text-[10px] font-medium text-shuttle">
                                {ind.target ? `${ind.target}` : '—'}
                              </span>
                            </div>
                            <div className="h-[1px] w-full bg-mercury/50 overflow-hidden">
                              <div className="h-full bg-[#79D65E]" style={{ width: '45%' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Center: heatmap */}
                    <div className="lg:col-span-6 flex flex-col h-full">
                      <div className="flex justify-between items-end mb-3 px-1">
                        <span className="text-sm font-semibold text-burnham">
                          {completedCount} habit completions in {currentYear}
                        </span>
                      </div>
                      <div className="flex-1 p-4 bg-white/50 rounded-sm">
                        <Heatmap cells={heatmapCells} />
                      </div>
                      {/* Habits list below heatmap */}
                      <div className="mt-4 pt-3 border-t border-mercury/30 flex flex-col gap-1.5 w-full pl-14 pr-8">
                        {goalHabits.slice(0, 3).map(h => (
                          <div key={h.id} className="flex items-center justify-between text-[9px]">
                            <span className="font-medium text-shuttle">{h.text}</span>
                            <span className="text-shuttle opacity-70 capitalize">{h.frequency.toLowerCase()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: milestones + CTA */}
                    <div className="lg:col-span-3 flex flex-col justify-between h-full pt-1 pl-6 border-l border-mercury/50">
                      <div className="flex flex-col gap-6 pl-4 pt-1 relative">
                        <div className="absolute left-0 top-2 bottom-8 w-[1px] bg-mercury" />
                        {goalMilestones.slice(0, 4).map((ms, mi) => {
                          const date = ms.target_date ? new Date(ms.target_date) : null
                          const dateStr = date ? `Due ${MONTHS[date.getMonth()]} ${date.getDate()}` : ''
                          return (
                            <div key={ms.id} className={`relative ${mi > 0 ? 'opacity-60' : ''}`}>
                              <div className="absolute -left-[21px] top-1 bg-white p-0.5">
                                <div className={`w-3 h-3 rounded-full ${
                                  ms.status === 'COMPLETE'
                                    ? 'bg-[#79D65E] border-2 border-white ring-1 ring-[#79D65E]'
                                    : 'border border-mercury bg-white'
                                }`} />
                              </div>
                              <p className={`text-xs font-medium ${ms.status === 'COMPLETE' ? 'font-semibold' : ''} text-burnham`}>
                                {ms.text}
                              </p>
                              <p className="text-[10px] text-shuttle mt-0.5">{dateStr}</p>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={() => navigate(`/dashboard/goal/${goal.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-mercury text-[10px] font-semibold text-shuttle hover:text-burnham hover:bg-mercury/20 transition-all group"
                        >
                          VIEW DETAILS <ArrowRight size={10} weight="bold" className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {i < displayGoals.length - 1 && <div className="h-[0.5px] bg-mercury w-full mt-12" />}
                </div>
              )
            })}

            {displayGoals.length === 0 && (
              <p className="text-sm text-shuttle text-center py-12">No active goals yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
