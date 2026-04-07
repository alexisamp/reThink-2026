import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Opportunity } from '@/types'

export function useOpportunities(userId: string | null) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('opportunities')
      .select('*, company:companies(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setOpportunities(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const upsert = useCallback(async (
    input: Omit<Opportunity, 'id' | 'user_id' | 'created_at' | 'company'> & { id?: string }
  ) => {
    if (!userId) return null
    const { company: _company, ...rest } = input as Opportunity & { company?: unknown }
    void _company
    const { data, error } = rest.id
      ? await supabase.from('opportunities').update(rest).eq('id', rest.id).select().single()
      : await supabase.from('opportunities').insert({ ...rest, user_id: userId }).select().single()
    if (!error) await load()
    return error ? null : data as Opportunity
  }, [userId, load])

  const updateStage = useCallback(async (id: string, stage: Opportunity['stage']) => {
    await supabase.from('opportunities').update({ stage }).eq('id', id)
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage } : o))
  }, [])

  const remove = useCallback(async (id: string) => {
    await supabase.from('opportunities').delete().eq('id', id)
    setOpportunities(prev => prev.filter(o => o.id !== id))
  }, [])

  return { opportunities, loading, upsert, updateStage, remove, reload: load }
}
