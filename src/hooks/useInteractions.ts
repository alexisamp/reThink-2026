import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { computeHealthScore } from '@/lib/funnelDefaults'
import { pushInteractionNote, hasAttioKey } from '@/lib/attio'
import type { Interaction, Habit } from '@/types'

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function useInteractions(
  userId: string | undefined,
  habits: Habit[],
  upsertHabitCount: (habitId: string, count: number) => Promise<void>
) {
  const [interactionsByContact, setInteractionsByContact] = useState<Record<string, Interaction[]>>({})

  const today = localDate()

  const fetchInteractions = useCallback(async (contactId: string): Promise<Interaction[]> => {
    if (!userId) return []
    const { data } = await supabase
      .from('interactions')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .order('interaction_date', { ascending: false })
    const items = (data ?? []) as Interaction[]
    setInteractionsByContact(prev => ({ ...prev, [contactId]: items }))
    return items
  }, [userId])

  // Update the networking habit count: distinct contacts talked to today
  const updateNetworkingHabit = useCallback(async (allTodayInteractions: Interaction[]) => {
    const habit = habits.find(h => h.tracks_outreach === 'networking' && h.is_active)
    if (!habit) return
    const distinctContacts = new Set(
      allTodayInteractions
        .filter(i => i.interaction_date === today)
        .map(i => i.contact_id)
    ).size
    await upsertHabitCount(habit.id, distinctContacts)
  }, [habits, today, upsertHabitCount])

  const logInteraction = useCallback(async (
    contactId: string,
    type: Interaction['type'],
    direction: Interaction['direction'] = 'outbound',
    notes: string | null = null,
    interaction_date: string = today,
    attioRecordId?: string | null
  ): Promise<Interaction | null> => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('interactions')
      .insert({ user_id: userId, contact_id: contactId, type, direction, notes, interaction_date })
      .select().single()
    if (error || !data) return null
    const newItem = data as Interaction
    setInteractionsByContact(prev => ({
      ...prev,
      [contactId]: [newItem, ...(prev[contactId] ?? [])],
    }))

    // Push interaction as a Note to Attio (fire-and-forget)
    if (attioRecordId && hasAttioKey()) {
      pushInteractionNote(attioRecordId, { type, direction, notes, interaction_date })
    }

    // Update networking habit
    const allForContact = [newItem, ...(interactionsByContact[contactId] ?? [])]
    const allTodayFlat = [
      ...Object.entries(interactionsByContact).flatMap(([cid, ints]) =>
        cid === contactId ? [] : ints.filter(i => i.interaction_date === today)
      ),
      ...allForContact.filter(i => i.interaction_date === today),
    ]
    await updateNetworkingHabit(allTodayFlat)

    // Recompute and save health score for this contact
    const newScore = Math.min(10, Math.max(1, computeHealthScore(allForContact)))
    const now = new Date().toISOString()
    supabase.from('outreach_logs')
      .update({ health_score: newScore, last_interaction_at: now, updated_at: now })
      .eq('id', contactId)
      .then(() => {})

    return newItem
  }, [userId, today, interactionsByContact, updateNetworkingHabit])

  const deleteInteraction = useCallback(async (interaction: Interaction): Promise<void> => {
    if (!userId) return
    await supabase.from('interactions').delete().eq('id', interaction.id)
    const updated = (interactionsByContact[interaction.contact_id] ?? []).filter(i => i.id !== interaction.id)
    setInteractionsByContact(prev => ({ ...prev, [interaction.contact_id]: updated }))

    // Recount networking habit
    const allTodayFlat = [
      ...Object.entries({ ...interactionsByContact, [interaction.contact_id]: updated })
        .flatMap(([, ints]) => ints.filter(i => i.interaction_date === today)),
    ]
    await updateNetworkingHabit(allTodayFlat)

    // Recompute and save health score for this contact
    const newScore = Math.min(10, Math.max(1, computeHealthScore(updated)))
    supabase.from('outreach_logs')
      .update({ health_score: newScore, updated_at: new Date().toISOString() })
      .eq('id', interaction.contact_id)
      .then(() => {})
  }, [userId, today, interactionsByContact, updateNetworkingHabit])

  const getInteractions = useCallback((contactId: string): Interaction[] => {
    return interactionsByContact[contactId] ?? []
  }, [interactionsByContact])

  return { fetchInteractions, logInteraction, deleteInteraction, getInteractions, interactionsByContact }
}
