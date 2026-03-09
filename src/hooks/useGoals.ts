import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/types'

export function useGoals(userId: string | undefined, workbookId: string | undefined) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGoals = useCallback(async () => {
    if (!userId || !workbookId) return
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('workbook_id', workbookId)
      .order('position')
    setGoals(data ?? [])
    setLoading(false)
  }, [userId, workbookId])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const activeGoals = goals.filter(g => g.goal_type === 'ACTIVE')
  const backlogGoals = goals.filter(g => g.goal_type === 'BACKLOG')

  const upsertGoal = async (goal: Partial<Goal> & { id?: string }) => {
    if (!userId || !workbookId) return
    const { data, error } = await supabase
      .from('goals')
      .upsert({ ...goal, user_id: userId, workbook_id: workbookId })
      .select()
      .single()
    if (!error && data) {
      setGoals(prev => {
        const idx = prev.findIndex(g => g.id === data.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
        return [...prev, data]
      })
    }
    return data
  }

  const updateGoalStatus = async (id: string, status: Goal['status']) => {
    await supabase.from('goals').update({ status }).eq('id', id)
    setGoals(prev => prev.map(g => g.id === id ? { ...g, status } : g))
  }

  return { goals, activeGoals, backlogGoals, loading, fetchGoals, upsertGoal, updateGoalStatus }
}
