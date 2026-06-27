import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowsDownUp,
  At,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircle,
  Check,
  CheckSquare,
  Clock,
  Confetti,
  Copy,
  DownloadSimple,
  DotsThree,
  EnvelopeSimple,
  FacebookLogo,
  FileText,
  FunnelSimple,
  GearSix,
  Globe,
  Hash,
  IdentificationBadge,
  InstagramLogo,
  LinkSimple,
  LinkedinLogo,
  MapPin,
  MagnifyingGlass,
  PencilSimple,
  Phone,
  Plus,
  Question,
  Star,
  Table,
  Tag,
  TextAa,
  TrashSimple,
  UploadSimple,
  UsersThree,
  XLogo,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import {
  DEFAULT_STATUS_OPTIONS,
  LIST_OBJECT_LABELS,
  type ListEntry,
  getListRecordId,
  useListEntries,
  useLists,
  useListWorkspace,
} from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import type {
  Company,
  Contact,
  ListAttribute,
  ListAttributeOption,
  ListMembership,
  ListRecordKind,
  ListView,
  Opportunity,
} from '@/types'

type RecordRow = Contact | Company | Opportunity
type CalculationMode = 'none' | 'count' | 'empty' | 'filled'
type ViewSettingColumn = { key: string; label: string; icon: ReactNode; path: string[] }

interface ObjectColumn {
  key: string
  label: string
  icon: string
  group?: string
  relationCount?: number
  path?: string[]
  read: (record: RecordRow) => string
}

function readField(record: RecordRow, key: string) {
  const value = (record as unknown as Record<string, unknown>)[key]
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => {
    if (item && typeof item === 'object' && 'label' in item) return String((item as { label?: unknown }).label ?? '')
    if (item && typeof item === 'object' && 'url' in item) return String((item as { url?: unknown }).url ?? '')
    return String(item)
  }).filter(Boolean).join(', ')
  return JSON.stringify(value)
}

function objectPathLabel(kind: ListRecordKind) {
  return kind === 'company' ? 'Company' : kind === 'person' ? 'Person' : 'Deal'
}

function columnPath(kind: ListRecordKind, column: ObjectColumn) {
  if (column.key === `object:${kind}`) return []
  return column.path ?? [objectPathLabel(kind)]
}

function objectColumnGroupLabel(kind: ListRecordKind, column: ObjectColumn) {
  const path = columnPath(kind, column)
  if (path.length > 1) return `${path[path.length - 1]} attributes`
  if (path.length === 1) return `${path[0]} attributes`
  return `${objectPathLabel(kind)} attributes`
}

function groupObjectColumns(kind: ListRecordKind, columns: ObjectColumn[]) {
  const grouped: Array<{ label: string; columns: ObjectColumn[] }> = []
  columns.forEach(column => {
    const label = objectColumnGroupLabel(kind, column)
    const group = grouped.find(item => item.label === label)
    if (group) group.columns.push(column)
    else grouped.push({ label, columns: [column] })
  })
  return grouped
}

function readNestedField(record: RecordRow, path: string[]) {
  let value: unknown = record
  for (const segment of path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    value = (value as Record<string, unknown>)[segment]
  }
  return formatFieldValue(value)
}

function sameRecordName(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())
}

function formatFieldValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => {
    if (item && typeof item === 'object' && 'label' in item) return String((item as { label?: unknown }).label ?? '')
    if (item && typeof item === 'object' && 'url' in item) return String((item as { url?: unknown }).url ?? '')
    return String(item)
  }).filter(Boolean).join(', ')
  return JSON.stringify(value)
}

function formatObjectFieldLabel(key: string) {
  if (key === 'domain') return 'Domains'
  return key
    .replace(/_id$/i, ' ID')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bIcp\b/g, 'ICP')
}

function inferObjectColumnIcon(key: string, value: unknown) {
  if (key.includes('url') || key.includes('website') || key.includes('link')) return '↗'
  if (key.includes('domain')) return '◎'
  if (key.includes('email')) return '@'
  if (key.includes('phone')) return '☏'
  if (key.includes('date') || key.endsWith('_at')) return '◷'
  if (key.includes('location')) return '⌖'
  if (typeof value === 'number') return '#'
  if (typeof value === 'boolean') return '✓'
  if (Array.isArray(value)) return '▦'
  if (value && typeof value === 'object') return '▦'
  return 'A'
}

function shouldExposeTopLevelObjectField(value: unknown) {
  return !value || typeof value !== 'object' || Array.isArray(value)
}

function shouldExposeNestedField(key: string, value: unknown) {
  if (value == null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return true
  return !key.endsWith('_config') && !key.endsWith('_map') && !key.endsWith('_prep')
}

function buildObjectColumns(kind: ListRecordKind, records: RecordRow[]) {
  const columns = [...OBJECT_COLUMNS[kind]]
  const known = new Set(columns.map(column => column.key))
  const sampleValues = new Map<string, unknown>()
  const nestedSamples = new Map<string, { path: string[]; value: unknown }>()
  records.forEach(record => {
    Object.entries(record as unknown as Record<string, unknown>).forEach(([key, value]) => {
      if (shouldExposeTopLevelObjectField(value) && !sampleValues.has(key) && value !== undefined) sampleValues.set(key, value)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
          if (!shouldExposeNestedField(nestedKey, nestedValue)) return
          const nestedColumnKey = `${key}.${nestedKey}`
          if (!nestedSamples.has(nestedColumnKey) && nestedValue !== undefined) {
            nestedSamples.set(nestedColumnKey, { path: [key, nestedKey], value: nestedValue })
          }
        })
      }
    })
  })
  Array.from(sampleValues.keys()).sort((a, b) => formatObjectFieldLabel(a).localeCompare(formatObjectFieldLabel(b))).forEach(key => {
    const columnKey = `object:${key}`
    if (known.has(columnKey)) return
    const sample = sampleValues.get(key)
    columns.push({
      key: columnKey,
      label: formatObjectFieldLabel(key),
      icon: inferObjectColumnIcon(key, sample),
      read: record => readField(record, key),
    })
    known.add(columnKey)
  })
  Array.from(nestedSamples.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, sample]) => {
      const columnKey = `object:${key}`
      if (known.has(columnKey)) return
      const [, leafKey] = sample.path
      columns.push({
        key: columnKey,
        label: formatObjectFieldLabel(leafKey),
        icon: inferObjectColumnIcon(leafKey, sample.value),
        path: [objectPathLabel(kind), formatObjectFieldLabel(sample.path[0])],
        read: record => readNestedField(record, sample.path),
      })
      known.add(columnKey)
    })
  return columns
}

function AttributeIcon({ column, type }: { column?: Pick<ObjectColumn, 'key' | 'label' | 'icon'>; type?: ListAttribute['type'] }) {
  const key = column?.key ?? ''
  const label = column?.label.toLowerCase() ?? ''
  const size = 15
  if (key.includes('linkedin')) return <LinkedinLogo size={size} />
  if (key.includes('facebook')) return <FacebookLogo size={size} />
  if (key.includes('instagram')) return <InstagramLogo size={size} />
  if (key.includes('twitter')) return <XLogo size={size} />
  if (key.includes('angellist') || key.includes('url') || key.includes('link')) return <LinkSimple size={size} />
  if (key.includes('email')) return <EnvelopeSimple size={size} />
  if (key.includes('phone')) return <Phone size={size} />
  if (key.includes('date') || key.includes('_at') || type === 'date') return <CalendarBlank size={size} />
  if (type === 'checkbox' || label.includes('pass')) return <CheckSquare size={size} />
  if (type === 'number' || column?.icon === '#') return <Hash size={size} />
  if (type === 'status' || type === 'select' || label.includes('categor') || label.includes('type')) return <Tag size={size} />
  if (label.includes('location')) return <MapPin size={size} />
  if (key.includes('domain') || key.includes('website')) return <Globe size={size} />
  if (label.includes('team') || label.includes('owner')) return <UsersThree size={size} />
  if (label.includes('source')) return <At size={size} />
  if (label === 'name' || label.includes('record')) return <IdentificationBadge size={size} />
  return <TextAa size={size} />
}

const OBJECT_COLUMNS: Record<ListRecordKind, ObjectColumn[]> = {
  person: [
    { key: 'object:person', label: 'Person', icon: '▣', read: record => getRecordName('person', record) },
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => readField(record, 'id') },
    { key: 'object:name', label: 'Name', icon: '▣', read: record => (record as Contact).name ?? '' },
    { key: 'object:email', label: 'Email', icon: '@', read: record => String((record as Contact).email ?? '') },
    { key: 'object:phone', label: 'Phone', icon: '☏', read: record => String((record as Contact).phone ?? '') },
    { key: 'object:job_title', label: 'Job title', icon: '▤', read: record => String((record as Contact).job_title ?? '') },
    { key: 'object:company', label: 'Company', icon: '▦', read: record => String((record as Contact).company ?? '') },
    { key: 'object:company_record.domain', label: 'Domains', icon: '◎', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'domain']) },
    { key: 'object:company_record.description', label: 'Description', icon: 'A', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'description']) },
    { key: 'object:company_record.website_url', label: 'Website', icon: '↗', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'website_url']) },
    { key: 'object:company_record.linkedin_url', label: 'LinkedIn', icon: '↗', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'linkedin_url']) },
    { key: 'object:company_record.primary_location', label: 'Primary location', icon: '⌖', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'primary_location']) },
    { key: 'object:company_record.size', label: 'Size', icon: '#', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'size']) },
    { key: 'object:company_record.employees_count', label: 'Employees count', icon: '#', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'employees_count']) },
    { key: 'object:company_record.founded_year', label: 'Founded year', icon: '#', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'founded_year']) },
    { key: 'object:company_record.account_stage', label: 'Account stage', icon: '●', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'account_stage']) },
    { key: 'object:company_record.icp', label: 'ICP', icon: '◇', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'icp']) },
    { key: 'object:company_record.source', label: 'Source', icon: '◇', path: ['Person', 'Company'], read: record => readNestedField(record, ['company_record', 'source']) },
    { key: 'object:location', label: 'Location', icon: '⌖', read: record => String((record as Contact).location ?? '') },
    { key: 'object:linkedin_url', label: 'LinkedIn', icon: '↗', read: record => String((record as Contact).linkedin_url ?? '') },
    { key: 'object:website', label: 'Website', icon: '◎', read: record => String((record as Contact).website ?? '') },
    { key: 'object:about', label: 'Description', icon: 'A', read: record => String((record as Contact).about ?? '') },
    { key: 'object:personal_context', label: 'Personal context', icon: 'A', read: record => readField(record, 'personal_context') },
    { key: 'object:skills', label: 'Skills', icon: 'A', read: record => readField(record, 'skills') },
    { key: 'object:category', label: 'Category', icon: '◇', read: record => String((record as Contact).category ?? '') },
    { key: 'object:status', label: 'Status', icon: '●', read: record => String((record as Contact).status ?? '') },
    { key: 'object:health_score', label: 'Health score', icon: '#', read: record => readField(record, 'health_score') },
    { key: 'object:tier', label: 'Tier', icon: '#', read: record => String((record as Contact).tier ?? '') },
    { key: 'object:relationship_domain', label: 'Relationship domain', icon: '◇', read: record => readField(record, 'relationship_domain') },
    { key: 'object:personal_tier', label: 'Personal tier', icon: '◇', read: record => readField(record, 'personal_tier') },
    { key: 'object:custom_cadence_days', label: 'Custom cadence days', icon: '#', read: record => readField(record, 'custom_cadence_days') },
    { key: 'object:connection_strength', label: 'Connection strength', icon: '#', read: record => readField(record, 'connection_strength') },
    { key: 'object:connection_strength_computed_at', label: 'Connection strength computed at', icon: '◷', read: record => readField(record, 'connection_strength_computed_at') },
    { key: 'object:connections_count', label: 'Connections', icon: '#', read: record => String((record as Contact).connections_count ?? '') },
    { key: 'object:followers_count', label: 'Followers', icon: '#', read: record => String((record as Contact).followers_count ?? '') },
    { key: 'object:last_interaction_at', label: 'Last interaction', icon: '◷', read: record => String((record as Contact).last_interaction_at ?? '') },
    { key: 'object:log_date', label: 'Log date', icon: '◷', read: record => readField(record, 'log_date') },
    { key: 'object:birthday', label: 'Birthday', icon: '◷', read: record => String((record as Contact).birthday ?? '') },
    { key: 'object:company_domain', label: 'Company domain', icon: '◎', read: record => readField(record, 'company_domain') },
    { key: 'object:company_linkedin_url', label: 'Company LinkedIn', icon: '↗', read: record => readField(record, 'company_linkedin_url') },
    { key: 'object:attio_company_id', label: 'Attio company ID', icon: '#', read: record => readField(record, 'attio_company_id') },
    { key: 'object:ai_enriched_at', label: 'AI enriched at', icon: '◷', read: record => readField(record, 'ai_enriched_at') },
    { key: 'object:company_id', label: 'Company ID', icon: '#', read: record => readField(record, 'company_id') },
    { key: 'object:interests', label: 'Interests', icon: 'A', read: record => readField(record, 'interests') },
    { key: 'object:looking_for', label: 'Looking for', icon: 'A', read: record => readField(record, 'looking_for') },
    { key: 'object:referred_by', label: 'Referred by', icon: '▦', read: record => readField(record, 'referred_by') },
    { key: 'object:advisory_role', label: 'Advisory role', icon: 'A', read: record => readField(record, 'advisory_role') },
    { key: 'object:angellist_url', label: 'AngelList', icon: '↗', read: record => readField(record, 'angellist_url') },
    { key: 'object:facebook_url', label: 'Facebook', icon: '↗', read: record => readField(record, 'facebook_url') },
    { key: 'object:instagram_url', label: 'Instagram', icon: '↗', read: record => readField(record, 'instagram_url') },
    { key: 'object:twitter_url', label: 'Twitter/X', icon: '↗', read: record => readField(record, 'twitter_url') },
    { key: 'object:links', label: 'Links', icon: '↗', read: record => readField(record, 'links') },
    { key: 'object:profile_photo_url', label: 'Profile photo', icon: '↗', read: record => readField(record, 'profile_photo_url') },
    { key: 'object:attio_record_id', label: 'Attio record ID', icon: '#', read: record => readField(record, 'attio_record_id') },
    { key: 'object:attio_synced_at', label: 'Attio synced at', icon: '◷', read: record => readField(record, 'attio_synced_at') },
    { key: 'object:created_at', label: 'Created at', icon: '◷', read: record => readField(record, 'created_at') },
    { key: 'object:updated_at', label: 'Updated at', icon: '◷', read: record => readField(record, 'updated_at') },
    { key: 'object:user_id', label: 'User ID', icon: '#', read: record => readField(record, 'user_id') },
    { key: 'object:goal_id', label: 'Goal ID', icon: '#', read: record => readField(record, 'goal_id') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Contact).notes ?? '') },
  ],
  company: [
    { key: 'object:company', label: 'Company', icon: '▣', read: record => getRecordName('company', record) },
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => readField(record, 'id') },
    { key: 'object:domain', label: 'Domains', icon: '◎', read: record => String((record as Company).domain ?? '') },
    { key: 'object:name', label: 'Name', icon: '▣', read: record => (record as Company).name ?? '' },
    { key: 'object:description', label: 'Description', icon: 'A', read: record => String((record as Company).description ?? '') },
    { key: 'object:team', label: 'Team', icon: '♚', group: 'relationship', relationCount: 31, read: record => readField(record, '_team_names') },
    { key: 'object:team_count', label: 'Team count', icon: '#', path: ['Company', 'Team'], read: record => readField(record, '_team_count') },
    { key: 'object:deals', label: 'Deals', icon: '▦', group: 'relationship', relationCount: 16, read: record => readField(record, '_deal_names') },
    { key: 'object:deal_count', label: 'Deal count', icon: '#', path: ['Company', 'Deals'], read: record => readField(record, '_deal_count') },
    { key: 'object:sector', label: 'Categories', icon: '◇', read: record => String((record as Company).sector ?? '') },
    { key: 'object:primary_location', label: 'Primary location', icon: '⌖', group: 'relationship', relationCount: 3, read: record => String((record as Company).primary_location ?? (record as Company).hq_location ?? '') },
    { key: 'object:size', label: 'Size', icon: '#', read: record => String((record as Company).size ?? '') },
    { key: 'object:employees_count', label: 'Employees count', icon: '#', read: record => String((record as Company).employees_count ?? '') },
    { key: 'object:members_on_linkedin', label: 'LinkedIn members', icon: '#', read: record => String((record as Company).members_on_linkedin ?? '') },
    { key: 'object:followers_count', label: 'Followers', icon: '#', read: record => String((record as Company).followers_count ?? '') },
    { key: 'object:founded_year', label: 'Founded year', icon: '#', read: record => String((record as Company).founded_year ?? '') },
    { key: 'object:website_url', label: 'Website', icon: '↗', read: record => String((record as Company).website_url ?? '') },
    { key: 'object:linkedin_url', label: 'LinkedIn', icon: '↗', read: record => String((record as Company).linkedin_url ?? '') },
    { key: 'object:angellist_url', label: 'AngelList', icon: '↗', read: record => readField(record, 'angellist_url') },
    { key: 'object:facebook_url', label: 'Facebook', icon: '↗', read: record => readField(record, 'facebook_url') },
    { key: 'object:instagram_url', label: 'Instagram', icon: '↗', read: record => readField(record, 'instagram_url') },
    { key: 'object:twitter_url', label: 'Twitter/X', icon: '↗', read: record => readField(record, 'twitter_url') },
    { key: 'object:account_stage', label: 'Account stage', icon: '●', read: record => String((record as Company).account_stage ?? '') },
    { key: 'object:icp', label: 'ICP', icon: '◇', read: record => String((record as Company).icp ?? '') },
    { key: 'object:source', label: 'Source', icon: '◇', read: record => String((record as Company).source ?? '') },
    { key: 'object:motion', label: 'Motion', icon: '◇', read: record => String((record as Company).motion ?? '') },
    { key: 'object:next_step', label: 'Next step', icon: 'A', read: record => String((record as Company).next_step ?? '') },
    { key: 'object:key_insight', label: 'Key insight', icon: 'A', read: record => readField(record, 'key_insight') },
    { key: 'object:headline', label: 'Headline', icon: 'A', read: record => readField(record, 'headline') },
    { key: 'object:logo_url', label: 'Logo', icon: '↗', read: record => readField(record, 'logo_url') },
    { key: 'object:hq_location', label: 'HQ location', icon: '⌖', read: record => readField(record, 'hq_location') },
    { key: 'object:last_enriched_at', label: 'Last enriched at', icon: '◷', read: record => readField(record, 'last_enriched_at') },
    { key: 'object:created_at', label: 'Created at', icon: '◷', read: record => readField(record, 'created_at') },
    { key: 'object:user_id', label: 'User ID', icon: '#', read: record => readField(record, 'user_id') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Company).notes ?? '') },
  ],
  opportunity: [
    { key: 'object:opportunity', label: 'Deal', icon: '▣', read: record => getRecordName('opportunity', record) },
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => readField(record, 'id') },
    { key: 'object:title', label: 'Name', icon: '▣', read: record => (record as Opportunity).title ?? '' },
    { key: 'object:company', label: 'Company', icon: '▦', read: record => String((record as Opportunity).company?.name ?? '') },
    { key: 'object:associated_people', label: 'Associated people', icon: '♚', group: 'relationship', relationCount: 31, read: record => readField(record, '_associated_people_names') },
    { key: 'object:associated_people_count', label: 'Associated people count', icon: '#', path: ['Deal', 'Associated people'], read: record => readField(record, '_associated_people_count') },
    { key: 'object:company.domain', label: 'Domains', icon: '◎', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'domain']) },
    { key: 'object:company.description', label: 'Description', icon: 'A', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'description']) },
    { key: 'object:company.website_url', label: 'Website', icon: '↗', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'website_url']) },
    { key: 'object:company.linkedin_url', label: 'LinkedIn', icon: '↗', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'linkedin_url']) },
    { key: 'object:company.primary_location', label: 'Primary location', icon: '⌖', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'primary_location']) },
    { key: 'object:company.size', label: 'Size', icon: '#', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'size']) },
    { key: 'object:company.employees_count', label: 'Employees count', icon: '#', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'employees_count']) },
    { key: 'object:company.followers_count', label: 'Followers', icon: '#', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'followers_count']) },
    { key: 'object:company.founded_year', label: 'Founded year', icon: '#', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'founded_year']) },
    { key: 'object:company.account_stage', label: 'Account stage', icon: '●', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'account_stage']) },
    { key: 'object:company.icp', label: 'ICP', icon: '◇', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'icp']) },
    { key: 'object:company.source', label: 'Source', icon: '◇', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'source']) },
    { key: 'object:company.motion', label: 'Motion', icon: '◇', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'motion']) },
    { key: 'object:company.next_step', label: 'Next step', icon: 'A', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'next_step']) },
    { key: 'object:company.key_insight', label: 'Key insight', icon: 'A', path: ['Deal', 'Company'], read: record => readNestedField(record, ['company', 'key_insight']) },
    { key: 'object:stage', label: 'Deal stage', icon: '●', read: record => String((record as Opportunity).stage ?? '') },
    { key: 'object:type', label: 'Type', icon: '◇', read: record => String((record as Opportunity).type ?? '') },
    { key: 'object:estimated_value', label: 'Value', icon: '#', read: record => String((record as Opportunity).estimated_value ?? '') },
    { key: 'object:target_date', label: 'Target date', icon: '◷', read: record => String((record as Opportunity).target_date ?? '') },
    { key: 'object:close_date', label: 'Close date', icon: '◷', read: record => String((record as Opportunity).close_date ?? '') },
    { key: 'object:application_source_url', label: 'Application source URL', icon: '↗', read: record => String((record as Opportunity).application_source_url ?? '') },
    { key: 'object:application_source_domain', label: 'Application source domain', icon: '◎', read: record => String((record as Opportunity).application_source_domain ?? '') },
    { key: 'object:application_source_name', label: 'Application source name', icon: 'A', read: record => String((record as Opportunity).application_source_name ?? '') },
    { key: 'object:decision_filter_pass', label: 'Decision filter pass', icon: '✓', read: record => String((record as Opportunity).decision_filter_pass ?? '') },
    { key: 'object:owner_contact_id', label: 'Owner contact ID', icon: '#', read: record => readField(record, 'owner_contact_id') },
    { key: 'object:interview_prep', label: 'Interview prep', icon: 'A', read: record => readField(record, 'interview_prep') },
    { key: 'object:interview_map', label: 'Interview map', icon: 'A', read: record => readField(record, 'interview_map') },
    { key: 'object:negotiation_prep', label: 'Negotiation prep', icon: 'A', read: record => readField(record, 'negotiation_prep') },
    { key: 'object:created_at', label: 'Created at', icon: '◷', read: record => readField(record, 'created_at') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Opportunity).notes ?? '') },
    { key: 'object:company_id', label: 'Company ID', icon: '#', read: record => readField(record, 'company_id') },
    { key: 'object:user_id', label: 'User ID', icon: '#', read: record => readField(record, 'user_id') },
  ],
}

const STAGE_COLORS = ['#F25F5C', '#F27B2F', '#F2AD32', '#A7C142', '#58C981', '#55B9E6', '#4169E1', '#C850D6', '#8B5CF6', '#E1528E', '#D0BE2C', '#9EA0A3']
const ACTIVE_LIST_LOADED_EVENT = 'rethink:active-list-loaded'
const ATTRIBUTE_TYPE_OPTIONS: Array<{ value: ListAttribute['type']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'status', label: 'Status' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Checkbox' },
]
const ATTRIBUTE_OPTION_COLORS = ['#F25F5C', '#F27B2F', '#F2AD32', '#58C981', '#55B9E6', '#4169E1', '#C850D6', '#8B5CF6']

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null
type FilterCondition = 'is' | 'is_not' | 'less_than' | 'greater_than' | 'empty' | 'not_empty' | 'contains'
type FilterConfig = { key: string; query: string; condition?: FilterCondition } | null

function listAttributeKey(id: string) {
  return `attr:${id}`
}

function getEntryValue(entry: ListEntry, kind: ListRecordKind, attributes: ListAttribute[], objectColumns: ObjectColumn[], key: string) {
  if (key === 'record:name') return getRecordName(kind, entry.record)
  if (key.startsWith('attr:')) {
    const id = key.replace(/^attr:/, '')
    const attribute = attributes.find(item => item.id === id)
    return formatAttributeValue(attribute, entry.membership.attributes?.[id])
  }
  const column = objectColumns.find(item => item.key === key)
  return column?.read(entry.record) ?? ''
}

function matchesFilterValue(value: string, query: string, condition: FilterCondition) {
  const normalized = value.trim().toLowerCase()
  const needle = query.trim().toLowerCase()
  if (condition === 'empty') return normalized.length === 0
  if (condition === 'not_empty') return normalized.length > 0
  if (!needle) return true
  if (condition === 'is') return normalized === needle
  if (condition === 'is_not') return normalized !== needle
  if (condition === 'less_than' || condition === 'greater_than') {
    const left = Number(value.replace(/[^0-9.-]/g, ''))
    const right = Number(query.replace(/[^0-9.-]/g, ''))
    if (Number.isNaN(left) || Number.isNaN(right)) return false
    return condition === 'less_than' ? left < right : left > right
  }
  return normalized.includes(needle)
}

function applyEntryViewState(
  entries: ListEntry[],
  kind: ListRecordKind,
  attributes: ListAttribute[],
  objectColumns: ObjectColumn[],
  sortConfig: SortConfig,
  filterConfig: FilterConfig,
) {
  const query = filterConfig?.query.trim().toLowerCase() ?? ''
  const condition = filterConfig?.condition ?? 'contains'
  const shouldFilter = Boolean(filterConfig && (query || condition === 'empty' || condition === 'not_empty'))
  const filtered = shouldFilter
    ? entries.filter(entry => {
      if (filterConfig && filterConfig.key !== 'all') {
        return matchesFilterValue(getEntryValue(entry, kind, attributes, objectColumns, filterConfig.key), query, condition)
      }
      const haystack = [
        getRecordName(kind, entry.record),
        getRecordSubtitle(kind, entry.record),
        ...objectColumns.map(column => column.read(entry.record)),
        ...attributes.map(attribute => formatAttributeValue(attribute, entry.membership.attributes?.[attribute.id])),
        entry.membership.notes ?? '',
      ].join(' ').toLowerCase()
      return matchesFilterValue(haystack, query, condition)
    })
    : entries

  if (!sortConfig) return filtered
  return [...filtered].sort((a, b) => {
    const left = getEntryValue(a, kind, attributes, objectColumns, sortConfig.key)
    const right = getEntryValue(b, kind, attributes, objectColumns, sortConfig.key)
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    const result = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
    return sortConfig.direction === 'asc' ? result : -result
  })
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildListCsv(
  entries: ListEntry[],
  kind: ListRecordKind,
  attributes: ListAttribute[],
  objectColumns: ObjectColumn[],
  visibleColumnKeys: string[],
) {
  const visibleObjectColumns = objectColumns.filter(column => visibleColumnKeys.includes(column.key))
  const attrColumns = attributes.filter(attribute => visibleColumnKeys.includes(listAttributeKey(attribute.id)))
  const headers = [
    LIST_OBJECT_LABELS[kind].singular,
    ...visibleObjectColumns.map(column => [...columnPath(kind, column), column.label].join(' > ')),
    ...attrColumns.map(attribute => attribute.name),
    'Notes',
  ]
  const rows = entries.map(entry => [
    getRecordName(kind, entry.record),
    ...visibleObjectColumns.map(column => column.read(entry.record)),
    ...attrColumns.map(attribute => formatAttributeValue(attribute, entry.membership.attributes?.[attribute.id])),
    entry.membership.notes ?? '',
  ])
  return [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const workspace = useListWorkspace(user?.id, id)
  const { deleteList } = useLists(user?.id)
  const { list, attributes, views, loading } = workspace
  const entriesState = useListEntries(user?.id, list)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [createViewOpen, setCreateViewOpen] = useState(false)
  const [addRecordOpen, setAddRecordOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [viewSettingsPickerOpen, setViewSettingsPickerOpen] = useState(false)
  const [importExportOpen, setImportExportOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  const [stageAnchor, setStageAnchor] = useState<DOMRect | null>(null)
  const [editingStage, setEditingStage] = useState<ListAttributeOption | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ type: 'view'; view: ListView } | { type: 'attribute'; attribute: ListAttribute } | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<{ title: string; message: string; actionLabel: string; onConfirm: () => Promise<void> | void } | null>(null)
  const [createViewInitialType, setCreateViewInitialType] = useState<'table' | 'kanban'>('table')
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(null)
  const [kanbanDensity, setKanbanDensity] = useState<'compact' | 'wide'>('compact')
  const [kanbanLayout, setKanbanLayout] = useState<'list' | 'board'>('board')
  const [objectRecords, setObjectRecords] = useState<RecordRow[]>([])

  useEffect(() => {
    if (views.length === 0) {
      setActiveViewId(null)
      return
    }
    if (!activeViewId || !views.some(view => view.id === activeViewId)) {
      setActiveViewId((views.find(view => view.is_default) ?? views[0]).id)
    }
  }, [activeViewId, views])

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setViewMenuOpen(false)
      setViewSettingsOpen(false)
      setViewSettingsPickerOpen(false)
      setImportExportOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    if (!list) return
    const timeout = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(ACTIVE_LIST_LOADED_EVENT, { detail: list }))
    }, 25)
    return () => window.clearTimeout(timeout)
  }, [list])

  useEffect(() => {
    if (!list || !user) {
      setObjectRecords([])
      return
    }
    const table = LIST_OBJECT_LABELS[list.parent_object].table
    if (list.parent_object === 'person') {
      Promise.all([
        supabase.from('outreach_logs').select('*').eq('user_id', user.id).limit(200),
        supabase.from('companies').select('*').eq('user_id', user.id).limit(500),
      ]).then(([contactsResult, companiesResult]) => {
        const companies = (companiesResult.data ?? []) as Company[]
        const enriched = ((contactsResult.data ?? []) as Contact[]).map(contact => {
          const company = companies.find(item => item.id === contact.company_id) ?? companies.find(item => sameRecordName(item.name, contact.company))
          return { ...contact, company_record: company ?? null }
        })
        setObjectRecords(enriched as unknown as RecordRow[])
      })
      return
    }
    if (list.parent_object === 'company') {
      Promise.all([
        supabase.from('companies').select('*').eq('user_id', user.id).limit(200),
        supabase.from('outreach_logs').select('id, name, company, company_id, job_title, email').eq('user_id', user.id).limit(1000),
        supabase.from('opportunities').select('id, title, company_id, stage, estimated_value').eq('user_id', user.id).limit(1000),
      ]).then(([companiesResult, contactsResult, opportunitiesResult]) => {
        const contacts = (contactsResult.data ?? []) as Contact[]
        const opportunities = (opportunitiesResult.data ?? []) as Opportunity[]
        const enriched = ((companiesResult.data ?? []) as Company[]).map(company => {
          const team = contacts.filter(contact => contact.company_id === company.id || (!contact.company_id && sameRecordName(contact.company, company.name)))
          const deals = opportunities.filter(opportunity => opportunity.company_id === company.id)
          return {
            ...company,
            _team_count: team.length,
            _team_names: team.map(contact => contact.name).filter(Boolean).join(', '),
            _deal_count: deals.length,
            _deal_names: deals.map(opportunity => opportunity.title).filter(Boolean).join(', '),
          }
        })
        setObjectRecords(enriched as unknown as RecordRow[])
      })
      return
    }
    if (list.parent_object === 'opportunity') {
      Promise.all([
        supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', user.id).limit(200),
        supabase.from('outreach_logs').select('id, name').eq('user_id', user.id).limit(1000),
        supabase.from('opportunity_contacts').select('opportunity_id, outreach_log_id'),
      ]).then(([opportunitiesResult, contactsResult, linksResult]) => {
        const contactsById = new Map(((contactsResult.data ?? []) as Contact[]).map(contact => [contact.id, contact]))
        const links = (linksResult.data ?? []) as Array<{ opportunity_id: string; outreach_log_id: string }>
        const enriched = ((opportunitiesResult.data ?? []) as Opportunity[]).map(opportunity => {
          const people = links
            .filter(link => link.opportunity_id === opportunity.id)
            .map(link => contactsById.get(link.outreach_log_id))
            .filter(Boolean) as Contact[]
          return {
            ...opportunity,
            _associated_people_count: people.length,
            _associated_people_names: people.map(contact => contact.name).filter(Boolean).join(', '),
          }
        })
        setObjectRecords(enriched as unknown as RecordRow[])
      })
      return
    }
    supabase.from(table).select('*').eq('user_id', user.id).limit(200).then(({ data }) => {
      setObjectRecords((data ?? []) as unknown as RecordRow[])
    })
  }, [list, user])

  const activeView = views.find(view => view.id === activeViewId) ?? views[0] ?? null
  const statusAttributes = attributes.filter(attribute => attribute.type === 'status')
  const kanbanStatusAttribute = activeView?.type === 'kanban'
    ? attributes.find(attribute => attribute.id === activeView.config.kanbanStatusAttributeId && attribute.type === 'status')
    : null
  const objectLabels = list ? LIST_OBJECT_LABELS[list.parent_object] : LIST_OBJECT_LABELS.person
  const visibleColumnKeys = useMemo(() => activeView?.config.columns ?? [], [activeView])
  const objectColumns = useMemo(() => {
    const kind = list?.parent_object ?? 'person'
    return buildObjectColumns(kind, [
      ...objectRecords,
      ...entriesState.entries.map(entry => entry.record),
    ])
  }, [entriesState.entries, list?.parent_object, objectRecords])
  const displayedEntries = useMemo(() => {
    if (!list) return entriesState.entries
    return applyEntryViewState(entriesState.entries, list.parent_object, attributes, objectColumns, sortConfig, filterConfig)
  }, [attributes, entriesState.entries, filterConfig, list, objectColumns, sortConfig])
  const viewSettingColumns = visibleColumnKeys.reduce<ViewSettingColumn[]>((columns, key) => {
      const objectColumn = objectColumns.find(column => column.key === key)
      if (objectColumn) {
        columns.push({ key, label: objectColumn.label, icon: <AttributeIcon column={objectColumn} />, path: columnPath(list?.parent_object ?? 'person', objectColumn) })
        return columns
      }
      const attribute = attributes.find(item => listAttributeKey(item.id) === key)
      if (attribute) columns.push({ key, label: attribute.name, icon: <AttributeIcon type={attribute.type} />, path: [] })
      return columns
    }, [])

  async function handleCreateTableView(name: string) {
    const view = await workspace.createView({ name, type: 'table', config: { columns: [] } })
    if (view) setActiveViewId(view.id)
  }

  async function handleCreateKanbanView(name: string, statusAttributeId: string | null) {
    let attrId = statusAttributeId
    if (!attrId) {
      const attr = await workspace.createDefaultStatusAttribute()
      attrId = attr?.id ?? null
    }
    if (!attrId) return
    const view = await workspace.createView({
      name,
      type: 'kanban',
      config: { kanbanStatusAttributeId: attrId, columns: [] },
    })
    if (view) setActiveViewId(view.id)
  }

  async function addColumn(key: string, keepOpen = false) {
    if (!activeView) return
    const current = activeView.config.columns ?? []
    if (!current.includes(key)) {
      await workspace.updateView(activeView.id, { config: { ...activeView.config, columns: [...current, key] } })
    }
    setAddColumnOpen(keepOpen)
  }

  async function removeColumn(key: string) {
    if (!activeView) return
    const current = activeView.config.columns ?? []
    await workspace.updateView(activeView.id, { config: { ...activeView.config, columns: current.filter(item => item !== key) } })
  }

  async function handleDeleteList() {
    if (!list) return
    setConfirmRequest({
      title: 'Delete list',
      message: `Delete "${list.name}"? Entries for this list will be removed, but records stay intact.`,
      actionLabel: 'Delete list',
      onConfirm: async () => {
        await deleteList(list.id)
        navigate('/lists')
      },
    })
  }

  function currentCsv() {
    if (!list) return ''
    return buildListCsv(displayedEntries, list.parent_object, attributes, objectColumns, visibleColumnKeys)
  }

  function exportFilename() {
    const listName = list?.name ?? 'list'
    const viewName = activeView?.name ?? 'view'
    return `${slugify(listName)}-${slugify(viewName)}.csv`
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[12px] text-shuttle">Loading list...</div>
  }

  if (!list) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-shuttle">
        <div className="text-center">
          <p>List not found.</p>
          <button onClick={() => navigate('/lists')} className="mt-2 text-burnham hover:underline">Back to lists</button>
        </div>
      </div>
    )
  }

  if (views.length === 0) {
    return (
      <div className="atl-page min-h-full bg-white">
        <ListPageHeader list={list} count={entriesState.entries.length} />
        <StartWithView
          objectLabel={objectLabels.singular}
          onCreateTable={() => {
            setCreateViewInitialType('table')
            setCreateViewOpen(true)
          }}
          onCreateKanban={() => {
            setCreateViewInitialType('kanban')
            setCreateViewOpen(true)
          }}
          onDeleteList={handleDeleteList}
        />
        <CreateViewModal
          open={createViewOpen}
          initialType={createViewInitialType}
          statusAttributes={statusAttributes}
          defaultName={list.name}
          onClose={() => setCreateViewOpen(false)}
          onCreateTable={async name => {
            await handleCreateTableView(name)
            setCreateViewOpen(false)
          }}
          onCreateKanban={async (name, statusAttributeId) => {
            await handleCreateKanbanView(name, statusAttributeId)
            setCreateViewOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="atl-page flex h-full min-h-0 flex-col bg-white">
      <ListPageHeader list={list} count={entriesState.entries.length} />

      <div className="atl-toolbar crm-toolbar shrink-0">
        <div className="crm-tools-l">
          <div className="relative">
            <button
              onClick={() => {
                setViewMenuOpen(prev => !prev)
                setViewSettingsOpen(false)
                setImportExportOpen(false)
              }}
              className={`atl-button atl-view-trigger crm-view-pill ${viewMenuOpen ? 'active' : ''}`}
            >
              <span className={`atl-view-trigger-icon vmark ${activeView?.type === 'kanban' ? 'kanban' : 'table'}`}>
                {activeView?.type === 'kanban' ? <SquaresIcon size={14} /> : <Table size={14} />}
              </span>
              <span>{activeView?.name}</span>
              <CaretDown size={12} />
            </button>
            {viewMenuOpen && activeView && (
              <>
                <div className="atl-popover-catcher" onMouseDown={() => setViewMenuOpen(false)} />
                <ViewMenu
                  views={views}
                  activeViewId={activeView.id}
                  onClose={() => setViewMenuOpen(false)}
                  onSelect={viewId => {
                    setActiveViewId(viewId)
                    setViewMenuOpen(false)
                  }}
                  onCreate={() => {
                    setCreateViewInitialType('table')
                    setViewMenuOpen(false)
                    setCreateViewOpen(true)
                  }}
                  onRename={async view => {
                    setViewMenuOpen(false)
                    setRenameTarget({ type: 'view', view })
                  }}
                  onDuplicate={async view => {
                    const copy = await workspace.duplicateView(view)
                    if (copy) setActiveViewId(copy.id)
                    setViewMenuOpen(false)
                  }}
                  onDelete={async view => {
                    if (views.length <= 1) return
                    setViewMenuOpen(false)
                    setConfirmRequest({
                      title: 'Delete view',
                      message: `Delete "${view.name}"? This only removes the saved view.`,
                      actionLabel: 'Delete view',
                      onConfirm: () => workspace.deleteView(view.id),
                    })
                  }}
                  onFavorite={view => workspace.updateView(view.id, { config: { ...view.config, favorite: !view.config.favorite } })}
                />
              </>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => {
                setViewSettingsOpen(prev => !prev)
                setViewSettingsPickerOpen(false)
                setViewMenuOpen(false)
                setImportExportOpen(false)
              }}
              className={`atl-button crm-tool ghost ${viewSettingsOpen ? 'active' : ''}`}
            >
              <GearSix size={13} />
              <span>View settings</span>
              <CaretDown size={12} />
            </button>
            {viewSettingsOpen && activeView && (
              <>
                <div
                  className="atl-popover-catcher"
                  onMouseDown={() => {
                    setViewSettingsOpen(false)
                    setViewSettingsPickerOpen(false)
                  }}
                />
                {!viewSettingsPickerOpen ? (
                  <div className="atl-popover atl-toolbar-menu atl-view-settings-menu crm-pop crm-colmenu left-0 top-[46px]">
                    <div className="atl-view-settings-list">
                      {viewSettingColumns.map(column => (
                        <div key={column.key} className="atl-column-action ac-row active">
                          <span className="atl-grip" aria-hidden="true" />
                          <span className="atl-field-icon">{column.icon}</span>
                          <span className="atl-column-path truncate">
                            {column.path.map(part => (
                              <span key={part} className="contents">
                                <span>{part}</span>
                                <CaretRight size={13} />
                              </span>
                            ))}
                            <span>{column.label}</span>
                          </span>
                          <DotsThree size={14} className="ml-auto" weight="bold" />
                        </div>
                      ))}
                    </div>
                    <div className="atl-pop-footer crm-pop-foot">
                      <button
                        onClick={() => setViewSettingsPickerOpen(true)}
                        className="atl-column-action ac-row"
                      >
                        <Plus size={18} />
                        <span>{activeView.type === 'kanban' ? 'Add card row' : 'Add attribute to view'}</span>
                        <CaretRight size={16} className="ml-auto text-[#777]" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <ColumnPickerPopover
                    kind={list.parent_object}
                    objectColumns={objectColumns}
                    attributes={attributes}
                    anchor="toolbar"
                    onBack={() => setViewSettingsPickerOpen(false)}
                    onPick={key => {
                      void addColumn(key)
                      setViewSettingsOpen(false)
                      setViewSettingsPickerOpen(false)
                    }}
                    onCreateAttribute={async input => {
                      const attr = await workspace.createAttribute(input)
                      if (attr) await addColumn(attributeKey(attr.id))
                      setViewSettingsOpen(false)
                      setViewSettingsPickerOpen(false)
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
        <div className="atl-toolbar-spacer" />
        <div className="relative crm-tools-r">
          <button
            onClick={() => {
              setImportExportOpen(prev => !prev)
              setViewMenuOpen(false)
              setViewSettingsOpen(false)
            }}
            className={`atl-button crm-tool ghost ${importExportOpen ? 'active' : ''}`}
          >
            <UploadSimple size={15} />
            <span>Import / Export</span>
            <CaretDown size={12} />
          </button>
          {importExportOpen && (
            <>
              <div className="atl-popover-catcher" onMouseDown={() => setImportExportOpen(false)} />
              <div className="atl-popover atl-toolbar-menu crm-pop crm-colmenu right-0 top-[46px]">
                <ViewAction
                  icon={<DownloadSimple size={14} />}
                  label="Export CSV"
                  onClick={() => {
                    downloadCsv(exportFilename(), currentCsv())
                    setImportExportOpen(false)
                  }}
                />
                <ViewAction
                  icon={<Copy size={14} />}
                  label="Copy CSV"
                  onClick={() => {
                    void navigator.clipboard?.writeText(currentCsv())
                    setImportExportOpen(false)
                  }}
                />
                <div className="atl-menu-separator" />
                <button className="atl-pop-row compact ac-row atl-disabled-row" disabled>
                  <UploadSimple size={14} />
                  <span>Import records</span>
                  <span className="atl-menu-meta">CSV</span>
                </button>
              </div>
            </>
          )}
          <button onClick={() => setAddRecordOpen(true)} className="atl-button crm-tool primary">
            <Plus size={16} />
            <span>Add {objectLabels.singular}</span>
          </button>
        </div>
      </div>

      {activeView?.type === 'table' && (
        <div className="atl-filterbar shrink-0">
          <SortFilterControls
            objectKind={list.parent_object}
            objectColumns={objectColumns}
            attributes={attributes}
            sortConfig={sortConfig}
            filterConfig={filterConfig}
            onSortChange={setSortConfig}
            onFilterChange={setFilterConfig}
            onCreateAttribute={workspace.createAttribute}
          />
        </div>
      )}
      {activeView?.type === 'kanban' && (
        <div className="atl-filterbar shrink-0">
          <SortFilterControls
            objectKind={list.parent_object}
            objectColumns={objectColumns}
            attributes={attributes}
            sortConfig={sortConfig}
            filterConfig={filterConfig}
            onSortChange={setSortConfig}
            onFilterChange={setFilterConfig}
            onCreateAttribute={workspace.createAttribute}
          />
          <div className="atl-toolbar-spacer" />
          <div className="atl-kanban-mode-group">
            <button
              onClick={() => setKanbanDensity('compact')}
              className={`atl-kanban-mode ${kanbanDensity === 'compact' ? 'active' : ''}`}
              aria-label="Kanban compact columns"
            >
              Ⅲ
            </button>
            <button
              onClick={() => setKanbanDensity('wide')}
              className={`atl-kanban-mode ${kanbanDensity === 'wide' ? 'active' : ''}`}
              aria-label="Kanban wide columns"
            >
              00
            </button>
          </div>
          <div className="atl-kanban-mode-group">
            <button
              onClick={() => setKanbanLayout('list')}
              className={`atl-kanban-mode ${kanbanLayout === 'list' ? 'active' : ''}`}
              aria-label="List layout"
            >
              ≡
            </button>
            <button
              onClick={() => setKanbanLayout('board')}
              className={`atl-kanban-mode ${kanbanLayout === 'board' ? 'active' : ''}`}
              aria-label="Board layout"
            >
              ▭
            </button>
          </div>
        </div>
      )}

      {activeView?.type === 'kanban' && kanbanStatusAttribute ? (
        <KanbanView
          entries={displayedEntries}
          statusAttribute={kanbanStatusAttribute}
          objectKind={list.parent_object}
          objectColumns={objectColumns}
          attributes={attributes}
          visibleColumnKeys={visibleColumnKeys}
          density={kanbanDensity}
          layout={kanbanLayout}
          onMove={(membership, status) => entriesState.moveEntryStatus(membership, kanbanStatusAttribute.id, status)}
          onAdd={() => setAddRecordOpen(true)}
          onAddStage={anchor => {
            setEditingStage(null)
            setStageAnchor(anchor)
            setStageEditorOpen(true)
          }}
          onEditStage={(option, anchor) => {
            setEditingStage(option)
            setStageAnchor(anchor)
            setStageEditorOpen(true)
          }}
        />
      ) : (
        <TableView
          entries={displayedEntries}
          objectKind={list.parent_object}
          objectColumns={objectColumns}
          attributes={attributes}
          visibleColumnKeys={visibleColumnKeys}
          onAdd={() => setAddRecordOpen(true)}
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onRenameAttribute={attribute => setRenameTarget({ type: 'attribute', attribute })}
          onCreateAttribute={async input => {
            const attr = await workspace.createAttribute(input)
            if (attr) await addColumn(`attr:${attr.id}`)
          }}
        />
      )}

      <CreateViewModal
        open={createViewOpen}
        initialType={createViewInitialType}
        statusAttributes={statusAttributes}
        defaultName={list.name}
        onClose={() => setCreateViewOpen(false)}
        onCreateTable={async name => {
          await handleCreateTableView(name)
          setCreateViewOpen(false)
        }}
        onCreateKanban={async (name, statusAttributeId) => {
          await handleCreateKanbanView(name, statusAttributeId)
          setCreateViewOpen(false)
        }}
      />

      <AddColumnModal
        open={addColumnOpen}
        kind={list.parent_object}
        objectColumns={objectColumns}
        attributes={attributes}
        onClose={() => setAddColumnOpen(false)}
        onAdd={addColumn}
        onCreateAttribute={async (input, keepOpen) => {
          const attr = await workspace.createAttribute(input)
          if (attr) await addColumn(`attr:${attr.id}`, keepOpen)
        }}
      />

      <AddRecordModal
        open={addRecordOpen}
        list={list}
        attributes={attributes}
        entries={entriesState.memberships}
        statusAttribute={kanbanStatusAttribute ?? statusAttributes[0] ?? null}
        onClose={() => setAddRecordOpen(false)}
        onAdd={async (recordId, values, notes) => {
          await entriesState.addEntry(recordId, values, notes, kanbanStatusAttribute?.id ?? statusAttributes[0]?.id)
          setAddRecordOpen(false)
        }}
        onUpdate={async (membershipId, values, notes) => {
          await entriesState.updateEntry(membershipId, values, notes, kanbanStatusAttribute?.id ?? statusAttributes[0]?.id)
          setAddRecordOpen(false)
        }}
        onRemove={membershipId => {
          setConfirmRequest({
            title: 'Remove from list',
            message: `Remove this entry from "${list.name}"? The underlying record will stay in ${objectLabels.plural}.`,
            actionLabel: 'Remove entry',
            onConfirm: async () => {
              await entriesState.removeEntry(membershipId)
              setAddRecordOpen(false)
            },
          })
        }}
      />

      {kanbanStatusAttribute && (
        <StageEditorModal
          open={stageEditorOpen}
          attribute={kanbanStatusAttribute}
          anchor={stageAnchor}
          onClose={() => setStageEditorOpen(false)}
          onSave={async option => {
            const options = kanbanStatusAttribute.config.options ?? []
            await workspace.updateAttribute(kanbanStatusAttribute.id, {
              config: {
                ...kanbanStatusAttribute.config,
                options: editingStage
                  ? options.map(existing => existing.id === editingStage.id ? option : existing)
                  : [...options, option],
              },
            })
            setStageEditorOpen(false)
          }}
          existing={editingStage}
        />
      )}
      <ConfirmModal
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
      <RenameModal
        open={Boolean(renameTarget)}
        title={renameTarget?.type === 'attribute' ? 'Rename attribute' : 'Rename view'}
        label={renameTarget?.type === 'attribute' ? 'Attribute name' : 'View name'}
        initialValue={renameTarget?.type === 'attribute' ? renameTarget.attribute.name : renameTarget?.view.name ?? ''}
        onClose={() => setRenameTarget(null)}
        onSave={async name => {
          if (!renameTarget) return
          if (renameTarget.type === 'attribute') {
            await workspace.updateAttribute(renameTarget.attribute.id, { name })
          } else {
            await workspace.updateView(renameTarget.view.id, { name })
          }
          setRenameTarget(null)
        }}
      />
    </div>
  )
}

function ListPageHeader({ list, count: _count }: { list: { icon: string | null; name: string; parent_object: ListRecordKind }, count: number }) {
  const objectLabels = LIST_OBJECT_LABELS[list.parent_object]
  const [menu, setMenu] = useState<'share' | 'comments' | 'help' | 'more' | 'ask' | null>(null)
  const copyListLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(window.location.href)
    setMenu('share')
  }
  return (
    <header className="atl-header shrink-0">
      <span className="atl-title-icon">{list.icon || objectLabels.icon}</span>
      <div className="atl-title-row min-w-0">
        <h1 className="truncate">{list.name}</h1>
      </div>
      <div className="atl-top-actions">
        <span className="atl-user-chip">A</span>
        <div className="relative">
          <button onClick={copyListLink} className="atl-share-button">Share</button>
          {menu === 'share' && (
            <HeaderMiniMenu onClose={() => setMenu(null)}>
              <div className="atl-header-menu-title">Link copied</div>
              <p>Anyone with workspace access can open this list from the copied link.</p>
            </HeaderMiniMenu>
          )}
        </div>
        <span className="atl-top-divider" />
        <div className="relative">
          <button onClick={() => setMenu(menu === 'comments' ? null : 'comments')} className="atl-top-icon" aria-label="Comments"><ChatCircle size={18} /></button>
          {menu === 'comments' && (
            <HeaderMiniMenu onClose={() => setMenu(null)}>
              <div className="atl-header-menu-title">Comments</div>
              <p>No comments on this list yet.</p>
            </HeaderMiniMenu>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu(menu === 'help' ? null : 'help')} className="atl-top-icon" aria-label="Help"><Question size={17} /></button>
          {menu === 'help' && (
            <HeaderMiniMenu onClose={() => setMenu(null)}>
              <a className="atl-pop-row compact ac-row" href="https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists" target="_blank" rel="noreferrer">
                <span>Understanding lists</span>
                <CaretRight size={14} className="ml-auto" />
              </a>
              <a className="atl-pop-row compact ac-row" href="https://attio.com/help/reference/managing-your-data/lists/manage-lists" target="_blank" rel="noreferrer">
                <span>Manage lists</span>
                <CaretRight size={14} className="ml-auto" />
              </a>
            </HeaderMiniMenu>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu(menu === 'more' ? null : 'more')} className="atl-top-icon" aria-label="More"><DotsThree size={18} weight="bold" /></button>
          {menu === 'more' && (
            <HeaderMiniMenu onClose={() => setMenu(null)}>
              <button type="button" onClick={copyListLink} className="atl-pop-row compact ac-row">
                <Copy size={14} />
                <span>Copy list link</span>
              </button>
            </HeaderMiniMenu>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu(menu === 'ask' ? null : 'ask')} className="atl-ask-button">
            <ChatCircle size={18} />
            <span>Ask Attio</span>
          </button>
          {menu === 'ask' && (
            <HeaderMiniMenu onClose={() => setMenu(null)} align="right">
              <div className="atl-header-menu-title">Ask Attio</div>
              <p>Ask Attio is not connected in this workspace.</p>
            </HeaderMiniMenu>
          )}
        </div>
      </div>
    </header>
  )
}

function HeaderMiniMenu({ children, onClose, align = 'left' }: { children: ReactNode; onClose: () => void; align?: 'left' | 'right' }) {
  return (
    <>
      <button type="button" className="atl-popover-catcher" aria-label="Close menu" onMouseDown={onClose} />
      <div className={`atl-header-menu ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </div>
    </>
  )
}

function StartWithView({
  objectLabel,
  onCreateTable,
  onCreateKanban,
  onDeleteList,
}: {
  objectLabel: string
  onCreateTable: () => void
  onCreateKanban: () => void
  onDeleteList: () => void
}) {
  const objectPlural = objectLabel === 'Company' ? 'Companies' : objectLabel === 'Person' ? 'People' : objectLabel === 'Deal' ? 'Deals' : `${objectLabel}s`
  const objectPluralLower = objectPlural.toLowerCase()
  return (
    <main className="atl-start-view">
      <div className="atl-start-inner">
        <h2 className="atl-start-title">Start with a view</h2>
        <p className="atl-start-subtitle">
          Organize and visualize your data to highlight what's important
        </p>
        <div className="atl-start-grid">
          <button onClick={onCreateTable} className="atl-start-card">
            <span className="atl-start-icon"><Table size={20} /></span>
            <h3>Table</h3>
            <p>Organize your {objectPlural} in a table view and create a unique filter set to show only relevant {objectPluralLower}.</p>
          </button>
          <button onClick={onCreateKanban} className="atl-start-card">
            <span className="atl-start-icon"><SquaresIcon size={20} /></span>
            <h3>Kanban</h3>
            <p>Visualize your pipeline in a kanban view and create a unique filter set to show only relevant {objectPluralLower}.</p>
          </button>
        </div>
        <div className="atl-or-row"><span>or</span></div>
        <button onClick={onDeleteList} className="atl-delete-list-row">
          <span className="atl-delete-icon"><TrashSimple size={18} /></span>
          <span>Delete list</span>
        </button>
        <div className="atl-learn-label">Learn more</div>
        <div className="atl-learn-grid">
          <LearnMoreCard title="Create and manage kanban views" href="https://attio.com/help/reference/managing-your-data/lists/manage-lists" />
          <LearnMoreCard title="Create and manage table views" href="https://attio.com/help/reference/managing-your-data/lists/create-lists" />
        </div>
      </div>
    </main>
  )
}

function LearnMoreCard({ title, href }: { title: string; href: string }) {
  return (
    <a className="atl-learn-card" href={href} target="_blank" rel="noreferrer">
      <span className="atl-learn-icon">▱</span>
      <span>{title}</span>
    </a>
  )
}

function ToolbarButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`atl-button crm-chip-btn ${active ? 'active on' : ''}`}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SortFilterControls({
  objectKind,
  objectColumns,
  attributes,
  sortConfig,
  filterConfig,
  onSortChange,
  onFilterChange,
  onCreateAttribute,
}: {
  objectKind: ListRecordKind
  objectColumns: ObjectColumn[]
  attributes: ListAttribute[]
  sortConfig: SortConfig
  filterConfig: FilterConfig
  onSortChange: (value: SortConfig) => void
  onFilterChange: (value: FilterConfig) => void
  onCreateAttribute: (input: { name: string; type: ListAttribute['type']; config?: ListAttribute['config'] }) => Promise<ListAttribute | null>
}) {
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [conditionOpen, setConditionOpen] = useState(false)
  const attributeOptions = [
    { key: 'all', label: 'Any attribute', icon: <MagnifyingGlass size={17} /> },
    { key: 'record:name', label: LIST_OBJECT_LABELS[objectKind].singular, icon: <IdentificationBadge size={17} /> },
    ...objectColumns.map(column => ({
      key: column.key,
      label: column.label,
      icon: <AttributeIcon column={column} />,
    })),
    ...attributes.map(attribute => ({
      key: listAttributeKey(attribute.id),
      label: attribute.name,
      icon: <AttributeIcon type={attribute.type} />,
    })),
  ]
  const conditionOptions: Array<{ key: FilterCondition; label: string }> = [
    { key: 'is', label: 'is' },
    { key: 'is_not', label: 'is not' },
    { key: 'less_than', label: 'less than' },
    { key: 'greater_than', label: 'greater than' },
    { key: 'empty', label: 'empty' },
    { key: 'not_empty', label: 'not empty' },
  ]
  const sortOptions = [
    { key: 'record:name', label: LIST_OBJECT_LABELS[objectKind].singular, icon: <IdentificationBadge size={17} /> },
    ...attributeOptions.filter(option => option.key !== 'all' && option.key !== 'record:name'),
  ]
  const selectedFilterOption = filterConfig
    ? attributeOptions.find(option => option.key === filterConfig.key) ?? attributeOptions[0]
    : null
  const selectedCondition = filterConfig?.condition ?? 'contains'
  const selectedConditionLabel = conditionOptions.find(option => option.key === selectedCondition)?.label ?? 'contains'

  function updateFilter(patch: Partial<NonNullable<FilterConfig>>) {
    const base = filterConfig ?? { key: 'all', query: '', condition: 'contains' as FilterCondition }
    onFilterChange({ ...base, ...patch })
  }

  function selectFilterKey(key: string) {
    const defaultCondition: FilterCondition = key === 'all' ? 'contains' : 'is'
    onFilterChange({ key, query: '', condition: defaultCondition })
    setFilterOpen(false)
    setConditionOpen(true)
  }

  return (
    <>
      <div className="relative">
        <ToolbarButton
          icon={<ArrowsDownUp size={16} />}
          label="Sort"
          active={sortOpen || Boolean(sortConfig)}
          onClick={() => {
            setSortOpen(prev => !prev)
            setFilterOpen(false)
          }}
        />
        {sortOpen && (
          <>
            <div className="atl-popover-catcher" onMouseDown={() => setSortOpen(false)} />
            <div className="atl-popover atl-filter-pop crm-pop left-0 top-[46px]">
              <div className="atl-filter-pop-head crm-pop-hd">
                <span>Sort by</span>
                {sortConfig && <button onClick={() => onSortChange(null)}>Clear</button>}
              </div>
              <div className="atl-filter-pop-list crm-pop-list">
                {sortOptions.slice(0, 18).map(option => (
                  <button
                    key={option.key}
                    onClick={() => {
                      const nextDirection = sortConfig?.key === option.key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      onSortChange({ key: option.key, direction: nextDirection })
                    }}
                    className={`atl-pop-row compact atl-sort-row ac-row ${sortConfig?.key === option.key ? 'active' : ''}`}
                  >
                    <span className="atl-field-icon">{option.icon}</span>
                    <span className="truncate">{option.label}</span>
                    {sortConfig?.key === option.key && (
                      <span className="atl-sort-direction">{sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="relative">
        <ToolbarButton
          icon={<FunnelSimple size={16} />}
          label="Filter"
          active={filterOpen || Boolean(filterConfig)}
          onClick={() => {
            setFilterOpen(prev => !prev)
            setSortOpen(false)
            setConditionOpen(false)
          }}
        />
        {filterOpen && (
          <>
            <div className="atl-popover-catcher" onMouseDown={() => setFilterOpen(false)} />
            <ColumnPickerPopover
              kind={objectKind}
              objectColumns={objectColumns}
              attributes={attributes}
              anchor="toolbar"
              onPick={selectFilterKey}
              onCreateAttribute={async input => {
                const attr = await onCreateAttribute(input)
                if (attr) selectFilterKey(listAttributeKey(attr.id))
              }}
            />
          </>
        )}
      </div>
      {filterConfig && selectedFilterOption && (
        <div className="atl-filter-rule">
          <button
            type="button"
            onClick={() => {
              setFilterOpen(prev => !prev)
              setConditionOpen(false)
            }}
            className="atl-filter-rule-part attr"
          >
            <span className="atl-field-icon">{selectedFilterOption.icon}</span>
            <span>{selectedFilterOption.label}</span>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setConditionOpen(prev => !prev)}
              className="atl-filter-rule-part condition"
            >
              {selectedConditionLabel}
            </button>
            {conditionOpen && (
              <>
                <div className="atl-popover-catcher" onMouseDown={() => setConditionOpen(false)} />
                <div className="atl-popover atl-condition-menu crm-pop">
                  {conditionOptions.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        updateFilter({ condition: option.key })
                        setConditionOpen(false)
                      }}
                      className="atl-pop-row compact ac-row"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {selectedCondition !== 'empty' && selectedCondition !== 'not_empty' && (
            <input
              value={filterConfig.query}
              onChange={event => updateFilter({ query: event.target.value })}
              className="atl-filter-rule-value"
              placeholder="Set a value..."
            />
          )}
          <button type="button" className="atl-filter-rule-menu" onClick={() => onFilterChange(null)} aria-label="Clear filter">
            <DotsThree size={15} weight="bold" />
          </button>
        </div>
      )}
      <button
        type="button"
        className="atl-filter-add"
        onClick={() => {
          setFilterOpen(true)
          setSortOpen(false)
          setConditionOpen(false)
        }}
        aria-label="Add filter"
      >
        <Plus size={15} />
      </button>
    </>
  )
}

function TableView({
  entries,
  objectKind,
  objectColumns: availableObjectColumns,
  attributes,
  visibleColumnKeys,
  onAdd,
  onAddColumn,
  onRemoveColumn,
  onRenameAttribute,
  onCreateAttribute,
}: {
  entries: ListEntry[]
  objectKind: ListRecordKind
  objectColumns: ObjectColumn[]
  attributes: ListAttribute[]
  visibleColumnKeys: string[]
  onAdd: () => void
  onAddColumn: (key: string, keepOpen?: boolean) => void
  onRemoveColumn: (key: string) => void
  onRenameAttribute: (attribute: ListAttribute) => void
  onCreateAttribute: (input: { name: string; type: ListAttribute['type']; config?: ListAttribute['config'] }) => Promise<void>
}) {
  const objectColumns = availableObjectColumns.filter(column => visibleColumnKeys.includes(column.key))
  const attrColumns = attributes.filter(attribute => visibleColumnKeys.includes(`attr:${attribute.id}`))
  const primaryLabel = LIST_OBJECT_LABELS[objectKind].singular
  const [columnMenuKey, setColumnMenuKey] = useState<string | null>(null)
  const [columnPickerKey, setColumnPickerKey] = useState<string | null>(null)
  const [primaryPickerOpen, setPrimaryPickerOpen] = useState(false)
  const [addColumnPopoverOpen, setAddColumnPopoverOpen] = useState(false)
  const [calculationModes, setCalculationModes] = useState<Record<string, CalculationMode>>({})
  const dataColumnKeys = [...objectColumns.map(column => column.key), ...attrColumns.map(attribute => listAttributeKey(attribute.id))]
  const gridTemplate = dataColumnKeys.length > 0
    ? `28px 360px ${dataColumnKeys.map(() => '180px').join(' ')} minmax(120px, 1fr)`
    : '28px 360px 180px minmax(0, 1fr)'
  const filledCountForColumn = (key: string) => {
    const objectColumn = objectColumns.find(column => column.key === key)
    if (objectColumn) return entries.filter(entry => Boolean(objectColumn.read(entry.record))).length
    const attributeId = key.startsWith('attr:') ? key.slice(5) : key
    return entries.filter(entry => {
      const value = entry.membership.attributes?.[attributeId]
      if (value == null || value === '') return false
      if (Array.isArray(value)) return value.length > 0
      return true
    }).length
  }

  return (
    <div className="atl-table-wrap crm-table relative">
      {(primaryPickerOpen || columnMenuKey || columnPickerKey || addColumnPopoverOpen) && (
        <div
          className="atl-popover-catcher"
          onMouseDown={() => {
            setPrimaryPickerOpen(false)
            setColumnMenuKey(null)
            setColumnPickerKey(null)
            setAddColumnPopoverOpen(false)
          }}
        />
      )}
      <div className="crm-head atl-list-head" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="crm-cell head check">
          <span className="crm-cb head-cb" />
        </div>
        <div className="crm-cell head atl-primary-head">
          <div className="relative w-full min-w-0">
            <span className="crm-colhd atl-th-label">
              <span className="atl-primary-dot" />
              <span className="h-label">{primaryLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setPrimaryPickerOpen(prev => !prev)
                  setColumnMenuKey(null)
                  setColumnPickerKey(null)
                  setAddColumnPopoverOpen(false)
                }}
                className="atl-th-plus"
                aria-label="Add attribute to view"
              >
                <Plus size={13} />
              </button>
            </span>
            {primaryPickerOpen && (
              <ColumnPickerPopover
                kind={objectKind}
                objectColumns={availableObjectColumns}
                attributes={attributes}
                anchor="primary"
                onBack={() => setPrimaryPickerOpen(false)}
                onPick={key => {
                  onAddColumn(key)
                  setPrimaryPickerOpen(false)
                }}
                onCreateAttribute={async input => {
                  await onCreateAttribute(input)
                  setPrimaryPickerOpen(false)
                }}
              />
            )}
          </div>
        </div>
        {objectColumns.map(column => (
          <div key={column.key} className="crm-cell head">
            <div className="relative w-full min-w-0">
              <button
                onClick={() => {
                  setColumnMenuKey(columnMenuKey === column.key ? null : column.key)
                  setPrimaryPickerOpen(false)
                  setColumnPickerKey(null)
                }}
                className="crm-colhd atl-th-label atl-th-menu-trigger"
              >
                <span className="atl-field-icon"><AttributeIcon column={column} /></span>
                {columnPath(objectKind, column).map(part => (
                  <span key={part} className="contents">
                    <span className="truncate">{part}</span>
                    <CaretRight size={11} className="shrink-0 text-[#777]" />
                  </span>
                ))}
                <span className="h-label">{column.label}</span>
                <CaretDown size={8} className="ml-auto shrink-0 text-[#777]" />
              </button>
              {columnMenuKey === column.key && (
                <div className="atl-popover column-menu crm-pop crm-colmenu left-[-86px] top-[34px]">
                  <button className="atl-column-action ac-row active">
                    <span className="atl-grip" aria-hidden="true" />
                    <span className="atl-field-icon"><AttributeIcon column={column} /></span>
                    <span className="atl-column-path">
                      {columnPath(objectKind, column).map(part => (
                        <span key={part} className="contents">
                          <span>{part}</span>
                          <CaretRight size={13} />
                        </span>
                      ))}
                      <span>{column.label}</span>
                    </span>
                    <DotsThree size={13} className="ml-auto" weight="bold" />
                  </button>
                  <button
                    onClick={() => {
                      setColumnMenuKey(null)
                      setColumnPickerKey(column.key)
                    }}
                    className="atl-column-action ac-row"
                  >
                    <Plus size={14} />
                    <span>Add attribute to view</span>
                    <CaretRight size={13} className="ml-auto" />
                  </button>
                </div>
              )}
              {columnPickerKey === column.key && (
                    <ColumnPickerPopover
                      kind={objectKind}
                      objectColumns={availableObjectColumns}
                      attributes={attributes}
                  anchor="column"
                  onBack={() => {
                    setColumnPickerKey(null)
                    setColumnMenuKey(column.key)
                  }}
                  onPick={key => {
                    onAddColumn(key)
                    setColumnPickerKey(null)
                  }}
                  onCreateAttribute={async input => {
                    await onCreateAttribute(input)
                    setColumnPickerKey(null)
                  }}
                />
              )}
            </div>
          </div>
        ))}
        {attrColumns.map(attribute => (
          <div key={attribute.id} className="crm-cell head">
            <div className="relative w-full min-w-0">
              <button
                onClick={() => {
                  setColumnMenuKey(columnMenuKey === listAttributeKey(attribute.id) ? null : listAttributeKey(attribute.id))
                  setPrimaryPickerOpen(false)
                  setColumnPickerKey(null)
                }}
                className="crm-colhd atl-th-label atl-th-menu-trigger"
              >
                <span className="atl-field-icon"><AttributeIcon type={attribute.type} /></span>
                <span className="h-label">{attribute.name}</span>
                <CaretDown size={8} className="ml-auto shrink-0 text-[#777]" />
              </button>
              {columnMenuKey === listAttributeKey(attribute.id) && (
                <div className="atl-popover column-menu crm-pop crm-colmenu left-[-86px] top-[34px]">
                  <button className="atl-column-action ac-row active">
                    <span className="atl-grip" aria-hidden="true" />
                    <span className="atl-field-icon"><AttributeIcon type={attribute.type} /></span>
                    <span className="atl-column-path">
                      <span>{attribute.name}</span>
                    </span>
                    <DotsThree size={13} className="ml-auto" weight="bold" />
                  </button>
                  <button
                    onClick={() => {
                      setColumnMenuKey(null)
                      onRenameAttribute(attribute)
                    }}
                    className="atl-column-action ac-row"
                  >
                    <PencilSimple size={13} />
                    <span>Rename attribute</span>
                  </button>
                  <button
                    onClick={() => {
                      setColumnMenuKey(null)
                      onRemoveColumn(listAttributeKey(attribute.id))
                    }}
                    className="atl-column-action ac-row"
                  >
                    <X size={13} />
                    <span>Remove from view</span>
                  </button>
                  <button
                    onClick={() => {
                      setColumnMenuKey(null)
                      setColumnPickerKey(listAttributeKey(attribute.id))
                    }}
                    className="atl-column-action ac-row"
                  >
                    <Plus size={14} />
                    <span>Add attribute to view</span>
                    <CaretRight size={13} className="ml-auto" />
                  </button>
                </div>
              )}
              {columnPickerKey === listAttributeKey(attribute.id) && (
                    <ColumnPickerPopover
                      kind={objectKind}
                      objectColumns={availableObjectColumns}
                      attributes={attributes}
                  anchor="column"
                  onBack={() => {
                    setColumnPickerKey(null)
                    setColumnMenuKey(listAttributeKey(attribute.id))
                  }}
                  onPick={key => {
                    onAddColumn(key)
                    setColumnPickerKey(null)
                  }}
                  onCreateAttribute={async input => {
                    await onCreateAttribute(input)
                    setColumnPickerKey(null)
                  }}
                />
              )}
            </div>
          </div>
        ))}
        <div className="crm-cell head addcol">
          <div className="relative w-full">
            <button
              onClick={() => {
                setAddColumnPopoverOpen(prev => !prev)
                setColumnMenuKey(null)
                setPrimaryPickerOpen(false)
                setColumnPickerKey(null)
              }}
              className={`crm-addcol-btn atl-addcol-label${addColumnPopoverOpen ? ' active' : ''}`}
              title="Add column"
              aria-label="Add column"
            >
              <Plus size={13} />
              <span>Add column</span>
            </button>
            {addColumnPopoverOpen && (
                <ColumnPickerPopover
                  kind={objectKind}
                  objectColumns={availableObjectColumns}
                  attributes={attributes}
                anchor="add-column"
                onBack={() => setAddColumnPopoverOpen(false)}
                onPick={key => {
                  onAddColumn(key)
                  setAddColumnPopoverOpen(false)
                }}
                onCreateAttribute={async input => {
                  await onCreateAttribute(input)
                  setAddColumnPopoverOpen(false)
                }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="atl-list-body">
        {entries.map(entry => (
          <div key={entry.membership.id} className="crm-trow atl-list-row" style={{ gridTemplateColumns: gridTemplate }}>
            <span className="crm-cell check">
              <span className="crm-cb" />
            </span>
            <span className="crm-cell atl-primary-cell">
              <RecordName kind={objectKind} record={entry.record} />
            </span>
            {objectColumns.map(column => (
              <span key={column.key} className="crm-cell atl-list-value">
                <ObjectCell column={column} record={entry.record} />
              </span>
            ))}
            {attrColumns.map(attribute => (
              <span key={attribute.id} className="crm-cell atl-list-value">
                {formatAttributeValue(attribute, entry.membership.attributes?.[attribute.id])}
              </span>
            ))}
            <span className="crm-cell addcol-sp" />
          </div>
        ))}
      </div>
      <div className={`crm-foot atl-list-foot${entries.length === 0 ? ' empty' : ''}`} style={{ gridTemplateColumns: gridTemplate }}>
        <div className="crm-cell foot count" />
        <div className="crm-cell foot count">{entries.length} count</div>
        {[...objectColumns, ...attrColumns].map(column => {
          const key = 'id' in column ? listAttributeKey(column.id) : column.key
          return (
            <CalculationControl
              key={key}
              className="crm-cell foot calc atl-add-calc"
              total={entries.length}
              filled={filledCountForColumn(key)}
              mode={calculationModes[key] ?? 'none'}
              onChange={mode => setCalculationModes(prev => ({ ...prev, [key]: mode }))}
            />
          )
        })}
        <div className="crm-cell foot addcol-sp" />
      </div>
      {entries.length === 0 && (
        <>
          <div className="atl-table-empty-state">
            <div>
              <div className="atl-empty-illustration"><span className="atl-empty-doc" /></div>
              <div className="atl-empty-title">No records</div>
              <div className="atl-empty-subtitle">No records yet! Add your first record to get started.</div>
              <button onClick={onAdd} className="atl-button primary mt-6">
                <Plus size={16} />
                <span>Add {primaryLabel}</span>
              </button>
            </div>
          </div>
          <div className="atl-empty-learn">
            <div className="atl-empty-learn-label">Learn more</div>
            <a className="atl-empty-learn-card" href="https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists" target="_blank" rel="noreferrer">
              <span className="atl-learn-icon">▱</span>
              <span>Lists</span>
            </a>
          </div>
        </>
      )}
    </div>
  )
}

function ObjectColumnPathLabel({ kind, column }: { kind: ListRecordKind; column: ObjectColumn }) {
  const path = columnPath(kind, column)
  const visiblePath = path.length === 1 && path[0] === objectPathLabel(kind) ? [] : path
  return (
    <span className="atl-object-column-label">
      {visiblePath.map(part => (
        <span key={part} className="contents">
          <span className="truncate">{part}</span>
          <CaretRight size={13} />
        </span>
      ))}
      <span className="truncate">{column.label}</span>
    </span>
  )
}

function ObjectCell({ column, record }: { column: ObjectColumn; record: RecordRow }) {
  const value = column.read(record)
  if (!value) return <>—</>
  const isLinkish = column.key.includes('domain') || column.key.includes('url') || column.key.includes('website')
  if (!isLinkish) return <>{value}</>
  return <span className="atl-link-cell">{value}</span>
}

function CalculationControl({
  className = '',
  total,
  filled,
  mode,
  onChange,
}: {
  className?: string
  total: number
  filled: number
  mode: CalculationMode
  onChange: (mode: CalculationMode) => void
}) {
  const [open, setOpen] = useState(false)
  const empty = Math.max(0, total - filled)
  const label = mode === 'count'
    ? `${total} count`
    : mode === 'empty'
      ? `${empty} empty`
      : mode === 'filled'
        ? `${filled} filled`
        : 'Add calculation'
  const options: Array<{ mode: CalculationMode; label: string; value?: number }> = [
    { mode: 'none', label: 'None' },
    { mode: 'count', label: 'Count', value: total },
    { mode: 'empty', label: 'Empty', value: empty },
    { mode: 'filled', label: 'Filled', value: filled },
  ]

  return (
    <div className={`atl-calc-anchor ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`atl-calc-trigger ${open ? 'active' : ''}`}
      >
        {mode === 'none' && <Plus size={10} />}
        <span>{label}</span>
      </button>
      {open && (
        <>
          <button type="button" className="atl-calc-catcher" aria-label="Close calculation menu" onClick={() => setOpen(false)} />
          <div className="atl-calc-popover">
            {options.map(option => (
              <button
                key={option.mode}
                type="button"
                onClick={() => {
                  onChange(option.mode)
                  setOpen(false)
                }}
                className={`atl-pop-row compact ac-row ${mode === option.mode ? 'active' : ''}`}
              >
                <span>{option.label}</span>
                {typeof option.value === 'number' && <span className="ml-auto text-[#777]">{option.value}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function KanbanView({
  entries,
  statusAttribute,
  objectKind,
  objectColumns,
  attributes,
  visibleColumnKeys,
  density,
  layout,
  onMove,
  onAdd,
  onAddStage,
  onEditStage,
}: {
  entries: ListEntry[]
  statusAttribute: ListAttribute
  objectKind: ListRecordKind
  objectColumns: ObjectColumn[]
  attributes: ListAttribute[]
  visibleColumnKeys: string[]
  density: 'compact' | 'wide'
  layout: 'list' | 'board'
  onMove: (membership: ListMembership, status: string | null) => void
  onAdd: () => void
  onAddStage: (anchor: DOMRect) => void
  onEditStage: (option: ListAttributeOption, anchor: DOMRect) => void
}) {
  const options = statusAttribute.config.options ?? DEFAULT_STATUS_OPTIONS
  const columns: Array<Omit<ListAttributeOption, 'id'> & { id: string | null; label: string }> = [
    { id: null, label: 'No stage', color: '#C7C9CD' },
    ...options,
  ]
  const [dragId, setDragId] = useState<string | null>(null)
  const [calculationModes, setCalculationModes] = useState<Record<string, CalculationMode>>({})
  const byMembershipId = new Map(entries.map(entry => [entry.membership.id, entry]))
  const objectLabel = LIST_OBJECT_LABELS[objectKind].singular
  const cardObjectRows = objectColumns.filter(column => column.key !== `object:${objectKind}` && visibleColumnKeys.includes(column.key))
  const cardAttributeRows = attributes.filter(attribute => visibleColumnKeys.includes(listAttributeKey(attribute.id)))

  return (
    <div className={`atl-kanban ${density === 'wide' ? 'wide' : 'compact'} ${layout === 'list' ? 'list-layout' : 'board-layout'}`}>
      {columns.map(column => {
        const columnEntries = entries.filter(entry => String(entry.membership.attributes?.[statusAttribute.id] ?? entry.membership.current_stage ?? '') === String(column.id ?? ''))
        return (
          <section
            key={column.id ?? 'none'}
            onDragOver={event => event.preventDefault()}
            onDrop={() => {
              if (!dragId) return
              const entry = byMembershipId.get(dragId)
              if (entry) onMove(entry.membership, column.id)
              setDragId(null)
            }}
            className="atl-kanban-col"
          >
            <header className="atl-kanban-head">
              <span className={`atl-dot ${column.id ? '' : 'empty'}`} style={{ background: column.id ? column.color ?? '#8B8F98' : '#fff' }} />
              <span className="atl-kanban-title truncate">{column.label}</span>
              <span className="atl-kanban-count">{columnEntries.length}</span>
              {column.id && (
                <>
                  <button onClick={onAdd} className="atl-icon-btn atl-stage-head-add" title={`Add ${objectLabel}`}>
                    <Plus size={17} />
                  </button>
                  <button
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      const columnEl = event.currentTarget.closest('.atl-kanban-col') as HTMLElement | null
                      onEditStage(column as ListAttributeOption, columnEl?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect())
                    }}
                    className="atl-icon-btn atl-stage-head-drag"
                    title="Edit stage"
                  >
                    <DotsThree size={17} weight="bold" />
                  </button>
                </>
              )}
            </header>
            <div className="atl-kanban-body">
              {column.id && columnEntries.length === 0 && (
                <button onClick={onAdd} className="atl-kanban-add-record">
                  <Plus size={17} />
                  <span>Add {objectLabel}</span>
                </button>
              )}
              {columnEntries.map(entry => (
                <div
                  key={entry.membership.id}
                  draggable
                  onDragStart={() => setDragId(entry.membership.id)}
                  className="atl-card"
                >
                  <RecordName kind={objectKind} record={entry.record} />
                  {(cardObjectRows.length > 0 || cardAttributeRows.length > 0) && (
                    <div className="atl-card-rows">
                      {cardObjectRows.map(column => {
                        const value = column.read(entry.record)
                        if (!value) return null
                        return (
                          <div key={column.key} className="atl-card-row">
                            <span className="atl-field-icon"><AttributeIcon column={column} /></span>
                            <span className="truncate">{value}</span>
                          </div>
                        )
                      })}
                      {cardAttributeRows.map(attribute => {
                        const value = formatAttributeValue(attribute, entry.membership.attributes?.[attribute.id])
                        if (!value) return null
                        return (
                          <div key={attribute.id} className="atl-card-row">
                            <span className="atl-field-icon"><AttributeIcon type={attribute.type} /></span>
                            <span className="truncate">{value}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {entry.membership.notes && <p className="mt-2 line-clamp-2 text-[12px] text-shuttle">{entry.membership.notes}</p>}
                  <div className="atl-card-foot">
                    <span><FileText size={15} /></span>
                    <span><CheckSquare size={15} /></span>
                    <span><ChatCircle size={15} /></span>
                    <span className={`atl-card-time ${column.id ? 'tracked' : ''}`}><Clock size={15} /> 0d</span>
                  </div>
                </div>
              ))}
            </div>
            <footer className="atl-kanban-foot">
              <CalculationControl
                className="atl-kanban-calc"
                total={columnEntries.length}
                filled={columnEntries.length}
                mode={calculationModes[column.id ?? 'none'] ?? 'none'}
                onChange={mode => setCalculationModes(prev => ({ ...prev, [column.id ?? 'none']: mode }))}
              />
            </footer>
          </section>
        )
      })}
      <button
        onClick={(event: MouseEvent<HTMLButtonElement>) => onAddStage(event.currentTarget.getBoundingClientRect())}
        className="atl-new-stage"
      >
        <Plus size={16} />
        <span>New stage</span>
      </button>
    </div>
  )
}

function RecordName({ kind, record }: { kind: ListRecordKind; record: RecordRow }) {
  const name = getRecordName(kind, record)
  const subtitle = getRecordSubtitle(kind, record)
  return (
    <span className="atl-record">
      <span className={`atl-record-avatar ${kind}`} />
      <span className="min-w-0">
        <span className="atl-record-name">{name}</span>
        {subtitle && <span className="atl-record-subtitle">{subtitle}</span>}
      </span>
    </span>
  )
}

function AttributeTypeSelect({ value, onChange }: { value: ListAttribute['type']; onChange: (value: ListAttribute['type']) => void }) {
  const [open, setOpen] = useState(false)
  const selected = ATTRIBUTE_TYPE_OPTIONS.find(option => option.value === value) ?? ATTRIBUTE_TYPE_OPTIONS[0]
  return (
    <div className="atl-combo">
      <button type="button" onClick={() => setOpen(prev => !prev)} className="atl-select-trigger atl-type-trigger">
        <span className="atl-field-icon"><AttributeIcon type={selected.value} /></span>
        <span>{selected.label}</span>
        <CaretDown size={16} className="ml-auto" />
      </button>
      {open && (
        <div className="atl-popover atl-type-menu left-0 top-[44px]">
          {ATTRIBUTE_TYPE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`atl-pop-row compact ${option.value === value ? 'active' : ''}`}
            >
              <span className="atl-field-icon"><AttributeIcon type={option.value} /></span>
              <span>{option.label}</span>
              {option.value === value && <Check size={14} className="ml-auto text-[var(--atl-blue)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusValueSelect({
  attribute,
  value,
  onChange,
}: {
  attribute: ListAttribute
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const options = attribute.config.options ?? []
  const selected = options.find(option => option.id === value)
  return (
    <div className="atl-combo">
      <button type="button" onClick={() => setOpen(prev => !prev)} className="atl-select-trigger atl-status-trigger">
        {selected ? (
          <>
            <span className="atl-dot" style={{ background: selected.color ?? '#8B8F98' }} />
            <span>{selected.label}</span>
          </>
        ) : (
          <>
            <span className="atl-dot empty" />
            <span>No stage</span>
          </>
        )}
        <CaretDown size={16} className="ml-auto" />
      </button>
      {open && (
        <div className="atl-popover atl-status-menu left-0 top-[44px]">
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            className={`atl-pop-row compact ${!value ? 'active' : ''}`}
          >
            <span className="atl-dot empty" />
            <span>No stage</span>
            {!value && <Check size={14} className="ml-auto text-[var(--atl-blue)]" />}
          </button>
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              className={`atl-pop-row compact ${option.id === value ? 'active' : ''}`}
            >
              <span className="atl-dot" style={{ background: option.color ?? '#8B8F98' }} />
              <span>{option.label}</span>
              {option.id === value && <Check size={14} className="ml-auto text-[var(--atl-blue)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ListAttributeValueInput({
  attribute,
  value,
  onChange,
}: {
  attribute: ListAttribute
  value: unknown
  onChange: (value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  if (attribute.type === 'select' || attribute.type === 'status') {
    const options = attribute.config.options ?? []
    const selected = options.find(option => option.id === value)
    return (
      <div className="atl-combo">
        <button type="button" onClick={() => setOpen(prev => !prev)} className="atl-select-trigger atl-status-trigger">
          {selected ? (
            <>
              <span className="atl-dot" style={{ background: selected.color ?? '#8B8F98' }} />
              <span>{selected.label}</span>
            </>
          ) : (
            <>
              <span className="atl-dot empty" />
              <span>None</span>
            </>
          )}
          <CaretDown size={16} className="ml-auto" />
        </button>
        {open && (
          <div className="atl-popover atl-status-menu left-0 top-[44px]">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={`atl-pop-row compact ${!value ? 'active' : ''}`}
            >
              <span className="atl-dot empty" />
              <span>None</span>
              {!value && <Check size={14} className="ml-auto text-[var(--atl-blue)]" />}
            </button>
            {options.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
                className={`atl-pop-row compact ${option.id === value ? 'active' : ''}`}
              >
                <span className="atl-dot" style={{ background: option.color ?? '#8B8F98' }} />
                <span>{option.label}</span>
                {option.id === value && <Check size={14} className="ml-auto text-[var(--atl-blue)]" />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (attribute.type === 'checkbox') {
    const checked = Boolean(value)
    return (
      <button type="button" onClick={() => onChange(!checked)} className="atl-checkbox-field">
        <span className={`atl-switch ${checked ? 'on' : ''}`} />
        <span>{checked ? 'Checked' : 'Unchecked'}</span>
      </button>
    )
  }
  return (
    <input
      value={String(value ?? '')}
      onChange={event => {
        const nextValue = event.target.value
        onChange(attribute.type === 'number' ? (nextValue === '' ? '' : Number(nextValue)) : nextValue)
      }}
      className="atl-input"
      type={attribute.type === 'number' ? 'number' : attribute.type === 'date' ? 'date' : attribute.type === 'url' ? 'url' : 'text'}
    />
  )
}

function createListAttributeConfig(type: ListAttribute['type'], description: string, optionLabels: string[], defaultValue: string): ListAttribute['config'] {
  const config: ListAttribute['config'] = {}
  if (description.trim()) config.description = description.trim()
  if (type === 'select' || type === 'status') {
    const labels = optionLabels.map(label => label.trim()).filter(Boolean)
    const options = labels.length > 0
      ? labels.map((label, index) => ({
        id: slugify(label),
        label,
        color: type === 'status' ? ATTRIBUTE_OPTION_COLORS[index % ATTRIBUTE_OPTION_COLORS.length] : null,
        track_time: false,
        confetti: false,
      }))
      : type === 'status'
        ? DEFAULT_STATUS_OPTIONS
        : []
    config.options = options
  }
  if (type === 'checkbox') {
    if (defaultValue === 'true' || defaultValue === 'false') config.default_value = defaultValue === 'true'
  } else if (defaultValue.trim()) {
    config.default_value = defaultValue.trim()
  }
  return config
}

function defaultAttributesFor(attributes: ListAttribute[], statusAttribute: ListAttribute | null) {
  const values: Record<string, unknown> = {}
  if (statusAttribute) values[statusAttribute.id] = statusAttribute.config.default_value ?? ''
  for (const attribute of attributes) {
    if (attribute.config.default_value !== undefined) values[attribute.id] = attribute.config.default_value
  }
  return values
}

function AttributeCreateFields({
  name,
  type,
  description,
  optionLabels,
  defaultValue,
  onNameChange,
  onTypeChange,
  onDescriptionChange,
  onOptionLabelsChange,
  onDefaultValueChange,
  showName = true,
}: {
  name: string
  type: ListAttribute['type']
  description: string
  optionLabels: string[]
  defaultValue: string
  onNameChange: (value: string) => void
  onTypeChange: (value: ListAttribute['type']) => void
  onDescriptionChange: (value: string) => void
  onOptionLabelsChange: (value: string[]) => void
  onDefaultValueChange: (value: string) => void
  showName?: boolean
}) {
  function updateType(value: ListAttribute['type']) {
    onTypeChange(value)
    if (value === 'status' && optionLabels.length === 0) {
      onOptionLabelsChange(DEFAULT_STATUS_OPTIONS.map(option => option.label))
    }
    if (value !== 'select' && value !== 'status' && optionLabels.length > 0) {
      onOptionLabelsChange([])
    }
  }

  return (
    <div className="atl-create-attribute-form">
      {showName && (
        <label>
          <span className="atl-form-label">Name</span>
          <input value={name} onChange={event => onNameChange(event.target.value)} className="atl-input" placeholder="Attribute name" autoFocus />
        </label>
      )}
      <label>
        <span className="atl-form-label">Description</span>
        <textarea
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          className="atl-input atl-textarea"
          placeholder="Add a description"
        />
      </label>
      <label>
        <span className="atl-form-label">Type</span>
        <AttributeTypeSelect value={type} onChange={updateType} />
      </label>
      {(type === 'select' || type === 'status') && (
        <div className="atl-options-editor">
          <span className="atl-form-label">Options</span>
          {(optionLabels.length > 0 ? optionLabels : ['']).map((label, index) => (
            <div key={index} className="atl-option-row">
              <span className="atl-option-color" style={{ background: ATTRIBUTE_OPTION_COLORS[index % ATTRIBUTE_OPTION_COLORS.length] }} />
              <input
                value={label}
                onChange={event => {
                  const next = [...(optionLabels.length > 0 ? optionLabels : [''])]
                  next[index] = event.target.value
                  onOptionLabelsChange(next)
                }}
                placeholder="Option"
              />
              <button
                type="button"
                onClick={() => onOptionLabelsChange(optionLabels.filter((_, optionIndex) => optionIndex !== index))}
                className="atl-option-remove"
                aria-label="Remove option"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onOptionLabelsChange([...optionLabels, ''])} className="atl-add-option">
            <Plus size={15} />
            <span>Add option</span>
          </button>
        </div>
      )}
      <label>
        <span className="atl-form-label">Default value</span>
        {type === 'checkbox' ? (
          <select value={defaultValue} onChange={event => onDefaultValueChange(event.target.value)} className="atl-input">
            <option value="">None</option>
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        ) : type === 'select' || type === 'status' ? (
          <select value={defaultValue} onChange={event => onDefaultValueChange(event.target.value)} className="atl-input">
            <option value="">None</option>
            {optionLabels.map(label => label.trim()).filter(Boolean).map(label => (
              <option key={label} value={slugify(label)}>{label}</option>
            ))}
          </select>
        ) : (
          <input
            value={defaultValue}
            onChange={event => onDefaultValueChange(event.target.value)}
            className="atl-input"
            placeholder="No default"
            type={type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : 'text'}
          />
        )}
      </label>
    </div>
  )
}

function ColumnPickerPopover({
  kind,
  objectColumns,
  attributes,
  anchor = 'add-column',
  onBack,
  onPick,
  onCreateAttribute,
}: {
  kind: ListRecordKind
  objectColumns: ObjectColumn[]
  attributes: ListAttribute[]
  anchor?: 'add-column' | 'column' | 'toolbar' | 'primary'
  onBack?: () => void
  onPick: (key: string) => void
  onCreateAttribute: (input: { name: string; type: ListAttribute['type']; config?: ListAttribute['config'] }) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListAttribute['type']>('text')
  const [newDescription, setNewDescription] = useState('')
  const [newOptionLabels, setNewOptionLabels] = useState<string[]>([])
  const [newDefaultValue, setNewDefaultValue] = useState('')
  const objectAttributes = objectColumns.filter(column => anchor === 'primary' || column.key !== `object:${kind}`).filter(column => {
    const haystack = `${columnPath(kind, column).join(' ')} ${column.label} ${column.key}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const listAttributes = attributes.filter(attribute => {
    const haystack = `${attribute.name} ${attribute.type}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const objectAttributeGroups = groupObjectColumns(kind, objectAttributes)

  async function handleCreateAttribute() {
    if (!newName.trim()) return
    await onCreateAttribute({
      name: newName.trim(),
      type: newType,
      config: createListAttributeConfig(newType, newDescription, newOptionLabels, newDefaultValue),
    })
    setCreating(false)
    setNewName('')
    setNewDescription('')
    setNewType('text')
    setNewOptionLabels([])
    setNewDefaultValue('')
  }

  return (
    <div className={`atl-popover atl-inline-column-popover crm-pop ${anchor === 'column' ? 'column-anchor' : anchor === 'toolbar' ? 'toolbar-anchor' : anchor === 'primary' ? 'primary-anchor' : 'add-anchor'}`}>
      <div className="atl-inline-search crm-pop-search">
        {(creating || anchor === 'column') && (
          <button
            type="button"
            onClick={() => {
              if (creating) {
                setCreating(false)
                return
              }
              onBack?.()
            }}
            className="atl-inline-back"
            aria-label="Back"
          >
            <CaretLeft size={18} />
          </button>
        )}
        <input
          value={creating ? newName : query}
          onChange={event => creating ? setNewName(event.target.value) : setQuery(event.target.value)}
          placeholder={creating ? 'Attribute name' : 'Search attributes...'}
          autoFocus
        />
      </div>
      {!creating ? (
        <>
          <div className="atl-inline-list crm-pop-list">
            {objectAttributeGroups.map(group => (
              <div key={group.label} className="atl-attribute-group">
                <div className="atl-pop-section">{group.label}</div>
                {group.columns.map(column => (
                  <button
                    key={column.key}
                    onClick={() => {
                      if (column.key === `object:${kind}`) return
                      onPick(column.key)
                    }}
                    className={`atl-pop-row atl-inline-row ac-row ${column.key === `object:${kind}` ? 'active primary-current' : ''}`}
                  >
                    <span className="atl-field-icon"><AttributeIcon column={column} /></span>
                    <ObjectColumnPathLabel kind={kind} column={column} />
                    {column.group === 'relationship' && (
                      <span className="meta">{typeof column.relationCount === 'number' ? column.relationCount : null} <CaretRight size={16} /></span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {objectAttributes.length === 0 && <div className="atl-no-results">No object attributes found</div>}
            {listAttributes.length > 0 && (
              <>
                <div className="atl-pop-section">List attributes</div>
                {listAttributes.map(attribute => (
                  <button key={attribute.id} onClick={() => onPick(attributeKey(attribute.id))} className="atl-pop-row atl-inline-row ac-row">
                    <span className="atl-field-icon"><AttributeIcon type={attribute.type} /></span>
                    <span>{attribute.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="atl-pop-footer crm-pop-foot">
            <button
              onClick={() => {
                setNewName(query.trim())
                setCreating(true)
              }}
              className="atl-pop-row atl-inline-row ac-row"
            >
              <Plus size={18} />
              <span>{query.trim() ? `Create "${query.trim()}"` : 'Create new attribute'}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="atl-inline-create">
          <AttributeCreateFields
            name={newName}
            type={newType}
            description={newDescription}
            optionLabels={newOptionLabels}
            defaultValue={newDefaultValue}
            onNameChange={setNewName}
            onTypeChange={setNewType}
            onDescriptionChange={setNewDescription}
            onOptionLabelsChange={setNewOptionLabels}
            onDefaultValueChange={setNewDefaultValue}
          />
          <button
            onClick={() => void handleCreateAttribute()}
            disabled={!newName.trim()}
            className="atl-button primary w-full disabled:opacity-40"
          >
            <Plus size={16} />
            <span>Create attribute</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ViewMenu({
  views,
  activeViewId,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onFavorite,
}: {
  views: ListView[]
  activeViewId: string
  onClose: () => void
  onSelect: (viewId: string) => void
  onCreate: () => void
  onRename: (view: ListView) => void
  onDuplicate: (view: ListView) => void
  onDelete: (view: ListView) => void
  onFavorite: (view: ListView) => void
}) {
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const filtered = views.filter(view => view.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="atl-popover menu atl-view-menu crm-pop left-0 top-[46px]">
      <div className="atl-pop-search atl-view-search crm-pop-search">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search views..." autoFocus />
      </div>
      <div className="atl-view-list crm-viewmenu">
        {filtered.map(view => (
          <div key={view.id} className={`atl-view-item vm-row-wrap ${view.id === activeViewId ? 'on' : ''}`}>
            <button onClick={() => onSelect(view.id)} className={`atl-pop-row compact atl-view-row vm-row flex-1 ${view.id === activeViewId ? 'active on' : ''}`}>
              <span className={`atl-view-row-icon ${view.type === 'kanban' ? 'kanban' : 'table'}`}>
                {view.config.favorite ? <Star size={14} weight="fill" /> : view.type === 'kanban' ? <SquaresIcon size={14} /> : <Table size={14} />}
              </span>
              <span className="truncate">{view.name}</span>
              {view.id === activeViewId && <Check size={12} />}
            </button>
            <button onClick={() => setMenuFor(menuFor === view.id ? null : view.id)} className="atl-icon-btn atl-view-more vm-delete">
              <DotsThree size={16} weight="bold" />
            </button>
            {menuFor === view.id && (
              <div className="atl-popover small atl-view-actions-menu crm-pop crm-colmenu left-[calc(100%-10px)] top-[40px] z-[80]">
                <ViewAction icon={<Star size={13} />} label={view.config.favorite ? 'Remove favorite' : 'Add to favorites'} onClick={() => onFavorite(view)} />
                <ViewAction icon={<PencilSimple size={13} />} label="Rename" onClick={() => onRename(view)} />
                <ViewAction icon={<Copy size={13} />} label="Duplicate" onClick={() => onDuplicate(view)} />
                <ViewAction icon={<TrashSimple size={13} />} label="Delete" danger onClick={() => onDelete(view)} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="atl-pop-footer crm-pop-foot">
        <button onClick={onCreate} className="atl-pop-row compact atl-view-row ac-row">
          <Plus size={16} />
          <span>Create new view</span>
        </button>
      </div>
      <button onClick={onClose} className="sr-only">Close</button>
    </div>
  )
}

function ViewAction({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`atl-pop-row compact ac-row ${danger ? 'text-red-600' : ''}`}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CreateViewModal({
  open,
  initialType,
  statusAttributes,
  defaultName,
  onClose,
  onCreateTable,
  onCreateKanban,
}: {
  open: boolean
  initialType: 'table' | 'kanban'
  statusAttributes: ListAttribute[]
  defaultName: string
  onClose: () => void
  onCreateTable: (name: string) => void
  onCreateKanban: (name: string, statusAttributeId: string | null) => void
}) {
  const [type, setType] = useState<'table' | 'kanban'>(initialType)
  const [name, setName] = useState(defaultName)
  const [statusAttributeId, setStatusAttributeId] = useState<string | null>(statusAttributes[0]?.id ?? null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusQuery, setStatusQuery] = useState('')
  useEffect(() => {
    if (!open) return
    setType(initialType)
    setName(initialType === 'kanban' ? `${defaultName} Kanban` : '')
    setStatusAttributeId(statusAttributes[0]?.id ?? null)
    setStatusOpen(initialType === 'kanban' && statusAttributes.length === 0)
    setStatusQuery('')
  }, [defaultName, initialType, open, statusAttributes])
  if (!open) return null
  const selectedStatus = statusAttributes.find(attribute => attribute.id === statusAttributeId)
  const filteredStatusAttributes = statusAttributes.filter(attribute =>
    `${attribute.name} ${attribute.type}`.toLowerCase().includes(statusQuery.toLowerCase())
  )
  return (
    <div className="atl-modal-backdrop atl-column-backdrop" onMouseDown={onClose}>
      <div className="atl-modal md atl-view-modal crm-view-create" onMouseDown={event => event.stopPropagation()}>
        <div className="atl-modal-head">
          <h2>Create view</h2>
          <button onClick={onClose} className="atl-x" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="atl-modal-body">
          <div className="atl-form-label">View type</div>
          <div className="atl-view-type-grid crm-view-type-grid">
            <button onClick={() => {
              setType('table')
              setStatusOpen(false)
            }} className={`atl-view-card crm-view-type ${type === 'table' ? 'active' : ''}`}>
              <span className="atl-view-preview"><Table size={24} /></span>
              <span>
                <span className="atl-type-title">Table</span>
                <span className="atl-type-sub">Organize your records on a table</span>
              </span>
            </button>
            <button onClick={() => {
              setType('kanban')
              if (!name.trim()) setName(`${defaultName} Kanban`)
              setStatusOpen(statusAttributes.length === 0)
            }} className={`atl-view-card crm-view-type ${type === 'kanban' ? 'active' : ''}`}>
              <span className="atl-view-preview"><SquaresIcon size={24} /></span>
              <span>
                <span className="atl-type-title">Kanban</span>
                <span className="atl-type-sub">Organize your records on a pipeline</span>
              </span>
            </button>
          </div>
          <div className="atl-field-stack mt-6">
            <label className="block">
              <span className="atl-form-label">Title</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                className="atl-input"
                placeholder="Enter a title for this view"
                autoFocus
              />
            </label>
            {type === 'kanban' && (
              <div className="block">
                <span className="atl-form-label">Kanban Columns</span>
                <div className="atl-combo">
                  <button onClick={() => setStatusOpen(prev => !prev)} className="atl-select-trigger">
                    <span>{selectedStatus?.name ?? 'Select a status attribute'}</span>
                    <CaretDown size={18} />
                  </button>
                  {statusOpen && (
                    <div className="atl-popover kanban-attribute crm-pop left-0 top-[46px]">
                      <div className="atl-pop-search crm-pop-search">
                        <input
                          value={statusQuery}
                          onChange={event => setStatusQuery(event.target.value)}
                          placeholder="Search list attributes..."
                          autoFocus
                        />
                      </div>
                      <div className="atl-filter-pop-list crm-pop-list">
                        {filteredStatusAttributes.length > 0 ? (
                          filteredStatusAttributes.map(attribute => (
                            <button
                              key={attribute.id}
                              onClick={() => {
                                setStatusAttributeId(attribute.id)
                                setStatusOpen(false)
                              }}
                              className={`atl-pop-row compact ac-row ${attribute.id === statusAttributeId ? 'active' : ''}`}
                            >
                              <span className="atl-dot" style={{ background: attribute.config.options?.[0]?.color ?? '#8B8F98' }} />
                              <span>{attribute.name}</span>
                              {attribute.id === statusAttributeId && <Check size={15} className="ml-auto text-[var(--atl-blue)]" />}
                            </button>
                          ))
                        ) : (
                          <div className="atl-no-results">No attributes found</div>
                        )}
                      </div>
                      <div className="atl-pop-footer crm-pop-foot">
                        <button onClick={() => onCreateKanban(name.trim() || defaultName || 'Kanban', null)} className="atl-pop-row compact ac-row">
                          <Plus size={16} />
                          <span>New Status Attribute</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="atl-modal-foot">
          <button onClick={onClose} className="atl-button atl-button-with-key crm-modal-secondary">Cancel <span className="atl-key small">ESC</span></button>
          <button
            onClick={() => {
              const nextName = name.trim() || defaultName || (type === 'table' ? 'Table' : 'Kanban')
              if (type === 'table') onCreateTable(nextName)
              else onCreateKanban(nextName, statusAttributeId)
            }}
            className="atl-button primary crm-modal-primary"
          >
            Confirm <span className="atl-key primary-key">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameModal({
  open,
  title,
  label,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  label: string
  initialValue: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setSaving(false)
  }, [initialValue, open])

  if (!open) return null

  async function commit() {
    const name = value.trim()
    if (!name || saving) return
    setSaving(true)
    await onSave(name)
  }

  return (
    <div className="atl-modal-backdrop atl-rename-backdrop" onMouseDown={onClose}>
      <div
        className="atl-modal atl-rename-modal"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter') void commit()
        }}
      >
        <div className="atl-modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="atl-modal-body">
          <label className="block">
            <span className="atl-form-label">{label}</span>
            <input
              value={value}
              onChange={event => setValue(event.target.value)}
              className="atl-input"
              autoFocus
            />
          </label>
        </div>
        <div className="atl-modal-foot">
          <button onClick={onClose} className="atl-button atl-button-with-key">Cancel <span className="atl-key small">ESC</span></button>
          <button onClick={() => void commit()} disabled={!value.trim() || saving} className="atl-button primary disabled:opacity-40">
            Save <span className="atl-key primary-key">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({
  request,
  onClose,
}: {
  request: { title: string; message: string; actionLabel: string; onConfirm: () => Promise<void> | void } | null
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!request) setSaving(false)
  }, [request])

  if (!request) return null

  async function confirm() {
    if (saving || !request) return
    setSaving(true)
    await request.onConfirm()
    setSaving(false)
    onClose()
  }

  return (
    <div className="atl-modal-backdrop atl-confirm-backdrop" onMouseDown={onClose}>
      <div
        className="atl-modal atl-confirm-modal"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter') void confirm()
        }}
      >
        <div className="atl-modal-head">
          <h2>{request.title}</h2>
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <div className="atl-modal-body">
          <p>{request.message}</p>
        </div>
        <div className="atl-modal-foot">
          <button onClick={onClose} className="atl-button atl-button-with-key">Cancel <span className="atl-key small">ESC</span></button>
          <button onClick={() => void confirm()} disabled={saving} className="atl-button danger disabled:opacity-40">
            {request.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddColumnModal({
  open,
  kind,
  objectColumns,
  attributes,
  onClose,
  onAdd,
  onCreateAttribute,
}: {
  open: boolean
  kind: ListRecordKind
  objectColumns: ObjectColumn[]
  attributes: ListAttribute[]
  onClose: () => void
  onAdd: (key: string, keepOpen?: boolean) => void
  onCreateAttribute: (input: { name: string; type: ListAttribute['type']; config?: ListAttribute['config'] }, keepOpen?: boolean) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createMore, setCreateMore] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListAttribute['type']>('text')
  const [newDescription, setNewDescription] = useState('')
  const [newOptionLabels, setNewOptionLabels] = useState<string[]>([])
  const [newDefaultValue, setNewDefaultValue] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultObjectColumn = objectColumns.find(column => column.key !== `object:${kind}` && column.key !== 'object:id')
    setQuery('')
    setSelectedKey(defaultObjectColumn?.key ?? '')
    setDropdownOpen(false)
    setCreateOpen(false)
    setCreateMore(false)
    setNewName('')
    setNewDescription('')
    setNewOptionLabels([])
    setNewDefaultValue('')
    setNewType('text')
  }, [kind, objectColumns, open])

  if (!open) return null

  const objectAttributes = objectColumns.filter(column => column.key !== `object:${kind}`).filter(column => {
    const haystack = `${columnPath(kind, column).join(' ')} ${column.label} ${column.key}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const listAttributes = attributes.filter(attribute => {
    const haystack = `${attribute.name} ${attribute.type}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const objectAttributeGroups = groupObjectColumns(kind, objectAttributes)
  const selectedObjectColumn = objectColumns.find(column => column.key === selectedKey)
  const selectedListAttribute = attributes.find(attribute => attributeKey(attribute.id) === selectedKey)
  const selectedLabel = selectedObjectColumn
    ? (
      <span className="atl-selected-path">
        {columnPath(kind, selectedObjectColumn).map(part => (
          <span key={part} className="contents">
            <span>{part}</span>
            <CaretRight size={16} />
          </span>
        ))}
        <span>{selectedObjectColumn.label}</span>
      </span>
    )
    : selectedListAttribute
      ? (
        <span className="atl-selected-path">
          <span>{selectedListAttribute.name}</span>
        </span>
      )
      : <span className="atl-select-placeholder">Choose an attribute...</span>
  const filteredKeys = [
    ...objectAttributes.map(column => column.key),
    ...listAttributes.map(attribute => attributeKey(attribute.id)),
  ]
  const selectedIndex = selectedKey ? filteredKeys.indexOf(selectedKey) : -1

  async function handleCreateAttribute() {
    if (!newName.trim()) return
    await onCreateAttribute({
      name: newName.trim(),
      type: newType,
      config: createListAttributeConfig(newType, newDescription, newOptionLabels, newDefaultValue),
    }, createMore)
    if (!createMore) {
      onClose()
      return
    }
    setCreateOpen(false)
    setDropdownOpen(true)
    setNewName('')
    setNewDescription('')
    setNewOptionLabels([])
    setNewDefaultValue('')
    setNewType('text')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (createOpen) {
        setCreateOpen(false)
        setDropdownOpen(true)
        return
      }
      if (dropdownOpen) {
        setDropdownOpen(false)
        return
      }
      onClose()
      return
    }
    if (createOpen) {
      if (event.key === 'Enter') {
        event.preventDefault()
        void handleCreateAttribute()
      }
      return
    }
    if (!dropdownOpen) {
      if (event.key === 'Enter' && selectedKey) {
        event.preventDefault()
        onAdd(selectedKey, createMore)
        if (!createMore) onClose()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (filteredKeys.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = selectedIndex < 0
        ? (direction > 0 ? 0 : filteredKeys.length - 1)
        : Math.max(0, Math.min(filteredKeys.length - 1, selectedIndex + direction))
      setSelectedKey(filteredKeys[nextIndex])
      return
    }
    if (event.key === 'Enter' && selectedKey) {
      event.preventDefault()
      setDropdownOpen(false)
    }
  }

  return (
    <div className="atl-modal-backdrop atl-column-backdrop" onMouseDown={onClose}>
      <div className="atl-modal md atl-column-modal" onMouseDown={event => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="atl-modal-head">
          <div className="atl-modal-title-row">
            {createOpen && (
              <button
                type="button"
                className="atl-crumb-back"
                onClick={() => {
                  setCreateOpen(false)
                  setDropdownOpen(true)
                }}
                aria-label="Back"
              >
                <CaretLeft size={18} />
              </button>
            )}
            <h2>{createOpen ? 'Create attribute' : 'Add column'}</h2>
          </div>
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="atl-modal-body">
          {!createOpen ? (
            <>
              <label className="atl-form-label">Attribute (required)</label>
              <div className="atl-combo">
                <button onClick={() => setDropdownOpen(prev => !prev)} className="atl-select-trigger">
                  {selectedLabel}
                  <CaretDown size={18} />
                </button>
                {dropdownOpen && (
                  <div className="atl-popover column left-0 top-[56px]">
                    <div className="atl-pop-search">
                      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search attributes..." autoFocus />
                    </div>
                    <div className="max-h-[440px] overflow-auto pb-2">
                      {objectAttributeGroups.map(group => (
                        <div key={group.label} className="atl-attribute-group">
                          <div className="atl-pop-section">{group.label}</div>
                          {group.columns.map(column => (
                            <button
                              key={column.key}
                              onClick={() => {
                                setSelectedKey(column.key)
                                setDropdownOpen(false)
                              }}
                              className={`atl-pop-row ${selectedKey === column.key ? 'active' : ''}`}
                            >
                              <span className="atl-field-icon"><AttributeIcon column={column} /></span>
                              <ObjectColumnPathLabel kind={kind} column={column} />
                              {column.group === 'relationship' && (
                                <span className="meta">{typeof column.relationCount === 'number' ? column.relationCount : null} <CaretRight size={16} /></span>
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                      {objectAttributes.length === 0 && listAttributes.length === 0 && (
                        <div className="atl-no-results">No attributes found</div>
                      )}
                      {listAttributes.length > 0 && (
                        <>
                          <div className="atl-pop-section">List attributes</div>
                          {listAttributes.map(attribute => (
                            <button
                              key={attribute.id}
                              onClick={() => {
                                setSelectedKey(`attr:${attribute.id}`)
                                setDropdownOpen(false)
                              }}
                              className={`atl-pop-row ${selectedKey === attributeKey(attribute.id) ? 'active' : ''}`}
                            >
                              <span className="atl-field-icon"><AttributeIcon type={attribute.type} /></span>
                              <span>{attribute.name}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="atl-pop-footer">
                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          setNewName(query.trim())
                          setCreateOpen(true)
                        }}
                        className="atl-pop-row"
                      >
                        <Plus size={18} />
                        <span>{query.trim() ? `Create "${query.trim()}"` : 'Create new attribute'}</span>
                        <CaretRight size={17} className="ml-auto text-[#777]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <AttributeCreateFields
                name={newName}
                type={newType}
                description={newDescription}
                optionLabels={newOptionLabels}
                defaultValue={newDefaultValue}
                onNameChange={setNewName}
                onTypeChange={setNewType}
                onDescriptionChange={setNewDescription}
                onOptionLabelsChange={setNewOptionLabels}
                onDefaultValueChange={setNewDefaultValue}
              />
              <div className="atl-create-attribute-hint">
                This creates a list-specific attribute and adds it as a column in this view.
              </div>
            </>
          )}

        </div>
        <div className="atl-modal-foot">
          {!createOpen && (
            <label className="atl-create-more">
              <span>Create more</span>
              <input type="checkbox" checked={createMore} onChange={event => setCreateMore(event.target.checked)} className="sr-only" />
              <span className={`atl-switch ${createMore ? 'on' : ''}`} />
            </label>
          )}
          <button onClick={onClose} className="atl-button atl-button-with-key">Cancel <span className="atl-key small">ESC</span></button>
          <button
            disabled={createOpen ? !newName.trim() : false}
            onClick={() => {
              if (createOpen) void handleCreateAttribute()
              else if (selectedKey) {
                onAdd(selectedKey, createMore)
                if (!createMore) {
                  onClose()
                } else {
                  setSelectedKey('')
                  setQuery('')
                  setDropdownOpen(true)
                }
              } else {
                setDropdownOpen(true)
              }
            }}
            className="atl-button primary disabled:opacity-40"
          >
            <span>{createOpen ? 'Create attribute' : 'Add column'}</span>
            <span className="atl-key primary-key">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function attributeKey(id: string) {
  return `attr:${id}`
}

function AddRecordModal({
  open,
  list,
  attributes,
  entries,
  statusAttribute,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
}: {
  open: boolean
  list: { parent_object: ListRecordKind; name: string }
  attributes: ListAttribute[]
  entries: ListMembership[]
  statusAttribute: ListAttribute | null
  onClose: () => void
  onAdd: (recordId: string, values: Record<string, unknown>, notes?: string | null) => void
  onUpdate: (membershipId: string, values: Record<string, unknown>, notes?: string | null) => void
  onRemove: (membershipId: string) => void
}) {
  const { user } = useAuth()
  const [records, setRecords] = useState<RecordRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<RecordRow | null>(null)
  const [editingMembership, setEditingMembership] = useState<ListMembership | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState<'choose' | 'duplicate' | 'details'>('choose')

  useEffect(() => {
    if (!open || !user) return
    const table = LIST_OBJECT_LABELS[list.parent_object].table
    const request = list.parent_object === 'opportunity'
      ? supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', user.id).limit(80)
      : supabase.from(table).select('*').eq('user_id', user.id).limit(80)
    request.then(({ data }) => setRecords((data ?? []) as unknown as RecordRow[]))
  }, [list.parent_object, open, user])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedRecord(null)
    setEditingMembership(null)
    setValues({})
    setNotes('')
    setStep('choose')
  }, [open])

  if (!open) return null

  const selectedId = selectedRecord ? selectedRecord.id : null
  const matchingEntries = selectedId
    ? entries.filter(entry => getListRecordId(entry, list.parent_object) === selectedId)
    : []
  const filtered = records.filter(record => getRecordName(list.parent_object, record).toLowerCase().includes(search.toLowerCase())).slice(0, 40)
  const entryAttributes = attributes.filter(attribute => attribute.type !== 'status')
  const selectedIndex = selectedRecord ? filtered.findIndex(record => record.id === selectedRecord.id) : -1
  const hasEntryAttributes = Boolean(statusAttribute || entryAttributes.length > 0)

  function beginAdd(record: RecordRow) {
    setSelectedRecord(record)
    setEditingMembership(null)
    setValues(defaultAttributesFor(attributes, statusAttribute))
    setNotes('')
  }

  function selectRecord(record: RecordRow) {
    beginAdd(record)
    const existingEntries = entries.filter(entry => getListRecordId(entry, list.parent_object) === record.id)
    setStep(existingEntries.length > 0 ? 'duplicate' : 'details')
  }

  function beginEdit(membership: ListMembership) {
    setEditingMembership(membership)
    setValues(membership.attributes ?? {})
    setNotes(membership.notes ?? '')
    setStep('details')
  }

  function continueFromSelection() {
    if (!selectedRecord) return
    if (matchingEntries.length > 0) {
      setStep('duplicate')
      return
    }
    setStep('details')
  }

  function handleChooseKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (step !== 'choose') {
      if (event.key === 'Escape') onClose()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (filtered.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = selectedIndex < 0
        ? (direction > 0 ? 0 : filtered.length - 1)
        : Math.max(0, Math.min(filtered.length - 1, selectedIndex + direction))
      beginAdd(filtered[nextIndex])
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (selectedRecord) continueFromSelection()
      else if (filtered[0]) selectRecord(filtered[0])
    }
  }

  return (
    <div className="atl-modal-backdrop" onMouseDown={onClose}>
      <div
        className="atl-modal wide atl-add-record-modal flex max-h-[82vh] flex-col"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={handleChooseKeyDown}
      >
        <div className="atl-modal-head">
          {step === 'choose' ? (
            <h2>Choose record</h2>
          ) : (
            <div className="atl-add-record-breadcrumb">
              <button
                type="button"
                className="atl-crumb-back"
                onClick={() => setStep(step === 'duplicate' ? 'choose' : matchingEntries.length ? 'duplicate' : 'choose')}
                aria-label="Back"
              >
                <CaretLeft size={18} />
              </button>
              {selectedRecord && (
                <span className="atl-add-record-source">
                  <span className={`atl-record-avatar ${list.parent_object}`} />
                  <span>{getRecordName(list.parent_object, selectedRecord)}</span>
                </span>
              )}
              <span className="atl-crumb-divider">/</span>
              <strong>{step === 'duplicate' ? 'Existing entries' : editingMembership ? 'Edit list entry' : 'Add to list'}</strong>
              <span className="atl-list-chip">{list.name}</span>
            </div>
          )}
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {step === 'choose' && (
          <>
            <div className="atl-pop-search atl-add-record-search shrink-0">
              <MagnifyingGlass size={20} className="text-[#777]" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find record..." autoFocus />
            </div>
            <div className="atl-record-picker-list flex-1">
              <div className="atl-pop-section px-0">{LIST_OBJECT_LABELS[list.parent_object].plural}</div>
              {filtered.map(record => (
                <button
                  key={record.id}
                  onClick={() => beginAdd(record)}
                  onDoubleClick={() => selectRecord(record)}
                  className={`atl-record-row ${selectedRecord?.id === record.id ? 'active' : ''}`}
                >
                  <RecordName kind={list.parent_object} record={record} />
                  <span className="atl-object-chip">{LIST_OBJECT_LABELS[list.parent_object].singular}</span>
                </button>
              ))}
            </div>
            <div className="atl-modal-foot">
              <div className="atl-record-foot-left">
                <span className="atl-key">↑</span>
                <span className="atl-key">↓</span>
                <span>Navigate</span>
              </div>
              <button onClick={continueFromSelection} disabled={!selectedRecord} className="atl-button primary disabled:opacity-40">
                <span>Select record</span>
                <span className="atl-key border-white/30 bg-white/10 text-white">↵</span>
              </button>
            </div>
          </>
        )}

        {step === 'duplicate' && selectedRecord && (
          <>
            <div className="atl-add-record-tabs">
              <button type="button" className="active">All</button>
              <span className="atl-add-tab-separator" />
              <button type="button" disabled>Create templates</button>
            </div>
            <div className="atl-modal-body flex-1">
              <div className="atl-duplicate-panel">
                <div className="atl-duplicate-title">This record is already in the list.</div>
                <div className="atl-duplicate-actions">
                  {matchingEntries.map((membership, index) => (
                    <button key={membership.id} onClick={() => beginEdit(membership)} className="atl-pop-row mx-0 w-full">
                      <span>Edit existing entry {index + 1}</span>
                      <PencilSimple size={16} className="ml-auto" />
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setEditingMembership(null)
                      setValues(defaultAttributesFor(attributes, statusAttribute))
                      setNotes('')
                      setStep('details')
                    }}
                    className="atl-pop-row mx-0 w-full"
                  >
                    <Plus size={18} />
                    <span>Add duplicate</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="atl-modal-foot">
              <button onClick={() => setStep('choose')} className="atl-button atl-button-with-key">Cancel <span className="atl-key small">ESC</span></button>
            </div>
          </>
        )}

        {step === 'details' && selectedRecord && (
          <>
            <div className="atl-add-record-tabs">
              <button type="button" className="active">All</button>
              <span className="atl-add-tab-separator" />
              <button type="button" disabled>Create templates</button>
            </div>
            <div className="atl-modal-body flex-1 overflow-auto">
              {!hasEntryAttributes ? (
                <div className="atl-list-entry-empty">
                  <div className="atl-list-entry-illustration" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="atl-list-entry-empty-title">No attributes</div>
                  <p>This list has no attributes.</p>
                </div>
              ) : (
                <div className="atl-entry-form">
                  {statusAttribute && (
                    <label className="block">
                      <span className="atl-form-label">{statusAttribute.name}</span>
                      <StatusValueSelect
                        attribute={statusAttribute}
                        value={String(values[statusAttribute.id] ?? '')}
                        onChange={nextValue => setValues(prev => ({ ...prev, [statusAttribute.id]: nextValue }))}
                      />
                    </label>
                  )}
                  {entryAttributes.map(attribute => (
                    <label key={attribute.id} className="block">
                      <span className="atl-form-label">{attribute.name}</span>
                      <ListAttributeValueInput
                        attribute={attribute}
                        value={values[attribute.id]}
                        onChange={nextValue => setValues(prev => ({ ...prev, [attribute.id]: nextValue }))}
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="atl-form-label">Notes</span>
                    <textarea value={notes} onChange={event => setNotes(event.target.value)} className="atl-textarea" />
                  </label>
                </div>
              )}
            </div>
            <div className="atl-modal-foot">
              {editingMembership && (
                <button onClick={() => onRemove(editingMembership.id)} className="atl-button danger subtle-danger mr-auto">
                  Remove from list
                </button>
              )}
              <button onClick={() => setStep(matchingEntries.length ? 'duplicate' : 'choose')} className="atl-button atl-button-with-key">Cancel <span className="atl-key small">ESC</span></button>
              <button
                onClick={() => {
                  if (editingMembership) onUpdate(editingMembership.id, values, notes || null)
                  else onAdd(selectedRecord.id, values, notes || null)
                }}
                className="atl-button primary"
              >
                {editingMembership ? 'Save entry' : 'Add to list'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StageEditorModal({
  open,
  attribute: _attribute,
  anchor,
  onClose,
  onSave,
  existing,
}: {
  open: boolean
  attribute: ListAttribute
  anchor: DOMRect | null
  onClose: () => void
  onSave: (option: ListAttributeOption) => void
  existing: ListAttributeOption | null
}) {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [color, setColor] = useState(existing?.color ?? STAGE_COLORS[0])
  const [trackTime, setTrackTime] = useState(Boolean(existing?.track_time))
  const [confetti, setConfetti] = useState(Boolean(existing?.confetti))
  const [colorOpen, setColorOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    setLabel(existing?.label ?? '')
    setColor(existing?.color ?? STAGE_COLORS[0])
    setTrackTime(Boolean(existing?.track_time))
    setConfetti(Boolean(existing?.confetti))
    setColorOpen(false)
  }, [existing, open])
  if (!open) return null
  function commitStage() {
    if (!label.trim()) return
    onSave({ id: existing?.id ?? slugify(label), label: label.trim(), color, track_time: trackTime, confetti })
  }
  function closeOrCommit() {
    if (label.trim()) commitStage()
    else onClose()
  }
  const popoverWidth = 390
  const popoverStyle: CSSProperties = anchor
    ? {
      top: Math.min(window.innerHeight - 210, Math.max(84, anchor.top)),
      left: Math.min(window.innerWidth - popoverWidth - 12, Math.max(12, anchor.left)),
    }
    : {}
  return (
    <div className="atl-stage-layer" onMouseDown={closeOrCommit}>
      <div className="atl-stage-popover" style={popoverStyle} onMouseDown={event => event.stopPropagation()}>
        <div className="atl-stage-name-row">
          <button
            type="button"
            onClick={() => setColorOpen(prev => !prev)}
            className="atl-stage-dot-button"
            style={{ background: color }}
            aria-label="Stage color"
          />
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commitStage()
              if (event.key === 'Escape') onClose()
            }}
            placeholder="New stage name"
            autoFocus
          />
        </div>
        {colorOpen && (
          <div className="atl-stage-color-pop">
            <div className="atl-stage-color-grid">
                {STAGE_COLORS.map(stageColor => (
                  <button
                    key={stageColor}
                    onClick={() => {
                      setColor(stageColor)
                      setColorOpen(false)
                    }}
                    className={`atl-stage-color-swatch ${color === stageColor ? 'active' : ''}`}
                    style={{ background: stageColor }}
                  >
                    {color === stageColor && <Check size={13} className="text-white" weight="bold" />}
                  </button>
                ))}
            </div>
          </div>
        )}
        <div className="atl-stage-options">
          <ToggleRow label="Track time in stage" checked={trackTime} onChange={setTrackTime} />
          <ToggleRow icon={<Confetti size={15} />} label="Confetti" checked={confetti} onChange={setConfetti} />
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ icon, label, checked, onChange }: { icon?: ReactNode; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="atl-toggle-row">
      <span className="atl-toggle-label">{icon}{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="sr-only" />
      <span className={`atl-switch ${checked ? 'on' : ''}`} />
    </label>
  )
}

function SquaresIcon({ size = 14 }: { size?: number }) {
  return (
    <span className="grid grid-cols-2 gap-0.5 text-burnham" style={{ width: size, height: size }}>
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
    </span>
  )
}

function getRecordName(kind: ListRecordKind, record: RecordRow) {
  if (kind === 'company') return (record as Company).name || 'Untitled company'
  if (kind === 'opportunity') return (record as Opportunity).title || 'Untitled deal'
  return (record as Contact).name || 'Untitled person'
}

function getRecordSubtitle(kind: ListRecordKind, record: RecordRow) {
  if (kind === 'company') return (record as Company).domain ?? (record as Company).sector ?? ''
  if (kind === 'opportunity') return (record as Opportunity).company?.name ?? (record as Opportunity).type ?? ''
  const contact = record as Contact
  return [contact.job_title, contact.company].filter(Boolean).join(' @ ')
}

function formatAttributeValue(attribute: ListAttribute | undefined, value: unknown) {
  if (value == null || value === '') return '—'
  if (!attribute) return String(value)
  if (attribute.type === 'status' || attribute.type === 'select') {
    const option = attribute.config.options?.find(item => item.id === value)
    return option?.label ?? String(value)
  }
  if (attribute.type === 'checkbox') return value ? 'Yes' : 'No'
  return String(value)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `stage_${Date.now()}`
}
