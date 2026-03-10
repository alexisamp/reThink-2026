import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CaretDown, Trophy, Lightning } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { getMomentumScore, getMomentumBadge } from '@/lib/momentum'
import type {
  Goal, Milestone, Habit, HabitLog, Todo, Review,
  LeadingIndicator, MonthlyKpiEntry, FrictionLog,
} from '@/types'

const FRICTION_OPTIONS = ['Travel', 'Forgot', 'Too tired', 'External blocker', 'Other']
const STEPS = ['Wins', 'Data Review', 'Friction Log', 'Next Week', 'Commit'] as const

// ── helpers ──
function weekRange() {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - 7)
  return {
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0],
  }
}

// ── Confetti ──
function Confetti() {
  const dots = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    color: ['#79D65E', '#E5F9BD', '#003720', '#536471', '#E3E3E3'][i % 5],
    size: 6 + Math.random() * 6,
  }))
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {dots.map(d => (
        <div
          key={d.id}
          className="absolute rounded-full animate-confetti-fall"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            background: d.color,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { top: -10%; opacity: 1; transform: rotate(0deg) scale(1); }
          100% { top: 110%; opacity: 0; transform: rotate(720deg) scale(0.3); }
        }
        .animate-confetti-fall {
          animation: confetti-fall 3s ease-in forwards;
        }
      `}</style>
    </div>
  )
}

export default function WeeklyReview() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const { startStr, endStr } = weekRange()

  // ── wizard state ──
  const [step, setStep] = useState(1)

  // ── data ──
  const [userId, setUserId] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [todosThisWeek, setTodosThisWeek] = useState<Todo[]>([])
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [kpiEntries, setKpiEntries] = useState<MonthlyKpiEntry[]>([])
  const [recentReviews, setRecentReviews] = useState<Review[]>([])

  // ── form state ──
  const [wins, setWins] = useState('')
  const [patterns, setPatterns] = useState('')
  const [frictionReasons, setFrictionReasons] = useState<Record<string, string>>({})
  const [weeklyOneThing, setWeeklyOneThing] = useState('')
  const [priorityGoalId, setPriorityGoalId] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [committed, setCommitted] = useState(false)

  // ── load data ──
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0]

      const [
        goalsRes, milestonesRes, habitsRes, logsRes,
        todosRes, indicatorsRes, kpiRes, reviewsRes,
      ] = await Promise.all([
        supabase.from('goals').select('*').eq('user_id', user.id).eq('goal_type', 'ACTIVE'),
        supabase.from('milestones').select('*').eq('user_id', user.id),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id)
          .gte('log_date', thirtyAgoStr),
        supabase.from('todos').select('*').eq('user_id', user.id)
          .gte('date', startStr).lte('date', endStr),
        supabase.from('leading_indicators').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('monthly_kpi_entries').select('*').eq('user_id', user.id),
        supabase.from('reviews').select('*').eq('user_id', user.id)
          .order('review_date', { ascending: false }).limit(30),
      ])

      setGoals(goalsRes.data ?? [])
      setMilestones(milestonesRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setHabitLogs(logsRes.data ?? [])
      setTodosThisWeek(todosRes.data ?? [])
      setIndicators(indicatorsRes.data ?? [])
      setKpiEntries(kpiRes.data ?? [])
      setRecentReviews(reviewsRes.data ?? [])
    }
    load()
  }, [startStr, endStr])

  // ── computed values ──
  const weekLogs = habitLogs.filter(l => l.log_date >= startStr && l.log_date <= endStr)
  const completedMilestonesThisWeek = milestones.filter(
    m => m.status === 'COMPLETE' && m.completed_at && m.completed_at.split('T')[0] >= startStr
  )
  const doneTodos = todosThisWeek.filter(t => t.completed)

  // Habit adherence per habit (last 7 days)
  const habitAdherence = habits.map(h => {
    const logged = weekLogs.filter(l => l.habit_id === h.id && l.value === 1).length
    return { habit: h, logged, total: 7 }
  })
  const totalHabitLogged = habitAdherence.reduce((s, a) => s + a.logged, 0)
  const totalHabitPossible = habitAdherence.reduce((s, a) => s + a.total, 0)
  const biggestMiss = habitAdherence.length > 0
    ? habitAdherence.reduce((min, cur) => (cur.logged / cur.total) < (min.logged / min.total) ? cur : min)
    : null

  // Habits NOT logged today
  const todayLogs = habitLogs.filter(l => l.log_date === today && l.value === 1)
  const unloggedHabits = habits.filter(h => !todayLogs.some(l => l.habit_id === h.id))

  // Consecutive weekly reviews count
  const consecutiveReviews = (() => {
    let count = 0
    const sorted = recentReviews
      .filter(r => r.weekly_one_thing)
      .sort((a, b) => b.review_date.localeCompare(a.review_date))
    for (const r of sorted) {
      // Each weekly review should be roughly 7 days apart
      count++
      if (count > 0 && sorted[count]) {
        const diff = new Date(sorted[count - 1].review_date).getTime() - new Date(sorted[count].review_date).getTime()
        if (diff > 10 * 24 * 60 * 60 * 1000) break // more than 10 days gap = not consecutive
      }
    }
    return count
  })()

  // ── save friction logs ──
  const saveFrictionLogs = async () => {
    if (!userId) return
    const entries = Object.entries(frictionReasons).filter(([, reason]) => reason)
    if (entries.length === 0) return
    const rows = entries.map(([habit_id, reason]) => ({
      habit_id,
      user_id: userId,
      log_date: today,
      reason,
    }))
    await supabase.from('friction_logs').upsert(rows, { onConflict: 'habit_id,user_id,log_date' })
  }

  // ── commit ──
  const handleCommit = async () => {
    if (!userId) return
    // Upsert review with weekly_one_thing
    await supabase.from('reviews').upsert({
      user_id: userId,
      review_date: today,
      weekly_one_thing: weeklyOneThing,
    }, { onConflict: 'user_id,review_date' })

    setCommitted(true)

    // 3rd+ consecutive weekly review → confetti
    if (consecutiveReviews >= 2) {
      setShowConfetti(true)
      setTimeout(() => {
        setShowConfetti(false)
        navigate('/today')
      }, 3000)
    } else {
      setTimeout(() => navigate('/today'), 800)
    }
  }

  const canNext = () => {
    if (step === 4 && !weeklyOneThing.trim()) return false
    return true
  }

  const handleNext = () => {
    if (step === 3) saveFrictionLogs()
    if (step < 5) setStep(s => s + 1)
  }

  const progressPct = ((step) / 5) * 100

  return (
    <div className="min-h-screen bg-white text-burnham font-sans flex flex-col">
      {showConfetti && <Confetti />}

      {/* Progress bar */}
      <div className="w-full h-1 bg-mercury">
        <div
          className="h-1 bg-pastel transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 pt-8 pb-2">
        {STEPS.map((label, i) => {
          const n = i + 1
          const isActive = step === n
          const isDone = step > n
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-pastel' : 'bg-mercury'}`} />}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                isActive ? 'bg-burnham text-white' :
                isDone ? 'bg-pastel text-burnham' :
                'bg-mercury text-shuttle'
              }`}>
                {isDone ? <Check size={10} weight="bold" /> : n}
              </div>
            </div>
          )
        })}
        <span className="ml-3 text-xs text-shuttle">Step {step} of 5</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-2xl">

          {/* STEP 1 — Last Week's Wins */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-burnham">Last Week's Wins</h2>

              {/* Auto-populated cards */}
              <div className="grid gap-3">
                <div className="bg-gray-50 border border-mercury rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Milestones Completed</p>
                  <p className="text-2xl font-bold text-burnham">{completedMilestonesThisWeek.length}</p>
                </div>
                <div className="bg-gray-50 border border-mercury rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Habits</p>
                  <p className="text-sm text-burnham">
                    <span className="text-2xl font-bold">{totalHabitLogged}</span>
                    <span className="text-shuttle">/{totalHabitPossible} completed</span>
                    {biggestMiss && biggestMiss.logged < biggestMiss.total && (
                      <span className="block text-xs text-shuttle mt-1">
                        Biggest miss: <span className="font-medium text-burnham">{biggestMiss.habit.text}</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 border border-mercury rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Tasks Done</p>
                  <p className="text-2xl font-bold text-burnham">{doneTodos.length}</p>
                </div>
              </div>

              {/* Wins textarea */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle block mb-2">
                  In your own words, what was your biggest win this week?
                </label>
                <textarea
                  className="w-full bg-white border border-mercury rounded-lg p-4 text-sm text-burnham h-32 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0 focus:outline-none"
                  placeholder="Write about your win..."
                  value={wins}
                  onChange={e => setWins(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 2 — Data Review */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-burnham">Data Review</h2>

              {goals.length === 0 && (
                <p className="text-sm text-shuttle">No active goals found.</p>
              )}

              <div className="space-y-4">
                {goals.map(goal => {
                  const goalHabits = habits.filter(h => h.goal_id === goal.id)
                  const goalWeekLogs = weekLogs.filter(l => goalHabits.some(h => h.id === l.habit_id) && l.value === 1)
                  const goalTotalPossible = goalHabits.length * 7
                  const goalIndicators = indicators.filter(i => i.goal_id === goal.id)

                  const score = getMomentumScore({
                    habits: goalHabits,
                    habitLogs: habitLogs.filter(l => goalHabits.some(h => h.id === l.habit_id)),
                    milestones: milestones.filter(m => m.goal_id === goal.id),
                    indicators: goalIndicators,
                    kpiEntries: kpiEntries.filter(k => goalIndicators.some(i => i.id === k.leading_indicator_id)),
                  })
                  const badge = getMomentumBadge(score)

                  return (
                    <div key={goal.id} className="bg-gray-50 border border-mercury rounded-lg p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-sm font-bold text-burnham">{goal.text}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-shuttle">
                        <span>Habits: {goalWeekLogs.length}/{goalTotalPossible} logged</span>
                        <span className={`font-semibold ${score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {score >= 70 ? 'On track' : 'At risk'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Patterns textarea */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle block mb-2">
                  What patterns do you notice?
                </label>
                <textarea
                  className="w-full bg-white border border-mercury rounded-lg p-4 text-sm text-burnham h-32 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0 focus:outline-none"
                  placeholder="Reflect on what the data tells you..."
                  value={patterns}
                  onChange={e => setPatterns(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 3 — Friction Log */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-burnham">Friction Log</h2>
              <p className="text-xs text-shuttle">For each habit you didn't complete today, note why.</p>

              {unloggedHabits.length === 0 ? (
                <div className="bg-gossip/20 border border-pastel rounded-lg p-6 text-center">
                  <Check size={24} weight="bold" className="mx-auto mb-2 text-burnham" />
                  <p className="text-sm font-medium text-burnham">All habits logged today!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unloggedHabits.map(habit => (
                    <div key={habit.id} className="flex items-center justify-between gap-4 bg-gray-50 border border-mercury rounded-lg px-4 py-3">
                      <span className="text-sm font-medium text-burnham truncate">{habit.text}</span>
                      <div className="relative shrink-0">
                        <select
                          className="appearance-none bg-white border border-mercury rounded px-3 py-1.5 pr-7 text-xs text-shuttle focus:border-shuttle focus:outline-none cursor-pointer"
                          value={frictionReasons[habit.id] ?? ''}
                          onChange={e => setFrictionReasons(prev => ({ ...prev, [habit.id]: e.target.value }))}
                        >
                          <option value="">Why not?</option>
                          {FRICTION_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <CaretDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-shuttle pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4 — Next Week's Focus */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-burnham">Next Week's Focus</h2>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle block mb-2">
                  What's the ONE THING for this week?
                </label>
                <input
                  className="w-full text-lg font-medium text-burnham border border-mercury rounded-lg px-4 py-3 placeholder-gray-300 focus:border-shuttle focus:ring-0 focus:outline-none bg-white"
                  placeholder="The one thing that matters most..."
                  value={weeklyOneThing}
                  onChange={e => setWeeklyOneThing(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle block mb-2">
                  Priority goal for next week
                </label>
                <div className="relative">
                  <select
                    className="appearance-none w-full bg-white border border-mercury rounded-lg px-4 py-3 pr-10 text-sm text-burnham focus:border-shuttle focus:outline-none cursor-pointer"
                    value={priorityGoalId ?? ''}
                    onChange={e => setPriorityGoalId(e.target.value || null)}
                  >
                    <option value="">Select a goal...</option>
                    {goals.map(g => (
                      <option key={g.id} value={g.id}>{g.text}</option>
                    ))}
                  </select>
                  <CaretDown size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-shuttle pointer-events-none" />
                </div>
              </div>

              {/* Peak energy window */}
              <div className="bg-gossip/20 border border-pastel/50 rounded-lg p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Peak Energy Window</p>
                <p className="text-sm text-burnham font-medium">Mon-Fri, 9-11 AM</p>
                <p className="text-[10px] text-shuttle mt-1">Based on your historical energy data</p>
              </div>
            </div>
          )}

          {/* STEP 5 — Commit */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-burnham">Commit to This Week</h2>

              <div className="bg-gray-50 border border-mercury rounded-lg p-6 space-y-4">
                {weeklyOneThing && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Weekly One Thing</p>
                    <p className="text-sm font-medium text-burnham">{weeklyOneThing}</p>
                  </div>
                )}
                {priorityGoalId && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-1">Priority Goal</p>
                    <p className="text-sm font-medium text-burnham">
                      {goals.find(g => g.id === priorityGoalId)?.text ?? 'Unknown'}
                    </p>
                  </div>
                )}
                {Object.entries(frictionReasons).filter(([, v]) => v).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">Friction Noted</p>
                    <div className="space-y-1">
                      {Object.entries(frictionReasons).filter(([, v]) => v).map(([hid, reason]) => {
                        const habit = habits.find(h => h.id === hid)
                        return (
                          <p key={hid} className="text-xs text-shuttle">
                            <span className="font-medium text-burnham">{habit?.text}</span> — {reason}
                          </p>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleCommit}
                disabled={committed}
                className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 disabled:opacity-50 text-white py-4 rounded-lg text-sm font-semibold transition-all uppercase tracking-wider"
              >
                <Trophy size={18} weight="fill" />
                {committed ? 'Committed!' : 'Commit to This Week'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nav buttons */}
      {step < 5 && (
        <div className="flex items-center justify-between px-6 py-6 border-t border-mercury max-w-2xl mx-auto w-full">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : navigate(-1)}
            className="flex items-center gap-2 text-sm text-shuttle hover:text-burnham transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canNext()}
            className="flex items-center gap-2 bg-burnham hover:bg-burnham/90 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {step === 5 && !committed && (
        <div className="flex items-center justify-start px-6 py-6 border-t border-mercury max-w-2xl mx-auto w-full">
          <button
            onClick={() => setStep(4)}
            className="flex items-center gap-2 text-sm text-shuttle hover:text-burnham transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>
      )}
    </div>
  )
}
