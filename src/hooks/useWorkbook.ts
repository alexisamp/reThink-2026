import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Workbook, WorkbookEntry } from '@/types'

export function useWorkbook(userId: string | undefined) {
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [entries, setEntries] = useState<WorkbookEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkbook = useCallback(async () => {
    if (!userId) return
    const year = new Date().getFullYear()
    const { data: wb } = await supabase
      .from('workbooks')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .maybeSingle()
    setWorkbook(wb)

    if (wb) {
      const { data: ents } = await supabase
        .from('workbook_entries')
        .select('*')
        .eq('workbook_id', wb.id)
        .order('list_order')
      setEntries(ents ?? [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchWorkbook() }, [fetchWorkbook])

  const createWorkbook = async () => {
    if (!userId) return null
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('workbooks')
      .insert({ user_id: userId, year })
      .select()
      .single()
    setWorkbook(data)
    return data
  }

  const upsertEntry = async (level: number, field: string, value: string) => {
    if (!workbook || !userId) return
    const existing = entries.find(e => e.list_order === level && e.section_key === field)
    const { data } = await supabase
      .from('workbook_entries')
      .upsert({
        id: existing?.id,
        workbook_id: workbook.id,
        user_id: userId,
        list_order: level,
        section_key: field,
        answer: value,
      })
      .select()
      .single()
    if (data) {
      setEntries(prev => {
        const idx = prev.findIndex(e => e.list_order === level && e.section_key === field)
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
        return [...prev, data]
      })
    }
  }

  const getEntry = (level: number, field: string) =>
    entries.find(e => e.list_order === level && e.section_key === field)?.answer ?? ''

  return { workbook, entries, loading, fetchWorkbook, createWorkbook, upsertEntry, getEntry }
}
