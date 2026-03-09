import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Strategy } from '@/types'

export function useStrategies(userId: string | undefined, goalId?: string) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStrategies = useCallback(async () => {
    if (!userId) return
    let query = supabase.from('strategies').select('*').eq('user_id', userId)
    if (goalId) query = query.eq('goal_id', goalId)
    const { data } = await query.order('created_at')
    setStrategies(data ?? [])
    setLoading(false)
  }, [userId, goalId])

  useEffect(() => { fetchStrategies() }, [fetchStrategies])

  const upsertStrategy = async (strategy: Partial<Strategy> & { id?: string }) => {
    if (!userId) return
    const { data } = await supabase
      .from('strategies')
      .upsert({ ...strategy, user_id: userId })
      .select()
      .single()
    if (data) setStrategies(prev => {
      const idx = prev.findIndex(s => s.id === data.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
      return [...prev, data]
    })
    return data
  }

  return { strategies, loading, fetchStrategies, upsertStrategy }
}
