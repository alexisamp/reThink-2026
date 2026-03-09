import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MonthlyPlan, MonthlyKpiEntry, LeadingIndicator } from '@/types'

export function useMonthly(userId: string | undefined, goalId?: string) {
  const [plans, setPlans] = useState<MonthlyPlan[]>([])
  const [kpiEntries, setKpiEntries] = useState<MonthlyKpiEntry[]>([])
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [loading, setLoading] = useState(true)

  const year = new Date().getFullYear()

  const fetchData = useCallback(async () => {
    if (!userId) return

    let planQuery = supabase.from('monthly_plans').select('*').eq('user_id', userId).eq('year', year)
    if (goalId) planQuery = planQuery.eq('goal_id', goalId)
    const { data: planData } = await planQuery
    setPlans(planData ?? [])

    if (goalId) {
      const { data: indData } = await supabase
        .from('leading_indicators')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .order('created_at')
      setIndicators(indData ?? [])

      if (indData?.length) {
        const indIds = indData.map(i => i.id)
        const { data: kpiData } = await supabase
          .from('monthly_kpi_entries')
          .select('*')
          .eq('user_id', userId)
          .eq('year', year)
          .in('leading_indicator_id', indIds)
        setKpiEntries(kpiData ?? [])
      }
    }
    setLoading(false)
  }, [userId, goalId, year])

  useEffect(() => { fetchData() }, [fetchData])

  const getPlan = (gId: string, month: number) =>
    plans.find(p => p.goal_id === gId && p.month === month) ?? null

  const upsertPlan = async (gId: string, month: number, updates: Partial<Pick<MonthlyPlan, 'focus' | 'reflection'>>) => {
    if (!userId) return
    const existing = plans.find(p => p.goal_id === gId && p.month === month)
    const { data } = await supabase
      .from('monthly_plans')
      .upsert({ id: existing?.id, user_id: userId, goal_id: gId, year, month, ...updates })
      .select()
      .single()
    if (data) setPlans(prev => {
      const idx = prev.findIndex(p => p.goal_id === gId && p.month === month)
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
      return [...prev, data]
    })
    return data
  }

  const getKpi = (indicatorId: string, month: number) =>
    kpiEntries.find(k => k.leading_indicator_id === indicatorId && k.month === month)?.actual_value ?? null

  const upsertKpi = async (indicatorId: string, month: number, value: number | null) => {
    if (!userId) return
    const existing = kpiEntries.find(k => k.leading_indicator_id === indicatorId && k.month === month)
    const { data } = await supabase
      .from('monthly_kpi_entries')
      .upsert({ id: existing?.id, user_id: userId, leading_indicator_id: indicatorId, year, month, actual_value: value })
      .select()
      .single()
    if (data) setKpiEntries(prev => {
      const idx = prev.findIndex(k => k.leading_indicator_id === indicatorId && k.month === month)
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
      return [...prev, data]
    })
  }

  const upsertIndicator = async (ind: Partial<LeadingIndicator> & { goal_id: string }) => {
    if (!userId) return
    const { data } = await supabase
      .from('leading_indicators')
      .upsert({ ...ind, user_id: userId })
      .select()
      .single()
    if (data) setIndicators(prev => {
      const idx = prev.findIndex(i => i.id === data.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
      return [...prev, data]
    })
    return data
  }

  return { plans, kpiEntries, indicators, loading, getPlan, upsertPlan, getKpi, upsertKpi, upsertIndicator, fetchData }
}
