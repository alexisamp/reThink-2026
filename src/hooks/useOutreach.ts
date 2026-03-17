import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { createAttioPerson, updateAttioPerson, hasAttioKey } from '@/lib/attio'
import type { OutreachLog, OutreachType, OutreachStatus, Habit } from '@/types'

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface OutreachLogInput {
  name: string
  linkedin_url?: string | null
  contact_type: OutreachType
  status?: OutreachStatus
  notes?: string | null
  goal_id?: string | null
  log_date?: string
  existing_attio_record_id?: string
  job_title?: string | null
  company?: string | null
  location?: string | null
}

export function useOutreach(
  userId: string | undefined,
  habits: Habit[],
  upsertHabitCount: (habitId: string, count: number) => Promise<void>
) {
  const [logs, setLogs] = useState<OutreachLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const today = localDate()

  const todayLogs = logs.filter(l => l.log_date === today)

  const fetchLogs = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const cutoff = localDate(ninetyDaysAgo)
    const { data } = await supabase
      .from('outreach_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', cutoff)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    setLogs(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const autoIncrementHabit = useCallback(async (
    type: OutreachType,
    updatedLogs: OutreachLog[]
  ) => {
    const habit = habits.find(h => h.tracks_outreach === type && h.is_active)
    if (!habit) return
    const count = updatedLogs.filter(l => l.log_date === today && l.contact_type === type).length
    await upsertHabitCount(habit.id, count)
  }, [habits, today, upsertHabitCount])

  const addContact = useCallback(async (input: OutreachLogInput): Promise<OutreachLog | null> => {
    if (!userId) return null
    setSyncError(null)

    const payload = {
      user_id: userId,
      name: input.name.trim(),
      linkedin_url: input.linkedin_url ?? null,
      contact_type: input.contact_type,
      status: input.status ?? 'CONTACTED',
      notes: input.notes ?? null,
      goal_id: input.goal_id ?? null,
      log_date: input.log_date ?? today,
      attio_record_id: input.existing_attio_record_id ?? null,
      attio_synced_at: input.existing_attio_record_id ? new Date().toISOString() : null,
      job_title: input.job_title ?? null,
      company: input.company ?? null,
      location: input.location ?? null,
    }

    const { data, error } = await supabase
      .from('outreach_logs')
      .insert(payload)
      .select()
      .single()

    if (error || !data) return null

    const newLogs = [...logs, data]
    setLogs(newLogs)
    await autoIncrementHabit(input.contact_type, newLogs)

    // Sync to Attio in background (only if not linking to existing record)
    if (!input.existing_attio_record_id && hasAttioKey()) {
      setSyncing(true)
      createAttioPerson({ fullName: input.name.trim(), linkedinUrl: input.linkedin_url ?? undefined })
        .then(async result => {
          const now = new Date().toISOString()
          await supabase
            .from('outreach_logs')
            .update({ attio_record_id: result.record_id, attio_synced_at: now })
            .eq('id', data.id)
          setLogs(prev => prev.map(l =>
            l.id === data.id ? { ...l, attio_record_id: result.record_id, attio_synced_at: now } : l
          ))
        })
        .catch(err => {
          setSyncError(`Attio sync failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        })
        .finally(() => setSyncing(false))
    }

    return data
  }, [userId, logs, today, autoIncrementHabit])

  const updateContact = useCallback(async (id: string, updates: Partial<OutreachLogInput>): Promise<void> => {
    if (!userId) return
    setSyncError(null)

    const existing = logs.find(l => l.id === id)
    if (!existing) return

    const patch: Partial<OutreachLog> = {}
    if (updates.name !== undefined) patch.name = updates.name.trim()
    if (updates.linkedin_url !== undefined) patch.linkedin_url = updates.linkedin_url ?? null
    if (updates.contact_type !== undefined) patch.contact_type = updates.contact_type
    if (updates.status !== undefined) patch.status = updates.status
    if (updates.notes !== undefined) patch.notes = updates.notes ?? null
    if (updates.goal_id !== undefined) patch.goal_id = updates.goal_id ?? null
    if (updates.job_title !== undefined) patch.job_title = updates.job_title ?? null
    if (updates.company !== undefined) patch.company = updates.company ?? null
    if (updates.location !== undefined) patch.location = updates.location ?? null

    await supabase.from('outreach_logs').update(patch).eq('id', id)
    const updatedLogs = logs.map(l => l.id === id ? { ...l, ...patch } : l)
    setLogs(updatedLogs)

    // Re-run habit increment for both old and new types if type changed
    if (updates.contact_type && updates.contact_type !== existing.contact_type) {
      await autoIncrementHabit(existing.contact_type, updatedLogs)
      await autoIncrementHabit(updates.contact_type, updatedLogs)
    } else {
      await autoIncrementHabit(existing.contact_type, updatedLogs)
    }

    // Propagate to Attio if record is synced
    if (existing.attio_record_id && hasAttioKey()) {
      updateAttioPerson(existing.attio_record_id, {
        fullName: updates.name !== undefined ? updates.name.trim() : undefined,
        linkedinUrl: updates.linkedin_url,
      }).catch(err => {
        setSyncError(`Attio update failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      })
    }
  }, [userId, logs, autoIncrementHabit])

  const deleteContact = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    const existing = logs.find(l => l.id === id)
    if (!existing) return

    await supabase.from('outreach_logs').delete().eq('id', id)
    const updatedLogs = logs.filter(l => l.id !== id)
    setLogs(updatedLogs)
    await autoIncrementHabit(existing.contact_type, updatedLogs)
  }, [userId, logs, autoIncrementHabit])

  return {
    logs,
    todayLogs,
    loading,
    syncing,
    syncError,
    addContact,
    updateContact,
    deleteContact,
    fetchLogs,
  }
}
