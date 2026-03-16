import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Habit, HabitLog } from '@/types'

export function useHabits(userId: string | undefined) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const fetchHabits = useCallback(async () => {
    if (!userId) return
    const { data: habitData } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at')
    setHabits(habitData ?? [])

    const { data: logData } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', today)
    setLogs(logData ?? [])
    setLoading(false)
  }, [userId, today])

  useEffect(() => { fetchHabits() }, [fetchHabits])

  const isCompleted = (habitId: string) =>
    logs.some(l => l.habit_id === habitId && l.value === 1)

  const toggleHabit = async (habitId: string) => {
    if (!userId) return
    const existing = logs.find(l => l.habit_id === habitId)
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      await supabase.from('habit_logs').update({ value: newVal }).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: 1 })
        .select()
        .single()
      if (data) setLogs(prev => [...prev, data])
    }
  }

  const upsertHabit = async (habit: Partial<Habit> & { id?: string }) => {
    if (!userId) return
    const { data } = await supabase
      .from('habits')
      .upsert({ ...habit, user_id: userId })
      .select()
      .single()
    if (data) {
      setHabits(prev => {
        const idx = prev.findIndex(h => h.id === data.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
        return [...prev, data]
      })
    }
    return data
  }

  const getLogsForDateRange = async (startDate: string, endDate: string) => {
    if (!userId) return []
    const { data } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .eq('value', 1)
    return data ?? []
  }

  /** For QUANTIFIED habits: sets today's log value to `count`. Idempotent. */
  const upsertHabitCount = async (habitId: string, count: number) => {
    if (!userId) return
    const existing = logs.find(l => l.habit_id === habitId)
    if (existing) {
      await supabase.from('habit_logs').update({ value: count }).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: count } : l))
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: count })
        .select()
        .single()
      if (data) setLogs(prev => [...prev, data])
    }
  }

  return { habits, logs, loading, isCompleted, toggleHabit, upsertHabit, fetchHabits, getLogsForDateRange, upsertHabitCount }
}
