import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CaretRight, Buildings, PencilSimple, Check, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Opportunity } from '@/types'

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
          {/* header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-lg bg-gossip flex items-center justify-center text-burnham font-semibold text-xl border border-pastel">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="w-14 h-14 rounded-lg object-cover" />
              ) : (
                company.name[0]?.toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-midnight">{company.name}</h1>
              <p className="text-sm text-shuttle">{[company.sector, company.domain].filter(Boolean).join(' · ') || 'No details'}</p>
            </div>
          </div>

          {/* stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-3 bg-white border border-mercury rounded-lg">
              <p className="text-xs text-shuttle uppercase tracking-wide mb-1">People</p>
              <p className="text-xl font-semibold text-midnight">{people.length}</p>
            </div>
            <div className="p-3 bg-white border border-mercury rounded-lg">
              <p className="text-xs text-shuttle uppercase tracking-wide mb-1">Opportunities</p>
              <p className="text-xl font-semibold text-midnight">{opps.length}</p>
            </div>
            <div className="p-3 bg-white border border-mercury rounded-lg">
              <p className="text-xs text-shuttle uppercase tracking-wide mb-1">Active Opps</p>
              <p className="text-xl font-semibold text-midnight">
                {opps.filter(o => ['exploring','active','negotiating'].includes(o.stage)).length}
              </p>
            </div>
          </div>

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
            <EditableField label="Domain" value={company.domain} onSave={v => updateField('domain', v)} />
            <EditableField label="Sector" value={company.sector} onSave={v => updateField('sector', v)} />
            <EditableField label="Size" value={company.size} onSave={v => updateField('size', v)} />
            <EditableField label="Key Insight" value={company.key_insight} onSave={v => updateField('key_insight', v)} multiline />
            <EditableField label="Notes" value={company.notes} onSave={v => updateField('notes', v)} multiline />
          </div>
        </aside>
      </div>
    </div>
  )
}
