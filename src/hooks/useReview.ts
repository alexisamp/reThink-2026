import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Review } from '@/types'

export function useReview(userId: string | undefined) {
  const [review, setReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const fetchReview = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle()
    setReview(data)
    setLoading(false)
  }, [userId, today])

  useEffect(() => { fetchReview() }, [fetchReview])

  const upsertReview = async (updates: Partial<Omit<Review, 'id' | 'user_id' | 'date' | 'created_at'>>) => {
    if (!userId) return
    const payload = { ...updates, user_id: userId, date: today, id: review?.id }
    const { data } = await supabase
      .from('reviews')
      .upsert(payload, { onConflict: 'user_id,date' })
      .select()
      .single()
    if (data) setReview(data)
    return data
  }

  return { review, loading, upsertReview, fetchReview }
}
