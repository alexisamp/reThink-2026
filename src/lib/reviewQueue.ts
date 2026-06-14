import { supabase } from '@/lib/supabase'
import type {
  ContactFactCategory,
  Interaction,
  PlaybookEntryType,
  ReviewItem,
  ReviewTarget,
  ValueLogType,
} from '@/types'

export type ReviewPayload = Record<string, unknown>

const FACT_CATEGORIES: ContactFactCategory[] = [
  'family', 'career_intel', 'compensation', 'obsession', 'hot_button',
  'life_phase', 'pet_peeve', 'origin_story', 'health', 'preference', 'other',
]
const INTERACTION_TYPES: Interaction['type'][] = ['whatsapp', 'linkedin_msg', 'email', 'call', 'virtual_coffee', 'in_person']
const INTERACTION_CHANNELS = ['whatsapp', 'linkedin', 'exit5', 'x', 'email', 'call', 'in_person', 'other'] as const
const VALUE_TYPES: ValueLogType[] = ['introduction', 'content', 'referral', 'advice', 'endorsement', 'opportunity', 'candor', 'other']
const PLAYBOOK_TYPES: PlaybookEntryType[] = [
  'pitch', 'story', 'value_prop', 'positioning', 'skill', 'objection',
  'value_bank', 'template', 'persona', 'script', 'boundary',
]

export const REVIEW_TARGET_LABELS: Record<ReviewTarget, string> = {
  contact_fact: 'Contact fact',
  interaction: 'Interaction',
  next_step: 'Next step',
  todo: 'Todo',
  value_log: 'Value log',
  playbook_entry: 'Playbook entry',
}

export const REVIEW_TARGETS = Object.keys(REVIEW_TARGET_LABELS) as ReviewTarget[]

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function str(payload: ReviewPayload, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function num(payload: ReviewPayload, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function textFrom(item: ReviewItem, payload: ReviewPayload, ...keys: string[]): string {
  for (const key of keys) {
    const value = str(payload, key)
    if (value) return value
  }
  return item.body?.trim() || item.title
}

function compactName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sameLooseName(a: unknown, b: unknown): boolean {
  const clean = (value: unknown) =>
    typeof value === 'string'
      ? value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')
      : ''
  const left = clean(a)
  const right = clean(b)
  return Boolean(left && right && left === right)
}

function isKeyDatePayload(payload: ReviewPayload): boolean {
  return payload.category === 'key_date' || Boolean(str(payload, 'event_type') || str(payload, 'date_value') || str(payload, 'date_precision'))
}

function hasIntroductionPayload(payload: ReviewPayload): boolean {
  return payload.type === 'introduction' ||
    payload.type === 'referral' ||
    Boolean(
      str(payload, 'introduced_person_name') ||
      str(payload, 'introduced_to_name') ||
      str(payload, 'connector_name') ||
      str(payload, 'introduced_person_company') ||
      str(payload, 'introduced_to_company') ||
      str(payload, 'relationship_context') ||
      str(payload, 'introduction_status')
    )
}

function missingOptionalTable(error: { message?: string; code?: string } | null | undefined) {
  return error?.code === '42P01' || /relation .* does not exist/i.test(error?.message ?? '')
}

async function markReviewed(item: ReviewItem, status: 'accepted' | 'dismissed', payload?: ReviewPayload, contactId?: string | null) {
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  }
  if (payload) patch.proposed_payload = payload
  patch.proposed_target = item.proposed_target
  if (contactId !== undefined) patch.contact_id = contactId
  const { error } = await supabase.from('review_items').update(patch).eq('id', item.id).eq('user_id', item.user_id)
  return error
}

export async function dismissReviewItem(item: ReviewItem): Promise<{ ok: boolean; error?: string }> {
  const error = await markReviewed(item, 'dismissed')
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function acceptReviewItem(
  item: ReviewItem,
  payload: ReviewPayload,
  contactId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const target = item.proposed_target
  const today = localDate()

  if (['contact_fact', 'interaction', 'next_step', 'value_log'].includes(target) && !contactId) {
    return { ok: false, error: 'Choose a contact before accepting this item.' }
  }

  let error: { message: string } | null = null

  if (target === 'contact_fact') {
    const importance = Math.min(3, Math.max(1, Math.round(num(payload, 'importance') ?? 2)))
    if (isKeyDatePayload(payload)) {
      const res = await supabase.from('contact_key_dates').insert({
        user_id: item.user_id,
        contact_id: contactId,
        event_type: str(payload, 'event_type') || 'important_date',
        subject: str(payload, 'subject') || str(payload, 'label') || textFrom(item, payload, 'value', 'text', 'fact'),
        relation: str(payload, 'relation'),
        date_value: str(payload, 'date_value') || str(payload, 'date'),
        date_precision: str(payload, 'date_precision') || 'unknown',
        description: str(payload, 'description') || textFrom(item, payload, 'value', 'text', 'fact'),
        source: item.source === 'conversations' ? 'chat_capture' : 'import',
        source_interaction_date: str(payload, 'interaction_date') || str(payload, 'date') || null,
      })
      error = res.error
    }
    if (!isKeyDatePayload(payload) || missingOptionalTable(error)) {
      const res = await supabase.from('contact_facts').insert({
        user_id: item.user_id,
        contact_id: contactId,
        category: oneOf(payload.category, FACT_CATEGORIES, 'other'),
        label: str(payload, 'label') || (isKeyDatePayload(payload) ? str(payload, 'subject') || str(payload, 'event_type') : null),
        value: textFrom(item, payload, 'value', 'text', 'fact', 'description'),
        importance,
        expires_at: str(payload, 'expires_at'),
        source: item.source === 'conversations' ? 'chat_capture' : 'import',
      })
      error = res.error
    }
  }

  if (target === 'interaction') {
    const interactionDate = str(payload, 'interaction_date') || str(payload, 'date') || today
    const res = await supabase.from('interactions').insert({
      user_id: item.user_id,
      contact_id: contactId,
      type: oneOf(payload.type, INTERACTION_TYPES, item.source === 'conversations' ? 'whatsapp' : 'linkedin_msg'),
      direction: oneOf(payload.direction, ['inbound', 'outbound'] as const, 'inbound'),
      notes: textFrom(item, payload, 'notes', 'summary', 'text'),
      interaction_date: interactionDate,
      next_step: str(payload, 'next_step'),
      next_step_date: str(payload, 'next_step_date'),
      next_step_owner: oneOf(payload.next_step_owner, ['me', 'them'] as const, 'me'),
      channel: oneOf(payload.channel, INTERACTION_CHANNELS, 'other'),
    })
    error = res.error
    if (!error) {
      await supabase.from('outreach_logs')
        .update({ last_interaction_at: `${interactionDate}T12:00:00.000Z`, updated_at: new Date().toISOString() })
        .eq('id', contactId)
        .eq('user_id', item.user_id)
    }
  }

  if (target === 'next_step') {
    const due = str(payload, 'next_step_date') || str(payload, 'date') || today
    const res = await supabase.from('interactions').insert({
      user_id: item.user_id,
      contact_id: contactId,
      type: oneOf(payload.type, INTERACTION_TYPES, item.source === 'conversations' ? 'whatsapp' : 'linkedin_msg'),
      direction: oneOf(payload.direction, ['inbound', 'outbound'] as const, 'outbound'),
      notes: item.body || item.title,
      interaction_date: today,
      next_step: textFrom(item, payload, 'next_step', 'text', 'task'),
      next_step_date: due,
      next_step_owner: oneOf(payload.next_step_owner, ['me', 'them'] as const, 'me'),
      channel: oneOf(payload.channel, INTERACTION_CHANNELS, 'other'),
    })
    error = res.error
  }

  if (target === 'todo') {
    const res = await supabase.from('todos').insert({
      user_id: item.user_id,
      text: textFrom(item, payload, 'text', 'task', 'title'),
      date: str(payload, 'date') || today,
      contact_id: contactId,
      url: str(payload, 'url') || item.source_url,
    })
    error = res.error
  }

  if (target === 'value_log') {
    const res = await supabase.from('value_logs').insert({
      user_id: item.user_id,
      outreach_log_id: contactId,
      type: oneOf(payload.type, VALUE_TYPES, 'other'),
      description: textFrom(item, payload, 'description', 'value', 'text'),
      date: str(payload, 'date') || today,
      direction: oneOf(payload.direction, ['given', 'received'] as const, 'given'),
    }).select('id').single()
    error = res.error
    const valueLogId = res.data?.id ?? null
    if (!error && valueLogId && hasIntroductionPayload(payload)) {
      const intro = await supabase.from('contact_introductions').upsert({
        user_id: item.user_id,
        source_contact_id: contactId,
        connector_contact_id: sameLooseName(payload.connector_name, payload.source_contact_name) ? contactId : null,
        introduced_contact_id: null,
        introduced_to_contact_id: null,
        connector_name: compactName(payload.connector_name),
        introduced_person_name: compactName(payload.introduced_person_name),
        introduced_person_company: compactName(payload.introduced_person_company),
        introduced_to_name: compactName(payload.introduced_to_name),
        introduced_to_company: compactName(payload.introduced_to_company),
        relationship_context: compactName(payload.relationship_context) ?? textFrom(item, payload, 'description', 'value', 'text'),
        status: compactName(payload.introduction_status) ?? (payload.type === 'referral' ? 'made' : 'made'),
        direction: oneOf(payload.direction, ['given', 'received'] as const, 'given'),
        confidence: compactName(payload.confidence) ?? 'medium',
        source_channel: str(payload, 'source_channel') || str(payload, 'channel') || (item.source === 'conversations' ? 'whatsapp' : item.source),
        source_interaction_date: str(payload, 'date') || today,
        source_external_id: item.source_external_id ?? item.id,
        source_value_log_id: valueLogId,
      }, { onConflict: 'user_id,source_external_id' })
      if (!missingOptionalTable(intro.error)) error = intro.error
    }
  }

  if (target === 'playbook_entry') {
    const type = oneOf(payload.type, PLAYBOOK_TYPES, 'story')
    const { data: existing } = await supabase
      .from('playbook_entries')
      .select('id')
      .eq('user_id', item.user_id)
      .eq('type', type)
    const tags = Array.isArray(payload.tags) ? payload.tags.filter(t => typeof t === 'string') : []
    const framework = oneOf(payload.framework, ['car', 'icarq', 'disney', 'clear', ''] as const, '')
    const res = await supabase.from('playbook_entries').insert({
      user_id: item.user_id,
      type,
      title: str(payload, 'title') || item.title,
      content: textFrom(item, payload, 'content', 'body', 'text'),
      tags,
      framework: framework || null,
      list_order: existing?.length ?? 0,
    })
    error = res.error
  }

  if (error) return { ok: false, error: error.message }
  if (item.id.startsWith('local-ai-staged:') || item.id.startsWith('remote-ai-staged:')) {
    return { ok: true }
  }
  const reviewError = await markReviewed(item, 'accepted', payload, contactId)
  return reviewError ? { ok: false, error: reviewError.message } : { ok: true }
}
