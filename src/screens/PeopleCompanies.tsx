import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { addRecordToList } from '@/hooks/useLists'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import EditablePeekSelect from '@/components/crm/EditablePeekSelect'
import EditableCurrencyInput from '@/components/crm/EditableCurrencyInput'
import { OpportunityStageProgress } from '@/components/crm/OpportunityStageChip'
import {
  Icon, CompanyCell, AbmChip, AccountStageChip, CoverageMini, PeopleStack,
  NextStepCell, Mono, Avatar,
  type StackPerson,
} from '@/components/crm/cells'
import {
  ICP_CFG, ACCOUNT_SOURCE_CFG, MOTION_CFG, ACCOUNT_STAGE_CFG, ACCOUNT_STAGE_ORDER,
} from '@/lib/crmConfig'
import { accountCoverage, personForCoverage, type CoveragePerson, type Coverage } from '@/lib/abm'
import { ACTIVE_OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_OPTIONS, opportunityStageLabel } from '@/lib/opportunityStages'
import { formatCurrency } from '@/lib/formatters'
import type { Company, Contact, List, Opportunity } from '@/types'

function EditablePeekInput({
  value,
  placeholder = 'Empty',
  type = 'text',
  onSave,
}: {
  value: string | number | null | undefined
  placeholder?: string
  type?: string
  onSave: (value: string | null) => Promise<void> | void
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  const commit = async () => {
    const clean = draft.trim()
    const current = value == null ? '' : String(value).trim()
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
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value == null ? '' : String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

type ListMembershipRow = {
  id: string
  list_id: string
  company_id?: string | null
  opportunity_id?: string | null
  contact_id?: string | null
  current_stage: string
}

type OppContactLink = { id: string; opportunity_id: string; outreach_log_id: string; role: string | null }
type NestedCompanyRecord = { type: 'person' | 'deal'; id: string }

type CompanyPerson = Pick<Contact, 'id' | 'name' | 'job_title' | 'email' | 'phone' | 'company' | 'company_id' | 'location' | 'about' | 'website' | 'profile_photo_url' | 'linkedin_url' | 'angellist_url' | 'facebook_url' | 'instagram_url' | 'twitter_url' | 'last_interaction_at'>

type CompanyOpportunity = Pick<Opportunity, 'id' | 'title' | 'stage' | 'type' | 'estimated_value' | 'target_date' | 'close_date' | 'owner_contact_id' | 'notes' | 'company_id' | 'created_at'>

interface CompanyRow extends Company {
  people: StackPerson[]
  people_full: CompanyPerson[]
  opportunities: CompanyOpportunity[]
  list_memberships: Array<ListMembershipRow & { list?: List | null }>
  active_opps: number
  last_interaction_at: string | null
  _icp: string | null
  _stage: string | null
  _cov: Coverage | null
}

// Real `icp` is free text — map onto the handoff's closed ICP keys.
function normIcp(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s === 'icp1' || s === 'icp2' || s === 'icp3') return s
  if (/\b1\b|seed|series\s*a/.test(s)) return 'icp1'
  if (/\b2\b|series\s*b|saas/.test(s)) return 'icp2'
  if (/\b3\b|network|b2b/.test(s)) return 'icp3'
  return null
}

// Real `account_stage` → handoff stage key (keep raw if unknown; chip renders it).
function normStage(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (ACCOUNT_STAGE_CFG[s]) return s
  if (/qualified|research|prospect/.test(s)) return 'target'
  if (/active|engaged/.test(s)) return 'conversation'
  if (/customer|won|opportunit/.test(s)) return 'opportunity'
  return v
}

function normMotion(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  return MOTION_CFG[s] ? s : null
}
function normSource(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  return ACCOUNT_SOURCE_CFG[s] ? s : null
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}
function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}
function formatValue(n: number | null): string {
  return formatCurrency(n)
}
function formatTarget(dateStr: string | null): string {
  if (!dateStr) return '—'
  const days = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
export default function PeopleCompanies() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('table')
  const [peekId, setPeekId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newSector, setNewSector] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createMore, setCreateMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<CompanyPerson[]>([])
  const [opportunities, setOpportunities] = useState<CompanyOpportunity[]>([])
  const [oppLinks, setOppLinks] = useState<OppContactLink[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [allMemberships, setAllMemberships] = useState<Array<ListMembershipRow & { list?: List | null }>>([])
  const [picker, setPicker] = useState<null | 'list' | 'team' | 'deal' | 'dealPeople' | 'personList' | 'personDeal' | 'dealList'>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [nestedStack, setNestedStack] = useState<NestedCompanyRecord[]>([])

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: companies }, { data: contactsData }, { data: opps }, { data: listsData }, { data: memberships }, { data: opportunityContacts }] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', user.id).order('name'),
      supabase.from('outreach_logs').select('id, name, company, company_id, job_title, email, phone, location, about, website, linkedin_url, angellist_url, facebook_url, instagram_url, twitter_url, connection_strength, last_interaction_at, profile_photo_url, tier').eq('user_id', user.id),
      supabase.from('opportunities').select('id, title, type, stage, estimated_value, target_date, close_date, owner_contact_id, notes, company_id, created_at').eq('user_id', user.id),
      supabase.from('lists').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at'),
      supabase.from('list_memberships').select('*').eq('user_id', user.id),
      supabase.from('opportunity_contacts').select('*'),
    ])
    setContacts((contactsData ?? []) as CompanyPerson[])
    setOpportunities((opps ?? []) as CompanyOpportunity[])
    setOppLinks((opportunityContacts ?? []) as OppContactLink[])
    setLists((listsData ?? []) as List[])

    // people grouped per company (by id and by name, since contacts can carry either)
    const byId = new Map<string, CompanyPerson[]>()
    const byName = new Map<string, CompanyPerson[]>()
    for (const c of (contactsData ?? []) as CompanyPerson[]) {
      if (c.company_id) { const a = byId.get(c.company_id) ?? []; a.push(c); byId.set(c.company_id, a) }
      if (c.company) { const k = c.company.toLowerCase(); const a = byName.get(k) ?? []; a.push(c); byName.set(k, a) }
    }
    const coveragePeople: CoveragePerson[] = (contactsData ?? []).map(personForCoverage)

    const oppsByCompany = new Map<string, number>()
    const oppRows = (opps ?? []) as CompanyOpportunity[]
    const oppsFullByCompany = new Map<string, CompanyOpportunity[]>()
    for (const o of oppRows) {
      if (!o.company_id) continue
      const a = oppsFullByCompany.get(o.company_id) ?? []
      a.push(o)
      oppsFullByCompany.set(o.company_id, a)
      if (ACTIVE_OPPORTUNITY_STAGES.includes(o.stage)) {
        oppsByCompany.set(o.company_id, (oppsByCompany.get(o.company_id) ?? 0) + 1)
      }
    }
    const listById = new Map((listsData ?? []).map(list => [list.id, list as List]))
    const enrichedMemberships = ((memberships ?? []) as ListMembershipRow[]).map(membership => ({ ...membership, list: listById.get(membership.list_id) ?? null }))
    setAllMemberships(enrichedMemberships)
    const membershipsByCompany = new Map<string, Array<ListMembershipRow & { list?: List | null }>>()
    for (const membership of enrichedMemberships) {
      if (!membership.company_id) continue
      const a = membershipsByCompany.get(membership.company_id) ?? []
      a.push(membership)
      membershipsByCompany.set(membership.company_id, a)
    }

    const enriched: CompanyRow[] = (companies ?? []).map(co => {
      const people = byId.get(co.id) ?? byName.get(co.name.toLowerCase()) ?? []
      const lastInt = people.map(p => p.last_interaction_at).filter((x): x is string => !!x).sort().pop() ?? null
      const _icp = normIcp(co.icp)
      return {
        ...co,
        people: people.map(p => ({ id: p.id, name: p.name, avatar: p.profile_photo_url })),
        people_full: people,
        opportunities: oppsFullByCompany.get(co.id) ?? [],
        list_memberships: membershipsByCompany.get(co.id) ?? [],
        active_opps: oppsByCompany.get(co.id) ?? 0,
        last_interaction_at: lastInt,
        _icp,
        _stage: normStage(co.account_stage),
        _cov: accountCoverage({ name: co.name, icp: _icp }, coveragePeople),
      }
    })
    setRows(enriched)
    setLoading(false)
  }

  const addCompany = async () => {
    if (!user || !newName.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      user_id: user.id,
      name: newName.trim(),
      domain: newDomain.trim() || null,
      sector: newSector.trim() || null,
      description: newDescription.trim() || null,
    })
    setNewName(''); setNewDomain(''); setNewSector(''); setNewDescription('')
    if (!createMore) setShowAdd(false)
    setSaving(false)
    await load()
  }

  const moveStage = async (row: CompanyRow, stage: string | null) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, _stage: stage, account_stage: stage } : r))
    await supabase.from('companies').update({ account_stage: stage }).eq('id', row.id)
  }

  const peek = rows.find(r => r.id === peekId) ?? null
  const peekIndex = peek ? rows.findIndex(r => r.id === peek.id) : -1
  const nested = nestedStack[nestedStack.length - 1] ?? null
  const nestedPerson = nested?.type === 'person' ? contacts.find(contact => contact.id === nested.id) ?? null : null
  const nestedDeal = nested?.type === 'deal' ? opportunities.find(opportunity => opportunity.id === nested.id) ?? null : null
  const nestedDealLinks = nestedDeal ? oppLinks.filter(link => link.opportunity_id === nestedDeal.id) : []
  const nestedDealPeople = nestedDealLinks.map(link => contacts.find(contact => contact.id === link.outreach_log_id)).filter(Boolean) as CompanyPerson[]
  const nestedPersonDealLinks = nestedPerson ? oppLinks.filter(link => link.outreach_log_id === nestedPerson.id) : []
  const nestedPersonDeals = nestedPersonDealLinks.map(link => opportunities.find(opportunity => opportunity.id === link.opportunity_id)).filter(Boolean) as CompanyOpportunity[]
  const nestedPersonListMemberships = nestedPerson ? allMemberships.filter(membership => membership.contact_id === nestedPerson.id) : []
  const nestedDealListMemberships = nestedDeal ? allMemberships.filter(membership => membership.opportunity_id === nestedDeal.id) : []
  const activeRecordTitle = nestedPerson?.name ?? nestedDeal?.title ?? peek?.name ?? ''
  const activeRecordSubtitle = nestedPerson
    ? [nestedPerson.job_title, nestedPerson.company].filter(Boolean).join(' · ')
    : nestedDeal
    ? [peek?.name, nestedDeal.stage].filter(Boolean).join(' · ')
    : peek?.sector || peek?.hq_location || undefined

  const openNested = (record: NestedCompanyRecord) => {
    setPicker(null)
    setNestedStack(prev => [...prev, record])
  }
  const resetNested = () => {
    setPicker(null)
    setNestedStack([])
  }
  const backNested = () => {
    setPicker(null)
    setNestedStack(prev => prev.slice(0, -1))
  }
  const nestedBackTarget = (() => {
    const previous = nestedStack[nestedStack.length - 2]
    if (!previous) return peek?.name ?? 'company'
    if (previous.type === 'person') return contacts.find(contact => contact.id === previous.id)?.name ?? 'person'
    return opportunities.find(opportunity => opportunity.id === previous.id)?.title ?? 'deal'
  })()

  const updateCompany = async (patch: Partial<Company>) => {
    if (!peek) return
    setRows(prev => prev.map(row => row.id === peek.id ? { ...row, ...patch } : row))
    await supabase.from('companies').update(patch).eq('id', peek.id)
    await load()
  }

  const updatePerson = async (id: string, patch: Partial<Contact>) => {
    setContacts(prev => prev.map(contact => contact.id === id ? { ...contact, ...patch } : contact))
    await supabase.from('outreach_logs').update(patch).eq('id', id)
    await load()
  }

  const updateDeal = async (id: string, patch: Partial<Opportunity>) => {
    setOpportunities(prev => prev.map(opportunity => opportunity.id === id ? { ...opportunity, ...patch } : opportunity))
    await supabase.from('opportunities').update(patch).eq('id', id)
    await load()
  }

  const addCompanyToList = async (list: List) => {
    if (!user || !peek) return
    if ((list.parent_object ?? 'person') !== 'company') return
    await addRecordToList({ userId: user.id, list, recordId: peek.id })
    setPicker(null)
    await load()
  }

  const addNestedPersonToList = async (list: List) => {
    if (!user || !nestedPerson) return
    if ((list.parent_object ?? 'person') !== 'person') return
    await addRecordToList({ userId: user.id, list, recordId: nestedPerson.id })
    setPicker(null)
    await load()
  }

  const removeNestedPersonFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await load()
  }

  const addNestedDealToList = async (list: List) => {
    if (!user || !nestedDeal) return
    if ((list.parent_object ?? 'person') !== 'opportunity') return
    await addRecordToList({ userId: user.id, list, recordId: nestedDeal.id })
    setPicker(null)
    await load()
  }

  const removeNestedDealFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await load()
  }

  const attachPerson = async (person: CompanyPerson) => {
    if (!peek) return
    await supabase.from('outreach_logs').update({ company_id: peek.id, company: peek.name }).eq('id', person.id)
    setPicker(null)
    await load()
  }

  const attachDeal = async (deal: CompanyOpportunity) => {
    if (!peek) return
    await supabase.from('opportunities').update({ company_id: peek.id }).eq('id', deal.id)
    setPicker(null)
    await load()
  }

  const attachDealPerson = async (person: CompanyPerson) => {
    if (!nestedDeal) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: nestedDeal.id,
      outreach_log_id: person.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setPicker(null)
    await load()
  }

  const attachNestedPersonDeal = async (deal: CompanyOpportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: deal.id,
      outreach_log_id: nestedPerson.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setPicker(null)
    await load()
  }

  const detachNestedPersonDeal = async (deal: CompanyOpportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', deal.id).eq('outreach_log_id', nestedPerson.id)
    await load()
  }

  const createRelatedRecord = async () => {
    if (!user || !peek || !picker) return
    const label = pickerQuery.trim()
    if (picker === 'list' || picker === 'personList' || picker === 'dealList') {
      const { data } = await supabase.from('lists').insert({
        user_id: user.id,
        name: label || `${picker === 'personList' && nestedPerson ? nestedPerson.name : picker === 'dealList' && nestedDeal ? nestedDeal.title : peek.name} list`,
        parent_object: picker === 'personList' ? 'person' : picker === 'dealList' ? 'opportunity' : 'company',
        purpose: null,
        stages: [],
        color: '#eef0ed',
        icon: picker === 'personList' ? '👤' : picker === 'dealList' ? '💼' : '🏢',
      }).select('*').single()
      if (data) {
        if (picker === 'personList') await addNestedPersonToList(data as List)
        else if (picker === 'dealList') await addNestedDealToList(data as List)
        else await addCompanyToList(data as List)
      }
      return
    }
    if (picker === 'deal') {
      await supabase.from('opportunities').insert({
        user_id: user.id,
        title: label || `${peek.name} opportunity`,
        type: 'job',
        stage: 'exploring',
        company_id: peek.id,
      })
      setPicker(null)
      await load()
      return
    }
    if (picker === 'personDeal') {
      if (!nestedPerson) return
      const { data } = await supabase.from('opportunities').insert({
        user_id: user.id,
        title: label || `${nestedPerson.name} opportunity`,
        type: 'job',
        stage: 'exploring',
        company_id: peek.id,
      }).select('id, title, type, stage, estimated_value, target_date, close_date, owner_contact_id, notes, company_id, created_at').single()
      if (data) await attachNestedPersonDeal(data as CompanyOpportunity)
      return
    }
    const { data } = await supabase.from('outreach_logs').insert({
      user_id: user.id,
      name: label || 'Untitled person',
      status: 'PROSPECT',
      log_date: new Date().toISOString().slice(0, 10),
      health_score: 1,
      links: [],
      company_id: peek.id,
      company: peek.name,
    }).select('id, name, company, company_id, job_title, email, phone, location, about, website, linkedin_url, angellist_url, facebook_url, instagram_url, twitter_url, last_interaction_at, profile_photo_url').single()
    if (!data) return
    if (picker === 'dealPeople' && nestedDeal) {
      await supabase.from('opportunity_contacts').upsert({
        opportunity_id: nestedDeal.id,
        outreach_log_id: data.id,
        role: 'contact',
      }, { onConflict: 'opportunity_id,outreach_log_id' })
    }
    setPicker(null)
    await load()
  }

  const detachPerson = async (person: CompanyPerson) => {
    if (!peek) return
    await supabase.from('outreach_logs').update({ company_id: null, company: null }).eq('id', person.id)
    await load()
  }

  const detachDeal = async (deal: CompanyOpportunity) => {
    await supabase.from('opportunities').update({ company_id: null }).eq('id', deal.id)
    if (nested?.type === 'deal' && nested.id === deal.id) resetNested()
    await load()
  }

  const detachDealPerson = async (person: CompanyPerson) => {
    if (!nestedDeal) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', nestedDeal.id).eq('outreach_log_id', person.id)
    await load()
  }

  const removeCompanyFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await load()
  }

  const openPicker = (next: 'list' | 'team' | 'deal' | 'dealPeople' | 'personList' | 'personDeal' | 'dealList') => {
    setPickerQuery('')
    setPicker(next)
  }

  const columns: CrmColumn<CompanyRow>[] = useMemo(() => [
    { key: 'name', label: 'Company', icon: <Icon name="buildings" size={12} />, width: '190px', locked: true, render: r => <CompanyCell name={r.name} mark={r.name[0]?.toUpperCase()} src={r.logo_url} domain={r.domain ?? r.website_url} /> },
    { key: 'icp', label: 'ICP', icon: <Icon name="crosshair" size={12} />, width: '150px', render: r => r._icp ? <AbmChip cfg={ICP_CFG} value={r._icp} kind="icp" accent /> : <span className="crm-chip muted">Connector</span> },
    { key: 'stage', label: 'Stage', icon: <Icon name="flag" size={12} />, width: '128px', render: r => <AccountStageChip stage={r._stage} /> },
    { key: 'coverage', label: 'Coverage', icon: <Icon name="users-three" size={12} />, width: '96px', render: r => <CoverageMini cov={r._cov} icp={r._icp} /> },
    { key: 'people', label: 'Who you know', icon: <Icon name="users" size={12} />, width: '128px', render: r => <PeopleStack people={r.people} /> },
    { key: 'next', label: 'Next step', icon: <Icon name="arrow-bend-up-right" size={12} />, width: 'minmax(240px, 1fr)', render: r => <NextStepCell value={r.next_step} /> },
    // available attributes
    { key: 'source', label: 'Source', icon: <Icon name="magnet" size={12} />, width: '128px', defaultOff: true, render: r => normSource(r.source) ? <AbmChip cfg={ACCOUNT_SOURCE_CFG} value={normSource(r.source)} kind="src" /> : <span className="crm-empty">—</span> },
    { key: 'motion', label: 'Motion', icon: <Icon name="crosshair" size={12} />, width: '170px', defaultOff: true, render: r => normMotion(r.motion) ? <AbmChip cfg={MOTION_CFG} value={normMotion(r.motion)} kind="mot" /> : <span className="crm-empty">—</span> },
    { key: 'opps', label: 'Opportunities', icon: <Icon name="target" size={12} />, width: '108px', align: 'right', defaultOff: true, render: r => <Mono dim={!r.active_opps}>{r.active_opps || '—'}</Mono> },
    { key: 'industry', label: 'Industry', icon: <Icon name="briefcase" size={12} />, width: '150px', defaultOff: true, render: r => r.sector ? <span className="crm-chip muted">{r.sector}</span> : <span className="crm-empty">—</span> },
    { key: 'last', label: 'Last activity', icon: <Icon name="clock" size={12} />, width: '96px', align: 'right', defaultOff: true, render: r => <Mono dim>{formatAgo(r.last_interaction_at)}</Mono> },
  ], [])

  const views = [
    { id: 'table', label: 'All companies', type: 'table' as const },
    { id: 'stage', label: 'By stage', type: 'kanban' as const },
    { id: 'icp', label: 'By ICP', type: 'kanban' as const },
  ]

  const kanban = view === 'stage'
    ? {
        groupLabel: 'Stage',
        stages: [{ id: null, label: 'Unstaged', color: 'var(--mercury)' }, ...ACCOUNT_STAGE_ORDER.map(id => ({ id, label: ACCOUNT_STAGE_CFG[id].label!, color: ACCOUNT_STAGE_CFG[id].color }))],
        groupValue: (r: CompanyRow) => (r._stage && ACCOUNT_STAGE_CFG[r._stage] ? r._stage : null),
        cardColumns: ['icp', 'coverage', 'next'],
        onMove: moveStage,
      }
    : view === 'icp'
    ? {
        groupLabel: 'ICP',
        stages: [...Object.keys(ICP_CFG).map(id => ({ id, label: `${ICP_CFG[id].label} · ${ICP_CFG[id].tag}`, color: ICP_CFG[id].color })), { id: null, label: 'Connector / investor', color: 'var(--shuttle)' }],
        groupValue: (r: CompanyRow) => r._icp,
        cardColumns: ['stage', 'coverage', 'next'],
      }
    : undefined

  const recordAvatar = nestedPerson
    ? <Avatar src={nestedPerson.profile_photo_url} name={nestedPerson.name} size={40} />
    : nestedDeal
    ? <Avatar src={peek?.logo_url} name={peek?.name ?? nestedDeal.title} sq size={40} />
    : peek
    ? <Avatar src={peek.logo_url} name={peek.name} sq size={40} />
    : undefined
  const nestedDealOwner = nestedDeal?.owner_contact_id ? contacts.find(contact => contact.id === nestedDeal.owner_contact_id) ?? null : null

  const recordFields = nestedPerson ? [
    { label: 'Name', icon: <Icon name="user" size={12} />, value: <EditablePeekInput value={nestedPerson.name} placeholder="Name" onSave={value => updatePerson(nestedPerson.id, { name: value || nestedPerson.name })} /> },
    { label: 'Email', icon: <Icon name="envelope" size={12} />, value: <EditablePeekInput type="email" value={nestedPerson.email} placeholder="email@company.com" onSave={value => updatePerson(nestedPerson.id, { email: value })} /> },
    { label: 'Company', icon: <Icon name="buildings" size={12} />, value: <button className="peek-rel-link" onClick={resetNested}>{peek?.name ?? nestedPerson.company ?? 'No company'}</button> },
    { label: 'Role', icon: <Icon name="briefcase" size={12} />, value: <EditablePeekInput value={nestedPerson.job_title} placeholder="Job title" onSave={value => updatePerson(nestedPerson.id, { job_title: value })} /> },
    { label: 'Phone', icon: <Icon name="phone" size={12} />, value: <EditablePeekInput value={nestedPerson.phone} placeholder="Phone number" onSave={value => updatePerson(nestedPerson.id, { phone: value })} /> },
    { label: 'Primary location', icon: <Icon name="map-pin" size={12} />, value: <EditablePeekInput value={nestedPerson.location} placeholder="Location" onSave={value => updatePerson(nestedPerson.id, { location: value })} /> },
    { label: 'Description', icon: <Icon name="text-align-left" size={12} />, value: <EditablePeekInput value={nestedPerson.about} placeholder="Description" onSave={value => updatePerson(nestedPerson.id, { about: value })} /> },
    { label: 'Website', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={nestedPerson.website} placeholder="https://..." onSave={value => updatePerson(nestedPerson.id, { website: value })} /> },
    { label: 'LinkedIn', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.linkedin_url} placeholder="LinkedIn URL" onSave={value => updatePerson(nestedPerson.id, { linkedin_url: value })} /> },
    { label: 'AngelList', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.angellist_url} placeholder="AngelList URL" onSave={value => updatePerson(nestedPerson.id, { angellist_url: value })} /> },
    { label: 'Facebook', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.facebook_url} placeholder="Facebook URL" onSave={value => updatePerson(nestedPerson.id, { facebook_url: value })} /> },
    { label: 'Instagram', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.instagram_url} placeholder="Instagram URL" onSave={value => updatePerson(nestedPerson.id, { instagram_url: value })} /> },
    { label: 'Twitter', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.twitter_url} placeholder="Twitter URL" onSave={value => updatePerson(nestedPerson.id, { twitter_url: value })} /> },
  ] : nestedDeal ? [
    { label: 'Name', icon: <Icon name="target" size={12} />, value: <EditablePeekInput value={nestedDeal.title} placeholder="Deal name" onSave={value => updateDeal(nestedDeal.id, { title: value || nestedDeal.title })} /> },
    { label: 'Stage', icon: <Icon name="flag" size={12} />, value: <EditablePeekSelect<Opportunity['stage']> value={nestedDeal.stage} options={OPPORTUNITY_STAGE_OPTIONS.map(value => ({ value, label: opportunityStageLabel(value) }))} searchPlaceholder="Search or create stage..." showDot onSave={value => updateDeal(nestedDeal.id, { stage: value })} /> },
    { label: 'Deal owner', icon: <Icon name="user" size={12} />, value: <EditablePeekSelect<string> value={nestedDeal.owner_contact_id ?? ''} options={[{ value: '', label: 'Set owner...' }, ...contacts.map(contact => ({ value: contact.id, label: contact.name }))]} searchPlaceholder="Search people..." variant="relation" onSave={value => updateDeal(nestedDeal.id, { owner_contact_id: value || null })} /> },
    { label: 'Type', icon: <Icon name="tag" size={12} />, value: <EditablePeekSelect<Opportunity['type']> value={nestedDeal.type} options={['job', 'consulting', 'business', 'partnership', 'other'].map(value => ({ value: value as Opportunity['type'], label: value }))} onSave={value => updateDeal(nestedDeal.id, { type: value })} /> },
    { label: 'Company', icon: <Icon name="buildings" size={12} />, value: <button className="peek-rel-link" onClick={resetNested}>{peek?.name ?? 'No company'}</button> },
    { label: 'Associated people', icon: <Icon name="users" size={12} />, value: <button className="peek-rel-link" onClick={() => openPicker('dealPeople')}>{nestedDealPeople.length} people</button> },
    { label: 'Value', icon: <Icon name="currency-dollar" size={12} />, value: <EditableCurrencyInput value={nestedDeal.estimated_value} onSave={value => updateDeal(nestedDeal.id, { estimated_value: value })} /> },
    { label: 'Target date', icon: <Icon name="calendar-blank" size={12} />, value: <EditablePeekInput type="date" value={nestedDeal.target_date} onSave={value => updateDeal(nestedDeal.id, { target_date: value })} /> },
    { label: 'Close date', icon: <Icon name="calendar-blank" size={12} />, value: <EditablePeekInput type="date" value={nestedDeal.close_date} onSave={value => updateDeal(nestedDeal.id, { close_date: value })} /> },
  ] : peek ? [
    { label: 'Domains', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={peek.domain} placeholder="domain.com" onSave={value => updateCompany({ domain: value })} /> },
    { label: 'Name', icon: <Icon name="buildings" size={12} />, value: <EditablePeekInput value={peek.name} placeholder="Company name" onSave={value => updateCompany({ name: value || peek.name })} /> },
    { label: 'Description', icon: <Icon name="text-align-left" size={12} />, value: <EditablePeekInput value={peek.description} placeholder="Description" onSave={value => updateCompany({ description: value })} /> },
    { label: 'Team', icon: <Icon name="users" size={12} />, value: <button className="peek-rel-link" onClick={() => openPicker('team')}>{peek.people_full.length} people</button> },
    { label: 'Categories', icon: <Icon name="tag" size={12} />, value: <EditablePeekInput value={peek.sector} placeholder="Set categories..." onSave={value => updateCompany({ sector: value })} /> },
    { label: 'Primary location', icon: <Icon name="map-pin" size={12} />, value: <EditablePeekInput value={peek.primary_location ?? peek.hq_location} placeholder="Location" onSave={value => updateCompany({ primary_location: value, hq_location: value })} /> },
    { label: 'Website', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={peek.website_url} placeholder="https://..." onSave={value => updateCompany({ website_url: value })} /> },
    { label: 'LinkedIn', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={peek.linkedin_url} placeholder="LinkedIn URL" onSave={value => updateCompany({ linkedin_url: value })} /> },
    { label: 'AngelList', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={peek.angellist_url} placeholder="AngelList URL" onSave={value => updateCompany({ angellist_url: value })} /> },
    { label: 'Facebook', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={peek.facebook_url} placeholder="Facebook URL" onSave={value => updateCompany({ facebook_url: value })} /> },
    { label: 'Instagram', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={peek.instagram_url} placeholder="Instagram URL" onSave={value => updateCompany({ instagram_url: value })} /> },
    { label: 'Twitter', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={peek.twitter_url} placeholder="Twitter URL" onSave={value => updateCompany({ twitter_url: value })} /> },
  ] : []

  const sideSections = peek && !nested ? [
    {
      title: 'Associated deals',
      actionLabel: 'Add deal',
      onAction: () => openPicker('deal'),
      empty: 'Set a value...',
      items: peek.opportunities.map(deal => (
        <button className="peek-side-row" onClick={() => openNested({ type: 'deal', id: deal.id })}>
          <Avatar src={peek.logo_url} name={peek.name} sq size={18} />
          <span>{deal.title}</span>
        </button>
      )),
    },
  ] : []

  const companyOverview = peek && !nestedPerson && !nestedDeal ? (
    <>
      <div className="peek-block-label">Highlights</div>
      <div className="peek-hl-grid">
        {[
          { label: 'Connection strength', value: peek.people_full.length ? `${peek.people_full.length} inside` : 'No Connection', icon: <Icon name="heart" size={13} /> },
          { label: 'Next calendar interaction', value: 'Upgrade', icon: <Icon name="calendar-plus" size={13} /> },
          { label: 'Team', value: peek.people_full.length ? peek.people_full.slice(0, 2).map(person => person.name).join(', ') : 'No Team', icon: <Icon name="users" size={13} /> },
          { label: 'Estimated ARR', value: 'No Estimated ARR', icon: <Icon name="currency-dollar" size={13} /> },
          { label: 'Funding raised', value: 'No Funding raised', icon: <Icon name="coins" size={13} /> },
          { label: 'Employee range', value: peek.size || (peek.employees_count ? formatNumber(peek.employees_count) : 'No Employee range'), icon: <Icon name="user-plus" size={13} /> },
        ].map(field => (
          <div className="peek-hl" key={field.label}>
            <span className="hl-hd"><span>{field.label}</span>{field.icon}</span>
            <span className="hl-body">{field.value}</span>
          </div>
        ))}
      </div>
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {peek.name}'s attributes</span><span className="act-when">{formatAgo(peek.last_enriched_at || peek.created_at)}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Company</span><span className="act-when">{formatAgo(peek.created_at)}</span></div>
      </div>
    </>
  ) : null

  const teamTab = peek ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Team <span className="peek-count">{peek.people_full.length}</span><button className="peek-add-btn" onClick={() => openPicker('team')}><Icon name="pencil-simple" size={10} />Edit</button></div>
      {peek.people_full.length === 0 ? <p className="peek-empty-lists">No people associated yet.</p> : peek.people_full.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <Avatar src={person.profile_photo_url} name={person.name} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachPerson(person) }} aria-label={`Remove ${person.name} from ${peek.name}`}><Icon name="x" size={12} /></button>
            <Icon name="caret-right" size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null

  const dealsTab = peek ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Deals <span className="peek-count">{peek.opportunities.length}</span><button className="peek-add-btn" onClick={() => openPicker('deal')}><Icon name="plus" size={10} />Add Deal</button></div>
      {peek.opportunities.length === 0 ? <p className="peek-empty-lists">No deals associated yet.</p> : peek.opportunities.map(deal => (
        <button className="peek-rel-row" key={deal.id} onClick={() => openNested({ type: 'deal', id: deal.id })}>
          <Avatar src={peek.logo_url} name={peek.name} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.type}</span></span>
          <span className="peek-row-side">
            <Mono dim={deal.estimated_value == null}>{formatValue(deal.estimated_value)}</Mono>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachDeal(deal) }} aria-label={`Remove ${deal.title} from ${peek.name}`}><Icon name="x" size={12} /></button>
          </span>
        </button>
      ))}
    </div>
  ) : null

  const listsTab = peek ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{peek.list_memberships.length}</span><button className="peek-add-btn" onClick={() => openPicker('list')}><Icon name="plus" size={10} />Add to list</button></div>
      {peek.list_memberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : peek.list_memberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeCompanyFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  ) : null

  const nestedPersonDealsTab = nestedPerson ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated deals <span className="peek-count">{nestedPersonDeals.length}</span><button className="peek-add-btn" onClick={() => openPicker('personDeal')}><Icon name="plus" size={10} />Add deal</button></div>
      {nestedPersonDeals.length === 0 ? <p className="peek-empty-lists">No deals associated yet.</p> : nestedPersonDeals.map(deal => (
        <button className="peek-rel-row" key={deal.id} onClick={() => openNested({ type: 'deal', id: deal.id })}>
          <Avatar src={peek?.logo_url} name={peek?.name ?? deal.title} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.type}</span></span>
          <span className="peek-row-side">
            <Mono dim={deal.estimated_value == null}>{formatValue(deal.estimated_value)}</Mono>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachNestedPersonDeal(deal) }} aria-label={`Remove ${deal.title} from ${nestedPerson.name}`}><Icon name="x" size={12} /></button>
            <Icon name="caret-right" size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null

  const nestedPersonListsTab = nestedPerson ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedPersonListMemberships.length}</span><button className="peek-add-btn" onClick={() => openPicker('personList')}><Icon name="plus" size={10} />Add to list</button></div>
      {nestedPersonListMemberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedPersonListMemberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeNestedPersonFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  ) : null

  const nestedDealPeopleTab = nestedDeal ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated people <span className="peek-count">{nestedDealPeople.length}</span><button className="peek-add-btn" onClick={() => openPicker('dealPeople')}><Icon name="plus" size={10} />Add person</button></div>
      {nestedDealPeople.length === 0 ? <p className="peek-empty-lists">No stakeholders linked yet.</p> : nestedDealPeople.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <Avatar src={person.profile_photo_url} name={person.name} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachDealPerson(person) }} aria-label={`Remove ${person.name} from ${nestedDeal.title}`}><Icon name="x" size={12} /></button>
            <Icon name="caret-right" size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null

  const nestedDealListsTab = nestedDeal ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedDealListMemberships.length}</span><button className="peek-add-btn" onClick={() => openPicker('dealList')}><Icon name="plus" size={10} />Add to list</button></div>
      {nestedDealListMemberships.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedDealListMemberships.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeNestedDealFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  ) : null

  const nestedDealOverview = nestedDeal ? (
    <>
      <div className="peek-block-label">Highlights</div>
      <div className="peek-hl-grid">
        {[
          { label: 'Deal stage', value: <OpportunityStageProgress stage={nestedDeal.stage} />, icon: <Icon name="flag" size={13} /> },
          { label: 'Deal value', value: <Mono dim={nestedDeal.estimated_value == null}>{formatValue(nestedDeal.estimated_value)}</Mono>, icon: <Icon name="currency-dollar" size={13} /> },
          { label: 'Deal owner', value: nestedDealOwner?.name ?? 'No Deal owner', icon: <Icon name="user" size={13} /> },
          { label: 'Associated company', value: peek?.name || 'No Associated company', icon: <Icon name="buildings" size={13} /> },
          { label: 'Associated people', value: nestedDealPeople.length ? `${nestedDealPeople.length} people` : 'No Associated people', icon: <Icon name="users" size={13} /> },
          { label: 'Target date', value: formatTarget(nestedDeal.target_date), icon: <Icon name="calendar-blank" size={13} /> },
        ].map(field => (
          <div className="peek-hl" key={field.label}>
            <span className="hl-hd"><span>{field.label}</span>{field.icon}</span>
            <span className="hl-body">{field.value}</span>
          </div>
        ))}
      </div>
      <div className="peek-activity-head">
        <div className="peek-block-label spaced">Activity</div>
        <button className="peek-viewall">View all</button>
      </div>
      <div className="peek-activity-card">
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {nestedDeal.title}'s attributes</span><span className="act-when">{formatAgo(nestedDeal.created_at)}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Deal</span><span className="act-when">{formatAgo(nestedDeal.created_at)}</span></div>
      </div>
    </>
  ) : null

  const recordTabs = nestedPerson ? [
    { id: 'Overview', label: 'Overview', content: <div className="peek-rel-section"><div className="peek-block-label">Person context</div><p className="peek-objective">{nestedPerson.email || nestedPerson.linkedin_url || 'No profile detail captured yet.'}</p></div> },
    { id: 'Associated deals', label: 'Associated deals', count: nestedPersonDeals.length, content: nestedPersonDealsTab },
    { id: 'Lists', label: 'Lists', count: nestedPersonListMemberships.length, content: nestedPersonListsTab },
    { id: 'Activity', label: 'Activity', content: <div className="peek-docs-empty"><Icon name="pulse" size={16} /><span>No activity captured here yet.</span></div> },
  ] : nestedDeal ? [
    { id: 'Overview', label: 'Overview', content: nestedDealOverview },
    { id: 'Associated people', label: 'Associated people', count: nestedDealPeople.length, content: nestedDealPeopleTab },
    { id: 'Lists', label: 'Lists', count: nestedDealListMemberships.length, content: nestedDealListsTab },
  ] : [
    { id: 'Overview', label: 'Overview', content: companyOverview },
    { id: 'Deals', label: 'Deals', count: peek?.opportunities.length, content: dealsTab },
    { id: 'Activity', label: 'Activity', count: 0, content: <div className="peek-docs-empty"><Icon name="pulse" size={16} /><span>No activity captured yet.</span></div> },
    { id: 'Emails', label: 'Emails', count: 0, content: <div className="peek-docs-empty"><Icon name="envelope" size={16} /><span>No conversations synced yet.</span></div> },
    { id: 'Calls', label: 'Calls', count: 0, content: <div className="peek-docs-empty"><Icon name="phone" size={16} /><span>No calls captured yet.</span></div> },
    { id: 'Team', label: 'Team', count: peek?.people_full.length, content: teamTab },
    { id: 'Notes', label: 'Notes', count: peek?.notes ? 1 : 0, content: <div className="peek-rel-section"><EditablePeekInput value={peek?.notes} placeholder="Add notes..." onSave={value => updateCompany({ notes: value })} /></div> },
    { id: 'Tasks', label: 'Tasks', count: 0, content: <div className="peek-docs-empty"><Icon name="check-square" size={16} /><span>No tasks linked yet.</span></div> },
    { id: 'Files', label: 'Files', content: <div className="peek-docs-empty"><Icon name="paperclip" size={16} /><span>No files linked yet.</span></div> },
    { id: 'Lists', label: 'Lists', count: peek?.list_memberships.length, content: listsTab },
  ]

  return (
    <div className="ppl-page wide attio-records-page">
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Companies</h1>
          <p className="ppl-sub">The account is the unit. ICP sets the play, coverage shows who's inside, next step keeps it moving.</p>
        </div>
      </header>

      {showAdd && (
        <div className="crm-modal-bg" onClick={() => setShowAdd(false)}>
          <div className="crm-modal" onClick={event => event.stopPropagation()} role="dialog" aria-label="Create Company">
            <div className="crm-modal-hd">
              <span>Create Company</span>
              <button onClick={() => setShowAdd(false)} aria-label="Close">×</button>
            </div>
            <div className="crm-modal-body crm-create-record">
              <label className="crm-modal-label">Domains</label>
              <input className="crm-modal-input" value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Set Domains..." />
              <label className="crm-modal-label">Name <span>Required</span></label>
              <input className="crm-modal-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Set Name..." autoFocus onKeyDown={e => { if (e.key === 'Enter') void addCompany(); if (e.key === 'Escape') setShowAdd(false) }} />
              <label className="crm-modal-label">Description</label>
              <input className="crm-modal-input" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Set Description..." />
              <label className="crm-modal-label">Categories</label>
              <input className="crm-modal-input" value={newSector} onChange={e => setNewSector(e.target.value)} placeholder="Set Categories..." />
            </div>
            <div className="crm-modal-foot">
              <label className="crm-toggle"><input type="checkbox" checked={createMore} onChange={event => setCreateMore(event.target.checked)} /><span />Create more</label>
              <span className="crm-modal-grow" />
              <button className="crm-modal-secondary" onClick={() => setShowAdd(false)}>Cancel <kbd>esc</kbd></button>
              <button className="crm-modal-primary" disabled={saving || !newName.trim()} onClick={() => void addCompany()}>Create record <kbd>⌘↵</kbd></button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-shuttle">Loading...</div>
      ) : (
        <CrmTable
          entity="companies"
          title="Companies"
          viewName="All Companies"
          sortLabel="Stage"
          rows={rows}
          columns={columns}
          view={view}
          onViewChange={setView}
          views={views}
          addLabel="New Company"
          onAdd={() => setShowAdd(v => !v)}
          onRowClick={r => { setPeekId(r.id); resetNested() }}
          selectedId={peekId}
          storageKey="companies-abm"
          kanban={kanban}
        />
      )}

      <RecordPeek
        open={Boolean(peek)}
        title={activeRecordTitle}
        subtitle={activeRecordSubtitle}
        eyebrow={nested ? 'Record' : 'All Companies'}
        avatar={recordAvatar}
        fields={recordFields}
        tabs={recordTabs}
        sideSections={sideSections}
        listItems={!nested ? peek?.list_memberships.map(membership => (
          <span className="peek-tag" key={membership.id}>{membership.list?.icon ?? ''} {membership.list?.name ?? 'List'}</span>
        )) : []}
        onAddToList={!nested ? () => openPicker('list') : undefined}
        actions={(
          <>
            <button className="peek-primary" onClick={() => window.dispatchEvent(new CustomEvent('rethink:peek-notice', { detail: 'Composer is not connected yet' }))}><Icon name="envelope-simple" size={13} /> Compose email</button>
            {!nested && <button className="peek-primary" onClick={() => openPicker('list')}><Icon name="list-plus" size={13} /> Add to list</button>}
            <button className="peek-primary" aria-label="New note" onClick={() => window.dispatchEvent(new CustomEvent('rethink:peek-notice', { detail: 'Use the Notes tab to edit notes' }))}><Icon name="note-pencil" size={13} /> New note</button>
            <button className="peek-icn sq" aria-label="Copy record link" onClick={() => window.dispatchEvent(new CustomEvent('rethink:peek-notice', { detail: 'Record link is not connected yet' }))}><Icon name="link" size={13} /></button>
            <button className="peek-icn sq" aria-label="Create task" onClick={() => window.dispatchEvent(new CustomEvent('rethink:peek-notice', { detail: 'Tasks are not connected yet' }))}><Icon name="check-square" size={13} /></button>
          </>
        )}
        onClose={() => { setPeekId(null); resetNested() }}
        onBack={nested ? backNested : undefined}
        backLabel={nested ? `Back to ${nestedBackTarget}` : undefined}
        index={peekIndex >= 0 ? peekIndex : null}
        total={rows.length}
        onPrev={peekIndex > 0 ? () => { resetNested(); setPeekId(rows[peekIndex - 1].id) } : undefined}
        onNext={peekIndex >= 0 && peekIndex < rows.length - 1 ? () => { resetNested(); setPeekId(rows[peekIndex + 1].id) } : undefined}
      />

      {peek && picker && (
        <div className="crm-modal-bg" onClick={() => setPicker(null)}>
          <div className="crm-modal rel-picker" onClick={event => event.stopPropagation()}>
            <div className="crm-modal-hd">
              <span>{picker === 'list' || picker === 'personList' || picker === 'dealList' ? 'Add to list' : picker === 'team' || picker === 'dealPeople' ? 'Add team member' : 'Add deal'}</span>
              <button onClick={() => setPicker(null)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search"><Icon name="magnifying-glass" size={12} /><input autoFocus value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} placeholder="Search records..." /></div>
            <div className="rel-picker-list">
              {(picker === 'list' || picker === 'personList' || picker === 'dealList') && (() => {
                const options = lists
                .filter(list => {
                  if (picker === 'personList') return (list.parent_object ?? 'person') === 'person'
                  if (picker === 'dealList') return (list.parent_object ?? 'person') === 'opportunity'
                  return (list.parent_object ?? 'person') === 'company'
                })
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void (picker === 'personList' ? addNestedPersonToList(list) : picker === 'dealList' ? addNestedDealToList(list) : addCompanyToList(list))}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="list-plus" size={15} /><span>No available lists match.</span></div>
              })()}
              {(picker === 'team' || picker === 'dealPeople') && (() => {
                const options = contacts
                .filter(person => picker === 'team' ? person.company_id !== peek.id : !nestedDealLinks.some(link => link.outreach_log_id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(person => (
                  <button key={person.id} className="rel-picker-row" onClick={() => void (picker === 'team' ? attachPerson(person) : attachDealPerson(person))}>
                    <Avatar src={person.profile_photo_url} name={person.name} size={28} />
                    <span><strong>{person.name}</strong><em>{person.job_title || person.company || person.email || 'Person'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="user-plus" size={15} /><span>No available people match.</span></div>
              })()}
              {(picker === 'deal' || picker === 'personDeal') && (() => {
                const options = opportunities
                .filter(deal => picker === 'personDeal'
                  ? !nestedPersonDeals.some(existing => existing.id === deal.id)
                  : deal.company_id !== peek.id)
                .filter(deal => [deal.title, deal.stage, deal.type].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(deal => (
                  <button key={deal.id} className="rel-picker-row" onClick={() => void (picker === 'personDeal' ? attachNestedPersonDeal(deal) : attachDeal(deal))}>
                    <Avatar src={peek.logo_url} name={peek.name} sq size={28} />
                    <span><strong>{deal.title}</strong><em>{deal.stage} · {deal.type}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="target" size={15} /><span>No available deals match.</span></div>
              })()}
            </div>
            <div className="crm-pop-foot">
              <button onClick={() => void createRelatedRecord()}><Icon name="plus" size={11} /> Create new record{pickerQuery.trim() ? ` "${pickerQuery.trim()}"` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
