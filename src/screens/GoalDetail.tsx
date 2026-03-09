// src/screens/GoalDetail.tsx
import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { House, ArrowLeft, Check } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Milestone, Habit, HabitLog } from '@/types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface HabitStats {
  habit: Habit
  logs: HabitLog[]
  streak: number
  successRate: number
}

function calcStreak(logs: HabitLog[]): number {
  const sorted = [...logs]
    .filter(l => l.value === 1)
    .map(l => l.log_date)
    .sort()
    .reverse()
  if (!sorted.length) return 0
  let streak = 0
  let cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  for (const dateStr of sorted) {
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000)
    if (diff <= 1) { streak++; cursor = d }
    else break
  }
  return streak
}

function calcSuccessRate(logs: HabitLog[], daysActive: number): number {
  if (daysActive <= 0) return 0
  const completed = logs.filter(l => l.value === 1).length
  return Math.round((completed / daysActive) * 100)
}

// Dot grid: 3 rows × 52 weeks heatmap for a single habit
function HabitDotGrid({ logs }: { logs: HabitLog[] }) {
  const completedDates = new Set(logs.filter(l => l.value === 1).map(l => l.log_date))
  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1)

  // Generate 52 weeks × 3 rows (Mon, Wed, Fri = days 1, 3, 5 of week)
  const rows = [0, 2, 4] // Mon=0, Wed=2, Fri=4 offsets within a week
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-col gap-1.5 min-w-[600px]">
        {rows.map((dayOffset, ri) => (
          <div key={ri} className="flex gap-1.5">
            {Array.from({ length: 52 }).map((_, wi) => {
              const date = new Date(startOfYear)
              date.setDate(1 + wi * 7 + dayOffset)
              const dateStr = date.toISOString().split('T')[0]
              const future = date > new Date()
              const done = completedDates.has(dateStr)
              let cls = 'bg-gray-100'
              if (!future) {
                if (done) cls = wi % 3 === 0 ? 'bg-pastel' : 'bg-pastel/40'
              }
              return (
                <div
                  key={wi}
                  title={dateStr}
                  className={`w-2.5 h-2.5 rounded-full ${cls} hover:ring-2 hover:ring-offset-1 hover:ring-pastel/50 transition-all cursor-pointer`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GoalDetail() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habitStats, setHabitStats] = useState<HabitStats[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) return
    const load = async () => {
      // Goal
      const { data: goalData } = await supabase
        .from('goals')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (!goalData) { setLoading(false); return }
      setGoal(goalData)
      setNotes(goalData.notes || '')

      // Parallel loads
      const [msRes, habitRes] = await Promise.all([
        supabase.from('milestones').select('*').eq('goal_id', id).order('target_date'),
        supabase.from('habits').select('*').eq('goal_id', id).eq('is_active', true).order('created_at'),
      ])
      setMilestones(msRes.data || [])

      // Habit logs for year
      const habits: Habit[] = habitRes.data || []
      if (habits.length > 0) {
        const habitIds = habits.map((h: Habit) => h.id)
        const { data: logs } = await supabase
          .from('habit_logs')
          .select('*')
          .in('habit_id', habitIds)
          .gte('log_date', `${currentYear}-01-01`)
          .lte('log_date', `${currentYear}-12-31`)
        const allLogs = logs || []

        const daysSoFar = Math.floor((Date.now() - new Date(currentYear, 0, 1).getTime()) / 86400000)

        const stats = habits.map(h => {
          const hLogs = allLogs.filter(l => l.habit_id === h.id)
          return {
            habit: h,
            logs: hLogs,
            streak: calcStreak(hLogs),
            successRate: calcSuccessRate(hLogs, daysSoFar),
          }
        })
        setHabitStats(stats)
      }
      setLoading(false)
    }
    load()
  }, [user, id, currentYear])

  const handleSaveNotes = async () => {
    if (!user || !goal) return
    await supabase.from('goals').update({ notes }).eq('id', goal.id)
  }

  // Find next milestone (first incomplete future milestone)
  const nextMilestone = useMemo(() => {
    return milestones.find(m => m.status !== 'COMPLETE')
  }, [milestones])

  // Consistency: total habit days completed / days so far
  const consistency = useMemo(() => {
    const total = habitStats.reduce((s, hs) => s + hs.logs.filter(l => l.value === 1).length, 0)
    const daysSoFar = Math.floor((Date.now() - new Date(currentYear, 0, 1).getTime()) / 86400000)
    const possible = daysSoFar * habitStats.length
    if (!possible) return 0
    return Math.round((total / possible) * 100)
  }, [habitStats, currentYear])

  const repsYTD = useMemo(() => {
    return habitStats.reduce((s, hs) => s + hs.logs.filter(l => l.value === 1).length, 0)
  }, [habitStats])

  // Milestone state
  const getMilestoneState = (ms: Milestone, idx: number) => {
    if (ms.status === 'COMPLETE') return 'completed'
    // Current = first incomplete
    if (!milestones.slice(0, idx).some(m => m.status !== 'COMPLETE')) return 'current'
    return 'pending'
  }

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

  const nextMilestoneDate = nextMilestone?.target_date
    ? new Date(nextMilestone.target_date)
    : null
  const nextMilestoneStr = nextMilestoneDate
    ? `${nextMilestone!.text} — ${MONTHS[nextMilestoneDate.getMonth()]} ${nextMilestoneDate.getDate()}`
    : 'All milestones complete!'

  return (
    <div className="min-h-screen bg-white pb-40">
      <main className="w-full max-w-[960px] mx-auto px-6 py-8 flex flex-col gap-16">
        {/* Header: breadcrumbs + back */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          {/* Breadcrumbs */}
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Link to="/today" className="flex items-center gap-1 text-shuttle hover:text-pastel transition-colors">
              <House size={14} />
            </Link>
            <span className="text-mercury">/</span>
            <Link to="/dashboard" className="text-shuttle hover:text-pastel transition-colors">Dashboard</Link>
            <span className="text-mercury">/</span>
            <span className="text-burnham">{goal.text}</span>
          </nav>
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 pl-3 pr-5 py-2 rounded-full border border-mercury hover:border-burnham/20 bg-transparent hover:bg-gray-50 transition-all"
          >
            <ArrowLeft size={16} className="text-burnham" />
            <span className="text-xs font-bold tracking-wider text-burnham">BACK TO AUDIT</span>
          </button>
        </header>

        {/* Executive Summary */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-burnham leading-tight">
              {goal.text}
            </h1>
            <p className="text-shuttle text-lg font-medium">
              Annual Target: {goal.metric || 'Not set'}
            </p>
          </div>

          {/* Mini Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 border-t border-mercury pt-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-widest text-shuttle uppercase">Current Consistency</span>
              <span className="text-3xl font-bold text-burnham">{consistency}%</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-widest text-shuttle uppercase">Reps YTD</span>
              <span className="text-3xl font-bold text-burnham">{repsYTD}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-widest text-shuttle uppercase">Next Critical Milestone</span>
              <span className="text-base font-bold text-burnham leading-tight">{nextMilestoneStr}</span>
            </div>
          </div>
        </section>

        {/* Milestone Roadmap */}
        <section className="flex flex-col gap-6">
          <h3 className="text-lg font-bold text-burnham">Milestone Roadmap</h3>
          {milestones.length === 0 ? (
            <p className="text-sm text-shuttle">No milestones yet. Set them up in Strategy.</p>
          ) : (
            <div className="relative flex flex-col pl-4">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-mercury -z-10" />
              {milestones.map((ms, idx) => {
                const state = getMilestoneState(ms, idx)
                const date = ms.target_date ? new Date(ms.target_date) : null
                const dateStr = date ? `${MONTHS[date.getMonth()]} ${date.getDate()}` : ''
                return (
                  <div
                    key={ms.id}
                    className={`group relative flex items-start gap-6 ${
                      state === 'current'
                        ? 'py-6 px-4 -mx-4 rounded-xl bg-gray-50/80 border border-transparent hover:border-mercury/50'
                        : 'py-4'
                    } transition-all`}
                  >
                    {/* Dot */}
                    <div className="flex-shrink-0 relative z-10 bg-white py-1">
                      {state === 'completed' && (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pastel text-burnham shadow-sm">
                          <Check size={14} weight="bold" />
                        </div>
                      )}
                      {state === 'current' && (
                        <div className="relative flex items-center justify-center w-8 h-8">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pastel opacity-20" />
                          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-pastel">
                            <div className="w-2.5 h-2.5 rounded-full bg-pastel" />
                          </div>
                        </div>
                      )}
                      {state === 'pending' && (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-mercury" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex justify-between items-center pt-2">
                      {state === 'current' ? (
                        <div className="flex flex-col">
                          <span className="text-lg font-bold text-burnham">{ms.text}</span>
                        </div>
                      ) : (
                        <span className={`text-base font-${state === 'completed' ? 'semibold' : 'medium'} ${
                          state === 'completed'
                            ? 'text-burnham line-through decoration-pastel/50 decoration-2'
                            : 'text-shuttle'
                        }`}>
                          {ms.text}
                        </span>
                      )}
                      <span className={`text-sm font-${state === 'current' ? 'bold' : 'medium'} ${
                        state === 'current'
                          ? 'text-burnham bg-pastel/10 px-3 py-1 rounded-full text-pastel'
                          : state === 'completed'
                          ? 'text-pastel'
                          : 'text-mercury'
                      }`}>
                        {dateStr}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Linked Habits */}
        <section className="flex flex-col gap-8">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold text-burnham">Linked Habits</h3>
            <span className="text-sm text-shuttle">Last 52 Weeks</span>
          </div>

          {habitStats.length === 0 ? (
            <p className="text-sm text-shuttle">No habits linked. Add them in Strategy.</p>
          ) : (
            <div className="flex flex-col gap-8">
              {habitStats.map((hs, idx) => (
                <div key={hs.habit.id}>
                  {/* Habit header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-baseline gap-3">
                      <h4 className="text-base font-bold text-burnham">{hs.habit.text}</h4>
                      <span className="text-xs font-semibold text-shuttle bg-gray-100 px-2 py-0.5 rounded-full uppercase">
                        {hs.habit.frequency}
                      </span>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div className="flex gap-2 items-center">
                        <span className="text-shuttle">Current Streak</span>
                        <span className="font-bold text-burnham">
                          {hs.streak} {hs.habit.frequency === 'WEEKLY' ? 'Wks' : 'Days'}
                        </span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-shuttle">Success Rate</span>
                        <span className="font-bold text-pastel">{hs.successRate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Dot grid */}
                  <HabitDotGrid logs={hs.logs} />

                  {idx < habitStats.length - 1 && (
                    <div className="w-full h-px bg-mercury/50 mt-8" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Execution Notes */}
        <section className="flex flex-col gap-4 pt-4">
          <h3 className="text-lg font-bold text-burnham">Execution Notes</h3>
          <div className="relative group">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-gray-100 to-gray-50 opacity-50 blur transition duration-500 group-hover:opacity-100" />
            <div className="relative">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Identify blockers, pivot notes, or resource needs..."
                className="w-full min-h-[160px] p-6 rounded-xl bg-gray-50/50 border border-transparent focus:border-mercury focus:ring-0 focus:bg-white text-burnham placeholder:text-shuttle/50 resize-none text-base leading-relaxed transition-all outline-none"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
