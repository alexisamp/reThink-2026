import { supabase } from '@/lib/supabase'
import type { CrmAttribute, CrmObject } from '@/lib/attioObjects'

export type CrmViewType = 'table' | 'kanban'
export type CrmViewDensity = 'standard' | 'compact'
export type CrmViewSortDirection = 'asc' | 'desc'
export type CrmFilterOperator =
  | 'is' | 'is not' | 'contains' | 'does not contain'
  | 'is empty' | 'is not empty' | 'greater than' | 'less than'
  | 'is before' | 'is after'

export interface CrmViewFilter {
  key: string
  operator: CrmFilterOperator
  value: unknown
}

export interface CrmViewSort {
  key: string
  direction: CrmViewSortDirection
}

export interface CrmViewStageSetting {
  id: string | null
  label: string
  color: string
  trackTime?: boolean
  confetti?: boolean
}

export interface CrmSavedView {
  id: string
  user_id: string
  object_id: string
  list_id: string | null
  legacy_key: string | null
  title: string
  view_type: CrmViewType
  columns: string[]
  column_widths: Record<string, number>
  filters: CrmViewFilter[]
  sorts: CrmViewSort[]
  density: CrmViewDensity
  show_attribute_names: boolean
  group_by_attribute_key: string | null
  stage_settings: CrmViewStageSetting[]
  is_favorite: boolean
  is_default: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface CreateCrmViewInput {
  title: string
  view_type: CrmViewType
  columns: string[]
  group_by_attribute_key?: string | null
  stage_settings?: CrmViewStageSetting[]
}

export interface CrmListEntry {
  id: string
  list_id: string
  user_id: string
  object_slug: string
  record_id: string
  current_stage: string | null
  entered_at: string
  stage_changed_at: string
  notes: string | null
  attributes: Record<string, unknown>
  created_at: string
  updated_at: string
}

const VIEW_COLUMNS = 'id,user_id,object_id,list_id,legacy_key,title,view_type,columns,column_widths,filters,sorts,density,show_attribute_names,group_by_attribute_key,stage_settings,is_favorite,is_default,position,created_at,updated_at'

function normalizeView(row: Record<string, unknown>): CrmSavedView {
  const rawSorts = Array.isArray(row.sorts) ? row.sorts : []
  return {
    ...(row as unknown as CrmSavedView),
    columns: Array.isArray(row.columns) ? row.columns.filter((item): item is string => typeof item === 'string') : [],
    column_widths: row.column_widths && typeof row.column_widths === 'object' && !Array.isArray(row.column_widths) ? row.column_widths as Record<string, number> : {},
    filters: Array.isArray(row.filters) ? row.filters as CrmViewFilter[] : [],
    sorts: rawSorts.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const sort = item as { key?: unknown; direction?: unknown; dir?: unknown }
      if (typeof sort.key !== 'string') return []
      return [{ key: sort.key, direction: sort.direction === 'desc' || sort.dir === 'desc' ? 'desc' : 'asc' } satisfies CrmViewSort]
    }),
    stage_settings: Array.isArray(row.stage_settings) ? row.stage_settings as CrmViewStageSetting[] : [],
    is_favorite: Boolean(row.is_favorite),
  }
}

export function defaultViewColumns(attributes: CrmAttribute[], objectSlug?: string) {
  const preferred: Record<string, string[]> = {
    companies: ['last_interaction', 'connection_strength', 'sector', 'domain', 'linkedin_url', 'twitter_url', 'twitter_follower_count', 'founded_year', 'hq_location', 'country', 'description'],
    people: ['email', 'job_title', 'company', 'connection_strength', 'last_interaction_at', 'location', 'linkedin_url', 'phone_numbers'],
    deals: ['owner', 'stage', 'estimated_value', 'company_id', 'associated_people', 'created_at'],
  }
  const active = attributes
    .filter(attribute => !attribute.is_archived && !attribute.is_relationship)
    .filter(attribute => !['name', 'title', 'logo_url', 'favicon_url', 'profile_picture_url', 'record_id', 'list_entries', 'created_by'].includes(attribute.key))
    .sort((a, b) => a.sort_order - b.sort_order)
  const available = new Set(active.map(attribute => attribute.key))
  const ordered = (preferred[objectSlug ?? ''] ?? []).filter(key => available.has(key))
  return ordered.length ? ordered : active.slice(0, 8).map(attribute => attribute.key)
}

export async function fetchCrmViews(userId: string, objectId: string, listId?: string | null) {
  let query = supabase.from('crm_views').select(VIEW_COLUMNS).eq('user_id', userId).eq('object_id', objectId)
  query = listId ? query.eq('list_id', listId) : query.is('list_id', null)
  const { data, error } = await query.order('position').order('created_at')
  if (error) throw error
  return (data ?? []).map(row => normalizeView(row as Record<string, unknown>))
}

export async function ensureDefaultCrmView(userId: string, object: CrmObject, attributes: CrmAttribute[]) {
  const existing = await fetchCrmViews(userId, object.id, null)
  if (existing.length) return existing
  const { data, error } = await supabase.from('crm_views').insert({
    user_id: userId,
    object_id: object.id,
    legacy_key: 'all',
    title: `All ${object.plural_name}`,
    view_type: 'table',
    columns: defaultViewColumns(attributes, object.slug),
    is_default: true,
  }).select(VIEW_COLUMNS).single()
  if (error) throw error
  return [normalizeView(data as Record<string, unknown>)]
}

export async function createCrmView(userId: string, objectId: string, listId: string | null, input: CreateCrmViewInput, position: number) {
  const { data, error } = await supabase.from('crm_views').insert({
    user_id: userId,
    object_id: objectId,
    list_id: listId,
    title: input.title,
    view_type: input.view_type,
    columns: input.columns,
    group_by_attribute_key: input.group_by_attribute_key ?? null,
    stage_settings: input.stage_settings ?? [],
    position,
  }).select(VIEW_COLUMNS).single()
  if (error) throw error
  return normalizeView(data as Record<string, unknown>)
}

export async function patchCrmView(viewId: string, patch: Partial<Pick<CrmSavedView,
  'title' | 'columns' | 'column_widths' | 'filters' | 'sorts' | 'density' |
  'show_attribute_names' | 'group_by_attribute_key' | 'stage_settings' | 'is_favorite' | 'position'
>>) {
  const { data, error } = await supabase.from('crm_views').update(patch).eq('id', viewId).select(VIEW_COLUMNS).single()
  if (error) throw error
  return normalizeView(data as Record<string, unknown>)
}

export async function duplicateCrmView(view: CrmSavedView, position: number) {
  return createCrmView(view.user_id, view.object_id, view.list_id, {
    title: `${view.title} copy`,
    view_type: view.view_type,
    columns: [...view.columns],
    group_by_attribute_key: view.group_by_attribute_key,
    stage_settings: view.stage_settings.map(stage => ({ ...stage })),
  }, position).then(async copy => patchCrmView(copy.id, {
    column_widths: { ...view.column_widths },
    filters: view.filters.map(filter => ({ ...filter })),
    sorts: view.sorts.map(sort => ({ ...sort })),
    density: view.density,
    show_attribute_names: view.show_attribute_names,
  }))
}

export async function deleteCrmView(viewId: string) {
  const { error } = await supabase.from('crm_views').delete().eq('id', viewId)
  if (error) throw error
}

export async function activateListView(listId: string, viewId: string | null) {
  const { error } = await supabase.from('lists').update({ active_view_id: viewId }).eq('id', listId)
  if (error) throw error
}

export async function fetchCrmListEntries(userId: string, listId: string, objectSlug?: string | null) {
  let query = supabase.from('crm_list_entries').select('*').eq('user_id', userId).eq('list_id', listId)
  if (objectSlug) query = query.eq('object_slug', objectSlug)
  const { data, error } = await query.order('entered_at')
  if (error) throw error
  return (data ?? []) as CrmListEntry[]
}

export async function addCrmListEntries(userId: string, listId: string, objectSlug: string, recordIds: string[], stage: string | null) {
  if (!recordIds.length) return []
  const { data, error } = await supabase.from('crm_list_entries').upsert(recordIds.map(recordId => ({
    user_id: userId,
    list_id: listId,
    object_slug: objectSlug,
    record_id: recordId,
    current_stage: stage,
  })), { onConflict: 'list_id,object_slug,record_id' }).select('*')
  if (error) throw error
  return (data ?? []) as CrmListEntry[]
}

export async function moveCrmListEntry(entryId: string, stage: string | null) {
  const { error } = await supabase.from('crm_list_entries').update({ current_stage: stage, stage_changed_at: new Date().toISOString() }).eq('id', entryId)
  if (error) throw error
}

export async function removeCrmListEntries(entryIds: string[]) {
  if (!entryIds.length) return
  const { error } = await supabase.from('crm_list_entries').delete().in('id', entryIds)
  if (error) throw error
}
