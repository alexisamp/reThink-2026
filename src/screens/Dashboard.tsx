// src/screens/Dashboard.tsx
import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { House, ArrowRight, Lightning, TrendUp, TrendDown, Minus } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Milestone, LeadingIndicator, Habit, HabitLog, Review, MonthlyKpiEntry, Todo } from '@/types'
import { getMomentumScore, getMomentumBadge } from '@/lib/momentum'
import AICoach from '@/components/AICoach'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Wed', 'Fri']

// Build 48 weeks × 7 days heatmap data from habit logs
function buildHeatmap(logs: HabitLog[], habitCount: number, year: number) {
  const startOfYear = new Date(year, 0, 1)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const dateCounts = new Map<string, number>()
  for (const l of logs) {
    if (l.value === 1) {
      dateCounts.set(l.log_date, (dateCounts.get(l.log_date) || 0) + 1)
    }
  }

  const cells: number[] = []
  for (let week = 0; week < 48; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startOfYear)
      date.setDate(1 + week * 7 + day)
      if (date > today) {
        cells.push(-1)
      } else {
        const count = dateCounts.get(date.toISOString().split('T')[0]) || 0
        if (count === 0) cells.push(0)
        else if (habitCount <= 1) cells.push(3)
        else {
          const pct = count / habitCount
          if (pct >= 0.9) cells.push(4)
          else if (pct >= 0.6) cells.push(3)
          else if (pct >= 0.3) cells.push(2)
          else cells.push(1)
        }
      }
    }
  }
  return cells
}

const LEVEL_CLASSES = [
  'bg-[#EBEDF0]',
  'bg-[#9BE9A8]',
  'bg-[#79D65E]',
  'bg-[#30A14E]',
  'bg-[#216E39]',
]

function Heatmap({ cells }: { cells: number[] }) {
  const weeks: number[][] = []
  for (let w = 0; w < 48; w++) weeks.push(cells.slice(w * 7, w * 7 + 7))
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

// Simple SVG bar chart: hours 6am-7pm vs completion count
function ProductivityBars({ todos }: { todos: Todo[] }) {
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 6) // 6-19
  const counts = new Array(14).fill(0)

  for (const t of todos) {
    if (!t.completed_at) continue
    const h = new Date(t.completed_at).getHours()
    const idx = h - 6
    if (idx >= 0 && idx < 14) counts[idx]++
  }

  const maxCount = Math.max(...counts, 1)
  const W = 340
  const H = 80
  const barW = Math.floor((W - 13 * 2) / 14)

  return (
    <div>
      <p className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Productivity Window</p>
      <p className="text-[9px] text-shuttle/60 mb-3">Tasks completed by hour of day</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 16}`} className="overflow-visible">
        {HOURS.map((h, i) => {
          const barH = Math.max(2, Math.round((counts[i] / maxCount) * H))
          const x = i * (barW + 2)
          return (
            <g key={h}>
              <rect
                x={x}
                y={H - barH}
                width={barW}
                height={barH}
                rx={1}
                className="fill-[#79D65E]"
                opacity={counts[i] === 0 ? 0.2 : 0.9}
              />
              {i % 3 === 0 && (
                <text
                  x={x + barW / 2}
                  y={H + 12}
                  textAnchor="middle"
                  fontSize="7"
                  className="fill-shuttle"
                  fontFamily="monospace"
                >
                  {h}h
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {todos.filter(t => t.completed_at).length === 0 && (
        <p className="text-[9px] text-shuttle/40 italic mt-1">No completion timestamps yet</p>
      )}
    </div>
  )
}

// Simple SVG scatter: energy level vs todos completed that day
function EnergyScatter({ reviews, todos }: { reviews: Review[]; todos: Todo[] }) {
  // Count todos completed per date
  const todosByDate = new Map<string, number>()
  for (const t of todos) {
    if (t.completed && t.completed_at) {
      const d = t.completed_at.split('T')[0]
      todosByDate.set(d, (todosByDate.get(d) || 0) + 1)
    }
  }

  const points = reviews
    .filter(r => r.energy_level && r.energy_level > 0)
    .map(r => ({
      x: r.energy_level!,
      y: todosByDate.get(r.date) ?? 0,
    }))
    .filter(p => p.y > 0)

  const maxY = Math.max(...points.map(p => p.y), 5)
  const W = 340
  const H = 80
  const PX = 20  // padding x
  const PY = 8   // padding y

  const toSvgX = (x: number) => PX + ((x - 1) / 9) * (W - 2 * PX)
  const toSvgY = (y: number) => PY + H - ((y / maxY) * H)

  // Simple trend line (linear regression)
  let trendLine: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (points.length >= 3) {
    const n = points.length
    const sumX = points.reduce((s, p) => s + p.x, 0)
    const sumY = points.reduce((s, p) => s + p.y, 0)
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    trendLine = {
      x1: toSvgX(1), y1: toSvgY(slope * 1 + intercept),
      x2: toSvgX(10), y2: toSvgY(slope * 10 + intercept),
    }
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Energy vs Output</p>
      <p className="text-[9px] text-shuttle/60 mb-3">Energy level vs tasks completed per day</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + PY * 2}`} className="overflow-visible">
        {/* X axis labels */}
        {[1, 3, 5, 7, 9].map(n => (
          <text key={n} x={toSvgX(n)} y={H + PY + 10} textAnchor="middle" fontSize="7" className="fill-shuttle" fontFamily="monospace">
            {n}
          </text>
        ))}
        {/* Trend line */}
        {trendLine && (
          <line
            x1={trendLine.x1} y1={trendLine.y1}
            x2={trendLine.x2} y2={trendLine.y2}
            stroke="#79D65E" strokeWidth="1" strokeDasharray="3,2" opacity={0.6}
          />
        )}
        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toSvgX(p.x)}
            cy={toSvgY(p.y)}
            r={Math.min(5, 2 + p.y * 0.5)}
            className="fill-[#79D65E]"
            opacity={0.7}
          />
        ))}
      </svg>
      {points.length === 0 && (
        <p className="text-[9px] text-shuttle/40 italic mt-1">No data yet</p>
      )}
    </div>
  )
}

// Trend badge component
function TrendBadge({ current, prior }: { current: number; prior: number }) {
  if (prior === 0) return null
  const delta = current - prior
  const pct = Math.round(Math.abs(delta / prior) * 100)
  if (pct < 2) return <span className="text-[9px] text-shuttle flex items-center gap-0.5"><Minus size={8} /> —</span>
  if (delta > 0) return <span className="text-[9px] text-emerald-600 flex items-center gap-0.5"><TrendUp size={9} weight="bold" /> +{pct}%</span>
  return <span className="text-[9px] text-red-500 flex items-center gap-0.5"><TrendDown size={9} weight="bold" /> -{pct}%</span>
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
  const [monthlyKpiEntries, setMonthlyKpiEntries] = useState<MonthlyKpiEntry[]>([])
  const [completedTodos, setCompletedTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data: wb } = await supabase
        .from('workbooks').select('id')
        .eq('user_id', user.id).eq('year', currentYear).maybeSingle()
      if (!wb) { setLoading(false); return }

      const { data: goalsData } = await supabase
        .from('goals').select('*')
        .eq('workbook_id', wb.id).eq('goal_type', 'ACTIVE').order('created_at')
      const g = goalsData || []
      setGoals(g)

      if (g.length === 0) { setLoading(false); return }
      const goalIds = g.map(x => x.id)

      const [msRes, indRes, habitRes, reviewRes, todosRes] = await Promise.all([
        supabase.from('milestones').select('*').in('goal_id', goalIds).order('target_date'),
        supabase.from('leading_indicators').select('*').in('goal_id', goalIds),
        supabase.from('habits').select('*').in('goal_id', goalIds).eq('is_active', true),
        supabase.from('reviews').select('*').eq('user_id', user.id)
          .gte('date', `${currentYear}-01-01`).lte('date', `${currentYear}-12-31`),
        supabase.from('todos').select('*').eq('user_id', user.id)
          .eq('completed', true).gte('created_at', `${currentYear}-01-01T00:00:00`),
      ])
      setMilestones(msRes.data || [])
      setIndicators(indRes.data || [])
      setHabits(habitRes.data || [])
      setReviews(reviewRes.data || [])
      setCompletedTodos(todosRes.data || [])

      if (indRes.data && indRes.data.length > 0) {
        const indIds = indRes.data.map(i => i.id)
        const { data: kpiData } = await supabase.from('monthly_kpi_entries').select('*')
          .in('leading_indicator_id', indIds).eq('year', currentYear)
        setMonthlyKpiEntries(kpiData || [])
      }

      if (habitRes.data && habitRes.data.length > 0) {
        const habitIds = habitRes.data.map(h => h.id)
        const { data: logs } = await supabase.from('habit_logs').select('*')
          .in('habit_id', habitIds)
          .gte('log_date', `${currentYear}-01-01`).lte('log_date', `${currentYear}-12-31`)
        setHabitLogs(logs || [])
      }

      setLoading(false)
    }
    load()
  }, [user, currentYear])

  // Computed metrics
  const today = new Date()
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30)
  const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(today.getDate() - 60)
  const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0]
  const sixtyStr = sixtyDaysAgo.toISOString().split('T')[0]

  const recentReviews = useMemo(() =>
    reviews.filter(r => r.date >= thirtyStr), [reviews, thirtyStr])
  const priorReviews = useMemo(() =>
    reviews.filter(r => r.date >= sixtyStr && r.date < thirtyStr), [reviews, thirtyStr, sixtyStr])

  const avgEnergy = useMemo(() => {
    const valid = recentReviews.filter(r => r.energy_level)
    if (!valid.length) return 0
    return +(valid.reduce((s, r) => s + (r.energy_level || 0), 0) / valid.length).toFixed(1)
  }, [recentReviews])

  const priorAvgEnergy = useMemo(() => {
    const valid = priorReviews.filter(r => r.energy_level)
    if (!valid.length) return 0
    return +(valid.reduce((s, r) => s + (r.energy_level || 0), 0) / valid.length).toFixed(1)
  }, [priorReviews])

  const totalHabitDays = useMemo(() =>
    new Set(habitLogs.filter(l => l.value === 1).map(l => l.log_date)).size,
  [habitLogs])

  const completedMilestones = milestones.filter(m => m.status === 'COMPLETE').length
  const totalMilestones = milestones.length

  const daysSinceYearStart = useMemo(() => {
    const start = new Date(currentYear, 0, 1)
    return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1)
  }, [currentYear])

  const consistencyPct = useMemo(() => {
    const totalPossible = habits.length * daysSinceYearStart
    if (totalPossible === 0) return 0
    const actual = habitLogs.filter(l => l.value === 1).length
    return Math.round((actual / totalPossible) * 100)
  }, [habitLogs, habits, daysSinceYearStart])

  // Strategic Advance: % of goals ON_TRACK or COMPLETE
  const strategicPct = goals.length > 0
    ? Math.round(goals.filter(g => g.status === 'ON_TRACK' || g.status === 'COMPLETE').length / goals.length * 100)
    : 0

  // System Consistency: % of days with a review since year start
  const reviewDaysPct = Math.round((reviews.length / daysSinceYearStart) * 100)

  // Context Window Warning: count distinct goals touched this week
  const weekGoalSpread = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - mondayOffset)
    monday.setHours(0, 0, 0, 0)
    const mondayStr = monday.toISOString().split('T')[0]

    const thisWeekGoalIds = new Set(
      completedTodos
        .filter(t => t.goal_id && t.created_at && t.created_at.split('T')[0] >= mondayStr)
        .map(t => t.goal_id!)
    )
    return thisWeekGoalIds.size
  }, [completedTodos])

  const displayGoals = filteredGoal ? goals.filter(g => g.id === filteredGoal) : goals

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
        {/* Breadcrumb + goal filter */}
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

        {/* KPI Tiles — 4-up */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-b border-mercury">
          {/* Avg Energy */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-shuttle text-[10px] font-semibold tracking-widest uppercase">
              Avg Energy <span className="text-shuttle/40 text-[8px] font-normal">(30d)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="flex items-center gap-1 text-burnham text-4xl font-bold tracking-tight">
                <Lightning size={28} weight="fill" />
                {avgEnergy || '—'}
              </div>
            </div>
            <TrendBadge current={avgEnergy} prior={priorAvgEnergy} />
          </div>

          {/* Consistency */}
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-semibold tracking-widest uppercase">Consistency</div>
            <p className="text-burnham text-4xl font-bold tracking-tight">{consistencyPct}%</p>
            <p className="text-[9px] text-shuttle/60">of habit-days completed</p>
          </div>

          {/* Velocity */}
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-semibold tracking-widest uppercase">Velocity</div>
            <div className="flex items-baseline gap-1">
              <p className="text-burnham text-4xl font-bold tracking-tight">{totalHabitDays}</p>
              <span className="text-shuttle text-sm">/ {daysSinceYearStart}d</span>
            </div>
            <p className="text-[9px] text-shuttle/60">days with ≥1 habit done</p>
          </div>

          {/* Deep Work */}
          <div className="flex flex-col gap-2">
            <div className="text-shuttle text-[10px] font-semibold tracking-widest uppercase">Deep Work</div>
            <div className="flex items-baseline gap-1">
              <p className="text-burnham text-4xl font-bold tracking-tight">—</p>
            </div>
            <p className="text-[9px] text-shuttle/60">hrs (timer data pending)</p>
          </div>
        </section>

        {/* Progress bars — 3-up */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-b border-mercury">
          {[
            {
              label: 'Strategic Advance',
              value: strategicPct,
              display: `${strategicPct}%`,
              sub: `${goals.filter(g => g.status === 'ON_TRACK' || g.status === 'COMPLETE').length}/${goals.length} goals on track`,
            },
            {
              label: 'Milestone Success',
              value: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
              display: `${completedMilestones}/${totalMilestones}`,
              sub: 'milestones complete',
            },
            {
              label: 'System Consistency',
              value: Math.min(100, reviewDaysPct),
              display: `${Math.min(100, reviewDaysPct)}%`,
              sub: `${reviews.length} days reviewed`,
            },
          ].map(({ label, value, display, sub }) => (
            <div key={label} className="flex flex-col gap-3">
              <div className="flex justify-between text-[10px] font-semibold tracking-widest uppercase text-shuttle">
                <span>{label}</span>
                <span className="text-burnham">{display}</span>
              </div>
              <div className="h-[2px] w-full bg-mercury/30 overflow-hidden">
                <div className="h-full bg-[#79D65E] transition-all" style={{ width: `${Math.min(100, value)}%` }} />
              </div>
              <p className="text-[9px] text-shuttle/50">{sub}</p>
            </div>
          ))}
        </section>

        {/* Context Window Warning */}
        {weekGoalSpread > 2 && (
          <div className="mt-8 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <span className="text-amber-500 text-base mt-0.5">&#9888;</span>
            <p className="text-xs text-amber-800">
              This week you spread across <strong>{weekGoalSpread} goals</strong>. Your best weeks historically are when you focus on 1-2.
            </p>
          </div>
        )}

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
              const heatmapCells = buildHeatmap(goalLogs, goalHabits.length, currentYear)
              const completedCount = goalLogs.filter(l => l.value === 1).length

              return (
                <div key={goal.id}>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                    {/* Left: name + indicators */}
                    <div className="lg:col-span-3 flex flex-col h-full pt-1 pr-4">
                      <div className="mb-6">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-burnham">{goal.text}</h3>
                          {(() => {
                            const thirtyAgo = new Date()
                            thirtyAgo.setDate(thirtyAgo.getDate() - 30)
                            const thirtyStr = thirtyAgo.toISOString().split('T')[0]
                            const recentLogs = goalLogs.filter(l => l.log_date >= thirtyStr)
                            const score = getMomentumScore({
                              habits: goalHabits,
                              habitLogs: recentLogs,
                              milestones: goalMilestones,
                              indicators: goalIndicators,
                              kpiEntries: monthlyKpiEntries.filter(e => goalIndicators.some(ind => ind.id === e.leading_indicator_id)),
                            })
                            const badge = getMomentumBadge(score)
                            return (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                                {badge.label}
                              </span>
                            )
                          })()}
                        </div>
                        {goal.metric && <p className="text-xs text-shuttle mt-1">{goal.metric}</p>}
                      </div>
                      <div className="space-y-5">
                        {goalIndicators.slice(0, 3).map(ind => {
                          const ytdActual = monthlyKpiEntries
                            .filter(e => e.leading_indicator_id === ind.id)
                            .reduce((sum, e) => sum + (e.actual_value ?? 0), 0)
                          const progress = ind.target
                            ? Math.min(100, Math.round((ytdActual / ind.target) * 100))
                            : 0
                          return (
                            <div key={ind.id} className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-end">
                                <span className="text-[10px] text-shuttle">{ind.name}</span>
                                <span className="text-[10px] font-mono text-shuttle">{progress}%</span>
                              </div>
                              <div className="h-[1px] w-full bg-mercury/50 overflow-hidden">
                                <div className="h-full bg-[#79D65E] transition-all" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Center: heatmap */}
                    <div className="lg:col-span-6 flex flex-col h-full">
                      <div className="flex justify-between items-end mb-3 px-1">
                        <span className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">
                          {completedCount} completions in {currentYear}
                        </span>
                      </div>
                      <div className="flex-1 p-4 bg-white/50 rounded-sm">
                        <Heatmap cells={heatmapCells} />
                      </div>
                      <div className="mt-4 pt-3 border-t border-mercury/30 flex flex-col gap-1.5 w-full pl-14 pr-8">
                        {goalHabits.slice(0, 3).map(h => (
                          <div key={h.id} className="flex items-center justify-between text-[9px]">
                            <span className="font-medium text-shuttle">{h.text}</span>
                            <span className="text-shuttle opacity-70 capitalize">{h.frequency.toLowerCase()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: milestones */}
                    <div className="lg:col-span-3 flex flex-col justify-between h-full pt-1 pl-6 border-l border-mercury/50">
                      <div className="flex flex-col gap-6 pl-4 pt-1 relative">
                        <div className="absolute left-0 top-2 bottom-8 w-[1px] bg-mercury" />
                        {goalMilestones.slice(0, 4).map((ms, mi) => {
                          const date = ms.target_date ? new Date(ms.target_date + 'T12:00:00') : null
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
                              <p className={`text-xs font-medium text-burnham ${ms.status === 'COMPLETE' ? 'line-through opacity-60' : ''}`}>
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

        {/* Productivity Window — new bottom section */}
        <section className="mt-16 pt-8 border-t border-mercury">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-sm font-semibold text-burnham tracking-tight">Productivity Analytics</h2>
            <span className="text-[10px] text-shuttle uppercase tracking-widest">{currentYear} · Computed from task history</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="bg-gray-50 rounded-xl p-6 border border-mercury/40">
              <ProductivityBars todos={completedTodos} />
            </div>
            <div className="bg-gray-50 rounded-xl p-6 border border-mercury/40">
              <EnergyScatter reviews={reviews} todos={completedTodos} />
            </div>
          </div>
        </section>

        {/* AI Coach */}
        <div className="mt-8">
          <AICoach
            goals={goals}
            habits={habits}
            habitLogs={habitLogs}
            milestones={milestones}
            reviews={reviews}
            userId={user?.id ?? ''}
          />
        </div>

      </div>
    </div>
  )
}
