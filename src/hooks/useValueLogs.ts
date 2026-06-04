import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ValueLog } from '@/types'

export function useValueLogs(userId: string | null, outreachLogId?: string) {
  const [logs, setLogs] = useState<ValueLog[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    let q = supabase
      .from('value_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (outreachLogId) q = q.eq('outreach_log_id', outreachLogId)
    const { data } = await q
    setLogs(data ?? [])
    setLoading(false)
  }, [userId, outreachLogId])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (input: {
    outreach_log_id: string
    type: ValueLog['type']
    description?: string
    date?: string
    direction?: ValueLog['direction']
  }) => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('value_logs')
      .insert({
        ...input,
        user_id: userId,
        date: input.date ?? new Date().toISOString().split('T')[0],
        direction: input.direction ?? 'given',
      })
      .select()
      .single()
    if (!error) await load()
    return error ? null : data as ValueLog
  }, [userId, load])

  const remove = useCallback(async (id: string) => {
    await supabase.from('value_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }, [])

  const logsGiven = logs.filter(l => l.direction === 'given')
  const logsReceived = logs.filter(l => l.direction === 'received')

  return { logs, logsGiven, logsReceived, loading, add, remove, reload: load }
}
