import { useEffect } from 'react'
import type { Habit, HabitLog } from '@/types'

const isTauri = typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined'

export function useHabitNotifications(habits: Habit[], logs: HabitLog[], today: string) {
  useEffect(() => {
    if (!isTauri || !habits.length) return

    let notificationModule: typeof import('@tauri-apps/plugin-notification') | null = null

    const schedule = async () => {
      if (!notificationModule) {
        notificationModule = await import('@tauri-apps/plugin-notification')
      }
      const { isPermissionGranted, requestPermission, sendNotification } = notificationModule

      let permissionGranted = await isPermissionGranted()
      if (!permissionGranted) {
        const permission = await requestPermission()
        permissionGranted = permission === 'granted'
      }
      if (!permissionGranted) return

      const now = new Date()

      habits.forEach(habit => {
        if (!habit.default_time) return
        const [hh, mm] = habit.default_time.split(':').map(Number)
        if (isNaN(hh) || isNaN(mm)) return
        const scheduled = new Date()
        scheduled.setHours(hh, mm, 0, 0)
        const diff = Math.abs(scheduled.getTime() - now.getTime())
        if (diff > 5 * 60 * 1000) return // outside 5-min window

        const alreadyDone = logs.some(
          l => l.habit_id === habit.id && l.log_date === today && l.value > 0
        )
        if (alreadyDone) return

        const label = habit.alias ?? habit.text
        sendNotification({
          title: 'reThink',
          body: `${habit.emoji ?? '⏰'} ${label}`,
        })
      })
    }

    schedule()
    const interval = setInterval(schedule, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [habits, logs, today])
}
