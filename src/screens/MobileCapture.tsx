import { useEffect, useMemo, useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import {
  ArrowClockwise,
  Briefcase,
  Buildings,
  Check,
  Link as LinkIcon,
  MagnifyingGlass,
  Newspaper,
  Plus,
  User as UserIcon,
  WarningCircle,
} from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Company, Contact, List, Opportunity } from '@/types'

type CaptureIntent = 'person' | 'company' | 'news' | 'deal'
type TargetType = 'person' | 'company' | 'opportunity'
type SaveMode = 'link' | 'create'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  user: User
}

interface PersonOption {
  id: string
  name: string
  company: string | null
  job_title: string | null
  linkedin_url: string | null
  profile_photo_url?: string | null
}

interface SaveResult {
  ok: boolean
  message: string
}

const INTENTS: Array<{ id: CaptureIntent; label: string; icon: ElementType }> = [
  { id: 'person', label: 'Person', icon: UserIcon },
  { id: 'company', label: 'Company', icon: Buildings },
  { id: 'news', label: 'News/Post', icon: Newspaper },
  { id: 'deal', label: 'Deal', icon: Briefcase },
]

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function safeUrl(value: string | null) {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function cleanText(value: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function domainFromUrl(value: string | null) {
  const parsed = safeUrl(value)
  return parsed?.hostname.replace(/^www\./, '') ?? null
}

function normalizeDomain(value: string | null) {
  const domain = domainFromUrl(value)
  if (!domain || domain.includes('linkedin.com')) return null
  return domain
}

function normalizeCaptureUrlInput(value: string) {
  const trimmed = cleanText(value)
  if (!trimmed) return ''
  if (safeUrl(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

function inferIntent(url: string | null, explicit: string | null): CaptureIntent {
  if (explicit === 'person' || explicit === 'company' || explicit === 'news' || explicit === 'deal') return explicit
  const parsed = safeUrl(url)
  const path = parsed?.pathname ?? ''
  if (/\/in\/[^/]+/i.test(path)) return 'person'
  if (/\/(?:company|school|showcase)\/[^/]+/i.test(path)) return 'company'
  if (/\/jobs\/|\/job\//i.test(path)) return 'deal'
  return 'news'
}

function linkedinProfileUrl(url: string | null) {
  const parsed = safeUrl(url)
  if (!parsed || !parsed.hostname.includes('linkedin.com')) return null
  const match = parsed.pathname.match(/\/in\/([^/?#]+)/i)
  return match ? `https://www.linkedin.com/in/${match[1]}` : null
}

function linkedinCompanyUrl(url: string | null) {
  const parsed = safeUrl(url)
  if (!parsed || !parsed.hostname.includes('linkedin.com')) return null
  const match = parsed.pathname.match(/\/(?:company|school|showcase)\/([^/?#]+)/i)
  return match ? `https://www.linkedin.com/company/${match[1]}` : null
}

function titleFromUrl(url: string | null) {
  const parsed = safeUrl(url)
  if (!parsed) return ''
  const last = parsed.pathname.split('/').filter(Boolean).pop()
  return last ? decodeURIComponent(last).replace(/[-_]+/g, ' ') : parsed.hostname.replace(/^www\./, '')
}

function guessName(title: string, url: string | null) {
  const cleaned = cleanText(title)
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*-\s*LinkedIn.*$/i, '')
    .replace(/\s*on LinkedIn.*$/i, '')
  return cleaned || titleFromUrl(url) || ''
}

function sourceBody(input: { title: string; url: string | null; text: string; note: string; relationship: string }) {
  const lines = [
    input.title ? `Title: ${input.title}` : null,
    input.url ? `URL: ${input.url}` : null,
    input.text ? `Shared text: ${input.text}` : null,
    input.note ? `Note: ${input.note}` : null,
    `Relationship: ${input.relationship}`,
  ].filter(Boolean)
  return lines.join('\n')
}

function appendSourceNote(existing: string | null | undefined, source: string) {
  const prefix = existing?.trim() ? `${existing.trim()}\n\n` : ''
  return `${prefix}${source}`
}

function firstStage(list: List | null) {
  return list?.stages?.[0]?.key ?? 'captured'
}

function companyLabel(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') return value.name
  return null
}

function filtered<T extends { name?: string; title?: string; company?: unknown }>(items: T[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items.slice(0, 12)
  return items.filter(item => [item.name, item.title, companyLabel(item.company)].some(v => v?.toLowerCase().includes(q))).slice(0, 12)
}

function objectLabel(type: CaptureIntent | TargetType) {
  if (type === 'company') return 'Company'
  if (type === 'deal' || type === 'opportunity') return 'Deal'
  if (type === 'news') return 'Post'
  return 'Person'
}

function ObjectGlyph({ type }: { type: CaptureIntent | TargetType | 'list' | 'source' }) {
  const Icon = type === 'company'
    ? Buildings
    : type === 'deal' || type === 'opportunity'
      ? Briefcase
      : type === 'news' || type === 'source'
        ? Newspaper
        : type === 'list'
          ? LinkIcon
          : UserIcon
  return (
    <span className={`mc-glyph ${type}`}>
      <Icon size={13} weight={type === 'company' || type === 'deal' || type === 'opportunity' ? 'fill' : 'regular'} />
    </span>
  )
}

function FieldRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="mc-field-row">
      <span className="mc-field-label"><i>{icon}</i>{label}</span>
      <div className="mc-field-value">{children}</div>
    </div>
  )
}

export default function MobileCapture({ user }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const url = cleanText(params.get('url') || params.get('link'))
  const title = cleanText(params.get('title') || params.get('name')) || guessName(params.get('text') ?? '', url)
  const text = cleanText(params.get('text') || params.get('description'))
  const source = cleanText(params.get('source')) || 'mobile'
  const explicitIntent = params.get('intent')
  const initialIntent = inferIntent(url, explicitIntent)
  const hasCaptureSource = Boolean(url || title || text)

  const [intent, setIntent] = useState<CaptureIntent>(initialIntent)
  const [targetType, setTargetType] = useState<TargetType>(initialIntent === 'deal' ? 'opportunity' : initialIntent === 'company' ? 'company' : 'person')
  const [mode, setMode] = useState<SaveMode>('link')
  const [typeConfirmed, setTypeConfirmed] = useState(Boolean(explicitIntent))
  const [manualUrl, setManualUrl] = useState(url)
  const [query, setQuery] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('')
  const [createName, setCreateName] = useState(guessName(title, url))
  const [createCompanyName, setCreateCompanyName] = useState(guessName(title, url))
  const [createDealTitle, setCreateDealTitle] = useState(guessName(title, url) || 'Captured opportunity')
  const [note, setNote] = useState('')
  const [relationship, setRelationship] = useState(initialIntent === 'news' ? 'about' : 'source_for')
  const [selectedListId, setSelectedListId] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [message, setMessage] = useState('')

  const [people, setPeople] = useState<PersonOption[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)

  const selectedList = lists.find(list => list.id === selectedListId) ?? null
  const sourceDomain = domainFromUrl(url)
  const linkedinPerson = linkedinProfileUrl(url)
  const linkedinCompany = linkedinCompanyUrl(url)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [peopleRes, companyRes, oppRes, listRes] = await Promise.all([
        supabase
          .from('outreach_logs')
          .select('id, name, company, job_title, linkedin_url, profile_photo_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('companies').select('*').eq('user_id', user.id).order('name'),
        supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('lists').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at'),
      ])
      if (cancelled) return
      setPeople((peopleRes.data ?? []) as PersonOption[])
      setCompanies((companyRes.data ?? []) as Company[])
      setOpportunities((oppRes.data ?? []) as Opportunity[])
      setLists((listRes.data ?? []) as List[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user.id])

  useEffect(() => {
    if (intent === 'person') { setTargetType('person'); setMode('link') }
    if (intent === 'company') { setTargetType('company'); setMode('link') }
    if (intent === 'deal') { setTargetType('opportunity'); setMode('link') }
    if (intent === 'news') { setMode('link') }
    setQuery('')
    setSelectedPersonId('')
    setSelectedCompanyId('')
    setSelectedOpportunityId('')
    setMessage('')
    setStatus('idle')
  }, [intent])

  function handleManualPreview(event?: { preventDefault: () => void }) {
    event?.preventDefault()
    const normalized = normalizeCaptureUrlInput(manualUrl)
    if (!safeUrl(normalized)) {
      setStatus('error')
      setMessage('Paste a valid URL first.')
      return
    }
    const nextParams = new URLSearchParams({ url: normalized, source: 'manual' })
    window.location.replace(`/capture?${nextParams.toString()}`)
  }

  function chooseIntent(nextIntent: CaptureIntent) {
    setIntent(nextIntent)
    setTypeConfirmed(true)
  }

  const personMatches = filtered(people, query)
  const companyMatches = filtered(companies, query)
  const opportunityMatches = filtered(opportunities, query)

  async function addToList(record: { type: TargetType; id: string }) {
    if (!selectedListId) return { ok: true }
    const payload = {
      user_id: user.id,
      list_id: selectedListId,
      current_stage: firstStage(selectedList),
      notes: note || null,
      attributes: {
        source: 'mobile_capture',
        source_url: url || null,
        source_title: title || null,
      },
      contact_id: record.type === 'person' ? record.id : null,
      company_id: record.type === 'company' ? record.id : null,
      opportunity_id: record.type === 'opportunity' ? record.id : null,
    }
    const { error } = await supabase.from('list_memberships').insert(payload)
    if (error && error.code !== '23505') return { ok: false, error: error.message }
    return { ok: true }
  }

  async function createReviewItem(reason: string, target?: { type: TargetType; id: string | null }) {
    const { error } = await supabase.from('review_items').insert({
      user_id: user.id,
      source: 'manual',
      source_external_id: url || null,
      source_url: url || null,
      title: title || 'Mobile capture',
      body: sourceBody({ title, url, text, note: reason || note, relationship }),
      proposed_target: 'contact_fact',
      proposed_payload: {
        capture_intent: intent,
        capture_source: source,
        relationship_type: relationship,
        target_type: target?.type ?? targetType,
        target_id: target?.id ?? null,
        note,
        text,
        url,
      },
      contact_id: target?.type === 'person' ? target.id : null,
      status: 'pending',
    })
    return error ? { ok: false, message: error.message } : { ok: true, message: 'Sent to review.' }
  }

  async function savePersonSignal(contactId: string) {
    const value = sourceBody({ title, url, text, note, relationship })
    const { error } = await supabase.from('contact_facts').insert({
      user_id: user.id,
      contact_id: contactId,
      category: 'career_intel',
      label: relationship === 'authored_by' ? 'Shared post' : relationship === 'about' ? 'News/post' : 'Mobile capture',
      value,
      importance: 2,
      source: 'import',
    })
    return error ? { ok: false, message: error.message } : { ok: true, message: 'Saved as person signal.' }
  }

  async function savePerson(): Promise<SaveResult> {
    const contactId = mode === 'link' ? selectedPersonId : ''
    let targetId = contactId
    if (mode === 'create') {
      if (!createName.trim()) return { ok: false, message: 'Add a name before saving.' }
      const { data, error } = await supabase.from('outreach_logs').insert({
        user_id: user.id,
        name: createName.trim(),
        linkedin_url: linkedinPerson,
        status: 'PROSPECT',
        log_date: localDate(),
        health_score: 1,
        notes: note || null,
        website: !linkedinPerson ? url || null : null,
        links: url ? [{ url, label: title || sourceDomain || 'Mobile capture', type: intent === 'news' ? 'post' : 'source', created_at: new Date().toISOString() }] : [],
      }).select('*').single()
      if (error || !data) return { ok: false, message: error?.message ?? 'Could not create person.' }
      targetId = (data as Contact).id
    }
    if (!targetId) return { ok: false, message: 'Choose a person before saving.' }
    if (linkedinPerson) {
      await supabase.from('outreach_logs').update({ linkedin_url: linkedinPerson }).eq('id', targetId).eq('user_id', user.id)
    }
    const listResult = await addToList({ type: 'person', id: targetId })
    if (!listResult.ok) {
      await createReviewItem(`List membership failed: ${listResult.error}`, { type: 'person', id: targetId })
      return { ok: true, message: 'Saved person. List step was sent to review.' }
    }
    if (intent === 'news' || !linkedinPerson) {
      const signal = await savePersonSignal(targetId)
      if (!signal.ok) {
        await createReviewItem(`Person signal failed: ${signal.message}`, { type: 'person', id: targetId })
        return { ok: true, message: 'Saved person. Signal was sent to review.' }
      }
    }
    return { ok: true, message: mode === 'create' ? 'Person created.' : 'Capture linked to person.' }
  }

  async function saveCompany(): Promise<SaveResult> {
    let targetId = mode === 'link' ? selectedCompanyId : ''
    const sourceNote = sourceBody({ title, url, text, note, relationship })
    if (mode === 'create') {
      if (!createCompanyName.trim()) return { ok: false, message: 'Add a company name before saving.' }
      const { data, error } = await supabase.from('companies').insert({
        user_id: user.id,
        name: createCompanyName.trim(),
        domain: normalizeDomain(url),
        website_url: linkedinCompany ? null : url || null,
        linkedin_url: linkedinCompany,
        notes: sourceNote,
        source: source === 'ios_shortcut' ? 'ios shortcut' : source,
      }).select('*').single()
      if (error || !data) return { ok: false, message: error?.message ?? 'Could not create company.' }
      targetId = (data as Company).id
    } else {
      const company = companies.find(c => c.id === selectedCompanyId)
      if (!company) return { ok: false, message: 'Choose a company before saving.' }
      await supabase.from('companies').update({
        linkedin_url: company.linkedin_url ?? linkedinCompany,
        website_url: company.website_url ?? (!linkedinCompany ? url || null : null),
        domain: company.domain ?? normalizeDomain(url),
        notes: appendSourceNote(company.notes, sourceNote),
      }).eq('id', company.id).eq('user_id', user.id)
      targetId = company.id
    }
    const listResult = await addToList({ type: 'company', id: targetId })
    if (!listResult.ok) {
      await createReviewItem(`Company list membership failed: ${listResult.error}`, { type: 'company', id: targetId })
      return { ok: true, message: 'Saved company. List step was sent to review.' }
    }
    return { ok: true, message: mode === 'create' ? 'Company created.' : 'Capture linked to company.' }
  }

  async function saveDeal(): Promise<SaveResult> {
    let targetId = mode === 'link' ? selectedOpportunityId : ''
    const sourceNote = sourceBody({ title, url, text, note, relationship })
    if (mode === 'create') {
      if (!createDealTitle.trim()) return { ok: false, message: 'Add a deal title before saving.' }
      const { data, error } = await supabase.from('opportunities').insert({
        user_id: user.id,
        title: createDealTitle.trim(),
        type: 'business',
        stage: 'exploring',
        company_id: selectedCompanyId || null,
        estimated_value: null,
        target_date: null,
        notes: sourceNote,
        decision_filter_pass: null,
        interview_prep: null,
        interview_map: null,
        negotiation_prep: null,
      }).select('*').single()
      if (error || !data) return { ok: false, message: error?.message ?? 'Could not create deal.' }
      targetId = (data as Opportunity).id
    } else {
      const opportunity = opportunities.find(o => o.id === selectedOpportunityId)
      if (!opportunity) return { ok: false, message: 'Choose a deal before saving.' }
      await supabase.from('opportunities').update({
        notes: appendSourceNote(opportunity.notes, sourceNote),
      }).eq('id', opportunity.id).eq('user_id', user.id)
      targetId = opportunity.id
    }
    const listResult = await addToList({ type: 'opportunity', id: targetId })
    if (!listResult.ok) {
      await createReviewItem(`Deal list membership failed: ${listResult.error}`, { type: 'opportunity', id: targetId })
      return { ok: true, message: 'Saved deal. List step was sent to review.' }
    }
    return { ok: true, message: mode === 'create' ? 'Deal created.' : 'Capture linked to deal.' }
  }

  async function saveNews(): Promise<SaveResult> {
    if (targetType === 'person') {
      if (!selectedPersonId) return { ok: false, message: 'Choose a person before saving this post.' }
      const signal = await savePersonSignal(selectedPersonId)
      return signal.ok ? { ok: true, message: 'Post linked to person.' } : createReviewItem(signal.message, { type: 'person', id: selectedPersonId })
    }
    if (targetType === 'company') {
      const company = companies.find(c => c.id === selectedCompanyId)
      if (!company) return { ok: false, message: 'Choose a company before saving this post.' }
      await supabase.from('companies').update({
        notes: appendSourceNote(company.notes, sourceBody({ title, url, text, note, relationship })),
      }).eq('id', company.id).eq('user_id', user.id)
      return { ok: true, message: 'Post linked to company.' }
    }
    const opportunity = opportunities.find(o => o.id === selectedOpportunityId)
    if (!opportunity) return { ok: false, message: 'Choose a deal before saving this post.' }
    await supabase.from('opportunities').update({
      notes: appendSourceNote(opportunity.notes, sourceBody({ title, url, text, note, relationship })),
    }).eq('id', opportunity.id).eq('user_id', user.id)
    return { ok: true, message: 'Post linked to deal.' }
  }

  async function handleSave(resetAfter = false) {
    setStatus('saving')
    setMessage('')
    const result =
      intent === 'person' ? await savePerson()
        : intent === 'company' ? await saveCompany()
          : intent === 'deal' ? await saveDeal()
            : await saveNews()
    setStatus(result.ok ? 'saved' : 'error')
    setMessage(result.message)
    if (result.ok && resetAfter) {
      window.location.replace('/capture')
    }
  }

  async function handleReview() {
    setStatus('saving')
    const selected =
      selectedPersonId ? { type: 'person' as TargetType, id: selectedPersonId }
        : selectedCompanyId ? { type: 'company' as TargetType, id: selectedCompanyId }
          : selectedOpportunityId ? { type: 'opportunity' as TargetType, id: selectedOpportunityId }
            : undefined
    const result = await createReviewItem(note || 'Needs manual review from mobile capture.', selected)
    setStatus(result.ok ? 'saved' : 'error')
    setMessage(result.message)
  }

  function finishCapture() {
    window.location.replace('/capture')
  }

  const activeMatches = targetType === 'person' ? personMatches : targetType === 'company' ? companyMatches : opportunityMatches

  return (
    <div className="mc-shell">
      <main className="mc-panel">
        <header className="mc-header">
          <div className="mc-brand">
            <span className="mc-mark">r</span>
            <span>Add to reThink</span>
          </div>
          <button type="button" onClick={finishCapture} className="mc-ghost-btn">
            Done
          </button>
        </header>

        <section className="mc-body">
          {!hasCaptureSource ? (
            <form className="mc-url-gate" onSubmit={handleManualPreview}>
              <div className="mc-url-icon">
                <LinkIcon size={16} />
              </div>
              <div className="mc-url-copy">
                <strong>Add a URL</strong>
                <span>Paste a LinkedIn profile, company page, post, article, or deal source.</span>
              </div>
              <div className="mc-url-input-row">
                <input
                  value={manualUrl}
                  onChange={event => {
                    setManualUrl(event.target.value)
                    if (message) setMessage('')
                  }}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="https://linkedin.com/in/..."
                  autoFocus
                />
                <button type="submit">Preview</button>
              </div>
              {message && (
                <div className={`mc-status ${status === 'error' ? 'error' : 'ok'}`}>
                  {status === 'error' ? <WarningCircle size={15} weight="bold" /> : <Check size={15} weight="bold" />}
                  <span>{message}</span>
                </div>
              )}
            </form>
          ) : (
            <>
          <div className="mc-record-card">
            <div className="mc-title-row">
              <ObjectGlyph type={intent === 'deal' ? 'opportunity' : intent} />
              <div className="mc-title-stack">
                <strong>{title || url || 'Untitled capture'}</strong>
                <span>{sourceDomain || source}</span>
              </div>
              <a className="mc-icon-btn" href={url || '#'} target="_blank" rel="noreferrer" aria-label="Open source">
                <LinkIcon size={13} />
              </a>
            </div>
            <div className="mc-chip-row">
              <span className="mc-chip">{typeConfirmed ? objectLabel(intent) : 'Preview'}</span>
              <span className="mc-chip">{source === 'ios_shortcut' ? 'iPhone Shortcut' : source}</span>
              {url && <span className="mc-chip truncate">{sourceDomain}</span>}
            </div>
            {text && <p className="mc-excerpt">{text}</p>}
          </div>

          <div className="mc-tabs" role="tablist" aria-label="Capture type">
            {INTENTS.map(item => {
              const Icon = item.icon
              const active = typeConfirmed && intent === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseIntent(item.id)}
                  className={active ? 'active' : ''}
                >
                  <Icon size={14} weight={active ? 'fill' : 'regular'} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {!typeConfirmed ? (
            <div className="mc-card mc-step-hint">
              <ObjectGlyph type={intent === 'deal' ? 'opportunity' : intent} />
              <span>Choose what this link should attach to.</span>
            </div>
          ) : (
            <>
          <div className="mc-card">
            {intent === 'news' ? (
              <FieldRow icon={<ObjectGlyph type="source" />} label="Link to">
                <div className="mc-segment">
                  {[
                    ['person', 'Person'],
                    ['company', 'Company'],
                    ['opportunity', 'Deal'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTargetType(id as TargetType)}
                      className={targetType === id ? 'active' : ''}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </FieldRow>
            ) : (
              <FieldRow icon={<ObjectGlyph type={intent === 'deal' ? 'opportunity' : intent} />} label="Action">
                <div className="mc-segment">
                  <button type="button" onClick={() => setMode('link')} className={mode === 'link' ? 'active' : ''}>
                    Link existing
                  </button>
                  <button type="button" onClick={() => setMode('create')} className={mode === 'create' ? 'active' : ''}>
                    Create new
                  </button>
                </div>
              </FieldRow>
            )}

            {mode === 'create' && intent !== 'news' ? (
              <>
                <FieldRow icon={<ObjectGlyph type={intent === 'deal' ? 'opportunity' : intent} />} label={intent === 'person' ? 'Name' : intent === 'company' ? 'Company' : 'Deal name'}>
                  <input
                    value={intent === 'person' ? createName : intent === 'company' ? createCompanyName : createDealTitle}
                    onChange={e => {
                      if (intent === 'person') setCreateName(e.target.value)
                      else if (intent === 'company') setCreateCompanyName(e.target.value)
                      else setCreateDealTitle(e.target.value)
                    }}
                    placeholder={intent === 'person' ? 'Name' : intent === 'company' ? 'Company' : 'Opportunity'}
                  />
                </FieldRow>
                {intent === 'deal' && (
                  <FieldRow icon={<ObjectGlyph type="company" />} label="Company">
                    <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}>
                      <option value="">No company</option>
                      {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </FieldRow>
                )}
              </>
            ) : (
              <div className="mc-picker">
                <div className="mc-picker-search">
                  <MagnifyingGlass size={13} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={`Find ${targetType === 'person' ? 'person' : targetType === 'company' ? 'company' : 'deal'}...`}
                    autoFocus
                  />
                </div>
                <div className="mc-picker-list">
                  {loading ? (
                    <div className="mc-empty">Loading...</div>
                  ) : activeMatches.length === 0 ? (
                    <div className="mc-empty">No matches</div>
                  ) : (
                    activeMatches.map(item => {
                      const id = item.id
                      const active = targetType === 'person'
                        ? selectedPersonId === id
                        : targetType === 'company'
                          ? selectedCompanyId === id
                          : selectedOpportunityId === id
                      const label = 'title' in item ? item.title : item.name
                      const sub = targetType === 'person'
                        ? [(item as PersonOption).job_title, (item as PersonOption).company].filter(Boolean).join(' · ')
                        : targetType === 'company'
                          ? [(item as Company).domain, (item as Company).sector].filter(Boolean).join(' · ')
                          : [(item as Opportunity).company?.name, (item as Opportunity).stage].filter(Boolean).join(' · ')
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            if (targetType === 'person') setSelectedPersonId(id)
                            else if (targetType === 'company') setSelectedCompanyId(id)
                            else setSelectedOpportunityId(id)
                          }}
                          className={active ? 'active' : ''}
                        >
                          <ObjectGlyph type={targetType} />
                          <span>
                            <strong>{label}</strong>
                            <em>{sub || `Existing ${objectLabel(targetType).toLowerCase()}`}</em>
                          </span>
                          {active && <Check size={13} weight="bold" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mc-card">
            <FieldRow icon={<ObjectGlyph type="source" />} label="Relationship">
              <select value={relationship} onChange={e => setRelationship(e.target.value)}>
                <option value="about">About this record</option>
                <option value="authored_by">Authored or shared by them</option>
                <option value="signal_for">Signal for follow-up</option>
                <option value="source_for">Source/evidence</option>
              </select>
            </FieldRow>

            {intent !== 'news' && (
              <FieldRow icon={<ObjectGlyph type="list" />} label="List">
                <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
                  <option value="">No list</option>
                  {lists.map(list => <option key={list.id} value={list.id}>{list.icon ? `${list.icon} ` : ''}{list.name}</option>)}
                </select>
              </FieldRow>
            )}

            <div className="mc-note-row">
              <span className="mc-field-label"><i><ObjectGlyph type="source" /></i>Note</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={4}
                placeholder="Why this matters, next step, or context to remember."
              />
            </div>
          </div>

          {message && (
            <div className={`mc-status ${status === 'error' ? 'error' : 'ok'}`}>
              {status === 'error' ? <WarningCircle size={15} weight="bold" /> : <Check size={15} weight="bold" />}
              <span>{message}</span>
            </div>
          )}
            </>
          )}
            </>
          )}
        </section>

        {hasCaptureSource && typeConfirmed && (
        <footer className="mc-footer">
          <div className="mc-actions">
            <button type="button" disabled={status === 'saving'} onClick={() => handleSave(false)} className="mc-primary">
              {status === 'saving' ? <ArrowClockwise size={15} className="animate-spin" /> : <Plus size={15} weight="bold" />}
              Save
            </button>
            <button type="button" disabled={status === 'saving'} onClick={handleReview} className="mc-icon-action" aria-label="Send to review">
              <WarningCircle size={17} />
            </button>
            <button type="button" disabled={status === 'saving'} onClick={() => handleSave(true)} className="mc-secondary">
              Save & add another
            </button>
          </div>
        </footer>
        )}
      </main>
    </div>
  )
}
