import type { OpportunityStage } from '@/types'
import { OPPORTUNITY_STAGE_OPTIONS, opportunityStageLabel } from '@/lib/opportunityStages'

const STAGE_CLASS: Record<OpportunityStage, string> = {
  exploring: 'exploring',
  applied: 'applied',
  abm_strategy: 'abm_strategy',
  interviews: 'interviews',
  active: 'interviews',
  negotiating: 'negotiating',
  won: 'won',
  closed: 'closed',
  lost: 'closed',
}

export default function OpportunityStageChip({ stage }: { stage?: OpportunityStage | string | null }) {
  const key = STAGE_CLASS[stage as OpportunityStage] ?? 'exploring'
  return (
    <span className={`opp-stage-chip ${key}`}>
      <span className="opp-stage-dot" />
      {opportunityStageLabel(stage)}
    </span>
  )
}

export function OpportunityStageProgress({ stage }: { stage?: OpportunityStage | string | null }) {
  const normalizedStage = stage === 'active' ? 'interviews' : stage === 'lost' ? 'closed' : stage
  const activeIndex = Math.max(0, OPPORTUNITY_STAGE_OPTIONS.indexOf(normalizedStage as OpportunityStage))

  return (
    <span className="opp-stage-progress">
      <span className="opp-stage-progress-label">{opportunityStageLabel(stage)}</span>
      <span className="opp-stage-bars" aria-hidden="true">
        {OPPORTUNITY_STAGE_OPTIONS.map((value, index) => (
          <span
            key={value}
            className={`opp-stage-bar ${STAGE_CLASS[value]}${index <= activeIndex ? ' active' : ''}`}
            data-label={opportunityStageLabel(value)}
          />
        ))}
      </span>
    </span>
  )
}
