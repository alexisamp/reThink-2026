import type { Habit, Milestone, Review } from '@/types'

export type NotificationTrigger = {
  type: 'morning_brief' | 'habit_reminder' | 'streak_at_risk' | 'milestone_approaching' | 'weekly_review'
  habitName?: string
  streak?: number
  milestoneName?: string
  oneThing?: string
  habitCount?: number
}

export function checkNotificationTriggers(opts: {
  habits: Habit[]
  todayLogs: { habit_id: string; value: number }[]
  milestones: Milestone[]
  review: Review | null
  now?: Date
}): NotificationTrigger[] {
  const now = opts.now ?? new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const dayOfWeek = now.getDay() // 0=Sun, 6=Sat
  const triggers: NotificationTrigger[] = []

  // Morning brief: 8:00 AM
  if (hour === 8 && minute === 0) {
    const undoneCount = opts.habits.filter(h =>
      !opts.todayLogs.some(l => l.habit_id === h.id && l.value === 1)
    ).length
    triggers.push({
      type: 'morning_brief',
      habitCount: undoneCount,
      oneThing: opts.review?.one_thing ?? undefined,
    })
  }

  // Streak at risk: 8 PM, habits not logged
  if (hour === 20 && minute === 0) {
    for (const habit of opts.habits) {
      const logged = opts.todayLogs.some(l => l.habit_id === habit.id && l.value === 1)
      if (!logged) {
        triggers.push({ type: 'streak_at_risk', habitName: habit.text })
      }
    }
  }

  // Weekly review: Sunday 5 PM
  if (dayOfWeek === 0 && hour === 17 && minute === 0) {
    triggers.push({ type: 'weekly_review' })
  }

  // Milestone approaching: 3 days before target_date
  const in3Days = new Date(now)
  in3Days.setDate(in3Days.getDate() + 3)
  const in3Str = in3Days.toISOString().split('T')[0]
  for (const m of opts.milestones) {
    if (m.target_date === in3Str && m.status === 'PENDING') {
      triggers.push({ type: 'milestone_approaching', milestoneName: m.text })
    }
  }

  return triggers
}

export function formatNotificationMessage(trigger: NotificationTrigger): { title: string; body: string } {
  switch (trigger.type) {
    case 'morning_brief':
      return {
        title: 'Good morning - reThink',
        body: trigger.oneThing
          ? `Today: "${trigger.oneThing}". ${trigger.habitCount} habits to complete.`
          : `${trigger.habitCount ?? 0} habits to complete today.`,
      }
    case 'streak_at_risk':
      return {
        title: 'Streak at risk',
        body: `${trigger.habitName} not logged yet. Don't break your streak!`,
      }
    case 'weekly_review':
      return {
        title: 'Weekly Review time',
        body: 'Take 20 minutes to review your week and plan ahead.',
      }
    case 'milestone_approaching':
      return {
        title: 'Milestone due in 3 days',
        body: `"${trigger.milestoneName}" is approaching.`,
      }
    case 'habit_reminder':
      return {
        title: 'Habit reminder',
        body: `Time for ${trigger.habitName}.`,
      }
    default:
      return { title: 'reThink', body: '' }
  }
}
