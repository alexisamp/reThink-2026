import { supabase } from '@/lib/supabase'
import type {
  ContactFactCategory,
  InteractionSuggestion,
  InteractionSuggestionTarget,
  ValueLogType,
} from '@/types'

type Payload = Record<string, unknown>

const FACT_CATEGORIES: ContactFactCategory[] = [
  'family', 'career_intel', 'compensation', 'obsession', 'hot_button',
  'life_phase', 'pet_peeve', 'origin_story', 'health', 'preference', 'other',
]
const VALUE_TYPES: ValueLogType[] = ['introduction', 'content', 'referral', 'advice', 'endorsement', 'opportunity', 'candor', 'other']

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function str(payload: Payload, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function num(payload: Payload, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function textFrom(suggestion: InteractionSuggestion, payload: Payload, ...keys: string[]): string {
  for (const key of keys) {
    const value = str(payload, key)
    if (value) return value
  }
  return suggestion.body?.trim() || suggestion.title
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

function hasIntroductionPayload(payload: Payload): boolean {
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

async function markSuggestion(suggestion: InteractionSuggestion, status: 'approved' | 'dismissed') {
  const { error } = await supabase
    .from('interaction_suggestions')
    .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', suggestion.id)
    .eq('user_id', suggestion.user_id)
  return error
}

export async function dismissInteractionSuggestion(suggestion: InteractionSuggestion): Promise<{ ok: boolean; error?: string }> {
  const error = await markSuggestion(suggestion, 'dismissed')
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function approveInteractionSuggestion(
  suggestion: InteractionSuggestion,
): Promise<{ ok: boolean; error?: string }> {
  const payload = suggestion.payload ?? {}
  const contactId = suggestion.contact_id ?? str(payload, 'contact_id')
  const today = localDate()

  if (!contactId) return { ok: false, error: 'Suggestion needs a contact before approval.' }

  let error: { message: string } | null = null
  const target: InteractionSuggestionTarget = suggestion.target

  if (target === 'todo') {
    const res = await supabase.from('todos').insert({
      user_id: suggestion.user_id,
      text: textFrom(suggestion, payload, 'text', 'task', 'title'),
      date: str(payload, 'date') || str(payload, 'next_step_date') || today,
      contact_id: contactId,
    })
    error = res.error
  }

  if (target === 'next_step') {
    const interactionDate = str(payload, 'interaction_date') || today
    const res = await supabase.from('interactions').insert({
      user_id: suggestion.user_id,
      contact_id: contactId,
      type: payload.channel === 'linkedin' ? 'linkedin_msg' : 'whatsapp',
      direction: oneOf(payload.direction, ['inbound', 'outbound'] as const, 'outbound'),
      notes: suggestion.body || suggestion.title,
      interaction_date: interactionDate,
      next_step: textFrom(suggestion, payload, 'next_step', 'text', 'task'),
      next_step_date: str(payload, 'next_step_date') || str(payload, 'date'),
      next_step_owner: oneOf(payload.next_step_owner, ['me', 'them'] as const, 'me'),
      channel: oneOf(payload.channel, ['whatsapp', 'linkedin', 'email', 'call', 'in_person', 'other'] as const, 'other'),
    })
    error = res.error
  }

  if (target === 'key_date') {
    const res = await supabase.from('contact_key_dates').insert({
      user_id: suggestion.user_id,
      contact_id: contactId,
      event_type: str(payload, 'event_type') || 'important_date',
      subject: str(payload, 'subject') || str(payload, 'label') || textFrom(suggestion, payload, 'value', 'text', 'fact'),
      relation: str(payload, 'relation'),
      date_value: str(payload, 'date_value') || str(payload, 'date'),
      date_precision: str(payload, 'date_precision') || 'unknown',
      description: str(payload, 'description') || textFrom(suggestion, payload, 'value', 'text', 'fact'),
      source: 'chat_capture',
      source_interaction_date: str(payload, 'interaction_date') || str(payload, 'date') || null,
      source_external_id: suggestion.source_external_id,
    })
    error = res.error
  }

  if (target === 'contact_fact') {
    const importance = Math.min(3, Math.max(1, Math.round(num(payload, 'importance') ?? 2)))
    const res = await supabase.from('contact_facts').insert({
      user_id: suggestion.user_id,
      contact_id: contactId,
      category: oneOf(payload.category, FACT_CATEGORIES, 'other'),
      label: str(payload, 'label'),
      value: textFrom(suggestion, payload, 'value', 'text', 'fact', 'description'),
      importance,
      expires_at: str(payload, 'expires_at'),
      source: 'chat_capture',
    })
    error = res.error
  }

  if (target === 'value_log' || target === 'intro') {
    const res = await supabase.from('value_logs').insert({
      user_id: suggestion.user_id,
      outreach_log_id: contactId,
      type: oneOf(payload.type, VALUE_TYPES, target === 'intro' ? 'introduction' : 'other'),
      description: textFrom(suggestion, payload, 'description', 'value', 'text'),
      date: str(payload, 'date') || str(payload, 'interaction_date') || today,
      direction: oneOf(payload.direction, ['given', 'received'] as const, 'given'),
    }).select('id').single()
    error = res.error
    const valueLogId = res.data?.id ?? null
    if (!error && valueLogId && (target === 'intro' || hasIntroductionPayload(payload))) {
      const intro = await supabase.from('contact_introductions').upsert({
        user_id: suggestion.user_id,
        source_contact_id: contactId,
        connector_contact_id: sameLooseName(payload.connector_name, payload.source_contact_name) ? contactId : null,
        introduced_contact_id: null,
        introduced_to_contact_id: null,
        connector_name: compactName(payload.connector_name),
        introduced_person_name: compactName(payload.introduced_person_name),
        introduced_person_company: compactName(payload.introduced_person_company),
        introduced_to_name: compactName(payload.introduced_to_name),
        introduced_to_company: compactName(payload.introduced_to_company),
        relationship_context: compactName(payload.relationship_context) ?? textFrom(suggestion, payload, 'description', 'value', 'text'),
        status: compactName(payload.introduction_status) ?? 'made',
        direction: oneOf(payload.direction, ['given', 'received'] as const, 'given'),
        confidence: compactName(payload.confidence) ?? suggestion.confidence,
        source_channel: str(payload, 'source_channel') || str(payload, 'channel') || 'whatsapp',
        source_interaction_date: str(payload, 'date') || str(payload, 'interaction_date') || today,
        source_external_id: suggestion.source_external_id,
        source_value_log_id: valueLogId,
      }, { onConflict: 'user_id,source_external_id' })
      error = intro.error
    }
  }

  if (error) return { ok: false, error: error.message }
  const markError = await markSuggestion(suggestion, 'approved')
  return markError ? { ok: false, error: markError.message } : { ok: true }
}
