import type { ContactFunnelConfig, ContactStatus } from '@/types'

export const FUNNEL_STAGE_ORDER: ContactStatus[] = [
  'PROSPECT', 'INTRO', 'CONNECTED', 'RECONNECT', 'ENGAGED', 'NURTURING', 'DORMANT',
]

export const UNDELETABLE_STAGES: ContactStatus[] = ['PROSPECT', 'DORMANT']

export const DEFAULT_FUNNEL_CONFIG: ContactFunnelConfig = {
  PROSPECT: {
    label: 'Prospect',
    description: "Identified as someone worth knowing — haven't reached out yet",
    entry_criteria: 'Found on LinkedIn, referred by someone, or met briefly. Saved for future outreach.',
    exit_criteria: 'You send the first message → move to Intro',
  },
  INTRO: {
    label: 'Intro',
    description: 'Made first contact — waiting for response or very early exchange',
    entry_criteria: 'Sent a LinkedIn DM, email, or cold message. First touch made.',
    exit_criteria: 'They respond or you have a real back-and-forth → move to Connected',
  },
  CONNECTED: {
    label: 'Connected',
    description: 'Mutual exchange established — building the new relationship',
    entry_criteria: 'They responded. You have had at least one real exchange (2+ messages back and forth).',
    exit_criteria: 'You have a real conversation (call, coffee, meeting) → move to Engaged',
  },
  RECONNECT: {
    label: 'Reconnect',
    description: 'Known from before — relationship lapsed, actively trying to re-engage',
    entry_criteria: 'Someone you already knew (colleague, friend, mentor) added after a long silence. OR a Dormant contact you decided to re-activate.',
    exit_criteria: 'You have a real conversation with them again → move to Engaged',
  },
  ENGAGED: {
    label: 'Engaged',
    description: 'Had real conversations — relationship actively growing',
    entry_criteria: 'Had at least one substantive conversation: call, virtual coffee, in-person meeting, or a real collaborative exchange.',
    exit_criteria: 'Relationship feels established over 30+ days with multiple touchpoints → move to Nurturing',
  },
  NURTURING: {
    label: 'Nurturing',
    description: 'Established relationship — maintaining it with periodic touchpoints',
    entry_criteria: 'Relationship is solid. You know each other well. You maintain it intentionally.',
    exit_criteria: 'No contact for 90+ days → auto-moved to Dormant',
  },
  DORMANT: {
    label: 'Dormant',
    description: 'No recent activity — went quiet (90 days+ or manually flagged)',
    entry_criteria: 'Automatic after 90 days with no logged interaction. Or manually moved.',
    exit_criteria: 'You decide to re-engage → manually move to Reconnect',
  },
}

export const INTERACTION_POINTS: Record<string, number> = {
  in_person: 5,
  virtual_coffee: 4,
  call: 3,
  email: 2,
  linkedin_msg: 1,
  whatsapp: 1,
}

export function decayFactor(daysAgo: number): number {
  if (daysAgo <= 7)   return 1.0
  if (daysAgo <= 30)  return 0.7
  if (daysAgo <= 90)  return 0.4
  if (daysAgo <= 365) return 0.1
  return 0
}

export function daysSince(dateStr: string): number {
  const then = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

export function computeHealthScore(interactions: Array<{ type: string; interaction_date: string }>): number {
  const raw = interactions.reduce((sum, i) => {
    const pts = INTERACTION_POINTS[i.type] ?? 1
    const decay = decayFactor(daysSince(i.interaction_date))
    return sum + pts * decay
  }, 0)
  return Math.min(10, Math.max(1, Math.round(raw)))
}

export const CATEGORY_LABELS: Record<string, string> = {
  business_dev: 'Business Dev',
  partner:      'Partner',
  client:       'Client',
  mentor:       'Mentor',
  job_us:       'Job / US',
  peer:         'Peer',
  friend:       'Friend',
  family:       'Family',
}

export const ATTIO_ELIGIBLE_CATEGORIES = [
  'business_dev', 'partner', 'client', 'mentor', 'job_us', 'peer', 'friend',
] as const
