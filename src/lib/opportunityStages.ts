import type { OpportunityStage } from '@/types'

export const OPPORTUNITY_STAGE_OPTIONS: OpportunityStage[] = [
  'exploring',
  'applied',
  'abm_strategy',
  'interviews',
  'negotiating',
  'won',
  'closed',
]

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  exploring: 'Exploring',
  applied: 'Applied',
  abm_strategy: 'ABM Strategy',
  interviews: 'Interviews',
  negotiating: 'Negotiating',
  won: 'Won',
  closed: 'Closed',
  active: 'Interviews',
  lost: 'Closed',
}

export const ACTIVE_OPPORTUNITY_STAGES: OpportunityStage[] = [
  'exploring',
  'applied',
  'abm_strategy',
  'interviews',
  'negotiating',
  'active',
]

export const OPPORTUNITY_STAGE_TO_CHIP: Record<OpportunityStage, string> = {
  exploring: 'prospect',
  applied: 'qualified',
  abm_strategy: 'qualified',
  interviews: 'closing',
  negotiating: 'closing',
  won: 'won',
  closed: 'prospect',
  active: 'closing',
  lost: 'prospect',
}

export const OPPORTUNITY_STAGE_CLOSER: Record<OpportunityStage, number> = {
  exploring: 2,
  applied: 3,
  abm_strategy: 3,
  interviews: 4,
  negotiating: 5,
  won: 6,
  closed: 1,
  active: 4,
  lost: 1,
}

export function opportunityStageLabel(stage?: OpportunityStage | string | null) {
  return stage ? OPPORTUNITY_STAGE_LABELS[stage as OpportunityStage] ?? stage : 'Exploring'
}

export function isActiveOpportunityStage(stage?: OpportunityStage | string | null): stage is OpportunityStage {
  return ACTIVE_OPPORTUNITY_STAGES.includes(stage as OpportunityStage)
}
