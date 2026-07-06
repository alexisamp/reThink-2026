import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CaretRight, PencilSimple, Check, Plus,
  WhatsappLogo, LinkedinLogo, TwitterLogo, Star, Briefcase,
  Trash, Target, User, ArrowSquareOut, X, ArrowUp, ArrowDown, Scales,
  EnvelopeSimple,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useValueLogs } from '@/hooks/useValueLogs'
import ContactFacts from '@/components/ContactFacts'
import ContactLinkedSignals from '@/components/ContactLinkedSignals'
import ContactListMemberships from '@/components/ContactListMemberships'
import ContactTodosFiles from '@/components/ContactTodosFiles'
import { strengthBucket, strengthLabel, strengthNormalized, strengthVsTier } from '@/lib/connectionStrength'
import { computeLedger, type LedgerBucket } from '@/lib/valueLedger'
import { syncGmailInteractions } from '@/lib/gmail'
import type { Contact, Interaction, ContactChannel, Opportunity, ValueLog, ValueDirection, ContactFact, ContactMilestone } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const MILESTONE_EMOJIS: Record<ContactMilestone['type'], string> = {
  birthday_contact: '🎂',
  birthday_child: '👶',
  birthday_partner: '💑',
  anniversary: '🎉',
  anniversary_work: '💼',
  custom: '📅',
}

/** Days until the next occurrence of a milestone (MM-DD recurring, or ISO date). null if past/none. */
function milestoneDaysUntil(m: ContactMilestone): number | null {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (m.date_mm_dd && /^\d{2}-\d{2}$/.test(m.date_mm_dd)) {
    const [month, day] = m.date_mm_dd.split('-').map(n => parseInt(n, 10))
    let next = new Date(today.getFullYear(), month - 1, day)
    if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day)
    return Math.round((next.getTime() - today.getTime()) / 86400000)
  }
  if (m.date_full) {
    const d = new Date(m.date_full); d.setHours(0, 0, 0, 0)
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
    return diff >= 0 ? diff : null
  }
  return null
}

/** Color classes for a value-ledger bucket: green = healthy net giver, red = you owe / net taker. */
function ledgerTone(bucket: LedgerBucket): { text: string; bg: string; border: string } {
  switch (bucket) {
    case 'champion':
    case 'healthy':
      return { text: 'text-pastel', bg: 'bg-pastel/15', border: 'border-pastel/50' }
    case 'neutral':
      return { text: 'text-shuttle', bg: 'bg-mercury/30', border: 'border-mercury' }
    case 'owe_them':
    case 'taker':
      return { text: 'text-red-400', bg: 'bg-red-50', border: 'border-red-200' }
  }
}

function formatAgo(days: number | null): string {
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function healthColor(days: number | null): string {
  if (days === null) return 'text-shuttle'
  if (days <= 14) return 'text-pastel'
  if (days <= 30) return 'text-yellow-500'
  return 'text-red-400'
}

function healthDotColor(days: number | null): string {
  if (days === null) return 'bg-mercury'
  if (days <= 14) return 'bg-pastel'
  if (days <= 30) return 'bg-yellow-400'
  return 'bg-red-400'
}

function healthLabel(days: number | null): string {
  if (days === null) return 'Never'
  if (days <= 14) return 'Active'
  if (days <= 30) return 'Warm'
  return 'Cold'
}

/** Normalize phone to E.164-ish (strips non-digits, adds + if starts with country code) */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 10) return `+${digits}`
  return raw
}

const INTERACTION_TYPES: { key: Interaction['type'], label: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'linkedin_msg', label: 'LinkedIn DM' },
  { key: 'email', label: 'Email' },
  { key: 'call', label: 'Call' },
  { key: 'virtual_coffee', label: 'Virtual Coffee' },
  { key: 'in_person', label: 'In Person' },
]

const INTERACTION_DOT: Record<string, string> = {
  whatsapp: 'bg-green-400',
  linkedin_msg: 'bg-blue-400',
  email: 'bg-shuttle',
  call: 'bg-burnham',
  virtual_coffee: 'bg-yellow-400',
  in_person: 'bg-pastel',
}

const VALUE_TYPE_LABELS: Record<string, string> = {
  introduction: 'Introduction', content: 'Content', referral: 'Referral',
  advice: 'Advice', endorsement: 'Endorsement', opportunity: 'Opportunity',
  candor: 'Candor (they shared)', other: 'Other',
}

const VALUE_TYPE_EMOJIS: Record<string, string> = {
  introduction: '🤝', content: '📰', referral: '🔗',
  advice: '💡', endorsement: '⭐', opportunity: '🎯',
  candor: '🔓', other: '📝',
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <WhatsappLogo size={13} weight="fill" className="text-green-500" />,
  linkedin: <LinkedinLogo size={13} weight="fill" className="text-blue-500" />,
  x: <TwitterLogo size={13} weight="fill" className="text-shuttle" />,
  exit5: <Star size={13} weight="fill" className="text-yellow-500" />,
}

const TIER_COLORS: Record<number, string> = {
  1: 'bg-gossip text-burnham',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-mercury text-shuttle',
}

const TIER_LABELS: Record<number, string> = {
  1: 'T1', 2: 'T2', 3: 'T3',
}

const STAGE_COLORS: Record<string, string> = {
  exploring: 'text-shuttle', active: 'text-burnham font-medium',
  negotiating: 'text-yellow-700 font-medium', won: 'text-pastel', lost: 'text-red-400',
}

// ── sub-components ────────────────────────────────────────────────────────────

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60">
      {children}
    </span>
  )
}

function SidebarValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] text-midnight">{children}</span>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">{title}</p>
      {children}
    </div>
  )
}

/** Inline editable field — compact, sidebar density */
function EditableField({
  label, value, onSave, multiline = false, placeholder,
}: {
  label: string
  value: string | null | undefined
  onSave: (val: string | null) => Promise<void>
  multiline?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const save = async () => {
    await onSave(draft.trim() || null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 mb-2">
        <SidebarLabel>{label}</SidebarLabel>
        {multiline ? (
          <textarea
            className="text-[12px] border border-mercury rounded px-2 py-1 resize-none bg-white focus:outline-none focus:border-burnham"
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="text-[12px] border border-mercury rounded px-2 py-1 bg-white focus:outline-none focus:border-burnham"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
        )}
        <div className="flex gap-1">
          <button onClick={save} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 bg-burnham text-gossip rounded">
            <Check size={8} /> Save
          </button>
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 text-shuttle hover:text-burnham">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-baseline justify-between mb-2">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <SidebarLabel>{label}</SidebarLabel>
        <SidebarValue>
          {value || <span className="text-mercury italic text-[11px]">{placeholder ?? '—'}</span>}
        </SidebarValue>
      </div>
      <button
        onClick={() => { setDraft(value ?? ''); setEditing(true) }}
        className="opacity-0 group-hover:opacity-100 text-shuttle hover:text-burnham transition-opacity flex-shrink-0 ml-1"
      >
        <PencilSimple size={10} />
      </button>
    </div>
  )
}

// ── stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color = 'text-shuttle' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[13px] font-semibold ${color}`}>{value}</span>
      <span className="text-[11px] text-shuttle/60">{label}</span>
    </div>
  )
}

// ── interaction timeline item ─────────────────────────────────────────────────

function TimelineItem({ interaction, onDelete }: { interaction: Interaction; onDelete: () => void }) {
  const typeLabel = INTERACTION_TYPES.find(t => t.key === interaction.type)?.label ?? interaction.type
  return (
    <div className="relative flex gap-3 pb-4 group">
      {/* dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${INTERACTION_DOT[interaction.type] ?? 'bg-mercury'}`} />
        <div className="w-px bg-mercury flex-1 mt-1" />
      </div>
      {/* content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-medium text-midnight">{typeLabel}</span>
          {interaction.channel && (
            <span className="text-[10px] px-1.5 py-0.5 bg-mercury/50 text-shuttle rounded">{interaction.channel}</span>
          )}
          <span className="text-[11px] text-shuttle/60 ml-auto">{formatDate(interaction.interaction_date)}</span>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-mercury hover:text-red-400 transition-opacity"
          >
            <Trash size={10} />
          </button>
        </div>
        {interaction.notes && (
          <p className="text-[12px] text-shuttle leading-relaxed">{interaction.notes}</p>
        )}
        {interaction.next_step && (
          <p className="text-[11px] text-burnham mt-1 bg-gossip/30 px-2 py-0.5 rounded inline-block">
            Next: {interaction.next_step}
            {interaction.next_step_date && ` · ${interaction.next_step_date}`}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Pulse card ────────────────────────────────────────────────────────────────

function PulseCard({ contact }: { contact: Contact }) {
  const strength = Number(contact.connection_strength ?? 0)
  const bucket = strengthBucket(strength)
  const normalized = strengthNormalized(strength)
  const assessment = strengthVsTier(contact)
  const days = daysSince(contact.last_interaction_at)
  const isPersonal = contact.relationship_domain === 'personal'

  const severityColor = {
    critical: 'text-red-600 bg-red-50 border-red-200',
    warn: 'text-orange-700 bg-orange-50 border-orange-200',
    info: 'text-burnham bg-gossip/40 border-pastel',
    good: 'text-green-700 bg-green-50 border-green-200',
  }[assessment.severity]

  return (
    <div className="space-y-2.5">
      {/* Top line: days since + strength bucket */}
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-semibold text-burnham">
            {days === null ? '—' : days}
          </span>
          <span className="text-[10px] text-shuttle/60 ml-1">
            {days === null ? 'no interactions yet' : `day${days === 1 ? '' : 's'} since last`}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-wide text-shuttle/50">Strength</span>
          <div className="text-[13px] font-semibold text-burnham">{strengthLabel(bucket)}</div>
        </div>
      </div>

      {/* Strength bar */}
      <div>
        <div className="h-1.5 bg-mercury/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-burnham transition-all"
            style={{ width: `${Math.max(2, normalized * 100)}%` }}
          />
        </div>
        <div className="text-[9px] text-shuttle/40 mt-0.5 text-right font-mono">
          {strength.toFixed(1)}
        </div>
      </div>

      {/* Recommended action */}
      {!isPersonal && (
        <div className={`text-[11px] px-2 py-1.5 rounded border ${severityColor}`}>
          <span className="font-semibold">{assessment.label}</span>
          <span className="text-[10px] opacity-80 block mt-0.5 leading-snug">{assessment.suggestion}</span>
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'interactions' | 'files' | 'notes' | 'opportunities'

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [channels, setChannels] = useState<ContactChannel[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [starterFacts, setStarterFacts] = useState<ContactFact[]>([])
  const [milestones, setMilestones] = useState<ContactMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [addingInteraction, setAddingInteraction] = useState(false)
  const [newInterType, setNewInterType] = useState<Interaction['type']>('call')
  const [newInterNotes, setNewInterNotes] = useState('')
  const [newInterNextStep, setNewInterNextStep] = useState('')
  const [addingValueLog, setAddingValueLog] = useState(false)
  const [newVLType, setNewVLType] = useState<ValueLog['type']>('introduction')
  const [newVLDesc, setNewVLDesc] = useState('')
  const [newVLDirection, setNewVLDirection] = useState<ValueDirection>('given')
  const [gmailSyncing, setGmailSyncing] = useState(false)
  const [gmailMsg, setGmailMsg] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [linkedinFetching, setLinkedinFetching] = useState(false)
  const [linkedinResult, setLinkedinResult] = useState<{
    name?: string; job_title?: string; company?: string
    about?: string; followers?: string; connections?: string; location?: string
    error?: string; partial?: boolean
  } | null>(null)
  const [linkedinSaving, setLinkedinSaving] = useState(false)

  const { logs: valueLogs, add: addValueLog, remove: removeValueLog } = useValueLogs(user?.id ?? null, id)

  const load = useCallback(async () => {
    if (!id || !user) return
    setLoading(true)
    const [{ data: c }, { data: ints }, { data: chans }, oppsResult, { data: facts }, { data: miles }] = await Promise.all([
      supabase.from('outreach_logs').select('*').eq('id', id).single(),
      supabase.from('interactions').select('*').eq('contact_id', id).order('interaction_date', { ascending: false }),
      supabase.from('contact_channels').select('*').eq('outreach_log_id', id),
      supabase
        .from('opportunity_contacts')
        .select('opportunity_id')
        .eq('outreach_log_id', id)
        .then(async ({ data: links }) => {
          if (!links || links.length === 0) return { data: [] as Opportunity[] }
          const ids = links.map(l => l.opportunity_id)
          const { data } = await supabase.from('opportunities').select('*, company:companies(*)').in('id', ids)
          return { data: (data ?? []) as Opportunity[] }
        }),
      supabase.from('contact_facts').select('*').eq('contact_id', id).eq('importance', 3).order('created_at', { ascending: false }).limit(5),
      supabase.from('contact_milestones').select('*').eq('contact_id', id).order('date_mm_dd'),
    ])
    setContact(c ?? null)
    setNotesDraft(c?.notes ?? '')
    setInteractions(ints ?? [])
    setChannels(chans ?? [])
    setOpportunities(oppsResult.data ?? [])
    setStarterFacts((facts ?? []) as ContactFact[])
    setMilestones((miles ?? []) as ContactMilestone[])
    setLoading(false)
  }, [id, user])

  useEffect(() => { load() }, [load])

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!id) return
    await supabase.from('outreach_logs').update({ [field]: value }).eq('id', id)
    setContact(prev => prev ? { ...prev, [field]: value } : null)
  }, [id])

  /** Link a channel to this contact (upsert on outreach_log_id + channel) */
  const linkChannel = useCallback(async (channel: string, identifier: string, name?: string) => {
    if (!id) return
    const { data, error } = await supabase
      .from('contact_channels')
      .upsert({
        outreach_log_id: id,
        channel,
        channel_identifier: identifier,
        channel_name: name ?? null,
        verified: true,
      }, { onConflict: 'outreach_log_id,channel' })
      .select()
      .single()
    if (!error && data) {
      setChannels(prev => {
        const exists = prev.find(c => c.channel === channel)
        if (exists) return prev.map(c => c.channel === channel ? data as ContactChannel : c)
        return [...prev, data as ContactChannel]
      })
    }
  }, [id])

  const saveNotes = async () => {
    setNotesSaving(true)
    await updateField('notes', notesDraft.trim() || null)
    setNotesSaving(false)
  }

  const fetchLinkedIn = async () => {
    if (!contact?.linkedin_url) return
    setLinkedinFetching(true)
    setLinkedinResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('linkedin-fetch', {
        body: { url: contact.linkedin_url },
      })
      if (error) {
        setLinkedinResult({ error: error.message })
      } else {
        setLinkedinResult(data as typeof linkedinResult)
      }
    } catch (err) {
      setLinkedinResult({ error: String(err) })
    }
    setLinkedinFetching(false)
  }

  const applyLinkedInData = async () => {
    if (!linkedinResult) return
    setLinkedinSaving(true)
    const updates: Record<string, unknown> = {}
    if (linkedinResult.job_title && !contact?.job_title) updates.job_title = linkedinResult.job_title
    if (linkedinResult.company && !contact?.company) updates.company = linkedinResult.company
    if (linkedinResult.location && !contact?.location) updates.location = linkedinResult.location

    // Build personal_context from about + metrics
    const parts: string[] = []
    if (linkedinResult.followers) parts.push(`Followers: ${linkedinResult.followers}`)
    if (linkedinResult.connections) parts.push(`Connections: ${linkedinResult.connections}`)
    if (linkedinResult.about) parts.push(linkedinResult.about)
    if (parts.length > 0) updates.personal_context = parts.join('\n')

    for (const [field, value] of Object.entries(updates)) {
      await updateField(field, value)
    }
    setLinkedinSaving(false)
    setLinkedinResult(null)
  }

  const logInteraction = async () => {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('interactions')
      .insert({
        user_id: user.id,
        contact_id: id,
        type: newInterType,
        direction: 'outbound',
        notes: newInterNotes.trim() || null,
        next_step: newInterNextStep.trim() || null,
        interaction_date: new Date().toISOString().split('T')[0],
      })
      .select().single()
    if (!error && data) {
      setInteractions(prev => [data as Interaction, ...prev])
      const now = new Date().toISOString()
      await supabase.from('outreach_logs').update({ last_interaction_at: now, updated_at: now }).eq('id', id)
      setContact(prev => prev ? { ...prev, last_interaction_at: now } : null)
    }
    setNewInterNotes('')
    setNewInterNextStep('')
    setAddingInteraction(false)
  }

  const deleteInteraction = async (iid: string) => {
    await supabase.from('interactions').delete().eq('id', iid)
    setInteractions(prev => prev.filter(i => i.id !== iid))
  }

  const submitValueLog = async () => {
    if (!id) return
    await addValueLog({ outreach_log_id: id, type: newVLType, description: newVLDesc.trim() || undefined, direction: newVLDirection })
    setNewVLDesc('')
    setAddingValueLog(false)
  }

  const syncGmail = async () => {
    if (!id || !contact?.email) return
    setGmailSyncing(true)
    setGmailMsg(null)
    const res = await syncGmailInteractions({
      contactId: id,
      contactEmail: contact.email,
      attioRecordId: contact.attio_record_id ?? null,
      category: contact.category ?? null,
    })
    setGmailSyncing(false)
    if (res.error) setGmailMsg(res.error)
    else {
      setGmailMsg(res.synced > 0 ? `Synced ${res.synced} email thread${res.synced === 1 ? '' : 's'}` : 'No new email threads')
      if (res.synced > 0) await load()
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-shuttle text-[13px]">Loading...</div>
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-shuttle text-[13px]">Contact not found.</p>
        <Link to="/people" className="text-[12px] text-burnham underline">Back to People</Link>
      </div>
    )
  }

  const lastDays = daysSince(contact.last_interaction_at)
  const initials = contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const valueGiven = valueLogs.length
  const ledger = computeLedger(valueLogs)
  const interactionCount = interactions.length

  // Conversation starters — upcoming dates + top facts to remember (Jacob's Two-Thirds ammo).
  const upcomingMilestones = milestones
    .map(m => ({ m, days: milestoneDaysUntil(m) }))
    .filter(x => x.days != null && x.days <= (x.m.show_days_before || 30))
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
  const birthdayMmDd = contact.birthday && /(\d{2})-(\d{2})$/.test(contact.birthday)
    ? contact.birthday.match(/(\d{2})-(\d{2})$/)![0]
    : null
  const hasBirthdayMilestone = milestones.some(m => m.type === 'birthday_contact')
  const birthdayDays = birthdayMmDd && !hasBirthdayMilestone
    ? milestoneDaysUntil({ date_mm_dd: birthdayMmDd } as ContactMilestone)
    : null
  const hasStarters = starterFacts.length > 0 || upcomingMilestones.length > 0 || (birthdayDays != null && birthdayDays <= 30)
  const activeOpps = opportunities.filter(o => o.stage === 'active' || o.stage === 'negotiating')

  return (
    <div className="flex flex-col h-full bg-[#F7F7F5]">
      {/* ── breadcrumb ── */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-mercury shrink-0">
        <Link to="/people" className="text-shuttle hover:text-burnham transition-colors">
          <ArrowLeft size={14} weight="bold" />
        </Link>
        <span className="text-[12px] text-shuttle">People</span>
        <CaretRight size={10} className="text-mercury" />
        <span className="text-[12px] font-medium text-midnight truncate max-w-[300px]">{contact.name}</span>
      </div>

      {/* ── tabs ── */}
      <div className="flex items-center gap-0 px-5 bg-white border-b border-mercury shrink-0">
        {(['overview', 'interactions', 'files', 'notes', 'opportunities'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[12px] capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-burnham text-burnham font-medium'
                : 'border-transparent text-shuttle hover:text-midnight'
            }`}
          >
            {t}
            {t === 'interactions' && interactionCount > 0 && (
              <span className="ml-1 text-[10px] text-shuttle/50">({interactionCount})</span>
            )}
            {t === 'opportunities' && opportunities.length > 0 && (
              <span className="ml-1 text-[10px] text-shuttle/50">({opportunities.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── main body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* left: content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── profile header ── */}
          <div className="flex items-center gap-3 mb-4">
            {contact.profile_photo_url ? (
              <img
                src={contact.profile_photo_url}
                alt={contact.name}
                className="w-10 h-10 rounded-full object-cover border border-mercury shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gossip flex items-center justify-center text-burnham font-semibold text-sm border border-pastel shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-midnight truncate">{contact.name}</h1>
                {contact.tier && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${TIER_COLORS[contact.tier]}`}>
                    {TIER_LABELS[contact.tier]}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-shuttle truncate">
                {[contact.job_title, contact.company].filter(Boolean).join(' · ') || 'No title'}
              </p>
            </div>
            {/* Channels quick row */}
            <div className="flex items-center gap-1.5">
              {channels.map(ch => (
                <span key={ch.id} className="flex items-center" title={ch.channel_identifier}>
                  {CHANNEL_ICONS[ch.channel]}
                </span>
              ))}
            </div>
          </div>

          {/* ── stat row ── */}
          <div className="flex items-center gap-4 mb-4 pb-3 border-b border-mercury">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthDotColor(lastDays)}`} />
              <span className={`text-[12px] font-medium ${healthColor(lastDays)}`}>{healthLabel(lastDays)}</span>
              <span className="text-[11px] text-shuttle/60">{formatAgo(lastDays)}</span>
            </div>
            <span className="text-mercury">·</span>
            <StatPill value={String(interactionCount)} label="interactions" />
            <span className="text-mercury">·</span>
            <StatPill value={String(valueGiven)} label="value logs" color="text-burnham" />
            {contact.status && (
              <>
                <span className="text-mercury">·</span>
                <span className="text-[11px] text-shuttle/70">{contact.status}</span>
              </>
            )}
          </div>

          {/* ── OVERVIEW tab ── */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-4">
              {/* Conversation starters — what to bring up next time */}
              {hasStarters && (
                <div className="bg-pastel/10 border border-pastel/40 rounded-lg px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-burnham/60 mb-2">Conversation starters</p>
                  <div className="flex flex-col gap-1.5">
                    {birthdayDays != null && birthdayDays <= 30 && (
                      <div className="flex items-center gap-2 text-[12px] text-midnight">
                        <span>🎂</span>
                        <span>Birthday {birthdayDays === 0 ? 'today' : `in ${birthdayDays}d`}</span>
                      </div>
                    )}
                    {upcomingMilestones.map(({ m, days }) => (
                      <div key={m.id} className="flex items-center gap-2 text-[12px] text-midnight">
                        <span>{MILESTONE_EMOJIS[m.type] ?? '📅'}</span>
                        <span>{m.label} {days === 0 ? 'today' : `in ${days}d`}</span>
                      </div>
                    ))}
                    {starterFacts.map(f => (
                      <div key={f.id} className="flex items-start gap-2 text-[12px] text-midnight">
                        <Star size={11} weight="fill" className="text-pastel mt-0.5 shrink-0" />
                        <span>{f.label ? <span className="text-shuttle">{f.label}: </span> : null}{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* personal_context — prominent block */}
              {contact.personal_context && (
                <div className="bg-gossip/20 border border-gossip/40 rounded-lg px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-burnham/60 mb-1.5">Context</p>
                  <p className="text-[13px] text-midnight leading-relaxed whitespace-pre-wrap">{contact.personal_context}</p>
                </div>
              )}

              {/* Active opportunity card */}
              {activeOpps.length > 0 && (
                <div className="bg-white border border-mercury rounded-lg px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Active Opportunity</p>
                  {activeOpps.map(opp => (
                    <Link
                      key={opp.id}
                      to={`/people/opportunities/${opp.id}`}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <Target size={14} className="text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-midnight truncate">{opp.title}</p>
                        <p className="text-[11px] text-shuttle">{opp.company?.name ?? 'No company'}</p>
                      </div>
                      <span className={`text-[11px] capitalize ${STAGE_COLORS[opp.stage] ?? 'text-shuttle'}`}>
                        {opp.stage}
                      </span>
                      <CaretRight size={10} className="text-mercury" />
                    </Link>
                  ))}
                </div>
              )}

              {/* Daisy chain: LinkedIn → referred_by → status */}
              <div className="flex items-center gap-2 flex-wrap">
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    <LinkedinLogo size={11} weight="fill" />
                    LinkedIn
                  </a>
                )}
                {contact.linkedin_url && contact.referred_by && (
                  <span className="text-mercury text-[11px]">via</span>
                )}
                {contact.referred_by && (
                  <span className="flex items-center gap-1 text-[11px] text-shuttle bg-mercury/50 px-2 py-1 rounded-full">
                    <User size={11} />
                    Referred
                  </span>
                )}
                {contact.status && (
                  <>
                    {(contact.linkedin_url || contact.referred_by) && (
                      <span className="text-mercury text-[11px]">→</span>
                    )}
                    <span className="text-[11px] text-shuttle bg-mercury/30 px-2 py-1 rounded-full">
                      {contact.status}
                    </span>
                  </>
                )}
              </div>

              {/* Pulse — connection strength + action recommendation */}
              <div className="bg-white border border-mercury rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Pulse</p>
                <PulseCard contact={contact} />
              </div>

              {/* Key Facts — Two-Thirds ammunition */}
              <div className="bg-white border border-mercury rounded-lg p-3">
                <ContactFacts contactId={contact.id} />
              </div>

              <ContactLinkedSignals contactId={contact.id} className="bg-white border border-mercury rounded-lg p-3" />

              {/* Active in lists */}
              <div className="bg-white border border-mercury rounded-lg p-3">
                <ContactListMemberships contactId={contact.id} />
              </div>

              {/* Recent interactions — timeline preview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50">Recent Activity</p>
                  <button
                    onClick={() => { setTab('interactions'); setAddingInteraction(true) }}
                    className="flex items-center gap-1 text-[11px] text-burnham hover:underline"
                  >
                    <Plus size={10} /> Log
                  </button>
                </div>
                {interactions.length === 0 ? (
                  <p className="text-[12px] text-mercury italic">No interactions yet.</p>
                ) : (
                  <div>
                    {interactions.slice(0, 4).map(i => (
                      <TimelineItem key={i.id} interaction={i} onDelete={() => deleteInteraction(i.id)} />
                    ))}
                    {interactions.length > 4 && (
                      <button
                        onClick={() => setTab('interactions')}
                        className="text-[11px] text-burnham hover:underline ml-5"
                      >
                        +{interactions.length - 4} more
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Value Ledger — given vs received (Jacob's reciprocity imbalance) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50">Value Ledger</p>
                  <button
                    onClick={() => setAddingValueLog(true)}
                    className="flex items-center gap-1 text-[11px] text-burnham hover:underline"
                  >
                    <Plus size={10} /> Add
                  </button>
                </div>

                {/* Balance summary bar */}
                {valueLogs.length > 0 && (() => {
                  const tone = ledgerTone(ledger.bucket)
                  return (
                    <div className={`flex flex-col gap-1.5 mb-3 p-3 rounded-lg border ${tone.bg} ${tone.border}`}>
                      <div className="flex items-center gap-2">
                        <Scales size={15} weight="bold" className={tone.text} />
                        <span className={`text-[12px] font-semibold ${tone.text}`}>{ledger.label}</span>
                        <span className={`text-[11px] font-bold ml-auto ${tone.text}`}>
                          {ledger.balance > 0 ? '+' : ''}{ledger.balance}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-shuttle">
                        <span className="flex items-center gap-1"><ArrowUp size={10} weight="bold" className="text-pastel" /> Given {ledger.given}</span>
                        <span className="flex items-center gap-1"><ArrowDown size={10} weight="bold" className="text-shuttle/60" /> Received {ledger.received}</span>
                      </div>
                      <p className="text-[11px] text-shuttle/80 leading-snug">{ledger.suggestion}</p>
                    </div>
                  )
                })()}

                {addingValueLog && (
                  <div className="flex flex-col gap-2 mb-3 p-3 bg-white border border-mercury rounded-lg">
                    {/* Direction toggle */}
                    <div className="flex gap-1 p-0.5 bg-mercury/30 rounded-lg">
                      <button
                        onClick={() => setNewVLDirection('given')}
                        className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md transition-colors ${newVLDirection === 'given' ? 'bg-white text-burnham shadow-sm font-medium' : 'text-shuttle'}`}
                      >
                        <ArrowUp size={11} weight="bold" /> I gave
                      </button>
                      <button
                        onClick={() => setNewVLDirection('received')}
                        className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md transition-colors ${newVLDirection === 'received' ? 'bg-white text-burnham shadow-sm font-medium' : 'text-shuttle'}`}
                      >
                        <ArrowDown size={11} weight="bold" /> I received
                      </button>
                    </div>
                    <select
                      value={newVLType}
                      onChange={e => setNewVLType(e.target.value as ValueLog['type'])}
                      className="text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                    >
                      {Object.entries(VALUE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Description (optional)"
                      value={newVLDesc}
                      onChange={e => setNewVLDesc(e.target.value)}
                      className="text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                    />
                    <div className="flex gap-2">
                      <button onClick={submitValueLog} className="text-[11px] px-3 py-1 bg-burnham text-gossip rounded">Save</button>
                      <button onClick={() => { setAddingValueLog(false); setNewVLDirection('given') }} className="text-[11px] px-3 py-1 text-shuttle hover:text-burnham">Cancel</button>
                    </div>
                  </div>
                )}

                {valueLogs.length === 0 && !addingValueLog ? (
                  <p className="text-[12px] text-mercury italic">No value exchanged yet. Give first.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {valueLogs.map(vl => {
                      const received = vl.direction === 'received'
                      return (
                        <div key={vl.id} className={`flex items-center gap-2 px-2 py-1.5 border rounded-lg group ${vl.type === 'candor' ? 'bg-pastel/20 border-pastel' : 'bg-white border-mercury'}`}>
                          {received
                            ? <ArrowDown size={12} weight="bold" className="text-shuttle/60 shrink-0" />
                            : <ArrowUp size={12} weight="bold" className="text-pastel shrink-0" />}
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-gossip text-burnham rounded flex items-center gap-1">
                            <span>{VALUE_TYPE_EMOJIS[vl.type] ?? ''}</span>
                            <span>{VALUE_TYPE_LABELS[vl.type] ?? vl.type}</span>
                          </span>
                          <p className="text-[12px] text-shuttle flex-1 truncate">{vl.description || '—'}</p>
                          <span className="text-[10px] text-mercury">{vl.date}</span>
                          <button
                            onClick={() => removeValueLog(vl.id)}
                            className="opacity-0 group-hover:opacity-100 text-mercury hover:text-red-400 transition-opacity"
                          >
                            <Trash size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── INTERACTIONS tab ── */}
          {tab === 'interactions' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-semibold text-midnight">All Interactions ({interactions.length})</p>
                <div className="flex items-center gap-2">
                  {gmailMsg && <span className="text-[10px] text-shuttle/60">{gmailMsg}</span>}
                  {contact.email && (
                    <button
                      onClick={syncGmail}
                      disabled={gmailSyncing}
                      className="flex items-center gap-1 text-[11px] px-3 py-1.5 border border-mercury text-shuttle rounded-lg hover:border-burnham hover:text-burnham transition-colors disabled:opacity-50"
                    >
                      <EnvelopeSimple size={11} /> {gmailSyncing ? 'Syncing…' : 'Sync Gmail'}
                    </button>
                  )}
                  <button
                    onClick={() => setAddingInteraction(v => !v)}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 bg-burnham text-gossip rounded-lg"
                  >
                    <Plus size={11} /> Log
                  </button>
                </div>
              </div>

              {addingInteraction && (
                <div className="flex flex-col gap-2 mb-5 p-3 bg-white border border-mercury rounded-lg">
                  <select
                    value={newInterType}
                    onChange={e => setNewInterType(e.target.value as Interaction['type'])}
                    className="text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                  >
                    {INTERACTION_TYPES.map(t => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Notes (optional)"
                    value={newInterNotes}
                    onChange={e => setNewInterNotes(e.target.value)}
                    rows={2}
                    className="text-[12px] border border-mercury rounded px-2 py-1 resize-none focus:outline-none focus:border-burnham"
                  />
                  <input
                    placeholder="Next step (optional)"
                    value={newInterNextStep}
                    onChange={e => setNewInterNextStep(e.target.value)}
                    className="text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                  />
                  <div className="flex gap-2">
                    <button onClick={logInteraction} className="text-[11px] px-3 py-1 bg-burnham text-gossip rounded">Save</button>
                    <button onClick={() => setAddingInteraction(false)} className="text-[11px] px-3 py-1 text-shuttle hover:text-burnham">Cancel</button>
                  </div>
                </div>
              )}

              {interactions.length === 0 ? (
                <p className="text-[12px] text-mercury italic text-center py-8">No interactions logged yet.</p>
              ) : (
                <div className="mt-2">
                  {interactions.map(i => (
                    <TimelineItem key={i.id} interaction={i} onDelete={() => deleteInteraction(i.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FILES tab ── */}
          {tab === 'files' && id && user && (
            <ContactTodosFiles contactId={id} userId={user.id} />
          )}

          {/* ── NOTES tab ── */}
          {tab === 'notes' && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-semibold text-midnight">Personal Notes</p>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="Add notes about this person — context, interests, follow-ups..."
                rows={10}
                className="w-full text-[12px] border border-mercury rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-burnham bg-white"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 bg-burnham text-gossip rounded-lg disabled:opacity-50"
                >
                  <Check size={11} /> {notesSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {contact.personal_context && (
                <div className="mt-2 p-3 bg-gossip/20 border border-gossip/40 rounded-lg">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-burnham/60 mb-1">Personal Context</p>
                  <p className="text-[12px] text-midnight whitespace-pre-wrap">{contact.personal_context}</p>
                </div>
              )}
            </div>
          )}

          {/* ── OPPORTUNITIES tab ── */}
          {tab === 'opportunities' && (
            <div>
              <p className="text-[13px] font-semibold text-midnight mb-4">Linked Opportunities ({opportunities.length})</p>
              {opportunities.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase size={28} className="text-mercury mx-auto mb-2" />
                  <p className="text-[12px] text-shuttle">No opportunities linked.</p>
                  <Link to="/people/opportunities" className="text-[11px] text-burnham hover:underline mt-1 inline-block">
                    Go to Opportunities →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {opportunities.map(opp => (
                    <Link
                      key={opp.id}
                      to={`/people/opportunities/${opp.id}`}
                      className="flex items-center gap-3 p-3 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
                    >
                      <Target size={14} className="text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-midnight truncate">{opp.title}</p>
                        <p className="text-[11px] text-shuttle">{opp.company?.name ?? 'No company'} · {opp.type}</p>
                      </div>
                      <span className={`text-[11px] capitalize ${STAGE_COLORS[opp.stage] ?? 'text-shuttle'}`}>
                        {opp.stage}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right sidebar ── */}
        <aside className="w-[260px] flex-shrink-0 border-l border-mercury bg-white overflow-y-auto px-4 py-4">

          <SidebarSection title="Record Details">
            <EditableField
              label="Full Name"
              value={contact.name}
              onSave={v => updateField('name', v ?? contact.name)}
            />
            <EditableField
              label="Email"
              value={contact.email}
              onSave={v => updateField('email', v)}
              placeholder="Add email"
            />
            <EditableField
              label="Phone"
              value={contact.phone}
              onSave={async v => {
                await updateField('phone', v)
                if (v) await linkChannel('whatsapp', normalizePhone(v))
              }}
              placeholder="Add phone"
            />
            <EditableField label="Job Title" value={contact.job_title} onSave={v => updateField('job_title', v)} />
            <EditableField label="Company" value={contact.company} onSave={v => updateField('company', v)} />
            <EditableField label="Location" value={contact.location} onSave={v => updateField('location', v)} />

            {/* LinkedIn URL — auto-links channel + fetch button */}
            <EditableField
              label="LinkedIn"
              value={contact.linkedin_url}
              onSave={async v => {
                await updateField('linkedin_url', v)
                if (v) await linkChannel('linkedin', v, contact.name)
              }}
              placeholder="https://linkedin.com/in/..."
            />
            {contact.linkedin_url && (
              <div className="flex items-center gap-2 -mt-1 mb-2">
                <a
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-shuttle hover:text-burnham transition-colors"
                >
                  <ArrowSquareOut size={10} /> Open
                </a>
                <span className="text-mercury">·</span>
                <button
                  onClick={fetchLinkedIn}
                  disabled={linkedinFetching}
                  className="flex items-center gap-1 text-[10px] text-burnham hover:underline disabled:opacity-50"
                >
                  <LinkedinLogo size={10} />
                  {linkedinFetching ? 'Fetching...' : 'Fetch profile'}
                </button>
              </div>
            )}

            {/* LinkedIn fetch result */}
            {linkedinResult && (
              <div className="mb-3 p-3 bg-gossip/10 border border-gossip/40 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-burnham/70">
                    {linkedinResult.error ? 'Fetch failed' : 'Profile data'}
                  </p>
                  <button onClick={() => setLinkedinResult(null)} className="text-shuttle hover:text-burnham">
                    <X size={10} />
                  </button>
                </div>

                {linkedinResult.error ? (
                  <p className="text-[11px] text-red-500">{linkedinResult.error}</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-1 mb-2">
                      {linkedinResult.name && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Name</SidebarLabel>
                          <SidebarValue>{linkedinResult.name}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.job_title && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Role</SidebarLabel>
                          <SidebarValue>{linkedinResult.job_title}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.company && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Company</SidebarLabel>
                          <SidebarValue>{linkedinResult.company}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.location && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Location</SidebarLabel>
                          <SidebarValue>{linkedinResult.location}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.followers && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Followers</SidebarLabel>
                          <SidebarValue>{linkedinResult.followers}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.connections && (
                        <div className="flex items-center gap-1.5">
                          <SidebarLabel>Connections</SidebarLabel>
                          <SidebarValue>{linkedinResult.connections}</SidebarValue>
                        </div>
                      )}
                      {linkedinResult.about && (
                        <p className="text-[11px] text-shuttle mt-1 line-clamp-3 leading-relaxed">
                          {linkedinResult.about}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={applyLinkedInData}
                      disabled={linkedinSaving}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-burnham text-gossip rounded disabled:opacity-50"
                    >
                      <Check size={8} /> {linkedinSaving ? 'Saving...' : 'Apply to profile'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Tier */}
            <div className="mb-2">
              <SidebarLabel>Tier</SidebarLabel>
              <select
                value={contact.tier ?? ''}
                onChange={e => updateField('tier', e.target.value ? Number(e.target.value) : null)}
                className="mt-0.5 w-full text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
              >
                <option value="">— Not set</option>
                <option value="1">T1 — Core</option>
                <option value="2">T2 — Strategic</option>
                <option value="3">T3 — Peripheral</option>
              </select>
            </div>

            {/* Status */}
            <div className="mb-2">
              <SidebarLabel>Status</SidebarLabel>
              <select
                value={contact.status}
                onChange={e => updateField('status', e.target.value)}
                className="mt-0.5 w-full text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
              >
                {['PROSPECT','INTRO','CONNECTED','ENGAGED','NURTURING','RECONNECT','DORMANT'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <EditableField label="Birthday" value={contact.birthday ?? null} onSave={v => updateField('birthday', v)} placeholder="YYYY-MM-DD" />
            <EditableField label="Advisory Role" value={contact.advisory_role ?? null} onSave={v => updateField('advisory_role', v)} />
          </SidebarSection>

          <SidebarSection title="Context">
            <EditableField
              label="Interests"
              value={contact.interests ?? null}
              onSave={v => updateField('interests', v)}
              multiline
              placeholder="Add interests..."
            />
            <EditableField
              label="Looking For"
              value={contact.looking_for ?? null}
              onSave={v => updateField('looking_for', v)}
              multiline
              placeholder="What are they seeking?"
            />
            <EditableField
              label="Personal Context"
              value={contact.personal_context ?? null}
              onSave={v => updateField('personal_context', v)}
              multiline
              placeholder="Key context about this person..."
            />
          </SidebarSection>

          {/* Channels */}
          <SidebarSection title="Channels">
            {channels.length === 0 ? (
              <p className="text-[11px] text-mercury italic">No channels linked.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {channels.map(ch => (
                  <div key={ch.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#F7F7F5] border border-mercury/60 rounded">
                    {CHANNEL_ICONS[ch.channel]}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-midnight truncate">{ch.channel_name || ch.channel_identifier}</p>
                      <p className="text-[10px] text-shuttle/60 truncate">{ch.channel_identifier}</p>
                    </div>
                    {ch.verified && <Check size={10} className="text-pastel flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </SidebarSection>

          {/* Lists */}
          <SidebarSection title="Lists">
            {contact.tier === 1 ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 bg-gossip text-burnham rounded font-medium">
                <Star size={9} weight="fill" /> Board of Directors
              </span>
            ) : (
              <p className="text-[11px] text-mercury italic">Not in any lists.</p>
            )}
          </SidebarSection>

          {/* Linked Opportunities */}
          {opportunities.length > 0 && (
            <SidebarSection title="Opportunities">
              <div className="flex flex-col gap-1">
                {opportunities.map(opp => (
                  <Link
                    key={opp.id}
                    to={`/people/opportunities/${opp.id}`}
                    className="flex items-center justify-between px-2 py-1.5 bg-[#F7F7F5] border border-mercury/60 rounded hover:border-burnham transition-colors"
                  >
                    <span className="text-[11px] text-midnight truncate">{opp.title}</span>
                    <span className={`text-[10px] ml-2 flex-shrink-0 capitalize ${STAGE_COLORS[opp.stage] ?? 'text-shuttle'}`}>
                      {opp.stage}
                    </span>
                  </Link>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Health indicators */}
          <SidebarSection title="Health">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <SidebarLabel>Last contact</SidebarLabel>
                <SidebarValue>{formatAgo(lastDays)}</SidebarValue>
              </div>
              <div className="flex items-center justify-between">
                <SidebarLabel>Interactions</SidebarLabel>
                <SidebarValue>{interactionCount}</SidebarValue>
              </div>
              <div className="flex items-center justify-between">
                <SidebarLabel>Value given</SidebarLabel>
                <SidebarValue>{valueGiven}</SidebarValue>
              </div>
            </div>
          </SidebarSection>

          {/* back nav */}
          <div className="pt-2 border-t border-mercury">
            <button
              onClick={() => navigate('/people')}
              className="flex items-center gap-1 text-[11px] text-shuttle hover:text-burnham"
            >
              <ArrowLeft size={11} /> Back to People
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
