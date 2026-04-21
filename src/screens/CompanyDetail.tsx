import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CaretRight, PencilSimple, Check, X,
  Globe, LinkedinLogo, MapPin, Calendar, Users, UsersThree,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Opportunity } from '@/types'

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatTimeAgo(iso: string | null): string | null {
  if (!iso) return null
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function StatTile({
  icon,
  label,
  value,
  subtitle,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="p-2.5 bg-white border border-mercury rounded-lg">
      <div className="flex items-center gap-1 mb-1">
        {icon && <span className="text-shuttle/60">{icon}</span>}
        <p className="text-[9px] text-shuttle uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className="text-base font-semibold text-midnight leading-none">{value}</p>
      {subtitle && <p className="text-[9px] text-shuttle/60 mt-1 truncate">{subtitle}</p>}
    </div>
  )
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-0.5 p-3 bg-white border border-mercury rounded-lg">
      <div className="flex items-center gap-1 text-[10px] text-shuttle uppercase tracking-wide">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <p className="text-[13px] text-midnight">{value}</p>
    </div>
  )
}

function EditableField({
  label, value, onSave, multiline = false,
}: {
  label: string
  value: string | null | undefined
  onSave: (val: string | null) => Promise<void>
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const save = async () => {
    await onSave(draft.trim() || null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-shuttle uppercase tracking-wide">{label}</span>
        {multiline ? (
          <textarea
            className="text-sm border border-mercury rounded px-2 py-1 resize-none bg-white focus:outline-none focus:border-burnham"
            rows={3} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
          />
        ) : (
          <input
            className="text-sm border border-mercury rounded px-2 py-1 bg-white focus:outline-none focus:border-burnham"
            value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
        )}
        <div className="flex gap-1">
          <button onClick={save} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-burnham text-gossip rounded">
            <Check size={10} /> Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-0.5 text-shuttle hover:text-burnham">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col gap-0.5">
      <span className="text-xs text-shuttle uppercase tracking-wide">{label}</span>
      <div className="flex items-start gap-1">
        <span className="text-sm text-midnight flex-1">{value || <span className="text-mercury italic">—</span>}</span>
        <button onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="opacity-0 group-hover:opacity-100 text-shuttle hover:text-burnham transition-opacity">
          <PencilSimple size={12} />
        </button>
      </div>
    </div>
  )
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [people, setPeople] = useState<Contact[]>([])
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id || !user) return
    setLoading(true)
    const [{ data: co }, { data: contacts }, { data: opportunities }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('outreach_logs').select('*').eq('company_id', id).eq('user_id', user.id),
      supabase.from('opportunities').select('*, company:companies(*)').eq('company_id', id).eq('user_id', user.id),
    ])
    setCompany(co ?? null)
    setPeople(contacts ?? [])
    setOpps(opportunities ?? [])
    setLoading(false)
  }, [id, user])

  useEffect(() => { load() }, [load])

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!id) return
    await supabase.from('companies').update({ [field]: value }).eq('id', id)
    setCompany(prev => prev ? { ...prev, [field]: value } : null)
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-full text-shuttle text-sm">Loading...</div>
  if (!company) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-shuttle">Company not found.</p>
      <Link to="/people/companies" className="text-sm text-burnham underline">Back to Companies</Link>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-mercury">
        <Link to="/people/companies" className="text-shuttle hover:text-burnham"><ArrowLeft size={16} weight="bold" /></Link>
        <span className="text-shuttle text-sm">Companies</span>
        <CaretRight size={12} className="text-mercury" />
        <span className="text-sm font-medium text-midnight">{company.name}</span>
        <button onClick={() => navigate('/people/companies')} className="ml-auto text-shuttle hover:text-burnham p-1 rounded hover:bg-mercury">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* main */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Header: logo + name + headline ─────────────────── */}
          <div className="flex items-start gap-4 mb-5">
            {(() => {
              const logoSrc = company.logo_url
                || (company.domain
                  ? `https://www.google.com/s2/favicons?domain=${company.domain}&sz=128`
                  : null)
              return logoSrc ? (
                <img
                  src={logoSrc}
                  alt={company.name}
                  className="w-16 h-16 rounded-lg object-contain border border-mercury bg-white p-1.5 shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gossip flex items-center justify-center text-burnham font-semibold text-2xl border border-pastel shrink-0">
                  {company.name[0]?.toUpperCase()}
                </div>
              )
            })()}
            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-semibold text-midnight leading-tight">{company.name}</h1>
              {company.headline && (
                <p className="text-[13px] text-shuttle mt-1 leading-snug">{company.headline}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {company.linkedin_url && (
                  <a href={company.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                    <LinkedinLogo size={12} weight="fill" />
                    LinkedIn
                  </a>
                )}
                {company.website_url && (
                  <a href={company.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-burnham hover:underline">
                    <Globe size={12} />
                    {company.domain ?? 'Website'}
                  </a>
                )}
                {company.last_enriched_at && (
                  <span className="text-[10px] text-shuttle/50 font-mono" title={new Date(company.last_enriched_at).toLocaleString()}>
                    enriched {formatTimeAgo(company.last_enriched_at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats row (real + LI metrics) ───────────────────── */}
          <div className="grid grid-cols-5 gap-2 mb-5">
            <StatTile icon={<Users size={12} />} label="Employees" value={formatNumber(company.employees_count ?? company.members_on_linkedin)} subtitle={company.size ?? undefined} />
            <StatTile icon={<UsersThree size={12} />} label="Followers" value={formatNumber(company.followers_count)} />
            <StatTile label="People" value={String(people.length)} subtitle={`at ${company.name}`} />
            <StatTile label="Opps" value={String(opps.length)} subtitle={`${opps.filter(o => ['exploring','active','negotiating'].includes(o.stage)).length} active`} />
            <StatTile icon={<Calendar size={12} />} label="Founded" value={company.founded_year ? String(company.founded_year) : '—'} />
          </div>

          {/* ── Overview (description) ──────────────────────────── */}
          {company.description && (
            <section className="mb-5 p-4 bg-white border border-mercury rounded-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-2">Overview</h3>
              <p className="text-[13px] text-midnight leading-relaxed whitespace-pre-wrap">{company.description}</p>
            </section>
          )}

          {/* ── Meta grid: industry / size / HQ / founded ───────── */}
          <section className="mb-6 grid grid-cols-2 gap-3">
            {company.sector && <MetaRow label="Industry" value={company.sector} />}
            {company.size && <MetaRow label="Company size" value={company.size + (company.members_on_linkedin ? ` · ${company.members_on_linkedin} on LinkedIn` : '')} />}
            {company.hq_location && <MetaRow icon={<MapPin size={11} />} label="Headquarters" value={company.hq_location} />}
            {company.founded_year && <MetaRow icon={<Calendar size={11} />} label="Founded" value={String(company.founded_year)} />}
          </section>

          {/* people at company */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">People ({people.length})</h3>
            {people.length === 0 ? (
              <p className="text-sm text-mercury italic">No contacts linked to this company.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {people.map(p => (
                  <Link
                    key={p.id}
                    to={`/people/${p.id}`}
                    className="flex items-center gap-3 p-3 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gossip flex items-center justify-center text-burnham text-sm font-medium">
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-midnight">{p.name}</p>
                      <p className="text-xs text-shuttle">{p.job_title || p.status}</p>
                    </div>
                    {p.tier && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 bg-mercury text-shuttle rounded">T{p.tier}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* opportunities */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Opportunities ({opps.length})</h3>
            {opps.length === 0 ? (
              <p className="text-sm text-mercury italic">No opportunities linked.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {opps.map(o => (
                  <Link
                    key={o.id}
                    to={`/people/opportunities/${o.id}`}
                    className="flex items-center gap-3 p-3 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-midnight">{o.title}</p>
                      <p className="text-xs text-shuttle capitalize">{o.type}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      o.stage === 'won' ? 'bg-gossip text-burnham' :
                      o.stage === 'lost' ? 'bg-red-100 text-red-700' :
                      'bg-mercury text-shuttle'
                    }`}>{o.stage}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* sidebar */}
        <aside className="w-[260px] flex-shrink-0 border-l border-mercury bg-white overflow-y-auto px-4 py-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-4">Company Details</h4>
          <div className="flex flex-col gap-3">
            <EditableField label="Name" value={company.name} onSave={v => updateField('name', v ?? company.name)} />
            <EditableField label="Headline" value={company.headline} onSave={v => updateField('headline', v)} />
            <EditableField label="Domain" value={company.domain} onSave={v => updateField('domain', v)} />
            <EditableField label="Website" value={company.website_url} onSave={v => updateField('website_url', v)} />
            <EditableField label="LinkedIn URL" value={company.linkedin_url} onSave={v => updateField('linkedin_url', v)} />
            <EditableField label="Industry" value={company.sector} onSave={v => updateField('sector', v)} />
            <EditableField label="Size" value={company.size} onSave={v => updateField('size', v)} />
            <EditableField label="Headquarters" value={company.hq_location} onSave={v => updateField('hq_location', v)} />
            <EditableField label="Founded year" value={company.founded_year?.toString() ?? null} onSave={v => updateField('founded_year', v ? parseInt(v, 10) : null)} />
            <EditableField label="Employees" value={company.employees_count?.toString() ?? null} onSave={v => updateField('employees_count', v ? parseInt(v, 10) : null)} />
            <EditableField label="Members on LinkedIn" value={company.members_on_linkedin?.toString() ?? null} onSave={v => updateField('members_on_linkedin', v ? parseInt(v, 10) : null)} />
            <EditableField label="Followers" value={company.followers_count?.toString() ?? null} onSave={v => updateField('followers_count', v ? parseInt(v, 10) : null)} />
            <EditableField label="Description" value={company.description} onSave={v => updateField('description', v)} multiline />
            <EditableField label="Key Insight" value={company.key_insight} onSave={v => updateField('key_insight', v)} multiline />
            <EditableField label="Notes" value={company.notes} onSave={v => updateField('notes', v)} multiline />
          </div>
        </aside>
      </div>
    </div>
  )
}
