// abm.ts — Account-Based coverage engine, ported from abm-data.jsx.
// The COMPANY is the hub. Coverage/seats are DERIVED from real people, never stored.

import { COVERAGE_PLAYS, SEAT_LABELS, type CoveragePlay } from './crmConfig'

// The minimal person shape the coverage engine reasons over. Real Contacts are
// mapped onto this via personForCoverage().
export interface CoveragePerson {
  id: string
  name: string
  avatar: string | null
  role: string
  company: string | null
  rel: 'active' | 'warming' | 'cold' | 'dormant'
  last: string // days-since text: '5d' | '41d' | 'new' | '—'
  moved: { when: string } | null
  oppRole: { role: string } | null
}

// A company the engine can read (subset of the real Company record).
export interface CoverageCompany {
  name: string
  icp: string | null
}

export interface CoverageSeat {
  key: string
  label: string
  person: CoveragePerson | null
  state: 'talking' | 'mapped' | 'cold' | 'empty'
  primary: boolean
}

export interface Coverage {
  play: CoveragePlay
  seats: CoverageSeat[]
  others: CoveragePerson[]
  total: number
  filled: number
  talking: number
  mapped: number
  primaryTalking: boolean
  penetrated: boolean
  headline: string
  gaps: string[]
}

export function daysFromLast(last: string | null | undefined): number {
  if (!last || last === '—' || last === 'new') return last === 'new' ? 0 : 999
  const n = parseInt(last)
  return isNaN(n) ? 999 : n
}

// which buyer seat a person occupies — inferred from role text + opp role
export function seatForPerson(p: CoveragePerson): string {
  const r = (p.role || '').toLowerCase()
  if (/founder|ceo|co-founder|chief exec/.test(r)) return 'founder'
  if (/cmo|market|brand|growth|pmm|demand/.test(r)) return 'marketing'
  if (/product|cpo|design|ux/.test(r)) return 'product'
  if (/sales|cro|revenue|account exec|\bbd\b|biz dev|business dev/.test(r)) return 'sales'
  if (/recruit|talent|people ops|\bhr\b|head of people/.test(r)) return 'recruiter'
  if (/partner|operating partner|investor|advisor|connector/.test(r)) return 'warm'
  if (p.oppRole && p.oppRole.role === 'connector') return 'warm'
  return 'other'
}

// engagement state from relationship temperature + recent movement
export function engagementState(p: CoveragePerson | null | undefined): CoverageSeat['state'] {
  if (!p) return 'empty'
  const d = daysFromLast(p.last)
  const recentMove = p.moved && daysFromLast(p.moved.when) <= 4
  if (p.rel === 'active' || recentMove) return 'talking'
  if (p.rel === 'cold' || d >= 21) return 'cold'
  return 'mapped'
}

// Build the coverage object for a company (null for non-ICP accounts e.g. investors).
export function accountCoverage(company: CoverageCompany, people: CoveragePerson[]): Coverage | null {
  const play = company.icp ? COVERAGE_PLAYS[company.icp] : undefined
  if (!play) return null
  const inside = people.filter(p => p.company === company.name)
  const used = new Set<string>()
  const seats: CoverageSeat[] = play.seats.map(key => {
    const person = inside.find(p => !used.has(p.id) && seatForPerson(p) === key) || null
    if (person) used.add(person.id)
    return { key, label: SEAT_LABELS[key], person, state: engagementState(person), primary: key === play.primary }
  })
  const others = inside.filter(p => !used.has(p.id))
  const talking = inside.filter(p => engagementState(p) === 'talking').length
  const filled = seats.filter(s => s.person).length
  const primarySeat = seats.find(s => s.primary)
  const primaryTalking = !!(primarySeat && primarySeat.person && primarySeat.state === 'talking')

  let headline: string
  let penetrated: boolean
  if (company.icp === 'icp1') {
    penetrated = primaryTalking
    headline = primaryTalking ? 'Founder conversation live' : primarySeat?.person ? 'Founder mapped — not talking yet' : 'No founder thread yet'
  } else if (company.icp === 'icp3') {
    const warm = seats.find(s => s.key === 'warm')
    penetrated = !!(warm && warm.person && warm.state !== 'cold')
    headline = penetrated ? 'Warm path open' : 'No warm path in yet'
  } else {
    penetrated = talking >= 2
    headline = `${filled} of ${seats.length} seats · ${talking} talking`
  }
  const gaps = seats.filter(s => !s.person).map(s => s.label)
  return { play, seats, others, total: seats.length, filled, talking, mapped: inside.length, primaryTalking, penetrated, headline, gaps }
}

export function suggestedMotion(icp: string | null): string | null {
  return (icp && COVERAGE_PLAYS[icp]?.motion) || null
}

// ── Real-data adapters ───────────────────────────────────────────────────────
// Map "days since last interaction" → the kit's days-since text.
export function lastText(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return 'new'
  return `${d}d`
}

// Relationship temperature derived from connection strength + recency.
export function relFromContact(strength: number | null | undefined, lastIso: string | null | undefined): CoveragePerson['rel'] {
  const d = daysFromLast(lastText(lastIso))
  const s = strength ?? 0
  if (d >= 45 || s <= 0) return s <= 0 && d >= 60 ? 'dormant' : 'cold'
  if (d <= 7 && s >= 60) return 'active'
  if (d >= 21) return 'cold'
  return 'warming'
}

// Normalize the fields the coverage engine needs from a real contact-like record.
export function personForCoverage(c: {
  id: string
  name: string
  profile_photo_url?: string | null
  job_title?: string | null
  company?: string | null
  connection_strength?: number | null
  last_interaction_at?: string | null
}): CoveragePerson {
  return {
    id: c.id,
    name: c.name,
    avatar: c.profile_photo_url ?? null,
    role: c.job_title ?? '',
    company: c.company ?? null,
    rel: relFromContact(c.connection_strength, c.last_interaction_at),
    last: lastText(c.last_interaction_at),
    moved: null,
    oppRole: null,
  }
}
