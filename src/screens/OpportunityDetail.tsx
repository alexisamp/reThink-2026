import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CaretRight, Check, PencilSimple, Target,
  Copy, Users, FileText, ChatTeardrop, Briefcase,
  CheckCircle, Warning, Circle,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CompanyLogo } from '@/components/crm/cells'
import { OPPORTUNITY_STAGE_OPTIONS, opportunityStageLabel } from '@/lib/opportunityStages'
import { formatCurrency } from '@/lib/formatters'
import type { Opportunity, OpportunityStage, OpportunityType, Contact, Interaction } from '@/types'

// ── constants ─────────────────────────────────────────────────────────────────

const STAGES = OPPORTUNITY_STAGE_OPTIONS

const STAGE_COLORS: Record<OpportunityStage, string> = {
  exploring: 'text-shuttle bg-mercury',
  applied: 'text-blue-800 bg-blue-100',
  abm_strategy: 'text-purple-800 bg-purple-100',
  interviews: 'text-burnham bg-gossip',
  negotiating: 'text-yellow-800 bg-yellow-100',
  won: 'text-green-800 bg-green-100',
  closed: 'text-red-700 bg-red-100',
  active: 'text-burnham bg-gossip',
  lost: 'text-red-700 bg-red-100',
}

const STAGE_BAR: Record<OpportunityStage, string> = {
  exploring: 'bg-mercury',
  applied: 'bg-blue-400',
  abm_strategy: 'bg-purple-400',
  interviews: 'bg-pastel',
  negotiating: 'bg-yellow-400',
  won: 'bg-green-400',
  closed: 'bg-red-400',
  active: 'bg-pastel',
  lost: 'bg-red-400',
}

const TYPE_LABELS: Record<OpportunityType, string> = {
  job: 'Job', consulting: 'Consulting', business: 'Business',
  partnership: 'Partnership', other: 'Other',
}

// ── types ─────────────────────────────────────────────────────────────────────

interface InterviewMapEntry {
  name: string
  role: string
  round: number
  status: 'pending' | 'completed' | 'scheduled'
  notes?: string
}

interface LocalDocs {
  folder?: string
  pretalk?: string
  conversations?: string
  [key: string]: string | undefined
}

interface InterviewPrepData {
  tldr?: string
  local_docs?: LocalDocs
  current_round?: number
  decision_filter?: Record<string, string>
  value_ledger_balance?: string
  [key: string]: unknown
}

type Tab = 'overview' | 'stakeholders' | 'transcripts' | 'local_files' | 'negotiation'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatValue(n: number | null): string {
  return formatCurrency(n)
}

function roundStatusIcon(status: string) {
  if (status === 'completed') return <CheckCircle size={14} weight="fill" className="text-pastel" />
  if (status === 'scheduled') return <Warning size={14} weight="fill" className="text-yellow-500" />
  return <Circle size={14} className="text-mercury" />
}

function filterStatusIcon(val: string) {
  if (val === '✅' || val === 'true') return <CheckCircle size={13} weight="fill" className="text-pastel" />
  if (val === '⚠️') return <Warning size={13} weight="fill" className="text-yellow-500" />
  return <Circle size={13} className="text-mercury" />
}

// ── sub-components ────────────────────────────────────────────────────────────

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60">{children}</span>
}

function SidebarValue({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] text-midnight">{children}</span>
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <SidebarLabel>{label}</SidebarLabel>
      <SidebarValue>{children}</SidebarValue>
    </div>
  )
}

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
      <div className="flex flex-col gap-1 mb-3">
        <SidebarLabel>{label}</SidebarLabel>
        {multiline ? (
          <textarea
            className="text-[12px] border border-mercury rounded px-2 py-1 resize-none bg-white focus:outline-none focus:border-burnham"
            rows={4} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
          />
        ) : (
          <input
            className="text-[12px] border border-mercury rounded px-2 py-1 bg-white focus:outline-none focus:border-burnham"
            value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
        )}
        <div className="flex gap-1">
          <button onClick={save} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 bg-burnham text-gossip rounded">
            <Check size={8} /> Save
          </button>
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 text-shuttle hover:text-burnham">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col gap-0.5 mb-3">
      <SidebarLabel>{label}</SidebarLabel>
      <div className="flex items-start gap-1">
        <span className="text-[12px] text-midnight flex-1 whitespace-pre-wrap">
          {value || <span className="text-mercury italic text-[11px]">{placeholder ?? '—'}</span>}
        </span>
        <button onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-shuttle hover:text-burnham transition-opacity">
          <PencilSimple size={10} />
        </button>
      </div>
    </div>
  )
}

/** Editable free-text field for main content area */
function ContentField({ label, value, onSave }: { label: string; value: string | null | undefined; onSave: (val: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const save = async () => {
    await onSave(draft.trim() || null)
    setEditing(false)
  }

  return (
    <div className="group mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50">{label}</p>
        {!editing && (
          <button onClick={() => { setDraft(value ?? ''); setEditing(true) }}
            className="opacity-0 group-hover:opacity-100 text-shuttle hover:text-burnham transition-opacity">
            <PencilSimple size={10} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="w-full text-[13px] border border-mercury rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-burnham bg-white"
            rows={5}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={save} className="text-[11px] px-3 py-1 bg-burnham text-gossip rounded">Save</button>
            <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-1 text-shuttle hover:text-burnham">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-midnight whitespace-pre-wrap leading-relaxed">
          {value || <span className="text-mercury italic">Click to add...</span>}
        </p>
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
  const [tab, setTab] = useState<Tab>('overview')
  const [transcriptText, setTranscriptText] = useState('')
  const [transcriptSaving, setTranscriptSaving] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

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
      const { data: people } = await supabase.from('outreach_logs').select('*').in('id', contactIds)
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

  const saveTranscript = async () => {
    if (!user || !id || !transcriptText.trim()) return
    setTranscriptSaving(true)
    await supabase.from('interactions').insert({
      user_id: user.id,
      contact_id: contacts[0]?.id ?? null,
      opportunity_id: id,
      type: 'virtual_coffee',
      direction: 'outbound',
      notes: transcriptText.trim(),
      interaction_date: new Date().toISOString().split('T')[0],
    })
    setTranscriptText('')
    setTranscriptSaving(false)
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-full text-shuttle text-[13px]">Loading...</div>
  if (!opp) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-shuttle text-[13px]">Opportunity not found.</p>
      <Link to="/people/opportunities" className="text-[12px] text-burnham underline">Back to Opportunities</Link>
    </div>
  )

  const prepData = (opp.interview_prep ?? {}) as InterviewPrepData
  const interviewMap = (Array.isArray(opp.interview_map) ? opp.interview_map : []) as InterviewMapEntry[]
  const localDocs = prepData.local_docs as LocalDocs | undefined
  const decisionFilter = prepData.decision_filter as Record<string, string> | undefined
  const isActive = opp.stage === 'active' || opp.stage === 'interviews'
  const isNegotiating = opp.stage === 'negotiating'
  const showNegotiation = isActive || isNegotiating

  // group stakeholders by round
  const rounds = Array.from(new Set(interviewMap.map(e => e.round))).sort()

  const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode; show?: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: <Briefcase size={12} /> },
    { key: 'stakeholders', label: 'Stakeholders', icon: <Users size={12} />, show: isActive || isNegotiating },
    { key: 'transcripts', label: 'Transcripts', icon: <ChatTeardrop size={12} /> },
    { key: 'local_files', label: 'Local Files', icon: <FileText size={12} />, show: !!localDocs },
    { key: 'negotiation', label: 'Negotiation', icon: <Target size={12} />, show: showNegotiation },
  ]

  return (
    <div className="flex flex-col h-full bg-[#F7F7F5]">
      {/* ── breadcrumb ── */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-mercury shrink-0">
        <Link to="/people/opportunities" className="text-shuttle hover:text-burnham transition-colors">
          <ArrowLeft size={14} weight="bold" />
        </Link>
        <span className="text-[12px] text-shuttle">Opportunities</span>
        <CaretRight size={10} className="text-mercury" />
        <span className="text-[12px] font-medium text-midnight truncate max-w-[300px]">{opp.title}</span>
      </div>

      {/* ── TLDR bar ── */}
      {prepData.tldr && (
        <div className="px-5 py-2 bg-gossip/20 border-b border-gossip/40 shrink-0">
          <p className="text-[12px] text-burnham leading-relaxed">
            <span className="font-semibold mr-1.5">TLDR:</span>
            {prepData.tldr}
          </p>
        </div>
      )}

      {/* ── stage pipeline ── */}
      <div className="px-5 py-2.5 bg-white border-b border-mercury shrink-0">
        <div className="flex items-center gap-0.5">
          {STAGES.map((s, i) => {
            const passed = STAGES.indexOf(opp.stage) >= i
            const isCurrent = opp.stage === s
            return (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => updateField('stage', s)}
                  className={[
                    'flex-1 py-1 px-1.5 text-[11px] rounded text-center font-medium transition-all relative',
                    isCurrent ? STAGE_COLORS[s] : passed ? 'text-burnham/50' : 'text-shuttle/40 hover:bg-mercury/50',
                  ].join(' ')}
                >
                  {isCurrent && (
                    <span className={`absolute inset-0 rounded opacity-30 ${STAGE_BAR[s]}`} />
                  )}
                  <span className="relative">{opportunityStageLabel(s)}</span>
                </button>
                {i < STAGES.length - 1 && (
                  <span className="text-mercury text-[10px] mx-0.5">›</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex items-center gap-0 px-5 bg-white border-b border-mercury shrink-0">
        {TAB_CONFIG.filter(t => t.show !== false).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 transition-colors ${
              tab === t.key
                ? 'border-burnham text-burnham font-medium'
                : 'border-transparent text-shuttle hover:text-midnight'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* main content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── OVERVIEW tab ── */}
          {tab === 'overview' && (
            <div>
              {/* header */}
              <div className="flex items-center gap-3 mb-4">
                {opp.company ? (
                  <CompanyLogo name={opp.company.name} src={opp.company.logo_url} domain={opp.company.domain ?? opp.company.website_url} size={36} />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-gossip/40 flex items-center justify-center text-burnham shrink-0">
                    <Target size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h1 className="text-[15px] font-semibold text-midnight">{opp.title}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STAGE_COLORS[opp.stage]}`}>
                      {opportunityStageLabel(opp.stage)}
                    </span>
                    <span className="text-[11px] text-shuttle/60">{TYPE_LABELS[opp.type]}</span>
                    {opp.company && (
                      <>
                        <span className="text-mercury">·</span>
                        <Link to={`/people/companies/${opp.company.id}`} className="text-[11px] text-burnham hover:underline">
                          {opp.company.name}
                        </Link>
                      </>
                    )}
                    {opp.estimated_value && (
                      <>
                        <span className="text-mercury">·</span>
                        <span className="text-[12px] font-semibold text-midnight">{formatValue(opp.estimated_value)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Decision filter checklist */}
              {decisionFilter && Object.keys(decisionFilter).length > 0 && (
                <div className="mb-5 p-3 bg-white border border-mercury rounded-lg">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Decision Filter</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(decisionFilter).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        {filterStatusIcon(val)}
                        <span className="text-[11px] text-midnight capitalize">{key.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                  {prepData.value_ledger_balance && (
                    <p className="text-[11px] text-shuttle mt-2 pt-2 border-t border-mercury/50">
                      {prepData.value_ledger_balance}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <ContentField
                label="Notes"
                value={opp.notes}
                onSave={v => updateField('notes', v)}
              />

              {/* People — always expanded */}
              <div className="mt-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">
                  People ({contacts.length})
                </p>
                {contacts.length === 0 ? (
                  <p className="text-[12px] text-mercury italic">No contacts linked.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {contacts.map(c => (
                      <Link
                        key={c.id}
                        to={`/people/${c.id}`}
                        className="flex items-center gap-2.5 px-3 py-2 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
                      >
                        <div className="w-6 h-6 rounded-full bg-gossip flex items-center justify-center text-burnham text-[11px] font-semibold shrink-0 overflow-hidden">
                          {c.profile_photo_url ? <img src={c.profile_photo_url} alt="" className="w-full h-full object-cover" /> : c.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-midnight truncate">{c.name}</p>
                          <p className="text-[10px] text-shuttle truncate">{c.job_title || c.status}</p>
                        </div>
                        <CaretRight size={10} className="text-mercury shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STAKEHOLDERS tab ── */}
          {tab === 'stakeholders' && (
            <div>
              <p className="text-[13px] font-semibold text-midnight mb-4">
                Interview Map
                {prepData.current_round && (
                  <span className="ml-2 text-[11px] font-normal text-shuttle">
                    (current: Round {prepData.current_round})
                  </span>
                )}
              </p>

              {interviewMap.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={28} className="text-mercury mx-auto mb-2" />
                  <p className="text-[12px] text-shuttle">No stakeholders mapped.</p>
                  <p className="text-[11px] text-mercury mt-1">Populated by the jacob-prep plugin.</p>
                </div>
              ) : (
                <div>
                  {rounds.map(round => {
                    const roundPeople = interviewMap.filter(e => e.round === round)
                    const allDone = roundPeople.every(e => e.status === 'completed')
                    return (
                      <div key={round} className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            allDone ? 'bg-pastel text-white' : 'bg-mercury text-shuttle'
                          }`}>
                            {round}
                          </div>
                          <span className="text-[12px] font-semibold text-midnight">Round {round}</span>
                          {allDone && (
                            <span className="text-[10px] text-pastel font-medium">Completed</span>
                          )}
                        </div>
                        <div className="ml-3 border-l-2 border-mercury pl-4 flex flex-col gap-3">
                          {roundPeople.map((person, idx) => (
                            <div key={idx} className="relative flex gap-3 pb-2">
                              <div className="absolute -left-5 top-0.5">
                                {roundStatusIcon(person.status)}
                              </div>
                              <div className="flex-1">
                                <p className="text-[13px] font-medium text-midnight">{person.name}</p>
                                <p className="text-[11px] text-shuttle">{person.role}</p>
                                {person.notes && (
                                  <p className="text-[12px] text-shuttle/80 mt-1 leading-relaxed">{person.notes}</p>
                                )}
                                <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  person.status === 'completed' ? 'bg-gossip text-burnham' :
                                  person.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-mercury text-shuttle'
                                }`}>
                                  {person.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CLOSER framework prep */}
              {isActive && (
                <div className="mt-6 pt-4 border-t border-mercury">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-3">CLOSER Framework</p>
                  <div className="flex flex-col gap-3">
                    {[
                      { key: 'C', label: 'Clarify the role & fit' },
                      { key: 'L', label: 'Listen for pain points' },
                      { key: 'O', label: 'Offer your value' },
                      { key: 'S', label: 'Show concrete results' },
                      { key: 'E', label: 'Explore culture & growth' },
                      { key: 'R', label: 'Request next steps' },
                    ].map(item => (
                      <ContentField
                        key={item.key}
                        label={`${item.key} — ${item.label}`}
                        value={(prepData as Record<string, string | undefined>)[`closer_${item.key.toLowerCase()}`] ?? null}
                        onSave={v => updateField('interview_prep', { ...prepData, [`closer_${item.key.toLowerCase()}`]: v })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TRANSCRIPTS tab ── */}
          {tab === 'transcripts' && (
            <div>
              <p className="text-[13px] font-semibold text-midnight mb-1">Paste Transcript</p>
              <p className="text-[12px] text-shuttle mb-4">Paste a Granola transcript or conversation notes below. It will be saved as an interaction.</p>
              <textarea
                value={transcriptText}
                onChange={e => setTranscriptText(e.target.value)}
                placeholder="Paste transcript here..."
                rows={12}
                className="w-full text-[12px] border border-mercury rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-burnham bg-white font-mono"
              />
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={saveTranscript}
                  disabled={!transcriptText.trim() || transcriptSaving}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 bg-burnham text-gossip rounded-lg disabled:opacity-50"
                >
                  <Check size={11} /> {transcriptSaving ? 'Saving...' : 'Save as interaction'}
                </button>
                {transcriptText && (
                  <button
                    onClick={() => setTranscriptText('')}
                    className="text-[11px] text-shuttle hover:text-burnham"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── LOCAL FILES tab ── */}
          {tab === 'local_files' && (
            <div>
              <p className="text-[13px] font-semibold text-midnight mb-1">Local Files</p>
              {!localDocs ? (
                <p className="text-[12px] text-mercury italic">No local docs linked. Populated by the jacob-prep plugin via interview_prep.local_docs.</p>
              ) : (
                <div className="flex flex-col gap-3 mt-3">
                  {localDocs.folder && (
                    <div className="p-3 bg-white border border-mercury rounded-lg">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-1">Folder</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] text-midnight font-mono flex-1 truncate">{localDocs.folder}</p>
                        <button
                          onClick={() => copyPath(localDocs.folder!)}
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 border border-mercury text-shuttle hover:text-burnham hover:border-burnham rounded transition-colors"
                        >
                          {copiedPath === localDocs.folder ? <Check size={10} /> : <Copy size={10} />}
                          {copiedPath === localDocs.folder ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}

                  {Object.entries(localDocs)
                    .filter(([k]) => k !== 'folder')
                    .map(([key, filename]) => {
                      if (!filename) return null
                      const fullPath = localDocs.folder
                        ? `${localDocs.folder}/${filename}`
                        : filename
                      return (
                        <div key={key} className="p-3 bg-white border border-mercury rounded-lg">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-1">{key}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[12px] text-midnight flex-1 truncate">{filename}</p>
                            <button
                              onClick={() => copyPath(fullPath)}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 border border-mercury text-shuttle hover:text-burnham hover:border-burnham rounded transition-colors"
                            >
                              {copiedPath === fullPath ? <Check size={10} /> : <Copy size={10} />}
                              {copiedPath === fullPath ? 'Copied' : 'Copy path'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── NEGOTIATION tab ── */}
          {tab === 'negotiation' && (
            <div>
              <p className="text-[13px] font-semibold text-midnight mb-4">Negotiation Prep</p>

              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-3">GAINS Framework</p>
                <div className="flex flex-col gap-1">
                  {[
                    { key: 'G', label: 'Goals — what you want' },
                    { key: 'A', label: 'Assumptions — their constraints' },
                    { key: 'I', label: 'Issues — what you\'re trading' },
                    { key: 'N', label: 'Needs — non-negotiables' },
                    { key: 'S', label: 'Solutions — creative trades' },
                  ].map(item => {
                    const prep = (opp.negotiation_prep as Record<string, string> | null) ?? {}
                    return (
                      <ContentField
                        key={item.key}
                        label={`${item.key} — ${item.label}`}
                        value={prep[item.key.toLowerCase()] ?? null}
                        onSave={v => updateField('negotiation_prep', { ...prep, [item.key.toLowerCase()]: v })}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-mercury">
                <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-3">Comp Levers & Scripts</p>
                {[
                  { key: 'comp_target', label: 'Base salary target / range' },
                  { key: 'scripts', label: 'Deflection scripts (counter-offer, delay, anchor)' },
                  { key: 'pillars', label: 'Three Pillars (value, market, urgency)' },
                ].map(item => {
                  const prep = (opp.negotiation_prep as Record<string, string> | null) ?? {}
                  return (
                    <ContentField
                      key={item.key}
                      label={item.label}
                      value={prep[item.key] ?? null}
                      onSave={v => updateField('negotiation_prep', { ...prep, [item.key]: v })}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── sidebar ── */}
        <aside className="w-[240px] flex-shrink-0 border-l border-mercury bg-white overflow-y-auto px-4 py-4">

          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Details</p>
          </div>

          <EditableField label="Title" value={opp.title} onSave={v => updateField('title', v ?? opp.title)} />

          <div className="mb-2">
            <SidebarLabel>Stage</SidebarLabel>
            <select
              value={opp.stage}
              onChange={e => updateField('stage', e.target.value)}
              className="mt-0.5 w-full text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
            >
              {STAGES.map(s => <option key={s} value={s}>{opportunityStageLabel(s)}</option>)}
            </select>
          </div>

          <div className="mb-2">
            <SidebarLabel>Type</SidebarLabel>
            <select
              value={opp.type}
              onChange={e => updateField('type', e.target.value)}
              className="mt-0.5 w-full text-[12px] border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <EditableField
            label="Est. Value ($)"
            value={opp.estimated_value?.toString() ?? null}
            onSave={v => updateField('estimated_value', v ? Number(v) : null)}
            placeholder="0"
          />
          <EditableField label="Target Date" value={opp.target_date} onSave={v => updateField('target_date', v)} placeholder="YYYY-MM-DD" />

          {opp.company && (
            <SidebarRow label="Company">
              <Link to={`/people/companies/${opp.company.id}`} className="text-burnham hover:underline">
                {opp.company.name}
              </Link>
            </SidebarRow>
          )}

          {/* Decision filter toggle */}
          <div className="mb-3">
            <SidebarLabel>Decision Filter</SidebarLabel>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => updateField('decision_filter_pass', !opp.decision_filter_pass)}
                className={`w-8 h-4 rounded-full transition-colors ${opp.decision_filter_pass ? 'bg-pastel' : 'bg-mercury'}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${opp.decision_filter_pass ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <SidebarValue>{opp.decision_filter_pass ? 'Passes' : 'Not evaluated'}</SidebarValue>
            </div>
          </div>

          {/* Linked people */}
          {contacts.length > 0 && (
            <div className="mb-3 pt-3 border-t border-mercury">
              <SidebarLabel>People ({contacts.length})</SidebarLabel>
              <div className="flex flex-col gap-1 mt-1">
                {contacts.map(c => (
                  <Link
                    key={c.id}
                    to={`/people/${c.id}`}
                    className="flex items-center gap-1.5 hover:text-burnham transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full bg-gossip flex items-center justify-center text-burnham text-[8px] font-bold shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-[11px] text-midnight truncate">{c.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-mercury">
            <p className="text-[10px] text-mercury">
              Created {new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="mt-3">
            <button
              onClick={() => navigate('/people/opportunities')}
              className="flex items-center gap-1 text-[11px] text-shuttle hover:text-burnham"
            >
              <ArrowLeft size={11} /> Back to Opportunities
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
