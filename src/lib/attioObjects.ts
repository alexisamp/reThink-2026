import { supabase } from '@/lib/supabase'
import type { Company, Contact, Opportunity } from '@/types'

export type CrmObjectType = 'standard' | 'custom'
export type CrmBackingSource = 'people' | 'companies' | 'deals' | 'generic'
export type CrmAccessLevel = 'read_only' | 'read_write' | 'full_access'
export type CrmAttributeSource = 'system' | 'custom' | 'enriched' | 'relationship'

export interface CrmObject {
  id: string
  user_id: string
  slug: string
  singular_name: string
  plural_name: string
  icon: string | null
  object_type: CrmObjectType
  standard_key: 'people' | 'companies' | 'deals' | 'users' | 'workspaces' | null
  backing_source: CrmBackingSource
  is_enabled: boolean
  is_archived: boolean
  record_text_attribute_id: string | null
  record_image_attribute_id: string | null
  created_at: string
  updated_at: string
}

export interface CrmAttribute {
  id: string
  user_id: string
  object_id: string
  key: string
  name: string
  attribute_type: string
  scope: 'object' | 'system'
  source: CrmAttributeSource
  is_system: boolean
  is_enriched: boolean
  is_relationship: boolean
  is_required: boolean
  is_unique: boolean
  is_editable: boolean
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CrmRecord {
  id: string
  user_id: string
  object_id: string
  title: string
  image_url: string | null
  values: Record<string, unknown>
  created_by: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CrmObjectPermission {
  id: string
  user_id: string
  object_id: string
  subject_type: 'workspace' | 'team' | 'member' | 'automation'
  subject_id: string | null
  label: string | null
  access_level: CrmAccessLevel
  created_at: string
  updated_at: string
}

export interface UnifiedRecord {
  id: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  values: Record<string, unknown>
  createdAt?: string | null
  raw: unknown
}

interface StandardObjectSeed {
  slug: string
  singular: string
  plural: string
  icon: string
  standardKey: NonNullable<CrmObject['standard_key']>
  backingSource: CrmBackingSource
  enabled: boolean
  attributes: Array<{
    key: string
    name: string
    type: string
    source?: CrmAttributeSource
    system?: boolean
    enriched?: boolean
    relationship?: boolean
    required?: boolean
    unique?: boolean
    editable?: boolean
    description?: string
  }>
}

export const ACCESS_RANK: Record<CrmAccessLevel, number> = {
  read_only: 1,
  read_write: 2,
  full_access: 3,
}

export const ACCESS_LABEL: Record<CrmAccessLevel, string> = {
  read_only: 'Read only',
  read_write: 'Read and write',
  full_access: 'Full access',
}

const ensureObjectsCache = new Map<string, Promise<void>>()

export function getEffectiveAccess(permissions: CrmObjectPermission[]) {
  return permissions.reduce<CrmAccessLevel>((best, permission) => (
    ACCESS_RANK[permission.access_level] > ACCESS_RANK[best] ? permission.access_level : best
  ), 'read_only')
}

const BASE_SYSTEM_ATTRIBUTES = [
  { key: 'record_id', name: 'Record ID', type: 'Record ID', system: true, unique: true, editable: false, description: 'Unique ID generated when a record is created.' },
  { key: 'list_entries', name: 'List Entries', type: 'Relationship', system: true, relationship: true, editable: false, description: 'Lists this record is in.' },
  { key: 'next_due_task', name: 'Next due task', type: 'Date', system: true, editable: false, description: 'Due date of the next upcoming task linked to the record.' },
  { key: 'created_at', name: 'Created at', type: 'Timestamp', system: true, editable: false, description: 'Date and time the record was created.' },
  { key: 'created_by', name: 'Created by', type: 'User', system: true, editable: false, description: 'Who or what created the record.' },
]

const STANDARD_OBJECTS: StandardObjectSeed[] = [
  {
    slug: 'people',
    singular: 'Person',
    plural: 'People',
    icon: '👤',
    standardKey: 'people',
    backingSource: 'people',
    enabled: true,
    attributes: [
      { key: 'name', name: 'Name', type: 'Text', source: 'system', system: true, required: true },
      { key: 'email', name: 'Email addresses', type: 'Email', source: 'system', system: true, unique: true },
      { key: 'company', name: 'Company', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'job_title', name: 'Job title', type: 'Text', source: 'enriched', enriched: true },
      { key: 'phone_numbers', name: 'Phone numbers', type: 'Phone', source: 'system', system: true },
      { key: 'owner', name: 'Owner', type: 'User', source: 'system', system: true },
      { key: 'profile_picture_url', name: 'Profile picture', type: 'URL', source: 'enriched', enriched: true },
      { key: 'description', name: 'Description', type: 'Text', source: 'enriched', enriched: true },
      { key: 'location', name: 'Primary location', type: 'Location', source: 'enriched', enriched: true },
      { key: 'facebook_url', name: 'Facebook', type: 'URL', source: 'enriched', enriched: true },
      { key: 'linkedin_url', name: 'LinkedIn', type: 'URL', source: 'enriched', enriched: true },
      { key: 'twitter_url', name: 'Twitter', type: 'URL', source: 'enriched', enriched: true },
      { key: 'angellist_url', name: 'AngelList', type: 'URL', source: 'enriched', enriched: true },
      { key: 'instagram_url', name: 'Instagram', type: 'URL', source: 'custom' },
      { key: 'employee_range', name: 'Employee range', type: 'Number', source: 'enriched', enriched: true },
      { key: 'twitter_follower_count', name: 'Twitter follower count', type: 'Number', source: 'enriched', enriched: true },
      { key: 'first_interaction', name: 'First interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'connection_strength', name: 'Connection strength', type: 'Number', source: 'enriched', enriched: true, editable: false },
      { key: 'last_interaction_at', name: 'Last interaction', type: 'Timestamp', source: 'enriched', enriched: true, editable: false },
      { key: 'next_interaction', name: 'Next interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'strongest_connection', name: 'Strongest connection', type: 'User', source: 'enriched', enriched: true, editable: false },
      { key: 'associated_deals', name: 'Associated deals', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'associated_companies', name: 'Associated companies', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'associated_users', name: 'Associated users', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'associated_workspaces', name: 'Associated workspaces', type: 'Relationship', source: 'relationship', relationship: true },
    ],
  },
  {
    slug: 'companies',
    singular: 'Company',
    plural: 'Companies',
    icon: '🏢',
    standardKey: 'companies',
    backingSource: 'companies',
    enabled: true,
    attributes: [
      { key: 'name', name: 'Name', type: 'Text', source: 'enriched', system: true, enriched: true, required: true },
      { key: 'domain', name: 'Domains', type: 'Domain', source: 'system', system: true, unique: true },
      { key: 'team', name: 'Team', type: 'Relationship', source: 'relationship', relationship: true, enriched: true },
      { key: 'logo_url', name: 'Logo URL', type: 'Text', source: 'enriched', enriched: true },
      { key: 'description', name: 'Description', type: 'Text', source: 'enriched', enriched: true },
      { key: 'sector', name: 'Categories', type: 'Multi-select', source: 'enriched', enriched: true },
      { key: 'hq_location', name: 'Primary location', type: 'Location', source: 'enriched', enriched: true },
      { key: 'country', name: 'Country', type: 'Text', source: 'enriched', enriched: true },
      { key: 'facebook_url', name: 'Facebook', type: 'Text', source: 'enriched', enriched: true },
      { key: 'linkedin_url', name: 'LinkedIn', type: 'Text', source: 'enriched', enriched: true },
      { key: 'twitter_url', name: 'Twitter', type: 'Text', source: 'enriched', enriched: true },
      { key: 'angellist_url', name: 'AngelList', type: 'Text', source: 'enriched', enriched: true },
      { key: 'instagram_url', name: 'Instagram', type: 'Text', source: 'system', system: true },
      { key: 'twitter_follower_count', name: 'Twitter follower count', type: 'Number', source: 'enriched', enriched: true },
      { key: 'estimated_arr', name: 'Estimated ARR', type: 'Select', source: 'enriched', enriched: true, editable: false },
      { key: 'funding_raised', name: 'Funding raised', type: 'Currency', source: 'enriched', enriched: true },
      { key: 'founded_year', name: 'Foundation date', type: 'Date', source: 'enriched', enriched: true },
      { key: 'employees_count', name: 'Employee range', type: 'Select', source: 'enriched', enriched: true },
      { key: 'first_calendar_interaction', name: 'First calendar interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'last_calendar_interaction', name: 'Last calendar interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'next_calendar_interaction', name: 'Next calendar interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'first_email_interaction', name: 'First email interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'last_email_interaction', name: 'Last email interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'first_interaction', name: 'First interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'last_interaction', name: 'Last interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'next_interaction', name: 'Next interaction', type: 'Interaction', source: 'enriched', enriched: true, editable: false },
      { key: 'connection_strength_legacy', name: 'Connection strength (legacy)', type: 'Number', source: 'enriched', enriched: true, editable: false },
      { key: 'connection_strength', name: 'Connection strength', type: 'Select', source: 'enriched', enriched: true, editable: false },
      { key: 'strongest_connection', name: 'Strongest connection', type: 'User', source: 'enriched', enriched: true, editable: false },
      { key: 'associated_deals', name: 'Associated deals', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'associated_workspaces', name: 'Associated workspaces', type: 'Relationship', source: 'relationship', relationship: true },
    ],
  },
  {
    slug: 'deals',
    singular: 'Deal',
    plural: 'Deals',
    icon: '◎',
    standardKey: 'deals',
    backingSource: 'deals',
    enabled: true,
    attributes: [
      { key: 'title', name: 'Deal name', type: 'Text', source: 'system', system: true, required: true },
      { key: 'owner', name: 'Deal owner', type: 'User', source: 'system', system: true, required: true },
      { key: 'stage', name: 'Deal stage', type: 'Status', source: 'system', system: true, required: true },
      { key: 'estimated_value', name: 'Deal value', type: 'Currency', source: 'system', system: true },
      { key: 'company_id', name: 'Associated company', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'associated_people', name: 'Associated people', type: 'Relationship', source: 'relationship', relationship: true },
    ],
  },
  {
    slug: 'users',
    singular: 'User',
    plural: 'Users',
    icon: '◉',
    standardKey: 'users',
    backingSource: 'generic',
    enabled: false,
    attributes: [
      { key: 'user_id', name: 'User ID', type: 'Text', source: 'system', system: true, required: true, unique: true },
      { key: 'primary_email', name: 'Primary email address', type: 'Email', source: 'system', system: true, required: true, unique: true },
      { key: 'workspaces', name: 'Workspaces', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'person', name: 'Person', type: 'Relationship', source: 'relationship', relationship: true },
    ],
  },
  {
    slug: 'workspaces',
    singular: 'Workspace',
    plural: 'Workspaces',
    icon: '◆',
    standardKey: 'workspaces',
    backingSource: 'generic',
    enabled: false,
    attributes: [
      { key: 'workspace_id', name: 'Workspace ID', type: 'Text', source: 'system', system: true, required: true, unique: true },
      { key: 'name', name: 'Name', type: 'Text', source: 'system', system: true, required: true },
      { key: 'users', name: 'Users', type: 'Relationship', source: 'relationship', relationship: true },
      { key: 'company', name: 'Company', type: 'Relationship', source: 'relationship', relationship: true },
    ],
  },
]

export function slugifyObjectName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function attrPayload(seed: StandardObjectSeed['attributes'][number], userId: string, objectId: string, index: number, forceSystem = false) {
  const source = seed.source ?? (seed.system ? 'system' : 'custom')
  const isSystem = Boolean(seed.system || forceSystem)
  return {
    user_id: userId,
    object_id: objectId,
    key: seed.key,
    name: seed.name,
    attribute_type: seed.type,
    scope: isSystem ? 'system' : 'object',
    source,
    is_system: isSystem,
    is_enriched: Boolean(seed.enriched),
    is_relationship: Boolean(seed.relationship),
    is_required: Boolean(seed.required),
    is_unique: Boolean(seed.unique),
    is_editable: seed.editable ?? !seed.system,
    description: seed.description ?? null,
    sort_order: index,
  }
}

async function ensureAttributes(userId: string, objectId: string, attributes: StandardObjectSeed['attributes'], forceSystem = false) {
  const all = [...attributes, ...BASE_SYSTEM_ATTRIBUTES]
  const { data: existing } = await supabase
    .from('crm_attributes')
    .select('key')
    .eq('object_id', objectId)
  const existingKeys = new Set((existing ?? []).map(row => row.key))
  const missing = all
    .map((attribute, index) => ({ attribute, index }))
    .filter(({ attribute }) => !existingKeys.has(attribute.key))

  if (!missing.length) return

  await supabase
    .from('crm_attributes')
    .upsert(
      missing.map(({ attribute, index }) => attrPayload(attribute, userId, objectId, index, forceSystem)),
      { onConflict: 'object_id,key' },
    )
}

async function ensureWorkspacePermission(userId: string, objectId: string) {
  const { data: existing } = await supabase
    .from('crm_object_permissions')
    .select('id')
    .eq('object_id', objectId)
    .eq('subject_type', 'workspace')
    .maybeSingle()

  if (existing?.id) return
  await supabase.from('crm_object_permissions').insert({
    user_id: userId,
    object_id: objectId,
    subject_type: 'workspace',
    subject_id: null,
    label: 'Workspace access',
    access_level: 'read_write',
  })
}

async function ensureAdminPermission(userId: string, objectId: string, userEmail?: string | null, userName?: string | null) {
  const { data: existing } = await supabase
    .from('crm_object_permissions')
    .select('id')
    .eq('object_id', objectId)
    .eq('subject_type', 'member')
    .eq('subject_id', userId)
    .maybeSingle()

  if (existing?.id) return
  await supabase.from('crm_object_permissions').insert({
    user_id: userId,
    object_id: objectId,
    subject_type: 'member',
    subject_id: userId,
    label: userName ?? userEmail ?? 'Workspace admin',
    access_level: 'full_access',
  })
}

async function ensureAttioObjectsUncached(userId: string, userEmail?: string | null, userName?: string | null) {
  await supabase.from('crm_workspace_members').upsert({
    user_id: userId,
    member_user_id: userId,
    email: userEmail ?? null,
    name: userName ?? userEmail ?? 'Workspace admin',
    role: 'admin',
  }, { onConflict: 'user_id,member_user_id' })

  const { data: existing } = await supabase.from('crm_objects').select('*').eq('user_id', userId)
  const bySlug = new Map((existing ?? []).map((obj: CrmObject) => [obj.slug, obj]))

  for (const seed of STANDARD_OBJECTS) {
    let obj = bySlug.get(seed.slug)
    if (!obj) {
      const { data } = await supabase.from('crm_objects').insert({
        user_id: userId,
        slug: seed.slug,
        singular_name: seed.singular,
        plural_name: seed.plural,
        icon: seed.icon,
        object_type: 'standard',
        standard_key: seed.standardKey,
        backing_source: seed.backingSource,
        is_enabled: seed.enabled,
      }).select('*').single()
      obj = data as CrmObject | undefined
    }
    if (obj) {
      await ensureAttributes(userId, obj.id, seed.attributes, true)
      await ensureWorkspacePermission(userId, obj.id)
      await ensureAdminPermission(userId, obj.id, userEmail, userName)
    }
  }
}

export async function ensureAttioObjects(userId: string, userEmail?: string | null, userName?: string | null) {
  const cached = ensureObjectsCache.get(userId)
  if (cached) return cached

  const promise = ensureAttioObjectsUncached(userId, userEmail, userName).catch(error => {
    ensureObjectsCache.delete(userId)
    throw error
  })
  ensureObjectsCache.set(userId, promise)
  return promise
}

export async function fetchObjects(userId: string) {
  await ensureAttioObjects(userId)
  const { data } = await supabase
    .from('crm_objects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('object_type', { ascending: false })
    .order('plural_name')
  return (data ?? []) as CrmObject[]
}

export async function fetchAttributeCounts(userId: string, objectIds: string[]) {
  if (!objectIds.length) return {}
  const { data } = await supabase
    .from('crm_attributes')
    .select('object_id')
    .eq('user_id', userId)
    .in('object_id', objectIds)

  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.object_id] = (counts[row.object_id] ?? 0) + 1
    return counts
  }, {})
}

export async function fetchObjectBundle(userId: string, slug: string) {
  await ensureAttioObjects(userId)
  const { data: object } = await supabase
    .from('crm_objects')
    .select('*')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()
  if (!object) return null
  const [{ data: attributes }, { data: permissions }] = await Promise.all([
    supabase.from('crm_attributes').select('*').eq('object_id', object.id).order('sort_order'),
    supabase.from('crm_object_permissions').select('*').eq('object_id', object.id).order('subject_type'),
  ])
  return {
    object: object as CrmObject,
    attributes: (attributes ?? []) as CrmAttribute[],
    permissions: (permissions ?? []) as CrmObjectPermission[],
  }
}

export async function countObjectRecords(userId: string, object: CrmObject): Promise<number> {
  if (object.backing_source === 'people') {
    const { count } = await supabase.from('outreach_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    return count ?? 0
  }
  if (object.backing_source === 'companies') {
    const { count } = await supabase.from('companies').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    return count ?? 0
  }
  if (object.backing_source === 'deals') {
    const { count } = await supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    return count ?? 0
  }
  const { count } = await supabase.from('crm_records').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('object_id', object.id).eq('is_archived', false)
  return count ?? 0
}

function companyImage(logoUrl?: string | null, domain?: string | null) {
  if (logoUrl) return logoUrl
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}

function valueMap(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))
}

function deriveCountry(row: Record<string, unknown>) {
  const direct = row.country ?? row.hq_country
  if (typeof direct === 'string' && direct.trim()) return direct
  const location = row.hq_location ?? row.location
  if (typeof location !== 'string') return undefined
  const parts = location.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : undefined
}

export async function fetchObjectRecords(userId: string, object: CrmObject): Promise<UnifiedRecord[]> {
  if (object.backing_source === 'people') {
    const { data } = await supabase.from('outreach_logs').select('*').eq('user_id', userId).order('name')
    return ((data ?? []) as Contact[]).map(row => ({
      id: row.id,
      title: row.name,
      subtitle: [row.job_title, row.company].filter(Boolean).join(' · ') || row.email,
      imageUrl: row.profile_photo_url ?? null,
      values: valueMap({ ...(row as unknown as Record<string, unknown>), country: deriveCountry(row as unknown as Record<string, unknown>) }),
      createdAt: row.created_at,
      raw: row,
    }))
  }
  if (object.backing_source === 'companies') {
    const { data } = await supabase.from('companies').select('*').eq('user_id', userId).order('name')
    return ((data ?? []) as Company[]).map(row => ({
      id: row.id,
      title: row.name,
      subtitle: row.domain || row.sector || row.headline,
      imageUrl: companyImage(row.logo_url, row.domain),
      values: valueMap(row as unknown as Record<string, unknown>),
      createdAt: row.created_at,
      raw: row,
    }))
  }
  if (object.backing_source === 'deals') {
    const { data } = await supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', userId).order('created_at', { ascending: false })
    return ((data ?? []) as Opportunity[]).map(row => ({
      id: row.id,
      title: row.title,
      subtitle: [row.company?.name, row.stage, row.type].filter(Boolean).join(' · '),
      imageUrl: companyImage(row.company?.logo_url, row.company?.domain),
      values: valueMap({ ...row, company: row.company?.name }),
      createdAt: row.created_at,
      raw: row,
    }))
  }
  const { data } = await supabase
    .from('crm_records')
    .select('*')
    .eq('user_id', userId)
    .eq('object_id', object.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
  return ((data ?? []) as CrmRecord[]).map(row => ({
    id: row.id,
    title: row.title,
    subtitle: null,
    imageUrl: row.image_url,
    values: { ...row.values, record_id: row.id, created_at: row.created_at, created_by: row.created_by },
    createdAt: row.created_at,
    raw: row,
  }))
}

export async function fetchObjectRecord(userId: string, object: CrmObject, recordId: string) {
  const records = await fetchObjectRecords(userId, object)
  return records.find(record => record.id === recordId) ?? null
}

export async function createObjectRecord(userId: string, object: CrmObject, title: string) {
  const clean = title.trim()
  if (!clean) return null
  if (object.backing_source === 'people') {
    const { data } = await supabase.from('outreach_logs').insert({
      user_id: userId,
      name: clean,
      status: 'PROSPECT',
      log_date: new Date().toISOString().slice(0, 10),
      health_score: 1,
      links: [],
    }).select('*').single()
    return data ? (data as Contact).id : null
  }
  if (object.backing_source === 'companies') {
    const { data } = await supabase.from('companies').insert({ user_id: userId, name: clean }).select('*').single()
    return data ? (data as Company).id : null
  }
  if (object.backing_source === 'deals') {
    const { data } = await supabase.from('opportunities').insert({
      user_id: userId,
      title: clean,
      type: 'business',
      stage: 'exploring',
    }).select('*').single()
    return data ? (data as Opportunity).id : null
  }
  const { data } = await supabase.from('crm_records').insert({
    user_id: userId,
    object_id: object.id,
    title: clean,
    values: {},
    created_by: userId,
  }).select('*').single()
  return data ? (data as CrmRecord).id : null
}

export async function updateObjectRecord(userId: string, object: CrmObject, recordId: string, patch: Record<string, unknown>) {
  if (object.backing_source === 'people') return supabase.from('outreach_logs').update(patch).eq('user_id', userId).eq('id', recordId)
  if (object.backing_source === 'companies') return supabase.from('companies').update(patch).eq('user_id', userId).eq('id', recordId)
  if (object.backing_source === 'deals') return supabase.from('opportunities').update(patch).eq('user_id', userId).eq('id', recordId)
  const { title, image_url, ...rest } = patch
  const update: Record<string, unknown> = {}
  if (typeof title === 'string') update.title = title
  if (typeof image_url === 'string' || image_url === null) update.image_url = image_url
  if (Object.keys(rest).length > 0) update.values = rest
  return supabase.from('crm_records').update(update).eq('user_id', userId).eq('id', recordId)
}

export async function createCustomObject(userId: string, plural: string, singular: string, slug: string) {
  const cleanSlug = slugifyObjectName(slug)
  const { data, error } = await supabase.from('crm_objects').insert({
    user_id: userId,
    slug: cleanSlug,
    singular_name: singular.trim(),
    plural_name: plural.trim(),
    icon: '◇',
    object_type: 'custom',
    standard_key: null,
    backing_source: 'generic',
    is_enabled: true,
  }).select('*').single()
  if (error || !data) return { object: null, error }
  await ensureAttributes(userId, data.id, [])
  const { data: recordIdAttr } = await supabase.from('crm_attributes').select('id').eq('object_id', data.id).eq('key', 'record_id').maybeSingle()
  if (recordIdAttr?.id) await supabase.from('crm_objects').update({ record_text_attribute_id: recordIdAttr.id }).eq('id', data.id)
  await supabase.from('crm_object_permissions').insert({
    user_id: userId,
    object_id: data.id,
    subject_type: 'workspace',
    label: 'Workspace access',
    access_level: 'read_write',
  })
  await ensureAdminPermission(userId, data.id)
  return { object: data as CrmObject, error: null }
}

export async function updateObjectConfig(objectId: string, patch: Partial<Pick<CrmObject, 'singular_name' | 'plural_name' | 'icon' | 'is_enabled' | 'record_text_attribute_id' | 'record_image_attribute_id'>>) {
  if (patch.is_enabled === false) {
    const { data: object } = await supabase
      .from('crm_objects')
      .select('slug, object_type')
      .eq('id', objectId)
      .maybeSingle()
    if (object?.object_type === 'standard' && ['people', 'companies'].includes(object.slug)) {
      return { data: null, error: new Error('People and Companies cannot be deactivated.') }
    }
  }
  return supabase.from('crm_objects').update(patch).eq('id', objectId)
}

export async function deleteCustomObject(object: CrmObject) {
  if (object.object_type !== 'custom') return { error: new Error('Only custom objects can be deleted') }
  return supabase.from('crm_objects').delete().eq('id', object.id)
}

export async function updatePermission(permissionId: string, accessLevel: CrmAccessLevel) {
  return supabase.from('crm_object_permissions').update({ access_level: accessLevel }).eq('id', permissionId)
}

export async function addObjectPermission(userId: string, objectId: string, subjectType: CrmObjectPermission['subject_type'], label: string, accessLevel: CrmAccessLevel) {
  return supabase.from('crm_object_permissions').insert({
    user_id: userId,
    object_id: objectId,
    subject_type: subjectType,
    label,
    access_level: accessLevel,
  })
}
