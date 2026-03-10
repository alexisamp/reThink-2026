import type { Habit, HabitLog, Milestone, Review } from '@/types'

type TriggerType = 'habits_pending' | 'milestone_due' | 'no_review'

interface NotificationTrigger {
  type: TriggerType
  count?: number
  milestoneName?: string
}

interface CheckInput {
  habits: Habit[]
  todayLogs: Pick<HabitLog, 'habit_id' | 'value'>[]
  milestones: Milestone[]
  review: Review | null
}

export function checkNotificationTriggers({ habits, todayLogs, milestones, review }: CheckInput): NotificationTrigger[] {
  const triggers: NotificationTrigger[] = []
  const hour = new Date().getHours()

  // After 8pm, nudge if habits are incomplete
  if (hour >= 20) {
    const doneIds = new Set(todayLogs.filter(l => l.value === 1).map(l => l.habit_id))
    const pending = habits.filter(h => !doneIds.has(h.id))
    if (pending.length > 0) {
      triggers.push({ type: 'habits_pending', count: pending.length })
    }
  }

  // Milestones due within 3 days
  const now = new Date()
  for (const m of milestones) {
    if (!m.target_date) continue
    const due = new Date(m.target_date + 'T23:59:59')
    const daysUntil = (due.getTime() - now.getTime()) / 86400000
    if (daysUntil >= 0 && daysUntil <= 3) {
      triggers.push({ type: 'milestone_due', milestoneName: m.text })
    }
  }

  // No review yet after 9pm
  if (hour >= 21 && !review) {
    triggers.push({ type: 'no_review' })
  }

  return triggers
}

export function formatNotificationMessage(trigger: NotificationTrigger): { title: string; body: string } {
  switch (trigger.type) {
    case 'habits_pending':
      return {
        title: 'Habits Reminder',
        body: `You have ${trigger.count} habit${trigger.count !== 1 ? 's' : ''} left today.`,
      }
    case 'milestone_due':
      return {
        title: 'Milestone Due Soon',
        body: `"${trigger.milestoneName}" is due in the next few days.`,
      }
    case 'no_review':
      return {
        title: 'Daily Review',
        body: 'You haven\'t completed your daily review yet.',
      }
    default:
      return { title: '', body: '' }
  }
}
