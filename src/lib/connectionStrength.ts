/**
 * Connection Strength helpers — client-side interpretation of the strength numeric
 * computed by the PG function `compute_connection_strength(contact_id)`.
 *
 * The raw numeric is a sum of time-decayed interaction weights. These helpers
 * bucket it into Jacob-friendly categories and surface the Tier × Strength
 * recommended-action matrix.
 *
 * Fixed thresholds (calibrated against current user data; may be tuned later
 * via percentile-based dynamic thresholds if ranges drift):
 *   very_weak  : < 0.5
 *   weak       : 0.5  –  2.0
 *   moderate   : 2.0  –  5.0
 *   strong     : 5.0  – 10.0
 *   very_strong: ≥ 10.0
 */
import type {
  ConnectionStrengthBucket,
  Contact,
  RelationshipDomain,
} from '@/types'

const BUCKET_THRESHOLDS: Array<[number, ConnectionStrengthBucket]> = [
  [10.0, 'very_strong'],
  [5.0, 'strong'],
  [2.0, 'moderate'],
  [0.5, 'weak'],
  [-Infinity, 'very_weak'],
]

export function strengthBucket(value: number): ConnectionStrengthBucket {
  const v = Number(value) || 0
  for (const [min, bucket] of BUCKET_THRESHOLDS) {
    if (v >= min) return bucket
  }
  return 'very_weak'
}

export function strengthLabel(bucket: ConnectionStrengthBucket): string {
  return {
    very_weak: 'Very Weak',
    weak: 'Weak',
    moderate: 'Moderate',
    strong: 'Strong',
    very_strong: 'Very Strong',
  }[bucket]
}

/**
 * Normalized 0..1 score for rendering progress bars.
 * 0.0 → very_weak floor, 1.0 → very_strong ceiling (capped at 20).
 */
export function strengthNormalized(value: number): number {
  const v = Math.max(0, Number(value) || 0)
  return Math.min(1, v / 20)
}

// ─── Tier × Strength recommended action matrix ──────────────────────────────

export type RecommendedAction =
  | 'act_now'        // Tier 1 with weak connection — critical
  | 'due'            // Tier 1-2 drifting
  | 'healthy'        // appropriate for tier
  | 'over_invest'    // Tier 3 with strong connection — likely mis-tiered (upgrade)
  | 'mis_tiered'     // Tier 3 with very strong — definitely upgrade
  | 'why_strong'     // Tier 3 with moderate — maybe a Tier 2 hiding
  | 'ok'             // passive, no action

export interface ActionAssessment {
  action: RecommendedAction
  label: string
  severity: 'critical' | 'warn' | 'info' | 'good'
  suggestion: string
}

/**
 * Jacob matrix — tier vs connection strength → what should I do?
 * Only applies when domain is 'professional' or 'mixed'. Personal returns 'ok'.
 */
export function strengthVsTier(contact: Pick<Contact, 'tier' | 'connection_strength' | 'relationship_domain'>): ActionAssessment {
  // Personal relationships: don't generate pro-network alerts
  if (contact.relationship_domain === 'personal') {
    return { action: 'ok', label: 'Personal', severity: 'info', suggestion: '' }
  }

  const bucket = strengthBucket(contact.connection_strength ?? 0)
  const tier = contact.tier ?? null

  if (tier === 1) {
    if (bucket === 'very_weak') {
      return {
        action: 'act_now',
        label: 'ACT NOW',
        severity: 'critical',
        suggestion: 'Tier 1 connection gone cold — reach out this week.',
      }
    }
    if (bucket === 'weak') {
      return {
        action: 'due',
        label: 'Due',
        severity: 'warn',
        suggestion: 'Tier 1 relationship cooling — plan a touch in the next few days.',
      }
    }
    return { action: 'healthy', label: 'Healthy', severity: 'good', suggestion: 'Tier 1 cadence looks good.' }
  }

  if (tier === 2) {
    if (bucket === 'very_weak') {
      return {
        action: 'due',
        label: 'Due',
        severity: 'warn',
        suggestion: 'Tier 2 going quiet — send a signal-check.',
      }
    }
    if (bucket === 'very_strong') {
      return {
        action: 'over_invest',
        label: 'Over-investing?',
        severity: 'info',
        suggestion: 'Very strong connection for a Tier 2 — consider promoting to Tier 1.',
      }
    }
    return { action: 'healthy', label: 'Healthy', severity: 'good', suggestion: 'Tier 2 cadence appropriate.' }
  }

  if (tier === 3) {
    if (bucket === 'very_strong') {
      return {
        action: 'mis_tiered',
        label: 'Mis-tiered',
        severity: 'warn',
        suggestion: 'This person behaves like Tier 1-2 traffic. Consider re-tiering.',
      }
    }
    if (bucket === 'strong' || bucket === 'moderate') {
      return {
        action: 'why_strong',
        label: 'Re-evaluate',
        severity: 'info',
        suggestion: 'More active than a typical Tier 3 — check if tier still fits.',
      }
    }
    return { action: 'ok', label: 'OK', severity: 'info', suggestion: '' }
  }

  // No tier assigned
  if (bucket === 'very_strong' || bucket === 'strong') {
    return {
      action: 'mis_tiered',
      label: 'Needs tier',
      severity: 'warn',
      suggestion: 'Active connection but untiered — classify via Airport Test.',
    }
  }
  return { action: 'ok', label: '—', severity: 'info', suggestion: '' }
}

// ─── Effective cadence helpers ──────────────────────────────────────────────

export function effectiveCadenceDays(
  contact: Pick<Contact, 'tier' | 'custom_cadence_days' | 'relationship_domain'>,
  tierCadenceConfig: Record<string, { days: number; label?: string }>,
): number | null {
  if (contact.custom_cadence_days != null) return contact.custom_cadence_days
  if (contact.relationship_domain === 'personal') return null
  if (contact.tier == null) return null
  return tierCadenceConfig[String(contact.tier)]?.days ?? null
}

export type CadenceStatus = 'on_track' | 'due_soon' | 'overdue' | 'none' | 'no_history'

export function cadenceStatus(
  lastInteractionAt: string | null,
  cadenceDays: number | null,
): { status: CadenceStatus; daysSince: number | null; daysUntilDue: number | null } {
  if (!cadenceDays) return { status: 'none', daysSince: null, daysUntilDue: null }
  if (!lastInteractionAt) return { status: 'no_history', daysSince: null, daysUntilDue: null }

  const daysSince = Math.floor(
    (Date.now() - new Date(lastInteractionAt).getTime()) / 86400000,
  )
  const daysUntilDue = cadenceDays - daysSince

  let status: CadenceStatus = 'on_track'
  if (daysUntilDue <= 0) status = 'overdue'
  else if (daysUntilDue <= Math.ceil(cadenceDays * 0.25)) status = 'due_soon'

  return { status, daysSince, daysUntilDue }
}
