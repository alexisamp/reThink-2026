import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_FUNNEL_CONFIG, UNDELETABLE_STAGES } from '@/lib/funnelDefaults'
import type { ContactFunnelConfig, ContactStatus, FunnelStageConfig } from '@/types'

export function useFunnelConfig(
  userId: string | undefined,
  profile: { contact_funnel_config?: ContactFunnelConfig | null } | null
) {
  const config: ContactFunnelConfig = (profile?.contact_funnel_config as ContactFunnelConfig | null) ?? DEFAULT_FUNNEL_CONFIG

  const getLabel = useCallback((status: ContactStatus): string => {
    return config[status]?.label ?? status
  }, [config])

  const getStageConfig = useCallback((status: ContactStatus): FunnelStageConfig => {
    return config[status] ?? DEFAULT_FUNNEL_CONFIG[status]
  }, [config])

  const updateStage = useCallback(async (
    status: ContactStatus,
    updates: Partial<FunnelStageConfig>
  ): Promise<void> => {
    if (!userId) return
    const updated: ContactFunnelConfig = {
      ...config,
      [status]: { ...config[status], ...updates },
    }
    await supabase
      .from('profiles')
      .update({ contact_funnel_config: updated })
      .eq('id', userId)
  }, [userId, config])

  const deleteStage = useCallback(async (
    status: ContactStatus,
    migrateTo: ContactStatus
  ): Promise<void> => {
    if (!userId) return
    if (UNDELETABLE_STAGES.includes(status)) throw new Error(`Cannot delete ${status}`)

    // 1. Migrate all contacts in this stage to the target stage
    await supabase
      .from('outreach_logs')
      .update({ status: migrateTo })
      .eq('user_id', userId)
      .eq('status', status)

    // 2. Remove from config
    const updated = { ...config }
    delete (updated as Record<string, unknown>)[status]
    await supabase
      .from('profiles')
      .update({ contact_funnel_config: updated })
      .eq('id', userId)
  }, [userId, config])

  const getActiveStages = useCallback((): ContactStatus[] => {
    return Object.keys(config) as ContactStatus[]
  }, [config])

  return { config, getLabel, getStageConfig, updateStage, deleteStage, getActiveStages }
}
