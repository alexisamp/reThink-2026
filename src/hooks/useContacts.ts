import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { hasAttioKey, syncFullContact, syncCompanyToAttio, syncAll as syncAllAttio, pullFromAttio, diffAttioFields } from '@/lib/attio'
import { computeHealthScore, daysSince } from '@/lib/funnelDefaults'
import type { Contact, ContactStatus, ContactCategory, Interaction, Habit } from '@/types'

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export interface ContactInput {
  name: string
  linkedin_url?: string | null
  category?: ContactCategory | null
  status?: ContactStatus
  notes?: string | null
  goal_id?: string | null
  log_date?: string
  job_title?: string | null
  company?: string | null
  location?: string | null
  connections_count?: number | null
  followers_count?: number | null
  email?: string | null
  phone?: string | null
  website?: string | null
  about?: string | null
  skills?: string | null
  personal_context?: string | null
  existing_attio_record_id?: string | null
}

export function useContacts(
  userId: string | undefined,
  habits: Habit[],
  upsertHabitCount: (habitId: string, count: number) => Promise<void>
) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const dormantFlaggedRef = useRef(false)

  const today = localDate()
  const todayContacts = contacts.filter(c => c.log_date === today)

  const fetchContacts = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const { data } = await supabase
      .from('outreach_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', localDate(ninetyDaysAgo))
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    setContacts(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  // Habit: prospecting habit fires when a new contact is added
  const incrementProspectingHabit = useCallback(async (updatedContacts: Contact[]) => {
    const habit = habits.find(h => h.tracks_outreach === 'prospecting' && h.is_active)
    if (!habit) return
    const count = updatedContacts.filter(c => c.log_date === today).length
    await upsertHabitCount(habit.id, count)
  }, [habits, today, upsertHabitCount])

  // Note: networking habit is owned exclusively by useInteractions.ts (distinct contacts per day)
  // useContacts does NOT fire the networking habit — only prospecting (new contacts mapped)

  const addContact = useCallback(async (input: ContactInput): Promise<Contact | null> => {
    if (!userId) return null
    setSyncError(null)
    const payload = {
      user_id: userId,
      name: input.name.trim(),
      linkedin_url: input.linkedin_url ?? null,
      category: input.category ?? null,
      status: input.status ?? 'PROSPECT',  // Default: PROSPECT (not CONTACTED)
      notes: input.notes ?? null,
      goal_id: input.goal_id ?? null,
      log_date: input.log_date ?? today,
      job_title: input.job_title ?? null,
      company: input.company ?? null,
      location: input.location ?? null,
      connections_count: input.connections_count ?? null,
      followers_count: input.followers_count ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      about: input.about ?? null,
      skills: input.skills ?? null,
      personal_context: input.personal_context ?? null,
      health_score: 1,
      attio_record_id: input.existing_attio_record_id ?? null,
    }
    const { data, error } = await supabase
      .from('outreach_logs').insert(payload).select().single()
    if (error || !data) return null
    const newContacts = [...contacts, data]
    setContacts(newContacts)
    await incrementProspectingHabit(newContacts)  // Always fires on new contact
    return data
  }, [userId, contacts, today, incrementProspectingHabit])

  const updateContact = useCallback(async (id: string, updates: Partial<ContactInput & { status: ContactStatus }>): Promise<void> => {
    if (!userId) return
    setSyncError(null)
    const existing = contacts.find(c => c.id === id)
    if (!existing) return

    const patch: Record<string, unknown> = {}
    const fields = ['name','linkedin_url','category','status','notes','goal_id','job_title',
                    'company','location','connections_count','followers_count','email','phone',
                    'website','about','skills','personal_context',
                    'company_domain','ai_enriched_at','profile_photo_url'] as const
    for (const f of fields) {
      if (f in updates) patch[f] = (updates as Record<string, unknown>)[f] ?? null
    }
    if (patch.name) patch.name = (patch.name as string).trim()

    const { error } = await supabase.from('outreach_logs').update(patch).eq('id', id)
    if (error) {
      setSyncError(`Save failed: ${error.message}`)
      return
    }
    const updatedContacts = contacts.map(c => c.id === id ? { ...c, ...patch } : c)
    setContacts(updatedContacts)

    // Attio: update if synced (fire-and-forget — errors surface via syncError)
    if (existing.attio_record_id && hasAttioKey()) {
      syncFullContact({ ...existing, ...patch } as Contact)
        .catch(err => setSyncError(`Attio sync: ${err instanceof Error ? err.message : 'unknown'}`))
    }
  }, [userId, contacts, incrementProspectingHabit])

  const deleteContact = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    const existing = contacts.find(c => c.id === id)
    if (!existing) return
    await supabase.from('outreach_logs').delete().eq('id', id)
    const updatedContacts = contacts.filter(c => c.id !== id)
    setContacts(updatedContacts)
    await incrementProspectingHabit(updatedContacts)
  }, [userId, contacts, incrementProspectingHabit])

  const syncContactToAttio = useCallback(async (id: string): Promise<void> => {
    const contact = contacts.find(c => c.id === id)
    if (!contact || !hasAttioKey()) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await syncFullContact(contact, { includeNotes: true })
      const now = new Date().toISOString()
      await supabase.from('outreach_logs')
        .update({ attio_record_id: result.record_id, attio_synced_at: now })
        .eq('id', id)
      setContacts(prev => prev.map(c =>
        c.id === id ? { ...c, attio_record_id: result.record_id, attio_synced_at: now } : c
      ))
    } catch (err) {
      setSyncError(`Attio sync failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setSyncing(false)
    }
  }, [contacts])

  const syncCompanyToAttioHook = useCallback(async (contactId: string): Promise<void> => {
    const contact = contacts.find(c => c.id === contactId)
    if (!contact?.company_domain || !hasAttioKey()) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await syncCompanyToAttio({
        name: contact.company ?? undefined,
        domain: contact.company_domain,
        existingCompanyId: contact.attio_company_id,
      })
      await supabase.from('outreach_logs')
        .update({ attio_company_id: result.record_id })
        .eq('id', contactId)
      setContacts(prev => prev.map(c =>
        c.id === contactId ? { ...c, attio_company_id: result.record_id } : c
      ))
    } catch (err) {
      setSyncError(`Company sync failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setSyncing(false)
    }
  }, [userId, contacts, hasAttioKey])

  const syncAll = useCallback(async (contactId: string): Promise<void> => {
    const contact = contacts.find(c => c.id === contactId)
    if (!contact || !hasAttioKey()) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await syncAllAttio(contact)
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { attio_record_id: result.person_record_id, attio_synced_at: now }
      if (result.company_record_id) patch.attio_company_id = result.company_record_id
      await supabase.from('outreach_logs').update(patch).eq('id', contactId)
      setContacts(prev => prev.map(c =>
        c.id === contactId ? { ...c, attio_record_id: result.person_record_id, attio_synced_at: now, ...(result.company_record_id ? { attio_company_id: result.company_record_id } : {}) } : c
      ))
    } catch (err) {
      setSyncError(`Attio sync failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setSyncing(false)
    }
  }, [contacts])

  const updateHealthScore = useCallback(async (contactId: string, interactions: Array<{ type: string; interaction_date: string }>): Promise<void> => {
    const score = computeHealthScore(interactions)
    const lastDate = interactions.length > 0
      ? interactions.reduce((latest, i) => i.interaction_date > latest ? i.interaction_date : latest, interactions[0].interaction_date)
      : null
    await supabase.from('outreach_logs')
      .update({ health_score: score, last_interaction_at: lastDate ? new Date(lastDate).toISOString() : null })
      .eq('id', contactId)
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, health_score: score } : c))
  }, [])

  // Auto-flag DORMANT: contacts with last_interaction_at null or > 90 days and status is NURTURING/ENGAGED
  const autoFlagDormant = useCallback(async (): Promise<number> => {
    const staleContacts = contacts.filter(c => {
      if (!['NURTURING','ENGAGED'].includes(c.status)) return false
      if (!c.last_interaction_at) return true
      return daysSince(c.last_interaction_at) > 90
    })
    if (staleContacts.length > 0) {
      const ids = staleContacts.map(c => c.id)
      await supabase.from('outreach_logs')
        .update({ status: 'DORMANT', updated_at: new Date().toISOString() })
        .in('id', ids)
      setContacts(prev => prev.map(c =>
        ids.includes(c.id) ? { ...c, status: 'DORMANT' as ContactStatus } : c
      ))
    }
    return staleContacts.length
  }, [contacts])

  // Auto-run dormant flagging once per session after contacts load
  useEffect(() => {
    if (loading || dormantFlaggedRef.current || contacts.length === 0) return
    dormantFlaggedRef.current = true
    autoFlagDormant()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  return {
    contacts,
    todayContacts,
    loading,
    syncing,
    syncError,
    addContact,
    updateContact,
    deleteContact,
    fetchContacts,
    syncContactToAttio,
    syncCompany: syncCompanyToAttioHook,
    syncAll,
    updateHealthScore,
    autoFlagDormant,
    // Legacy aliases for callers still using old names
    logs: contacts,
    todayLogs: todayContacts,
    addLog: addContact,
    updateLog: updateContact,
    deleteLog: deleteContact,
  }
}

// pullFromAttio and diffAttioFields are imported for use by consumers of this hook
// (e.g. ContactDrawer calls them directly) — re-export for convenience
export { pullFromAttio, diffAttioFields }
