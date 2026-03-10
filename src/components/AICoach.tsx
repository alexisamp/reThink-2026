import { useState } from 'react'
import { Brain, ArrowClockwise } from '@phosphor-icons/react'
import { getCoachInsight, buildCoachPrompt } from '@/lib/claude'
import { supabase } from '@/lib/supabase'
import type { Goal, Habit, HabitLog, Milestone, Review } from '@/types'

interface AICoachProps {
  goals: Goal[]
  habits: Habit[]
  habitLogs: HabitLog[]  // last 30 days
  milestones: Milestone[]
  reviews: Review[]  // last 30 days
  userId: string
}

export default function AICoach({ goals, habits, habitLogs, milestones, reviews, userId }: AICoachProps) {
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const runCoach = async () => {
    setLoading(true)
    setInsight(null)
    try {
      // Build adherence data
      const today = new Date()
      const thirtyAgo = new Date(today)
      thirtyAgo.setDate(today.getDate() - 30)
      const thirtyStr = thirtyAgo.toISOString().split('T')[0]
      const recentLogs = habitLogs.filter(l => l.log_date >= thirtyStr)

      const habitAdherence = habits.map(h => {
        const done = recentLogs.filter(l => l.habit_id === h.id && l.value === 1).length
        return { habitName: h.text, adherence: done / 30 }
      })

      const energyAvg = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.energy_level ?? 5), 0) / reviews.length
        : 5

      // Get friction reasons from DB
      const { data: frictionData } = await supabase
        .from('friction_logs')
        .select('reason')
        .eq('user_id', userId)
        .gte('log_date', thirtyStr)
      const frictionReasons = [...new Set((frictionData ?? []).map(f => f.reason).filter(Boolean))] as string[]

      const activeGoals = goals.filter(g => g.goal_type === 'ACTIVE')
      const prompt = buildCoachPrompt({
        goals: activeGoals.map(g => ({ text: g.text, status: g.status, metric: g.metric })),
        habitAdherence,
        energyAvg,
        milestonesCompleted: milestones.filter(m => m.status === 'COMPLETE').length,
        milestonesTotal: milestones.length,
        frictionReasons,
      })

      const result = await getCoachInsight(prompt)
      setInsight(result.content)

      // Save to today's review
      const todayStr = today.toISOString().split('T')[0]
      await supabase.from('reviews').upsert({
        user_id: userId,
        date: todayStr,
        ai_coach_notes: result.content,
      }, { onConflict: 'user_id,date' })
      setSavedAt(new Date())
    } catch (err) {
      setInsight('Unable to generate insight. Please ensure the AI Coach is configured.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-mercury rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-shuttle" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">AI Coach</span>
        </div>
        <button
          onClick={runCoach}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-burnham border border-mercury hover:border-shuttle px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <ArrowClockwise size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Analyzing...' : 'Get Insight'}
        </button>
      </div>

      {insight ? (
        <div className="space-y-2">
          <p className="text-sm text-burnham leading-relaxed">{insight}</p>
          {savedAt && (
            <p className="text-[10px] text-shuttle/50">Saved · {savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-shuttle italic">
          {loading ? 'Reviewing your last 30 days of data...' : 'Click to generate a personalized coaching insight based on your habit data, goals, and energy patterns.'}
        </p>
      )}
    </div>
  )
}
