import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowCounterClockwise, ArrowRight, CalendarBlank, CaretDown, CaretRight, Check, CheckCircle, ChatsCircle,
  FileText, FloppyDisk, Handshake, LinkSimple, NotePencil, PencilSimple,
  Quotes, Sparkle, Trash, UserPlus, UserSwitch, WarningCircle, X,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  acceptReviewItem,
  dismissReviewItem,
  REVIEW_TARGET_LABELS,
  REVIEW_TARGETS,
  type ReviewPayload,
} from '@/lib/reviewQueue'
import type { Contact, ReviewItem, ReviewStatus, ReviewTarget } from '@/types'

type Filter = 'pending' | 'reviewed' | 'all'
type StagedTarget = 'interaction' | 'contact_fact' | 'value_log' | 'todo' | 'review_item'

type LocalStagedOutput = {
  id: number
  run_id: number | null
  source_key: string
  target: StagedTarget
  contact_id: string | null
  interaction_date: string | null
  title: string | null
  body: string | null
  payload_json: string
  status: 'pending' | 'approved' | 'rejected' | 'synced' | 'failed'
  supabase_id: string | null
  error: string | null
  created_at: number
  updated_at: number
  confirmed_at: number | null
}

type RemoteStagedOutput = {
  id: string
  local_id: number | null
  run_id: number | null
  dedupe_key: string | null
  source_key: string
  target: StagedTarget
  contact_id: string | null
  interaction_date: string | null
  title: string | null
  body: string | null
  payload: ReviewPayload | null
  status: 'pending' | 'approved' | 'rejected' | 'synced' | 'failed'
  supabase_id: string | null
  error: string | null
  local_created_at: number | null
  local_updated_at: number | null
  confirmed_at: number | null
  created_at: string
  updated_at: string
}

type ReviewDay = {
  id: string
  date: string
  source: ReviewItem['source']
  channel: string | null
  summary: string
  raw: string
  items: ReviewItem[]
}

type ReviewPerson = {
  id: string
  contactId: string | null
  name: string
  avatar: string | null
  handle: string | null
  status: 'linked' | 'needs-identity'
  sources: ReviewItem['source'][]
  days: ReviewDay[]
  reviewed: boolean
  outcome?: Exclude<ReviewStatus, 'pending'>
  reviewedAt?: string | null
}

type DatumKind = 'channel' | 'date' | 'fact' | 'intro' | 'todo' | 'value' | 'win'

const DATUM_VISUALS: Record<DatumKind, { label: string; tone: string; icon: ReactNode }> = {
  channel: { label: 'Channel', tone: 'moss', icon: <ChatsCircle size={11} /> },
  date: { label: 'Date', tone: 'amber', icon: <CalendarBlank size={11} /> },
  fact: { label: 'Fact', tone: 'grey', icon: <NotePencil size={11} /> },
  intro: { label: 'Intro', tone: 'info', icon: <Handshake size={11} /> },
  todo: { label: 'Todo', tone: 'deep', icon: <CheckCircle size={11} /> },
  value: { label: 'Value', tone: 'moss', icon: <Sparkle size={11} /> },
  win: { label: 'Win', tone: 'plum', icon: <FileText size={11} /> },
}

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2)
}

function isReviewTarget(value: unknown): value is ReviewTarget {
  return typeof value === 'string' && REVIEW_TARGETS.includes(value as ReviewTarget)
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!('__TAURI_INTERNALS__' in window)) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(command, args)
  } catch {
    return null
  }
}

function parseStagedPayload(output: LocalStagedOutput): ReviewPayload {
  try {
    const parsed = JSON.parse(output.payload_json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ReviewPayload : {}
  } catch {
    return {}
  }
}

function stagedSourceTarget(item: ReviewItem): StagedTarget | ReviewTarget {
  const match = item.source_external_id?.match(/^ai-staged:([^:]+):/)
  return isReviewTarget(match?.[1]) || match?.[1] === 'review_item'
    ? match[1] as StagedTarget
    : item.proposed_target
}

function stagedId(item: ReviewItem): number | null {
  const match = item.id.match(/^local-ai-staged:(\d+)$/)
  return match ? Number(match[1]) : null
}

function remoteStagedId(item: ReviewItem): string | null {
  const match = item.id.match(/^remote-ai-staged:(.+)$/)
  return match?.[1] ?? null
}

function stagedOutputToReviewItem(output: LocalStagedOutput, userId: string): ReviewItem {
  const payload = parseStagedPayload(output)
  const proposedPayload = output.target === 'review_item' && payload.proposed_payload && typeof payload.proposed_payload === 'object'
    ? payload.proposed_payload as ReviewPayload
    : payload
  const proposedTarget = output.target === 'review_item'
    ? (isReviewTarget(payload.proposed_target) ? payload.proposed_target : 'contact_fact')
    : (output.target as ReviewTarget)
  return {
    id: `local-ai-staged:${output.id}`,
    user_id: userId,
    source: 'conversations',
    source_external_id: `ai-staged:${output.target}:${output.id}`,
    source_url: null,
    title: output.title ?? 'WhatsApp conversation',
    body: output.body,
    proposed_target: proposedTarget,
    proposed_payload: proposedPayload,
    contact_id: output.contact_id,
    status: output.status === 'failed' ? 'pending' : 'pending',
    reviewed_at: null,
    created_at: new Date(output.created_at).toISOString(),
    updated_at: new Date(output.updated_at).toISOString(),
  }
}

function remoteStagedOutputToReviewItem(output: RemoteStagedOutput, userId: string): ReviewItem {
  const payload = output.payload ?? {}
  const proposedPayload = output.target === 'review_item' && payload.proposed_payload && typeof payload.proposed_payload === 'object'
    ? payload.proposed_payload as ReviewPayload
    : payload
  const proposedTarget = output.target === 'review_item'
    ? (isReviewTarget(payload.proposed_target) ? payload.proposed_target : 'contact_fact')
    : (output.target as ReviewTarget)
  return {
    id: `remote-ai-staged:${output.id}`,
    user_id: userId,
    source: 'conversations',
    source_external_id: `ai-staged:${output.target}:${output.id}`,
    source_url: null,
    title: output.title ?? 'WhatsApp conversation',
    body: output.body,
    proposed_target: proposedTarget,
    proposed_payload: proposedPayload,
    contact_id: output.contact_id,
    status: 'pending',
    reviewed_at: null,
    created_at: output.created_at,
    updated_at: output.updated_at,
  }
}

function sourceCfg(source: ReviewItem['source']) {
  return source === 'conversations'
    ? { label: 'Conversations', icon: <ChatsCircle size={12} /> }
    : { label: 'Manual', icon: <Sparkle size={12} /> }
}

function sourceLabel(source: ReviewItem['source']) {
  return sourceCfg(source).label
}

function sourceCfgForDay(day: ReviewDay) {
  const channel = day.channel?.toLowerCase()
  if (channel?.includes('whatsapp')) return { label: 'WhatsApp', icon: <ChatsCircle size={12} /> }
  if (channel?.includes('gmail') || channel?.includes('email')) return { label: 'Gmail', icon: <FileText size={12} /> }
  if (channel?.includes('granola')) return { label: 'Granola', icon: <NotePencil size={12} /> }
  if (channel?.includes('linkedin')) return { label: 'LinkedIn', icon: <ChatsCircle size={12} /> }
  return sourceCfg(day.source)
}

function dateKey(value: string) {
  const raw = value.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function textFromPayload(item: ReviewItem, payload = item.proposed_payload) {
  for (const key of ['summary', 'description', 'value', 'text', 'task', 'title', 'content', 'body', 'fact', 'next_step', 'notes', 'label']) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return item.body || item.title
}

function payloadText(payload: ReviewPayload | undefined, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function payloadType(payload: ReviewPayload | undefined) {
  return payloadText(payload, ['type', 'category', 'event_type', 'source_kind'])?.toLowerCase() ?? ''
}

function hasIntroPayload(payload: ReviewPayload | undefined) {
  return Boolean(
    payloadText(payload, [
      'introduced_person_name',
      'introduced_to_name',
      'connector_name',
      'introduced_person_company',
      'introduced_to_company',
      'relationship_context',
      'introduction_status',
    ])
  )
}

function datumKindForItem(item: ReviewItem, payload = item.proposed_payload): DatumKind {
  const type = payloadType(payload)
  if (item.proposed_target === 'contact_fact' && (type === 'key_date' || payloadText(payload, ['date_value', 'event_type', 'date_precision']))) return 'date'
  if (item.proposed_target === 'value_log' && (type === 'introduction' || type === 'referral' || hasIntroPayload(payload))) return 'intro'
  if (item.proposed_target === 'value_log') return 'value'
  if (item.proposed_target === 'todo' || item.proposed_target === 'next_step') return 'todo'
  if (item.proposed_target === 'interaction') return 'channel'
  if (item.proposed_target === 'playbook_entry') return 'win'
  return 'fact'
}

function dateDisplay(payload: ReviewPayload | undefined) {
  const value = payloadText(payload, ['date_value', 'date', 'next_step_date', 'interaction_date'])
  const precision = payloadText(payload, ['date_precision'])
  if (!value) return null
  if (precision && precision !== 'exact') return `${value} · ${precision.replace('_', ' ')}`
  return value
}

function introParts(payload: ReviewPayload | undefined) {
  const connector = payloadText(payload, ['connector_name']) || 'me'
  const to = payloadText(payload, ['introduced_to_name', 'introduced_to_company'])
  const person = payloadText(payload, ['introduced_person_name', 'introduced_person_company'])
  return { connector, person, to }
}

function datumTextForItem(item: ReviewItem, payload = item.proposed_payload) {
  const kind = datumKindForItem(item, payload)
  if (kind === 'date') {
    return payloadText(payload, ['label', 'subject', 'value', 'description']) || textFromPayload(item, payload)
  }
  if (kind === 'intro') {
    return payloadText(payload, ['description', 'relationship_context', 'value', 'text']) || textFromPayload(item, payload)
  }
  if (kind === 'todo') {
    return payloadText(payload, ['text', 'task', 'next_step', 'title']) || textFromPayload(item, payload)
  }
  if (kind === 'channel') {
    return payloadText(payload, ['summary', 'notes', 'channel_value', 'value', 'wa_phone', 'phone', 'email', 'text']) || textFromPayload(item, payload)
  }
  if (kind === 'win') {
    return payloadText(payload, ['title', 'content', 'body', 'text']) || textFromPayload(item, payload)
  }
  return payloadText(payload, ['value', 'fact', 'description', 'text', 'label']) || textFromPayload(item, payload)
}

function datumMetaForItem(item: ReviewItem, payload = item.proposed_payload) {
  const kind = datumKindForItem(item, payload)
  if (kind === 'date') {
    const event = payloadText(payload, ['event_type'])
    const date = dateDisplay(payload)
    return [event, date].filter(Boolean).join(' · ') || shortDate(dayDateForItem(item))
  }
  if (kind === 'intro') {
    return [
      payloadText(payload, ['introduction_status']) || payloadText(payload, ['status']),
      payloadText(payload, ['confidence']),
    ].filter(Boolean).join(' · ') || shortDate(dayDateForItem(item))
  }
  if (kind === 'value') {
    return [payloadText(payload, ['type']), payloadText(payload, ['direction'])].filter(Boolean).join(' · ') || shortDate(dayDateForItem(item))
  }
  if (kind === 'todo') return payloadText(payload, ['date', 'next_step_date']) || shortDate(dayDateForItem(item))
  if (kind === 'channel') return payloadText(payload, ['channel', 'type', 'platform']) || sourceLabel(item.source)
  return shortDate(dayDateForItem(item))
}

function firstPayloadString(payload: ReviewPayload | undefined, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function isGenericReviewTitle(value: string | null | undefined) {
  const text = (value ?? '').trim().toLowerCase()
  return !text ||
    text.includes('resolve whatsapp') ||
    text.includes('needs identity') ||
    text.includes('conversation needs identity') ||
    text === 'review item'
}

function compactText(value: string | null | undefined, max = 190) {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean
}

function externalParts(value: string | null | undefined) {
  const raw = value ?? ''
  if (!raw.trim()) return [] as string[]
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch { /* keep raw */ }
  return decoded
    .split(/[|#/:]+/g)
    .map(part => part.trim())
    .filter(Boolean)
}

function looksLikeNoiseExternal(part: string) {
  const lower = part.toLowerCase()
  return lower === 'whatsapp' ||
    lower === 'wa' ||
    lower === 'conversation' ||
    lower === 'message' ||
    lower === 'conversations' ||
    /^[0-9a-f]{8,}-[0-9a-f-]{8,}$/i.test(part) ||
    /^\d{10,}$/.test(part)
}

function externalDisplayName(item: ReviewItem) {
  const parts = externalParts(item.source_external_id)
  const named = parts.find(part => !looksLikeNoiseExternal(part) && !/^\+?\d[\d\s()-]{6,}$/.test(part))
  if (named) return named
  const phone = parts.find(part => /^\+?\d[\d\s()-]{6,}$/.test(part))
  if (phone) return phone
  return null
}

function externalHandle(item: ReviewItem) {
  const fromPayload = firstPayloadString(item.proposed_payload, ['wa_phone', 'whatsapp_phone', 'phone', 'handle', 'channel_value', 'value'])
  if (fromPayload) return fromPayload
  return externalParts(item.source_external_id).find(part => /^\+?\d[\d\s()-]{6,}$/.test(part)) ?? item.source_external_id
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
}

function personNameForItem(item: ReviewItem, contact?: Contact | null) {
  const payloadName = firstPayloadString(item.proposed_payload, [
    'wa_name',
    'whatsapp_name',
    'chat_name',
    'conversation_name',
    'sender_name',
    'display_name',
    'external_name',
    'contact_name',
    'person_name',
    'name',
    'person',
    'contact',
    'full_name',
    'participant_name',
  ])
  const titleName = !isGenericReviewTitle(item.title) ? item.title.split(':')[0]?.trim() : null
  return contact?.name ||
    payloadName ||
    externalDisplayName(item) ||
    titleName ||
    (item.source === 'conversations' ? 'WhatsApp conversation' : 'Unlinked input')
}

function groupKeyForItem(item: ReviewItem, contact?: Contact | null) {
  if (item.contact_id) return `contact:${item.contact_id}`
  const name = personNameForItem(item, contact)
  if (name && name !== 'Unlinked input' && name !== 'WhatsApp conversation') return `unlinked-name:${normalizedKey(name)}`
  if (item.source_external_id) return `unlinked-source:${normalizedKey(item.source_external_id)}`
  return `unlinked-item:${item.id}`
}

function dayDateForItem(item: ReviewItem) {
  const payloadDate = firstPayloadString(item.proposed_payload, ['interaction_date', 'conversation_date', 'date', 'when', 'created_at'])
  return (payloadDate ? dateKey(payloadDate) : '') || dateKey(item.created_at)
}

function channelForItem(item: ReviewItem) {
  const channel = firstPayloadString(item.proposed_payload, ['channel', 'source_channel', 'kind', 'platform'])
  if (channel) return channel.toLowerCase()
  if (item.source === 'conversations') return 'whatsapp'
  return item.source
}

function identityChannelRows(item: ReviewItem, contactId: string) {
  const payload = item.proposed_payload ?? {}
  const channel = channelForItem(item)
  const rows: Array<{
    outreach_log_id: string
    channel: 'whatsapp' | 'linkedin'
    channel_identifier: string
    channel_name: string | null
    verified: boolean
  }> = []
  const add = (nextChannel: 'whatsapp' | 'linkedin', identifier: unknown, name?: unknown) => {
    if (typeof identifier !== 'string' || !identifier.trim()) return
    rows.push({
      outreach_log_id: contactId,
      channel: nextChannel,
      channel_identifier: identifier.trim(),
      channel_name: typeof name === 'string' && name.trim() ? name.trim() : null,
      verified: true,
    })
  }
  if (channel.includes('linkedin')) {
    add('linkedin', payload.conversation_id ? `linkedin_conversation:${payload.conversation_id}` : null, payload.name)
    add('linkedin', payload.linkedin_url, payload.name)
    add('linkedin', payload.linkedin_urn ? `linkedin_urn:${payload.linkedin_urn}` : null, payload.name)
  } else {
    add('whatsapp', payload.wa_chat_id, payload.wa_name)
    add('whatsapp', payload.wa_chat_id ? `jid:${payload.wa_chat_id}` : null, payload.wa_name)
    add('whatsapp', payload.wa_phone, payload.wa_name)
    add('whatsapp', payload.phone, payload.wa_name)
    add('whatsapp', payload.wa_name ? `waname:${payload.wa_name}` : null, payload.wa_name)
  }
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = `${row.channel}:${row.channel_identifier}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function summaryForItem(item: ReviewItem) {
  const payloadSummary = firstPayloadString(item.proposed_payload, ['summary', 'conversation_summary', 'description', 'notes'])
  if (payloadSummary) return compactText(payloadSummary, 180)
  if (!isGenericReviewTitle(item.title)) return compactText(item.title, 180)
  return compactText(item.body, 180) || 'Conversation captured for review.'
}

function updatePayloadText(item: ReviewItem, raw: string, nextText: string) {
  const parsed = parsePayload(raw)
  const payload = parsed.payload ?? { ...item.proposed_payload }
  const keysByTarget: Record<ReviewTarget, string[]> = {
    contact_fact: ['value', 'text', 'fact', 'label'],
    interaction: ['notes', 'summary', 'text'],
    next_step: ['next_step', 'text', 'task'],
    todo: ['text', 'task', 'title'],
    value_log: ['description', 'value', 'text'],
    playbook_entry: ['content', 'body', 'text', 'title'],
  }
  const keys = [...keysByTarget[item.proposed_target], 'summary', 'description', 'value', 'text', 'task', 'title', 'content', 'body', 'fact', 'next_step', 'notes', 'label']
  const key = keys.find(k => typeof payload[k] === 'string') ?? keysByTarget[item.proposed_target][0]
  return prettyJson({ ...payload, [key]: nextText })
}

function contactInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
}

function Avatar({ src, name, size = 30 }: { src?: string | null; name: string; size?: number }) {
  return (
    <span className="crm-av" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" /> : contactInitials(name)}
    </span>
  )
}

function EditableText({
  value,
  onChange,
  className = '',
  placeholder = '—',
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }
  if (editing) {
    return (
      <input
        autoFocus
        className={`rv-edit ${className}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <span className={`rv-editable ${className}`} onClick={() => setEditing(true)} title="Click to edit">
      {value ? value : <span className="rv-ph">{placeholder}</span>}
      <PencilSimple size={10} />
    </span>
  )
}

function SourceDots({ sources }: { sources: ReviewItem['source'][] }) {
  return (
    <span className="rv-srcdots">
      {[...new Set(sources)].map(source => <span key={source} className="rv-srcdot" title={sourceLabel(source)}>{sourceCfg(source).icon}</span>)}
    </span>
  )
}

function ReviewStatusPill({ status, outcome }: { status: ReviewPerson['status']; outcome?: ReviewPerson['outcome'] }) {
  if (outcome) {
    return <span className={`rv-stpill ${outcome === 'accepted' ? 'approved' : 'omitted'}`}><span className="dot" /> {outcome === 'accepted' ? 'approved' : 'omitted'}</span>
  }
  if (status === 'needs-identity') return <span className="rv-stpill needid"><span className="dot" /> needs identity</span>
  return <span className="rv-stpill linked"><span className="dot" /> linked</span>
}

function countBadge(count: number, label: string) {
  if (!count) return <span className="rv-count-empty">no {label}</span>
  return <span className="rv-count-badge"><b>{count}</b> {label}</span>
}

function personOutputCounts(person: ReviewPerson) {
  const flat = person.days.flatMap(day => day.items)
  return {
    keyDates: flat.filter(item => stagedSourceTarget(item) === 'contact_fact' && datumKindForItem(item) === 'date').length,
    facts: flat.filter(item => stagedSourceTarget(item) === 'contact_fact' && datumKindForItem(item) !== 'date').length,
    value: flat.filter(item => stagedSourceTarget(item) === 'value_log').length,
    todos: flat.filter(item => stagedSourceTarget(item) === 'todo').length,
    review: flat.filter(item => stagedSourceTarget(item) === 'review_item').length,
  }
}

function makeGroups(items: ReviewItem[], contacts: Contact[]): ReviewPerson[] {
  const contactMap = new Map(contacts.map(c => [c.id, c]))
  const people = new Map<string, ReviewPerson>()

  for (const item of items) {
    const contact = item.contact_id ? contactMap.get(item.contact_id) : null
    const fallbackName = personNameForItem(item, contact)
    const key = groupKeyForItem(item, contact)
    const reviewed = item.status !== 'pending'
    const group = people.get(key) ?? {
      id: key,
      contactId: item.contact_id,
      name: fallbackName || 'Unlinked input',
      avatar: contact?.profile_photo_url ?? null,
      handle: contact?.phone ?? contact?.email ?? externalHandle(item) ?? null,
      status: item.contact_id ? 'linked' : 'needs-identity',
      sources: [] as ReviewItem['source'][],
      days: [] as ReviewDay[],
      reviewed,
      outcome: reviewed && item.status !== 'pending' ? item.status : undefined,
      reviewedAt: item.reviewed_at,
    } satisfies ReviewPerson
    group.sources = [...new Set([...group.sources, item.source])]
    group.reviewed = group.reviewed && reviewed
    if (!reviewed) {
      group.outcome = undefined
      group.reviewedAt = null
    }
    const dayDate = dayDateForItem(item)
    const dayId = `${key}:${dayDate}:${item.source}`
    let day = group.days.find(d => d.id === dayId)
    if (!day) {
      day = {
        id: dayId,
        date: dayDate,
        source: item.source,
        channel: channelForItem(item),
        summary: summaryForItem(item),
        raw: item.body || prettyJson(item.proposed_payload),
        items: [],
      }
      group.days.push(day)
    }
    day.items.push(item)
    people.set(key, group)
  }

  return [...people.values()].map(person => ({
    ...person,
    days: person.days.sort((a, b) => b.date.localeCompare(a.date)),
  }))
}

function FieldRow({
  item,
  payload,
  target,
  disabled,
  busy,
  error,
  onPayload,
  onTarget,
  onApprove,
  onOmit,
}: {
  item: ReviewItem
  payload: string
  target: ReviewTarget
  disabled: boolean
  busy: boolean
  error?: string
  onPayload: (value: string) => void
  onTarget: (target: ReviewTarget) => void
  onApprove: () => void
  onOmit: () => void
}) {
  const [editing, setEditing] = useState(false)
  const parsedPayload = parsePayload(payload).payload ?? item.proposed_payload
  const kind = datumKindForItem({ ...item, proposed_target: target }, parsedPayload)
  const visual = DATUM_VISUALS[kind]
  const displayText = datumTextForItem({ ...item, proposed_target: target }, parsedPayload)
  const meta = datumMetaForItem({ ...item, proposed_target: target }, parsedPayload)
  const intro = kind === 'intro' ? introParts(parsedPayload) : null
  return (
    <div className="rv-subgrid rv-datum">
      <div className="rv-dtype">
        <span className={`rv-tchip ${visual.tone}`}>
          {visual.icon}{visual.label}
        </span>
      </div>
      <div className="rv-ddetail">
        {intro && (
          <span className="rv-intro">
            <b>{intro.connector}</b><ArrowRight size={11} /><b>{intro.person ?? 'someone'}</b>
            {intro.to && <><i>to</i><b>{intro.to}</b></>}
          </span>
        )}
        <EditableText value={displayText} onChange={value => onPayload(updatePayloadText(item, payload, value))} />
        {editing && (
          <div className="rv-field-edit">
            <select
              value={target}
              disabled={disabled}
              onChange={e => onTarget(e.target.value as ReviewTarget)}
              className="rv-edit rv-target-select"
            >
              {REVIEW_TARGETS.map(t => <option key={t} value={t}>{REVIEW_TARGET_LABELS[t]}</option>)}
            </select>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        )}
      </div>
      <div className="rv-dmeta">{meta}</div>
      <div className="rv-dacts">
        <button className="rv-iconbtn" onClick={() => setEditing(v => !v)} title="Edit type"><PencilSimple size={12} /></button>
        {!disabled && <button className="rv-ok" disabled={busy} onClick={onApprove} title="Approve"><Check size={12} /></button>}
        {!disabled && <button className="rv-no" disabled={busy} onClick={onOmit} title="Dismiss"><X size={11} /></button>}
      </div>
    </div>
  )
}

function DayBand({
  person,
  day,
  drafts,
  targets,
  errors,
  busyId,
  reviewed,
  summary,
  onPayload,
  onTarget,
  onSummary,
  onApprove,
  onOmit,
  onApproveDay,
  onOmitDay,
  onRaw,
}: {
  person: ReviewPerson
  day: ReviewDay
  drafts: Record<string, string>
  targets: Record<string, ReviewTarget>
  errors: Record<string, string>
  busyId: string | null
  reviewed: boolean
  summary: string
  onPayload: (id: string, value: string) => void
  onTarget: (id: string, target: ReviewTarget) => void
  onSummary: (value: string) => void
  onApprove: (item: ReviewItem) => void
  onOmit: (item: ReviewItem) => void
  onApproveDay: (items: ReviewItem[]) => void
  onOmitDay: (items: ReviewItem[]) => void
  onRaw: () => void
}) {
  const src = sourceCfgForDay(day)
  return (
    <div className="rv-dayblock">
      <div className="rv-dayband">
        <span className="rv-src">{src.icon}<span>{src.label}</span></span>
        <span className="rv-day-date">{shortDate(day.date)}</span>
        <div className="rv-band-sum"><EditableText value={summary} onChange={onSummary} /></div>
        <button className="rv-raw-btn" onClick={onRaw}><Quotes size={11} /> Source</button>
        {!reviewed && <button className="rv-omit-day" onClick={() => onOmitDay(day.items)} title="Discard day"><X size={12} /></button>}
        {!reviewed && <button className="rv-approve-day" onClick={() => onApproveDay(day.items)} disabled={person.status === 'needs-identity'}><Check size={12} /> Approve day</button>}
      </div>
      <div className="rv-subtable">
        <div className="rv-subgrid rv-subhd"><div>Type</div><div>Detail</div><div>When</div><div className="r">Action</div></div>
        {day.items.map(item => (
          <FieldRow
            key={item.id}
            item={item}
            payload={drafts[item.id] ?? prettyJson(item.proposed_payload)}
            target={targets[item.id] ?? item.proposed_target}
            disabled={item.status !== 'pending'}
            busy={busyId === item.id}
            error={errors[item.id]}
            onPayload={value => onPayload(item.id, value)}
            onTarget={target => onTarget(item.id, target)}
            onApprove={() => onApprove(item)}
            onOmit={() => onOmit(item)}
          />
        ))}
      </div>
    </div>
  )
}

function IdentityResolver({
  person,
  contacts,
  onLink,
  onCreate,
  onDiscard,
}: {
  person: ReviewPerson
  contacts: Contact[]
  onLink: (contactId: string) => void
  onCreate: () => void
  onDiscard: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const rows = query
    ? contacts
        .filter(c => `${c.name} ${c.company ?? ''} ${c.job_title ?? ''}`.toLowerCase().includes(query))
        .slice(0, 8)
    : []
  return (
    <div className="rv-identity">
      <div className="rv-identity-hd">
        <span className="rv-id-warn"><WarningCircle size={14} /></span>
        <div className="rv-id-txt">
          <strong>No contact in reThink</strong>
          <span>Comes in as <b>{person.name}</b>{person.handle ? ` · ${person.handle}` : ''}</span>
        </div>
        <button className="rv-id-discard" onClick={onDiscard}><Trash size={12} /> Discard</button>
      </div>
      <div className="rv-id-search">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a person to link or merge..." />
        <button className="rv-id-create" onClick={onCreate}><UserPlus size={13} /> Create new</button>
      </div>
      {rows.length > 0 && (
        <div className="rv-id-results">
          {rows.map(contact => (
            <div className="rv-id-result" key={contact.id}>
              <Avatar src={contact.profile_photo_url} name={contact.name} size={28} />
              <div className="rv-id-rmeta">
                <span className="rv-id-rname">{contact.name}</span>
                <span className="rv-id-rsub">{contact.job_title || 'Contact'}{contact.company ? ` · ${contact.company}` : ''}</span>
              </div>
              <button className="rv-id-link" onClick={() => onLink(contact.id)}><LinkSimple size={12} /> Link</button>
              <button className="rv-id-merge" onClick={() => onLink(contact.id)}><UserSwitch size={12} /> Merge channels</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RawPeek({ person, day, onClose }: { person: ReviewPerson; day: ReviewDay; onClose: () => void }) {
  const src = sourceCfgForDay(day)
  return (
    <>
      <div className="peek-bg" onClick={onClose} />
      <aside className="rv-rawpeek">
        <div className="rv-rawpeek-hd">
          <span className="rv-src">{src.icon}<span>{src.label}</span></span>
          <span className="rv-rawpeek-date">{person.name} · {shortDate(day.date)}</span>
          <span className="rv-day-grow" />
          <button className="peek-x" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="rv-rawpeek-body">
          <div className="rv-rawpeek-label">Original source</div>
          <pre className="rv-raw">{day.raw}</pre>
          <div className="rv-rawpeek-label mt-4">Proposed writes</div>
          <pre className="rv-raw">{JSON.stringify(day.items.map(i => ({ target: i.proposed_target, payload: i.proposed_payload })), null, 2)}</pre>
        </div>
      </aside>
    </>
  )
}

function parsePayload(raw: string): { payload: ReviewPayload | null; error?: string } {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Payload must be a JSON object.')
    return { payload: parsed as ReviewPayload }
  } catch (error) {
    return { payload: null, error: error instanceof Error ? error.message : 'Invalid JSON payload.' }
  }
}

export default function ReviewQueue() {
  const { user } = useAuth()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draftPayloads, setDraftPayloads] = useState<Record<string, string>>({})
  const [draftTargets, setDraftTargets] = useState<Record<string, ReviewTarget>>({})
  const [draftContacts, setDraftContacts] = useState<Record<string, string>>({})
  const [draftSummaries, setDraftSummaries] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [raw, setRaw] = useState<{ person: ReviewPerson; day: ReviewDay } | null>(null)
  const [toast, setToast] = useState<ReactNode | null>(null)
  const [reviewOrigin, setReviewOrigin] = useState<'conversations-local' | 'supabase'>('supabase')
  const toastRef = useRef<number | null>(null)

  const showToast = (node: ReactNode) => {
    setToast(node)
    if (toastRef.current) window.clearTimeout(toastRef.current)
    toastRef.current = window.setTimeout(() => setToast(null), 3200)
  }

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [contactsRes] = await Promise.all([
      supabase.from('outreach_logs').select('*').eq('user_id', user.id).order('name'),
    ])
    const itemsRes = await supabase
      .from('review_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('proposed_payload->>source_kind', 'identity_resolution')
      .order('created_at', { ascending: false })
      .limit(200)
    const nextItems = (itemsRes.data ?? []) as ReviewItem[]
    setReviewOrigin('supabase')
    setItems(nextItems)
    setContacts((contactsRes.data ?? []) as Contact[])
    setDraftPayloads(prev => {
      const next = { ...prev }
      nextItems.forEach(item => { if (!next[item.id]) next[item.id] = prettyJson(item.proposed_payload) })
      return next
    })
    setDraftTargets(prev => {
      const next = { ...prev }
      nextItems.forEach(item => { if (!next[item.id]) next[item.id] = item.proposed_target })
      return next
    })
    setDraftContacts(prev => {
      const next = { ...prev }
      nextItems.forEach(item => { if (!(item.id in next)) next[item.id] = item.contact_id ?? '' })
      return next
    })
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const filteredItems = useMemo(() => items.filter(item => {
    if (filter === 'pending') return item.status === 'pending'
    if (filter === 'reviewed') return item.status !== 'pending'
    return true
  }), [filter, items])
  const groups = useMemo(() => makeGroups(filteredItems, contacts), [contacts, filteredItems])
  const pendingGroups = useMemo(() => makeGroups(items.filter(i => i.status === 'pending'), contacts), [contacts, items])
  const pendingCount = items.filter(i => i.status === 'pending').length
  const reviewedCount = items.length - pendingCount
  const pendingWrites = items.filter(i => i.status === 'pending').length
  const needId = pendingGroups.filter(p => p.status === 'needs-identity').length
  const linkedCount = pendingGroups.filter(p => p.status === 'linked').length

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const accept = async (item: ReviewItem) => {
    const parsed = parsePayload(draftPayloads[item.id] ?? prettyJson(item.proposed_payload))
    if (!parsed.payload) {
      setErrorById(prev => ({ ...prev, [item.id]: parsed.error ?? 'Invalid JSON payload.' }))
      return
    }
    const target = draftTargets[item.id] ?? item.proposed_target
    const contactId = draftContacts[item.id] || item.contact_id || null
    setBusyId(item.id)
    const result = await acceptReviewItem({ ...item, proposed_target: target }, parsed.payload, contactId)
    setBusyId(null)
    if (!result.ok) {
      setErrorById(prev => ({ ...prev, [item.id]: result.error ?? 'Could not accept item.' }))
      const localId = stagedId(item)
      if (localId) await invokeTauri('mark_conversations_staged_outputs', { ids: [localId], status: 'failed', error: result.error ?? 'Could not accept item.' })
      const remoteId = remoteStagedId(item)
      if (remoteId) await supabase.from('conversation_ai_staged_outputs').update({ status: 'failed', error: result.error ?? 'Could not accept item.' }).eq('id', remoteId)
      return
    }
    const localId = stagedId(item)
    if (localId) await invokeTauri('mark_conversations_staged_outputs', { ids: [localId], status: 'synced', error: null })
    const remoteId = remoteStagedId(item)
    if (remoteId) await supabase.from('conversation_ai_staged_outputs').update({ status: 'synced', error: null, confirmed_at: Date.now() }).eq('id', remoteId)
    setErrorById(prev => ({ ...prev, [item.id]: '' }))
    showToast(<>✓ {REVIEW_TARGET_LABELS[target]} written</>)
    await load()
  }

  const omit = async (item: ReviewItem) => {
    setBusyId(item.id)
    const result = await dismissReviewItem(item)
    setBusyId(null)
    if (!result.ok) {
      setErrorById(prev => ({ ...prev, [item.id]: result.error ?? 'Could not dismiss item.' }))
      return
    }
    const localId = stagedId(item)
    if (localId) await invokeTauri('mark_conversations_staged_outputs', { ids: [localId], status: 'rejected', error: null })
    const remoteId = remoteStagedId(item)
    if (remoteId) await supabase.from('conversation_ai_staged_outputs').update({ status: 'rejected', error: null, confirmed_at: Date.now() }).eq('id', remoteId)
    showToast(<>Dismissed — not saved</>)
    await load()
  }

  const acceptMany = async (targetItems: ReviewItem[]) => {
    for (const item of targetItems.filter(i => i.status === 'pending')) await accept(item)
  }

  const omitMany = async (targetItems: ReviewItem[]) => {
    for (const item of targetItems.filter(i => i.status === 'pending')) await omit(item)
  }

  const linkPerson = async (person: ReviewPerson, contactId: string) => {
    const personItems = person.days.flatMap(d => d.items)
    const channelRows = personItems.flatMap(item => identityChannelRows(item, contactId))
    if (channelRows.length > 0) {
      await supabase.from('contact_channels').upsert(channelRows, { onConflict: 'channel,channel_identifier' })
    }
    await supabase.from('review_items')
      .update({ contact_id: contactId, status: 'accepted', reviewed_at: new Date().toISOString() })
      .in('id', personItems.map(i => i.id))
    person.days.flatMap(d => d.items).forEach(item => setDraftContacts(prev => ({ ...prev, [item.id]: contactId })))
    showToast(<>Linked to <b>{contacts.find(c => c.id === contactId)?.name}</b></>)
    await load()
  }

  const createPerson = async (person: ReviewPerson) => {
    if (!user) return
    const { data, error } = await supabase.from('outreach_logs').insert({
      user_id: user.id,
      name: person.name,
      status: 'PROSPECT',
      category: 'peer',
      log_date: new Date().toISOString().slice(0, 10),
      relationship_domain: 'professional',
      connection_strength: 0,
      health_score: 0,
    }).select('*').single()
    if (error || !data) {
      showToast(error?.message ?? 'Could not create contact')
      return
    }
    await linkPerson(person, (data as Contact).id)
  }

  const reopen = async (person: ReviewPerson) => {
    await supabase.from('review_items').update({ status: 'pending', reviewed_at: null }).in('id', person.days.flatMap(d => d.items.map(i => i.id)))
    showToast(<>Reopened <b>{person.name}</b></>)
    await load()
  }

  const approveSelected = async () => {
    for (const person of groups.filter(p => selected.has(p.id))) {
      const contactId = person.days.flatMap(day => day.items).map(item => draftContacts[item.id] || item.contact_id || '').find(Boolean)
      if (contactId) await linkPerson(person, contactId)
    }
    setSelected(new Set())
  }

  const omitSelected = async () => {
    const picked = groups.filter(p => selected.has(p.id)).flatMap(p => p.days.flatMap(d => d.items))
    await omitMany(picked)
    setSelected(new Set())
  }

  const approveAll = async () => {
    for (const person of pendingGroups) {
      const contactId = person.days.flatMap(day => day.items).map(item => draftContacts[item.id] || item.contact_id || '').find(Boolean)
      if (contactId) await linkPerson(person, contactId)
    }
  }

  return (
    <div className="ppl-page rv-page">
      <header className="rv-hd">
        <div className="rv-hd-l">
          <h1 className="ppl-title">Review</h1>
          <p className="ppl-sub">Link unmatched WhatsApp and LinkedIn conversations to the right contact. Interaction summaries and AI actions live in Activity and Suggestions.</p>
        </div>
        <div className="rv-kpi" title="Pending writes">
          <ChatsCircle size={15} />
          <span className="rv-kpi-num"><b>{pendingCount}</b>/{items.length || 0}</span>
          <span className="rv-kpi-lbl">need linking</span>
          <span className="rv-kpi-bar"><span style={{ width: `${items.length ? Math.round((reviewedCount / items.length) * 100) : 0}%` }} /></span>
        </div>
      </header>

      <div className="rv-panel">
        <div className="rv-toolbar">
          <div className="rv-stats">
            <span className="rv-stat"><b>{pendingGroups.length}</b> contacts</span>
            <span className="rv-stat"><b>{pendingWrites}</b> links</span>
            <span className="rv-stat"><b>{linkedCount}</b> linked</span>
            {needId > 0 && <button className="rv-stat warn" onClick={() => setFilter('pending')}><span className="dot" /><b>{needId}</b> need identity</button>}
          </div>
          <span className="rv-tb-grow" />
          <div className="rv-seg">
            {(['pending', 'reviewed', 'all'] as Filter[]).map(f => (
              <button key={f} className={`rv-segbtn${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'pending' ? 'Pending' : f === 'reviewed' ? 'Reviewed' : 'All'}
                {f === 'pending' && pendingCount > 0 && <span className="rv-seg-n">{pendingCount}</span>}
              </button>
            ))}
          </div>
          <button className="crm-tool primary rv-approveall" onClick={approveAll}><CheckCircle size={13} /> Link all</button>
        </div>

        <div className="rv-scroll">
          <div className="rv-grid rv-head">
            <div className="rv-cell chk"><span className="rv-cb head" /></div>
            <div className="rv-cell">Contact</div>
            <div className="rv-cell">Status</div>
            <div className="rv-cell">This review</div>
            <div className="rv-cell">Key dates</div>
            <div className="rv-cell">Facts</div>
            <div className="rv-cell">Value</div>
            <div className="rv-cell">Todos</div>
            <div className="rv-cell">Needs review</div>
            <div className="rv-cell acts-h">Action</div>
          </div>

          <div className="rv-body">
            {loading && <div className="rv-empty"><Sparkle size={22} /><span>Loading review queue...</span></div>}
            {!loading && groups.length === 0 && <div className="rv-empty"><CheckCircle size={22} /><span>{filter === 'pending' ? 'Queue clear. Nothing left to review.' : 'Nothing here yet.'}</span></div>}

            {groups.map(person => {
              const open = expanded.has(person.id) && !person.reviewed
              const selectedRow = selected.has(person.id)
              const counts = personOutputCounts(person)
              return (
                <div className={`rv-block${open ? ' open' : ''}`} key={person.id}>
                  <div className={`rv-grid rv-row${person.status === 'needs-identity' && !person.reviewed ? ' needid' : ''}${selectedRow ? ' picked' : ''}${person.reviewed ? ' done' : ''}`}>
                    <div className="rv-cell chk">
                      {!person.reviewed && <span className={`rv-cb${selectedRow ? ' on' : ''}`} onClick={() => toggleSelected(person.id)}>{selectedRow && <Check size={10} />}</span>}
                    </div>
                    <div className="rv-cell person" onClick={() => !person.reviewed && toggleExpand(person.id)}>
                      {!person.reviewed && <button className="rv-caret">{open ? <CaretDown size={12} /> : <CaretRight size={12} />}</button>}
                      <Avatar src={person.avatar} name={person.name} size={30} />
                      <div className="rv-person-meta">
                        <span className="rv-person-name">{person.name}</span>
                        <span className="rv-person-sub">{person.days.length} {person.days.length === 1 ? 'day' : 'days'} · <SourceDots sources={person.sources} /></span>
                      </div>
                    </div>
                    <div className="rv-cell status"><ReviewStatusPill status={person.status} outcome={person.outcome} /></div>
                    <div className="rv-cell summary"><span className="rv-sum-tx">{person.days[0]?.summary || '—'}</span></div>
                    <div className="rv-cell rv-count-cell">{countBadge(counts.keyDates, 'date')}</div>
                    <div className="rv-cell rv-count-cell">{countBadge(counts.facts, 'fact')}</div>
                    <div className="rv-cell rv-count-cell">{countBadge(counts.value, 'value')}</div>
                    <div className="rv-cell rv-count-cell">{countBadge(counts.todos, 'todo')}</div>
                    <div className="rv-cell rv-count-cell">{countBadge(counts.review, 'review')}</div>
                    <div className="rv-cell acts">
                      {person.reviewed
                        ? <button className="rv-reopen" onClick={() => reopen(person)}><ArrowCounterClockwise size={12} /> Reopen</button>
                        : person.status === 'needs-identity'
                          ? <button className="rv-resolve" onClick={() => toggleExpand(person.id)}><UserSwitch size={12} /> Resolve</button>
                          : <><button className="rv-approve" onClick={() => acceptMany(person.days.flatMap(d => d.items))}>Approve</button><button className="rv-omit" onClick={() => omitMany(person.days.flatMap(d => d.items))}>Omit</button></>}
                    </div>
                  </div>

                  {open && (
                    <div className="rv-expand">
                      {person.status === 'needs-identity' && (
                        <IdentityResolver
                          person={person}
                          contacts={contacts}
                          onLink={contactId => linkPerson(person, contactId)}
                          onCreate={() => createPerson(person)}
                          onDiscard={() => omitMany(person.days.flatMap(d => d.items))}
                        />
                      )}
                      <div className="rv-detail">
                        {person.days.map(day => (
                          <DayBand
                            key={day.id}
                            person={person}
                            day={day}
                            drafts={draftPayloads}
                            targets={draftTargets}
                            errors={errorById}
                            busyId={busyId}
                            reviewed={person.reviewed}
                            summary={draftSummaries[day.id] ?? day.summary}
                            onPayload={(id, value) => setDraftPayloads(prev => ({ ...prev, [id]: value }))}
                            onTarget={(id, target) => setDraftTargets(prev => ({ ...prev, [id]: target }))}
                            onSummary={(value) => setDraftSummaries(prev => ({ ...prev, [day.id]: value }))}
                            onApprove={accept}
                            onOmit={omit}
                            onApproveDay={acceptMany}
                            onOmitDay={omitMany}
                            onRaw={() => setRaw({ person, day })}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rv-bulk">
          <span className="rv-bulk-n">{selected.size} selected</span>
          <span className="rv-bulk-grow" />
          <button className="rv-bulk-clear" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="rv-bulk-omit" onClick={omitSelected}><X size={12} /> Omit</button>
          <button className="rv-bulk-approve" onClick={approveSelected}><Check size={12} /> Approve</button>
        </div>
      )}

      {raw && <RawPeek person={raw.person} day={raw.day} onClose={() => setRaw(null)} />}
      {toast && <div className="rv-toast"><span className="rv-toast-tx">{toast}</span><button className="rv-toast-undo" onClick={() => setToast(null)}><FloppyDisk size={12} /> Saved</button></div>}
    </div>
  )
}
