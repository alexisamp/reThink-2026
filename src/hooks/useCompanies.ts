import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company } from '@/types'

export function useCompanies(userId: string | null) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId)
      .order('name')
    setCompanies(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const upsert = useCallback(async (input: Omit<Company, 'id' | 'user_id' | 'created_at'> & { id?: string }) => {
    if (!userId) return null
    const { data, error } = input.id
      ? await supabase.from('companies').update(input).eq('id', input.id).select().single()
      : await supabase.from('companies').insert({ ...input, user_id: userId }).select().single()
    if (!error) await load()
    return error ? null : data as Company
  }, [userId, load])

  const remove = useCallback(async (id: string) => {
    await supabase.from('companies').delete().eq('id', id)
    setCompanies(prev => prev.filter(c => c.id !== id))
  }, [])

  return { companies, loading, upsert, remove, reload: load }
}
