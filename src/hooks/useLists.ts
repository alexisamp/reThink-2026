import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Company,
  Contact,
  List,
  ListAttribute,
  ListAttributeOption,
  ListAttributeType,
  ListMembership,
  ListRecordKind,
  ListView,
  ListViewType,
  Opportunity,
} from '@/types'

const LISTS_CHANGED_EVENT = 'rethink:lists-changed'

export const LIST_OBJECT_LABELS: Record<ListRecordKind, { plural: string; singular: string; table: string; icon: string }> = {
  person: { plural: 'People', singular: 'Person', table: 'outreach_logs', icon: '👤' },
  company: { plural: 'Companies', singular: 'Company', table: 'companies', icon: '🏢' },
  opportunity: { plural: 'Deals', singular: 'Deal', table: 'opportunities', icon: '💼' },
}

const DEFAULT_LIST_COLORS: Record<ListRecordKind, string> = {
  person: '#2563eb',
  company: '#2563eb',
  opportunity: '#ff6b2c',
}

export const DEFAULT_STATUS_OPTIONS: ListAttributeOption[] = [
  { id: 'exploring', label: 'Exploring', color: '#8B8F98', track_time: false, confetti: false },
  { id: 'won', label: 'Won', color: '#2F8F5B', track_time: false, confetti: true },
]

export type ListRecord = Contact | Company | Opportunity

export interface ListEntry {
  membership: ListMembership
  record: ListRecord
}

export interface CreateListInput {
  name: string
  icon?: string | null
  parent_object?: ListRecordKind
  purpose?: string | null
  stages?: unknown
  color?: string | null
}

export interface CreateViewInput {
  name: string
  type: ListViewType
  config?: ListView['config']
}

export interface CreateAttributeInput {
  name: string
  type: ListAttributeType
  config?: ListAttribute['config']
}

function withListDefaults(list: List): List {
  return {
    ...list,
    parent_object: list.parent_object ?? 'person',
    stages: Array.isArray(list.stages) ? list.stages : [],
    icon: list.icon ?? LIST_OBJECT_LABELS[list.parent_object ?? 'person'].icon,
  }
}

function notifyListsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LISTS_CHANGED_EVENT))
  }
}

export function membershipPayload(kind: ListRecordKind, recordId: string) {
  return {
    contact_id: kind === 'person' ? recordId : null,
    company_id: kind === 'company' ? recordId : null,
    opportunity_id: kind === 'opportunity' ? recordId : null,
  }
}

export async function addRecordToList(input: {
  userId: string
  list: Pick<List, 'id' | 'parent_object'>
  recordId: string
  attributes?: Record<string, unknown>
  notes?: string | null
  currentStage?: string | null
}) {
  const attributes = input.attributes ?? {}
  const currentStage = input.currentStage ?? null
  const { data, error } = await supabase
    .from('list_memberships')
    .insert({
      ...membershipPayload(input.list.parent_object ?? 'person', input.recordId),
      user_id: input.userId,
      list_id: input.list.id,
      current_stage: currentStage,
      notes: input.notes ?? null,
      attributes,
    })
    .select()
    .single()
  if (error) {
    console.error('addRecordToList failed', error)
    return null
  }
  return data as ListMembership
}

export function getListRecordId(entry: ListMembership, kind: ListRecordKind) {
  if (kind === 'company') return entry.company_id ?? null
  if (kind === 'opportunity') return entry.opportunity_id ?? null
  return entry.contact_id ?? null
}

export function useLists(userId: string | null | undefined) {
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) {
      setLists([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('lists')
      .select('*')
      .eq('user_id', userId)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('created_at')
    if (error) {
      console.error('load lists failed', error)
      setLists([])
    } else {
      setLists(((data ?? []) as List[]).map(withListDefaults))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()

    if (typeof window === 'undefined') return undefined
    const handleListsChanged = () => { void load() }
    const handleFocus = () => { void load() }
    window.addEventListener(LISTS_CHANGED_EVENT, handleListsChanged)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener(LISTS_CHANGED_EVENT, handleListsChanged)
      window.removeEventListener('focus', handleFocus)
    }
  }, [load])

  const createList = useCallback(async (input: CreateListInput): Promise<List | null> => {
    if (!userId) return null
    const name = input.name.trim()
    if (!name) return null
    const parentObject = input.parent_object ?? 'person'
    const { data, error } = await supabase
      .from('lists')
      .insert({
        user_id: userId,
        name,
        parent_object: parentObject,
        icon: input.icon?.trim() || LIST_OBJECT_LABELS[parentObject].icon,
        color: input.color ?? DEFAULT_LIST_COLORS[parentObject],
        purpose: input.purpose ?? null,
        stages: [],
      })
      .select()
      .single()
    if (error) {
      console.error('createList failed', error)
      return null
    }
    await load()
    notifyListsChanged()
    return withListDefaults(data as List)
  }, [userId, load])

  const updateList = useCallback(async (
    id: string,
    patch: Partial<Pick<List, 'name' | 'purpose' | 'stages' | 'color' | 'icon' | 'is_archived' | 'parent_object'>>,
  ) => {
    const { error } = await supabase.from('lists').update(patch).eq('id', id)
    if (error) console.error('updateList failed', error)
    else {
      await load()
      notifyListsChanged()
    }
  }, [load])

  const archiveList = useCallback(async (id: string) => {
    await updateList(id, { is_archived: true })
  }, [updateList])

  const deleteList = useCallback(async (id: string) => {
    const { error } = await supabase.from('lists').delete().eq('id', id)
    if (error) console.error('deleteList failed', error)
    await load()
    notifyListsChanged()
  }, [load])

  return { lists, loading, createList, updateList, archiveList, deleteList, reload: load }
}

export function useListWorkspace(userId: string | null | undefined, listId: string | null | undefined) {
  const [list, setList] = useState<List | null>(null)
  const [attributes, setAttributes] = useState<ListAttribute[]>([])
  const [views, setViews] = useState<ListView[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId || !listId) {
      setList(null)
      setAttributes([])
      setViews([])
      return
    }
    setLoading(true)
    const [listResult, attrResult, viewResult] = await Promise.all([
      supabase.from('lists').select('*').eq('user_id', userId).eq('id', listId).maybeSingle(),
      supabase.from('list_attributes').select('*').eq('user_id', userId).eq('list_id', listId).order('order_index'),
      supabase.from('list_views').select('*').eq('user_id', userId).eq('list_id', listId).order('order_index'),
    ])
    if (listResult.error) console.error('load list failed', listResult.error)
    if (attrResult.error) console.error('load list attributes failed', attrResult.error)
    if (viewResult.error) console.error('load list views failed', viewResult.error)
    setList(listResult.data ? withListDefaults(listResult.data as List) : null)
    setAttributes((attrResult.data ?? []) as ListAttribute[])
    setViews((viewResult.data ?? []) as ListView[])
    setLoading(false)
  }, [userId, listId])

  useEffect(() => { load() }, [load])

  const createAttribute = useCallback(async (input: CreateAttributeInput): Promise<ListAttribute | null> => {
    if (!userId || !listId) return null
    const { data, error } = await supabase
      .from('list_attributes')
      .insert({
        list_id: listId,
        user_id: userId,
        name: input.name.trim(),
        type: input.type,
        config: input.config ?? {},
        order_index: attributes.length,
      })
      .select()
      .single()
    if (error) {
      console.error('createAttribute failed', error)
      return null
    }
    await load()
    return data as ListAttribute
  }, [attributes.length, listId, load, userId])

  const updateAttribute = useCallback(async (attributeId: string, patch: Partial<ListAttribute>) => {
    const { error } = await supabase.from('list_attributes').update(patch).eq('id', attributeId)
    if (error) console.error('updateAttribute failed', error)
    else await load()
  }, [load])

  const createDefaultStatusAttribute = useCallback(async () => createAttribute({
    name: 'Stage',
    type: 'status',
    config: { options: DEFAULT_STATUS_OPTIONS },
  }), [createAttribute])

  const createView = useCallback(async (input: CreateViewInput): Promise<ListView | null> => {
    if (!userId || !listId) return null
    const isDefault = views.length === 0
    const { data, error } = await supabase
      .from('list_views')
      .insert({
        list_id: listId,
        user_id: userId,
        name: input.name.trim() || (input.type === 'kanban' ? 'Kanban' : 'Table'),
        type: input.type,
        config: input.config ?? {},
        order_index: views.length,
        is_default: isDefault,
      })
      .select()
      .single()
    if (error) {
      console.error('createView failed', error)
      return null
    }
    await load()
    return data as ListView
  }, [listId, load, userId, views.length])

  const updateView = useCallback(async (viewId: string, patch: Partial<ListView>) => {
    const { error } = await supabase.from('list_views').update(patch).eq('id', viewId)
    if (error) console.error('updateView failed', error)
    else await load()
  }, [load])

  const duplicateView = useCallback(async (view: ListView): Promise<ListView | null> => {
    return createView({
      name: `${view.name} copy`,
      type: view.type,
      config: view.config,
    })
  }, [createView])

  const deleteView = useCallback(async (viewId: string) => {
    const { error } = await supabase.from('list_views').delete().eq('id', viewId)
    if (error) console.error('deleteView failed', error)
    else await load()
  }, [load])

  return {
    list,
    attributes,
    views,
    loading,
    createAttribute,
    createDefaultStatusAttribute,
    updateAttribute,
    createView,
    updateView,
    duplicateView,
    deleteView,
    reload: load,
  }
}

export function useListEntries(
  userId: string | null | undefined,
  list: List | null | undefined,
) {
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [memberships, setMemberships] = useState<ListMembership[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId || !list) {
      setEntries([])
      setMemberships([])
      return
    }
    setLoading(true)
    const { data: membershipData, error } = await supabase
      .from('list_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('list_id', list.id)
      .order('entered_at', { ascending: false })
    if (error) {
      console.error('load list entries failed', error)
      setEntries([])
      setMemberships([])
      setLoading(false)
      return
    }
    const loadedMemberships = (membershipData ?? []) as ListMembership[]
    setMemberships(loadedMemberships)
    const ids = loadedMemberships
      .map(membership => getListRecordId(membership, list.parent_object))
      .filter((id): id is string => Boolean(id))
    if (ids.length === 0) {
      setEntries([])
      setLoading(false)
      return
    }

    const uniqueIds = Array.from(new Set(ids))
    const table = LIST_OBJECT_LABELS[list.parent_object].table
    const recordIdColumn = 'id'
    const recordResult = list.parent_object === 'opportunity'
      ? await supabase.from('opportunities').select('*, company:companies(*)').in(recordIdColumn, uniqueIds)
      : await supabase.from(table).select('*').in(recordIdColumn, uniqueIds)
    const { data: recordData, error: recordError } = recordResult
    if (recordError) {
      console.error('load list records failed', recordError)
      setEntries([])
      setLoading(false)
      return
    }

    const byId = new Map<string, ListRecord>()
    for (const record of (recordData ?? []) as unknown as ListRecord[]) byId.set(record.id, record)
    setEntries(loadedMemberships.flatMap(membership => {
      const recordId = getListRecordId(membership, list.parent_object)
      const record = recordId ? byId.get(recordId) : null
      return record ? [{ membership, record }] : []
    }))
    setLoading(false)
  }, [list, userId])

  useEffect(() => { load() }, [load])

  const addEntry = useCallback(async (
    recordId: string,
    attributes: Record<string, unknown> = {},
    notes?: string | null,
    statusAttributeId?: string,
  ): Promise<ListMembership | null> => {
    if (!userId || !list) return null
    const status = statusAttributeId ? String(attributes[statusAttributeId] ?? '') : ''
    const { data, error } = await supabase
      .from('list_memberships')
      .insert({
        ...membershipPayload(list.parent_object, recordId),
        list_id: list.id,
        user_id: userId,
        current_stage: status || null,
        notes: notes ?? null,
        attributes,
      })
      .select()
      .single()
    if (error) {
      console.error('add list entry failed', error)
      return null
    }
    await load()
    return data as ListMembership
  }, [list, load, userId])

  const updateEntry = useCallback(async (
    membershipId: string,
    attributes: Record<string, unknown>,
    notes?: string | null,
    statusAttributeId?: string,
  ) => {
    const status = statusAttributeId ? String(attributes[statusAttributeId] ?? '') : ''
    const { error } = await supabase
      .from('list_memberships')
      .update({
        attributes,
        notes: notes ?? null,
        current_stage: status || null,
        stage_changed_at: status ? new Date().toISOString() : undefined,
      })
      .eq('id', membershipId)
    if (error) console.error('update list entry failed', error)
    else await load()
  }, [load])

  const moveEntryStatus = useCallback(async (
    membership: ListMembership,
    statusAttributeId: string,
    statusValue: string | null,
  ) => {
    const attributes = { ...(membership.attributes ?? {}) }
    if (statusValue) attributes[statusAttributeId] = statusValue
    else delete attributes[statusAttributeId]
    const { error } = await supabase
      .from('list_memberships')
      .update({
        attributes,
        current_stage: statusValue,
        stage_changed_at: new Date().toISOString(),
      })
      .eq('id', membership.id)
    if (error) console.error('move list entry status failed', error)
    else await load()
  }, [load])

  const removeEntry = useCallback(async (membershipId: string) => {
    const { error } = await supabase.from('list_memberships').delete().eq('id', membershipId)
    if (error) console.error('remove list entry failed', error)
    else await load()
  }, [load])

  return { entries, memberships, loading, addEntry, updateEntry, moveEntryStatus, removeEntry, reload: load }
}

export function useListMemberships(
  userId: string | null | undefined,
  opts: { listId?: string; contactId?: string; companyId?: string; opportunityId?: string } = {},
) {
  const [memberships, setMemberships] = useState<ListMembership[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      return
    }
    setLoading(true)
    let q = supabase.from('list_memberships').select('*').eq('user_id', userId)
    if (opts.listId) q = q.eq('list_id', opts.listId)
    if (opts.contactId) q = q.eq('contact_id', opts.contactId)
    if (opts.companyId) q = q.eq('company_id', opts.companyId)
    if (opts.opportunityId) q = q.eq('opportunity_id', opts.opportunityId)
    const { data, error } = await q.order('entered_at', { ascending: false })
    if (error) {
      console.error('load memberships failed', error)
      setMemberships([])
    } else {
      setMemberships((data ?? []) as ListMembership[])
    }
    setLoading(false)
  }, [userId, opts.listId, opts.contactId, opts.companyId, opts.opportunityId])

  useEffect(() => { load() }, [load])

  const addToList = useCallback(async (
    contactId: string,
    listId: string,
    stage: string,
    notes?: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ListMembership | null> => {
    if (!userId) return null
    const data = await addRecordToList({
      userId,
      list: { id: listId, parent_object: 'person' },
      recordId: contactId,
      currentStage: stage || null,
      notes: notes ?? null,
      attributes,
    })
    await load()
    return data
  }, [userId, load])

  const moveStage = useCallback(async (
    membershipId: string,
    newStage: string,
  ) => {
    const { error } = await supabase
      .from('list_memberships')
      .update({ current_stage: newStage || null, stage_changed_at: new Date().toISOString() })
      .eq('id', membershipId)
    if (error) console.error('moveStage failed', error)
    else await load()
  }, [load])

  const removeFromList = useCallback(async (membershipId: string) => {
    const { error } = await supabase.from('list_memberships').delete().eq('id', membershipId)
    if (error) console.error('removeFromList failed', error)
    else await load()
  }, [load])

  return { memberships, loading, addToList, moveStage, removeFromList, reload: load }
}
