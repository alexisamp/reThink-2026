import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { List, ListFolder, ListMembership, ListStage } from '@/types'

const LISTS_CHANGED_EVENT = 'rethink:lists-changed'

function notifyListsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LISTS_CHANGED_EVENT))
}

// ─── Templates — ready-made lists for first-time use ────────────────────────

export const LIST_TEMPLATES: Array<{
  key: string
  name: string
  purpose: string
  icon: string
  color: string
  stages: ListStage[]
}> = [
  {
    key: 'job',
    name: 'Job search',
    purpose: 'People tied to a role you are pursuing or filling. Move each from research to offer.',
    icon: 'icon:contact',
    color: '#266DF0',
    stages: [
      { key: 'researching', label: 'Researching', description: 'Learning the person, account, or role.' },
      { key: 'applied', label: 'Applied', description: 'Application, intro, or first ask is in motion.' },
      { key: 'interviewing', label: 'Interviewing', description: 'Active conversation or interview loop.' },
      { key: 'offer', label: 'Offer', description: 'Offer, negotiation, or decision stage.' },
    ],
  },
  {
    key: 'consult',
    name: 'Consulting pipeline',
    purpose: 'Fractional and advisory engagements. Track scoping through to an active retainer.',
    icon: 'icon:relation',
    color: '#0F9EA8',
    stages: [
      { key: 'prospect', label: 'Prospect', description: 'Possible engagement or client fit.' },
      { key: 'scoping', label: 'Scoping', description: 'Problem, shape, and offer are being defined.' },
      { key: 'proposal', label: 'Proposal', description: 'Proposal, pricing, or terms are in review.' },
      { key: 'active', label: 'Active', description: 'Engagement is live.' },
    ],
  },
  {
    key: 'mentor',
    name: 'Mentors',
    purpose: 'The people who sharpen your thinking. Keep each relationship live and reciprocal.',
    icon: 'icon:target',
    color: '#266DF0',
    stages: [
      { key: 'prospect', label: 'Prospect', description: 'Someone who could become a mentor.' },
      { key: 'reaching', label: 'Reaching out', description: 'Warm-up, ask, or first conversation in motion.' },
      { key: 'active', label: 'Active', description: 'Mentorship relationship is active.' },
    ],
  },
  {
    key: 'board',
    name: 'Personal board',
    purpose: 'Your personal board of directors. No pipeline — just a cadence you owe each seat.',
    icon: 'icon:users',
    color: '#6F7988',
    stages: [
      { key: 'weekly', label: 'Weekly', description: 'Weekly cadence.' },
      { key: 'monthly', label: 'Monthly', description: 'Monthly cadence.' },
      { key: 'quarterly', label: 'Quarterly', description: 'Quarterly cadence.' },
    ],
  },
  {
    key: 'family',
    name: 'Family',
    purpose: 'The people who come before the work. Stay close on a rhythm, not a deadline.',
    icon: 'icon:heart',
    color: '#C8752D',
    stages: [
      { key: 'weekly', label: 'Weekly', description: 'Weekly cadence.' },
      { key: 'monthly', label: 'Monthly', description: 'Monthly cadence.' },
      { key: 'quarterly', label: 'Quarterly', description: 'Quarterly cadence.' },
    ],
  },
  {
    key: 'fundraising',
    name: 'Fundraising',
    purpose: 'Investors and capital partners you are actively raising from.',
    icon: 'icon:dollar',
    color: '#266DF0',
    stages: [
      { key: 'research',   label: 'Research',    description: 'Identified as a potential fit — haven\'t reached out.' },
      { key: 'intro',      label: 'Intro',       description: 'Warm intro made or cold outreach sent.' },
      { key: 'first_call', label: 'First call',  description: 'First conversation booked or complete.' },
      { key: 'diligence',  label: 'Diligence',   description: 'Deep-dive, material requested, follow-ups in flight.' },
      { key: 'committed',  label: 'Committed',   description: 'Verbal or signed commitment.' },
      { key: 'passed',     label: 'Passed',      description: 'Declined — keep warm for future.' },
    ],
  },
  {
    key: 'hiring',
    name: 'Hiring Pipeline',
    purpose: 'Candidates for a specific open role.',
    icon: 'icon:users',
    color: '#0F9EA8',
    stages: [
      { key: 'sourced',  label: 'Sourced',   description: 'Identified as a potential candidate.' },
      { key: 'screening', label: 'Screening', description: 'Intro call / phone screen in flight.' },
      { key: 'onsite',    label: 'Onsite',    description: 'Full interview loop.' },
      { key: 'offer',     label: 'Offer',     description: 'Offer extended, negotiating.' },
      { key: 'hired',     label: 'Hired',     description: 'Accepted — closed won.' },
      { key: 'lost',      label: 'Lost',      description: 'Declined or dropped out.' },
    ],
  },
  {
    key: 'clients',
    name: 'Client Pipeline',
    purpose: 'Business development — prospective clients or partnerships.',
    icon: 'icon:relation',
    color: '#C8752D',
    stages: [
      { key: 'discovery',   label: 'Discovery',   description: 'Exploratory conversation, understanding fit.' },
      { key: 'proposal',    label: 'Proposal',    description: 'Proposal sent, reviewing.' },
      { key: 'negotiating', label: 'Negotiating', description: 'Terms, pricing, contract.' },
      { key: 'won',         label: 'Won',         description: 'Contract signed.' },
      { key: 'lost',        label: 'Lost',        description: 'Decided not to move forward.' },
    ],
  },
  {
    key: 'advisory',
    name: 'Advisory Candidates',
    purpose: 'People you want as advisors or mentors.',
    icon: 'icon:users',
    color: '#6F7988',
    stages: [
      { key: 'approached', label: 'Approached', description: 'Raised the idea informally.' },
      { key: 'aligned',    label: 'Aligned',    description: 'Interested in principle.' },
      { key: 'signed',     label: 'Signed',     description: 'Formal agreement in place.' },
      { key: 'active',     label: 'Active',     description: 'Meeting regularly.' },
      { key: 'paused',     label: 'Paused',     description: 'Not active right now but relationship warm.' },
    ],
  },
  {
    key: 'deep_relationships',
    name: '2026 Deep Relationships',
    purpose: 'Tier 1 people to intentionally deepen this year.',
    icon: 'icon:star',
    color: '#0F9EA8',
    stages: [
      { key: 'reengage',       label: 'Re-engage',       description: 'Need to restart the conversation.' },
      { key: 'active_nurture', label: 'Active Nurture',  description: 'Monthly touch points happening.' },
      { key: 'consistent',     label: 'Consistent',      description: 'Healthy cadence locked in.' },
    ],
  },
]

// ─── Hook ───────────────────────────────────────────────────────────────────

function useRealtimeRefresh(userId: string | null | undefined, channelName: string, tables: string[], reload: () => Promise<void>) {
  const timer = useRef<number | null>(null)
  const tablesKey = tables.join(',')
  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void reload()
    }, 120)
  }, [reload])

  useEffect(() => {
    if (!userId) return
    const onFocus = () => schedule()
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(LISTS_CHANGED_EVENT, schedule)

    const subscribedTables = tablesKey.split(',').filter(Boolean)
    const channel = subscribedTables.reduce((current, table) => current.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `user_id=eq.${userId}`,
    }, schedule), supabase.channel(`${channelName}-${userId}`))
    channel.subscribe()

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(LISTS_CHANGED_EVENT, schedule)
      void supabase.removeChannel(channel)
    }
  }, [channelName, schedule, tablesKey, userId])
}

export function useLists(userId: string | null | undefined) {
  const [lists, setLists] = useState<List[]>([])
  const [folders, setFolders] = useState<ListFolder[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) { setLists([]); setFolders([]); setLoading(false); return }
    setLoading(true)
    let listQuery = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('folder_id', { nullsFirst: true })
        .order('position')
        .order('created_at')
    if (listQuery.error) {
      listQuery = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('created_at')
    }
    const folderResult = await supabase
      .from('list_folders')
      .select('*')
      .eq('user_id', userId)
      .order('position')
      .order('created_at')
    setLists(((listQuery.data ?? []) as List[]).sort((left, right) => (left.folder_id ?? '').localeCompare(right.folder_id ?? '') || (left.position ?? 0) - (right.position ?? 0) || left.created_at.localeCompare(right.created_at)))
    setFolders((folderResult.data ?? []) as ListFolder[])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(userId, 'lists-sync', ['lists', 'list_folders'], load)

  const createList = useCallback(async (
    input: Pick<List, 'name' | 'purpose' | 'stages' | 'color' | 'icon'> & { object_slug?: string },
  ): Promise<List | null> => {
    if (!userId) return null
    const nextPosition = lists.filter(list => (list.folder_id ?? null) === null).length
    const { data, error } = await supabase
      .from('lists')
      .insert({ ...input, user_id: userId, folder_id: null, position: nextPosition })
      .select()
      .single()
    if (error) {
      console.error('createList failed', error)
      return null
    }
    setLists(current => current.some(list => list.id === data.id) ? current : [...current, data as List])
    notifyListsChanged()
    await load()
    return data as List
  }, [userId, load, lists])

  const createFromTemplate = useCallback(async (templateKey: string): Promise<List | null> => {
    const tpl = LIST_TEMPLATES.find(t => t.key === templateKey)
    if (!tpl) return null
    return createList({
      name: tpl.name,
      purpose: tpl.purpose,
      stages: tpl.stages,
      color: tpl.color,
      icon: tpl.icon,
    })
  }, [createList])

  const updateList = useCallback(async (
    id: string,
    patch: Partial<Pick<List, 'name' | 'purpose' | 'stages' | 'color' | 'icon' | 'object_slug' | 'active_view_id' | 'folder_id' | 'position' | 'is_archived'>>,
  ) => {
    if (!userId) return { error: new Error('Not authenticated') }
    const { data, error: updateError } = await supabase.from('lists').update(patch).eq('id', id).eq('user_id', userId).select('id').maybeSingle()
    const error = updateError ?? (!data ? new Error('List update did not persist') : null)
    if (!error) {
      notifyListsChanged()
      await load()
    }
    return { error }
  }, [load, userId])

  const archiveList = useCallback(async (id: string) => {
    await updateList(id, { is_archived: true })
  }, [updateList])

  const deleteList = useCallback(async (id: string) => {
    if (!userId) return { error: new Error('Not authenticated') }
    const { data, error: deleteError } = await supabase.from('lists').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle()
    const error = deleteError ?? (!data ? new Error('List delete did not persist') : null)
    if (!error) {
      notifyListsChanged()
      await load()
    }
    return { error }
  }, [load, userId])

  const createFolder = useCallback(async (name: string): Promise<ListFolder | null> => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('list_folders')
      .insert({ user_id: userId, name: name.trim() || 'Untitled folder', position: folders.length })
      .select()
      .single()
    if (error) {
      console.error('createFolder failed', error)
      return null
    }
    setFolders(current => current.some(folder => folder.id === data.id) ? current : [...current, data as ListFolder])
    notifyListsChanged()
    await load()
    return data as ListFolder
  }, [folders.length, load, userId])

  const updateFolder = useCallback(async (
    id: string,
    patch: Partial<Pick<ListFolder, 'name' | 'position' | 'is_collapsed'>>,
  ) => {
    if (!userId) return { error: new Error('Not authenticated') }
    const { data, error: updateError } = await supabase.from('list_folders').update(patch).eq('id', id).eq('user_id', userId).select('id').maybeSingle()
    const error = updateError ?? (!data ? new Error('Folder update did not persist') : null)
    if (!error) {
      notifyListsChanged()
      await load()
    }
    return { error }
  }, [load, userId])

  const deleteFolder = useCallback(async (id: string) => {
    if (!userId) return { error: new Error('Not authenticated') }
    const { data, error: deleteError } = await supabase.from('list_folders').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle()
    const error = deleteError ?? (!data ? new Error('Folder delete did not persist') : null)
    if (!error) {
      notifyListsChanged()
      await load()
    }
    return { error }
  }, [load, userId])

  const reorderLists = useCallback(async (updates: Array<{ id: string; folder_id: string | null; position: number }>) => {
    if (!userId || !updates.length) return { error: null as Error | null }
    setLists(current => current.map(list => {
      const next = updates.find(update => update.id === list.id)
      return next ? { ...list, folder_id: next.folder_id, position: next.position } : list
    }))
    const results = await Promise.all(updates.map(update => supabase
      .from('lists')
      .update({ folder_id: update.folder_id, position: update.position })
      .eq('id', update.id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()))
    const failed = results.find(result => result.error || !result.data)
    if (failed) {
      await load()
      return { error: failed.error ?? new Error('List order did not persist') }
    }
    notifyListsChanged()
    return { error: null }
  }, [load, userId])

  const reorderFolders = useCallback(async (updates: Array<{ id: string; position: number }>) => {
    if (!userId || !updates.length) return { error: null as Error | null }
    setFolders(current => current.map(folder => {
      const next = updates.find(update => update.id === folder.id)
      return next ? { ...folder, position: next.position } : folder
    }).sort((left, right) => left.position - right.position))
    const results = await Promise.all(updates.map(update => supabase
      .from('list_folders')
      .update({ position: update.position })
      .eq('id', update.id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()))
    const failed = results.find(result => result.error || !result.data)
    if (failed) {
      await load()
      return { error: failed.error ?? new Error('Folder order did not persist') }
    }
    notifyListsChanged()
    return { error: null }
  }, [load, userId])

  return { lists, folders, loading, createList, createFromTemplate, updateList, archiveList, deleteList, createFolder, updateFolder, deleteFolder, reorderLists, reorderFolders, reload: load }
}

// ─── Memberships ────────────────────────────────────────────────────────────

export function useListMemberships(
  userId: string | null | undefined,
  opts: { listId?: string; contactId?: string } = {},
) {
  const [memberships, setMemberships] = useState<ListMembership[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) { setMemberships([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('list_memberships').select('*').eq('user_id', userId)
    if (opts.listId) q = q.eq('list_id', opts.listId)
    if (opts.contactId) q = q.eq('contact_id', opts.contactId)
    const { data } = await q.order('entered_at', { ascending: false })
    setMemberships((data ?? []) as ListMembership[])
    setLoading(false)
  }, [userId, opts.listId, opts.contactId])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(userId, 'list-memberships-sync', ['list_memberships'], load)

  const addToList = useCallback(async (
    contactId: string,
    listId: string,
    stage: string,
    notes?: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ListMembership | null> => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('list_memberships')
      .insert({
        contact_id: contactId,
        list_id: listId,
        user_id: userId,
        current_stage: stage,
        notes: notes ?? null,
        attributes,
      })
      .select()
      .single()
    if (error) {
      console.error('addToList failed', error)
      return null
    }
    await load()
    return data as ListMembership
  }, [userId, load])

  const moveStage = useCallback(async (
    membershipId: string,
    newStage: string,
  ) => {
    const { error } = await supabase
      .from('list_memberships')
      .update({ current_stage: newStage, stage_changed_at: new Date().toISOString() })
      .eq('id', membershipId)
    if (!error) await load()
  }, [load])

  const removeFromList = useCallback(async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await load()
  }, [load])

  return { memberships, loading, addToList, moveStage, removeFromList, reload: load }
}
