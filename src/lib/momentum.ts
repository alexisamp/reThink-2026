import type { Habit, HabitLog, Milestone, LeadingIndicator, MonthlyKpiEntry } from '@/types'

export function getMomentumScore(opts: {
  habits: Habit[]
  habitLogs: HabitLog[]  // last 30 days
  milestones: Milestone[]
  indicators: LeadingIndicator[]
  kpiEntries: MonthlyKpiEntry[]
}): number {
  // Habit adherence (40%)
  const maxLogs = opts.habits.length * 30
  const actualLogs = opts.habitLogs.filter(l => l.value === 1).length
  const habitScore = maxLogs > 0 ? (actualLogs / maxLogs) * 40 : 0

  // Milestone velocity (30%)
  const pastMilestones = opts.milestones.filter(m => m.target_date && new Date(m.target_date + 'T12:00:00') <= new Date())
  const donePast = pastMilestones.filter(m => m.status === 'COMPLETE').length
  const milestoneScore = pastMilestones.length > 0 ? (donePast / pastMilestones.length) * 30 : 30

  // KPI trajectory (30%)
  const currentMonth = new Date().getMonth() + 1
  const kpiScores = opts.indicators.map(ind => {
    const thisMonth = opts.kpiEntries.find(e => e.leading_indicator_id === ind.id && e.month === currentMonth)
    const monthTarget = ind.target ? ind.target / 12 : null
    if (!monthTarget || !thisMonth?.actual_value) return 15 // neutral
    return Math.min(1, thisMonth.actual_value / monthTarget) * 30
  })
  const kpiScore = kpiScores.length > 0 ? kpiScores.reduce((a, b) => a + b, 0) / kpiScores.length : 15

  return Math.round(habitScore + milestoneScore + kpiScore)
}

export function getMomentumBadge(score: number): {
  label: string
  className: string
} {
  if (score >= 90) return { label: `${score}`, className: 'text-burnham bg-gossip/50 border border-pastel' }
  if (score >= 70) return { label: `${score}`, className: 'text-emerald-700 bg-emerald-50' }
  if (score >= 40) return { label: `${score}`, className: 'text-amber-600 bg-amber-50' }
  return { label: `${score}`, className: 'text-red-600 bg-red-50' }
}
