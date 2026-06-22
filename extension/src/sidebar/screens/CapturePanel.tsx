import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { CaptureEntityType, CaptureSnapshotRecord, PageCaptureContext } from '../../lib/pageCapture'
import { localMarkdownPath } from '../../lib/pageCapture'

interface Props {
  user: User
  context: PageCaptureContext
  onRefresh: () => void
  onSignOut: () => void
}

interface ExistingRecord {
  id: string
  type: CaptureEntityType
  name: string
  companyId?: string | null
  domain?: string | null
  description?: string | null
  company?: string | null
  jobTitle?: string | null
  email?: string | null
  phone?: string | null
  location?: string | null
  stage?: string | null
  dealValue?: number | null
  ownerId?: string | null
  logoUrl?: string | null
  profilePhotoUrl?: string | null
  angellistUrl?: string | null
  facebookUrl?: string | null
  instagramUrl?: string | null
  linkedinUrl?: string | null
  twitterUrl?: string | null
}

interface PanelRoute {
  id: string
  type: CaptureEntityType
}

interface CompanyOption {
  id: string
  name: string
  domain: string | null
  logo_url?: string | null
}

interface ListOption {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  stages?: Array<{ key: string; label: string; color?: string | null }>
}

interface ListMembershipRecord {
  id: string
  list_id: string
  current_stage: string
  notes?: string | null
  attributes?: Record<string, unknown> | null
  list?: ListOption | null
}

interface DealRecord {
  id: string
  title: string
  stage: string | null
  type?: string | null
  estimated_value?: number | null
  company?: { name?: string | null; logo_url?: string | null; domain?: string | null } | null
}

interface DealDraft {
  title: string
  stage: string
  owner: string
  value: string
  peopleIds: string[]
  companyId: string
  closeDate: string
  type: string
  jobDesc: string
}

interface PersonRelationRecord {
  id: string
  name: string
  company_id?: string | null
  job_title?: string | null
  company?: string | null
  profile_photo_url?: string | null
  email?: string | null
}

const EMPTY_RECORD: ExistingRecord | null = null
const COMPANY_SELECT = 'id, name, domain, website_url, description, headline, logo_url, primary_location, linkedin_url, angellist_url, facebook_url, instagram_url, twitter_url'
const PERSON_SELECT = 'id, name, company, company_id, job_title, profile_photo_url, email, phone, location, personal_context, linkedin_url, angellist_url, facebook_url, instagram_url, twitter_url'

type RtIconName =
  | 'arrow-left'
  | 'briefcase'
  | 'building'
  | 'calendar'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'download'
  | 'edit'
  | 'external'
  | 'facebook'
  | 'globe'
  | 'instagram'
  | 'link'
  | 'linkedin'
  | 'list'
  | 'location'
  | 'mail'
  | 'menu'
  | 'money'
  | 'phone'
  | 'refresh'
  | 'search'
  | 'sparkles'
  | 'tag'
  | 'text'
  | 'twitter'
  | 'user'
  | 'users'

function RtIcon({ name, size = 14 }: { name: RtIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  }
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'arrow-left': return <svg {...common}><path {...stroke} d="M15 18l-6-6 6-6" /><path {...stroke} d="M9 12h11" /></svg>
    case 'briefcase': return <svg {...common}><path {...stroke} d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7" /><rect {...stroke} x="4" y="7" width="16" height="12" rx="2" /><path {...stroke} d="M4 12h16M10 12v1h4v-1" /></svg>
    case 'building': return <svg {...common}><rect {...stroke} x="5" y="3" width="14" height="18" rx="2" /><path {...stroke} d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></svg>
    case 'calendar': return <svg {...common}><rect {...stroke} x="4" y="5" width="16" height="15" rx="2" /><path {...stroke} d="M8 3v4M16 3v4M4 10h16" /></svg>
    case 'check': return <svg {...common}><path {...stroke} d="M5 12.5l4.2 4.2L19 7" /></svg>
    case 'chevron-down': return <svg {...common}><path {...stroke} d="M6 9l6 6 6-6" /></svg>
    case 'chevron-left': return <svg {...common}><path {...stroke} d="M15 18l-6-6 6-6" /></svg>
    case 'chevron-right': return <svg {...common}><path {...stroke} d="M9 18l6-6-6-6" /></svg>
    case 'close': return <svg {...common}><path {...stroke} d="M6 6l12 12M18 6L6 18" /></svg>
    case 'download': return <svg {...common}><path {...stroke} d="M12 4v10" /><path {...stroke} d="M8 10l4 4 4-4" /><path {...stroke} d="M5 20h14" /></svg>
    case 'edit': return <svg {...common}><path {...stroke} d="M4 20h4l10.5-10.5a2.8 2.8 0 00-4-4L4 16v4z" /><path {...stroke} d="M13.5 6.5l4 4" /></svg>
    case 'external': return <svg {...common}><path {...stroke} d="M14 5h5v5" /><path {...stroke} d="M10 14L19 5" /><path {...stroke} d="M19 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h4" /></svg>
    case 'facebook': return <svg {...common}><path fill="currentColor" d="M14 8h2V5h-2.4C10.9 5 10 6.8 10 8.7V11H8v3h2v6h3v-6h2.4l.6-3h-3V8.9c0-.6.2-.9 1-.9z" /></svg>
    case 'globe': return <svg {...common}><circle {...stroke} cx="12" cy="12" r="8" /><path {...stroke} d="M4 12h16M12 4a12 12 0 010 16M12 4a12 12 0 000 16" /></svg>
    case 'instagram': return <svg {...common}><rect {...stroke} x="5" y="5" width="14" height="14" rx="4" /><circle {...stroke} cx="12" cy="12" r="3" /><path {...stroke} d="M16.5 7.5h.01" /></svg>
    case 'link': return <svg {...common}><path {...stroke} d="M10 13a5 5 0 007.1 0l1.4-1.4a5 5 0 00-7.1-7.1L10.6 5" /><path {...stroke} d="M14 11a5 5 0 00-7.1 0l-1.4 1.4a5 5 0 007.1 7.1l.8-.8" /></svg>
    case 'linkedin': return <svg {...common}><path fill="currentColor" d="M6.5 9H3.8v11h2.7V9zM5.2 4a1.6 1.6 0 100 3.2A1.6 1.6 0 005.2 4zM20.2 13.8c0-3.2-1.7-5-4.1-5-1.9 0-2.7 1-3.1 1.7V9h-2.7v11H13v-6.1c0-1.6.9-2.6 2.2-2.6 1.2 0 2.1.8 2.1 2.7v6h2.8v-6.2z" /></svg>
    case 'list': return <svg {...common}><rect {...stroke} x="4" y="4" width="16" height="16" rx="3" /><path {...stroke} d="M8 9h8M8 13h8M8 17h5" /></svg>
    case 'location': return <svg {...common}><path {...stroke} d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1114 0z" /><circle {...stroke} cx="12" cy="10" r="2" /></svg>
    case 'mail': return <svg {...common}><rect {...stroke} x="4" y="6" width="16" height="12" rx="2" /><path {...stroke} d="M4 8l8 5 8-5" /></svg>
    case 'menu': return <svg {...common}><path {...stroke} d="M6 8h12M6 12h12M6 16h12" /></svg>
    case 'money': return <svg {...common}><rect {...stroke} x="4" y="6" width="16" height="12" rx="2" /><path {...stroke} d="M8 12h8M12 9v6" /></svg>
    case 'phone': return <svg {...common}><path {...stroke} d="M8 5l2 4-2 1.5c1 2.2 2.3 3.5 4.5 4.5L14 13l4 2-1 4c-7 0-12-5-12-12l3-2z" /></svg>
    case 'refresh': return <svg {...common}><path {...stroke} d="M20 12a8 8 0 01-14.3 5" /><path {...stroke} d="M4 12A8 8 0 0118.3 7" /><path {...stroke} d="M18 3v4h-4M6 21v-4h4" /></svg>
    case 'search': return <svg {...common}><circle {...stroke} cx="11" cy="11" r="6" /><path {...stroke} d="M16 16l4 4" /></svg>
    case 'sparkles': return <svg {...common}><path {...stroke} d="M12 3l1.6 5 5.4 1.5-5.4 1.5L12 16l-1.6-5L5 9.5 10.4 8 12 3z" /><path {...stroke} d="M18 15l.7 2.2L21 18l-2.3.8L18 21l-.7-2.2L15 18l2.3-.8L18 15z" /></svg>
    case 'tag': return <svg {...common}><path {...stroke} d="M4 12V5h7l9 9-6 6-10-8z" /><circle {...stroke} cx="8" cy="8" r="1" /></svg>
    case 'text': return <svg {...common}><path {...stroke} d="M5 6h14M8 6v12M16 6v12M7 18h4M13 18h4" /></svg>
    case 'twitter': return <svg {...common}><path fill="currentColor" d="M4 4h4.2l4.3 6 5-6H20l-6.4 7.7L20 20h-4.2l-4.7-6.5L5.7 20H4l6.3-7.6L4 4zm3.1 1.6l9.5 12.8h1.3L8.4 5.6H7.1z" /></svg>
    case 'user': return <svg {...common}><circle {...stroke} cx="12" cy="8" r="3.5" /><path {...stroke} d="M5 20c1.2-4 12.8-4 14 0" /></svg>
    case 'users': return <svg {...common}><circle {...stroke} cx="9" cy="8" r="3" /><path {...stroke} d="M3.5 19c1-3.4 10-3.4 11 0" /><path {...stroke} d="M15 6.2a3 3 0 010 5.6M17 15c1.8.5 3 1.8 3.5 4" /></svg>
    default: return null
  }
}

function ObjectGlyph({ type, icon }: { type?: CaptureEntityType | 'list'; icon?: RtIconName }) {
  const name = icon ?? (type === 'person' ? 'user' : type === 'opportunity' ? 'money' : type === 'list' ? 'list' : 'building')
  return <span className={`rt-object-glyph ${type ?? ''}`}><RtIcon name={name} size={12} /></span>
}

function stringifyNullable(value: unknown) {
  return value == null ? null : String(value)
}

function parseCurrency(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value?: number | null) {
  if (!value) return 'Set value...'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

export function CapturePanel({ user, context, onRefresh }: Props) {
  const [entityType, setEntityType] = useState<CaptureEntityType>(context.entityType)
  const [existing, setExisting] = useState<ExistingRecord | null>(EMPTY_RECORD)
  const [matchedCompany, setMatchedCompany] = useState<CompanyOption | null>(null)
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([])
  const [showCompanyPicker, setShowCompanyPicker] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<CaptureSnapshotRecord | null>(null)
  const [localSaved, setLocalSaved] = useState(false)
  const [aiDone, setAiDone] = useState(false)
  const [showAllValues, setShowAllValues] = useState(false)
  const [lists, setLists] = useState<ListOption[]>([])
  const [memberships, setMemberships] = useState<ListMembershipRecord[]>([])
  const [showListPicker, setShowListPicker] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [deals, setDeals] = useState<DealRecord[]>([])
  const [teamMembers, setTeamMembers] = useState<PersonRelationRecord[]>([])
  const [associatedPeople, setAssociatedPeople] = useState<PersonRelationRecord[]>([])
  const [showDealCreator, setShowDealCreator] = useState(false)
  const [newDealTitle, setNewDealTitle] = useState('')
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const [peopleOptions, setPeopleOptions] = useState<PersonRelationRecord[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [showDealPeoplePicker, setShowDealPeoplePicker] = useState(false)
  const [showOwnerPicker, setShowOwnerPicker] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<PanelRoute | null>(null)
  const [routeStack, setRouteStack] = useState<ExistingRecord[]>([])
  const [brokenLogoUrls, setBrokenLogoUrls] = useState<string[]>([])
  const lastContextUrl = useRef(context.url)
  const routeBaseUrl = useRef(context.url)

  const [name, setName] = useState(context.suggestedName)
  const [domain, setDomain] = useState(context.domain ?? '')
  const [description, setDescription] = useState(context.description ?? '')
  const [jobTitle, setJobTitle] = useState(context.jobTitle ?? '')
  const [companyName, setCompanyName] = useState(context.companyName ?? '')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState(context.location ?? '')
  const [dealValueInput, setDealValueInput] = useState('')
  const [showStagePicker, setShowStagePicker] = useState(false)
  const [angellistUrl, setAngellistUrl] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState(context.linkedinUrl ?? '')
  const [twitterUrl, setTwitterUrl] = useState('')

  useEffect(() => {
    const urlChanged = context.url !== lastContextUrl.current
    if (urlChanged) {
      lastContextUrl.current = context.url
      setSelectedRoute(null)
      setRouteStack([])
      setBrokenLogoUrls([])
    }

    if (!selectedRoute || urlChanged) {
      setEntityType(context.entityType)
      setName(context.suggestedName)
      setDomain(context.domain ?? '')
      setDescription(context.description ?? '')
      setJobTitle(context.jobTitle ?? '')
      setCompanyName(context.companyName ?? '')
      setLocation(context.location ?? '')
      setLinkedinUrl(context.linkedinUrl ?? '')
    }
  }, [
    context.url,
    context.entityType,
    context.suggestedName,
    context.domain,
    context.description,
    context.jobTitle,
    context.companyName,
    context.location,
    selectedRoute,
  ])

  useEffect(() => {
    if (selectedRoute) {
      if (context.url !== routeBaseUrl.current) return
      loadRecordByRoute(selectedRoute)
    } else {
      loadMatches()
    }
  }, [user.id, context.url, context.suggestedName, context.linkedinUrl, context.linkedinSlug, context.domain, entityType, selectedRoute?.id, selectedRoute?.type])

  const recordLabel = entityType === 'company' ? 'Company' : entityType === 'person' ? 'Person' : 'Opportunity'
  const suggestionName = entityType === 'company' ? (name || domain || context.domain || '') : name
  const recordSubtitle = entityType === 'opportunity'
    ? (matchedCompany?.name || companyName || 'Opportunity')
    : (domain || context.hostname)
  const ownerPerson = existing?.ownerId
    ? associatedPeople.find(person => person.id === existing.ownerId) ?? peopleOptions.find(person => person.id === existing.ownerId) ?? null
    : null
  const storedPersonPhoto = existing?.profilePhotoUrl === matchedCompany?.logo_url ? null : (existing?.profilePhotoUrl || existing?.logoUrl)
  const logoCandidates = entityType === 'person'
    ? [selectedRoute ? null : context.profilePhotoUrl, storedPersonPhoto]
    : entityType === 'opportunity'
      ? [matchedCompany?.logo_url, matchedCompany?.domain ? `https://www.google.com/s2/favicons?domain=${matchedCompany.domain}&sz=128` : null, existing?.logoUrl]
      : [existing?.logoUrl, ...(selectedRoute ? [] : (context.logoCandidates ?? [])), selectedRoute ? null : context.faviconUrl, existing?.domain ? `https://www.google.com/s2/favicons?domain=${existing.domain}&sz=128` : null]
  const logoUrl = firstWorkingLogo(logoCandidates, brokenLogoUrls)
  const isPersonLogo = entityType === 'person'

  async function loadMatches() {
    setLoading(true)
    setExisting(null)
    setMatchedCompany(null)
    setCompanyName(context.companyName ?? '')
    setDomain(context.domain ?? '')
    setMemberships([])
    setDeals([])
    setTeamMembers([])
    setAssociatedPeople([])
    setShowTeamPicker(false)
    try {
      let found: ExistingRecord | null = null
      if (entityType === 'company') {
        const record = await findCompany()
        if (record) {
          applyExistingRecord(record)
          await syncCurrentCompanyLogo(record)
          found = record
        }
      }

      if (entityType === 'person') {
        const record = await findPerson()
        let linkedCompany: CompanyOption | null = null
        if (record) {
          applyExistingRecord(record)
          await syncCurrentProfilePhoto(record)
          linkedCompany = await findCompanyById(record.companyId)
          if (linkedCompany) setMatchedCompany(linkedCompany)
          found = record
        }
        const company = linkedCompany ?? await findCompanyOption()
        if (company) setMatchedCompany(company)
        await loadCompanyOptions(company?.name ?? record?.company ?? companyName)
      }

      if (entityType === 'opportunity') {
        const record = await findOpportunity()
        if (record) {
          applyExistingRecord(record)
          found = record
        }
        const company = await findCompanyOption()
        if (company) setMatchedCompany(company)
        await loadCompanyOptions(company?.name ?? companyName)
        await loadPeopleOptions('')
      }
      await loadLists()
      if (found) await loadRelated(found)
    } finally {
      setLoading(false)
    }
  }

  async function loadRecordByRoute(route: PanelRoute) {
    setLoading(true)
    setExisting(null)
    setMatchedCompany(null)
    setMemberships([])
    setDeals([])
    setTeamMembers([])
    setAssociatedPeople([])
    setShowCompanyPicker(false)
    setShowTeamPicker(false)
    try {
      const record = await fetchRecordByRoute(route)
      if (!record) {
        setStatusText('Record not found.')
        return
      }

      setEntityType(record.type)
      applyExistingRecord(record)

      if (record.type === 'person' || record.type === 'opportunity') {
        const company = await findCompanyById(record.companyId)
        if (company) {
          setMatchedCompany(company)
          setCompanyName(company.name)
        }
        await loadCompanyOptions(company?.name ?? record.company ?? companyName)
        if (record.type === 'opportunity') await loadPeopleOptions('')
      }

      await loadLists()
      await loadRelated(record)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRecordByRoute(route: PanelRoute): Promise<ExistingRecord | null> {
    if (route.type === 'company') {
      const { data } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .eq('user_id', user.id)
        .eq('id', route.id)
        .maybeSingle()
      return data
        ? companyRecordFromData(data)
        : null
    }

    if (route.type === 'person') {
      const { data } = await supabase
        .from('outreach_logs')
        .select(PERSON_SELECT)
        .eq('user_id', user.id)
        .eq('id', route.id)
        .maybeSingle()
      return data
        ? personRecordFromData(data)
        : null
    }

    const { data } = await supabase
      .from('opportunities')
      .select('id, title, stage, estimated_value, owner_contact_id, company_id, notes, company:companies(name)')
      .eq('user_id', user.id)
      .eq('id', route.id)
      .maybeSingle()
    if (!data) return null
    const companyRecord = data.company as { name?: string | null } | { name?: string | null }[] | null
    const company = Array.isArray(companyRecord) ? companyRecord[0]?.name : companyRecord?.name
    return { id: data.id, type: 'opportunity', name: data.title, stage: data.stage, dealValue: data.estimated_value, ownerId: data.owner_contact_id, companyId: data.company_id, company, description: data.notes }
  }

  function openRoute(route: PanelRoute) {
    routeBaseUrl.current = context.url
    if (existing) setRouteStack(stack => [...stack, existing])
    setSelectedRoute(route)
  }

  function goBack() {
    const previous = routeStack[routeStack.length - 1]
    if (previous) {
      setRouteStack(stack => stack.slice(0, -1))
      setSelectedRoute({ id: previous.id, type: previous.type })
      return
    }
    setSelectedRoute(null)
    setEntityType(context.entityType)
  }

  function refreshActiveRecord() {
    if (selectedRoute) void loadRecordByRoute(selectedRoute)
    else void loadMatches()
  }

  async function loadLists() {
    const { data } = await supabase
      .from('lists')
      .select('id, name, icon, color, stages')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at')
    setLists((data ?? []) as ListOption[])
  }

  async function loadRelated(record: ExistingRecord) {
    await loadListMemberships(record)

    if (record.type === 'person') {
      const { data: links, error } = await supabase
        .from('opportunity_contacts')
        .select('opportunity_id')
        .eq('outreach_log_id', record.id)
      if (!error && links && links.length > 0) {
        const ids = links.map((link: any) => link.opportunity_id)
        const { data: opps } = await supabase
          .from('opportunities')
          .select('id, title, stage, type, estimated_value, company:companies(name, logo_url, domain)')
          .eq('user_id', user.id)
          .in('id', ids)
        setDeals((opps ?? []) as DealRecord[])
      } else {
        setDeals([])
      }
    }

    if (record.type === 'company') {
      const [{ data }, { data: membersById }, { data: membersByName }, { data: membersByEmail }] = await Promise.all([
        supabase
        .from('opportunities')
        .select('id, title, stage, type, estimated_value, company_id, company:companies(name, logo_url, domain)')
        .eq('user_id', user.id)
        .eq('company_id', record.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('outreach_logs')
          .select('id, name, company_id, job_title, company, profile_photo_url, email')
          .eq('user_id', user.id)
          .eq('company_id', record.id)
          .order('name'),
        supabase
          .from('outreach_logs')
          .select('id, name, company_id, job_title, company, profile_photo_url, email')
          .eq('user_id', user.id)
          .ilike('company', record.name)
          .order('name'),
        record.domain
          ? supabase
            .from('outreach_logs')
            .select('id, name, company_id, job_title, company, profile_photo_url, email')
            .eq('user_id', user.id)
            .ilike('email', `%@${record.domain}`)
            .order('name')
          : Promise.resolve({ data: [] }),
      ])
      const people = new Map<string, PersonRelationRecord>()
      for (const member of [...(membersById ?? []), ...(membersByName ?? []), ...(membersByEmail ?? [])] as PersonRelationRecord[]) people.set(member.id, member)
      const members = [...people.values()]
      const mergedDeals = new Map<string, DealRecord & { company_id?: string | null }>()
      for (const deal of (data ?? []) as Array<DealRecord & { company_id?: string | null }>) mergedDeals.set(deal.id, deal)
      if (members.length > 0) {
        const { data: contactLinks } = await supabase
          .from('opportunity_contacts')
          .select('opportunity_id')
          .in('outreach_log_id', members.map(member => member.id))
        const linkedIds = [...new Set((contactLinks ?? []).map((link: any) => link.opportunity_id).filter(Boolean))]
        if (linkedIds.length > 0) {
          const { data: linkedDeals } = await supabase
            .from('opportunities')
            .select('id, title, stage, type, estimated_value, company_id, company:companies(name, logo_url, domain)')
            .eq('user_id', user.id)
            .in('id', linkedIds)
          for (const deal of (linkedDeals ?? []) as Array<DealRecord & { company_id?: string | null }>) mergedDeals.set(deal.id, deal)
        }
      }
      setDeals([...mergedDeals.values()])
      setTeamMembers(members)
      void backfillCompanyRelations(record, members, [...mergedDeals.values()])
    }

    if (record.type === 'opportunity') {
      const { data: links, error } = await supabase
        .from('opportunity_contacts')
        .select('contact:outreach_logs(id, name, job_title, company, profile_photo_url, email)')
        .eq('opportunity_id', record.id)
      if (!error && links) {
        setAssociatedPeople(links
          .map((link: any) => Array.isArray(link.contact) ? link.contact[0] : link.contact)
          .filter(Boolean) as PersonRelationRecord[])
      }
    }
  }

  async function loadListMemberships(record: ExistingRecord) {
    const idColumn = record.type === 'person'
      ? 'contact_id'
      : record.type === 'company'
        ? 'company_id'
        : 'opportunity_id'
    const { data } = await supabase
      .from('list_memberships')
      .select('id, list_id, current_stage, notes, attributes, list:lists(id, name, icon, color, stages)')
      .eq('user_id', user.id)
      .eq(idColumn, record.id)
      .order('entered_at', { ascending: false })
    setMemberships((data ?? []).map((row: any) => ({
      ...row,
      list: Array.isArray(row.list) ? row.list[0] : row.list,
    })) as ListMembershipRecord[])
  }

  async function loadCompanyOptions(query: string | null) {
    const trimmed = query?.trim()
    const request = supabase
      .from('companies')
      .select('id, name, domain, logo_url')
      .eq('user_id', user.id)
      .order('name')
      .limit(8)
    const { data } = trimmed
      ? await request.or(`name.ilike.%${trimmed}%,domain.ilike.%${trimmed}%`)
      : await request
    setCompanyOptions((data ?? []) as CompanyOption[])
  }

  async function loadPeopleOptions(query: string | null) {
    const trimmed = query?.trim()
    const request = supabase
      .from('outreach_logs')
      .select('id, name, company_id, job_title, company, profile_photo_url, email')
      .eq('user_id', user.id)
      .order('name')
      .limit(12)
    const { data } = trimmed
      ? await request.or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,company.ilike.%${trimmed}%`)
      : await request
    setPeopleOptions((data ?? []) as PersonRelationRecord[])
  }

  async function toggleTeamMember(person: PersonRelationRecord) {
    if (!existing || existing.type !== 'company') return
    const isLinked = person.company_id === existing.id || teamMembers.some(member => member.id === person.id)
    const { error } = await supabase
      .from('outreach_logs')
      .update({
        company_id: isLinked ? null : existing.id,
        company: isLinked ? null : existing.name,
        company_domain: isLinked ? null : (existing.domain ?? null),
      })
      .eq('id', person.id)
      .eq('user_id', user.id)
    if (error) {
      setStatusText(error.message)
      return
    }
    await loadRelated(existing)
    await loadPeopleOptions(peopleSearch)
  }

  async function toggleOpportunityPerson(person: PersonRelationRecord) {
    if (!existing || existing.type !== 'opportunity') return
    const isLinked = associatedPeople.some(member => member.id === person.id)
    if (isLinked) {
      const { error } = await supabase
        .from('opportunity_contacts')
        .delete()
        .eq('opportunity_id', existing.id)
        .eq('outreach_log_id', person.id)
      if (error) {
        setStatusText(error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('opportunity_contacts')
        .insert({
          opportunity_id: existing.id,
          outreach_log_id: person.id,
          role: 'associated',
        })
      if (error && error.code !== '23505') {
        setStatusText(error.message)
        return
      }
    }
    await loadRelated(existing)
    await loadPeopleOptions(peopleSearch)
  }

  async function persistDealOwner(person: PersonRelationRecord | null) {
    if (!existing || existing.type !== 'opportunity') return
    const patch = { owner_contact_id: person?.id ?? null }
    const { error } = await supabase
      .from('opportunities')
      .update(patch)
      .eq('id', existing.id)
      .eq('user_id', user.id)
    if (error) {
      setStatusText(error.message)
      return
    }
    if (person) {
      const link = await supabase
        .from('opportunity_contacts')
        .insert({
          opportunity_id: existing.id,
          outreach_log_id: person.id,
          role: 'owner',
        })
      if (link.error && link.error.code !== '23505') {
        setStatusText(link.error.message)
        return
      }
    }
    setExisting({ ...existing, ownerId: person?.id ?? null })
    await loadRelated({ ...existing, ownerId: person?.id ?? null })
    setShowOwnerPicker(false)
  }

  async function syncCurrentProfilePhoto(record: ExistingRecord) {
    if (record.type !== 'person' || !context.profilePhotoUrl) return
    if (record.profilePhotoUrl === context.profilePhotoUrl) return
    const { error } = await supabase
      .from('outreach_logs')
      .update({ profile_photo_url: context.profilePhotoUrl })
      .eq('id', record.id)
      .eq('user_id', user.id)
    if (!error) {
      const next = { ...record, profilePhotoUrl: context.profilePhotoUrl, logoUrl: context.profilePhotoUrl }
      setExisting(next)
    }
  }

  async function syncCurrentCompanyLogo(record: ExistingRecord) {
    if (record.type !== 'company') return
    const effectiveDomain = record.domain ?? context.domain
    const candidate = firstWorkingLogo([
      effectiveDomain ? `https://www.google.com/s2/favicons?domain=${effectiveDomain}&sz=128` : null,
      context.faviconUrl,
      ...(context.logoCandidates ?? []),
    ], brokenLogoUrls)
    if (!candidate && (record.domain || !context.domain)) return
    const patch: Record<string, unknown> = {}
    if (!record.domain && context.domain) patch.domain = context.domain
    if (record.logoUrl === candidate) return
    const shouldUpdate =
      !record.logoUrl ||
      record.logoUrl.includes('google.com/s2/favicons') ||
      isBadLogoUrl(record.logoUrl) ||
      (candidate ? isBetterCompanyLogo(record.logoUrl, candidate, effectiveDomain) : false)
    if (candidate && shouldUpdate) patch.logo_url = candidate
    if (Object.keys(patch).length === 0) return
    const { error } = await supabase
      .from('companies')
      .update(patch)
      .eq('id', record.id)
      .eq('user_id', user.id)
    if (!error) {
      setExisting({ ...record, domain: (patch.domain as string | undefined) ?? record.domain, logoUrl: (patch.logo_url as string | undefined) ?? record.logoUrl })
      if (patch.domain) setDomain(String(patch.domain))
    }
  }

  async function handleLogoError(failedUrl: string) {
    const nextBroken = [...new Set([...brokenLogoUrls, failedUrl])]
    setBrokenLogoUrls(nextBroken)
    if (!existing || existing.type !== 'company') return

    const replacement = firstWorkingLogo([
      ...(selectedRoute ? [] : (context.logoCandidates ?? [])),
      selectedRoute ? null : context.faviconUrl,
      existing.domain ? `https://www.google.com/s2/favicons?domain=${existing.domain}&sz=128` : null,
    ], nextBroken)
    if (!replacement || replacement === existing.logoUrl) return

    const { error } = await supabase
      .from('companies')
      .update({ logo_url: replacement })
      .eq('id', existing.id)
      .eq('user_id', user.id)
    if (!error) {
      setExisting({ ...existing, logoUrl: replacement })
    }
  }

  async function backfillCompanyRelations(
    company: ExistingRecord,
    people: PersonRelationRecord[],
    companyDeals: Array<DealRecord & { company_id?: string | null }>,
  ) {
    const peopleToPatch = people
      .filter(person => person.company_id !== company.id)
      .map(person => person.id)
    if (peopleToPatch.length > 0) {
      await supabase
        .from('outreach_logs')
        .update({ company_id: company.id, company: company.name })
        .eq('user_id', user.id)
        .in('id', peopleToPatch)
    }

    const dealsToPatch = companyDeals
      .filter(deal => deal.company_id !== company.id)
      .map(deal => deal.id)
    if (dealsToPatch.length > 0) {
      await supabase
        .from('opportunities')
        .update({ company_id: company.id })
        .eq('user_id', user.id)
        .in('id', dealsToPatch)
    }
  }

  async function persistCompanyRelation(company: CompanyOption | null) {
    if (!existing) {
      setMatchedCompany(company)
      setCompanyName(company?.name ?? '')
      setShowCompanyPicker(false)
      return
    }

    if (existing.type === 'person') {
      const { data, error } = await supabase
        .from('outreach_logs')
        .update({ company_id: company?.id ?? null, company: company?.name ?? null })
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('id, company, company_id')
        .single()
      if (error) {
        setStatusText(error.message)
        return
      }
      setMatchedCompany(company)
      setCompanyName(company?.name ?? '')
      setShowCompanyPicker(false)
      const next = { ...existing, company: data.company ?? null, companyId: data.company_id ?? null }
      setExisting(next)
      await loadRelated(next)
      return
    }

    if (existing.type === 'opportunity') {
      const { data, error } = await supabase
        .from('opportunities')
        .update({ company_id: company?.id ?? null })
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('id, company_id')
        .single()
      if (error) {
        setStatusText(error.message)
        return
      }
      setMatchedCompany(company)
      setCompanyName(company?.name ?? '')
      setShowCompanyPicker(false)
      const next = { ...existing, company: company?.name ?? null, companyId: data.company_id ?? null }
      setExisting(next)
      await loadRelated(next)
      return
    }

    setMatchedCompany(company)
    setCompanyName(company?.name ?? '')
    setShowCompanyPicker(false)
  }

  async function persistRecordPatch(patch: Record<string, unknown>) {
    if (!existing || Object.keys(patch).length === 0) return
    const table = existing.type === 'company'
      ? 'companies'
      : existing.type === 'person'
        ? 'outreach_logs'
        : 'opportunities'
    const { error } = await supabase
      .from(table)
      .update(patch)
      .eq('id', existing.id)
      .eq('user_id', user.id)
    if (error) {
      setStatusText(error.message)
      return
    }
    setExisting(prev => prev ? {
      ...prev,
      ...('name' in patch ? { name: String(patch.name ?? '') } : {}),
      ...('title' in patch ? { name: String(patch.title ?? '') } : {}),
      ...('domain' in patch ? { domain: stringifyNullable(patch.domain) } : {}),
      ...('description' in patch ? { description: stringifyNullable(patch.description) } : {}),
      ...('personal_context' in patch ? { description: stringifyNullable(patch.personal_context) } : {}),
      ...('job_title' in patch ? { jobTitle: stringifyNullable(patch.job_title) } : {}),
      ...('email' in patch ? { email: stringifyNullable(patch.email) } : {}),
      ...('phone' in patch ? { phone: stringifyNullable(patch.phone) } : {}),
      ...('location' in patch ? { location: stringifyNullable(patch.location) } : {}),
      ...('primary_location' in patch ? { location: stringifyNullable(patch.primary_location) } : {}),
      ...('angellist_url' in patch ? { angellistUrl: stringifyNullable(patch.angellist_url) } : {}),
      ...('facebook_url' in patch ? { facebookUrl: stringifyNullable(patch.facebook_url) } : {}),
      ...('instagram_url' in patch ? { instagramUrl: stringifyNullable(patch.instagram_url) } : {}),
      ...('linkedin_url' in patch ? { linkedinUrl: stringifyNullable(patch.linkedin_url) } : {}),
      ...('twitter_url' in patch ? { twitterUrl: stringifyNullable(patch.twitter_url) } : {}),
      ...('stage' in patch ? { stage: stringifyNullable(patch.stage) } : {}),
      ...('estimated_value' in patch ? { dealValue: typeof patch.estimated_value === 'number' ? patch.estimated_value : null } : {}),
    } : prev)
  }

  function applyExistingRecord(record: ExistingRecord) {
    setExisting(record)
    setName(record.name || name)
    setDomain(record.domain ?? (record.type === 'opportunity' ? '' : domain))
    setDescription(record.description ?? description)
    setCompanyName(record.company ?? (record.type === 'opportunity' ? '' : companyName))
    setJobTitle(record.jobTitle ?? jobTitle)
    setEmail(record.email ?? email)
    setPhone(record.phone ?? phone)
    setLocation(record.location ?? location)
    setDealValueInput(record.dealValue ? String(record.dealValue) : '')
    setAngellistUrl(record.angellistUrl ?? '')
    setFacebookUrl(record.facebookUrl ?? '')
    setInstagramUrl(record.instagramUrl ?? '')
    setLinkedinUrl(record.linkedinUrl ?? context.linkedinUrl ?? '')
    setTwitterUrl(record.twitterUrl ?? '')
  }

  async function findCompany(): Promise<ExistingRecord | null> {
    const domainCandidates = [
      context.domain,
      context.source === 'linkedin' ? null : domain,
      context.source === 'linkedin' ? null : context.hostname,
      context.source === 'linkedin' ? null : context.hostname.replace(/^www\./, ''),
    ]
      .filter(Boolean)
      .map(value => String(value).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''))
    const uniqueDomains = [...new Set(domainCandidates)]

    if (context.domain) {
      const { data } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .eq('user_id', user.id)
        .or(uniqueDomains.flatMap(value => [`domain.eq.${value}`, `website_url.ilike.%${value}%`]).join(','))
        .limit(1)
        .maybeSingle()
      if (data) {
        return companyRecordFromData(data)
      }

      const { data: fuzzy } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .eq('user_id', user.id)
        .ilike('domain', `%${context.domain.replace(/^www\./, '')}%`)
        .limit(1)
        .maybeSingle()
      if (fuzzy) {
        return companyRecordFromData(fuzzy)
      }
    }

    if (entityType === 'company' && context.linkedinUrl) {
      const linkedinVariants = [
        context.linkedinUrl,
        `${context.linkedinUrl}/`,
        context.linkedinUrl.replace('https://www.linkedin.com/company/', ''),
        context.linkedinSlug,
      ].filter(Boolean)
      const { data } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .eq('user_id', user.id)
        .or(linkedinVariants.map(value => `linkedin_url.ilike.%${value}%`).join(','))
        .limit(1)
        .maybeSingle()
      if (data) {
        return companyRecordFromData(data)
      }

      if (context.linkedinSlug) {
        const slugDomain = `${context.linkedinSlug.toLowerCase()}.com`
        const { data: slugDomainMatch } = await supabase
          .from('companies')
          .select(COMPANY_SELECT)
          .eq('user_id', user.id)
          .or(`domain.eq.${slugDomain},website_url.ilike.%${slugDomain}%`)
          .limit(1)
          .maybeSingle()
        if (slugDomainMatch) return companyRecordFromData(slugDomainMatch)
      }
    }

    const nameCandidate = context.suggestedName.trim()
    const derivedName = context.domain ? context.domain.split('.')[0] : ''
    const names = [...new Set([nameCandidate, context.companyName, derivedName].filter((value): value is string => !!value))]
    for (const candidate of names) {
      const { data } = await supabase
        .from('companies')
        .select(COMPANY_SELECT)
        .eq('user_id', user.id)
        .ilike('name', candidate)
        .limit(1)
        .maybeSingle()
      if (data) {
        return companyRecordFromData(data)
      }
    }

    if (context.domain && entityType === 'company') {
      const promoted = await promoteLegacyCompanyFromDomain(context.domain)
      if (promoted) return promoted
    }

    return null
  }

  async function promoteLegacyCompanyFromDomain(rawDomain: string): Promise<ExistingRecord | null> {
    const cleanDomain = rawDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
    if (!cleanDomain || cleanDomain.includes('linkedin.com')) return null

    const { data: legacyPeople } = await supabase
      .from('outreach_logs')
      .select('id, name, email, company, company_id, company_domain, website')
      .eq('user_id', user.id)
      .or(`email.ilike.%@${cleanDomain},company_domain.ilike.%${cleanDomain}%,website.ilike.%${cleanDomain}%`)
      .limit(25)

    if (!legacyPeople || legacyPeople.length === 0) return null

    const legacyName = legacyPeople
      .map((person: any) => cleanCompanyLabel(person.company))
      .find(Boolean)
    const companyName = legacyName || cleanCompanyLabel(context.companyName) || cleanCompanyLabel(context.suggestedName) || titleCaseDomain(cleanDomain)

    const payload = {
      user_id: user.id,
      name: companyName,
      domain: cleanDomain,
      website_url: `https://${cleanDomain}`,
      logo_url: firstWorkingLogo([...(context.logoCandidates ?? []), context.faviconUrl], brokenLogoUrls),
      description: description.trim() || context.description || null,
      source: 'legacy_domain',
      account_stage: 'captured',
    }

    const { data, error } = await supabase
      .from('companies')
      .insert(payload)
      .select(COMPANY_SELECT)
      .single()

    if (error || !data) return null

    await supabase
      .from('outreach_logs')
      .update({ company_id: data.id, company: data.name, company_domain: cleanDomain })
      .eq('user_id', user.id)
      .or(`email.ilike.%@${cleanDomain},company_domain.ilike.%${cleanDomain}%,website.ilike.%${cleanDomain}%`)

    return companyRecordFromData(data)
  }

  async function findCompanyOption(): Promise<CompanyOption | null> {
    const byDomain = await findCompany()
    if (byDomain) return { id: byDomain.id, name: byDomain.name, domain: byDomain.domain ?? null, logo_url: byDomain.logoUrl ?? null }
    if (!context.companyName) return null
    const { data } = await supabase
      .from('companies')
      .select('id, name, domain, logo_url')
      .eq('user_id', user.id)
      .ilike('name', context.companyName)
      .limit(1)
      .maybeSingle()
    return data ? { id: data.id, name: data.name, domain: data.domain, logo_url: data.logo_url } : null
  }

  async function findCompanyById(companyId?: string | null): Promise<CompanyOption | null> {
    if (!companyId) return null
    const { data } = await supabase
      .from('companies')
      .select('id, name, domain, logo_url')
      .eq('user_id', user.id)
      .eq('id', companyId)
      .maybeSingle()
    return data ? { id: data.id, name: data.name, domain: data.domain, logo_url: data.logo_url } : null
  }

  async function findPerson(): Promise<ExistingRecord | null> {
    if (!context.linkedinUrl) return null
    const normalized = context.linkedinUrl.replace(/\/$/, '')
    const { data } = await supabase
      .from('outreach_logs')
      .select(PERSON_SELECT)
      .eq('user_id', user.id)
      .in('linkedin_url', [normalized, `${normalized}/`])
      .maybeSingle()
    return data
      ? personRecordFromData(data)
      : null
  }

  async function findOpportunity(): Promise<ExistingRecord | null> {
    const { data } = await supabase
      .from('opportunities')
      .select('id, title, stage, estimated_value, owner_contact_id, company_id, company:companies(name)')
      .eq('user_id', user.id)
      .ilike('title', name.trim())
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const companyRecord = data.company as { name?: string | null } | { name?: string | null }[] | null
    const company = Array.isArray(companyRecord) ? companyRecord[0]?.name : companyRecord?.name
    return { id: data.id, type: 'opportunity', name: data.title, stage: data.stage, dealValue: data.estimated_value, ownerId: data.owner_contact_id, companyId: data.company_id, company }
  }

  async function ensureCompany(): Promise<CompanyOption | null> {
    if (matchedCompany) return matchedCompany
    const candidateName = companyName.trim() || domain.trim() || context.companyName || context.domain
    if (!candidateName) return null

    const existingCompany = await findCompanyOption()
    if (existingCompany) {
      setMatchedCompany(existingCompany)
      return existingCompany
    }

    const { data } = await supabase
      .from('companies')
      .insert({
        user_id: user.id,
        name: candidateName,
        domain: domain.trim() || null,
        source: 'extension_capture',
        account_stage: 'captured',
        logo_url: firstWorkingLogo([...(context.logoCandidates ?? []), context.faviconUrl], brokenLogoUrls),
      })
      .select('id, name, domain, logo_url')
      .single()

    if (!data) return null
    const company = { id: data.id, name: data.name, domain: data.domain, logo_url: data.logo_url }
    setMatchedCompany(company)
    return company
  }

  async function saveRecord(typeOverride?: CaptureEntityType) {
    const effectiveType = typeOverride ?? entityType
    if (saving) return
    if (!name.trim()) return
    setSaving(true)
    setStatusText(null)
    try {
      let record: ExistingRecord

      if (effectiveType === 'company') {
        const payload = {
          name: name.trim(),
          domain: domain.trim() || null,
          description: description.trim() || null,
          primary_location: location.trim() || null,
          website_url: context.domain ? `https://${context.domain}` : null,
          linkedin_url: context.linkedinUrl,
          logo_url: context.faviconUrl,
          source: 'extension_capture',
          account_stage: 'captured',
        }
        const query = existing
          ? supabase.from('companies').update(payload).eq('id', existing.id).eq('user_id', user.id).select(COMPANY_SELECT).single()
          : supabase.from('companies').insert({ ...payload, user_id: user.id }).select(COMPANY_SELECT).single()
        const { data, error } = await query
        if (error || !data) throw error
        record = companyRecordFromData({ ...data, logo_url: data.logo_url ?? context.faviconUrl })
      } else if (effectiveType === 'person') {
        const company = await ensureCompany()
        const payload = {
          name: name.trim(),
          status: 'PROSPECT',
          contact_type: 'networking',
          category: 'peer',
          linkedin_url: context.linkedinUrl,
          profile_photo_url: context.profilePhotoUrl ?? existing?.profilePhotoUrl ?? null,
          job_title: jobTitle.trim() || null,
          company: company?.name ?? (companyName.trim() || null),
          company_id: company?.id ?? null,
          personal_context: description.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          location: location.trim() || null,
          log_date: new Date().toISOString().slice(0, 10),
          health_score: 1,
          links: [{ url: context.url, label: 'Captured source', type: 'capture', created_at: new Date().toISOString() }],
        }
        const query = existing
          ? supabase.from('outreach_logs').update(payload).eq('id', existing.id).eq('user_id', user.id).select(PERSON_SELECT).single()
          : supabase.from('outreach_logs').insert({ ...payload, user_id: user.id }).select(PERSON_SELECT).single()
        const { data, error } = await query
        if (error || !data) throw error
        record = personRecordFromData(data)
      } else {
        const company = await ensureCompany()
        const payload = {
          title: name.trim(),
          type: 'job',
          stage: 'exploring',
          company_id: company?.id ?? null,
          notes: description.trim() || context.url,
        }
        const query = existing
          ? supabase.from('opportunities').update(payload).eq('id', existing.id).eq('user_id', user.id).select('id, title, stage').single()
          : supabase.from('opportunities').insert({ ...payload, user_id: user.id }).select('id, title, stage').single()
        const { data, error } = await query
        if (error || !data) throw error
        record = { id: data.id, type: 'opportunity', name: data.title, stage: data.stage, company: company?.name ?? null }
      }

      setExisting(record)
      const savedSnapshot = await saveSnapshot(record)
      setSnapshot(savedSnapshot)
      await loadRelated(record)
      setStatusText(savedSnapshot?.localWriteConfirmed ? 'Saved to Rethink, Supabase and local downloads.' : 'Saved to Rethink and Supabase. Open the desktop app to write the local MD.')
      onRefresh()
    } catch (error: any) {
      setStatusText(error?.message ?? 'Could not save record.')
    } finally {
      setSaving(false)
    }
  }

  function createRecordAs(type: CaptureEntityType) {
    setShowAddMenu(false)
    setEntityType(type)
    void saveRecord(type)
  }

  async function addToList(list: ListOption) {
    if (!existing) return
    const firstStage = list.stages?.[0]?.key ?? 'active'
    const recordColumn = existing.type === 'person'
      ? { contact_id: existing.id }
      : existing.type === 'company'
        ? { company_id: existing.id }
        : { opportunity_id: existing.id }
    const { data, error } = await supabase
      .from('list_memberships')
      .insert({
        user_id: user.id,
        ...recordColumn,
        list_id: list.id,
        current_stage: firstStage,
        attributes: {},
      })
      .select('id')
      .single()
    if (error || !data) {
      setStatusText(error?.message ?? 'Could not add to list.')
      return
    }
    setShowListPicker(false)
    await loadRelated(existing)
  }

  async function createListAndAdd() {
    if (!newListName.trim() || !existing) return
    const { data, error } = await supabase
      .from('lists')
      .insert({
        user_id: user.id,
        name: newListName.trim(),
        icon: 'list',
        color: '#3E7A4E',
        stages: [{ key: 'active', label: 'Active' }],
      })
      .select('id, name, icon, color, stages')
      .single()
    if (error || !data) {
      setStatusText(error?.message ?? 'Could not create list.')
      return
    }
    setNewListName('')
    await loadLists()
    await addToList(data as ListOption)
  }

  async function createDeal(draft?: DealDraft) {
    const dealTitle = draft?.title ?? newDealTitle
    if (!existing || !dealTitle.trim()) return
    const company = entityType === 'company'
      ? { id: existing.id, name: existing.name, domain: existing.domain ?? null, logo_url: existing.logoUrl ?? null }
      : draft?.companyId
        ? companyOptions.find(option => option.id === draft.companyId) ?? matchedCompany ?? await ensureCompany()
        : await ensureCompany()
    const amount = draft?.value ? Number(draft.value.replace(/[^0-9.]/g, '')) : null
    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        user_id: user.id,
        title: dealTitle.trim(),
        type: draft?.type.trim() || 'job',
        stage: draft?.stage || 'Lead',
        estimated_value: Number.isFinite(amount) ? amount : null,
        company_id: company?.id ?? null,
        notes: draft?.jobDesc.trim() || null,
      })
      .select('id, title, stage, type, estimated_value, company:companies(name, logo_url, domain)')
      .single()
    if (error || !data) {
      setStatusText(error?.message ?? 'Could not create deal.')
      return
    }
    const linkedPeople = new Set(draft?.peopleIds ?? [])
    if (existing.type === 'person') linkedPeople.add(existing.id)
    if (linkedPeople.size > 0) {
      const rows = [...linkedPeople].map(personId => ({
        opportunity_id: data.id,
        outreach_log_id: personId,
        role: 'associated',
      }))
      const link = await supabase.from('opportunity_contacts').upsert(rows, { onConflict: 'opportunity_id,outreach_log_id' })
      if (link.error && link.error.code !== '42P01') setStatusText(link.error.message)
    }
    setNewDealTitle('')
    setShowDealCreator(false)
    await loadRelated(existing)
  }

  async function saveSnapshot(record: ExistingRecord): Promise<(CaptureSnapshotRecord & { localWriteConfirmed?: boolean }) | null> {
    const markdown = context.markdown
    const filename = record.type === 'person' && matchedCompany?.domain
      ? `${matchedCompany.domain}/People/${name.replace(/[^a-z0-9._ -]+/gi, '').replace(/\s+/g, '-')}.md`
      : localMarkdownPath({ ...context, domain: domain || context.domain }, record.type)
    const path = `${user.id}/${filename}`

    const { data: signal, error: signalError } = await supabase.from('app_signals').insert({
      user_id: user.id,
      action: 'write_capture_file',
      payload: { relative_path: filename, markdown },
    }).select('id').single()
    if (signalError) throw signalError

    chrome.runtime.sendMessage({ type: 'OPEN_RETHINK_APP' }).catch(() => {})

    let uploadedPath: string | null = null
    const upload = await supabase.storage
      .from('capture-snapshots')
      .upload(path, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), {
        contentType: 'text/markdown;charset=utf-8',
        upsert: true,
      })
    if (!upload.error) uploadedPath = path
    const localWriteConfirmed = signal?.id ? await waitForSignalDeletion(signal.id) : false
    setLocalSaved(Boolean(uploadedPath && localWriteConfirmed))

    const { data, error } = await supabase
      .from('capture_snapshots')
      .insert({
        user_id: user.id,
        entity_type: record.type,
        entity_id: record.id,
        title: record.name,
        source_url: context.url,
        canonical_url: context.canonicalUrl,
        domain: context.domain,
        storage_path: uploadedPath,
        local_path: filename,
        markdown,
        raw_text: context.text,
        metadata: {
          source: context.source,
          suggested_name: context.suggestedName,
          company_name: context.companyName,
          job_title: context.jobTitle,
          captured_at: context.capturedAt,
          local_write_confirmed: localWriteConfirmed,
        },
      })
      .select('id, entity_type, entity_id, title, source_url, domain, storage_path, local_path, created_at')
      .single()
    if (error) throw error
    if (!data) throw new Error('Snapshot was not saved to Supabase.')

    return data ? { ...(data as CaptureSnapshotRecord), localWriteConfirmed } : null
  }

  async function waitForSignalDeletion(signalId: string) {
    for (let index = 0; index < 60; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const { data, error } = await supabase
        .from('app_signals')
        .select('id')
        .eq('id', signalId)
        .maybeSingle()
      if (!error && !data) return true
    }
    return false
  }

  async function ensureSnapshotForAi(record: ExistingRecord) {
    if (localSaved && snapshot) return snapshot
    setStatusText('Saving markdown before AI analysis...')
    const savedSnapshot = await saveSnapshot(record)
    setSnapshot(savedSnapshot)
    return savedSnapshot
  }

  async function analyzeWithAi() {
    if (!existing) return
    setAnalyzing(true)
    setStatusText(null)
    try {
      const savedSnapshot = await ensureSnapshotForAi(existing)
      // The local .md write (handled by the desktop app) is a nice-to-have sync
      // and not required for enrichment — capture-enrich receives the markdown
      // directly below. Don't block AI when the desktop write isn't confirmed.
      const localPending = savedSnapshot != null && !(savedSnapshot as { localWriteConfirmed?: boolean }).localWriteConfirmed
      const { data: { session } } = await supabase.auth.getSession()
      const result = await supabase.functions.invoke('capture-enrich', {
        body: {
          entity_type: existing.type,
          entity_id: existing.id,
          snapshot_id: savedSnapshot?.id ?? null,
          markdown: context.markdown,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      if (result.error) {
        throw new Error(await functionErrorMessage(result.error))
      }
      if (selectedRoute) await loadRecordByRoute(selectedRoute)
      else await loadMatches()
      setStatusText(localPending
        ? 'AI fields saved. Local markdown copy is pending (open the reThink desktop app to sync it).'
        : 'AI fields saved to Rethink.')
      setAiDone(true)
    } catch (error: any) {
      setStatusText(error?.message ?? 'AI analysis is not configured yet.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function functionErrorMessage(error: any) {
    const contextResponse = error?.context as Response | undefined
    if (contextResponse?.text) {
      try {
        const text = await contextResponse.text()
        const payload = JSON.parse(text)
        return payload?.error || payload?.message || text || error.message || 'AI analysis failed.'
      } catch {
        return error.message || 'AI analysis failed.'
      }
    }
    return error?.message || 'AI analysis failed.'
  }

  return (
    <div className="rt-panel">
      <main className="rt-body">
        {!showAllValues && (selectedRoute || routeStack.length > 0) && (
          <button className="rt-back-link" type="button" onClick={goBack} title="Back">
            <RtIcon name="chevron-left" size={14} />
          </button>
        )}

        {loading ? (
          <div className="rt-empty">Reading this page...</div>
        ) : showAllValues && existing ? (
          <AllAttributesView
            entityType={entityType}
            name={name}
            domain={domain}
            description={description}
            company={matchedCompany}
            companyName={companyName}
            jobTitle={jobTitle}
            email={email}
            phone={phone}
            location={location}
            deals={deals}
            teamMembers={teamMembers}
            companyOptions={companyOptions}
            showCompanyPicker={showCompanyPicker}
            onBack={() => setShowAllValues(false)}
            onOpenCompany={(company) => openRoute({ id: company.id, type: 'company' })}
            onOpenPerson={(person) => openRoute({ id: person.id, type: 'person' })}
            onEditCompany={() => {
              setShowCompanyPicker(true)
              void loadCompanyOptions(companyName)
            }}
            onSearchCompany={(value) => {
              setCompanyName(value)
              void loadCompanyOptions(value)
            }}
            onSelectCompany={(company) => {
              void persistCompanyRelation(company)
            }}
            onClearCompany={() => {
              void persistCompanyRelation(null)
            }}
            onCloseCompanyPicker={() => setShowCompanyPicker(false)}
            onPersistField={persistRecordPatch}
            setName={setName}
            setDomain={setDomain}
            setDescription={setDescription}
            setJobTitle={setJobTitle}
            setEmail={setEmail}
            setPhone={setPhone}
            setLocation={setLocation}
            angellistUrl={angellistUrl}
            facebookUrl={facebookUrl}
            instagramUrl={instagramUrl}
            linkedinUrl={linkedinUrl}
            twitterUrl={twitterUrl}
            setAngellistUrl={setAngellistUrl}
            setFacebookUrl={setFacebookUrl}
            setInstagramUrl={setInstagramUrl}
            setLinkedinUrl={setLinkedinUrl}
            setTwitterUrl={setTwitterUrl}
            onEditTeam={() => {
              setShowTeamPicker(true)
              void loadPeopleOptions('')
            }}
          />
        ) : (
          <>
            <section className="rt-card rt-record-card">
              <div className="rt-workspace-pill">MI</div>
              <div className="rt-title-row">
                {logoUrl ? (
                  <img
                    className={`rt-logo ${isPersonLogo ? 'person' : ''}`}
                    src={logoUrl}
                    alt=""
                    onError={() => handleLogoError(logoUrl)}
                  />
                ) : (
                  <div className={`rt-avatar ${isPersonLogo ? 'person' : ''}`}>{recordLabel.slice(0, 1)}</div>
                )}
                <div className="rt-title-stack">
                  <input
                    className="rt-title-input"
                    value={existing ? name : suggestionName}
                    onChange={event => setName(event.target.value)}
                  />
                  <div className="rt-subtitle">{recordSubtitle}</div>
                </div>
                <a className="rt-open" href={context.url} target="_blank" rel="noreferrer"><RtIcon name="external" size={13} /></a>
                <div className="rt-title-actions">
                  <button className={`rt-state-icon ${localSaved ? 'ok' : ''}`} onClick={() => saveRecord()} title="Save Markdown locally"><RtIcon name="download" size={12} /></button>
                  <button className={`rt-state-icon ${aiDone ? 'ok' : ''}`} onClick={analyzeWithAi} disabled={analyzing} title="Analyze with AI"><RtIcon name="sparkles" size={12} /></button>
                </div>
              </div>

              {existing ? (
                <div className="rt-chip-row">
                  {entityType === 'opportunity' ? (
                    <>
                      <span className="rt-chip"><span className="rt-stage-dot" />{existing.stage || 'Lead'}</span>
                      <span className="rt-chip">{formatCurrency(existing.dealValue)}</span>
                      <span className="rt-chip">{ownerPerson?.name || 'Set owner...'}</span>
                      <span className="rt-chip">+3</span>
                    </>
                  ) : (
                    <>
                      <span className="rt-chip muted">No Connection</span>
                      <span className="rt-chip blue">Pro</span>
                      {entityType === 'company' ? <span className="rt-chip">Next calendar inte...</span> : <span className="rt-chip">Captured</span>}
                      <span className="rt-chip">+4</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="rt-suggestion-fields">
                  <Field
                    label={entityType === 'company' ? (context.source === 'linkedin' ? 'LinkedIn' : 'Domain') : 'Source'}
                    value={entityType === 'company' && context.source === 'linkedin' ? (context.linkedinSlug || context.linkedinUrl) : (domain || context.hostname)}
                  />
                </div>
              )}

              {!existing && (
                <div className="rt-create-action">
                  <button className="rt-primary" onClick={() => saveRecord()} disabled={saving}>
                    {saving ? 'Saving...' : `Add ${recordLabel} to reThink`}
                  </button>
                  <button className="rt-primary rt-primary-caret" onClick={() => setShowAddMenu(value => !value)} disabled={saving}><RtIcon name="chevron-down" size={14} /></button>
                  {showAddMenu && (
                    <div className="rt-add-menu">
                      <button onClick={() => createRecordAs('company')}><ObjectGlyph type="company" /> Add Company</button>
                      <button onClick={() => createRecordAs('person')}><ObjectGlyph type="person" /> Add Person</button>
                      <button onClick={() => createRecordAs('opportunity')}><ObjectGlyph type="opportunity" /> Add Opportunity</button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {!existing ? (
              <button className="rt-manual">Create record manually</button>
            ) : (
              <>
                <section className="rt-card">
                  <div className="rt-section-title"><ObjectGlyph icon="list" /> Record details</div>
                  {entityType === 'company' && (
                    <DetailField icon={<RtIcon name="globe" />} label="Domains">
                      <input value={domain} onChange={event => setDomain(event.target.value)} onBlur={() => persistRecordPatch({ domain: domain.trim() || null })} placeholder="Set Domains..." />
                    </DetailField>
                  )}
                  <DetailField icon={<RtIcon name="text" />} label={entityType === 'opportunity' ? 'Deal name' : 'Name'}>
                    <input
                      value={name}
                      onChange={event => setName(event.target.value)}
                      onBlur={() => persistRecordPatch(entityType === 'opportunity' ? { title: name.trim() } : { name: name.trim() })}
                    />
                  </DetailField>
                  {entityType === 'opportunity' && (
                    <>
                      <DetailField icon={<RtIcon name="money" />} label="Deal stage">
                        <div className="rt-inline-picker-wrap">
                          <button type="button" className="rt-deal-field-chip" onClick={() => setShowStagePicker(value => !value)}>
                            <span className="rt-stage-dot" />{existing.stage || 'Lead'}
                          </button>
                          {showStagePicker && (
                            <div className="rt-picker-menu rt-stage-menu">
                              <div className="rt-picker-search"><RtIcon name="search" size={12} /> Search or create stage...</div>
                              {['Lead', 'Qualified', 'Proposal', 'Won 🎉', 'Lost'].map((stage, index) => (
                                <button type="button" key={stage} onClick={() => { void persistRecordPatch({ stage }); setShowStagePicker(false) }}>
                                  <span className={`rt-stage-dot stage-${index}`} />{stage}
                                  {stage === (existing.stage || 'Lead') && <span className="rt-check checked"><RtIcon name="check" size={9} /></span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </DetailField>
                      <DetailField icon={<RtIcon name="user" />} label="Deal owner">
                        <div className="rt-inline-picker-wrap">
                          {existing.ownerId ? (
                            <button
                              type="button"
                              className="rt-inline-relation"
                              onClick={() => setShowOwnerPicker(value => !value)}
                            >
                              {ownerPerson?.profile_photo_url ? <img src={ownerPerson.profile_photo_url} alt="" /> : <ObjectGlyph type="person" />}
                              <span>{ownerPerson?.name || 'Set Deal owner...'}</span>
                            </button>
                          ) : (
                            <button type="button" className="rt-inline-relation muted" onClick={() => setShowOwnerPicker(value => !value)}>
                              <ObjectGlyph type="person" />
                              <span>Set Deal owner...</span>
                            </button>
                          )}
                          {showOwnerPicker && (
                            <PersonPicker
                              people={peopleOptions}
                              selectedIds={existing.ownerId ? [existing.ownerId] : []}
                              onSelect={(person) => void persistDealOwner(person)}
                            />
                          )}
                        </div>
                      </DetailField>
                      <DetailField icon={<RtIcon name="money" />} label="Deal value">
                        <input
                          value={dealValueInput}
                          onChange={event => setDealValueInput(event.target.value)}
                          onBlur={() => persistRecordPatch({ estimated_value: parseCurrency(dealValueInput) })}
                          placeholder="Set Deal value..."
                        />
                      </DetailField>
                    </>
                  )}
                  {entityType === 'person' && (
                    <DetailField icon={<RtIcon name="mail" />} label="Email addresses">
                      <input value={email} onChange={event => setEmail(event.target.value)} onBlur={() => persistRecordPatch({ email: email.trim() || null })} placeholder="Set Email addresses..." />
                    </DetailField>
                  )}
                  {entityType !== 'opportunity' && (
                    <DetailField icon={<RtIcon name="text" />} label="Description">
                      <textarea
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        onBlur={() => persistRecordPatch(entityType === 'person' ? { personal_context: description.trim() || null } : { description: description.trim() || null })}
                        placeholder="Set Description..."
                        rows={1}
                      />
                    </DetailField>
                  )}
                  {entityType === 'company' && (
                    <>
                      <DetailField icon={<RtIcon name="users" />} label="Team">
                        <EditableTeamValue
                          members={teamMembers}
                          onOpenPerson={(person) => openRoute({ id: person.id, type: 'person' })}
                          onEdit={() => {
                            setShowTeamPicker(true)
                            void loadPeopleOptions('')
                          }}
                        />
                      </DetailField>
                      <DetailField icon={<RtIcon name="tag" />} label="Categories">
                        <span className="rt-color-chip green">Marketplace</span><span className="rt-color-chip amber">B2B</span>
                      </DetailField>
                    </>
                  )}
                  {(entityType === 'person' || entityType === 'opportunity') && (
                    <RelationField
                      label={entityType === 'opportunity' ? 'Associated company' : 'Company'}
                      value={matchedCompany?.name ?? companyName}
                      onChange={(value) => {
                        if (!value) {
                          void persistCompanyRelation(null)
                          return
                        }
                        setCompanyName(value)
                        loadCompanyOptions(value)
                      }}
                      onFocus={() => {
                        setShowCompanyPicker(true)
                        loadCompanyOptions(companyName)
                      }}
                      options={companyOptions}
                      selectedOption={matchedCompany}
                      open={showCompanyPicker}
                      onSelect={(company) => {
                        void persistCompanyRelation(company)
                      }}
                      onOpenSelected={(company) => openRoute({ id: company.id, type: 'company' })}
                      onClose={() => setShowCompanyPicker(false)}
                    />
                  )}
                  {entityType === 'person' && (
                    <>
                      <DetailField icon={<RtIcon name="briefcase" />} label="Job title">
                        <input value={jobTitle} onChange={event => setJobTitle(event.target.value)} onBlur={() => persistRecordPatch({ job_title: jobTitle.trim() || null })} placeholder="Set Job title..." />
                      </DetailField>
                      <DetailField icon={<RtIcon name="phone" />} label="Phone numbers">
                        <input value={phone} onChange={event => setPhone(event.target.value)} onBlur={() => persistRecordPatch({ phone: phone.trim() || null })} placeholder="Set Phone numbers..." />
                      </DetailField>
                      <DetailField icon={<RtIcon name="location" />} label="Primary location">
                        <input value={location} onChange={event => setLocation(event.target.value)} onBlur={() => persistRecordPatch({ location: location.trim() || null })} placeholder="Set Primary location..." />
                      </DetailField>
                    </>
                  )}
                  {entityType === 'opportunity' && (
                    <DetailField icon={<RtIcon name="users" />} label="Associated people">
                      <div className="rt-inline-picker-wrap">
                        <div className="rt-relation-rows">
                          {associatedPeople.length > 0 ? associatedPeople.slice(0, 2).map(person => (
                            <button type="button" className="rt-inline-relation" key={person.id} onClick={() => openRoute({ id: person.id, type: 'person' })}>
                              {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" /> : <span className="rt-person-fallback">{person.name.slice(0, 1)}</span>}
                              <span>{person.name}</span>
                            </button>
                          )) : <button type="button" className="rt-inline-relation muted" onClick={() => setShowDealPeoplePicker(value => !value)}><ObjectGlyph type="person" /><span>Set a value...</span></button>}
                          {associatedPeople.length > 2 && <span className="rt-more-chip">+{associatedPeople.length - 2}</span>}
                          <button type="button" className="rt-edit-pencil always" onClick={() => setShowDealPeoplePicker(value => !value)} title="Edit Associated people"><RtIcon name="edit" size={12} /></button>
                        </div>
                        {showDealPeoplePicker && (
                          <PersonPicker
                            people={peopleOptions}
                            selectedIds={associatedPeople.map(person => person.id)}
                            multi
                            onSelect={(person) => void toggleOpportunityPerson(person)}
                          />
                        )}
                      </div>
                    </DetailField>
                  )}
                  <button className="rt-show-values" onClick={() => setShowAllValues(true)}>
                    Show all values <RtIcon name="chevron-right" size={12} />
                  </button>
                </section>

                <ListsSection
                  memberships={memberships}
                  lists={lists}
                  showPicker={showListPicker}
                  newListName={newListName}
                  onTogglePicker={() => setShowListPicker(value => !value)}
                  onAdd={addToList}
                  onNewListName={setNewListName}
                  onCreateList={createListAndAdd}
                />
                <DealsSection
                  deals={deals}
                  showCreator={showDealCreator}
                  newDealTitle={newDealTitle}
                  companyOptions={companyOptions}
                  peopleOptions={dedupePeople([...teamMembers, ...associatedPeople, ...(entityType === 'person' && existing ? [{
                    id: existing.id,
                    name: existing.name,
                    company_id: existing.companyId ?? null,
                    job_title: existing.jobTitle ?? null,
                    company: existing.company ?? null,
                    profile_photo_url: existing.profilePhotoUrl ?? null,
                    email: existing.email ?? null,
                  }] : [])])}
                  matchedCompany={matchedCompany}
                  currentEntity={existing}
                  onToggleCreator={() => setShowDealCreator(value => !value)}
                  onTitleChange={setNewDealTitle}
                  onCreateDeal={createDeal}
                  onOpenDeal={(deal) => openRoute({ id: deal.id, type: 'opportunity' })}
                />
                <MiniSection title="Emails" empty="There is no email history yet" count="0" icon="mail" />
                {entityType === 'company' ? (
                  <TeamSection
                    members={teamMembers}
                    onOpenPerson={(person) => openRoute({ id: person.id, type: 'person' })}
                    onEdit={() => {
                      setShowTeamPicker(true)
                      void loadPeopleOptions('')
                    }}
                  />
                ) : entityType === 'opportunity' ? (
                  <PeopleSection members={associatedPeople} onOpenPerson={(person) => openRoute({ id: person.id, type: 'person' })} />
                ) : (
                  <CompanySection company={matchedCompany} onOpenCompany={(company) => openRoute({ id: company.id, type: 'company' })} />
                )}
              </>
            )}

            {statusText && <div className="rt-status">{statusText}</div>}
            {showTeamPicker && existing?.type === 'company' && (
              <TeamPickerModal
                company={existing}
                members={teamMembers}
                people={peopleOptions}
                search={peopleSearch}
                onSearch={(value) => {
                  setPeopleSearch(value)
                  void loadPeopleOptions(value)
                }}
                onToggle={toggleTeamMember}
                onClose={() => setShowTeamPicker(false)}
              />
            )}
          </>
        )}
      </main>

      <footer className="rt-toolbar">
        <button title="Search"><RtIcon name="search" size={14} /></button>
        <button title="Capture" onClick={() => saveRecord()} disabled={saving}><ObjectGlyph icon="list" /></button>
        <button title="Refresh" onClick={refreshActiveRecord}><RtIcon name="refresh" size={14} /></button>
        <button title="AI" onClick={analyzeWithAi} disabled={!existing || analyzing}><RtIcon name="sparkles" size={14} /></button>
      </footer>
    </div>
  )
}

function AllAttributesView({
  entityType,
  name,
  domain,
  description,
  company,
  companyName,
  jobTitle,
  email,
  phone,
  location,
  angellistUrl,
  facebookUrl,
  instagramUrl,
  linkedinUrl,
  twitterUrl,
  deals,
  teamMembers,
  companyOptions,
  showCompanyPicker,
  onBack,
  onOpenCompany,
  onOpenPerson,
  onEditCompany,
  onSearchCompany,
  onSelectCompany,
  onClearCompany,
  onCloseCompanyPicker,
  onPersistField,
  setName,
  setDomain,
  setDescription,
  setJobTitle,
  setEmail,
  setPhone,
  setLocation,
  setAngellistUrl,
  setFacebookUrl,
  setInstagramUrl,
  setLinkedinUrl,
  setTwitterUrl,
  onEditTeam,
}: {
  entityType: CaptureEntityType
  name: string
  domain: string
  description: string
  company: CompanyOption | null
  companyName: string
  jobTitle: string
  email: string
  phone: string
  location: string
  angellistUrl: string
  facebookUrl: string
  instagramUrl: string
  linkedinUrl: string
  twitterUrl: string
  deals: DealRecord[]
  teamMembers: PersonRelationRecord[]
  companyOptions: CompanyOption[]
  showCompanyPicker: boolean
  onBack: () => void
  onOpenCompany: (company: CompanyOption) => void
  onOpenPerson: (person: PersonRelationRecord) => void
  onEditCompany: () => void
  onSearchCompany: (value: string) => void
  onSelectCompany: (company: CompanyOption) => void
  onClearCompany: () => void
  onCloseCompanyPicker: () => void
  onPersistField: (patch: Record<string, unknown>) => Promise<void>
  setName: (value: string) => void
  setDomain: (value: string) => void
  setDescription: (value: string) => void
  setJobTitle: (value: string) => void
  setEmail: (value: string) => void
  setPhone: (value: string) => void
  setLocation: (value: string) => void
  setAngellistUrl: (value: string) => void
  setFacebookUrl: (value: string) => void
  setInstagramUrl: (value: string) => void
  setLinkedinUrl: (value: string) => void
  setTwitterUrl: (value: string) => void
  onEditTeam: () => void
}) {
  return (
    <section className="rt-all-values">
      <div className="rt-all-head">
        <button type="button" onClick={onBack}><RtIcon name="chevron-left" size={14} /></button>
        <ObjectGlyph icon="list" />
        <strong>All attributes</strong>
        <button type="button" className="rt-all-open"><RtIcon name="external" size={13} /></button>
      </div>
      <div className="rt-all-list">
        {entityType === 'company' && (
          <>
            <EditableAttributeRow icon={<RtIcon name="globe" />} label="Domains" value={domain} link onChange={setDomain} onBlur={() => onPersistField({ domain: domain.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="text" />} label="Name" value={name} onChange={setName} onBlur={() => onPersistField({ name: name.trim() })} />
            <EditableAttributeRow icon={<RtIcon name="text" />} label="Description" value={description} truncate onChange={setDescription} onBlur={() => onPersistField({ description: description.trim() || null })} />
            <AttributeRow icon={<RtIcon name="users" />} label="Team">
              <EditableTeamValue members={teamMembers} onOpenPerson={onOpenPerson} onEdit={onEditTeam} compact />
            </AttributeRow>
            <AttributeRow icon={<RtIcon name="tag" />} label="Categories">
              <span className="rt-color-chip green">Marketplace</span><span className="rt-color-chip amber">B2B</span>
            </AttributeRow>
            <EditableAttributeRow icon={<RtIcon name="location" />} label="Primary location" value={location} placeholder="Set Primary location..." onChange={setLocation} onBlur={() => onPersistField({ primary_location: location.trim() || null })} />
          </>
        )}
        {entityType === 'person' && (
          <>
            <EditableAttributeRow icon={<RtIcon name="text" />} label="Name" value={name} onChange={setName} onBlur={() => onPersistField({ name: name.trim() })} />
            <EditableAttributeRow icon={<RtIcon name="mail" />} label="Email addresses" value={email} placeholder="Set Email addresses..." link={Boolean(email)} onChange={setEmail} onBlur={() => onPersistField({ email: email.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="text" />} label="Description" value={description} placeholder="Set Description..." truncate onChange={setDescription} onBlur={() => onPersistField({ personal_context: description.trim() || null })} />
            <AttributeRow icon={<RtIcon name="building" />} label="Company">
              <EditableCompanyValue
                company={company}
                value={companyName}
                options={companyOptions}
                open={showCompanyPicker}
                onOpenCompany={onOpenCompany}
                onEdit={onEditCompany}
                onSearch={onSearchCompany}
                onSelect={onSelectCompany}
                onClear={onClearCompany}
                onClose={onCloseCompanyPicker}
              />
            </AttributeRow>
            <EditableAttributeRow icon={<RtIcon name="briefcase" />} label="Job title" value={jobTitle} placeholder="Set Job title..." onChange={setJobTitle} onBlur={() => onPersistField({ job_title: jobTitle.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="phone" />} label="Phone numbers" value={phone} placeholder="Set Phone numbers..." onChange={setPhone} onBlur={() => onPersistField({ phone: phone.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="location" />} label="Primary location" value={location} placeholder="Set Primary location..." onChange={setLocation} onBlur={() => onPersistField({ location: location.trim() || null })} />
          </>
        )}
        {entityType === 'opportunity' && (
          <>
            <EditableAttributeRow icon={<RtIcon name="text" />} label="Name" value={name} onChange={setName} onBlur={() => onPersistField({ title: name.trim() })} />
            <AttributeRow icon={<RtIcon name="money" />} label="Deal stage" value="Lead" />
            <AttributeRow icon={<RtIcon name="money" />} label="Deal value" value="Set Deal value..." />
            <AttributeRow icon={<RtIcon name="users" />} label="Associated people" value="Set Associated people..." />
            <AttributeRow icon={<RtIcon name="building" />} label="Associated company">
              <EditableCompanyValue
                company={company}
                value={companyName}
                options={companyOptions}
                open={showCompanyPicker}
                onOpenCompany={onOpenCompany}
                onEdit={onEditCompany}
                onSearch={onSearchCompany}
                onSelect={onSelectCompany}
                onClear={onClearCompany}
                onClose={onCloseCompanyPicker}
              />
            </AttributeRow>
          </>
        )}
        {entityType !== 'opportunity' && (
          <>
            <EditableAttributeRow icon={<RtIcon name="link" />} label="AngelList" value={angellistUrl} placeholder="Set AngelList..." link={Boolean(angellistUrl)} onChange={setAngellistUrl} onBlur={() => onPersistField({ angellist_url: angellistUrl.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="facebook" />} label="Facebook" value={facebookUrl} placeholder="Set Facebook..." link={Boolean(facebookUrl)} onChange={setFacebookUrl} onBlur={() => onPersistField({ facebook_url: facebookUrl.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="instagram" />} label="Instagram" value={instagramUrl} placeholder="Set Instagram..." link={Boolean(instagramUrl)} onChange={setInstagramUrl} onBlur={() => onPersistField({ instagram_url: instagramUrl.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="linkedin" />} label="LinkedIn" value={linkedinUrl} placeholder="Set LinkedIn..." link={Boolean(linkedinUrl)} onChange={setLinkedinUrl} onBlur={() => onPersistField({ linkedin_url: linkedinUrl.trim() || null })} />
            <EditableAttributeRow icon={<RtIcon name="twitter" />} label="Twitter" value={twitterUrl} placeholder="Set Twitter..." link={Boolean(twitterUrl)} onChange={setTwitterUrl} onBlur={() => onPersistField({ twitter_url: twitterUrl.trim() || null })} />
          </>
        )}
        <AttributeRow icon={<RtIcon name="money" />} label="Associated deals">
          {deals.length > 0 ? <span className="rt-attribute-chip"><ObjectGlyph type="opportunity" /> {deals[0].title}{deals.length > 1 ? ` +${deals.length - 1}` : ''}</span> : <span className="rt-placeholder">Set Associated deals...</span>}
        </AttributeRow>
      </div>
    </section>
  )
}

function AttributeRow({
  icon,
  label,
  value,
  link,
  truncate,
  children,
}: {
  icon: ReactNode
  label: string
  value?: string | null
  link?: boolean
  truncate?: boolean
  children?: ReactNode
}) {
  const isPlaceholder = !children && (!value || value.startsWith('Set '))
  return (
    <div className="rt-attribute-row">
      <span className="rt-attribute-label"><i>{icon}</i>{label}</span>
      <div className={`rt-attribute-value ${link ? 'link' : ''} ${truncate ? 'truncate' : ''} ${isPlaceholder ? 'rt-placeholder' : ''}`}>
        {children ?? value ?? 'Set a value...'}
      </div>
    </div>
  )
}

function EditableAttributeRow({
  icon,
  label,
  value,
  placeholder,
  link,
  truncate,
  onChange,
  onBlur,
}: {
  icon: ReactNode
  label: string
  value?: string | null
  placeholder?: string
  link?: boolean
  truncate?: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <div className="rt-attribute-row">
      <span className="rt-attribute-label"><i>{icon}</i>{label}</span>
      <div className={`rt-attribute-value editable ${link ? 'link' : ''} ${truncate ? 'truncate' : ''} ${!value ? 'rt-placeholder' : ''}`}>
        <input
          value={value ?? ''}
          placeholder={placeholder ?? 'Set a value...'}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </div>
    </div>
  )
}

function EditableTeamValue({
  members,
  onOpenPerson,
  onEdit,
  compact,
}: {
  members: PersonRelationRecord[]
  onOpenPerson: (person: PersonRelationRecord) => void
  onEdit: () => void
  compact?: boolean
}) {
  const first = members[0]
  return (
    <div className={`rt-editable-relation ${compact ? 'compact' : ''}`}>
      {first ? (
        <button className="rt-inline-relation" type="button" onClick={() => onOpenPerson(first)}>
          {first.profile_photo_url ? <img src={first.profile_photo_url} alt="" /> : <span className="rt-person-fallback">{first.name.slice(0, 1)}</span>}
          <span>{first.name}</span>
        </button>
      ) : (
        <span className="rt-placeholder">Set Team...</span>
      )}
      {members.length > 1 && <span className="rt-more-chip">+{members.length - 1}</span>}
      <button className="rt-edit-pencil" type="button" onClick={onEdit} title="Edit Team"><RtIcon name="edit" size={12} /></button>
    </div>
  )
}

function EditableCompanyValue({
  company,
  value,
  options,
  open,
  onOpenCompany,
  onEdit,
  onSearch,
  onSelect,
  onClear,
  onClose,
}: {
  company: CompanyOption | null
  value: string
  options: CompanyOption[]
  open: boolean
  onOpenCompany: (company: CompanyOption) => void
  onEdit: () => void
  onSearch: (value: string) => void
  onSelect: (company: CompanyOption) => void
  onClear: () => void
  onClose: () => void
}) {
  const selected = company ?? options.find(option => option.name === value) ?? null
  const logo = companyLogoUrl(selected)
  return (
    <div className="rt-editable-relation rt-company-inline">
      {open ? (
        <>
          <input
            className="rt-inline-relation-input"
            value={value}
            onChange={event => onSearch(event.target.value)}
            placeholder="Set Company..."
            autoFocus
          />
          <div className="rt-popover rt-attribute-popover">
            <div className="rt-popover-search"><RtIcon name="search" size={12} /> Search records...</div>
            {options.length === 0 ? (
              <div className="rt-popover-empty">No companies found</div>
            ) : options.map(option => {
              const optionLogo = companyLogoUrl(option)
              return (
                <button type="button" key={option.id} onClick={() => onSelect(option)}>
                  {optionLogo ? <img className="rt-pop-logo" src={optionLogo} alt="" /> : <ObjectGlyph type="company" />}
                  <span className="rt-pop-name">{option.name}</span>
                  {option.domain && <em>{option.domain}</em>}
                </button>
              )
            })}
            <button type="button" className="rt-popover-create" onClick={onClose}><RtIcon name="building" size={12} /> Create new Company</button>
          </div>
        </>
      ) : selected ? (
        <>
          <button className="rt-inline-relation" type="button" onClick={() => onOpenCompany(selected)}>
            {logo ? <img src={logo} alt="" /> : <ObjectGlyph type="company" />}
            <span>{selected.name}</span>
          </button>
          <button className="rt-edit-pencil" type="button" onClick={onEdit} title="Edit Company"><RtIcon name="edit" size={12} /></button>
          <button className="rt-edit-pencil" type="button" onClick={onClear} title="Clear Company"><RtIcon name="close" size={12} /></button>
        </>
      ) : (
        <>
          <button className="rt-placeholder rt-inline-empty" type="button" onClick={onEdit}>Set Company...</button>
          <button className="rt-edit-pencil" type="button" onClick={onEdit} title="Edit Company"><RtIcon name="edit" size={12} /></button>
        </>
      )}
    </div>
  )
}

function TeamPickerModal({
  company,
  members,
  people,
  search,
  onSearch,
  onToggle,
  onClose,
}: {
  company: ExistingRecord
  members: PersonRelationRecord[]
  people: PersonRelationRecord[]
  search: string
  onSearch: (value: string) => void
  onToggle: (person: PersonRelationRecord) => void
  onClose: () => void
}) {
  const selectedIds = new Set(members.map(member => member.id))
  return (
    <div className="rt-relation-modal-layer">
      <div className="rt-list-modal rt-team-modal">
        <div className="rt-modal-head">
          <strong><ObjectGlyph type="person" />Team</strong>
          <button type="button" onClick={onClose}><RtIcon name="close" size={14} /></button>
        </div>
        <div className="rt-picker-search rt-team-search">
          <RtIcon name="search" size={12} />
          <input value={search} onChange={event => onSearch(event.target.value)} placeholder="Find a record..." autoFocus />
        </div>
        <div className="rt-modal-list rt-team-list">
          {people.map(person => {
            const selected = selectedIds.has(person.id) || person.company_id === company.id
            return (
              <button type="button" key={person.id} onClick={() => onToggle(person)}>
                {person.profile_photo_url ? <img className="rt-picker-avatar person" src={person.profile_photo_url} alt="" /> : <span className="rt-person-fallback">{person.name.slice(0, 1)}</span>}
                <span className="rt-picker-main">{person.name}</span>
                {person.email && <em>{person.email}</em>}
                <span className={`rt-check ${selected ? 'checked' : ''}`}>{selected ? <RtIcon name="check" size={9} /> : ''}</span>
              </button>
            )
          })}
          {people.length === 0 && <div className="rt-list-empty"><div className="rt-empty-illustration"><RtIcon name="user" size={30} /></div><span>No people</span></div>}
        </div>
        <button type="button" className="rt-modal-create" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined; readOnly?: boolean }) {
  return (
    <div className="rt-field">
      <span>{label}</span>
      <div>{value || 'Set a value...'}</div>
    </div>
  )
}

function companyLogoUrl(company?: { logo_url?: string | null; domain?: string | null } | null) {
  if (company?.logo_url) return company.logo_url
  if (company?.domain) return `https://www.google.com/s2/favicons?domain=${company.domain}&sz=64`
  return null
}

function companyRecordFromData(data: any): ExistingRecord {
  return {
    id: data.id,
    type: 'company',
    name: data.name,
    domain: data.domain,
    description: data.description ?? data.headline,
    logoUrl: data.logo_url,
    location: data.primary_location,
    angellistUrl: data.angellist_url,
    facebookUrl: data.facebook_url,
    instagramUrl: data.instagram_url,
    linkedinUrl: data.linkedin_url,
    twitterUrl: data.twitter_url,
  }
}

function personRecordFromData(data: any): ExistingRecord {
  return {
    id: data.id,
    type: 'person',
    name: data.name,
    company: data.company,
    companyId: data.company_id,
    jobTitle: data.job_title,
    email: data.email,
    phone: data.phone,
    location: data.location,
    description: data.personal_context,
    profilePhotoUrl: data.profile_photo_url,
    logoUrl: data.profile_photo_url,
    angellistUrl: data.angellist_url,
    facebookUrl: data.facebook_url,
    instagramUrl: data.instagram_url,
    linkedinUrl: data.linkedin_url,
    twitterUrl: data.twitter_url,
  }
}

function isBadLogoUrl(value?: string | null) {
  return Boolean(value && /meridian|cliente|customer|testimonial|case-stud|badge|capterra|getapp|softwareadvice|g2|gartner/i.test(value))
}

function isBetterCompanyLogo(current: string | null | undefined, candidate: string, domain?: string | null) {
  if (!current) return true
  if (candidate.startsWith('data:image/svg+xml') && !current.startsWith('data:image/svg+xml')) return true
  const cleanDomain = domain?.replace(/^www\./, '')
  if (!cleanDomain) return false
  try {
    const currentMatches = logoUrlRepresentsDomain(current, cleanDomain)
    const candidateMatches = logoUrlRepresentsDomain(candidate, cleanDomain)
    return candidateMatches && !currentMatches
  } catch {
    return false
  }
}

function logoUrlRepresentsDomain(value: string, domain: string) {
  if (value.startsWith('data:')) return true
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')
    const queryDomain = url.searchParams.get('domain')?.replace(/^www\./, '')
    return host.includes(domain) || queryDomain === domain
  } catch {
    return false
  }
}

function firstWorkingLogo(values: Array<string | null | undefined>, broken: string[]) {
  const blocked = new Set(broken)
  return values.find(value => value && !blocked.has(value)) ?? null
}

function dedupePeople(values: PersonRelationRecord[]) {
  return [...new Map(values.filter(person => person.id && person.name).map(person => [person.id, person])).values()]
}

function titleCaseDomain(domain: string) {
  const first = domain.replace(/^www\./, '').split('.')[0] || domain
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function cleanCompanyLabel(value?: string | null) {
  return value
    ?.replace(/\s*[·•]\s*.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

function DetailField({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="rt-detail-field">
      <span className="rt-detail-label"><i>{icon}</i>{label}</span>
      <div className="rt-detail-value">{children}</div>
    </div>
  )
}

function RelationField({
  label,
  value,
  onChange,
  onFocus,
  options,
  selectedOption,
  open,
  onSelect,
  onOpenSelected,
  onClose,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  options: CompanyOption[]
  selectedOption?: CompanyOption | null
  open: boolean
  onSelect: (company: CompanyOption) => void
  onOpenSelected?: (company: CompanyOption) => void
  onClose: () => void
}) {
  const selected = selectedOption ?? options.find(option => option.name === value) ?? null
  const logo = companyLogoUrl(selected)
  return (
    <div className="rt-detail-field rt-relation">
      <span className="rt-detail-label"><i><RtIcon name="building" /></i>{label}</span>
      <div className="rt-relation-box">
        {value && !open ? (
          <div className="rt-relation-chip">
            <button
              type="button"
              className="rt-relation-open"
              onClick={() => selected && onOpenSelected?.(selected)}
              disabled={!selected || !onOpenSelected}
            >
              {logo ? <img src={logo} alt="" /> : <ObjectGlyph type="company" />}
              <span>{value}</span>
            </button>
            <button type="button" className="rt-chip-edit" onClick={onFocus} title="Edit"><RtIcon name="menu" size={11} /></button>
            <button type="button" className="rt-chip-clear" onClick={() => onChange('')} title="Clear"><RtIcon name="close" size={11} /></button>
          </div>
        ) : (
          <input value={value} onChange={event => onChange(event.target.value)} onFocus={onFocus} placeholder="Set company..." />
        )}
        {open && (
          <div className="rt-popover">
            <div className="rt-popover-search"><RtIcon name="search" size={12} /> Search records...</div>
            {options.length === 0 ? (
              <div className="rt-popover-empty">No companies found</div>
            ) : options.map(company => (
              <button type="button" key={company.id} onClick={() => onSelect(company)}>
                {companyLogoUrl(company) ? <img className="rt-pop-logo" src={companyLogoUrl(company) ?? ''} alt="" /> : <ObjectGlyph type="company" />}
                <span className="rt-pop-name">{company.name}</span>
                {company.domain && <em>{company.domain}</em>}
              </button>
            ))}
            <button type="button" className="rt-popover-create" onClick={onClose}><RtIcon name="building" size={12} /> Create new Company</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ListsSection({
  memberships,
  lists,
  showPicker,
  newListName,
  onTogglePicker,
  onAdd,
  onNewListName,
  onCreateList,
}: {
  memberships: ListMembershipRecord[]
  lists: ListOption[]
  showPicker: boolean
  newListName: string
  onTogglePicker: () => void
  onAdd: (list: ListOption) => void
  onNewListName: (value: string) => void
  onCreateList: () => void
}) {
  const existingIds = new Set(memberships.map(member => member.list_id))
  const available = lists.filter(list => !existingIds.has(list.id))
  return (
    <section className="rt-card rt-mini rt-live-section">
      <div className="rt-mini-head">
        <div><span><ObjectGlyph type="list" /> Lists</span>{memberships.length > 0 && <em>{memberships.length}</em>}</div>
        <button title="Open"><RtIcon name="chevron-right" size={13} /></button>
      </div>
      {memberships.length === 0 ? (
        <p>This record is not part of any lists</p>
      ) : (
        <div className="rt-section-items">
          {memberships.map(member => {
            const list = member.list
            const stage = list?.stages?.find(item => item.key === member.current_stage)
            return (
              <div className="rt-list-card" key={member.id}>
                <div className="rt-item-main">
                  <ObjectGlyph type="list" />
                  <span className="rt-item-title">{list?.name || 'List'}</span>
                  <button title="More">⋮</button>
                </div>
                <div className="rt-list-detail">
                  <span>Stage</span>
                  <strong><i style={{ background: stage?.color || list?.color || '#a3a3a3' }} />{stage?.label || member.current_stage}</strong>
                </div>
                <div className="rt-list-detail">
                  <span>Notes</span>
                  <strong className="muted">{member.notes || String(member.attributes?.notes ?? 'Set Notes...')}</strong>
                </div>
                <button className="rt-show-values">Show all values <RtIcon name="external" size={12} /></button>
              </div>
            )
          })}
        </div>
      )}
      <div className="rt-action-wrap">
        <button className="rt-secondary" onClick={onTogglePicker}><ObjectGlyph type="list" /> Add to list</button>
        {showPicker && (
          <div className="rt-modal-layer">
            <div className="rt-list-modal">
              <div className="rt-modal-head">
                <strong><ObjectGlyph type="list" />Add to list</strong>
                <button type="button" onClick={onTogglePicker}><RtIcon name="close" size={14} /></button>
              </div>
              <input className="rt-modal-search" value={newListName} onChange={event => onNewListName(event.target.value)} placeholder="Search lists..." />
              <div className="rt-modal-list">
                {available.map(list => (
                  <button type="button" key={list.id} onClick={() => onAdd(list)}>
                    <ObjectGlyph type="list" />
                    <span className="rt-pop-name">{list.name}</span>
                  </button>
                ))}
                {available.length === 0 && (
                  <div className="rt-list-empty">
                    <div className="rt-empty-illustration"><RtIcon name="list" size={30} /></div>
                    <span>No lists</span>
                  </div>
                )}
            </div>
              {newListName.trim() && (
                <button type="button" className="rt-modal-create" onClick={onCreateList}>Create "{newListName.trim()}"</button>
              )}
              <div className="rt-modal-foot"><span>↑ ↓</span><span>Navigate</span></div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function DealsSection({
  deals,
  showCreator,
  newDealTitle,
  companyOptions,
  peopleOptions,
  matchedCompany,
  currentEntity,
  onToggleCreator,
  onTitleChange,
  onCreateDeal,
  onOpenDeal,
}: {
  deals: DealRecord[]
  showCreator: boolean
  newDealTitle: string
  companyOptions: CompanyOption[]
  peopleOptions: PersonRelationRecord[]
  matchedCompany: CompanyOption | null
  currentEntity: ExistingRecord | null
  onToggleCreator: () => void
  onTitleChange: (value: string) => void
  onCreateDeal: (draft: DealDraft) => void
  onOpenDeal: (deal: DealRecord) => void
}) {
  return (
    <section className="rt-card rt-mini rt-live-section">
      <div className="rt-mini-head">
        <div><span><ObjectGlyph type="opportunity" /> Deals</span><em>{deals.length}</em></div>
        <div className="rt-mini-actions">
          <button title="Add" onClick={onToggleCreator}>+</button>
          <button title="Open"><RtIcon name="external" size={13} /></button>
        </div>
      </div>
      {deals.length === 0 ? (
        <p>There are no deals linked yet</p>
      ) : (
        <div className="rt-deal-row">
          {deals.slice(0, 3).map(deal => {
            const dealLogo = companyLogoUrl(deal.company)
            return (
              <button type="button" className="rt-deal-pill" key={deal.id} onClick={() => onOpenDeal(deal)}>
                {dealLogo ? <img src={dealLogo} alt="" /> : <ObjectGlyph type="opportunity" />}
                <strong>{deal.title}</strong>
                <em>{deal.type === 'job' ? 'Job' : deal.type || 'Invoice'}</em>
                <span className="rt-more-chip">+2</span>
              </button>
            )
          })}
          {deals.length > 3 && <span className="rt-more-chip">+{deals.length - 3}</span>}
        </div>
      )}
      {showCreator && (
        <CreateDealModal
          initialTitle={newDealTitle}
          companyOptions={companyOptions}
          peopleOptions={peopleOptions}
          matchedCompany={matchedCompany}
          currentEntity={currentEntity}
          onTitleChange={onTitleChange}
          onCancel={onToggleCreator}
          onCreate={onCreateDeal}
        />
      )}
    </section>
  )
}

function CreateDealModal({
  initialTitle,
  companyOptions,
  peopleOptions,
  matchedCompany,
  currentEntity,
  onTitleChange,
  onCancel,
  onCreate,
}: {
  initialTitle: string
  companyOptions: CompanyOption[]
  peopleOptions: PersonRelationRecord[]
  matchedCompany: CompanyOption | null
  currentEntity: ExistingRecord | null
  onTitleChange: (value: string) => void
  onCancel: () => void
  onCreate: (draft: DealDraft) => void
}) {
  const [draft, setDraft] = useState<DealDraft>({
    title: initialTitle,
    stage: '',
    owner: '',
    value: '',
    peopleIds: currentEntity?.type === 'person' ? [currentEntity.id] : [],
    companyId: currentEntity?.type === 'company' ? currentEntity.id : (matchedCompany?.id ?? ''),
    closeDate: 'Jun 21, 2026',
    type: 'job',
    jobDesc: '',
  })
  const [openField, setOpenField] = useState<string | null>(null)
  const selectedCompany = companyOptions.find(company => company.id === draft.companyId) ?? (currentEntity?.type === 'company'
    ? { id: currentEntity.id, name: currentEntity.name, domain: currentEntity.domain ?? null, logo_url: currentEntity.logoUrl ?? null }
    : matchedCompany)
  const selectedPeople = peopleOptions.filter(person => draft.peopleIds.includes(person.id))

  function patchDraft(patch: Partial<DealDraft>) {
    setDraft(current => ({ ...current, ...patch }))
    if (patch.title !== undefined) onTitleChange(patch.title)
  }

  return (
    <div className="rt-modal-layer">
      <div className="rt-deal-modal">
        <div className="rt-modal-head">
          <strong><ObjectGlyph type="opportunity" />Create Deal</strong>
          <button type="button" onClick={onCancel}><RtIcon name="close" size={14} /></button>
        </div>
        <div className="rt-modal-form">
          <ModalField label="Deal name (required)">
            <input value={draft.title} onChange={event => patchDraft({ title: event.target.value })} autoFocus />
          </ModalField>
          <ModalField label="Deal stage (required)">
            <PickerButton
              value={draft.stage ? <><span className="rt-stage-dot" />{draft.stage}</> : 'Set Deal stage...'}
              muted={!draft.stage}
              onClick={() => setOpenField(openField === 'stage' ? null : 'stage')}
            />
            {openField === 'stage' && (
              <div className="rt-picker-menu">
                {['Lead', 'In Progress', 'Won 🎉', 'Lost'].map(stage => (
                  <button type="button" key={stage} onClick={() => { patchDraft({ stage }); setOpenField(null) }}>
                    <span className="rt-stage-dot" />{stage}
                  </button>
                ))}
              </div>
            )}
          </ModalField>
          <ModalField label="Deal owner (required)">
            <PickerButton value={draft.owner || 'Set a value...'} muted={!draft.owner} onClick={() => setOpenField(openField === 'owner' ? null : 'owner')} />
            {openField === 'owner' && (
              <PersonPicker people={peopleOptions} selectedIds={draft.owner ? [draft.owner] : []} onSelect={(person) => { patchDraft({ owner: person.id }); setOpenField(null) }} />
            )}
          </ModalField>
          <ModalField label="Deal value"><input value={draft.value} onChange={event => patchDraft({ value: event.target.value })} placeholder="Set Deal value..." /></ModalField>
          <ModalField label="Associated people">
            <PickerButton
              value={selectedPeople.length > 0 ? selectedPeople.map(person => person.name).join(', ') : 'Set a value...'}
              muted={selectedPeople.length === 0}
              onClick={() => setOpenField(openField === 'people' ? null : 'people')}
            />
            {openField === 'people' && (
              <PersonPicker
                people={peopleOptions}
                selectedIds={draft.peopleIds}
                multi
                onSelect={(person) => {
                  const exists = draft.peopleIds.includes(person.id)
                  patchDraft({ peopleIds: exists ? draft.peopleIds.filter(id => id !== person.id) : [...draft.peopleIds, person.id] })
                }}
              />
            )}
          </ModalField>
          <ModalField label="Associated company">
            <PickerButton value={selectedCompany?.name || 'Set a value...'} muted={!selectedCompany} onClick={() => setOpenField(openField === 'company' ? null : 'company')} />
            {openField === 'company' && (
              <CompanyPicker companies={companyOptions} selectedId={draft.companyId} onSelect={(company) => { patchDraft({ companyId: company.id }); setOpenField(null) }} />
            )}
          </ModalField>
          <ModalField label="Close Date">
            <PickerButton value={draft.closeDate} onClick={() => setOpenField(openField === 'date' ? null : 'date')} />
            {openField === 'date' && <CalendarPicker onSelect={(value) => { patchDraft({ closeDate: value }); setOpenField(null) }} />}
          </ModalField>
          <ModalField label="Type"><input value={draft.type} onChange={event => patchDraft({ type: event.target.value })} placeholder="Set Type..." /></ModalField>
          <ModalField label="Job Desc"><input value={draft.jobDesc} onChange={event => patchDraft({ jobDesc: event.target.value })} placeholder="Set Job Desc..." /></ModalField>
        </div>
        <div className="rt-modal-actions">
          <button type="button" className="rt-modal-cancel" onClick={onCancel}>Cancel <span>ESC</span></button>
          <button type="button" className="rt-modal-primary" onClick={() => onCreate(draft)} disabled={!draft.title.trim()}>Create record <span>⌘↵</span></button>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rt-modal-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function PickerButton({
  value,
  muted,
  onClick,
}: {
  value: ReactNode
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`rt-picker-button ${muted ? 'muted' : ''}`} onClick={onClick}>
      <span>{value}</span>
    </button>
  )
}

function PersonPicker({
  people,
  selectedIds,
  multi,
  onSelect,
}: {
  people: PersonRelationRecord[]
  selectedIds: string[]
  multi?: boolean
  onSelect: (person: PersonRelationRecord) => void
}) {
  return (
    <div className="rt-picker-menu rt-record-picker">
      <div className="rt-picker-search"><RtIcon name="search" size={12} /> Search records...</div>
      {people.length === 0 ? (
        <div className="rt-picker-empty">No people found</div>
      ) : people.map(person => {
        const selected = selectedIds.includes(person.id)
        return (
          <button type="button" key={person.id} onClick={() => onSelect(person)}>
            {person.profile_photo_url ? <img className="rt-picker-avatar person" src={person.profile_photo_url} alt="" /> : <span className="rt-person-fallback">{person.name.slice(0, 1)}</span>}
            <span className="rt-picker-main">{person.name}</span>
            {person.company && <em>{person.company}</em>}
            {multi && <span className={`rt-check ${selected ? 'checked' : ''}`}>{selected ? <RtIcon name="check" size={9} /> : ''}</span>}
          </button>
        )
      })}
      <button type="button" className="rt-picker-create"><RtIcon name="user" size={12} /> Create new Person</button>
    </div>
  )
}

function CompanyPicker({
  companies,
  selectedId,
  onSelect,
}: {
  companies: CompanyOption[]
  selectedId: string
  onSelect: (company: CompanyOption) => void
}) {
  return (
    <div className="rt-picker-menu rt-record-picker">
      <div className="rt-picker-search"><RtIcon name="search" size={12} /> Search records...</div>
      {companies.length === 0 ? (
        <div className="rt-picker-empty">No companies found</div>
      ) : companies.map(company => {
        const logo = companyLogoUrl(company)
        return (
          <button type="button" key={company.id} onClick={() => onSelect(company)}>
            {logo ? <img className="rt-picker-avatar" src={logo} alt="" /> : <ObjectGlyph type="company" />}
            <span className="rt-picker-main">{company.name}</span>
            {company.domain && <em>{company.domain}</em>}
            {selectedId === company.id && <span className="rt-selected-dot" />}
          </button>
        )
      })}
      <button type="button" className="rt-picker-create"><RtIcon name="building" size={12} /> Create new Company</button>
    </div>
  )
}

function CalendarPicker({ onSelect }: { onSelect: (value: string) => void }) {
  const days = Array.from({ length: 30 }, (_, index) => index + 1)
  return (
    <div className="rt-picker-menu rt-calendar">
      <div className="rt-calendar-head">
        <button type="button"><RtIcon name="chevron-left" size={12} /></button>
        <strong>June 2026</strong>
        <button type="button"><RtIcon name="chevron-right" size={12} /></button>
      </div>
      <div className="rt-calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        {days.map(day => (
          <button type="button" key={day} className={day === 21 ? 'selected' : ''} onClick={() => onSelect(`Jun ${day}, 2026`)}>
            {day}
          </button>
        ))}
      </div>
      <div className="rt-calendar-shortcuts">
        <button type="button" onClick={() => onSelect('Today')}><RtIcon name="calendar" size={12} />Today</button>
        <button type="button" onClick={() => onSelect('Tomorrow')}><RtIcon name="calendar" size={12} />Tomorrow</button>
        <button type="button" onClick={() => onSelect('Next week')}><RtIcon name="calendar" size={12} />Next week</button>
        <button type="button" onClick={() => onSelect('')}><RtIcon name="calendar" size={12} />No date</button>
      </div>
    </div>
  )
}

function TeamSection({
  members,
  onOpenPerson,
  onEdit,
}: {
  members: PersonRelationRecord[]
  onOpenPerson: (person: PersonRelationRecord) => void
  onEdit: () => void
}) {
  return (
    <section className="rt-card rt-mini rt-live-section">
      <div className="rt-mini-head">
        <div><span><ObjectGlyph type="person" /> Team</span><em>{members.length}</em></div>
        <div className="rt-mini-actions">
          <button title="Add" onClick={onEdit}>+</button>
          <button title="Open"><RtIcon name="external" size={13} /></button>
        </div>
      </div>
      {members.length === 0 ? (
        <p>There are no people linked yet</p>
      ) : (
        <RelationRows people={members} onOpenPerson={onOpenPerson} />
      )}
    </section>
  )
}

function PeopleSection({ members, onOpenPerson }: { members: PersonRelationRecord[]; onOpenPerson: (person: PersonRelationRecord) => void }) {
  return (
    <section className="rt-card rt-mini rt-live-section">
      <div className="rt-mini-head">
        <div><span><ObjectGlyph type="person" /> Associated people</span><em>{members.length}</em></div>
        <button title="Open"><RtIcon name="external" size={13} /></button>
      </div>
      {members.length === 0 ? (
        <p>No people linked yet</p>
      ) : (
        <RelationRows people={members} onOpenPerson={onOpenPerson} />
      )}
    </section>
  )
}

function CompanySection({ company, onOpenCompany }: { company: CompanyOption | null; onOpenCompany: (company: CompanyOption) => void }) {
  const logo = companyLogoUrl(company)
  return (
    <section className="rt-card rt-mini rt-live-section">
      <div className="rt-mini-head">
        <div><span><ObjectGlyph type="company" /> Company</span>{company && <em>1</em>}</div>
        <button title="Open"><RtIcon name="external" size={13} /></button>
      </div>
      {!company ? (
        <p>No linked records yet</p>
      ) : (
        <div className="rt-relation-rows">
          <button type="button" className="rt-related-row" onClick={() => onOpenCompany(company)}>
            {logo ? <img src={logo} alt="" /> : <ObjectGlyph type="company" />}
            <strong>{company.name}</strong>
            {company.domain && <a>{company.domain}</a>}
            <span className="rt-more-chip">+1</span>
          </button>
        </div>
      )}
    </section>
  )
}

function RelationRows({ people, onOpenPerson }: { people: PersonRelationRecord[]; onOpenPerson: (person: PersonRelationRecord) => void }) {
  return (
    <div className="rt-relation-rows">
      {people.slice(0, 4).map((member, index) => (
        <button type="button" className="rt-related-row" key={member.id} onClick={() => onOpenPerson(member)}>
          {member.profile_photo_url ? (
            <img src={member.profile_photo_url} alt="" />
          ) : (
            <span className="rt-person-fallback">{member.name.slice(0, 1)}</span>
          )}
          <strong>{member.name}</strong>
          {member.email && <a>{member.email}</a>}
          {index === 0 && people.length > 1 && <span className="rt-more-chip">+{people.length - 1}</span>}
        </button>
      ))}
    </div>
  )
}

function MiniSection({
  title,
  empty,
  action,
  count,
  icon = 'mail',
}: {
  title: string
  empty: string
  action?: string
  count?: string
  icon?: RtIconName
}) {
  return (
    <section className="rt-card rt-mini">
      <div className="rt-mini-head">
        <div>
          <span><ObjectGlyph icon={icon} />{title}</span>
          {count && <em>{count}</em>}
        </div>
        <button title="Open"><RtIcon name="external" size={13} /></button>
      </div>
      <p>{empty}</p>
      {action && <button className="rt-secondary">+ {action}</button>}
    </section>
  )
}
