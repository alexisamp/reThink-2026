import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ContactFact, ContactFactCategory, ContactFactSource } from '@/types'

export const FACT_CATEGORIES: Array<{
  key: ContactFactCategory
  label: string
  emoji: string
  hint: string
}> = [
  { key: 'family',       label: 'Family',        emoji: '👨‍👩‍👧', hint: 'Spouse, kids, parents, siblings.' },
  { key: 'career_intel', label: 'Career',        emoji: '💼', hint: 'Goals, what they want next, frictions.' },
  { key: 'compensation', label: 'Compensation',  emoji: '💰', hint: 'Comp, equity, package details.' },
  { key: 'obsession',    label: 'Obsession',     emoji: '🔥', hint: 'What lights them up — hobby, sport, topic.' },
  { key: 'hot_button',   label: 'Hot button',    emoji: '⚡', hint: 'Topics they love to talk about.' },
  { key: 'life_phase',   label: 'Life phase',    emoji: '🌊', hint: 'Baby coming, moving, sabbatical, divorce.' },
  { key: 'pet_peeve',    label: 'Pet peeve',     emoji: '🚫', hint: 'Things they hate — avoid!' },
  { key: 'origin_story', label: 'Origin',        emoji: '🎬', hint: 'Where you met, how you connected.' },
  { key: 'health',       label: 'Health',        emoji: '🏥', hint: 'Relevant health context, diet, allergies.' },
  { key: 'preference',   label: 'Preference',    emoji: '✨', hint: 'Favorite food, drink, venue, style.' },
  { key: 'other',        label: 'Other',         emoji: '📝', hint: 'Anything else.' },
]

export function factEmoji(category: ContactFactCategory): string {
  return FACT_CATEGORIES.find(c => c.key === category)?.emoji ?? '📝'
}

export function factCategoryLabel(category: ContactFactCategory): string {
  return FACT_CATEGORIES.find(c => c.key === category)?.label ?? category
}

export function useContactFacts(userId: string | null | undefined, contactId: string | null | undefined) {
  const [facts, setFacts] = useState<ContactFact[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId || !contactId) {
      setFacts([])
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('contact_facts')
      .select('*')
      .eq('contact_id', contactId)
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
    setFacts((data ?? []) as ContactFact[])
    setLoading(false)
  }, [userId, contactId])

  useEffect(() => { load() }, [load])

  const addFact = useCallback(async (input: {
    category: ContactFactCategory
    value: string
    label?: string
    importance?: 1 | 2 | 3
    expires_at?: string | null
    source?: ContactFactSource
  }): Promise<ContactFact | null> => {
    if (!userId || !contactId) return null
    const { data, error } = await supabase
      .from('contact_facts')
      .insert({
        contact_id: contactId,
        user_id: userId,
        category: input.category,
        label: input.label ?? null,
        value: input.value,
        importance: input.importance ?? 2,
        expires_at: input.expires_at ?? null,
        source: input.source ?? 'manual',
      })
      .select()
      .single()
    if (!error) await load()
    return error ? null : (data as ContactFact)
  }, [userId, contactId, load])

  const updateFact = useCallback(async (id: string, patch: Partial<ContactFact>) => {
    const cleanPatch: Record<string, unknown> = {}
    for (const k of ['category', 'label', 'value', 'importance', 'expires_at'] as const) {
      if (k in patch) cleanPatch[k] = patch[k]
    }
    const { error } = await supabase.from('contact_facts').update(cleanPatch).eq('id', id)
    if (!error) await load()
  }, [load])

  const deleteFact = useCallback(async (id: string) => {
    await supabase.from('contact_facts').delete().eq('id', id)
    await load()
  }, [load])

  return { facts, loading, addFact, updateFact, deleteFact, reload: load }
}
