import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Milestone } from '@/types'

export function useMilestones(userId: string | undefined, goalId?: string) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMilestones = useCallback(async () => {
    if (!userId) return
    let query = supabase.from('milestones').select('*').eq('user_id', userId)
    if (goalId) query = query.eq('goal_id', goalId)
    const { data } = await query.order('target_date', { nullsFirst: false })
    setMilestones(data ?? [])
    setLoading(false)
  }, [userId, goalId])

  useEffect(() => { fetchMilestones() }, [fetchMilestones])

  const pending = milestones.filter(m => m.status !== 'COMPLETE')
  const done = milestones.filter(m => m.status === 'COMPLETE')

  const toggleMilestone = async (id: string) => {
    const m = milestones.find(m => m.id === id)
    if (!m) return
    const newStatus = m.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
    await supabase.from('milestones').update({ status: newStatus }).eq('id', id)
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m))
  }

  const addMilestone = async (title: string, goalId: string, dueDate?: string) => {
    if (!userId) return
    const { data } = await supabase
      .from('milestones')
      .insert({ text: title, goal_id: goalId, user_id: userId, target_date: dueDate ?? null, status: 'PENDING' })
      .select()
      .single()
    if (data) setMilestones(prev => [...prev, data])
    return data
  }

  const deleteMilestone = async (id: string) => {
    await supabase.from('milestones').delete().eq('id', id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  return { milestones, pending, done, loading, fetchMilestones, toggleMilestone, addMilestone, deleteMilestone }
}
