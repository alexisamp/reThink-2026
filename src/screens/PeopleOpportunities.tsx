import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOpportunities } from '@/hooks/useOpportunities'
import { addRecordToList } from '@/hooks/useLists'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import EditablePeekSelect from '@/components/crm/EditablePeekSelect'
import EditableCurrencyInput from '@/components/crm/EditableCurrencyInput'
import OpportunityStageChip, { OpportunityStageProgress } from '@/components/crm/OpportunityStageChip'
import {
  Icon, CompanyCell, AbmChip, FilterCell, CloserCell, NextStepCell, Mono,
  AccountStageChip, Avatar,
} from '@/components/crm/cells'
import { ICP_CFG } from '@/lib/crmConfig'
import { companyImage } from '@/lib/crmObjects'
import { formatCurrency } from '@/lib/formatters'
import {
  OPPORTUNITY_STAGE_OPTIONS,
  OPPORTUNITY_STAGE_CLOSER,
  opportunityStageLabel,
} from '@/lib/opportunityStages'
import type { Contact, List, Opportunity, OpportunityStage, OpportunityType, Company } from '@/types'

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

type OppContactLink = { id: string; opportunity_id: string; outreach_log_id: string; role: string | null }
type OppMembership = { id: string; list_id: string; opportunity_id?: string | null; company_id?: string | null; contact_id?: string | null; current_stage: string }
type NestedDealRecord = { type: 'person' | 'company'; id: string }

const TYPE_LABELS: Record<OpportunityType, string> = {
  job: 'Job', consulting: 'Consulting', business: 'Business', partnership: 'Partnership', other: 'Other',
}
const STAGES = OPPORTUNITY_STAGE_OPTIONS

function normIcp(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s === 'icp1' || s === 'icp2' || s === 'icp3') return s
  if (/\b1\b|seed|series\s*a/.test(s)) return 'icp1'
  if (/\b2\b|series\s*b|saas/.test(s)) return 'icp2'
  if (/\b3\b|network|b2b/.test(s)) return 'icp3'
  return null
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
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
function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

function AddOppForm({ companies, onSave, onCancel }: {
  companies: Company[]; onSave: (data: Partial<Opportunity>) => Promise<void>; onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<OpportunityType>('job')
  const [stage, setStage] = useState<OpportunityStage>('exploring')
  const [companyId, setCompanyId] = useState('')
  const [value, setValue] = useState('')
  const [createMore, setCreateMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), type, stage, company_id: companyId || null, estimated_value: value ? Number(value) : null })
    setTitle('')
    setType('job')
    setStage('exploring')
    setCompanyId('')
    setValue('')
    setSaving(false)
    if (!createMore) onCancel()
  }
  return (
    <div className="crm-modal-bg" onClick={onCancel}>
      <div className="crm-modal" onClick={event => event.stopPropagation()} role="dialog" aria-label="Create Deal">
        <div className="crm-modal-hd">
          <span>Create Deal</span>
          <button onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="crm-modal-body crm-create-record">
          <label className="crm-modal-label">Name <span>Required</span></label>
          <input className="crm-modal-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Set Name..." autoFocus onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onCancel() }} />
          <label className="crm-modal-label">Deal stage <span>Required</span></label>
          <select value={stage} onChange={e => setStage(e.target.value as OpportunityStage)} className="crm-modal-select">
            {STAGES.map(s => <option key={s} value={s}>{opportunityStageLabel(s)}</option>)}
          </select>
          <label className="crm-modal-label">Type</label>
          <select value={type} onChange={e => setType(e.target.value as OpportunityType)} className="crm-modal-select">
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="crm-modal-label">Associated company</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="crm-modal-select">
            <option value="">Set a value...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="crm-modal-label">Deal value</label>
          <input className="crm-modal-input" value={value} onChange={e => setValue(e.target.value)} placeholder="Set Deal value..." type="number" />
        </div>
        <div className="crm-modal-foot">
          <label className="crm-toggle"><input type="checkbox" checked={createMore} onChange={event => setCreateMore(event.target.checked)} /><span />Create more</label>
          <span className="crm-modal-grow" />
          <button className="crm-modal-secondary" onClick={onCancel}>Cancel <kbd>esc</kbd></button>
          <button className="crm-modal-primary" onClick={() => void save()} disabled={saving || !title.trim()}>Create record <kbd>⌘↵</kbd></button>
        </div>
      </div>
    </div>
  )
}

export default function PeopleOpportunities() {
  const { user } = useAuth()
  const { opportunities, loading, upsert, reload } = useOpportunities(user?.id ?? null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [links, setLinks] = useState<OppContactLink[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [memberships, setMemberships] = useState<Array<OppMembership & { list?: List | null }>>([])
  const [showAdd, setShowAdd] = useState(false)
  const [peekId, setPeekId] = useState<string | null>(null)
  const [picker, setPicker] = useState<null | 'people' | 'company' | 'list' | 'companyTeam' | 'companyDeal' | 'companyList' | 'personDeal' | 'personList'>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [nestedStack, setNestedStack] = useState<NestedDealRecord[]>([])

  useEffect(() => {
    if (!user) return
    void loadRelations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadRelations() {
    if (!user) return
    const [{ data: companyData }, { data: contactData }, { data: linkData }, { data: listData }, { data: membershipData }] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', user.id).order('name'),
      supabase.from('outreach_logs').select('*').eq('user_id', user.id).order('name'),
      supabase.from('opportunity_contacts').select('*'),
      supabase.from('lists').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at'),
      supabase.from('list_memberships').select('*').eq('user_id', user.id),
    ])
    const listById = new Map((listData ?? []).map(list => [list.id, list as List]))
    setCompanies(companyData ?? [])
    setContacts((contactData ?? []) as Contact[])
    setLinks((linkData ?? []) as OppContactLink[])
    setLists((listData ?? []) as List[])
    setMemberships(((membershipData ?? []) as OppMembership[]).map(membership => ({ ...membership, list: listById.get(membership.list_id) ?? null })))
  }

  const rows = opportunities
  const peek = rows.find(o => o.id === peekId) ?? null
  const peekIndex = peek ? rows.findIndex(o => o.id === peek.id) : -1
  const peekLinks = peek ? links.filter(link => link.opportunity_id === peek.id) : []
  const peekPeople = peekLinks.map(link => contacts.find(contact => contact.id === link.outreach_log_id)).filter(Boolean) as Contact[]
  const peekLists = peek ? memberships.filter(membership => membership.opportunity_id === peek.id) : []
  const nested = nestedStack[nestedStack.length - 1] ?? null
  const nestedPerson = nested?.type === 'person' ? contacts.find(contact => contact.id === nested.id) ?? null : null
  const nestedCompany = nested?.type === 'company' ? companies.find(company => company.id === nested.id) ?? null : null
  const nestedPersonCompany = nestedPerson
    ? (nestedPerson.company_id ? companies.find(company => company.id === nestedPerson.company_id) ?? null : companies.find(company => sameName(company.name, nestedPerson.company)))
    : null
  const nestedPersonLinks = nestedPerson ? links.filter(link => link.outreach_log_id === nestedPerson.id) : []
  const nestedPersonDeals = nestedPersonLinks.map(link => rows.find(opportunity => opportunity.id === link.opportunity_id)).filter(Boolean) as Opportunity[]
  const nestedPersonLists = nestedPerson ? memberships.filter(membership => membership.contact_id === nestedPerson.id) : []
  const nestedCompanyTeam = nestedCompany
    ? contacts.filter(contact => contact.company_id === nestedCompany.id || (!contact.company_id && sameName(contact.company, nestedCompany.name)))
    : []
  const nestedCompanyDeals = nestedCompany
    ? rows.filter(opportunity => opportunity.company_id === nestedCompany.id || opportunity.company?.id === nestedCompany.id)
    : []
  const nestedCompanyLists = nestedCompany ? memberships.filter(membership => membership.company_id === nestedCompany.id) : []
  const mark = (o: Opportunity) => (o.company?.name?.[0] ?? o.title[0] ?? '?').toUpperCase()
  const logo = (o: Opportunity) => companyImage(o.company?.logo_url, o.company?.domain ?? o.company?.website_url)
  const openNested = (record: NestedDealRecord) => {
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
    if (!previous) return peek?.title ?? 'deal'
    if (previous.type === 'person') return contacts.find(contact => contact.id === previous.id)?.name ?? 'person'
    return companies.find(company => company.id === previous.id)?.name ?? 'company'
  })()

  const columns: CrmColumn<Opportunity>[] = [
    { key: 'title', label: 'Opportunity', icon: <Icon name="target" size={12} />, width: '210px', locked: true, render: o => <span className="crm-name"><Avatar src={logo(o)} name={o.company?.name ?? o.title} sq /><span className="link">{o.title}</span></span> },
    { key: 'company', label: 'Company', icon: <Icon name="buildings" size={12} />, width: '160px', render: o => o.company ? <CompanyCell name={o.company.name} mark={mark(o)} src={o.company.logo_url} domain={o.company.domain ?? o.company.website_url} /> : <span className="crm-empty">—</span> },
    { key: 'icp', label: 'ICP', icon: <Icon name="crosshair" size={12} />, width: '120px', render: o => { const icp = normIcp(o.company?.icp); return icp ? <AbmChip cfg={ICP_CFG} value={icp} kind="icp" accent /> : <span className="crm-empty">—</span> } },
    { key: 'stage', label: 'Stage', icon: <Icon name="flag" size={12} />, width: '130px', render: o => <OpportunityStageChip stage={o.stage} /> },
    { key: 'value', label: 'Value', icon: <Icon name="currency-dollar" size={12} />, width: '92px', align: 'right', render: o => <Mono dim={o.estimated_value == null}>{formatValue(o.estimated_value)}</Mono> },
    { key: 'filter', label: 'Decision filter', icon: <Icon name="funnel" size={12} />, width: '108px', render: o => <FilterCell pass={o.decision_filter_pass ?? false} /> },
    { key: 'closer', label: 'CLOSER', icon: <Icon name="squares-four" size={12} />, width: '146px', render: o => <CloserCell score={OPPORTUNITY_STAGE_CLOSER[o.stage]} /> },
    { key: 'next', label: 'Next step', icon: <Icon name="arrow-bend-up-right" size={12} />, width: 'minmax(210px, 1fr)', render: o => <NextStepCell value={o.notes} /> },
    // available attributes
    { key: 'type', label: 'Type', icon: <Icon name="tag" size={12} />, width: '120px', defaultOff: true, render: o => <span className="crm-chip muted">{TYPE_LABELS[o.type]}</span> },
    { key: 'target', label: 'Target', icon: <Icon name="calendar-blank" size={12} />, width: '110px', align: 'right', defaultOff: true, render: o => <Mono dim>{formatTarget(o.target_date)}</Mono> },
  ]

  const handleSave = async (data: Partial<Opportunity>) => {
    if (!user) return
    await upsert({
      title: data.title ?? '', type: data.type ?? 'other', stage: data.stage ?? 'exploring',
      company_id: data.company_id ?? null, estimated_value: data.estimated_value ?? null,
      target_date: null, close_date: null, owner_contact_id: null, notes: null, decision_filter_pass: null,
      interview_prep: null, interview_map: null, negotiation_prep: null,
    })
  }

  const updateDeal = async (id: string, patch: Partial<Opportunity>) => {
    await supabase.from('opportunities').update(patch).eq('id', id)
    await reload()
  }

  const updatePerson = async (id: string, patch: Partial<Contact>) => {
    await supabase.from('outreach_logs').update(patch).eq('id', id)
    await loadRelations()
  }

  const updateCompany = async (id: string, patch: Partial<Company>) => {
    await supabase.from('companies').update(patch).eq('id', id)
    await loadRelations()
    await reload()
  }

  const attachPerson = async (person: Contact) => {
    if (!peek) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: peek.id,
      outreach_log_id: person.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setPicker(null)
    await loadRelations()
  }

  const attachCompany = async (company: Company) => {
    if (!peek) return
    await updateDeal(peek.id, { company_id: company.id })
    setPicker(null)
  }

  const detachCompany = async () => {
    if (!peek) return
    await updateDeal(peek.id, { company_id: null })
    resetNested()
  }

  const detachPerson = async (person: Contact) => {
    if (!peek) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', peek.id).eq('outreach_log_id', person.id)
    await loadRelations()
  }

  const addDealToList = async (list: List) => {
    if (!user || !peek) return
    if ((list.parent_object ?? 'person') !== 'opportunity') return
    await addRecordToList({ userId: user.id, list, recordId: peek.id })
    setPicker(null)
    await loadRelations()
  }

  const removeDealFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadRelations()
  }

  const attachPersonToCompany = async (person: Contact) => {
    if (!nestedCompany) return
    await supabase.from('outreach_logs').update({ company_id: nestedCompany.id, company: nestedCompany.name }).eq('id', person.id)
    setPicker(null)
    await loadRelations()
  }

  const detachPersonFromCompany = async (person: Contact) => {
    await supabase.from('outreach_logs').update({ company_id: null, company: null }).eq('id', person.id)
    await loadRelations()
  }

  const attachDealToCompany = async (deal: Opportunity) => {
    if (!nestedCompany) return
    await supabase.from('opportunities').update({ company_id: nestedCompany.id }).eq('id', deal.id)
    setPicker(null)
    await reload()
    await loadRelations()
  }

  const detachDealFromCompany = async (deal: Opportunity) => {
    await supabase.from('opportunities').update({ company_id: null }).eq('id', deal.id)
    setPicker(null)
    if (peek?.id === deal.id) resetNested()
    await reload()
    await loadRelations()
  }

  const addCompanyToList = async (list: List) => {
    if (!user || !nestedCompany) return
    if ((list.parent_object ?? 'person') !== 'company') return
    await addRecordToList({ userId: user.id, list, recordId: nestedCompany.id })
    setPicker(null)
    await loadRelations()
  }

  const removeCompanyFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadRelations()
  }

  const attachDealToPerson = async (deal: Opportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').upsert({
      opportunity_id: deal.id,
      outreach_log_id: nestedPerson.id,
      role: 'contact',
    }, { onConflict: 'opportunity_id,outreach_log_id' })
    setPicker(null)
    await loadRelations()
  }

  const detachDealFromPerson = async (deal: Opportunity) => {
    if (!nestedPerson) return
    await supabase.from('opportunity_contacts').delete().eq('opportunity_id', deal.id).eq('outreach_log_id', nestedPerson.id)
    setPicker(null)
    await loadRelations()
  }

  const addPersonToList = async (list: List) => {
    if (!user || !nestedPerson) return
    if ((list.parent_object ?? 'person') !== 'person') return
    await addRecordToList({ userId: user.id, list, recordId: nestedPerson.id })
    setPicker(null)
    await loadRelations()
  }

  const removePersonFromList = async (membershipId: string) => {
    await supabase.from('list_memberships').delete().eq('id', membershipId)
    await loadRelations()
  }

  const createRelatedRecord = async () => {
    if (!user || !peek || !picker) return
    const label = pickerQuery.trim()
    if (picker === 'list' || picker === 'companyList' || picker === 'personList') {
      const { data } = await supabase.from('lists').insert({
        user_id: user.id,
        name: label || `${picker === 'companyList' && nestedCompany ? nestedCompany.name : picker === 'personList' && nestedPerson ? nestedPerson.name : peek.title} list`,
        parent_object: picker === 'companyList' ? 'company' : picker === 'personList' ? 'person' : 'opportunity',
        purpose: null,
        stages: [],
        color: '#eef0ed',
        icon: picker === 'companyList' ? '🏢' : picker === 'personList' ? '👤' : '💼',
      }).select('*').single()
      if (data) {
        if (picker === 'companyList') await addCompanyToList(data as List)
        else if (picker === 'personList') await addPersonToList(data as List)
        else await addDealToList(data as List)
      }
      return
    }
    if (picker === 'company') {
      const { data } = await supabase.from('companies').insert({
        user_id: user.id,
        name: label || 'Untitled company',
      }).select('*').single()
      if (data) await attachCompany(data as Company)
      return
    }
    if (picker === 'companyDeal') {
      if (!nestedCompany) return
      const { data } = await supabase.from('opportunities').insert({
        user_id: user.id,
        title: label || `${nestedCompany.name} opportunity`,
        type: 'job',
        stage: 'exploring',
        company_id: nestedCompany.id,
      }).select('*, company:companies(*)').single()
      if (data) {
        await reload()
        await loadRelations()
      }
      setPicker(null)
      return
    }
    if (picker === 'personDeal') {
      if (!nestedPerson) return
      const { data } = await supabase.from('opportunities').insert({
        user_id: user.id,
        title: label || `${nestedPerson.name} opportunity`,
        type: 'job',
        stage: 'exploring',
        company_id: nestedPersonCompany?.id ?? null,
      }).select('*, company:companies(*)').single()
      if (data) {
        await supabase.from('opportunity_contacts').upsert({
          opportunity_id: data.id,
          outreach_log_id: nestedPerson.id,
          role: 'contact',
        }, { onConflict: 'opportunity_id,outreach_log_id' })
        await reload()
        await loadRelations()
      }
      setPicker(null)
      return
    }
    const { data } = await supabase.from('outreach_logs').insert({
      user_id: user.id,
      name: label || 'Untitled person',
      status: 'PROSPECT',
      log_date: new Date().toISOString().slice(0, 10),
      health_score: 1,
      links: [],
      company_id: picker === 'companyTeam' && nestedCompany ? nestedCompany.id : peek.company_id,
      company: picker === 'companyTeam' && nestedCompany ? nestedCompany.name : peek.company?.name ?? null,
    }).select('*').single()
    if (data) {
      if (picker === 'companyTeam') await attachPersonToCompany(data as Contact)
      else await attachPerson(data as Contact)
    }
  }

  const openPicker = (next: 'people' | 'company' | 'list' | 'companyTeam' | 'companyDeal' | 'companyList' | 'personDeal' | 'personList') => {
    setPickerQuery('')
    setPicker(next)
  }

  const recordTitle = nestedPerson?.name ?? nestedCompany?.name ?? peek?.title ?? ''
  const peekOwner = peek?.owner_contact_id ? contacts.find(contact => contact.id === peek.owner_contact_id) ?? null : null
  const recordSubtitle = nestedPerson
    ? [nestedPerson.job_title, nestedPersonCompany?.name ?? nestedPerson.company].filter(Boolean).join(' · ')
    : nestedCompany
    ? [nestedCompany.domain, nestedCompany.sector].filter(Boolean).join(' · ')
    : peek
    ? [peek.company?.name, TYPE_LABELS[peek.type]].filter(Boolean).join(' · ')
    : undefined
  const recordAvatar = nestedPerson
    ? <Avatar src={nestedPerson.profile_photo_url} name={nestedPerson.name} size={40} />
    : nestedCompany
    ? <Avatar src={nestedCompany.logo_url} name={nestedCompany.name} sq size={40} />
    : peek
    ? <Avatar src={logo(peek)} name={peek.company?.name ?? peek.title} sq size={40} />
    : undefined
  const recordFields = nestedPerson ? [
    { label: 'Name', icon: <Icon name="user" size={12} />, value: <EditablePeekInput value={nestedPerson.name} placeholder="Name" onSave={value => updatePerson(nestedPerson.id, { name: value || nestedPerson.name })} /> },
    { label: 'Email', icon: <Icon name="envelope" size={12} />, value: <EditablePeekInput type="email" value={nestedPerson.email} placeholder="email@company.com" onSave={value => updatePerson(nestedPerson.id, { email: value })} /> },
    { label: 'Company', icon: <Icon name="buildings" size={12} />, value: nestedPersonCompany ? <button className="peek-rel-link" onClick={() => openNested({ type: 'company', id: nestedPersonCompany.id })}>{nestedPersonCompany.name}</button> : nestedPerson.company || '—' },
    { label: 'Role', icon: <Icon name="briefcase" size={12} />, value: <EditablePeekInput value={nestedPerson.job_title} placeholder="Role" onSave={value => updatePerson(nestedPerson.id, { job_title: value })} /> },
    { label: 'Phone', icon: <Icon name="phone" size={12} />, value: <EditablePeekInput value={nestedPerson.phone} placeholder="Phone number" onSave={value => updatePerson(nestedPerson.id, { phone: value })} /> },
    { label: 'Primary location', icon: <Icon name="map-pin" size={12} />, value: <EditablePeekInput value={nestedPerson.location} placeholder="Location" onSave={value => updatePerson(nestedPerson.id, { location: value })} /> },
    { label: 'Description', icon: <Icon name="text-align-left" size={12} />, value: <EditablePeekInput value={nestedPerson.about} placeholder="Description" onSave={value => updatePerson(nestedPerson.id, { about: value })} /> },
    { label: 'Website', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={nestedPerson.website} placeholder="https://..." onSave={value => updatePerson(nestedPerson.id, { website: value })} /> },
    { label: 'LinkedIn', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.linkedin_url} placeholder="LinkedIn URL" onSave={value => updatePerson(nestedPerson.id, { linkedin_url: value })} /> },
    { label: 'AngelList', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.angellist_url} placeholder="AngelList URL" onSave={value => updatePerson(nestedPerson.id, { angellist_url: value })} /> },
    { label: 'Facebook', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.facebook_url} placeholder="Facebook URL" onSave={value => updatePerson(nestedPerson.id, { facebook_url: value })} /> },
    { label: 'Instagram', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.instagram_url} placeholder="Instagram URL" onSave={value => updatePerson(nestedPerson.id, { instagram_url: value })} /> },
    { label: 'Twitter', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedPerson.twitter_url} placeholder="Twitter URL" onSave={value => updatePerson(nestedPerson.id, { twitter_url: value })} /> },
  ] : nestedCompany ? [
    { label: 'Domains', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={nestedCompany.domain} placeholder="domain.com" onSave={value => updateCompany(nestedCompany.id, { domain: value })} /> },
    { label: 'Name', icon: <Icon name="buildings" size={12} />, value: <EditablePeekInput value={nestedCompany.name} placeholder="Company name" onSave={value => updateCompany(nestedCompany.id, { name: value || nestedCompany.name })} /> },
    { label: 'Description', icon: <Icon name="text-align-left" size={12} />, value: <EditablePeekInput value={nestedCompany.description} placeholder="Description" onSave={value => updateCompany(nestedCompany.id, { description: value })} /> },
    { label: 'Categories', icon: <Icon name="tag" size={12} />, value: <EditablePeekInput value={nestedCompany.sector} placeholder="Set categories..." onSave={value => updateCompany(nestedCompany.id, { sector: value })} /> },
    { label: 'Primary location', icon: <Icon name="map-pin" size={12} />, value: <EditablePeekInput value={nestedCompany.primary_location ?? nestedCompany.hq_location} placeholder="Location" onSave={value => updateCompany(nestedCompany.id, { primary_location: value, hq_location: value })} /> },
    { label: 'Website', icon: <Icon name="globe" size={12} />, value: <EditablePeekInput value={nestedCompany.website_url} placeholder="https://..." onSave={value => updateCompany(nestedCompany.id, { website_url: value })} /> },
    { label: 'LinkedIn', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedCompany.linkedin_url} placeholder="LinkedIn URL" onSave={value => updateCompany(nestedCompany.id, { linkedin_url: value })} /> },
    { label: 'AngelList', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedCompany.angellist_url} placeholder="AngelList URL" onSave={value => updateCompany(nestedCompany.id, { angellist_url: value })} /> },
    { label: 'Facebook', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedCompany.facebook_url} placeholder="Facebook URL" onSave={value => updateCompany(nestedCompany.id, { facebook_url: value })} /> },
    { label: 'Instagram', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedCompany.instagram_url} placeholder="Instagram URL" onSave={value => updateCompany(nestedCompany.id, { instagram_url: value })} /> },
    { label: 'Twitter', icon: <Icon name="link" size={12} />, value: <EditablePeekInput value={nestedCompany.twitter_url} placeholder="Twitter URL" onSave={value => updateCompany(nestedCompany.id, { twitter_url: value })} /> },
    { label: 'Associated deal', icon: <Icon name="target" size={12} />, value: <button className="peek-rel-link" onClick={resetNested}>{peek?.title ?? 'Deal'}</button> },
  ] : peek ? [
    { label: 'Name', icon: <Icon name="target" size={12} />, value: <EditablePeekInput value={peek.title} placeholder="Deal name" onSave={value => updateDeal(peek.id, { title: value || peek.title })} /> },
    { label: 'Deal stage', icon: <Icon name="flag" size={12} />, value: <EditablePeekSelect<OpportunityStage> value={peek.stage} options={STAGES.map(value => ({ value, label: opportunityStageLabel(value) }))} searchPlaceholder="Search or create stage..." showDot onSave={value => updateDeal(peek.id, { stage: value })} /> },
    { label: 'Deal owner', icon: <Icon name="user" size={12} />, value: <EditablePeekSelect<string> value={peek.owner_contact_id ?? ''} options={[{ value: '', label: 'Set owner...' }, ...contacts.map(contact => ({ value: contact.id, label: contact.name }))]} searchPlaceholder="Search people..." variant="relation" onSave={value => updateDeal(peek.id, { owner_contact_id: value || null })} /> },
    { label: 'Type', icon: <Icon name="tag" size={12} />, value: <EditablePeekSelect<OpportunityType> value={peek.type} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value: value as OpportunityType, label }))} onSave={value => updateDeal(peek.id, { type: value })} /> },
    { label: 'Deal value', icon: <Icon name="currency-dollar" size={12} />, value: <EditableCurrencyInput value={peek.estimated_value} onSave={value => updateDeal(peek.id, { estimated_value: value })} /> },
    { label: 'Associated company', icon: <Icon name="buildings" size={12} />, value: <button className="peek-rel-link" onClick={() => peek.company_id ? openNested({ type: 'company', id: peek.company_id }) : openPicker('company')}>{peek.company?.name || 'Set company'}</button> },
    { label: 'Associated people', icon: <Icon name="users" size={12} />, value: <button className="peek-rel-link" onClick={() => openPicker('people')}>{peekPeople.length} people</button> },
    { label: 'Target date', icon: <Icon name="calendar-blank" size={12} />, value: <EditablePeekInput type="date" value={peek.target_date} onSave={value => updateDeal(peek.id, { target_date: value })} /> },
    { label: 'Close date', icon: <Icon name="calendar-blank" size={12} />, value: <EditablePeekInput type="date" value={peek.close_date} onSave={value => updateDeal(peek.id, { close_date: value })} /> },
  ] : []

  const sideSections = peek && !nested ? [
    {
      title: 'Associated people',
      actionLabel: 'Add person',
      onAction: () => openPicker('people'),
      empty: 'Set a value...',
      items: peekPeople.map(person => (
        <button className="peek-side-row" onClick={() => openNested({ type: 'person', id: person.id })}>
          <Avatar src={person.profile_photo_url} name={person.name} size={18} />
          <span>{person.name}</span>
        </button>
      )),
    },
  ] : []

  const peopleTab = (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated people <span className="peek-count">{peekPeople.length}</span><button className="peek-add-btn" onClick={() => openPicker('people')}><Icon name="plus" size={10} />Add person</button></div>
      {peekPeople.length === 0 ? <p className="peek-empty-lists">No people associated yet.</p> : peekPeople.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <Avatar src={person.profile_photo_url} name={person.name} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachPerson(person) }} aria-label={`Remove ${person.name} from deal`}><Icon name="x" size={12} /></button>
            <Icon name="caret-right" size={12} />
          </span>
        </button>
      ))}
    </div>
  )

  const listTab = (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{peekLists.length}</span><button className="peek-add-btn" onClick={() => openPicker('list')}><Icon name="plus" size={10} />Add to list</button></div>
      {peekLists.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : peekLists.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removeDealFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  )

  const dealOverview = peek ? (
    <>
      <div className="peek-block-label">Highlights</div>
      <div className="peek-hl-grid">
        {[
          { label: 'Deal stage', value: <OpportunityStageProgress stage={peek.stage} />, icon: <Icon name="flag" size={13} /> },
          { label: 'Deal value', value: <Mono dim={peek.estimated_value == null}>{formatValue(peek.estimated_value)}</Mono>, icon: <Icon name="currency-dollar" size={13} /> },
          { label: 'Deal owner', value: peekOwner?.name ?? 'No Deal owner', icon: <Icon name="user" size={13} /> },
          { label: 'Associated company', value: peek.company?.name || 'No Associated company', icon: <Icon name="buildings" size={13} /> },
          { label: 'Associated people', value: peekPeople.length ? `${peekPeople.length} people` : 'No Associated people', icon: <Icon name="users" size={13} /> },
          { label: 'Target date', value: formatTarget(peek.target_date), icon: <Icon name="calendar-blank" size={13} /> },
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
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> changed {peek.title}'s attributes</span><span className="act-when">{formatAgo(peek.created_at)}</span></div>
        <div className="peek-act-row"><span className="dot" /><span className="act-txt"><strong>You</strong> created Deal</span><span className="act-when">{formatAgo(peek.created_at)}</span></div>
      </div>
    </>
  ) : null

  const nestedCompanyTeamTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Team <span className="peek-count">{nestedCompanyTeam.length}</span><button className="peek-add-btn" onClick={() => openPicker('companyTeam')}><Icon name="plus" size={10} />Add person</button></div>
      {nestedCompanyTeam.length === 0 ? <p className="peek-empty-lists">No people associated yet.</p> : nestedCompanyTeam.map(person => (
        <button className="peek-rel-row" key={person.id} onClick={() => openNested({ type: 'person', id: person.id })}>
          <Avatar src={person.profile_photo_url} name={person.name} size={28} />
          <span className="peek-rel-main"><strong>{person.name}</strong><span>{person.job_title || person.email || 'Person'}</span></span>
          <span className="peek-row-side">
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachPersonFromCompany(person) }} aria-label={`Remove ${person.name} from ${nestedCompany.name}`}><Icon name="x" size={12} /></button>
            <Icon name="caret-right" size={12} />
          </span>
        </button>
      ))}
    </div>
  ) : null

  const nestedCompanyDealsTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Associated deals <span className="peek-count">{nestedCompanyDeals.length}</span><button className="peek-add-btn" onClick={() => openPicker('companyDeal')}><Icon name="plus" size={10} />Add deal</button></div>
      {nestedCompanyDeals.length === 0 ? <p className="peek-empty-lists">No deals associated yet.</p> : nestedCompanyDeals.map(deal => (
        <button className="peek-rel-row" key={deal.id} onClick={() => { setPeekId(deal.id); resetNested() }}>
          <Avatar src={nestedCompany.logo_url} name={nestedCompany.name} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.type}</span></span>
          <span className="peek-row-side">
            <Mono dim={deal.estimated_value == null}>{formatValue(deal.estimated_value)}</Mono>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachDealFromCompany(deal) }} aria-label={`Remove ${deal.title} from ${nestedCompany.name}`}><Icon name="x" size={12} /></button>
          </span>
        </button>
      ))}
    </div>
  ) : null

  const nestedCompanyListsTab = nestedCompany ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedCompanyLists.length}</span><button className="peek-add-btn" onClick={() => openPicker('companyList')}><Icon name="plus" size={10} />Add to list</button></div>
      {nestedCompanyLists.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedCompanyLists.map(membership => (
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
        <button className="peek-rel-row" key={deal.id} onClick={() => { setPeekId(deal.id); resetNested() }}>
          <Avatar src={deal.company?.logo_url ?? nestedPersonCompany?.logo_url} name={deal.company?.name ?? nestedPersonCompany?.name ?? deal.title} sq size={28} />
          <span className="peek-rel-main"><strong>{deal.title}</strong><span>{deal.stage} · {deal.company?.name ?? 'No company'}</span></span>
          <span className="peek-row-side">
            <Mono dim={deal.estimated_value == null}>{formatValue(deal.estimated_value)}</Mono>
            <button className="peek-trash" onClick={event => { event.stopPropagation(); void detachDealFromPerson(deal) }} aria-label={`Remove ${deal.title} from ${nestedPerson.name}`}><Icon name="x" size={12} /></button>
          </span>
        </button>
      ))}
    </div>
  ) : null

  const nestedPersonListsTab = nestedPerson ? (
    <div className="peek-rel-section">
      <div className="peek-block-label">Lists <span className="peek-count">{nestedPersonLists.length}</span><button className="peek-add-btn" onClick={() => openPicker('personList')}><Icon name="plus" size={10} />Add to list</button></div>
      {nestedPersonLists.length === 0 ? <p className="peek-empty-lists">Not in any list yet.</p> : nestedPersonLists.map(membership => (
        <div className="peek-rel-row" key={membership.id}>
          <span className="peek-list-icon" style={{ background: membership.list?.color ?? '#eef0ed' }}>{membership.list?.icon ?? '•'}</span>
          <span className="peek-rel-main"><strong>{membership.list?.name ?? 'List'}</strong><span>{membership.current_stage}</span></span>
          <button className="peek-trash" onClick={() => void removePersonFromList(membership.id)} aria-label={`Remove from ${membership.list?.name ?? 'list'}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  ) : null

  const recordTabs = nestedPerson ? [
    { id: 'Overview', label: 'Overview', content: <div className="peek-rel-section"><div className="peek-block-label">Person context</div><p className="peek-objective">{nestedPerson.about || nestedPerson.notes || 'No profile detail captured yet.'}</p></div> },
    { id: 'Associated deals', label: 'Associated deals', count: nestedPersonDeals.length, content: nestedPersonDealsTab },
    { id: 'Lists', label: 'Lists', count: nestedPersonLists.length, content: nestedPersonListsTab },
    { id: 'Activity', label: 'Activity', content: <div className="peek-docs-empty"><Icon name="pulse" size={16} /><span>No activity captured yet.</span></div> },
  ] : nestedCompany ? [
    { id: 'Overview', label: 'Overview', content: <div className="peek-rel-section"><div className="peek-block-label">Company context <button className="peek-add-btn" onClick={() => void detachCompany()}><Icon name="x" size={10} />Remove from deal</button></div><p className="peek-objective">{nestedCompany.description || nestedCompany.notes || 'No company detail captured yet.'}</p></div> },
    { id: 'Team', label: 'Team', count: nestedCompanyTeam.length, content: nestedCompanyTeamTab },
    { id: 'Associated deals', label: 'Associated deals', count: nestedCompanyDeals.length, content: nestedCompanyDealsTab },
    { id: 'Lists', label: 'Lists', count: nestedCompanyLists.length, content: nestedCompanyListsTab },
  ] : [
    { id: 'Overview', label: 'Overview', content: dealOverview },
    { id: 'Associated people', label: 'Associated people', count: peekPeople.length, content: peopleTab },
    { id: 'Activity', label: 'Activity', count: 0, content: <div className="peek-docs-empty"><Icon name="pulse" size={16} /><span>No activity captured yet.</span></div> },
    { id: 'Emails', label: 'Emails', count: 0, content: <div className="peek-docs-empty"><Icon name="envelope" size={16} /><span>No conversations synced yet.</span></div> },
    { id: 'Notes', label: 'Notes', count: peek?.notes ? 1 : 0, content: <div className="peek-rel-section"><EditablePeekInput value={peek?.notes} placeholder="Add notes..." onSave={value => { if (peek) return updateDeal(peek.id, { notes: value }) }} /></div> },
    { id: 'Lists', label: 'Lists', count: peekLists.length, content: listTab },
  ]

  return (
    <div className="ppl-page attio-records-page">
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Opportunities</h1>
          <p className="ppl-sub">Each one is a network of stakeholders, not a pipeline row. Who's in, who's missing, what's the gap.</p>
        </div>
      </header>

      {showAdd && <AddOppForm companies={companies} onSave={handleSave} onCancel={() => setShowAdd(false)} />}

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-shuttle text-sm">Loading...</div>
      ) : (
        <CrmTable
          entity="opportunities"
          title="Deals"
          viewName="All Deals"
          sortLabel="Stage"
          rows={rows}
          columns={columns}
          addLabel="New Deal"
          onAdd={() => setShowAdd(v => !v)}
          onRowClick={o => { setPeekId(o.id); resetNested() }}
          selectedId={peekId}
          storageKey="opportunities-abm"
        />
      )}

      <RecordPeek
        open={Boolean(peek)}
        title={recordTitle}
        subtitle={recordSubtitle}
        eyebrow="All Deals"
        avatar={recordAvatar}
        fields={recordFields}
        tabs={recordTabs}
        sideSections={sideSections}
        listItems={!nested ? peekLists.map(membership => (
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
              <span>{picker === 'people' || picker === 'companyTeam' ? 'Associate people' : picker === 'company' ? 'Associate company' : picker === 'companyDeal' || picker === 'personDeal' ? 'Associate deal' : 'Add to list'}</span>
              <button onClick={() => setPicker(null)} aria-label="Close">×</button>
            </div>
            <div className="crm-pop-search"><Icon name="magnifying-glass" size={12} /><input autoFocus value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} placeholder="Search records..." /></div>
            <div className="rel-picker-list">
              {(picker === 'people' || picker === 'companyTeam') && (() => {
                const options = contacts
                .filter(person => picker === 'companyTeam'
                  ? !nestedCompanyTeam.some(existing => existing.id === person.id)
                  : !peekLinks.some(link => link.outreach_log_id === person.id))
                .filter(person => [person.name, person.job_title, person.company, person.email].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(person => (
                  <button key={person.id} className="rel-picker-row" onClick={() => void (picker === 'companyTeam' ? attachPersonToCompany(person) : attachPerson(person))}>
                    <Avatar src={person.profile_photo_url} name={person.name} size={28} />
                    <span><strong>{person.name}</strong><em>{person.job_title || person.company || person.email || 'Person'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="user-plus" size={15} /><span>No available people match.</span></div>
              })()}
              {picker === 'company' && (() => {
                const options = companies
                .filter(company => [company.name, company.domain, company.website_url, company.sector].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(company => (
                  <button key={company.id} className="rel-picker-row" onClick={() => void attachCompany(company)}>
                    <Avatar src={company.logo_url} name={company.name} sq size={28} />
                    <span><strong>{company.name}</strong><em>{company.domain || company.website_url || company.sector || 'Company'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="buildings" size={15} /><span>No companies match.</span></div>
              })()}
              {(picker === 'companyDeal' || picker === 'personDeal') && (() => {
                const options = rows
                .filter(deal => picker === 'personDeal'
                  ? !nestedPersonDeals.some(existing => existing.id === deal.id)
                  : !nestedCompanyDeals.some(existing => existing.id === deal.id))
                .filter(deal => [deal.title, deal.stage, deal.type, deal.company?.name].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(deal => (
                  <button key={deal.id} className="rel-picker-row" onClick={() => void (picker === 'personDeal' ? attachDealToPerson(deal) : attachDealToCompany(deal))}>
                    <Avatar src={deal.company?.logo_url ?? nestedCompany?.logo_url ?? nestedPersonCompany?.logo_url} name={deal.company?.name ?? nestedCompany?.name ?? nestedPersonCompany?.name ?? deal.title} sq size={28} />
                    <span><strong>{deal.title}</strong><em>{deal.company?.name || deal.stage || 'Deal'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="target" size={15} /><span>No available deals match.</span></div>
              })()}
              {(picker === 'list' || picker === 'companyList' || picker === 'personList') && (() => {
                const options = lists
                .filter(list => picker === 'companyList'
                  ? (list.parent_object ?? 'person') === 'company'
                  : picker === 'personList'
                  ? (list.parent_object ?? 'person') === 'person'
                  : (list.parent_object ?? 'person') === 'opportunity')
                .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(pickerQuery.toLowerCase()))
                return options.length ? options.map(list => (
                  <button key={list.id} className="rel-picker-row" onClick={() => void (picker === 'companyList' ? addCompanyToList(list) : picker === 'personList' ? addPersonToList(list) : addDealToList(list))}>
                    <span className="peek-list-icon" style={{ background: list.color ?? '#eef0ed' }}>{list.icon ?? '•'}</span>
                    <span><strong>{list.name}</strong><em>{list.purpose || 'List'}</em></span>
                  </button>
                )) : <div className="rel-picker-empty"><Icon name="list-plus" size={15} /><span>No available lists match.</span></div>
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
