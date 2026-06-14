import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { List, ListMembership, ListStage } from '@/types'

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
    icon: '💼',
    color: '#3B82F6',
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
    icon: '🤝',
    color: '#3E7A4E',
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
    icon: '🎯',
    color: '#8A6A86',
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
    icon: '🪑',
    color: '#0B4B33',
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
    icon: '♥',
    color: '#D97706',
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
    icon: '💰',
    color: '#79D65E',
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
    icon: '👥',
    color: '#4ECDC4',
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
    icon: '🤝',
    color: '#F6B26B',
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
    icon: '🎓',
    color: '#9B6DDB',
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
    icon: '⭐',
    color: '#E8A87C',
    stages: [
      { key: 'reengage',       label: 'Re-engage',       description: 'Need to restart the conversation.' },
      { key: 'active_nurture', label: 'Active Nurture',  description: 'Monthly touch points happening.' },
      { key: 'consistent',     label: 'Consistent',      description: 'Healthy cadence locked in.' },
    ],
  },
]

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useLists(userId: string | null | undefined) {
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('lists')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at')
    setLists((data ?? []) as List[])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const createList = useCallback(async (
    input: Pick<List, 'name' | 'purpose' | 'stages' | 'color' | 'icon'>,
  ): Promise<List | null> => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('lists')
      .insert({ ...input, user_id: userId })
      .select()
      .single()
    if (error) {
      console.error('createList failed', error)
      return null
    }
    await load()
    return data as List
  }, [userId, load])

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
    patch: Partial<Pick<List, 'name' | 'purpose' | 'stages' | 'color' | 'icon' | 'is_archived'>>,
  ) => {
    const { error } = await supabase.from('lists').update(patch).eq('id', id)
    if (!error) await load()
  }, [load])

  const archiveList = useCallback(async (id: string) => {
    await updateList(id, { is_archived: true })
  }, [updateList])

  const deleteList = useCallback(async (id: string) => {
    await supabase.from('lists').delete().eq('id', id)
    await load()
  }, [load])

  return { lists, loading, createList, createFromTemplate, updateList, archiveList, deleteList, reload: load }
}

// ─── Memberships ────────────────────────────────────────────────────────────

export function useListMemberships(
  userId: string | null | undefined,
  opts: { listId?: string; contactId?: string } = {},
) {
  const [memberships, setMemberships] = useState<ListMembership[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    let q = supabase.from('list_memberships').select('*').eq('user_id', userId)
    if (opts.listId) q = q.eq('list_id', opts.listId)
    if (opts.contactId) q = q.eq('contact_id', opts.contactId)
    const { data } = await q.order('entered_at', { ascending: false })
    setMemberships((data ?? []) as ListMembership[])
    setLoading(false)
  }, [userId, opts.listId, opts.contactId])

  useEffect(() => { load() }, [load])

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
