import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CaretRight, X, Check, PencilSimple, Briefcase,
  DotOutline, Target,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Opportunity, OpportunityStage, OpportunityType, Contact } from '@/types'

// ── constants ─────────────────────────────────────────────────────────────────

const STAGES: OpportunityStage[] = ['exploring', 'active', 'negotiating', 'won', 'lost']

const STAGE_COLORS: Record<OpportunityStage, string> = {
  exploring: 'text-shuttle bg-mercury',
  active: 'text-burnham bg-gossip',
  negotiating: 'text-yellow-800 bg-yellow-100',
  won: 'text-green-800 bg-green-100',
  lost: 'text-red-700 bg-red-100',
}

const STAGE_DOT: Record<OpportunityStage, string> = {
  exploring: 'text-shuttle',
  active: 'text-pastel',
  negotiating: 'text-yellow-500',
  won: 'text-green-500',
  lost: 'text-red-400',
}

const TYPE_LABELS: Record<OpportunityType, string> = {
  job: 'Job', consulting: 'Consulting', business: 'Business',
  partnership: 'Partnership', other: 'Other',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatValue(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}

// ── editable field ────────────────────────────────────────────────────────────

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
            rows={4} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
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
        <span className="text-sm text-midnight flex-1 whitespace-pre-wrap">{value || <span className="text-mercury italic">—</span>}</span>
        <button onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-shuttle hover:text-burnham transition-opacity">
          <PencilSimple size={12} />
        </button>
      </div>
    </div>
  )
}

// ── accordion section ─────────────────────────────────────────────────────────

function AccordionSection({ title, badge, children, defaultOpen = true }: {
  title: string
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-mercury rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-mercury/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-midnight">{title}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 bg-gossip text-burnham rounded-full">{badge}</span>
          )}
        </div>
        <span className="text-shuttle text-lg leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white border-t border-mercury">
          {children}
        </div>
      )}
    </div>
  )
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id || !user) return
    setLoading(true)
    const [{ data: oppData }, { data: links }] = await Promise.all([
      supabase.from('opportunities').select('*, company:companies(*)').eq('id', id).single(),
      supabase.from('opportunity_contacts').select('outreach_log_id, role').eq('opportunity_id', id),
    ])
    setOpp(oppData ?? null)

    if (links && links.length > 0) {
      const contactIds = links.map(l => l.outreach_log_id)
      const { data: people } = await supabase
        .from('outreach_logs')
        .select('*')
        .in('id', contactIds)
      setContacts(people ?? [])
    }
    setLoading(false)
  }, [id, user])

  useEffect(() => { load() }, [load])

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!id) return
    await supabase.from('opportunities').update({ [field]: value }).eq('id', id)
    setOpp(prev => prev ? { ...prev, [field]: value } : null)
  }, [id])

  const updateStage = async (stage: OpportunityStage) => {
    await updateField('stage', stage)
  }

  if (loading) return <div className="flex items-center justify-center h-full text-shuttle text-sm">Loading...</div>
  if (!opp) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-shuttle">Opportunity not found.</p>
      <Link to="/people/opportunities" className="text-sm text-burnham underline">Back to Opportunities</Link>
    </div>
  )

  const isActive = opp.stage === 'active'
  const isNegotiating = opp.stage === 'negotiating'

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-mercury">
        <Link to="/people/opportunities" className="text-shuttle hover:text-burnham"><ArrowLeft size={16} weight="bold" /></Link>
        <span className="text-shuttle text-sm">Opportunities</span>
        <CaretRight size={12} className="text-mercury" />
        <span className="text-sm font-medium text-midnight truncate max-w-[300px]">{opp.title}</span>
        <button onClick={() => navigate('/people/opportunities')} className="ml-auto text-shuttle hover:text-burnham p-1 rounded hover:bg-mercury">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* main */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gossip flex items-center justify-center text-burnham">
              <Target size={24} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-midnight">{opp.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <DotOutline size={14} weight="fill" className={STAGE_DOT[opp.stage]} />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[opp.stage]}`}>
                  {opp.stage}
                </span>
                <span className="text-xs text-shuttle">·</span>
                <span className="text-xs text-shuttle">{TYPE_LABELS[opp.type]}</span>
                {opp.company && (
                  <>
                    <span className="text-xs text-shuttle">·</span>
                    <Link to={`/people/companies/${opp.company.id}`} className="text-xs text-burnham hover:underline">
                      {opp.company.name}
                    </Link>
                  </>
                )}
              </div>
            </div>
            {opp.estimated_value && (
              <div className="text-right">
                <p className="text-lg font-semibold text-midnight">{formatValue(opp.estimated_value)}</p>
                <p className="text-xs text-shuttle">est. value</p>
              </div>
            )}
          </div>

          {/* stage pipeline */}
          <div className="flex items-center gap-1 mb-6 p-3 bg-white border border-mercury rounded-lg">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => updateStage(s)}
                  className={`flex-1 py-1.5 px-2 text-xs rounded-md text-center font-medium transition-colors ${
                    opp.stage === s ? STAGE_COLORS[s] : 'text-shuttle hover:bg-mercury'
                  }`}
                >
                  {s}
                </button>
                {i < STAGES.length - 1 && <span className="text-mercury mx-0.5">›</span>}
              </div>
            ))}
          </div>

          {/* notes */}
          <AccordionSection title="Notes">
            <EditableField label="Notes" value={opp.notes} onSave={v => updateField('notes', v)} multiline />
          </AccordionSection>

          {/* Interview Prep — only shown when stage = active */}
          {isActive && (
            <AccordionSection title="Interview Prep" badge="CLOSER framework">
              <div className="flex flex-col gap-4">
                <p className="text-xs text-shuttle">Use the CLOSER framework to prepare for your interviews.</p>
                {['C — Clarify the role & fit', 'L — Listen for pain points', 'O — Offer your value', 'S — Show concrete results', 'E — Explore culture & growth', 'R — Request next steps'].map(item => (
                  <EditableField
                    key={item}
                    label={item}
                    value={(opp.interview_prep as Record<string, string> | null)?.[item.split(' — ')[0]] ?? null}
                    onSave={v => updateField('interview_prep', { ...(opp.interview_prep as Record<string, unknown> ?? {}), [item.split(' — ')[0]]: v })}
                    multiline
                  />
                ))}
              </div>
            </AccordionSection>
          )}

          {isActive && (
            <AccordionSection title="Interview Map" defaultOpen={false}>
              <div className="flex flex-col gap-3">
                <p className="text-xs text-shuttle">Map the stakeholders you'll meet and key topics per round.</p>
                <EditableField
                  label="Rounds & Stakeholders"
                  value={(opp.interview_map as Record<string, string> | null)?.rounds ?? null}
                  onSave={v => updateField('interview_map', { ...(opp.interview_map as Record<string, unknown> ?? {}), rounds: v })}
                  multiline
                />
                <EditableField
                  label="Key Topics to Cover"
                  value={(opp.interview_map as Record<string, string> | null)?.topics ?? null}
                  onSave={v => updateField('interview_map', { ...(opp.interview_map as Record<string, unknown> ?? {}), topics: v })}
                  multiline
                />
                <EditableField
                  label="Questions to Ask"
                  value={(opp.interview_map as Record<string, string> | null)?.questions ?? null}
                  onSave={v => updateField('interview_map', { ...(opp.interview_map as Record<string, unknown> ?? {}), questions: v })}
                  multiline
                />
              </div>
            </AccordionSection>
          )}

          {/* Negotiation Prep — only shown when stage = negotiating */}
          {isNegotiating && (
            <AccordionSection title="Negotiation Prep" badge="GAINS framework">
              <div className="flex flex-col gap-4">
                <p className="text-xs text-shuttle">Use the GAINS framework to prepare your negotiation strategy.</p>
                {['G — Goals (what you want)', 'A — Assumptions (their constraints)', 'I — Issues (what you\'re trading)', 'N — Needs (non-negotiables)', 'S — Solutions (creative trades)'].map(item => (
                  <EditableField
                    key={item}
                    label={item}
                    value={(opp.negotiation_prep as Record<string, string> | null)?.[item.split(' — ')[0]] ?? null}
                    onSave={v => updateField('negotiation_prep', { ...(opp.negotiation_prep as Record<string, unknown> ?? {}), [item.split(' — ')[0]]: v })}
                    multiline
                  />
                ))}
              </div>
            </AccordionSection>
          )}

          {isNegotiating && (
            <AccordionSection title="Comp Levers & Scripts" defaultOpen={false}>
              <div className="flex flex-col gap-3">
                <EditableField
                  label="Base salary target / range"
                  value={(opp.negotiation_prep as Record<string, string> | null)?.comp_target ?? null}
                  onSave={v => updateField('negotiation_prep', { ...(opp.negotiation_prep as Record<string, unknown> ?? {}), comp_target: v })}
                  multiline
                />
                <EditableField
                  label="Deflection scripts (counter-offer, delay, anchor)"
                  value={(opp.negotiation_prep as Record<string, string> | null)?.scripts ?? null}
                  onSave={v => updateField('negotiation_prep', { ...(opp.negotiation_prep as Record<string, unknown> ?? {}), scripts: v })}
                  multiline
                />
                <EditableField
                  label="Three Pillars (value, market, urgency)"
                  value={(opp.negotiation_prep as Record<string, string> | null)?.pillars ?? null}
                  onSave={v => updateField('negotiation_prep', { ...(opp.negotiation_prep as Record<string, unknown> ?? {}), pillars: v })}
                  multiline
                />
              </div>
            </AccordionSection>
          )}

          {/* People */}
          {contacts.length > 0 && (
            <AccordionSection title={`People (${contacts.length})`} defaultOpen={false}>
              <div className="flex flex-col gap-2">
                {contacts.map(c => (
                  <Link
                    key={c.id}
                    to={`/people/${c.id}`}
                    className="flex items-center gap-2 p-2 bg-[#FAFAFA] border border-mercury rounded hover:border-burnham transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-gossip flex items-center justify-center text-burnham text-xs font-medium">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-midnight">{c.name}</p>
                      <p className="text-xs text-shuttle">{c.job_title || c.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </AccordionSection>
          )}
        </div>

        {/* sidebar */}
        <aside className="w-[260px] flex-shrink-0 border-l border-mercury bg-white overflow-y-auto px-4 py-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-4">Details</h4>
          <div className="flex flex-col gap-3">
            <EditableField label="Title" value={opp.title} onSave={v => updateField('title', v ?? opp.title)} />

            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-shuttle uppercase tracking-wide">Stage</span>
              <select
                value={opp.stage}
                onChange={e => updateStage(e.target.value as OpportunityStage)}
                className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-shuttle uppercase tracking-wide">Type</span>
              <select
                value={opp.type}
                onChange={e => updateField('type', e.target.value)}
                className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <EditableField
              label="Est. Value ($)"
              value={opp.estimated_value?.toString() ?? null}
              onSave={v => updateField('estimated_value', v ? Number(v) : null)}
            />
            <EditableField label="Target Date" value={opp.target_date} onSave={v => updateField('target_date', v)} />

            {opp.company && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-shuttle uppercase tracking-wide">Company</span>
                <Link to={`/people/companies/${opp.company.id}`} className="text-sm text-burnham hover:underline">
                  {opp.company.name}
                </Link>
              </div>
            )}

            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-shuttle uppercase tracking-wide">Decision Filter</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateField('decision_filter_pass', !opp.decision_filter_pass)}
                  className={`w-8 h-4 rounded-full transition-colors ${opp.decision_filter_pass ? 'bg-pastel' : 'bg-mercury'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${opp.decision_filter_pass ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-shuttle">{opp.decision_filter_pass ? 'Passes filter' : 'Not evaluated'}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-mercury">
            <p className="text-xs text-mercury">Created {new Date(opp.created_at).toLocaleDateString()}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
