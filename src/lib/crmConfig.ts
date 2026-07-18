// crmConfig.ts — ported verbatim from the design handoff (crm-data.jsx + abm-data.jsx).
// Config objects map an enum key → display metadata. Colors are CSS var references
// defined in colors_and_type.css / design-tokens.css. Enums are closed in count,
// open in label.

export interface CfgEntry {
  label?: string
  color?: string
  dot?: string
  icon?: string
  emoji?: string
  name?: string
  bg?: string
  fg?: string
  dots?: number
  tag?: string
  kind?: 'outcome' | 'inner'
  short?: string
}

export const TIER_CFG: Record<string, CfgEntry> = {
  1: { label: 'T1', icon: 'paper-plane-tilt', name: 'Airport', color: 'var(--tier-1)' },
  2: { label: 'T2', icon: 'handshake', name: 'Shared', color: 'var(--tier-2)' },
  3: { label: 'T3', icon: 'git-branch', name: 'Loose', color: 'var(--tier-3)' },
}

export const STRENGTH_CFG: Record<string, CfgEntry> = {
  none: { label: 'no contact', dots: 0, color: 'color-mix(in oklab, var(--shuttle) 35%, transparent)' },
  weak: { label: 'weak', dots: 1, color: 'var(--tier-1)' },
  fading: { label: 'fading', dots: 2, color: 'var(--tier-2)' },
  steady: { label: 'steady', dots: 3, color: 'var(--moss)' },
  strong: { label: 'strong', dots: 4, color: 'var(--burnham)' },
}

export const REL_CFG: Record<string, CfgEntry> = {
  active: { label: 'active', color: 'var(--moss)', dot: 'var(--moss)' },
  warming: { label: 'warming', color: 'var(--tier-2)', dot: 'var(--tier-2)' },
  cold: { label: 'cold', color: 'var(--tier-1)', dot: 'var(--tier-1)' },
  dormant: { label: 'dormant', color: 'var(--fg-3)', dot: 'color-mix(in oklab, var(--shuttle) 35%, transparent)' },
}

export const STATUS_CFG: Record<string, CfgEntry> = {
  prospect: { bg: 'color-mix(in oklab, var(--mercury) 50%, transparent)', fg: 'color-mix(in oklab, var(--shuttle) 75%, transparent)' },
  intro: { bg: 'var(--gossip)', fg: 'var(--burnham)' },
  connected: { bg: 'color-mix(in oklab, var(--pastel) 45%, transparent)', fg: 'var(--burnham)' },
  engaged: { bg: 'color-mix(in oklab, var(--pastel) 60%, transparent)', fg: 'var(--burnham)' },
  nurturing: { bg: 'color-mix(in oklab, var(--pastel) 75%, transparent)', fg: 'var(--burnham)' },
  dormant: { bg: 'color-mix(in oklab, var(--mercury) 70%, transparent)', fg: 'color-mix(in oklab, var(--shuttle) 55%, transparent)' },
}

export const STAGE_CFG: Record<string, CfgEntry> = {
  prospect: { label: 'prospect', color: 'var(--shuttle)' },
  qualified: { label: 'qualified', color: 'var(--info)' },
  proposal: { label: 'proposal', color: 'var(--tier-2)' },
  closing: { label: 'closing', color: 'var(--moss)' },
  won: { label: 'won', color: 'var(--burnham)' },
}

export const DOMAIN_CFG: Record<string, CfgEntry> = {
  pro: { icon: 'briefcase', name: 'professional' },
  personal: { icon: 'users', name: 'personal' },
  mixed: { icon: 'arrows-left-right', name: 'mixed' },
}

export const LIST_CFG: Record<string, CfgEntry> = {
  job: { label: 'Job Opportunities', short: 'Job Opps', icon: 'briefcase', kind: 'outcome' },
  consult: { label: 'Consultancy / Fractional', short: 'Consultancy', icon: 'handshake', kind: 'outcome' },
  mentor: { label: 'Mentorship', short: 'Mentorship', icon: 'graduation-cap', kind: 'outcome' },
  board: { label: 'Personal Board', short: 'Board', icon: 'users-three', kind: 'inner' },
  family: { label: 'Family & Friends', short: 'Family', icon: 'heart', kind: 'inner' },
}
export const LIST_ORDER = ['job', 'consult', 'mentor', 'board', 'family']

export const REASON_CFG: Record<string, CfgEntry> = {
  overdue: { label: 'next step overdue', icon: 'clock-countdown', color: 'var(--tier-1)' },
  cold: { label: 'T1 going cold', icon: 'snowflake', color: 'var(--tier-2)' },
  'no-followup': { label: 'no follow-up', icon: 'arrow-u-up-left', color: 'var(--shuttle)' },
  birthday: { label: 'milestone', icon: 'gift', color: 'var(--moss)' },
  'opp-stale': { label: 'opp needs stakeholder', icon: 'target', color: 'var(--info)' },
  'owe-value': { label: 'you owe value', icon: 'hand-heart', color: 'var(--tier-1)' },
  'have-credit': { label: 'credit to spend', icon: 'sparkle', color: 'var(--burnham)' },
}

export const CHANNEL_CFG: Record<string, CfgEntry> = {
  gmail: { icon: 'envelope-simple', label: 'Gmail' },
  linkedin: { icon: 'linkedin-logo', label: 'LinkedIn' },
  whatsapp: { icon: 'whatsapp-logo', label: 'WhatsApp' },
  phone: { icon: 'phone', label: 'Phone' },
}

export const SOURCE_CFG: Record<string, CfgEntry> = {
  manual: { icon: 'pencil-simple', label: 'Manual' },
  gmail: { icon: 'envelope-simple', label: 'Gmail' },
  whatsapp: { icon: 'whatsapp-logo', label: 'WhatsApp' },
  linkedin: { icon: 'linkedin-logo', label: 'LinkedIn' },
  granola: { icon: 'microphone', label: 'Granola' },
  enrichment: { icon: 'sparkle', label: 'Enrichment' },
  todo: { icon: 'check-square', label: 'Todo' },
  file: { icon: 'paperclip', label: 'File' },
}

// ── ABM layer ──────────────────────────────────────────────────────────────
export const ICP_CFG: Record<string, CfgEntry> = {
  icp1: { label: 'ICP 1', tag: 'AI-native · Seed–Series A', color: '#266DF0' },
  icp2: { label: 'ICP 2', tag: 'AI / SaaS · Series B+', color: '#538BF3' },
  icp3: { label: 'ICP 3', tag: 'Tech B2B / network', color: '#6F7988' },
}

export const ACCOUNT_SOURCE_CFG: Record<string, CfgEntry> = {
  jackjill: { label: 'Jack & Jill', icon: 'magnet' },
  standout: { label: 'Standout', icon: 'star' },
  exitfive: { label: 'Exit Five', icon: 'users-three' },
  intro: { label: 'Warm intro', icon: 'arrows-merge' },
  event: { label: 'Event', icon: 'confetti' },
  inbound: { label: 'Inbound', icon: 'tray-arrow-down' },
}

export const MOTION_CFG: Record<string, CfgEntry> = {
  founder: { label: 'Founder Diagnostic', icon: 'compass-tool' },
  abm: { label: 'ABM Opportunity', icon: 'crosshair' },
  trust: { label: 'Trust Network', icon: 'handshake' },
  app2account: { label: 'Application → Account', icon: 'paper-plane-tilt' },
}

export const ACCOUNT_STAGE_CFG: Record<string, CfgEntry> = {
  target: { label: 'Target', color: 'var(--shuttle)' },
  working: { label: 'Working', color: 'var(--info)' },
  conversation: { label: 'Conversation', color: 'var(--tier-2)' },
  opportunity: { label: 'Opportunity', color: 'var(--moss)' },
  nurture: { label: 'Nurture', color: 'color-mix(in oklab, var(--shuttle) 60%, transparent)' },
}
export const ACCOUNT_STAGE_ORDER = ['target', 'working', 'conversation', 'opportunity', 'nurture']

export const SEAT_LABELS: Record<string, string> = {
  founder: 'Founder / CEO',
  marketing: 'Marketing lead',
  product: 'Product',
  sales: 'Sales / CRO',
  recruiter: 'Recruiter',
  warm: 'Warm path',
  hiring: 'Hiring manager',
}

export interface CoveragePlay {
  motion: string
  name: string
  seats: string[]
  primary: string
  readout: string
}
export const COVERAGE_PLAYS: Record<string, CoveragePlay> = {
  icp1: { motion: 'founder', name: 'Founder-led', seats: ['founder', 'warm'], primary: 'founder', readout: 'One real founder conversation is the whole game — don’t chase a committee here.' },
  icp2: { motion: 'abm', name: 'Full ABM', seats: ['founder', 'marketing', 'product', 'sales', 'recruiter', 'warm'], primary: 'marketing', readout: 'Multi-threaded by design — penetration is the metric.' },
  icp3: { motion: 'trust', name: 'Warm network', seats: ['warm', 'hiring'], primary: 'warm', readout: 'Lead with the warm path, then the hiring manager. No cold committee.' },
}

export const SEAT_STATE_CFG: Record<string, CfgEntry> = {
  talking: { label: 'talking', color: 'var(--moss)', dot: 'var(--moss)' },
  mapped: { label: 'mapped', color: 'var(--tier-2)', dot: 'var(--tier-2)' },
  cold: { label: 'cold', color: 'var(--tier-1)', dot: 'var(--tier-1)' },
  empty: { label: 'open', color: 'var(--fg-3)', dot: 'color-mix(in oklab, var(--shuttle) 30%, transparent)' },
}
