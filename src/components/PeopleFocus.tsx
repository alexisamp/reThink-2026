import { useEffect, useMemo, useState } from 'react'
import {
  ArrowCounterClockwise, ArrowUUpLeft, Briefcase, CaretDown, CaretUp, CheckCircle,
  ChatCircle, EnvelopeSimple, GraduationCap, Handshake, Heart,
  LinkBreak, LinkedinLogo, Plus, Users, WhatsappLogo, X,
  XCircle,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useRelationshipBrief, type BriefItem, type BriefReason } from '@/hooks/useRelationshipBrief'
import type { Contact, Opportunity } from '@/types'

type ChannelRow = { outreach_log_id: string; channel: string }
type LensId = 'all' | 'job' | 'consult' | 'mentor' | 'board' | 'family'
type DueBucket = 'today' | 'week' | 'warm'
type ValueTag = 'owe' | 'ask' | 'promise' | 'more'

interface FocusSuggestion {
  id: string
  contact: Contact | null
  item: BriefItem
  list: Exclude<LensId, 'all'>
  due: DueBucket
  kind: BriefReason
  channel: string
  value?: ValueTag
  text: string
  why: string
  source: string
  when?: string
  isNew?: boolean
}

interface PeopleFocusProps {
  userId: string | null
  contacts?: Contact[]
  channels?: ChannelRow[]
  onOpenPerson?: (contact: Contact) => void
  onOpenOpportunity?: (opportunity: Opportunity) => void
  onContact?: (contact: Contact, context: string) => void
}

const LIST_ORDER: Array<Exclude<LensId, 'all'>> = ['job', 'consult', 'mentor', 'board', 'family']
const LIST_CFG: Record<Exclude<LensId, 'all'>, { short: string; kind?: 'inner'; icon: typeof Briefcase }> = {
  job: { short: 'Job', icon: Briefcase },
  consult: { short: 'Consulting', icon: Handshake },
  mentor: { short: 'Mentors', icon: GraduationCap },
  board: { short: 'Board', icon: Users },
  family: { short: 'Family', icon: Heart, kind: 'inner' },
}

const VALUE_TAG: Record<ValueTag, string> = {
  owe: 'you owe value',
  ask: 'ok to ask',
  promise: 'promise open',
  more: 'received more',
}

const GROUPS: Array<{ id: DueBucket; label: string; hint: string }> = [
  { id: 'today', label: 'Today', hint: 'overdue or time-sensitive' },
  { id: 'week', label: 'This week', hint: 'before the week ends' },
  { id: 'warm', label: 'Keep warm', hint: 'no deadline - don’t let it decay' },
]

const HEALTH = {
  ok: { color: '#266DF0', label: 'on track' },
  watch: { color: '#6F7988', label: 'needs attention' },
  risk: { color: '#C23A3A', label: 'at risk' },
}

function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function first(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function Avatar({ name, src, size = 30 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return (
    <span className="crm-av" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" /> : initials || '?'}
    </span>
  )
}

function sourceFor(reason: BriefReason) {
  if (reason === 'birthday_upcoming') return 'manual'
  if (reason === 'value_owe') return 'ledger'
  if (reason === 'upcoming_next_step' || reason === 'overdue_next_step') return 'todo'
  return 'crm'
}

function whenFor(item: BriefItem) {
  if (item.primaryReason === 'birthday_upcoming' && item.birthdayInDays != null) return `${item.birthdayInDays}d`
  if (item.nextStepDate) {
    const delta = Math.round((new Date(item.nextStepDate).getTime() - new Date(todayLocal()).getTime()) / 86400000)
    if (delta < 0) return `${Math.abs(delta)}d overdue`
    if (delta === 0) return 'today'
    return `${delta}d`
  }
  if (item.daysSinceContact != null) return `${item.daysSinceContact}d`
  return undefined
}

function lensFor(contact: Contact | null, item: BriefItem): Exclude<LensId, 'all'> {
  if (contact?.relationship_domain === 'personal' || contact?.category === 'family' || contact?.category === 'friend') return 'family'
  if (contact?.category === 'mentor') return 'mentor'
  if (contact?.category === 'client' || contact?.category === 'partner' || contact?.category === 'business_dev') return 'consult'
  if (contact?.category === 'job_us' || item.company) return 'job'
  return 'board'
}

function dueFor(item: BriefItem): DueBucket {
  if (item.primaryReason === 'overdue_next_step' || item.primaryReason === 'cadence_overdue') return 'today'
  if (item.primaryReason === 'birthday_upcoming' && (item.birthdayInDays ?? 99) <= 7) return 'today'
  if (item.primaryReason === 'upcoming_next_step' || item.primaryReason === 'birthday_upcoming' || item.primaryReason === 'value_owe') return 'week'
  return 'warm'
}

function preferredChannel(contact: Contact | null, channels: ChannelRow[]) {
  const channelRows = contact ? channels.filter(ch => ch.outreach_log_id === contact.id).map(ch => ch.channel) : []
  if (channelRows.includes('whatsapp')) return 'whatsapp'
  if (channelRows.includes('linkedin')) return 'linkedin'
  if (contact?.email) return 'email'
  if (contact?.phone) return 'phone'
  return channelRows[0] ?? 'email'
}

function suggestionText(item: BriefItem) {
  const name = first(item.name)
  if (item.nextStep) return item.nextStep
  if (item.primaryReason === 'birthday_upcoming') return `Wish ${name} a happy birthday`
  if (item.primaryReason === 'value_owe') return `Give value to ${name} before your next ask`
  if (item.primaryReason === 'cadence_overdue') return `Reach out to ${name} with a useful update`
  if (item.primaryReason === 'cadence_due_soon') return `Warm ${name} before the relationship cools`
  if (item.primaryReason === 'mis_tiered') return `Re-tier ${name} based on relationship strength`
  return `Follow up with ${name}`
}

function suggestionWhy(item: BriefItem) {
  const parts = [item.reasonLabel]
  if (item.daysSinceContact != null) parts.push(`last touch ${item.daysSinceContact}d ago`)
  if (item.nextStepDate) parts.push(`next step ${item.nextStepOverdue ? 'was due' : 'is due'} ${item.nextStepDate}`)
  if (item.ledgerBalance != null && item.ledgerBalance < 0) parts.push(`value balance ${item.ledgerBalance}`)
  if (item.birthdayInDays != null) parts.push(`birthday in ${item.birthdayInDays}d`)
  return parts.join(' · ')
}

function SourceTag({ source, when }: { source: string; when?: string }) {
  return <span className="src-tag">{source}{when ? <span className="src-when"> · {when}</span> : null}</span>
}

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  if (channel === 'whatsapp') return <WhatsappLogo size={size} />
  if (channel === 'linkedin') return <LinkedinLogo size={size} />
  if (channel === 'phone') return <ChatCircle size={size} />
  return <EnvelopeSimple size={size} />
}

function LensBar({
  active,
  counts,
  onSelect,
}: {
  active: LensId
  counts: Partial<Record<Exclude<LensId, 'all'>, number>>
  onSelect: (lens: LensId) => void
}) {
  return (
    <div className="lens-bar">
      <button className={`lens${active === 'all' ? ' on' : ''}`} onClick={() => onSelect('all')}>All</button>
      <span className="lens-div" />
      {LIST_ORDER.map(id => {
        const cfg = LIST_CFG[id]
        const Icon = cfg.icon
        return (
          <button
            key={id}
            className={`lens${active === id ? ' on' : ''}${cfg.kind === 'inner' ? ' inner' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon size={12} />
            <span>{cfg.short}</span>
            {counts[id] ? <span className="lens-n">{counts[id]}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function WeekColumn({
  label,
  hint,
  tone,
  rows,
  contactsById,
  onOpen,
}: {
  label: string
  hint: string
  tone: 'done' | 'sched' | 'reach'
  rows: Array<{ id: string; when?: string | null }>
  contactsById: Map<string, Contact>
  onOpen: (contact: Contact) => void
}) {
  return (
    <div className={`wkc ${tone}`}>
      <div className="wkc-hd">
        <span className="wkc-n">{rows.length}</span>
        <span className="wkc-lbl">{label}</span>
      </div>
      <div className="wkc-hint">{hint}</div>
      <div className="wkc-people">
        {rows.slice(0, 5).map(row => {
          const contact = contactsById.get(row.id)
          if (!contact) return null
          return (
            <button key={row.id} className="wkc-p" onClick={() => onOpen(contact)} title={contact.name}>
              <Avatar src={contact.profile_photo_url} name={contact.name} size={26} />
              <span className="wkc-meta">
                <span className="wkc-name">{first(contact.name)}</span>
                {row.when && <span className="wkc-when">{row.when}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekScore({
  target,
  done,
  scheduled,
  reach,
  contactsById,
  onOpen,
}: {
  target: number
  done: Array<{ id: string; when?: string | null }>
  scheduled: Array<{ id: string; when?: string | null }>
  reach: Array<{ id: string; when?: string | null }>
  contactsById: Map<string, Contact>
  onOpen: (contact: Contact) => void
}) {
  const pct = Math.min(100, (done.length / Math.max(target, 1)) * 100)
  return (
    <div className="week">
      <div className="week-hd">
        <ChatCircle size={15} />
        <h4>Conversations this week</h4>
        <span className="week-kpi"><b>{done.length}</b> / {target}</span>
        <span className="week-bar"><span style={{ width: `${pct}%` }} /></span>
        <span className="week-hint">quality conversations · Jacob’s weekly target</span>
      </div>
      <div className="week-cols">
        <WeekColumn label="Done" hint="captured · Granola / threads" tone="done" rows={done} contactsById={contactsById} onOpen={onOpen} />
        <WeekColumn label="Scheduled" hint="on your calendar" tone="sched" rows={scheduled} contactsById={contactsById} onOpen={onOpen} />
        <WeekColumn label="To reach" hint="first touch this week" tone="reach" rows={reach} contactsById={contactsById} onOpen={onOpen} />
      </div>
    </div>
  )
}

function SuggestionRow({
  sug,
  onAccept,
  onOpen,
  onContact,
  onDismiss,
}: {
  sug: FocusSuggestion
  onAccept: (sug: FocusSuggestion) => void
  onOpen: (contact: Contact) => void
  onContact: (contact: Contact, context: string) => void
  onDismiss: (id: string) => void
}) {
  const [why, setWhy] = useState(false)
  const contact = sug.contact
  const LensIcon = LIST_CFG[sug.list].icon
  return (
    <div className={`sg-row${why ? ' open' : ''}`}>
      <button className="sg-add" title="Add to Today" onClick={event => { event.stopPropagation(); onAccept(sug) }}>
        <Plus size={13} />
      </button>
      <button className="sg-av" title={contact ? `Open ${contact.name}` : sug.item.name} onClick={() => contact && onOpen(contact)}>
        <Avatar src={contact?.profile_photo_url ?? sug.item.avatar} name={contact?.name ?? sug.item.name} size={28} />
      </button>
      <div className="sg-main">
        <button className="sg-text" onClick={() => setWhy(value => !value)} title="Why this?">
          <span>{sug.text}</span>
          {sug.isNew && <span className="sg-new">new</span>}
          <CaretDown size={9} />
        </button>
        {why && <p className="sg-why">{sug.why}</p>}
      </div>
      <div className="sg-meta-r">
        {sug.value && <span className={`sg-val ${sug.value}`}>{VALUE_TAG[sug.value]}</span>}
        <span className="sg-lens"><LensIcon size={9} />{LIST_CFG[sug.list].short}</span>
        <span className="sg-src"><SourceTag source={sug.source} when={sug.when} /></span>
      </div>
      <div className="sg-acts">
        <button
          className="sg-chan"
          title={`Open ${sug.channel}`}
          onClick={event => { event.stopPropagation(); if (contact) onContact(contact, sug.text) }}
        >
          <ChannelIcon channel={sug.channel} size={14} />
        </button>
        <button className="sg-dismiss" title="Dismiss" onClick={event => { event.stopPropagation(); onDismiss(sug.id) }}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

function ReviveBar({
  accepted,
  dismissed,
  onRevive,
}: {
  accepted: FocusSuggestion[]
  dismissed: FocusSuggestion[]
  onRevive: (suggestion: FocusSuggestion, kind: 'added' | 'dismissed') => void
}) {
  const [open, setOpen] = useState(false)
  if (!accepted.length && !dismissed.length) return null
  const rows = [
    ...accepted.map(s => ({ s, kind: 'added' as const })),
    ...dismissed.map(s => ({ s, kind: 'dismissed' as const })),
  ]
  return (
    <div className="revive">
      <button className="revive-bar" onClick={() => setOpen(value => !value)}>
        {accepted.length > 0 && <span className="revive-seg"><CheckCircle size={13} />{accepted.length} added to Today</span>}
        {dismissed.length > 0 && <span className="revive-seg dim"><XCircle size={13} />{dismissed.length} dismissed</span>}
        <span className="revive-grow" />
        <span className="revive-toggle">{open ? 'hide' : 'review'}</span>
        {open ? <CaretUp size={11} /> : <CaretDown size={11} />}
      </button>
      {open && (
        <div className="revive-list">
          {rows.map(({ s, kind }) => (
            <div className="revive-item" key={`${kind}-${s.id}`}>
              <Avatar src={s.contact?.profile_photo_url ?? s.item.avatar} name={s.contact?.name ?? s.item.name} size={20} />
              <span className="revive-txt">{s.text}</span>
              <span className={`revive-tag ${kind}`}>{kind === 'added' ? 'in Today' : 'dismissed'}</span>
              <button className="revive-btn" onClick={() => onRevive(s, kind)}>
                {kind === 'added' ? <ArrowUUpLeft size={11} /> : <ArrowCounterClockwise size={11} />}
                {kind === 'added' ? 'Pull back' : 'Revive'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OppCard({
  opp,
  contacts,
  isNew,
  health,
  onOpenOpp,
}: {
  opp: Opportunity
  contacts: Contact[]
  isNew: boolean
  health: keyof typeof HEALTH
  onOpenOpp: (opportunity: Opportunity) => void
}) {
  const companyName = opp.company?.name ?? contacts.find(c => c.company_id === opp.company_id)?.company ?? 'Company'
  const inside = contacts.filter(contact =>
    (opp.company_id && contact.company_id === opp.company_id) ||
    (companyName && contact.company?.toLowerCase() === companyName.toLowerCase()),
  )
  const spoke = inside.filter(c => c.last_interaction_at).length
  const h = HEALTH[health]
  return (
    <div className="opp-card" onClick={() => onOpenOpp(opp)}>
      <div className="opp-top">
        <span className="opp-mark">{companyName[0]?.toUpperCase() ?? 'O'}</span>
        <div className="opp-id">
          <span className="opp-name">{opp.title}</span>
          <span className="opp-sub">{companyName} · {opp.stage}</span>
        </div>
        {isNew && <span className="opp-new">new</span>}
        <span className="opp-dot" style={{ background: h.color }} title={h.label} />
      </div>
      <div className="opp-people">
        <span className="opp-avs">
          {inside.slice(0, 4).map(contact => <Avatar key={contact.id} src={contact.profile_photo_url} name={contact.name} size={20} />)}
        </span>
        <span className="opp-count"><b>{inside.length}</b> inside · spoke with <b>{spoke}</b></span>
      </div>
      <div className="opp-weak"><LinkBreak size={11} />{inside.length < 2 ? 'needs a 2nd stakeholder inside' : 'keep next stakeholder warm'}</div>
    </div>
  )
}

export default function PeopleFocus({
  userId,
  contacts = [],
  channels = [],
  onOpenPerson,
  onOpenOpportunity,
  onContact,
}: PeopleFocusProps) {
  const { items, loading, convTarget } = useRelationshipBrief(userId)
  const [lens, setLens] = useState<LensId>('all')
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set())
  const [doneIds, setDoneIds] = useState<Array<{ id: string; when?: string | null }>>([])
  const [opps, setOpps] = useState<Opportunity[]>([])

  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekAgoDate = todayLocal(weekAgo)

    Promise.all([
      supabase.from('todos').select('url').eq('user_id', userId).like('url', 'rethink://people-focus/%').eq('completed', false),
      supabase.from('interactions').select('contact_id, interaction_date').eq('user_id', userId).gte('interaction_date', weekAgoDate),
      supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', userId).in('stage', ['exploring', 'active', 'negotiating']).order('target_date', { ascending: true, nullsFirst: false }),
    ]).then(([todoRes, interactionRes, oppRes]) => {
      if (cancelled) return
      setAccepted(new Set((todoRes.data ?? []).map(row => String(row.url ?? '').replace('rethink://people-focus/', '')).filter(Boolean)))
      const seen = new Set<string>()
      setDoneIds((interactionRes.data ?? [])
        .filter(row => row.contact_id && !seen.has(row.contact_id) && seen.add(row.contact_id))
        .map(row => ({ id: row.contact_id as string, when: row.interaction_date as string })))
      setOpps((oppRes.data ?? []) as Opportunity[])
    })
    return () => { cancelled = true }
  }, [userId])

  const suggestions = useMemo<FocusSuggestion[]>(() => items.map(item => {
    const contact = contactsById.get(item.contactId) ?? null
    const list = lensFor(contact, item)
    const channel = preferredChannel(contact, channels)
    const value = item.primaryReason === 'value_owe' || (item.ledgerBalance ?? 0) < 0 ? 'owe' : undefined
    return {
      id: item.contactId,
      contact,
      item,
      list,
      due: dueFor(item),
      kind: item.primaryReason,
      channel,
      value,
      text: suggestionText(item),
      why: suggestionWhy(item),
      source: sourceFor(item.primaryReason),
      when: whenFor(item),
      isNew: item.daysSinceContact == null,
    }
  }), [channels, contactsById, items])

  const scheduled = suggestions
    .filter(s => s.item.reasons.includes('upcoming_next_step'))
    .slice(0, 6)
    .map(s => ({ id: s.item.contactId, when: s.when }))
  const reach = suggestions
    .filter(s => !s.item.reasons.includes('upcoming_next_step'))
    .slice(0, 6)
    .map(s => ({ id: s.item.contactId, when: s.when }))

  const counts = suggestions.reduce<Partial<Record<Exclude<LensId, 'all'>, number>>>((acc, s) => {
    if (!accepted.has(s.id) && !dismissed.has(s.id)) acc[s.list] = (acc[s.list] ?? 0) + 1
    return acc
  }, {})
  const visible = suggestions.filter(s => !accepted.has(s.id) && !dismissed.has(s.id) && (lens === 'all' || s.list === lens))
  const acceptedSugs = suggestions.filter(s => accepted.has(s.id) && (lens === 'all' || s.list === lens))
  const dismissedSugs = suggestions.filter(s => dismissed.has(s.id) && (lens === 'all' || s.list === lens))
  const familyMode = lens === 'family'

  const openPerson = (contact: Contact) => onOpenPerson?.(contact)
  const openContact = (contact: Contact, context: string) => onContact?.(contact, context)

  const acceptSuggestion = async (sug: FocusSuggestion) => {
    if (!userId || !sug.contact) return
    const wasAccepted = accepted.has(sug.id)
    setAccepted(prev => {
      const next = new Set(prev)
      if (wasAccepted) next.delete(sug.id)
      else next.add(sug.id)
      return next
    })
    if (wasAccepted) {
      await supabase.from('todos').delete().eq('user_id', userId).eq('url', `rethink://people-focus/${sug.id}`)
      return
    }
    await supabase.from('todos').insert({
      user_id: userId,
      contact_id: sug.contact.id,
      text: sug.text,
      date: todayLocal(),
      url: `rethink://people-focus/${sug.id}`,
      content_segments: [
        { type: 'text', text: sug.text },
        { type: 'mention', kind: 'person', id: sug.contact.id, label: sug.contact.name, imageUrl: sug.contact.profile_photo_url ?? null },
      ],
    })
  }

  if (loading) {
    return (
      <div className="focus2">
        <div className="week">
          <div className="week-hd"><ChatCircle size={15} /><h4>Conversations this week</h4><span className="week-hint">loading relationship focus...</span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="focus2">
      <LensBar active={lens} onSelect={setLens} counts={counts} />

      <WeekScore
        target={convTarget}
        done={doneIds}
        scheduled={scheduled}
        reach={reach}
        contactsById={contactsById}
        onOpen={openPerson}
      />

      <section className="sug">
        <header className="sug-hd">
          <h3>{familyMode ? 'Stay close' : 'Suggested'}</h3>
          <span className="sug-count">{visible.length}</span>
          <span className="sug-rule" />
          <span className="sug-hint">{familyMode ? 'cadence & moments - no pipeline' : 'the system noticed these - add what you’ll do'}</span>
        </header>

        {visible.length === 0 && <p className="sug-empty">Nothing pending in this lens. Inbox zero.</p>}

        {GROUPS.map(group => {
          const groupItems = visible.filter(s => s.due === group.id)
          if (!groupItems.length) return null
          return (
            <div className="sug-group" key={group.id}>
              <div className="sug-group-hd">
                <span className="sg-glabel">{group.label}</span>
                <span className="sg-gcount">{groupItems.length}</span>
                <span className="sg-grule" />
                <span className="sg-ghint">{group.hint}</span>
              </div>
              <div className="sug-list">
                {groupItems.map(sug => (
                  <SuggestionRow
                    key={sug.id}
                    sug={sug}
                    onAccept={acceptSuggestion}
                    onOpen={openPerson}
                    onContact={openContact}
                    onDismiss={id => setDismissed(prev => new Set(prev).add(id))}
                  />
                ))}
              </div>
            </div>
          )
        })}

        <ReviveBar
          accepted={acceptedSugs}
          dismissed={dismissedSugs}
          onRevive={(sug, kind) => {
            if (kind === 'added') void acceptSuggestion(sug)
            else setDismissed(prev => { const next = new Set(prev); next.delete(sug.id); return next })
          }}
        />
      </section>

      {!familyMode && (
        <section className="opps">
          <header className="opps-hd">
            <h3>Opportunities</h3>
            <span className="sug-rule" />
            <span className="sug-hint">company · people inside · weak link</span>
          </header>
          <div className="opp-grid">
            {opps.slice(0, 6).map((opp, index) => (
              <OppCard
                key={opp.id}
                opp={opp}
                contacts={contacts}
                isNew={index === 0}
                health={index % 3 === 0 ? 'ok' : index % 3 === 1 ? 'watch' : 'risk'}
                onOpenOpp={opportunity => onOpenOpportunity?.(opportunity)}
              />
            ))}
            {opps.length === 0 && <p className="sug-empty">No active opportunities.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
