import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Table, Lightning, Users,
  WhatsappLogo, LinkedinLogo, TwitterLogo, IdentificationCard, At, Buildings,
  Briefcase, MapPin, Heartbeat, CircleHalf, Broadcast, GitFork, Target,
  ArrowUpRight, ArrowDownLeft, Info, CalendarBlank, Plus, Trash, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type {
  Contact, ContactFact, ContactIntroduction, ContactStatus, Interaction, Todo,
  ValueDirection, ValueLog, ValueLogType,
} from '@/types'
import { useContacts } from '@/hooks/useContacts'
import PeopleFocus from '@/components/PeopleFocus'
import PeopleNetwork from '@/components/PeopleNetwork'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import ConversationsDrawer from '@/components/crm/ConversationsDrawer'
import NewPersonPeek from '@/components/crm/NewPersonPeek'
import RecordPeek from '@/components/crm/RecordPeek'
import { TierInfoHelper } from '@/components/TierInfoHelper'
import MergeContactsModal from '@/components/MergeContactsModal'
import { eventTypesForMetric } from './today/outreachMetrics'

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatAgo(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const clean = (value: string | null | undefined) => (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  const left = clean(a)
  const right = clean(b)
  if (!left || !right) return false
  return left === right || (left.length >= 4 && right.includes(left)) || (right.length >= 4 && left.includes(right))
}

function contactInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?'
}

function ValueBalance({ given, received }: { given: number; received: number }) {
  const net = given - received
  const tone = net > 0 ? 'give' : net < 0 ? 'owe' : 'even'
  const sign = net > 0 ? `+${net}` : String(net)
  const label = net > 0 ? 'you can ask' : net < 0 ? 'you owe' : 'even'
  return (
    <span className={`val-bar ${tone}`} title={`Given ${given} · Received ${received}`}>
      <span className="val-num">{sign}</span>
      <span className="val-lbl">{label}</span>
    </span>
  )
}

function EditablePeekInput({
  value,
  placeholder = 'Empty',
  type = 'text',
  onSave,
}: {
  value: string | null | undefined
  placeholder?: string
  type?: string
  onSave: (value: string | null) => Promise<void> | void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  const commit = async () => {
    const clean = draft.trim()
    const current = (value ?? '').trim()
    if (clean === current) return
    await onSave(clean || null)
  }

  return (
    <input
      className="peek-inline-input"
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => { void commit() }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value ?? '')
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function EditablePeekSelect<T extends string>({
  value,
  options,
  onSave,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onSave: (value: T) => Promise<void> | void
}) {
  return (
    <select
      className="peek-inline-input peek-inline-select"
      value={value}
      onChange={event => { void onSave(event.target.value as T) }}
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function docsFromTodos(todos: Todo[]) {
  const docs = todos.flatMap(todo => (todo.content_segments ?? [])
    .filter(segment => segment.type === 'file')
    .map(segment => ({
      name: segment.label,
      url: segment.url ?? null,
      type: segment.mimeType?.includes('pdf') ? 'PDF' : segment.source === 'google_drive' ? 'Drive' : 'Doc',
      when: todo.date ?? null,
    })))
  const seen = new Set<string>()
  return docs.filter(doc => {
    const key = `${doc.name}:${doc.url ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 12)
}

const KANBAN_COLUMNS: { status: ContactStatus; label: string; dot: string }[] = [
  { status: 'PROSPECT',   label: 'Prospect',   dot: 'bg-mercury' },
  { status: 'INTRO',      label: 'Intro',      dot: 'bg-burnham' },
  { status: 'CONNECTED',  label: 'Connected',  dot: 'bg-burnham' },
  { status: 'ENGAGED',    label: 'Engaged',    dot: 'bg-burnham' },
  { status: 'NURTURING',  label: 'Nurturing',  dot: 'bg-burnham' },
  { status: 'DORMANT',    label: 'Dormant',    dot: 'bg-red-300' },
]

const VALUE_TYPES: ValueLogType[] = ['introduction', 'content', 'referral', 'advice', 'endorsement', 'opportunity', 'candor', 'other']
const INTRO_STATUS_OPTIONS: ContactIntroduction['status'][] = ['made', 'received', 'offered', 'requested']

function ContactAvatar({ name, photoUrl, size = 28 }: { name: string; photoUrl?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div
      className="shrink-0 rounded-full overflow-hidden bg-mercury/60 flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {photoUrl && !imgFailed
        ? <img src={photoUrl} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        : <span className="font-semibold text-shuttle/60">{initials}</span>
      }
    </div>
  )
}

// ── Channel icons ─────────────────────────────────────────────────────────────
// Dedupe by channel type: contact_channels can have multiple rows per (contact,
// channel) — the same WA phone with and without "+", the same person's LID
// AND waname fallback AND a phone, plus residual rows from the deprecated
// extension's content-script. Show ONE icon per distinct channel type with a
// count badge when there's more than one underlying row.
function ChannelIcons({ channels }: { channels: Array<{ channel: string }> }) {
  const counts = channels.reduce<Record<string, number>>((acc, c) => {
    acc[c.channel] = (acc[c.channel] ?? 0) + 1
    return acc
  }, {})

  const renderIcon = (channel: string) => {
    if (channel === 'whatsapp') return <WhatsappLogo size={11} className="text-burnham" />
    if (channel === 'linkedin') return <LinkedinLogo size={11} className="text-burnham" />
    if (channel === 'x') return <TwitterLogo size={11} className="text-shuttle" />
    if (channel === 'exit5') return <span className="text-[10px] font-semibold text-shuttle/60">E5</span>
    return null
  }

  // Stable display order
  const ORDER = ['whatsapp', 'linkedin', 'x', 'exit5'] as const
  const entries = ORDER.filter(k => counts[k] > 0)

  return (
    <div className="flex items-center gap-1">
      {entries.map(channel => {
        const count = counts[channel]
        return (
          <span
            key={channel}
            className="inline-flex items-center gap-0.5"
            title={count > 1 ? `${count} ${channel} channels` : channel}
          >
            {renderIcon(channel)}
            {count > 1 && (
              <span className="text-[10px] font-mono text-shuttle/50">x{count}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'focus' | 'table' | 'network'

export default function People() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('focus')
  const [crmView, setCrmView] = useState<'table' | 'kanban'>('table')
  const [newPersonOpen, setNewPersonOpen] = useState(false)
  const [peekContactId, setPeekContactId] = useState<string | null>(null)
  const [peekFacts, setPeekFacts] = useState<ContactFact[]>([])
  const [peekValues, setPeekValues] = useState<ValueLog[]>([])
  const [peekInteractions, setPeekInteractions] = useState<Interaction[]>([])
  const [peekTodos, setPeekTodos] = useState<Todo[]>([])
  const [introductions, setIntroductions] = useState<ContactIntroduction[]>([])
  const [newValueDirection, setNewValueDirection] = useState<ValueDirection>('given')
  const [newValueType, setNewValueType] = useState<ValueLogType>('other')
  const [newValueText, setNewValueText] = useState('')
  const [newFactText, setNewFactText] = useState('')
  const [newDateLabel, setNewDateLabel] = useState('')
  const [newDateWhen, setNewDateWhen] = useState('')
  const [newIntroByName, setNewIntroByName] = useState('')
  const [newIntroByCompany, setNewIntroByCompany] = useState('')
  const [newIntroToName, setNewIntroToName] = useState('')
  const [newIntroToCompany, setNewIntroToCompany] = useState('')
  const [conversationContact, setConversationContact] = useState<Contact | null>(null)
  const [conversationContext, setConversationContext] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTagging, setBulkTagging] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [todayStageIds, setTodayStageIds] = useState<Set<string> | null>(null)

  // Contact channels (loaded separately)
  const [channels, setChannels] = useState<Array<{ outreach_log_id: string; channel: string }>>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  // Load channels
  useEffect(() => {
    if (!userId) return
    supabase
      .from('contact_channels')
      .select('outreach_log_id, channel')
      .then(({ data }) => setChannels(data ?? []))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const stage = searchParams.get('todayStage')
    const date = searchParams.get('date')
    if (!stage || !date) { setTodayStageIds(null); return }
    const eventTypes = eventTypesForMetric(stage)
    if (eventTypes.length === 0) { setTodayStageIds(new Set()); return }
    supabase.from('outreach_daily_metric_contacts').select('contact_id').eq('user_id', userId).in('event_type', [...eventTypes]).eq('occurred_on', date).not('contact_id', 'is', null).then(({ data }) => setTodayStageIds(new Set((data ?? []).map(row => row.contact_id as string))))
  }, [searchParams, userId])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('contact_introductions')
      .select('*')
      .eq('user_id', userId)
      .order('source_interaction_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setIntroductions([])
          return
        }
        setIntroductions((data ?? []) as ContactIntroduction[])
      })
  }, [userId])

  const { contacts, loading, addContact, updateContact, bulkUpdateContacts, mergeContacts } = useContacts(
    userId ?? undefined,
    [],
    async () => {},
  )

  // Goals for the new-person peek.
  const [goals, setGoals] = useState<{ id: string; text: string; alias: string | null }[]>([])
  useEffect(() => {
    if (!userId) return
    supabase.from('goals').select('id, text, alias').eq('user_id', userId).eq('goal_type', 'ACTIVE')
      .then(({ data }) => setGoals(data ?? []))
  }, [userId])

  const filtered = contacts.filter(contact => !todayStageIds || todayStageIds.has(contact.id)).sort((a, b) => {
    const aDate = a.last_interaction_at ?? a.created_at
    const bDate = b.last_interaction_at ?? b.created_at
    return bDate.localeCompare(aDate)
  })

  const handleRowClick = useCallback((c: Contact) => {
    setPeekContactId(c.id)
  }, [])
  const peekContact = filtered.find(c => c.id === peekContactId) ?? null
  const peekIndex = peekContact ? filtered.findIndex(c => c.id === peekContact.id) : -1
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])
  const introsByPeek = useMemo(() => {
    if (!peekContact) return { madeBy: [] as ContactIntroduction[], madeTo: [] as ContactIntroduction[] }
    const isIntroduced = (intro: ContactIntroduction) => (
      intro.introduced_contact_id === peekContact.id ||
      sameName(intro.introduced_person_name, peekContact.name)
    )
    const isConnector = (intro: ContactIntroduction) => (
      intro.connector_contact_id === peekContact.id ||
      sameName(intro.connector_name, peekContact.name) ||
      (!intro.connector_contact_id && !intro.connector_name && intro.source_contact_id === peekContact.id)
    )
    const isRecipient = (intro: ContactIntroduction) => (
      intro.introduced_to_contact_id === peekContact.id ||
      sameName(intro.introduced_to_name, peekContact.name) ||
      (!intro.introduced_to_contact_id && !intro.introduced_to_name && intro.source_contact_id === peekContact.id)
    )
    const madeBy = introductions.filter(intro =>
      intro.direction === 'received' && (isConnector(intro) || isIntroduced(intro)),
    )
    const madeTo = introductions.filter(intro =>
      intro.direction === 'given' && (isRecipient(intro) || isIntroduced(intro)),
    )
    return { madeBy: madeBy.slice(0, 8), madeTo: madeTo.slice(0, 8) }
  }, [introductions, peekContact])

  useEffect(() => {
    if (!userId || !peekContactId) {
      setPeekFacts([])
      setPeekValues([])
      setPeekInteractions([])
      setPeekTodos([])
      return
    }
    let cancelled = false
    Promise.all([
      supabase.from('contact_facts').select('*').eq('user_id', userId).eq('contact_id', peekContactId).order('importance').order('created_at', { ascending: false }).limit(6),
      supabase.from('value_logs').select('*').eq('user_id', userId).eq('outreach_log_id', peekContactId).order('date', { ascending: false }).limit(6),
      supabase.from('interactions').select('*').eq('user_id', userId).eq('contact_id', peekContactId).order('interaction_date', { ascending: false }).limit(6),
      supabase.from('todos').select('*').eq('user_id', userId).eq('contact_id', peekContactId).eq('completed', false).order('date', { nullsFirst: false }).limit(6),
    ]).then(([factsRes, valuesRes, interactionsRes, todosRes]) => {
      if (cancelled) return
      setPeekFacts((factsRes.data ?? []) as ContactFact[])
      setPeekValues((valuesRes.data ?? []) as ValueLog[])
      setPeekInteractions((interactionsRes.data ?? []) as Interaction[])
      setPeekTodos((todosRes.data ?? []) as Todo[])
    })
    return () => { cancelled = true }
  }, [peekContactId, userId])

  useEffect(() => {
    setNewValueDirection('given')
    setNewValueType('other')
    setNewValueText('')
    setNewFactText('')
    setNewDateLabel('')
    setNewDateWhen('')
    setNewIntroByName('')
    setNewIntroByCompany('')
    setNewIntroToName('')
    setNewIntroToCompany('')
  }, [peekContactId])

  const updatePeekContact = useCallback(async (patch: Parameters<typeof updateContact>[1]) => {
    if (!peekContactId) return
    await updateContact(peekContactId, patch)
  }, [peekContactId, updateContact])

  const addValueLog = useCallback(async () => {
    if (!userId || !peekContactId || !newValueText.trim()) return
    const { data, error } = await supabase.from('value_logs').insert({
      user_id: userId,
      outreach_log_id: peekContactId,
      type: newValueType,
      direction: newValueDirection,
      description: newValueText.trim(),
      date: localDate(),
    }).select('*').single()
    if (error || !data) return
    setPeekValues(prev => [data as ValueLog, ...prev])
    setNewValueText('')
    setNewValueType('other')
    setNewValueDirection('given')
  }, [newValueDirection, newValueText, newValueType, peekContactId, userId])

  const updateValueLog = useCallback(async (id: string, patch: Partial<Pick<ValueLog, 'description' | 'type' | 'direction' | 'date'>>) => {
    const { data, error } = await supabase.from('value_logs').update(patch).eq('id', id).select('*').single()
    if (error || !data) return
    setPeekValues(prev => prev.map(row => row.id === id ? data as ValueLog : row))
  }, [])

  const deleteValueLog = useCallback(async (id: string) => {
    await supabase.from('value_logs').delete().eq('id', id)
    setPeekValues(prev => prev.filter(row => row.id !== id))
  }, [])

  const addFact = useCallback(async () => {
    if (!userId || !peekContactId || !newFactText.trim()) return
    const { data, error } = await supabase.from('contact_facts').insert({
      user_id: userId,
      contact_id: peekContactId,
      category: 'other',
      label: null,
      value: newFactText.trim(),
      importance: 2,
      expires_at: null,
      source: 'manual',
    }).select('*').single()
    if (error || !data) return
    setPeekFacts(prev => [data as ContactFact, ...prev])
    setNewFactText('')
  }, [newFactText, peekContactId, userId])

  const addKeyDate = useCallback(async () => {
    if (!userId || !peekContactId || !newDateLabel.trim() || !newDateWhen) return
    const { data, error } = await supabase.from('contact_facts').insert({
      user_id: userId,
      contact_id: peekContactId,
      category: 'other',
      label: newDateLabel.trim(),
      value: newDateLabel.trim(),
      importance: 2,
      expires_at: newDateWhen,
      source: 'manual',
    }).select('*').single()
    if (error || !data) return
    setPeekFacts(prev => [data as ContactFact, ...prev])
    setNewDateLabel('')
    setNewDateWhen('')
  }, [newDateLabel, newDateWhen, peekContactId, userId])

  const updateFact = useCallback(async (id: string, patch: Partial<Pick<ContactFact, 'label' | 'value' | 'expires_at'>>) => {
    const { data, error } = await supabase.from('contact_facts').update(patch).eq('id', id).select('*').single()
    if (error || !data) return
    setPeekFacts(prev => prev.map(row => row.id === id ? data as ContactFact : row))
  }, [])

  const deleteFact = useCallback(async (id: string) => {
    await supabase.from('contact_facts').delete().eq('id', id)
    setPeekFacts(prev => prev.filter(row => row.id !== id))
  }, [])

  const addIntroduction = useCallback(async (direction: ContactIntroduction['direction']) => {
    if (!userId || !peekContact) return
    const targetName = direction === 'received' ? newIntroByName.trim() : newIntroToName.trim()
    const targetCompany = direction === 'received' ? newIntroByCompany.trim() : newIntroToCompany.trim()
    if (!targetName) return
    const payload = direction === 'received'
      ? {
          user_id: userId,
          source_contact_id: peekContact.id,
          connector_contact_id: peekContact.id,
          connector_name: peekContact.name,
          introduced_person_name: targetName,
          introduced_person_company: targetCompany || null,
          introduced_to_name: 'You',
          relationship_context: null,
          status: 'made',
          direction,
          confidence: 'medium',
          source_channel: 'manual',
          source_interaction_date: localDate(),
          source_external_id: `manual-intro-${peekContact.id}-${Date.now()}`,
        }
      : {
          user_id: userId,
          source_contact_id: peekContact.id,
          introduced_person_name: targetName,
          introduced_person_company: targetCompany || null,
          introduced_to_contact_id: peekContact.id,
          introduced_to_name: peekContact.name,
          introduced_to_company: peekContact.company,
          relationship_context: null,
          status: 'made',
          direction,
          confidence: 'medium',
          source_channel: 'manual',
          source_interaction_date: localDate(),
          source_external_id: `manual-intro-${peekContact.id}-${Date.now()}`,
        }
    const { data, error } = await supabase.from('contact_introductions').insert(payload).select('*').single()
    if (error || !data) return
    setIntroductions(prev => [data as ContactIntroduction, ...prev])
    if (direction === 'received') {
      setNewIntroByName('')
      setNewIntroByCompany('')
    } else {
      setNewIntroToName('')
      setNewIntroToCompany('')
    }
  }, [newIntroByCompany, newIntroByName, newIntroToCompany, newIntroToName, peekContact, userId])

  const updateIntroduction = useCallback(async (id: string, patch: Partial<Pick<ContactIntroduction, 'connector_name' | 'introduced_person_name' | 'introduced_person_company' | 'introduced_to_name' | 'introduced_to_company' | 'relationship_context' | 'status'>>) => {
    const { data, error } = await supabase.from('contact_introductions').update(patch).eq('id', id).select('*').single()
    if (error || !data) return
    setIntroductions(prev => prev.map(row => row.id === id ? data as ContactIntroduction : row))
  }, [])

  const openConversation = (contact: Contact, context: string) => {
    setConversationContact(contact)
    setConversationContext(context)
  }

  const handleBulkTier = useCallback(async (tier: 1 | 2 | 3 | null) => {
    if (selectedIds.size === 0) return
    setBulkTagging(true)
    try {
      await bulkUpdateContacts(Array.from(selectedIds), { tier })
      setSelectedIds(new Set())
    } finally {
      setBulkTagging(false)
    }
  }, [selectedIds, bulkUpdateContacts])

  const handleBulkDomain = useCallback(async (domain: 'professional' | 'personal' | 'mixed') => {
    if (selectedIds.size === 0) return
    setBulkTagging(true)
    try {
      // when moving to personal, clear pro tier; when moving to professional, clear personal_tier
      const patch: Record<string, unknown> = { relationship_domain: domain }
      if (domain === 'personal') patch.tier = null
      if (domain === 'professional') patch.personal_tier = null
      await bulkUpdateContacts(Array.from(selectedIds), patch)
      setSelectedIds(new Set())
    } finally {
      setBulkTagging(false)
    }
  }, [selectedIds, bulkUpdateContacts])

  const handleBulkPersonalTier = useCallback(async (pt: 'inner_circle' | 'close' | 'casual' | null) => {
    if (selectedIds.size === 0) return
    setBulkTagging(true)
    try {
      await bulkUpdateContacts(Array.from(selectedIds), {
        personal_tier: pt,
        ...(pt ? { relationship_domain: 'personal' as const } : {}),
      })
      setSelectedIds(new Set())
    } finally {
      setBulkTagging(false)
    }
  }, [selectedIds, bulkUpdateContacts])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleNewPerson = () => {
    setNewPersonOpen(true)
  }

  const introTarget = useCallback((intro: ContactIntroduction) => {
    const findByName = (name: string | null | undefined) => contacts.find(contact => sameName(contact.name, name))
    const selfIsIntroduced = peekContact && (
      intro.introduced_contact_id === peekContact.id ||
      sameName(intro.introduced_person_name, peekContact.name)
    )
    if (selfIsIntroduced && intro.direction === 'received') {
      const linked = intro.connector_contact_id
        ? contactsById.get(intro.connector_contact_id)
        : findByName(intro.connector_name) ?? contactsById.get(intro.source_contact_id)
      return {
        role: 'connector' as const,
        id: linked?.id ?? intro.connector_contact_id ?? intro.source_contact_id,
        name: linked?.name ?? intro.connector_name ?? 'Connector',
        company: linked?.company ?? 'Introduced you',
        photoUrl: linked?.profile_photo_url ?? null,
        context: intro.relationship_context ?? `introduced you to ${peekContact.name}`,
        date: intro.source_interaction_date,
      }
    }
    if (selfIsIntroduced && intro.direction === 'given') {
      const linked = intro.introduced_to_contact_id
        ? contactsById.get(intro.introduced_to_contact_id)
        : findByName(intro.introduced_to_name) ?? contactsById.get(intro.source_contact_id)
      return {
        role: 'recipient' as const,
        id: linked?.id ?? intro.introduced_to_contact_id ?? intro.source_contact_id,
        name: linked?.name ?? intro.introduced_to_name ?? 'Recipient',
        company: linked?.company ?? intro.introduced_to_company ?? 'Introduced to',
        photoUrl: linked?.profile_photo_url ?? null,
        context: intro.relationship_context ?? `you introduced ${peekContact.name}`,
        date: intro.source_interaction_date,
      }
    }
    const linked = intro.introduced_contact_id ? contactsById.get(intro.introduced_contact_id) : null
    return {
      role: 'introduced' as const,
      id: linked?.id ?? intro.introduced_contact_id,
      name: linked?.name ?? intro.introduced_person_name ?? 'Unknown person',
      company: linked?.company ?? intro.introduced_person_company ?? 'Network',
      photoUrl: linked?.profile_photo_url ?? null,
      context: intro.relationship_context,
      date: intro.source_interaction_date,
    }
  }, [contacts, contactsById, peekContact])

  const introRow = useCallback((intro: ContactIntroduction) => {
    const target = introTarget(intro)
    const isLinked = Boolean(target.id && contactsById.has(target.id))
    const saveIntroName = (value: string | null) => {
      if (target.role === 'connector') return updateIntroduction(intro.id, { connector_name: value })
      if (target.role === 'recipient') return updateIntroduction(intro.id, { introduced_to_name: value })
      return updateIntroduction(intro.id, { introduced_person_name: value })
    }
    const saveIntroCompany = (value: string | null) => {
      if (target.role === 'recipient') return updateIntroduction(intro.id, { introduced_to_company: value })
      if (target.role === 'introduced') return updateIntroduction(intro.id, { introduced_person_company: value })
      return Promise.resolve()
    }
    return (
      <div
        className={`pk-person${isLinked ? ' clickable' : ''}`}
        key={intro.id}
      >
        <button
          className="peek-row-avatar"
          onClick={() => { if (target.id && contactsById.has(target.id)) setPeekContactId(target.id) }}
          aria-label={`Open ${target.name}`}
        >
          {target.photoUrl ? <img src={target.photoUrl} alt="" /> : contactInitials(target.name)}
        </button>
        <span className="pk-person-txt">
          <span className="pk-person-name">
            <EditablePeekInput
              value={target.name}
              placeholder="Person introduced"
              onSave={saveIntroName}
            />
          </span>
          <span className="pk-person-role">
            <EditablePeekInput
              value={target.company}
              placeholder="Company"
              onSave={saveIntroCompany}
            />
            <EditablePeekInput
              value={intro.relationship_context}
              placeholder="Context"
              onSave={value => updateIntroduction(intro.id, { relationship_context: value })}
            />
          </span>
        </span>
        <span className="peek-row-side">
          <EditablePeekSelect
            value={intro.status}
            options={INTRO_STATUS_OPTIONS.map(value => ({ value, label: value }))}
            onSave={value => updateIntroduction(intro.id, { status: value })}
          />
          <span className="pk-intro-date">{target.date}</span>
        </span>
      </div>
    )
  }, [contactsById, introTarget, updateIntroduction])

  const referrerName = peekContact?.referred_by
    ? contactsById.get(peekContact.referred_by)?.name ?? peekContact.referred_by
    : '—'
  const peekValueGiven = peekValues.filter(v => v.direction === 'given').length
  const peekValueReceived = peekValues.filter(v => v.direction === 'received').length
  const peekDateFacts = peekFacts.filter(f => f.expires_at)
  const peekMemoryFacts = peekFacts.filter(f => !f.expires_at)
  const peekWhyNow = [
    peekTodos[0]?.date ? `${peekTodos[0].text} · due ${peekTodos[0].date}` : peekTodos[0]?.text ?? null,
    peekContact?.last_interaction_at ? `Last touch ${formatAgo(daysSince(peekContact.last_interaction_at))}` : null,
    peekContact?.status === 'DORMANT' || peekContact?.status === 'RECONNECT' ? 'Relationship needs reactivation' : null,
  ].filter(Boolean) as string[]
  const tierEditor = peekContact ? (
    <span className="peek-tier-edit">
      <select
        className={`peek-inline-input peek-inline-select crm-chip tier ${peekContact.tier ? `t${peekContact.tier}` : ''}`}
        style={{ '--chip': peekContact.tier === 1 ? 'var(--tier-1)' : peekContact.tier === 2 ? 'var(--tier-2)' : 'var(--moss)' } as CSSProperties}
        value={peekContact.tier ?? ''}
        onChange={event => { void updatePeekContact({ tier: event.target.value ? Number(event.target.value) as 1 | 2 | 3 : null }) }}
      >
        <option value="">No tier</option>
        <option value="1">T1</option>
        <option value="2">T2</option>
        <option value="3">T3</option>
      </select>
    </span>
  ) : null

  const contactColumns: CrmColumn<Contact>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Person',
      locked: true,
      width: 'minmax(220px, 1.4fr)',
      icon: <Users size={12} />,
      render: contact => (
        <span className="crm-name">
          <ContactAvatar name={contact.name} photoUrl={contact.profile_photo_url} size={24} />
          <span className="link">{contact.name}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '116px',
      render: contact => <span className="crm-pill">{contact.status}</span>,
    },
    {
      key: 'this_week',
      label: 'This week',
      width: 'minmax(190px, 1fr)',
      render: contact => (
        <span className="mv-cell">
          <span className="mv-dot" />
          <span className="mv-txt">{contact.last_interaction_at ? `Last touched ${formatAgo(daysSince(contact.last_interaction_at))}` : 'no movement'}</span>
        </span>
      ),
    },
    {
      key: 'value',
      label: 'Value',
      width: '104px',
      render: contact => (
        <span className={`val-bar ${contact.tier === 1 ? 'owe' : 'even'}`}>
          <span className="val-num">{contact.tier === 1 ? '-1' : '0'}</span>
          <span className="val-lbl">{contact.tier === 1 ? 'you owe' : 'even'}</span>
        </span>
      ),
    },
    {
      key: 'tier',
      label: 'Tier',
      width: '84px',
      render: contact => contact.tier
        ? <span className="crm-chip tier" style={{ '--chip': contact.tier === 1 ? '#266DF0' : contact.tier === 2 ? '#6F7988' : '#8F99A8' } as CSSProperties}>T{contact.tier}</span>
        : <span className="crm-empty">—</span>,
    },
    {
      key: 'company',
      label: 'Company',
      width: '170px',
      render: contact => contact.company
        ? (
          <span className="crm-name">
            <span className="crm-av sq logo">{contact.company[0]?.toUpperCase()}</span>
            <span className="link">{contact.company}</span>
          </span>
        )
        : <span className="crm-empty">No company</span>,
    },
    {
      key: 'channels',
      label: 'Channels',
      width: '96px',
      render: contact => <ChannelIcons channels={channels.filter(ch => ch.outreach_log_id === contact.id)} />,
    },
    {
      key: 'last',
      label: 'Last',
      width: '78px',
      align: 'right',
      render: contact => <span className="crm-mono">{formatAgo(daysSince(contact.last_interaction_at))}</span>,
    },
    {
      key: 'next',
      label: 'Next step',
      width: 'minmax(220px, 1fr)',
      render: contact => <span className="crm-next">{contact.notes || contact.looking_for || 'Add the next move.'}</span>,
    },
  ], [channels])

  return (
    <div className="ppl-page">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">People</h1>
          <p className="ppl-sub">What happened this week, who needs movement now, and what you owe before you ask.</p>
        </div>
        <div className="ppl-tabs">
          <button
            onClick={() => setViewMode('focus')}
            className={`ppl-tab ${viewMode === 'focus' ? 'active' : ''}`}
            title="Focus"
          >
            <Lightning size={13} /><span>Focus</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`ppl-tab ${viewMode === 'table' ? 'active' : ''}`}
            title="List"
          >
            <Table size={13} /><span>List</span>
          </button>
          <button
            onClick={() => setViewMode('network')}
            className={`ppl-tab ${viewMode === 'network' ? 'active' : ''}`}
            title="Network"
          >
            <GitFork size={13} /><span>Network</span>
          </button>
        </div>
      </header>

      {/* ── Bulk action bar (shows when ≥1 selected) ──────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="people-bulkbar flex items-center gap-3 px-6 py-1.5 border-b border-mercury/50 bg-gossip/20 shrink-0 text-[11px]">
          <span className="font-semibold text-burnham">
            {selectedIds.size} selected
          </span>

          {/* Domain */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-shuttle/60">Domain:</span>
            {([
              { key: 'professional', label: 'Pro', icon: <Briefcase size={11} /> },
              { key: 'mixed',        label: 'Mix', icon: <GitFork size={11} /> },
              { key: 'personal',     label: 'Pers', icon: <Users size={11} /> },
            ] as const).map(d => (
              <button
                key={d.key}
                onClick={() => handleBulkDomain(d.key)}
                disabled={bulkTagging}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-mercury hover:border-burnham/40 bg-white text-shuttle hover:text-burnham disabled:opacity-40 transition-colors flex items-center gap-0.5"
              >
                <span>{d.icon}</span>{d.label}
              </button>
            ))}
          </div>

          {/* Pro tier */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-shuttle/60 flex items-center gap-1">
              Tier <TierInfoHelper />
            </span>
            {([1, 2, 3] as const).map(t => (
              <button
                key={t}
                onClick={() => handleBulkTier(t)}
                disabled={bulkTagging}
                className="text-[10px] font-medium w-6 py-0.5 rounded border border-mercury hover:border-burnham/40 bg-white text-shuttle hover:text-burnham disabled:opacity-40 transition-colors"
              >
                T{t}
              </button>
            ))}
            <button
              onClick={() => handleBulkTier(null)}
              disabled={bulkTagging}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-shuttle/40 hover:text-shuttle hover:bg-mercury/30 disabled:opacity-40 transition-colors"
              title="Clear professional tier"
              aria-label="Clear professional tier"
            >
              <X size={10} weight="bold" />
            </button>
          </div>

          {/* Personal tier */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-shuttle/60">Circle:</span>
            {([
              { key: 'inner_circle', label: 'Inner' },
              { key: 'close',        label: 'Close' },
              { key: 'casual',       label: 'Casual' },
            ] as const).map(p => (
              <button
                key={p.key}
                onClick={() => handleBulkPersonalTier(p.key)}
                disabled={bulkTagging}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-mercury hover:border-burnham/40 bg-white text-shuttle hover:text-burnham disabled:opacity-40 transition-colors"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => handleBulkPersonalTier(null)}
              disabled={bulkTagging}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-shuttle/40 hover:text-shuttle hover:bg-mercury/30 disabled:opacity-40 transition-colors"
              title="Clear personal tier"
              aria-label="Clear personal tier"
            >
              <X size={10} weight="bold" />
            </button>
          </div>

          {selectedIds.size === 2 && (
            <button
              onClick={() => setMergeModalOpen(true)}
              disabled={bulkTagging}
              className="text-[10px] font-medium text-burnham border border-burnham/30 hover:border-burnham hover:bg-burnham hover:text-white px-2 py-0.5 rounded transition-colors disabled:opacity-40"
            >
              Merge two...
            </button>
          )}

          <button
            onClick={clearSelection}
            className="ml-auto text-[10px] text-shuttle/50 hover:text-shuttle transition-colors"
          >
            Deselect all
          </button>
        </div>
      )}

      {/* Merge modal */}
      {mergeModalOpen && selectedIds.size === 2 && (() => {
        const [idA, idB] = Array.from(selectedIds)
        const a = contacts.find(c => c.id === idA)
        const b = contacts.find(c => c.id === idB)
        if (!a || !b) return null
        return (
          <MergeContactsModal
            contactA={a}
            contactB={b}
            onClose={() => setMergeModalOpen(false)}
            onMerge={async (survivorId, duplicateId) => {
              const r = await mergeContacts(survivorId, duplicateId)
              if (r.ok) setSelectedIds(new Set())
              return r
            }}
          />
        )
      })()}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {viewMode === 'focus' ? (
          /* ── Focus view (manager / daily relationship brief) ──────────── */
          <div className="p-6">
            <PeopleFocus
              userId={userId}
              contacts={contacts}
              channels={channels}
              onOpenPerson={handleRowClick}
              onOpenOpportunity={opp => navigate(`/people/opportunities/${opp.id}`)}
              onContact={(contact, context) => openConversation(contact, context)}
            />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
          </div>
        ) : viewMode === 'table' ? (
          <CrmTable
            entity="people"
            title="Network this week"
            viewName="Network this week"
            rows={filtered}
            columns={contactColumns}
            selectedId={peekContactId}
            view={crmView}
            onViewChange={v => setCrmView(v as 'table' | 'kanban')}
            views={[
              { id: 'table', label: 'Table', type: 'table' },
              { id: 'kanban', label: 'Kanban', type: 'kanban' },
            ]}
            addLabel="New person"
            onAdd={handleNewPerson}
            onRowClick={handleRowClick}
            storageKey="people"
            kanban={{
              groupLabel: 'Status',
              stages: KANBAN_COLUMNS.map(col => ({ id: col.status, label: col.label, color: col.status === 'ENGAGED' ? '#266DF0' : col.status === 'DORMANT' ? '#C23A3A' : '#6F7988' })),
              groupValue: contact => contact.status,
              cardColumns: ['company', 'tier', 'last'],
              onMove: async (contact, stage) => {
                if (stage && contact.status !== stage) await updateContact(contact.id, { status: stage as ContactStatus })
              },
            }}
          />
        ) : viewMode === 'network' ? (
          <div className="p-6">
            <PeopleNetwork
              userId={userId}
              contacts={contacts}
              introductions={introductions}
              onOpenPerson={handleRowClick}
              onOpenOpportunity={opp => navigate(`/people/opportunities/${opp.id}`)}
              onContact={(contact, context) => openConversation(contact, context)}
            />
          </div>
        ) : null}
      </div>

      <NewPersonPeek
        open={newPersonOpen}
        userId={userId}
        goals={goals}
        onClose={() => setNewPersonOpen(false)}
        onSave={async (input, todoText) => {
          const contact = await addContact(input)
          if (contact) {
            setPeekContactId(contact.id)
            if (todoText?.trim() && userId) {
              await supabase.from('todos').insert({
                user_id: userId,
                contact_id: contact.id,
                text: todoText.trim(),
                date: localDate(),
                content_segments: [
                  { type: 'text', text: todoText.trim() },
                  { type: 'mention', kind: 'person', id: contact.id, label: contact.name, imageUrl: contact.profile_photo_url ?? null },
                ],
              })
            }
          }
        }}
      />
      {userId && (
        <ConversationsDrawer
          open={Boolean(conversationContact)}
          userId={userId}
          contact={conversationContact}
          context={conversationContext}
          onClose={() => { setConversationContact(null); setConversationContext('') }}
        />
      )}
      <RecordPeek
        open={Boolean(peekContact)}
        title={peekContact?.name ?? ''}
        subtitle={peekContact ? [peekContact.job_title, peekContact.company].filter(Boolean).join(' · ') || peekContact.email : undefined}
        eyebrow="Person"
        avatar={peekContact && (
          <ContactAvatar name={peekContact.name} photoUrl={peekContact.profile_photo_url} size={38} />
        )}
        index={peekIndex >= 0 ? peekIndex : undefined}
        total={filtered.length}
        highlights={peekContact ? [
          { label: 'Connection strength', icon: <Heartbeat size={13} />, value: (peekContact.connection_strength ?? 0).toFixed(1) },
          { label: 'Relationship', icon: <CircleHalf size={13} />, value: peekContact.status },
          { label: 'Channels', icon: <Broadcast size={13} />, value: [peekContact.email && 'email', peekContact.phone && 'phone', peekContact.linkedin_url && 'linkedin'].filter(Boolean).join(' · ') || '—' },
          { label: 'Daisy chain', icon: <GitFork size={13} />, value: referrerName },
          { label: 'Opportunity', icon: <Target size={13} />, value: peekContact.looking_for || '—' },
          { label: 'Company', icon: <Buildings size={13} />, value: peekContact.company || 'No company' },
        ] : []}
        fields={peekContact ? [
          { label: 'Name', icon: <IdentificationCard size={12} />, value: <EditablePeekInput value={peekContact.name} placeholder="Name" onSave={value => updatePeekContact({ name: value || peekContact.name })} /> },
          { label: 'Email', icon: <At size={12} />, value: <EditablePeekInput type="email" value={peekContact.email} placeholder="email@company.com" onSave={value => updatePeekContact({ email: value })} /> },
          { label: 'Company', icon: <Buildings size={12} />, value: <EditablePeekInput value={peekContact.company} placeholder="No company" onSave={value => updatePeekContact({ company: value })} /> },
          { label: 'Role', icon: <Briefcase size={12} />, value: <EditablePeekInput value={peekContact.job_title} placeholder="Set role..." onSave={value => updatePeekContact({ job_title: value })} /> },
          { label: 'Location', icon: <MapPin size={12} />, value: <EditablePeekInput value={peekContact.location} placeholder="Location" onSave={value => updatePeekContact({ location: value })} /> },
        ] : []}
        recommendedMove={peekTodos[0] ? {
          verb: peekTodos[0].text,
          detail: peekTodos[0].date ? `Due ${peekTodos[0].date}` : 'Open next step from this relationship.',
          action: peekTodos[0].text,
          accent: 'var(--moss)',
        } : null}
        whyNow={peekWhyNow}
        overviewBeforeHighlights
        activityTitle="Relationship memory"
        listItems={[tierEditor, <span className="peek-tag">Recently contacted</span>].filter(Boolean)}
        docs={docsFromTodos(peekTodos)}
        activity={peekInteractions.map(interaction => ({
          text: <><strong>You</strong> logged {interaction.type}{interaction.notes ? ` · ${interaction.notes}` : ''}</>,
          when: interaction.interaction_date,
          source: interaction.next_step || undefined,
        }))}
        onClose={() => setPeekContactId(null)}
        onPrev={peekIndex > 0 ? () => setPeekContactId(filtered[peekIndex - 1].id) : undefined}
        onNext={peekIndex >= 0 && peekIndex < filtered.length - 1 ? () => setPeekContactId(filtered[peekIndex + 1].id) : undefined}
      >
        <div className="peek-block-label spaced">Value ledger <ValueBalance given={peekValueGiven} received={peekValueReceived} /></div>
        <div className="peek-ledger">
          {peekValues.length === 0 ? <p className="peek-empty-lists">No value logs yet.</p> : peekValues.map(v => (
            <div className={`pl-act ${v.direction === 'received' ? 'received' : 'given'}`} key={v.id}>
              <span className="pl-dir">{v.direction === 'received' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}</span>
              <span className="pl-txt peek-edit-stack">
                <EditablePeekSelect
                  value={v.direction}
                  options={[{ value: 'given', label: 'given' }, { value: 'received', label: 'received' }]}
                  onSave={value => updateValueLog(v.id, { direction: value })}
                />
                <EditablePeekSelect
                  value={v.type}
                  options={VALUE_TYPES.map(value => ({ value, label: value }))}
                  onSave={value => updateValueLog(v.id, { type: value })}
                />
                <EditablePeekInput value={v.description} placeholder="What value moved?" onSave={value => updateValueLog(v.id, { description: value })} />
              </span>
              <span className="peek-row-side">
                <EditablePeekInput type="date" value={v.date} onSave={value => updateValueLog(v.id, { date: value || localDate() })} />
                <button className="peek-trash" onClick={() => void deleteValueLog(v.id)} aria-label="Delete value log"><Trash size={12} /></button>
              </span>
            </div>
          ))}
          <div className="peek-add-line">
            <EditablePeekSelect
              value={newValueDirection}
              options={[{ value: 'given', label: 'given' }, { value: 'received', label: 'received' }]}
              onSave={setNewValueDirection}
            />
            <EditablePeekSelect
              value={newValueType}
              options={VALUE_TYPES.map(value => ({ value, label: value }))}
              onSave={setNewValueType}
            />
            <input className="peek-inline-input" value={newValueText} onChange={event => setNewValueText(event.target.value)} placeholder="Add value log..." onKeyDown={event => { if (event.key === 'Enter') void addValueLog() }} />
            <button className="peek-add-btn" onClick={() => void addValueLog()}><Plus size={10} />Add</button>
          </div>
        </div>

        <div className="peek-block-label spaced">Introductions</div>
        <div className="peek-intro-grid">
          <div className="peek-intro-col">
            <div className="peek-intro-hd">Opened for you <span className="peek-count">{introsByPeek.madeBy.length}</span></div>
            <div className="peek-linked">
              {introsByPeek.madeBy.length === 0
                ? <p className="peek-empty-lists">No introductions captured from this person yet.</p>
                : introsByPeek.madeBy.map(introRow)}
              <div className="peek-add-line vertical">
                <input className="peek-inline-input" value={newIntroByName} onChange={event => setNewIntroByName(event.target.value)} placeholder="Person they introduced" />
                <input className="peek-inline-input" value={newIntroByCompany} onChange={event => setNewIntroByCompany(event.target.value)} placeholder="Company" onKeyDown={event => { if (event.key === 'Enter') void addIntroduction('received') }} />
                <button className="peek-add-btn" onClick={() => void addIntroduction('received')}><Plus size={10} />Add intro</button>
              </div>
            </div>
          </div>
          <div className="peek-intro-col">
            <div className="peek-intro-hd">You introduced <span className="peek-count">{introsByPeek.madeTo.length}</span></div>
            <div className="peek-linked">
              {introsByPeek.madeTo.length === 0
                ? <p className="peek-empty-lists">No introductions you made to this person yet.</p>
                : introsByPeek.madeTo.map(introRow)}
              <div className="peek-add-line vertical">
                <input className="peek-inline-input" value={newIntroToName} onChange={event => setNewIntroToName(event.target.value)} placeholder="Person you introduced" />
                <input className="peek-inline-input" value={newIntroToCompany} onChange={event => setNewIntroToCompany(event.target.value)} placeholder="Company" onKeyDown={event => { if (event.key === 'Enter') void addIntroduction('given') }} />
                <button className="peek-add-btn" onClick={() => void addIntroduction('given')}><Plus size={10} />Add intro</button>
              </div>
            </div>
          </div>
        </div>

        <div className="peek-block-label spaced">Facts</div>
        <div className="peek-captured">
          {peekMemoryFacts.length === 0 ? <p className="peek-empty-lists">No facts yet — add what you learn.</p> : peekMemoryFacts.map(f => (
            <div className="pk-cap" key={f.id}>
              <span className="pk-cap-ic"><Info size={13} /></span>
              <span className="pk-cap-tx peek-edit-stack">
                <EditablePeekInput value={f.label} placeholder="Label" onSave={value => updateFact(f.id, { label: value })} />
                <EditablePeekInput value={f.value} placeholder="Fact" onSave={value => updateFact(f.id, { value: value || f.value })} />
              </span>
              <button className="peek-trash" onClick={() => void deleteFact(f.id)} aria-label="Delete fact"><Trash size={12} /></button>
            </div>
          ))}
          <div className="peek-add-line">
            <input className="peek-inline-input" value={newFactText} onChange={event => setNewFactText(event.target.value)} placeholder="Add fact..." onKeyDown={event => { if (event.key === 'Enter') void addFact() }} />
            <button className="peek-add-btn" onClick={() => void addFact()}><Plus size={10} />Add</button>
          </div>
        </div>

        <div className="peek-block-label spaced">Key dates</div>
        <div className="peek-captured">
          {peekDateFacts.length === 0 ? <p className="peek-empty-lists">No key dates yet.</p> : peekDateFacts.map(f => (
            <div className="pk-cap date" key={f.id}>
              <span className="pk-cap-ic"><CalendarBlank size={13} /></span>
              <span className="pk-cap-tx"><EditablePeekInput value={f.label || f.value} placeholder="Date label" onSave={value => updateFact(f.id, { label: value, value: value || f.value })} /></span>
              <span className="peek-row-side">
                <EditablePeekInput type="date" value={f.expires_at} onSave={value => updateFact(f.id, { expires_at: value })} />
                <button className="peek-trash" onClick={() => void deleteFact(f.id)} aria-label="Delete key date"><Trash size={12} /></button>
              </span>
            </div>
          ))}
          <div className="peek-add-line">
            <input className="peek-inline-input" value={newDateLabel} onChange={event => setNewDateLabel(event.target.value)} placeholder="Add key date..." />
            <input className="peek-inline-input" type="date" value={newDateWhen} onChange={event => setNewDateWhen(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addKeyDate() }} />
            <button className="peek-add-btn" onClick={() => void addKeyDate()}><Plus size={10} />Add</button>
          </div>
        </div>
      </RecordPeek>
    </div>
  )
}
