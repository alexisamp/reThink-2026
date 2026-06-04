/**
 * useRelationshipBrief — the single source of truth for "who should I talk to?".
 *
 * Combines signals that already exist but live scattered across the app:
 *   • overdue / upcoming next-steps (interactions.next_step)
 *   • cadence vs tier (connectionStrength.cadenceStatus + effectiveCadenceDays)
 *   • Tier × strength matrix (connectionStrength.strengthVsTier)
 *   • upcoming birthdays (outreach_logs.birthday, MM-DD)
 *   • value-ledger balance — who you owe (valueLedger.computeLedger)
 *
 * Consumed by the Today rail (NextSteps, limit 5) and the People → Focus tab (full list).
 * Also exposes Jacob's single KPI: conversations this week vs target.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  cadenceStatus,
  effectiveCadenceDays,
  strengthVsTier,
} from '@/lib/connectionStrength'
import { computeLedger } from '@/lib/valueLedger'
import { getSettings } from '@/lib/userSettings'
import type { Contact, ValueLog } from '@/types'

export type BriefReason =
  | 'overdue_next_step'
  | 'upcoming_next_step'
  | 'cadence_overdue'
  | 'cadence_due_soon'
  | 'birthday_upcoming'
  | 'value_owe'
  | 'mis_tiered'

export interface BriefItem {
  contactId: string
  name: string
  avatar: string | null
  company: string | null
  tier: 1 | 2 | 3 | null
  reasons: BriefReason[]
  primaryReason: BriefReason
  urgencyScore: number
  nextStep: string | null
  nextStepDate: string | null
  nextStepOverdue: boolean
  daysSinceContact: number | null
  birthdayInDays: number | null
  ledgerBalance: number | null
  /** Short human label for the primary reason — drives the chip text. */
  reasonLabel: string
  /** Suggested quick action verb. */
  quickAction: string
}

export interface RelationshipBriefResult {
  items: BriefItem[]
  loading: boolean
  convThisWeek: number
  convTarget: number
  oweCount: number
  reload: () => void
}

interface Opts {
  limit?: number
  /** End of the upcoming-next-step window (inclusive). Defaults to today + 6d. */
  weekEnd?: string
  today?: string
}

const DEFAULT_CADENCE: Record<string, { days: number }> = {
  '1': { days: 14 },
  '2': { days: 30 },
  '3': { days: 90 },
}

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days until the next occurrence of a MM-DD (or YYYY-MM-DD) birthday. */
function birthdayDaysUntil(raw: string | null | undefined): number | null {
  if (!raw) return null
  const m = raw.match(/(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), month - 1, day)
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

const REASON_LABEL: Record<BriefReason, string> = {
  overdue_next_step: 'Next step overdue',
  upcoming_next_step: 'Next step due',
  cadence_overdue: 'Gone cold',
  cadence_due_soon: 'Cooling',
  birthday_upcoming: 'Birthday soon',
  value_owe: 'You owe them',
  mis_tiered: 'Re-tier',
}

const REASON_ACTION: Record<BriefReason, string> = {
  overdue_next_step: 'Follow up',
  upcoming_next_step: 'Follow up',
  cadence_overdue: 'Reach out',
  cadence_due_soon: 'Reach out',
  birthday_upcoming: 'Wish happy birthday',
  value_owe: 'Give value',
  mis_tiered: 'Re-tier',
}

// Priority order when choosing the primary reason (first match wins).
const REASON_PRIORITY: BriefReason[] = [
  'overdue_next_step',
  'cadence_overdue',
  'birthday_upcoming',
  'upcoming_next_step',
  'value_owe',
  'cadence_due_soon',
  'mis_tiered',
]

type ContactRow = Pick<
  Contact,
  | 'id' | 'name' | 'profile_photo_url' | 'company' | 'tier' | 'relationship_domain'
  | 'connection_strength' | 'custom_cadence_days' | 'last_interaction_at' | 'birthday'
>

export function useRelationshipBrief(
  userId: string | null,
  opts: Opts = {},
): RelationshipBriefResult {
  const { limit, weekEnd, today: todayOpt } = opts
  const [items, setItems] = useState<BriefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [convThisWeek, setConvThisWeek] = useState(0)
  const [oweCount, setOweCount] = useState(0)

  const convTarget = getSettings().crmWeeklyConvTarget

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const today = todayOpt ?? localDate()
    const upcomingEnd = weekEnd ?? localDate(new Date(Date.now() + 6 * 86400000))
    const weekAgo = localDate(new Date(Date.now() - 6 * 86400000))

    const [
      { data: profile },
      { data: nextStepRows },
      { data: tierContacts },
      { data: valueRows },
      { data: convRows },
    ] = await Promise.all([
      supabase.from('profiles').select('tier_cadence_config').eq('id', userId).maybeSingle(),
      supabase
        .from('interactions')
        .select('contact_id, next_step, next_step_date')
        .eq('user_id', userId)
        .eq('next_step_owner', 'me')
        .not('next_step', 'is', null)
        .not('next_step_date', 'is', null)
        .lte('next_step_date', upcomingEnd)
        .order('next_step_date', { ascending: true }),
      supabase
        .from('outreach_logs')
        .select('id, name, profile_photo_url, company, tier, relationship_domain, connection_strength, custom_cadence_days, last_interaction_at, birthday')
        .eq('user_id', userId)
        .in('tier', [1, 2]),
      supabase
        .from('value_logs')
        .select('outreach_log_id, type, direction')
        .eq('user_id', userId),
      supabase
        .from('interactions')
        .select('contact_id')
        .eq('user_id', userId)
        .gte('interaction_date', weekAgo),
    ])

    const cadenceCfg = (profile?.tier_cadence_config ?? DEFAULT_CADENCE) as Record<string, { days: number; label?: string }>

    // Candidate contacts: tier 1/2 + anyone with a pending next-step (fetch the missing ones).
    const byId = new Map<string, ContactRow>()
    ;(tierContacts ?? []).forEach(c => byId.set(c.id, c as ContactRow))
    const nsContactIds = [...new Set((nextStepRows ?? []).map(r => r.contact_id).filter(Boolean))] as string[]
    const missing = nsContactIds.filter(cid => !byId.has(cid))
    if (missing.length) {
      const { data: extra } = await supabase
        .from('outreach_logs')
        .select('id, name, profile_photo_url, company, tier, relationship_domain, connection_strength, custom_cadence_days, last_interaction_at, birthday')
        .in('id', missing)
      ;(extra ?? []).forEach(c => byId.set(c.id, c as ContactRow))
    }

    // Soonest pending next-step per contact.
    const nextStepByContact = new Map<string, { next_step: string; next_step_date: string }>()
    ;(nextStepRows ?? []).forEach(r => {
      if (!r.contact_id || nextStepByContact.has(r.contact_id)) return
      nextStepByContact.set(r.contact_id, {
        next_step: r.next_step as string,
        next_step_date: r.next_step_date as string,
      })
    })

    // Value-ledger balance per contact.
    const logsByContact = new Map<string, ValueLog[]>()
    ;(valueRows ?? []).forEach(r => {
      const cid = (r as { outreach_log_id: string }).outreach_log_id
      const arr = logsByContact.get(cid) ?? []
      arr.push(r as ValueLog)
      logsByContact.set(cid, arr)
    })

    const out: BriefItem[] = []
    let owe = 0

    for (const c of byId.values()) {
      const reasons: BriefReason[] = []
      let score = 0

      // Next steps
      const ns = nextStepByContact.get(c.id)
      let nextStepOverdue = false
      if (ns) {
        if (ns.next_step_date <= today) {
          reasons.push('overdue_next_step')
          score += 40
          nextStepOverdue = true
        } else {
          reasons.push('upcoming_next_step')
          score += 20
        }
      }

      // Cadence
      const cadDays = effectiveCadenceDays(c, cadenceCfg)
      const cad = cadenceStatus(c.last_interaction_at ?? null, cadDays)
      if (cad.status === 'overdue' || cad.status === 'no_history') {
        reasons.push('cadence_overdue')
        score += 30 + (c.tier === 1 ? 5 : 0)
      } else if (cad.status === 'due_soon') {
        reasons.push('cadence_due_soon')
        score += 15
      }

      // Birthday
      const bday = birthdayDaysUntil(c.birthday)
      if (bday != null && bday <= 30) {
        reasons.push('birthday_upcoming')
        score += bday <= 7 ? 25 : 10
      }

      // Value ledger
      const cLogs = logsByContact.get(c.id)
      const ledgerBalance = cLogs && cLogs.length ? computeLedger(cLogs).balance : null
      if (ledgerBalance != null && ledgerBalance <= -3) {
        reasons.push('value_owe')
        score += 15
        owe += 1
      } else if (ledgerBalance != null && ledgerBalance < 0) {
        owe += 1
      }

      // Mis-tier signal
      const assess = strengthVsTier(c)
      if (assess.action === 'mis_tiered') {
        reasons.push('mis_tiered')
        score += 5
      }

      if (reasons.length === 0 || score <= 0) continue

      const primaryReason = REASON_PRIORITY.find(r => reasons.includes(r)) ?? reasons[0]
      out.push({
        contactId: c.id,
        name: c.name,
        avatar: c.profile_photo_url ?? null,
        company: c.company ?? null,
        tier: (c.tier ?? null) as 1 | 2 | 3 | null,
        reasons,
        primaryReason,
        urgencyScore: score,
        nextStep: ns?.next_step ?? null,
        nextStepDate: ns?.next_step_date ?? null,
        nextStepOverdue,
        daysSinceContact: cad.daysSince,
        birthdayInDays: bday,
        ledgerBalance,
        reasonLabel: REASON_LABEL[primaryReason],
        quickAction: REASON_ACTION[primaryReason],
      })
    }

    out.sort((a, b) => b.urgencyScore - a.urgencyScore)

    // Conversations this week — distinct contacts touched in the last 7 days.
    const distinctConv = new Set((convRows ?? []).map(r => r.contact_id).filter(Boolean))

    setItems(typeof limit === 'number' ? out.slice(0, limit) : out)
    setConvThisWeek(distinctConv.size)
    setOweCount(owe)
    setLoading(false)
  }, [userId, limit, weekEnd, todayOpt])

  useEffect(() => { load() }, [load])

  return { items, loading, convThisWeek, convTarget, oweCount, reload: load }
}
