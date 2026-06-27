import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Lightning, Users,
  WhatsappLogo, LinkedinLogo, TwitterLogo, IdentificationCard, At, Buildings,
  Briefcase, MapPin, Heartbeat, CircleHalf, Broadcast, GitFork, Target,
  ArrowUpRight, ArrowDownLeft, Info, CalendarBlank, NotePencil, Plus, Trash, Check, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type {
  Company, Contact, ContactFact, ContactIntroduction, ContactStatus, Interaction, InteractionDetail,
  InteractionSuggestion, List, Todo, Opportunity, OpportunityStage, OpportunityType, ValueDirection,
  ValueLog, ValueLogType,
} from '@/types'
import { useContacts } from '@/hooks/useContacts'
import { addRecordToList } from '@/hooks/useLists'
import { GMAIL_SYNC_EVENT, type GmailSyncEventDetail } from '@/hooks/useGmailAutoSync'
import PeopleFocus from '@/components/PeopleFocus'
import PeopleNetwork from '@/components/PeopleNetwork'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import ConversationsDrawer from '@/components/crm/ConversationsDrawer'
import NewPersonPeek from '@/components/crm/NewPersonPeek'
import RecordPeek from '@/components/crm/RecordPeek'
import EditablePeekSelect from '@/components/crm/EditablePeekSelect'
import EditableCurrencyInput from '@/components/crm/EditableCurrencyInput'
import { Avatar, TierChip, ValueBar, RelStatus } from '@/components/crm/cells'
import { relFromContact } from '@/lib/abm'
import { OPPORTUNITY_STAGE_OPTIONS, opportunityStageLabel } from '@/lib/opportunityStages'
import { formatCurrency } from '@/lib/formatters'
import { approveInteractionSuggestion, dismissInteractionSuggestion } from '@/lib/interactionSuggestions'

// Source label for an Activity row — matches the handoff peek (text "· WhatsApp"),
// derived from the interaction's channel/type provenance.
const INTERACTION_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', wa: 'WhatsApp', linkedin: 'LinkedIn', linkedin_msg: 'LinkedIn',
  email: 'Gmail', call: 'Phone', virtual_coffee: 'Video call',
  in_person: 'In person', x: 'X', exit5: 'Exit Five', other: 'Note',
}
function interactionLabel(i: { channel?: string | null; type?: string | null }): string | undefined {
  return INTERACTION_LABEL[i.channel ?? ''] ?? INTERACTION_LABEL[i.type ?? '']
}

function interactionIcon(i: { channel?: string | null; type?: string | null }) {
  const raw = i.channel ?? i.type ?? ''
  if (raw === 'whatsapp' || raw === 'wa') return <WhatsappLogo size={12} />
  if (raw === 'linkedin' || raw === 'linkedin_msg') return <LinkedinLogo size={12} />
  if (raw === 'email') return <At size={12} />
  if (raw === 'call') return <Broadcast size={12} />
  return <NotePencil size={12} />
}

function emailNotePart(notes: string | null | undefined, label: string): string | null {
  if (!notes) return null
  const line = notes.split('\n').find(part => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return line ? line.slice(label.length + 1).trim() || null : null
}

function compactText(value: string | null | undefined, max = 120): string | null {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
import { TierInfoHelper } from '@/components/TierInfoHelper'
import MergeContactsModal from '@/components/MergeContactsModal'

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
  { status: 'INTRO',      label: 'Intro',      dot: 'bg-blue-400' },
  { status: 'CONNECTED',  label: 'Connected',  dot: 'bg-pastel' },
  { status: 'ENGAGED',    label: 'Engaged',    dot: 'bg-pastel' },
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
    const key = c.channel === 'wa' ? 'whatsapp' : c.channel
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const renderIcon = (channel: string) => {
    if (channel === 'whatsapp') return <WhatsappLogo size={11} className="text-green-500" />
    if (channel === 'linkedin') return <LinkedinLogo size={11} className="text-blue-500" />
    if (channel === 'x') return <TwitterLogo size={11} className="text-shuttle" />
    if (channel === 'email') return <At size={11} className="text-red-500" />
    if (channel === 'exit5') return <span className="text-[9px] font-bold text-shuttle/60">E5</span>
    return null
  }

  // Stable display order
  const ORDER = ['email', 'whatsapp', 'linkedin', 'x', 'exit5'] as const
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
              <span className="text-[8px] font-mono text-shuttle/50">×{count}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'focus' | 'table' | 'network'
type PeopleListMembership = {
  id: string
  list_id: string
  contact_id: string | null
  company_id?: string | null
  opportunity_id?: string | null
  current_stage: string
  list?: List | null
}
type PeopleOpportunityLink = { id: string; opportunity_id: string; outreach_log_id: string; role: string | null }
type PeopleNestedRecord = { type: 'person' | 'company' | 'deal'; id: string }
const OPPORTUNITY_STAGES = OPPORTUNITY_STAGE_OPTIONS
const OPPORTUNITY_TYPES: OpportunityType[] = ['job', 'consulting', 'business', 'partnership', 'other']

function formatDealValue(n: number | null): string {
  return formatCurrency(n)
}

export default function People() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('focus')
  const [crmView, setCrmView] = useState<'table' | 'kanban'>('table')
  const [newPersonOpen, setNewPersonOpen] = useState(false)
  const [peekContactId, setPeekContactId] = useState<string | null>(null)
  const [peekFacts, setPeekFacts] = useState<ContactFact[]>([])
  const [peekValues, setPeekValues] = useState<ValueLog[]>([])
  const [peekInteractions, setPeekInteractions] = useState<Interaction[]>([])
  const [peekInteractionDetails, setPeekInteractionDetails] = useState<Record<string, InteractionDetail>>({})
  const [peekSuggestions, setPeekSuggestions] = useState<InteractionSuggestion[]>([])
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null)
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
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [companyPickerQuery, setCompanyPickerQuery] = useState('')
  const [nestedStack, setNestedStack] = useState<PeopleNestedRecord[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [listMemberships, setListMemberships] = useState<PeopleListMembership[]>([])
  const [listPickerOpen, setListPickerOpen] = useState(false)
  const [listPickerQuery, setListPickerQuery] = useState('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [opportunityLinks, setOpportunityLinks] = useState<PeopleOpportunityLink[]>([])
  const [dealPickerOpen, setDealPickerOpen] = useState(false)
  const [dealPickerQuery, setDealPickerQuery] = useState('')
  const [dealPeoplePickerOpen, setDealPeoplePickerOpen] = useState(false)
  const [dealPeoplePickerQuery, setDealPeoplePickerQuery] = useState('')
  const [companyTeamPickerOpen, setCompanyTeamPickerOpen] = useState(false)
  const [companyTeamPickerQuery, setCompanyTeamPickerQuery] = useState('')
  const [companyDealPickerOpen, setCompanyDealPickerOpen] = useState(false)
  const [companyDealPickerQuery, setCompanyDealPickerQuery] = useState('')
  const [companyListPickerOpen, setCompanyListPickerOpen] = useState(false)
  const [companyListPickerQuery, setCompanyListPickerQuery] = useState('')
  const [nestedPersonDealPickerOpen, setNestedPersonDealPickerOpen] = useState(false)
  const [nestedPersonDealPickerQuery, setNestedPersonDealPickerQuery] = useState('')
  const [nestedPersonListPickerOpen, setNestedPersonListPickerOpen] = useState(false)
  const [nestedPersonListPickerQuery, setNestedPersonListPickerQuery] = useState('')
  const [nestedDealListPickerOpen, setNestedDealListPickerOpen] = useState(false)
  const [nestedDealListPickerQuery, setNestedDealListPickerQuery] = useState('')

  // Contact channels (loaded separately)
  const [channels, setChannels] = useState<Array<{ outreach_log_id: string; channel: string }>>([])
  // Value ledger per contact (given/received counts) for the List "Value" column
  const [ledgerByContact, setLedgerByContact] = useState<Map<string, { given: number; received: number }>>(new Map())

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
    supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId)
      .order('name')
      .then(({ data }) => setCompanies((data ?? []) as Company[]))
  }, [userId])

  const loadLists = useCallback(async () => {
    if (!userId) return
    const [{ data: listData }, { data: membershipData }] = await Promise.all([
      supabase.from('lists').select('*').eq('user_id', userId).eq('is_archived', false).order('created_at'),
      supabase.from('list_memberships').select('*').eq('user_id', userId),
    ])
    const listById = new Map((listData ?? []).map(list => [list.id, list as List]))
    setLists((listData ?? []) as List[])
    setListMemberships(((membershipData ?? []) as PeopleListMembership[]).map(membership => ({
      ...membership,
      list: listById.get(membership.list_id) ?? null,
    })))
  }, [userId])

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  const loadOpportunities = useCallback(async () => {
    if (!userId) return
    const [{ data: opportunityData }, { data: linkData }] = await Promise.all([
      supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('opportunity_contacts').select('*'),
    ])
    setOpportunities((opportunityData ?? []) as Opportunity[])
    setOpportunityLinks((linkData ?? []) as PeopleOpportunityLink[])
  }, [userId])

  useEffect(() => {
    void loadOpportunities()
  }, [loadOpportunities])

  // Load value ledger (given/received per contact) for the List "Value" column
  useEffect(() => {
    if (!userId) return
    supabase
      .from('value_logs')
      .select('outreach_log_id, direction')
      .eq('user_id', userId)
      .then(({ data }) => {
        const map = new Map<string, { given: number; received: number }>()
        for (const row of (data ?? []) as Array<{ outreach_log_id: string | null; direction: string }>) {
          if (!row.outreach_log_id) continue
          const cur = map.get(row.outreach_log_id) ?? { given: 0, received: 0 }
          if (row.direction === 'given') cur.given += 1
          else if (row.direction === 'received') cur.received += 1
          map.set(row.outreach_log_id, cur)
        }
        setLedgerByContact(map)
      })
  }, [userId])

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

  const filtered = [...contacts].sort((a, b) => {
    const aDate = a.last_interaction_at ?? a.created_at
    const bDate = b.last_interaction_at ?? b.created_at
    return bDate.localeCompare(aDate)
  })

  const handleRowClick = useCallback((c: Contact) => {
    setPeekContactId(c.id)
    setNestedStack([])
  }, [])
  const peekContact = filtered.find(c => c.id === peekContactId) ?? null
  const peekIndex = peekContact ? filtered.findIndex(c => c.id === peekContact.id) : -1
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])
  const nested = nestedStack[nestedStack.length - 1] ?? null
  const nestedPersonId = nested?.type === 'person' ? nested.id : null
  const nestedPerson = nestedPersonId ? contactsById.get(nestedPersonId) ?? null : null
  const companiesById = useMemo(() => new Map(companies.map(company => [company.id, company])), [companies])
  const nestedCompany = nested?.type === 'company' ? companiesById.get(nested.id) ?? null : null
  const peekCompany = peekContact
    ? (peekContact.company_id ? companiesById.get(peekContact.company_id) ?? null : companies.find(company => sameName(company.name, peekContact.company)))
    : null
  const nestedPersonCompany = nestedPerson
    ? (nestedPerson.company_id ? companiesById.get(nestedPerson.company_id) ?? null : companies.find(company => sameName(company.name, nestedPerson.company)))
    : null
  const peekListMemberships = peekContact ? listMemberships.filter(membership => membership.contact_id === peekContact.id) : []
  const peekDealLinks = peekContact ? opportunityLinks.filter(link => link.outreach_log_id === peekContact.id) : []
  const peekDeals = peekDealLinks
    .map(link => opportunities.find(opportunity => opportunity.id === link.opportunity_id))
    .filter(Boolean) as Opportunity[]
  const nestedDeal = nested?.type === 'deal' ? opportunities.find(opportunity => opportunity.id === nested.id) ?? null : null
  const nestedDealLinks = nestedDeal ? opportunityLinks.filter(link => link.opportunity_id === nestedDeal.id) : []
  const nestedDealPeople = nestedDealLinks
    .map(link => contacts.find(contact => contact.id === link.outreach_log_id))
    .filter(Boolean) as Contact[]
  const nestedPersonDealLinks = nestedPerson ? opportunityLinks.filter(link => link.outreach_log_id === nestedPerson.id) : []
  const nestedPersonDeals = nestedPersonDealLinks
    .map(link => opportunities.find(opportunity => opportunity.id === link.opportunity_id))
    .filter(Boolean) as Opportunity[]
  const nestedPersonListMemberships = nestedPerson ? listMemberships.filter(membership => membership.contact_id === nestedPerson.id) : []
  const nestedDealListMemberships = nestedDeal ? listMemberships.filter(membership => membership.opportunity_id === nestedDeal.id) : []
  const nestedDealOwner = nestedDeal?.owner_contact_id ? contacts.find(contact => contact.id === nestedDeal.owner_contact_id) ?? null : null
  const nestedDealCompany = nestedDeal?.company ?? (nestedDeal?.company_id ? companiesById.get(nestedDeal.company_id) ?? null : null)
  const nestedCompanyTeam = nestedCompany
    ? contacts.filter(contact => contact.company_id === nestedCompany.id || (!contact.company_id && sameName(contact.company, nestedCompany.name)))
    : []
  const nestedCompanyDeals = nestedCompany
    ? opportunities.filter(opportunity => opportunity.company_id === nestedCompany.id || opportunity.company?.id === nestedCompany.id)
    : []
  const nestedCompanyLists = nestedCompany
    ? listMemberships.filter(membership => membership.company_id === nestedCompany.id)
    : []
  const openNested = (record: PeopleNestedRecord) => {
    setCompanyPickerOpen(false)
    setDealPickerOpen(false)
    setDealPeoplePickerOpen(false)
    setCompanyTeamPickerOpen(false)
    setCompanyDealPickerOpen(false)
    setCompanyListPickerOpen(false)
    setNestedPersonDealPickerOpen(false)
    setNestedPersonListPickerOpen(false)
    setNestedDealListPickerOpen(false)
    setNestedStack(prev => [...prev, record])
  }
  const resetNested = () => {
    setNestedStack([])
    setCompanyPickerOpen(false)
    setDealPickerOpen(false)
    setDealPeoplePickerOpen(false)
    setCompanyTeamPickerOpen(false)
    setCompanyDealPickerOpen(false)
    setCompanyListPickerOpen(false)
    setNestedPersonDealPickerOpen(false)
    setNestedPersonListPickerOpen(false)
    setNestedDealListPickerOpen(false)
  }
  const backNested = () => {
    setDealPeoplePickerOpen(false)
    setCompanyTeamPickerOpen(false)
    setCompanyDealPickerOpen(false)
    setCompanyListPickerOpen(false)
    setNestedPersonDealPickerOpen(false)
    setNestedPersonListPickerOpen(false)
    setNestedDealListPickerOpen(false)
    setNestedStack(prev => prev.slice(0, -1))
  }
  const nestedBackLabel = (() => {
    const previous = nestedStack[nestedStack.length - 2]
    if (!previous) return peekContact?.name ?? 'person'
    if (previous.type === 'person') return contactsById.get(previous.id)?.name ?? 'person'
    if (previous.type === 'company') return companiesById.get(previous.id)?.name ?? 'company'
    return opportunities.find(opportunity => opportunity.id === previous.id)?.title ?? 'deal'
  })()
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
      setPeekInteractionDetails({})
      setPeekSuggestions([])
      setSelectedInteractionId(null)
      setPeekTodos([])
      return
    }
    let cancelled = false
    Promise.all([
      supabase.from('contact_facts').select('*').eq('user_id', userId).eq('contact_id', peekContactId).order('importance').order('created_at', { ascending: false }).limit(6),
      supabase.from('value_logs').select('*').eq('user_id', userId).eq('outreach_log_id', peekContactId).order('date', { ascending: false }).limit(6),
      supabase.from('interactions').select('*').eq('user_id', userId).eq('contact_id', peekContactId).order('interaction_date', { ascending: false }).limit(6),
      supabase.from('todos').select('*').eq('user_id', userId).eq('contact_id', peekContactId).eq('completed', false).order('date', { nullsFirst: false }).limit(6),
      supabase.from('interaction_suggestions').select('*').eq('user_id', userId).eq('contact_id', peekContactId).eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
    ]).then(async ([factsRes, valuesRes, interactionsRes, todosRes, suggestionsRes]) => {
      if (cancelled) return
      const interactions = (interactionsRes.data ?? []) as Interaction[]
      setPeekFacts((factsRes.data ?? []) as ContactFact[])
      setPeekValues((valuesRes.data ?? []) as ValueLog[])
      setPeekInteractions(interactions)
      setPeekTodos((todosRes.data ?? []) as Todo[])
      setPeekSuggestions((suggestionsRes.data ?? []) as InteractionSuggestion[])
      setSelectedInteractionId(null)
      if (interactions.length === 0) {
        setPeekInteractionDetails({})
        return
      }
      const { data } = await supabase
        .from('interaction_details')
        .select('*')
        .eq('user_id', userId)
        .in('interaction_id', interactions.map(interaction => interaction.id))
      if (cancelled) return
      setPeekInteractionDetails(Object.fromEntries(
        ((data ?? []) as InteractionDetail[]).map(detail => [detail.interaction_id, detail]),
      ))
    })
    return () => { cancelled = true }
  }, [peekContactId, userId])

  useEffect(() => {
    if (!userId || !peekContactId) return
    const onGmailSync = (event: Event) => {
      const detail = (event as CustomEvent<GmailSyncEventDetail>).detail
      if (!detail?.contactsTouched?.includes(peekContactId)) return
      supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .eq('contact_id', peekContactId)
        .order('interaction_date', { ascending: false })
        .limit(6)
        .then(({ data }) => setPeekInteractions((data ?? []) as Interaction[]))
    }
    window.addEventListener(GMAIL_SYNC_EVENT, onGmailSync)
    return () => window.removeEventListener(GMAIL_SYNC_EVENT, onGmailSync)
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
    resetNested()
    setCompanyPickerOpen(false)
    setCompanyPickerQuery('')
    setListPickerOpen(false)
    setListPickerQuery('')
    setDealPickerOpen(false)
    setDealPickerQuery('')
    setDealPeoplePickerOpen(false)
    setDealPeoplePickerQuery('')
    setCompanyTeamPickerOpen(false)
    setCompanyTeamPickerQuery('')
    setCompanyDealPickerOpen(false)
    setCompanyDealPickerQuery('')
    setCompanyListPickerOpen(false)
    setCompanyListPickerQuery('')
    setNestedPersonDealPickerOpen(false)
    setNestedPersonDealPickerQuery('')
    setNestedPersonListPickerOpen(false)
    setNestedPersonListPickerQuery('')
    setNestedDealListPickerOpen(false)
    setNestedDealListPickerQuery('')
  }, [peekContactId])

  const updatePeekContact = useCallback(async (patch: Parameters<typeof updateContact>[1]) => {
    if (!peekContactId) return
    await updateContact(peekContactId, patch)
  }, [peekContactId, updateContact])

  const updateNestedPerson = useCallback(async (patch: Parameters<typeof updateContact>[1]) => {
    if (!nestedPersonId) return
    await updateContact(nestedPersonId, patch)
  }, [nestedPersonId, updateContact])

  const updateNestedCompany = useCallback(async (companyId: string, patch: Partial<Company>) => {
    const { data, error } = await supabase.from('companies').update(patch).eq('id', companyId).select('*').single()
    if (error || !data) return
    const next = data as Company
    setCompanies(prev => prev.map(company => company.id === companyId ? next : company))
  }, [])

  const attachCompanyToPeek = useCallback(async (company: Company) => {
    if (!peekContactId) return
    await updateContact(peekContactId, { company_id: company.id, company: company.name })
    setCompanyPickerOpen(false)
    setCompanyPickerQuery('')
  }, [peekContactId, updateContact])

  const createAndAttachCompany = useCallback(async () => {
    if (!userId || !peekContactId) return
    const name = companyPickerQuery.trim()
    if (!name) return
    const { data, error } = await supabase.from('companies').insert({
      user_id: userId,
      name,
      domain: null,
      sector: null,
      size: null,
      notes: null,
      key_insight: null,
      logo_url: null,
    }).select('*').single()
    if (error || !data) return
    const company = data as Company
    setCompanies(prev => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)))
    await attachCompanyToPeek(company)
  }, [attachCompanyToPeek, companyPickerQuery, peekContactId, userId])

  const addContactToList = useCallback(async (list: List) => {
    if (!userId || !peekContactId) return
    if ((list.parent_object ?? 'person') !== 'person') return
    await addRecordToList({ userId, list, recordId: peekContactId })
    setListPickerOpen(false)
    setListPickerQuery('')
    await loadLists()
  }, [loadLists, peekContactId, userId])

  const removeContactFromList = useCallback(async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadLists()
  }, [loadLists])

  const createAndAddList = useCallback(async () => {
    if (!userId || !peekContactId) return
    const name = listPickerQuery.trim()
    if (!name) return
    const { data, error } = await supabase.from('lists').insert({
      user_id: userId,
      name,
      parent_object: 'person',
      purpose: null,
      stages: [],
      color: '#eef0ed',
      icon: '👤',
    }).select('*').single()
    if (error || !data) return
    await addContactToList(data as List)
  }, [addContactToList, listPickerQuery, peekContactId, userId])

  const updateNestedDeal = useCallback(async (dealId: string, patch: Partial<Opportunity>) => {
    const { data, error } = await supabase.from('opportunities').update(patch).eq('id', dealId).select('*, company:companies(*)').single()
    if (error || !data) return
    const next = data as Opportunity
    setOpportunities(prev => prev.map(opportunity => opportunity.id === dealId ? next : opportunity))
  }, [])

  const addDealToPeek = useCallback(async (deal: Opportunity) => {
    if (!peekContactId) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: deal.id,
      outreach_log_id: peekContactId,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setDealPickerOpen(false)
    setDealPickerQuery('')
    await loadOpportunities()
  }, [loadOpportunities, peekContactId])

  const removeDealFromPeek = useCallback(async (deal: Opportunity) => {
    if (!peekContactId) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', deal.id).eq('outreach_log_id', peekContactId)
    if (nestedDeal?.id === deal.id) resetNested()
    await loadOpportunities()
  }, [loadOpportunities, nestedDeal?.id, peekContactId])

  const addPersonToNestedDeal = useCallback(async (person: Contact) => {
    if (!nestedDeal) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: nestedDeal.id,
      outreach_log_id: person.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setDealPeoplePickerOpen(false)
    setDealPeoplePickerQuery('')
    await loadOpportunities()
  }, [loadOpportunities, nestedDeal])

  const removePersonFromNestedDeal = useCallback(async (person: Contact) => {
    if (!nestedDeal) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', nestedDeal.id).eq('outreach_log_id', person.id)
    await loadOpportunities()
  }, [loadOpportunities, nestedDeal])

  const addNestedDealToList = useCallback(async (list: List) => {
    if (!userId || !nestedDeal) return
    if ((list.parent_object ?? 'person') !== 'opportunity') return
    await addRecordToList({ userId, list, recordId: nestedDeal.id })
    setNestedDealListPickerOpen(false)
    setNestedDealListPickerQuery('')
    await loadLists()
  }, [loadLists, nestedDeal, userId])

  const removeNestedDealFromList = useCallback(async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadLists()
  }, [loadLists])

  const createAndAddNestedDealList = useCallback(async () => {
    if (!userId || !nestedDeal) return
    const name = nestedDealListPickerQuery.trim()
    if (!name) return
    const { data, error } = await supabase.from('lists').insert({
      user_id: userId,
      name,
      parent_object: 'opportunity',
      purpose: null,
      stages: [],
      color: '#eef0ed',
      icon: '💼',
    }).select('*').single()
    if (error || !data) return
    await addNestedDealToList(data as List)
  }, [addNestedDealToList, nestedDeal, nestedDealListPickerQuery, userId])

  const createAndAddPersonToNestedDeal = useCallback(async () => {
    if (!userId || !nestedDeal) return
    const name = dealPeoplePickerQuery.trim()
    if (!name) return
    const company = nestedDealCompany ?? peekCompany
    const person = await addContact({
      name,
      status: 'PROSPECT',
      log_date: localDate(),
      company_id: company?.id ?? null,
      company: company?.name ?? null,
    })
    if (!person) return
    await addPersonToNestedDeal(person)
  }, [addContact, addPersonToNestedDeal, dealPeoplePickerQuery, nestedDeal, nestedDealCompany, peekCompany, userId])

  const createAndAddDeal = useCallback(async () => {
    if (!userId || !peekContactId) return
    const title = dealPickerQuery.trim()
    if (!title) return
    const { data, error } = await supabase.from('opportunities').insert({
      user_id: userId,
      title,
      type: 'job',
      stage: 'exploring',
      company_id: peekCompany?.id ?? null,
      estimated_value: null,
      target_date: null,
      close_date: null,
      owner_contact_id: null,
      notes: null,
      decision_filter_pass: null,
      interview_prep: null,
      interview_map: null,
      negotiation_prep: null,
    }).select('*, company:companies(*)').single()
    if (error || !data) return
    const deal = data as Opportunity
    setOpportunities(prev => [deal, ...prev])
    await addDealToPeek(deal)
  }, [addDealToPeek, dealPickerQuery, peekCompany?.id, peekContactId, userId])

  const addDealToNestedPerson = useCallback(async (deal: Opportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: deal.id,
      outreach_log_id: nestedPerson.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setNestedPersonDealPickerOpen(false)
    setNestedPersonDealPickerQuery('')
    await loadOpportunities()
  }, [loadOpportunities, nestedPerson])

  const removeDealFromNestedPerson = useCallback(async (deal: Opportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', deal.id).eq('outreach_log_id', nestedPerson.id)
    await loadOpportunities()
  }, [loadOpportunities, nestedPerson])

  const createAndAddDealToNestedPerson = useCallback(async () => {
    if (!userId || !nestedPerson) return
    const title = nestedPersonDealPickerQuery.trim()
    if (!title) return
    const { data, error } = await supabase.from('opportunities').insert({
      user_id: userId,
      title,
      type: 'job',
      stage: 'exploring',
      company_id: nestedPersonCompany?.id ?? null,
      estimated_value: null,
      target_date: null,
      close_date: null,
      owner_contact_id: null,
      notes: null,
      decision_filter_pass: null,
      interview_prep: null,
      interview_map: null,
      negotiation_prep: null,
    }).select('*, company:companies(*)').single()
    if (error || !data) return
    const deal = data as Opportunity
    setOpportunities(prev => [deal, ...prev])
    await addDealToNestedPerson(deal)
  }, [addDealToNestedPerson, nestedPerson, nestedPersonCompany?.id, nestedPersonDealPickerQuery, userId])

  const addNestedPersonToList = useCallback(async (list: List) => {
    if (!userId || !nestedPerson) return
    if ((list.parent_object ?? 'person') !== 'person') return
    await addRecordToList({ userId, list, recordId: nestedPerson.id })
    setNestedPersonListPickerOpen(false)
    setNestedPersonListPickerQuery('')
    await loadLists()
  }, [loadLists, nestedPerson, userId])

  const removeNestedPersonFromList = useCallback(async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadLists()
  }, [loadLists])

  const createAndAddNestedPersonList = useCallback(async () => {
    if (!userId || !nestedPerson) return
    const name = nestedPersonListPickerQuery.trim()
    if (!name) return
    const { data, error } = await supabase.from('lists').insert({
      user_id: userId,
      name,
      parent_object: 'person',
      purpose: null,
      stages: [],
      color: '#eef0ed',
      icon: '👤',
    }).select('*').single()
    if (error || !data) return
    await addNestedPersonToList(data as List)
  }, [addNestedPersonToList, nestedPerson, nestedPersonListPickerQuery, userId])

  const attachPersonToNestedCompany = useCallback(async (person: Contact) => {
    if (!nestedCompany) return
    await updateContact(person.id, { company_id: nestedCompany.id, company: nestedCompany.name })
    setCompanyTeamPickerOpen(false)
    setCompanyTeamPickerQuery('')
  }, [nestedCompany, updateContact])

  const detachPersonFromNestedCompany = useCallback(async (person: Contact) => {
    if (!nestedCompany) return
    await updateContact(person.id, { company_id: null, company: null })
  }, [nestedCompany, updateContact])

  const createAndAddPersonToNestedCompany = useCallback(async () => {
    if (!userId || !nestedCompany) return
    const name = companyTeamPickerQuery.trim()
    if (!name) return
    await addContact({
      name,
      status: 'PROSPECT',
      log_date: localDate(),
      company_id: nestedCompany.id,
      company: nestedCompany.name,
    })
    setCompanyTeamPickerOpen(false)
    setCompanyTeamPickerQuery('')
  }, [addContact, companyTeamPickerQuery, nestedCompany, userId])

  const attachDealToNestedCompany = useCallback(async (deal: Opportunity) => {
    if (!nestedCompany) return
    const { data, error } = await supabase.from('opportunities').update({ company_id: nestedCompany.id }).eq('id', deal.id).select('*, company:companies(*)').single()
    if (!error && data) {
      const next = data as Opportunity
      setOpportunities(prev => prev.map(opportunity => opportunity.id === deal.id ? next : opportunity))
    }
    setCompanyDealPickerOpen(false)
    setCompanyDealPickerQuery('')
    await loadOpportunities()
  }, [loadOpportunities, nestedCompany])

  const detachDealFromNestedCompany = useCallback(async (deal: Opportunity) => {
    if (!nestedCompany) return
    await supabase.from('opportunities').update({ company_id: null }).eq('id', deal.id)
    if (nestedDeal?.id === deal.id) resetNested()
    await loadOpportunities()
  }, [loadOpportunities, nestedCompany, nestedDeal?.id])

  const createAndAddDealToNestedCompany = useCallback(async () => {
    if (!userId || !nestedCompany) return
    const title = companyDealPickerQuery.trim()
    if (!title) return
    const { data, error } = await supabase.from('opportunities').insert({
      user_id: userId,
      title,
      type: 'job',
      stage: 'exploring',
      company_id: nestedCompany.id,
      estimated_value: null,
      target_date: null,
      close_date: null,
      owner_contact_id: null,
      notes: null,
      decision_filter_pass: null,
      interview_prep: null,
      interview_map: null,
      negotiation_prep: null,
    }).select('*, company:companies(*)').single()
    if (!error && data) setOpportunities(prev => [data as Opportunity, ...prev])
    setCompanyDealPickerOpen(false)
    setCompanyDealPickerQuery('')
    await loadOpportunities()
  }, [companyDealPickerQuery, loadOpportunities, nestedCompany, userId])

  const addNestedCompanyToList = useCallback(async (list: List) => {
    if (!userId || !nestedCompany) return
    if ((list.parent_object ?? 'person') !== 'company') return
    await addRecordToList({ userId, list, recordId: nestedCompany.id })
    setCompanyListPickerOpen(false)
    setCompanyListPickerQuery('')
    await loadLists()
  }, [loadLists, nestedCompany, userId])

  const removeNestedCompanyFromList = useCallback(async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadLists()
  }, [loadLists])

  const createAndAddNestedCompanyList = useCallback(async () => {
    if (!userId || !nestedCompany) return
    const name = companyListPickerQuery.trim()
    if (!name) return
    const { data, error } = await supabase.from('lists').insert({
      user_id: userId,
      name,
      parent_object: 'company',
      purpose: null,
      stages: [],
      color: '#eef0ed',
      icon: '🏢',
    }).select('*').single()
    if (error || !data) return
    await addNestedCompanyToList(data as List)
  }, [addNestedCompanyToList, companyListPickerQuery, nestedCompany, userId])

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
  const selectedInteraction = peekInteractions.find(interaction => interaction.id === selectedInteractionId) ?? null
  const selectedInteractionDetail = selectedInteractionId ? peekInteractionDetails[selectedInteractionId] ?? null : null
  const notifyPeek = (message: string) => {
    window.dispatchEvent(new CustomEvent('rethink:peek-notice', { detail: message }))
  }
  const approveSuggestionFromPeek = async (suggestion: InteractionSuggestion) => {
    const result = await approveInteractionSuggestion(suggestion)
    if (!result.ok) {
      notifyPeek(result.error ?? 'Could not approve suggestion')
      return
    }
    setPeekSuggestions(current => current.filter(item => item.id !== suggestion.id))
    notifyPeek('Suggestion approved')
  }
  const dismissSuggestionFromPeek = async (suggestion: InteractionSuggestion) => {
    const result = await dismissInteractionSuggestion(suggestion)
    if (!result.ok) {
      notifyPeek(result.error ?? 'Could not dismiss suggestion')
      return
    }
    setPeekSuggestions(current => current.filter(item => item.id !== suggestion.id))
    notifyPeek('Suggestion dismissed')
  }
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
  const personHighlights = peekContact ? [
    { label: 'Connection strength', icon: <Heartbeat size={13} />, value: (peekContact.connection_strength ?? 0).toFixed(1) },
    { label: 'Relationship', icon: <CircleHalf size={13} />, value: peekContact.status },
    { label: 'Channels', icon: <Broadcast size={13} />, value: [peekContact.email && 'email', peekContact.phone && 'phone', peekContact.linkedin_url && 'linkedin'].filter(Boolean).join(' · ') || '—' },
    { label: 'Daisy chain', icon: <GitFork size={13} />, value: referrerName },
    { label: 'Opportunity', icon: <Target size={13} />, value: peekContact.looking_for || '—' },
    { label: 'Company', icon: <Buildings size={13} />, value: (peekCompany?.name ?? peekContact.company) || 'No company' },
  ] : []
  const companyHighlights = nestedCompany ? [
    { label: 'Team', icon: <Users size={13} />, value: nestedCompanyTeam.length ? `${nestedCompanyTeam.length} people` : 'No Team' },
    { label: 'Associated deals', icon: <Target size={13} />, value: nestedCompanyDeals.length ? `${nestedCompanyDeals.length} deals` : 'No Associated deals' },
    { label: 'Lists', icon: <Info size={13} />, value: nestedCompanyLists.length ? `${nestedCompanyLists.length} lists` : 'Not in any list' },
    { label: 'Primary location', icon: <MapPin size={13} />, value: nestedCompany.primary_location || nestedCompany.hq_location || 'No Primary location' },
    { label: 'Website', icon: <Buildings size={13} />, value: nestedCompany.website_url || nestedCompany.domain || 'No Website' },
    { label: 'Employee range', icon: <Users size={13} />, value: nestedCompany.size || (nestedCompany.employees_count ? `${nestedCompany.employees_count}` : 'No Employee range') },
  ] : []
  const renderHighlightGrid = (items: Array<{ label: string; icon: ReactNode; value: ReactNode }>) => (
    <>
      <div className="peek-block-label">Highlights</div>
      <div className="peek-hl-grid">
        {items.map(field => (
          <div className="peek-hl" key={field.label}>
            <span className="hl-hd"><span>{field.label}</span>{field.icon}</span>
            <span className="hl-body">{field.value}</span>
          </div>
        ))}
      </div>
    </>
  )
  const activityRows = peekInteractions.map(interaction => {
    const source = interactionLabel(interaction)
    const detail = peekInteractionDetails[interaction.id]
    if (interaction.type === 'email') {
      const subject = compactText(emailNotePart(interaction.notes, 'Subject'), 80)
      const summary = compactText(emailNotePart(interaction.notes, 'Summary'), 150)
      const intent = compactText(emailNotePart(interaction.notes, 'Intent'), 80)
      const from = compactText(emailNotePart(interaction.notes, 'From'), 70)
      const to = compactText(emailNotePart(interaction.notes, 'To'), 70)
      const directionLabel = interaction.direction === 'outbound'
        ? `To ${peekContact?.name ?? to ?? 'contact'}`
        : `From ${peekContact?.name ?? from ?? 'contact'}`
      return {
        text: (
          <span className="act-email">
            <span><strong>{directionLabel}</strong>{source ? <span className="act-src"> · {source}</span> : null}</span>
            {subject && <span className="act-email-subject">{subject}</span>}
            {(summary || intent) && (
              <span className="act-email-meta">
                {summary}{summary && intent ? ' · ' : ''}{intent ? `Intent: ${intent}` : ''}
              </span>
            )}
          </span>
        ),
        when: interaction.interaction_date,
        id: interaction.id,
        hasDetail: Boolean(detail),
        icon: interactionIcon(interaction),
        channel: interaction.channel ?? interaction.type,
      }
    }
    return {
      text: <><strong>You</strong> {interaction.notes || `logged ${interaction.type.replace('_', ' ')}`}{source ? <span className="act-src"> · {source}</span> : null}</>,
      when: interaction.interaction_date,
      id: interaction.id,
      hasDetail: Boolean(detail),
      icon: interactionIcon(interaction),
      channel: interaction.channel ?? interaction.type,
    }
  })
  const personOverview = peekContact ? (
    <>
      {renderHighlightGrid(personHighlights)}
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        {activityRows.length > 0 ? activityRows.slice(0, 4).map((row, index) => (
          <button
            type="button"
            className={`peek-act-row${row.hasDetail ? ' clickable' : ''}`}
            key={`${row.when}-${index}`}
            onClick={() => row.hasDetail && setSelectedInteractionId(row.id)}
          >
            <span className="act-channel-ic" data-channel={row.channel}>{row.icon}</span><span className="act-txt">{row.text}</span><span className="act-when">{row.when}</span>
          </button>
        )) : (
          <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Person</span><span className="act-when">{formatAgo(daysSince(peekContact.created_at))}</span></div>
        )}
      </div>
    </>
  ) : null
  const companyOverview = nestedCompany ? (
    <>
      {renderHighlightGrid(companyHighlights)}
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {nestedCompany.name}'s attributes</span><span className="act-when">{formatAgo(daysSince(nestedCompany.last_enriched_at || nestedCompany.created_at))}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Company</span><span className="act-when">{formatAgo(daysSince(nestedCompany.created_at))}</span></div>
      </div>
    </>
  ) : null
  const dealHighlights = nestedDeal ? [
    { label: 'Deal stage', icon: <Target size={13} />, value: opportunityStageLabel(nestedDeal.stage) },
    { label: 'Deal value', icon: <Target size={13} />, value: formatDealValue(nestedDeal.estimated_value) },
    { label: 'Deal owner', icon: <Users size={13} />, value: nestedDealOwner?.name ?? 'No Deal owner' },
    { label: 'Associated company', icon: <Buildings size={13} />, value: nestedDealCompany?.name ?? 'No Associated company' },
    { label: 'Associated people', icon: <Users size={13} />, value: nestedDealPeople.length ? `${nestedDealPeople.length} people` : 'No Associated people' },
    { label: 'Target date', icon: <CalendarBlank size={13} />, value: nestedDeal.target_date || '—' },
  ] : []
  const dealOverview = nestedDeal ? (
    <>
      {renderHighlightGrid(dealHighlights)}
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {nestedDeal.title}'s attributes</span><span className="act-when">{formatAgo(daysSince(nestedDeal.created_at))}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Deal</span><span className="act-when">{formatAgo(daysSince(nestedDeal.created_at))}</span></div>
      </div>
    </>
  ) : null
  const nestedPersonHighlights = nestedPerson ? [
    { label: 'Connection strength', icon: <Heartbeat size={13} />, value: (nestedPerson.connection_strength ?? 0).toFixed(1) },
    { label: 'Relationship', icon: <CircleHalf size={13} />, value: nestedPerson.status },
    { label: 'Channels', icon: <Broadcast size={13} />, value: [nestedPerson.email && 'email', nestedPerson.phone && 'phone', nestedPerson.linkedin_url && 'linkedin'].filter(Boolean).join(' · ') || '—' },
    { label: 'Daisy chain', icon: <GitFork size={13} />, value: nestedPerson.referred_by ? contactsById.get(nestedPerson.referred_by)?.name ?? nestedPerson.referred_by : '—' },
    { label: 'Opportunity', icon: <Target size={13} />, value: nestedPerson.looking_for || '—' },
    { label: 'Company', icon: <Buildings size={13} />, value: (nestedPersonCompany?.name ?? nestedPerson.company) || 'No company' },
  ] : []
  const nestedPersonOverview = nestedPerson ? (
    <>
      {renderHighlightGrid(nestedPersonHighlights)}
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {nestedPerson.name}'s attributes</span><span className="act-when">{formatAgo(daysSince(nestedPerson.updated_at ?? nestedPerson.created_at))}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Person</span><span className="act-when">{formatAgo(daysSince(nestedPerson.created_at))}</span></div>
      </div>
    </>
  ) : null
  const activityTab = (
    <div>
      <div className="peek-block-label">Relationship memory <span className="peek-count">{activityRows.length}</span></div>
      {activityRows.length > 0 ? (
        <div className="peek-activity-card">
          {activityRows.map((row, index) => (
            <button
              type="button"
              className={`peek-act-row${row.hasDetail ? ' clickable' : ''}${row.id === selectedInteractionId ? ' selected' : ''}`}
              key={`${row.when}-${index}`}
              onClick={() => row.hasDetail && setSelectedInteractionId(row.id)}
            >
              <span className="act-channel-ic" data-channel={row.channel}>{row.icon}</span><span className="act-txt">{row.text}</span><span className="act-when">{row.when}</span>
            </button>
          ))}
        </div>
      ) : <p className="peek-empty-lists">No activity captured yet.</p>}
    </div>
  )
  const listsTab = (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{peekListMemberships.length}</span><button className="peek-add-btn" onClick={() => setListPickerOpen(true)}><Plus size={10} />Add to list</button></div>
      {peekListMemberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : peekListMemberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeContactFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Trash size={12} /></button>
        </div>
      ))}
    </div>
  )
  const associatedDealsTab = (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated deals <span className="peek-count">{(nestedPerson ? nestedPersonDeals : peekDeals).length}</span><button className="peek-add-btn" onClick={() => nestedPerson ? setNestedPersonDealPickerOpen(true) : setDealPickerOpen(true)}><Plus size={10} />Add deal</button></div>
      {(nestedPerson ? nestedPersonDeals : peekDeals).length === 0 ? <p className="peek-empty-lists">No deals associated yet.</p> : (nestedPerson ? nestedPersonDeals : peekDeals).map(deal => (
        <button className="peek-rel-row" key={deal.id} onClick={() => openNested({ type: 'deal', id: deal.id })}>
          <Avatar src={deal.company?.logo_url ?? peekCompany?.logo_url ?? nestedPersonCompany?.logo_url} name={deal.company?.name ?? deal.title} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.company?.name ?? 'No company'}</span></span>
          <span className="peek-row-side">
            <span className="crm-mono">{formatDealValue(deal.estimated_value)}</span>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void (nestedPerson ? removeDealFromNestedPerson(deal) : removeDealFromPeek(deal)) }} aria-label={`Remove ${deal.title}`}><Trash size={12} /></button>
          </span>
        </button>
      ))}
    </div>
  )
  const nestedPersonListsTab = nestedPerson ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedPersonListMemberships.length}</span><button className="peek-add-btn" onClick={() => setNestedPersonListPickerOpen(true)}><Plus size={10} />Add to list</button></div>
      {nestedPersonListMemberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedPersonListMemberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeNestedPersonFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Trash size={12} /></button>
        </div>
      ))}
    </div>
  ) : null
  const nestedCompanyTeamTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Team <span className="peek-count">{nestedCompanyTeam.length}</span><button className="peek-add-btn" onClick={() => setCompanyTeamPickerOpen(true)}><Plus size={10} />Add person</button></div>
      {nestedCompanyTeam.length === 0 ? <p className="peek-empty-lists">No people associated yet.</p> : nestedCompanyTeam.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <ContactAvatar name={person.name} photoUrl={person.profile_photo_url} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachPersonFromNestedCompany(person) }} aria-label={`Remove ${person.name} from ${nestedCompany.name}`}><Trash size={12} /></button>
            <Target size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null
  const nestedCompanyDealsTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated deals <span className="peek-count">{nestedCompanyDeals.length}</span><button className="peek-add-btn" onClick={() => setCompanyDealPickerOpen(true)}><Plus size={10} />Add deal</button></div>
      {nestedCompanyDeals.length === 0 ? <p className="peek-empty-lists">No deals associated yet.</p> : nestedCompanyDeals.map(deal => (
        <button className="peek-rel-row" key={deal.id} onClick={() => openNested({ type: 'deal', id: deal.id })}>
          <Avatar src={nestedCompany.logo_url} name={nestedCompany.name} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.type}</span></span>
          <span className="peek-row-side">
            <span className="crm-mono">{formatDealValue(deal.estimated_value)}</span>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachDealFromNestedCompany(deal) }} aria-label={`Remove ${deal.title} from ${nestedCompany.name}`}><Trash size={12} /></button>
            <Target size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null
  const nestedCompanyListsTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedCompanyLists.length}</span><button className="peek-add-btn" onClick={() => setCompanyListPickerOpen(true)}><Plus size={10} />Add to list</button></div>
      {nestedCompanyLists.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedCompanyLists.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeNestedCompanyFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Trash size={12} /></button>
        </div>
      ))}
    </div>
  ) : null
  const nestedDealPeopleTab = nestedDeal ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated people <span className="peek-count">{nestedDealPeople.length}</span><button className="peek-add-btn" onClick={() => setDealPeoplePickerOpen(true)}><Plus size={10} />Add person</button></div>
      {nestedDealPeople.length === 0 ? <p className="peek-empty-lists">No people associated yet.</p> : nestedDealPeople.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <ContactAvatar name={person.name} photoUrl={person.profile_photo_url} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.company || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void removePersonFromNestedDeal(person) }} aria-label={`Remove ${person.name} from ${nestedDeal.title}`}><Trash size={12} /></button>
            <Target size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null
  const nestedDealListsTab = nestedDeal ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedDealListMemberships.length}</span><button className="peek-add-btn" onClick={() => setNestedDealListPickerOpen(true)}><Plus size={10} />Add to list</button></div>
      {nestedDealListMemberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedDealListMemberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeNestedDealFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Trash size={12} /></button>
        </div>
      ))}
    </div>
  ) : null
  const valueLedgerTab = (
    <>
      <div className="peek-block-label">Value ledger <ValueBalance given={peekValueGiven} received={peekValueReceived} /></div>
      <div className="peek-ledger">
        {peekValues.length === 0 ? <p className="peek-empty-lists">No value logs yet.</p> : peekValues.map(v => (
          <div className={`pl-act ${v.direction === 'received' ? 'received' : 'given'}`} key={v.id}>
            <span className="pl-dir">{v.direction === 'received' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}</span>
            <span className="pl-txt peek-edit-stack">
              <EditablePeekSelect value={v.direction} options={[{ value: 'given', label: 'given' }, { value: 'received', label: 'received' }]} onSave={value => updateValueLog(v.id, { direction: value })} />
              <EditablePeekSelect value={v.type} options={VALUE_TYPES.map(value => ({ value, label: value }))} onSave={value => updateValueLog(v.id, { type: value })} />
              <EditablePeekInput value={v.description} placeholder="What value moved?" onSave={value => updateValueLog(v.id, { description: value })} />
            </span>
            <span className="peek-row-side">
              <EditablePeekInput type="date" value={v.date} onSave={value => updateValueLog(v.id, { date: value || localDate() })} />
              <button className="peek-trash" onClick={() => void deleteValueLog(v.id)} aria-label="Delete value log"><Trash size={12} /></button>
            </span>
          </div>
        ))}
        <div className="peek-add-line">
          <EditablePeekSelect value={newValueDirection} options={[{ value: 'given', label: 'given' }, { value: 'received', label: 'received' }]} onSave={setNewValueDirection} />
          <EditablePeekSelect value={newValueType} options={VALUE_TYPES.map(value => ({ value, label: value }))} onSave={setNewValueType} />
          <input className="peek-inline-input" value={newValueText} onChange={event => setNewValueText(event.target.value)} placeholder="Add value log..." onKeyDown={event => { if (event.key === 'Enter') void addValueLog() }} />
          <button className="peek-add-btn" onClick={() => void addValueLog()}><Plus size={10} />Add</button>
        </div>
      </div>
    </>
  )
  const introductionsTab = (
    <div className="peek-intro-grid">
      <div className="peek-intro-col">
        <div className="peek-intro-hd">Opened for you <span className="peek-count">{introsByPeek.madeBy.length}</span></div>
        <div className="peek-linked">
          {introsByPeek.madeBy.length === 0 ? <p className="peek-empty-lists">No introductions captured from this person yet.</p> : introsByPeek.madeBy.map(introRow)}
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
          {introsByPeek.madeTo.length === 0 ? <p className="peek-empty-lists">No introductions you made to this person yet.</p> : introsByPeek.madeTo.map(introRow)}
          <div className="peek-add-line vertical">
            <input className="peek-inline-input" value={newIntroToName} onChange={event => setNewIntroToName(event.target.value)} placeholder="Person you introduced" />
            <input className="peek-inline-input" value={newIntroToCompany} onChange={event => setNewIntroToCompany(event.target.value)} placeholder="Company" onKeyDown={event => { if (event.key === 'Enter') void addIntroduction('given') }} />
            <button className="peek-add-btn" onClick={() => void addIntroduction('given')}><Plus size={10} />Add intro</button>
          </div>
        </div>
      </div>
    </div>
  )
  const factsTab = (
    <>
      <div className="peek-block-label">Facts</div>
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
    </>
  )
  const suggestionsTab = (
    <div className="peek-suggestions">
      <div className="peek-block-label">Suggested actions <span className="peek-count">{peekSuggestions.length}</span></div>
      {peekSuggestions.length === 0 ? (
        <p className="peek-empty-lists">No pending suggestions for this contact.</p>
      ) : peekSuggestions.map(suggestion => (
        <div className="peek-suggestion" key={suggestion.id}>
          <span className="peek-suggestion-chip">{suggestion.target.replace('_', ' ')}</span>
          <span className="peek-suggestion-main">
            <strong>{suggestion.title}</strong>
            {suggestion.body && <span>{suggestion.body}</span>}
          </span>
          <span className="peek-row-side">
            <button className="rv-ok" onClick={() => void approveSuggestionFromPeek(suggestion)} aria-label={`Approve ${suggestion.title}`}><Check size={13} /></button>
            <button className="rv-no" onClick={() => void dismissSuggestionFromPeek(suggestion)} aria-label={`Dismiss ${suggestion.title}`}><X size={13} /></button>
          </span>
        </div>
      ))}
    </div>
  )
  const docsTab = (
    <div className="peek-docs">
      <div className="peek-block-label">Linked documents <span className="peek-count">{docsFromTodos(peekTodos).length}</span></div>
      <div className="peek-docs-list">
        {docsFromTodos(peekTodos).length === 0 ? <p className="peek-empty-lists">No documents linked yet.</p> : docsFromTodos(peekTodos).map((doc, index) => (
          <div className="peek-doc" key={`${doc.name}-${index}`}>
            <span className="peek-doc-ic"><Info size={15} /></span>
            <div className="peek-doc-meta"><span className="peek-doc-name">{doc.name}</span><span className="peek-doc-sub">{doc.type || 'Doc'}{doc.when ? ` · ${doc.when}` : ''}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
  const recordTabs = nestedPerson ? [
    { id: 'Overview', label: 'Overview', content: nestedPersonOverview },
    { id: 'Associated deals', label: 'Associated deals', count: nestedPersonDeals.length, content: associatedDealsTab },
    { id: 'Lists', label: 'Lists', count: nestedPersonListMemberships.length, content: nestedPersonListsTab },
  ] : nestedCompany ? [
    { id: 'Overview', label: 'Overview', content: companyOverview },
    { id: 'Team', label: 'Team', count: nestedCompanyTeam.length, content: nestedCompanyTeamTab },
    { id: 'Associated deals', label: 'Associated deals', count: nestedCompanyDeals.length, content: nestedCompanyDealsTab },
    { id: 'Lists', label: 'Lists', count: nestedCompanyLists.length, content: nestedCompanyListsTab },
    { id: 'Activity', label: 'Activity', count: 0, content: <div className="peek-docs-empty"><Info size={16} /><span>No activity captured yet.</span></div> },
  ] : nestedDeal ? [
    { id: 'Overview', label: 'Overview', content: dealOverview },
    { id: 'Associated people', label: 'Associated people', count: nestedDealPeople.length, content: nestedDealPeopleTab },
    { id: 'Lists', label: 'Lists', count: nestedDealListMemberships.length, content: nestedDealListsTab },
  ] : [
    { id: 'Overview', label: 'Overview', content: personOverview },
    { id: 'Associated deals', label: 'Associated deals', count: peekDeals.length, content: associatedDealsTab },
    { id: 'Activity', label: 'Activity', count: activityRows.length, content: activityTab },
    { id: 'Suggestions', label: 'Suggestions', count: peekSuggestions.length, content: suggestionsTab },
    { id: 'Notes', label: 'Notes', count: peekValues.length, content: valueLedgerTab },
    { id: 'Introductions', label: 'Introductions', count: introsByPeek.madeBy.length + introsByPeek.madeTo.length, content: introductionsTab },
    { id: 'Facts', label: 'Facts', count: peekFacts.length, content: factsTab },
    { id: 'Files', label: 'Files', count: docsFromTodos(peekTodos).length, content: docsTab },
    { id: 'Lists', label: 'Lists', count: peekListMemberships.length, content: listsTab },
  ]

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
      render: contact => <RelStatus value={relFromContact(contact.connection_strength, contact.last_interaction_at)} />,
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
      render: contact => <ValueBar ledger={ledgerByContact.get(contact.id) ?? null} />,
    },
    {
      key: 'tier',
      label: 'Tier',
      width: '84px',
      render: contact => <TierChip tier={contact.tier} />,
    },
    {
      key: 'company',
      label: 'Company',
      width: '170px',
      render: contact => {
        const company = contact.company_id ? companiesById.get(contact.company_id) : null
        const label = company?.name ?? contact.company
        return label
        ? (
          <span className="crm-name">
            <Avatar src={company?.logo_url} name={label} sq size={24} />
            <span className="link">{label}</span>
          </span>
        )
        : <span className="crm-empty">No company</span>
      },
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
  ], [channels, companiesById, ledgerByContact])

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
        <div className="flex items-center gap-3 px-6 py-1.5 border-b border-mercury/50 bg-gossip/20 shrink-0 text-[11px]">
          <span className="font-semibold text-burnham">
            {selectedIds.size} selected
          </span>

          {/* Domain */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-shuttle/60">Domain:</span>
            {([
              { key: 'professional', label: 'Pro', icon: '💼' },
              { key: 'mixed',        label: 'Mix', icon: '🔀' },
              { key: 'personal',     label: 'Pers', icon: '👥' },
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
              className="text-[10px] text-shuttle/40 hover:text-shuttle px-1 py-0.5 disabled:opacity-40 transition-colors"
              title="Clear professional tier"
            >
              ✕
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
              className="text-[10px] text-shuttle/40 hover:text-shuttle px-1 py-0.5 disabled:opacity-40 transition-colors"
              title="Clear personal tier"
            >
              ✕
            </button>
          </div>

          {selectedIds.size === 2 && (
            <button
              onClick={() => setMergeModalOpen(true)}
              disabled={bulkTagging}
              className="text-[10px] font-medium text-burnham border border-burnham/30 hover:border-burnham hover:bg-burnham hover:text-white px-2 py-0.5 rounded transition-colors disabled:opacity-40"
            >
              Merge two…
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
              stages: KANBAN_COLUMNS.map(col => ({ id: col.status, label: col.label, color: col.status === 'ENGAGED' ? '#3E7A4E' : col.status === 'DORMANT' ? '#F87171' : '#94A3B8' })),
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
        title={nestedPerson?.name ?? nestedCompany?.name ?? nestedDeal?.title ?? peekContact?.name ?? ''}
        subtitle={nestedPerson
          ? [nestedPerson.job_title, nestedPersonCompany?.name ?? nestedPerson.company].filter(Boolean).join(' · ') || nestedPerson.email
          : nestedCompany
          ? [nestedCompany.domain, nestedCompany.sector].filter(Boolean).join(' · ')
          : nestedDeal
          ? [nestedDealCompany?.name, nestedDeal.stage].filter(Boolean).join(' · ')
          : peekContact ? [peekContact.job_title, peekCompany?.name ?? peekContact.company].filter(Boolean).join(' · ') || peekContact.email : undefined}
        eyebrow={nestedPerson ? 'Person' : nestedCompany ? 'Company' : nestedDeal ? 'Deal' : 'Person'}
        avatar={nestedPerson ? (
          <ContactAvatar name={nestedPerson.name} photoUrl={nestedPerson.profile_photo_url} size={38} />
        ) : nestedCompany ? (
          <Avatar src={nestedCompany.logo_url} name={nestedCompany.name} sq size={38} />
        ) : nestedDeal ? (
          <Avatar src={nestedDealCompany?.logo_url ?? peekCompany?.logo_url} name={nestedDealCompany?.name ?? nestedDeal.title} sq size={38} />
        ) : peekContact && (
          <ContactAvatar name={peekContact.name} photoUrl={peekContact.profile_photo_url} size={38} />
        )}
        index={peekIndex >= 0 ? peekIndex : undefined}
        total={filtered.length}
        tabs={recordTabs}
        fields={nestedPerson ? [
          { label: 'Name', icon: <IdentificationCard size={12} />, value: <EditablePeekInput value={nestedPerson.name} placeholder="Name" onSave={value => updateNestedPerson({ name: value || nestedPerson.name })} /> },
          { label: 'Email', icon: <At size={12} />, value: <EditablePeekInput type="email" value={nestedPerson.email} placeholder="email@company.com" onSave={value => updateNestedPerson({ email: value })} /> },
          { label: 'Company', icon: <Buildings size={12} />, value: nestedPersonCompany ? <button className="peek-rel-link" onClick={() => openNested({ type: 'company', id: nestedPersonCompany.id })}>{nestedPersonCompany.name}</button> : (nestedPerson.company || 'No company') },
          { label: 'Role', icon: <Briefcase size={12} />, value: <EditablePeekInput value={nestedPerson.job_title} placeholder="Set role..." onSave={value => updateNestedPerson({ job_title: value })} /> },
          { label: 'Location', icon: <MapPin size={12} />, value: <EditablePeekInput value={nestedPerson.location} placeholder="Location" onSave={value => updateNestedPerson({ location: value })} /> },
          { label: 'Phone', icon: <WhatsappLogo size={12} />, value: <EditablePeekInput value={nestedPerson.phone} placeholder="Phone number" onSave={value => updateNestedPerson({ phone: value })} /> },
          { label: 'LinkedIn', icon: <LinkedinLogo size={12} />, value: <EditablePeekInput value={nestedPerson.linkedin_url} placeholder="LinkedIn URL" onSave={value => updateNestedPerson({ linkedin_url: value })} /> },
          { label: 'Website', icon: <Buildings size={12} />, value: <EditablePeekInput value={nestedPerson.website} placeholder="https://..." onSave={value => updateNestedPerson({ website: value })} /> },
          { label: 'Description', icon: <Info size={12} />, value: <EditablePeekInput value={nestedPerson.about} placeholder="Description" onSave={value => updateNestedPerson({ about: value })} /> },
          { label: 'AngelList', icon: <Target size={12} />, value: <EditablePeekInput value={nestedPerson.angellist_url} placeholder="AngelList URL" onSave={value => updateNestedPerson({ angellist_url: value })} /> },
          { label: 'Facebook', icon: <Broadcast size={12} />, value: <EditablePeekInput value={nestedPerson.facebook_url} placeholder="Facebook URL" onSave={value => updateNestedPerson({ facebook_url: value })} /> },
          { label: 'Instagram', icon: <Broadcast size={12} />, value: <EditablePeekInput value={nestedPerson.instagram_url} placeholder="Instagram URL" onSave={value => updateNestedPerson({ instagram_url: value })} /> },
          { label: 'Twitter', icon: <TwitterLogo size={12} />, value: <EditablePeekInput value={nestedPerson.twitter_url} placeholder="Twitter URL" onSave={value => updateNestedPerson({ twitter_url: value })} /> },
        ] : nestedCompany ? [
          { label: 'Domains', icon: <Buildings size={12} />, value: <EditablePeekInput value={nestedCompany.domain} placeholder="domain.com" onSave={value => updateNestedCompany(nestedCompany.id, { domain: value })} /> },
          { label: 'Name', icon: <Buildings size={12} />, value: <EditablePeekInput value={nestedCompany.name} placeholder="Company name" onSave={value => updateNestedCompany(nestedCompany.id, { name: value || nestedCompany.name })} /> },
          { label: 'Description', icon: <Info size={12} />, value: <EditablePeekInput value={nestedCompany.description} placeholder="Description" onSave={value => updateNestedCompany(nestedCompany.id, { description: value })} /> },
          { label: 'Categories', icon: <Target size={12} />, value: <EditablePeekInput value={nestedCompany.sector} placeholder="Set categories..." onSave={value => updateNestedCompany(nestedCompany.id, { sector: value })} /> },
          { label: 'Primary location', icon: <MapPin size={12} />, value: <EditablePeekInput value={nestedCompany.primary_location ?? nestedCompany.hq_location} placeholder="Location" onSave={value => updateNestedCompany(nestedCompany.id, { primary_location: value, hq_location: value })} /> },
          { label: 'Website', icon: <Buildings size={12} />, value: <EditablePeekInput value={nestedCompany.website_url} placeholder="https://..." onSave={value => updateNestedCompany(nestedCompany.id, { website_url: value })} /> },
          { label: 'LinkedIn', icon: <LinkedinLogo size={12} />, value: <EditablePeekInput value={nestedCompany.linkedin_url} placeholder="LinkedIn URL" onSave={value => updateNestedCompany(nestedCompany.id, { linkedin_url: value })} /> },
          { label: 'AngelList', icon: <Target size={12} />, value: <EditablePeekInput value={nestedCompany.angellist_url} placeholder="AngelList URL" onSave={value => updateNestedCompany(nestedCompany.id, { angellist_url: value })} /> },
          { label: 'Facebook', icon: <Broadcast size={12} />, value: <EditablePeekInput value={nestedCompany.facebook_url} placeholder="Facebook URL" onSave={value => updateNestedCompany(nestedCompany.id, { facebook_url: value })} /> },
          { label: 'Instagram', icon: <Broadcast size={12} />, value: <EditablePeekInput value={nestedCompany.instagram_url} placeholder="Instagram URL" onSave={value => updateNestedCompany(nestedCompany.id, { instagram_url: value })} /> },
          { label: 'Twitter', icon: <TwitterLogo size={12} />, value: <EditablePeekInput value={nestedCompany.twitter_url} placeholder="Twitter URL" onSave={value => updateNestedCompany(nestedCompany.id, { twitter_url: value })} /> },
        ] : nestedDeal ? [
          { label: 'Name', icon: <Target size={12} />, value: <EditablePeekInput value={nestedDeal.title} placeholder="Deal name" onSave={value => updateNestedDeal(nestedDeal.id, { title: value || nestedDeal.title })} /> },
          { label: 'Deal stage', icon: <Target size={12} />, value: <EditablePeekSelect<OpportunityStage> value={nestedDeal.stage} options={OPPORTUNITY_STAGES.map(value => ({ value, label: opportunityStageLabel(value) }))} searchPlaceholder="Search or create stage..." showDot onSave={value => updateNestedDeal(nestedDeal.id, { stage: value })} /> },
          { label: 'Deal owner', icon: <Users size={12} />, value: <EditablePeekSelect<string> value={nestedDeal.owner_contact_id ?? ''} options={[{ value: '', label: 'Set owner...' }, ...contacts.map(contact => ({ value: contact.id, label: contact.name }))]} searchPlaceholder="Search people..." variant="relation" onSave={value => updateNestedDeal(nestedDeal.id, { owner_contact_id: value || null })} /> },
          { label: 'Type', icon: <Target size={12} />, value: <EditablePeekSelect<OpportunityType> value={nestedDeal.type} options={OPPORTUNITY_TYPES.map(value => ({ value, label: value }))} onSave={value => updateNestedDeal(nestedDeal.id, { type: value })} /> },
          { label: 'Associated company', icon: <Buildings size={12} />, value: nestedDealCompany ? <button className="peek-rel-link" onClick={() => openNested({ type: 'company', id: nestedDealCompany.id })}>{nestedDealCompany.name}</button> : 'No company' },
          { label: 'Associated people', icon: <Users size={12} />, value: <button className="peek-rel-link" onClick={() => setDealPeoplePickerOpen(true)}>{nestedDealPeople.length} people</button> },
          { label: 'Deal value', icon: <Target size={12} />, value: <EditableCurrencyInput value={nestedDeal.estimated_value} onSave={value => updateNestedDeal(nestedDeal.id, { estimated_value: value })} /> },
          { label: 'Target date', icon: <CalendarBlank size={12} />, value: <EditablePeekInput type="date" value={nestedDeal.target_date} onSave={value => updateNestedDeal(nestedDeal.id, { target_date: value })} /> },
          { label: 'Close date', icon: <CalendarBlank size={12} />, value: <EditablePeekInput type="date" value={nestedDeal.close_date} onSave={value => updateNestedDeal(nestedDeal.id, { close_date: value })} /> },
        ] : peekContact ? [
          { label: 'Name', icon: <IdentificationCard size={12} />, value: <EditablePeekInput value={peekContact.name} placeholder="Name" onSave={value => updatePeekContact({ name: value || peekContact.name })} /> },
          { label: 'Email', icon: <At size={12} />, value: <EditablePeekInput type="email" value={peekContact.email} placeholder="email@company.com" onSave={value => updatePeekContact({ email: value })} /> },
          { label: 'Company', icon: <Buildings size={12} />, value: <button className="peek-rel-link" onClick={() => peekCompany ? openNested({ type: 'company', id: peekCompany.id }) : setCompanyPickerOpen(true)}>{(peekCompany?.name ?? peekContact.company) || 'Set company'}</button> },
          { label: 'Role', icon: <Briefcase size={12} />, value: <EditablePeekInput value={peekContact.job_title} placeholder="Set role..." onSave={value => updatePeekContact({ job_title: value })} /> },
          { label: 'Location', icon: <MapPin size={12} />, value: <EditablePeekInput value={peekContact.location} placeholder="Location" onSave={value => updatePeekContact({ location: value })} /> },
          { label: 'Phone', icon: <WhatsappLogo size={12} />, value: <EditablePeekInput value={peekContact.phone} placeholder="Phone number" onSave={value => updatePeekContact({ phone: value })} /> },
          { label: 'LinkedIn', icon: <LinkedinLogo size={12} />, value: <EditablePeekInput value={peekContact.linkedin_url} placeholder="LinkedIn URL" onSave={value => updatePeekContact({ linkedin_url: value })} /> },
          { label: 'Website', icon: <Buildings size={12} />, value: <EditablePeekInput value={peekContact.website} placeholder="https://..." onSave={value => updatePeekContact({ website: value })} /> },
          { label: 'Description', icon: <Info size={12} />, value: <EditablePeekInput value={peekContact.about} placeholder="Description" onSave={value => updatePeekContact({ about: value })} /> },
          { label: 'AngelList', icon: <Target size={12} />, value: <EditablePeekInput value={peekContact.angellist_url} placeholder="AngelList URL" onSave={value => updatePeekContact({ angellist_url: value })} /> },
          { label: 'Facebook', icon: <Broadcast size={12} />, value: <EditablePeekInput value={peekContact.facebook_url} placeholder="Facebook URL" onSave={value => updatePeekContact({ facebook_url: value })} /> },
          { label: 'Instagram', icon: <Broadcast size={12} />, value: <EditablePeekInput value={peekContact.instagram_url} placeholder="Instagram URL" onSave={value => updatePeekContact({ instagram_url: value })} /> },
          { label: 'Twitter', icon: <TwitterLogo size={12} />, value: <EditablePeekInput value={peekContact.twitter_url} placeholder="Twitter URL" onSave={value => updatePeekContact({ twitter_url: value })} /> },
        ] : []}
        listItems={(nestedPerson || nestedCompany || nestedDeal ? [] : [tierEditor, ...peekListMemberships.map(membership => (
          <span className="peek-tag" key={membership.id}>{membership.list?.icon ?? ''} {membership.list?.name ?? 'List'}</span>
        ))]).filter(Boolean)}
        onAddToList={nestedPerson || nestedCompany || nestedDeal ? undefined : () => setListPickerOpen(true)}
        onClose={() => { setPeekContactId(null); resetNested() }}
        onBack={nested ? backNested : undefined}
        backLabel={nested ? `Back to ${nestedBackLabel}` : undefined}
        onPrev={peekIndex > 0 ? () => { resetNested(); setPeekContactId(filtered[peekIndex - 1].id) } : undefined}
        onNext={peekIndex >= 0 && peekIndex < filtered.length - 1 ? () => { resetNested(); setPeekContactId(filtered[peekIndex + 1].id) } : undefined}
      >
        {!nestedCompany && (
          <>
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
          </>
        )}
      </RecordPeek>
      {selectedInteraction && selectedInteractionDetail && (
        <div className="peek-interaction-bg" onClick={() => setSelectedInteractionId(null)}>
          <div className="peek-interaction-modal" onClick={event => event.stopPropagation()}>
            <div className="peek-interaction-top">
              <span className="act-channel-ic large" data-channel={selectedInteraction.channel ?? selectedInteraction.type}>
                {interactionIcon(selectedInteraction)}
              </span>
              <div>
                <div className="peek-block-label">Interaction detail</div>
                <strong>{interactionLabel(selectedInteraction) ?? selectedInteraction.type}</strong>
                <span>
                  {selectedInteractionDetail.window_start ? new Date(selectedInteractionDetail.window_start).toLocaleString() : selectedInteraction.interaction_date}
                  {selectedInteractionDetail.window_end ? ` - ${new Date(selectedInteractionDetail.window_end).toLocaleTimeString()}` : ''}
                  {` · ${selectedInteractionDetail.message_count} messages`}
                </span>
              </div>
              <button className="peek-icn sq" onClick={() => setSelectedInteractionId(null)} aria-label="Close interaction detail"><X size={13} /></button>
            </div>
            {selectedInteractionDetail.summary && <p className="peek-interaction-summary">{selectedInteractionDetail.summary}</p>}
            <div className="peek-excerpts">
              {selectedInteractionDetail.excerpts.map((excerpt, index) => (
                <div className={`peek-excerpt ${excerpt.direction ?? ''}`} key={`${excerpt.timestamp}-${index}`}>
                  <div className="peek-excerpt-meta">
                    <strong>{excerpt.speaker ?? (excerpt.direction === 'outbound' ? 'Me' : 'Contact')}</strong>
                    <span>{excerpt.timestamp ? new Date(excerpt.timestamp).toLocaleString() : ''}</span>
                  </div>
                  <p>{excerpt.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {peekContact && companyPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setCompanyPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Associate company</span>
              <button onClick={() => setCompanyPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Buildings size={12} />
              <input
                autoFocus
                value={companyPickerQuery}
                onChange={event => setCompanyPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {companies
                .filter(company => [company.name, company.domain, company.website_url, company.sector].filter(Boolean).join(' ').toLowerCase().includes(companyPickerQuery.toLowerCase()))
                .map(company => (
                  <button key={company.id} className="rel-picker-row" onClick={() => void attachCompanyToPeek(company)}>
                    <Avatar src={company.logo_url} name={company.name} sq size={28} />
                    <span><strong>{company.name}</strong><em>{company.domain || company.website_url || company.sector || 'Company'}</em></span>
                  </button>
                ))}
              {companies.filter(company => [company.name, company.domain, company.website_url, company.sector].filter(Boolean).join(' ').toLowerCase().includes(companyPickerQuery.toLowerCase())).length === 0 && (
                <div className="rel-picker-empty"><Buildings size={15} /><span>No companies match.</span></div>
              )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAttachCompany()}><Plus size={11} /> Create new record{companyPickerQuery.trim() ? ` "${companyPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && listPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setListPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Add to list</span>
              <button onClick={() => setListPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={listPickerQuery}
                onChange={event => setListPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'person')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(listPickerQuery.toLowerCase()))
                .map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void addContactToList(list)}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                ))}
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'person')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(listPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available lists match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddList()}><Plus size={11} /> Create new record{listPickerQuery.trim() ? ` "${listPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && dealPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setDealPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Associate deal</span>
              <button onClick={() => setDealPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={dealPickerQuery}
                onChange={event => setDealPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {opportunities
                .filter(deal => !peekDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(dealPickerQuery.toLowerCase()))
                .map(deal => (
                  <button key={deal.id} className="rel-picker-row" onClick={() => void addDealToPeek(deal)}>
                    <Avatar src={deal.company?.logo_url ?? peekCompany?.logo_url} name={deal.company?.name ?? deal.title} sq size={28} />
                    <span><strong>{deal.title}</strong><em>{deal.company?.name || deal.stage || 'Deal'}</em></span>
                  </button>
                ))}
              {opportunities
                .filter(deal => !peekDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(dealPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available deals match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddDeal()}><Plus size={11} /> Create new record{dealPickerQuery.trim() ? ` "${dealPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedPerson && nestedPersonDealPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setNestedPersonDealPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Associate deal</span>
              <button onClick={() => setNestedPersonDealPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={nestedPersonDealPickerQuery}
                onChange={event => setNestedPersonDealPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {opportunities
                .filter(deal => !nestedPersonDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(nestedPersonDealPickerQuery.toLowerCase()))
                .map(deal => (
                  <button key={deal.id} className="rel-picker-row" onClick={() => void addDealToNestedPerson(deal)}>
                    <Avatar src={deal.company?.logo_url ?? nestedPersonCompany?.logo_url ?? peekCompany?.logo_url} name={deal.company?.name ?? nestedPersonCompany?.name ?? deal.title} sq size={28} />
                    <span><strong>{deal.title}</strong><em>{deal.company?.name || deal.stage || 'Deal'}</em></span>
                  </button>
                ))}
              {opportunities
                .filter(deal => !nestedPersonDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(nestedPersonDealPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available deals match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddDealToNestedPerson()}><Plus size={11} /> Create new record{nestedPersonDealPickerQuery.trim() ? ` "${nestedPersonDealPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedPerson && nestedPersonListPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setNestedPersonListPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Add to list</span>
              <button onClick={() => setNestedPersonListPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={nestedPersonListPickerQuery}
                onChange={event => setNestedPersonListPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'person')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(nestedPersonListPickerQuery.toLowerCase()))
                .map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void addNestedPersonToList(list)}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                ))}
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'person')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(nestedPersonListPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available lists match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddNestedPersonList()}><Plus size={11} /> Create new record{nestedPersonListPickerQuery.trim() ? ` "${nestedPersonListPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedDeal && dealPeoplePickerOpen && (
        <div className="crm-modal-bg" onClick={() => setDealPeoplePickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Associate people</span>
              <button onClick={() => setDealPeoplePickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Users size={12} />
              <input
                autoFocus
                value={dealPeoplePickerQuery}
                onChange={event => setDealPeoplePickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {contacts
                .filter(person => !nestedDealPeople.some(existing => existing.id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(dealPeoplePickerQuery.toLowerCase()))
                .map(person => (
                  <button key={person.id} className="rel-picker-row" onClick={() => void addPersonToNestedDeal(person)}>
                    <ContactAvatar name={person.name} photoUrl={person.profile_photo_url} size={28} />
                    <span><strong>{person.name}</strong><em>{person.job_title || person.company || person.email || 'Person'}</em></span>
                  </button>
                ))}
              {contacts
                .filter(person => !nestedDealPeople.some(existing => existing.id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(dealPeoplePickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Users size={15} /><span>No available people match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddPersonToNestedDeal()}><Plus size={11} /> Create new record{dealPeoplePickerQuery.trim() ? ` "${dealPeoplePickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedDeal && nestedDealListPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setNestedDealListPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Add to list</span>
              <button onClick={() => setNestedDealListPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={nestedDealListPickerQuery}
                onChange={event => setNestedDealListPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'opportunity')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(nestedDealListPickerQuery.toLowerCase()))
                .map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void addNestedDealToList(list)}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                ))}
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'opportunity')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(nestedDealListPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available lists match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddNestedDealList()}><Plus size={11} /> Create new record{nestedDealListPickerQuery.trim() ? ` "${nestedDealListPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedCompany && companyTeamPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setCompanyTeamPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Add team member</span>
              <button onClick={() => setCompanyTeamPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Users size={12} />
              <input
                autoFocus
                value={companyTeamPickerQuery}
                onChange={event => setCompanyTeamPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {contacts
                .filter(person => !nestedCompanyTeam.some(existing => existing.id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(companyTeamPickerQuery.toLowerCase()))
                .map(person => (
                  <button key={person.id} className="rel-picker-row" onClick={() => void attachPersonToNestedCompany(person)}>
                    <ContactAvatar name={person.name} photoUrl={person.profile_photo_url} size={28} />
                    <span><strong>{person.name}</strong><em>{person.job_title || person.company || person.email || 'Person'}</em></span>
                  </button>
                ))}
              {contacts
                .filter(person => !nestedCompanyTeam.some(existing => existing.id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(companyTeamPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Users size={15} /><span>No available people match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddPersonToNestedCompany()}><Plus size={11} /> Create new record{companyTeamPickerQuery.trim() ? ` "${companyTeamPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedCompany && companyDealPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setCompanyDealPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Associate deal</span>
              <button onClick={() => setCompanyDealPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={companyDealPickerQuery}
                onChange={event => setCompanyDealPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {opportunities
                .filter(deal => !nestedCompanyDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(companyDealPickerQuery.toLowerCase()))
                .map(deal => (
                  <button key={deal.id} className="rel-picker-row" onClick={() => void attachDealToNestedCompany(deal)}>
                    <Avatar src={deal.company?.logo_url ?? nestedCompany.logo_url} name={deal.company?.name ?? nestedCompany.name} sq size={28} />
                    <span><strong>{deal.title}</strong><em>{deal.company?.name || deal.stage || 'Deal'}</em></span>
                  </button>
                ))}
              {opportunities
                .filter(deal => !nestedCompanyDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(companyDealPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available deals match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddDealToNestedCompany()}><Plus size={11} /> Create new record{companyDealPickerQuery.trim() ? ` "${companyDealPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
      {peekContact && nestedCompany && companyListPickerOpen && (
        <div className="crm-modal-bg" onClick={() => setCompanyListPickerOpen(false)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>Add to list</span>
              <button onClick={() => setCompanyListPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search">
              <Target size={12} />
              <input
                autoFocus
                value={companyListPickerQuery}
                onChange={event => setCompanyListPickerQuery(event.target.value)}
                placeholder="Search records..."
              />
            </div>
            <div className="rel-picker-list">
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'company')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(companyListPickerQuery.toLowerCase()))
                .map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void addNestedCompanyToList(list)}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                ))}
              {lists
                .filter(list => (list.parent_object ?? 'person') === 'company')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(companyListPickerQuery.toLowerCase())).length === 0 && (
                  <div className="rel-picker-empty"><Target size={15} /><span>No available lists match.</span></div>
                )}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createAndAddNestedCompanyList()}><Plus size={11} /> Create new record{companyListPickerQuery.trim() ? ` "${companyListPickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
