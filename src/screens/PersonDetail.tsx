import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, X, CaretRight, PencilSimple, Check, Plus,
  WhatsappLogo, LinkedinLogo, TwitterLogo, Star, Briefcase,
  UserCircle, Heart, Lightning, HandCoins, ChatCircle, Buildings,
  CalendarBlank, ArrowsClockwise, Trash,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useValueLogs } from '@/hooks/useValueLogs'
import type { Contact, Interaction, ContactChannel, Opportunity, ValueLog } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatAgo(days: number | null): string {
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function healthColor(days: number | null): string {
  if (days === null) return 'text-shuttle'
  if (days <= 14) return 'text-pastel'
  if (days <= 30) return 'text-yellow-500'
  return 'text-red-400'
}

function healthLabel(days: number | null): string {
  if (days === null) return 'Never contacted'
  if (days <= 14) return 'Active'
  if (days <= 30) return 'Warm'
  return 'Cold'
}

const INTERACTION_ICONS: Record<string, string> = {
  whatsapp: '💬', linkedin_msg: '💼', email: '📧',
  call: '📞', virtual_coffee: '☕', in_person: '🤝',
}

const VALUE_TYPE_LABELS: Record<string, string> = {
  introduction: 'Introduction', content: 'Content', referral: 'Referral',
  advice: 'Advice', endorsement: 'Endorsement', opportunity: 'Opportunity', other: 'Other',
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <WhatsappLogo size={16} weight="fill" className="text-green-500" />,
  linkedin: <LinkedinLogo size={16} weight="fill" className="text-blue-500" />,
  x: <TwitterLogo size={16} weight="fill" className="text-shuttle" />,
  exit5: <Star size={16} weight="fill" className="text-yellow-500" />,
}

const TIER_LABELS: Record<number, string> = { 1: 'T1 — Core', 2: 'T2 — Strategic', 3: 'T3 — Peripheral' }
const TIER_COLORS: Record<number, string> = {
  1: 'bg-gossip text-burnham',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-mercury text-shuttle',
}

// ── inline editable field ─────────────────────────────────────────────────────

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
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="text-sm border border-mercury rounded px-2 py-1 bg-white focus:outline-none focus:border-burnham"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
        )}
        <div className="flex gap-1">
          <button onClick={save} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-burnham text-gossip rounded">
            <Check size={10} /> Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-0.5 text-shuttle hover:text-burnham">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col gap-0.5">
      <span className="text-xs text-shuttle uppercase tracking-wide">{label}</span>
      <div className="flex items-start gap-1">
        <span className="text-sm text-midnight flex-1">{value || <span className="text-mercury italic">—</span>}</span>
        <button
          onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          className="opacity-0 group-hover:opacity-100 text-shuttle hover:text-burnham transition-opacity"
        >
          <PencilSimple size={12} />
        </button>
      </div>
    </div>
  )
}

// ── highlight card ────────────────────────────────────────────────────────────

function HighlightCard({ icon, label, value, sub, color = 'text-shuttle' }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="flex flex-col gap-1 p-3 bg-white border border-mercury rounded-lg">
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-base font-semibold text-midnight">{value}</p>
      {sub && <p className="text-xs text-shuttle">{sub}</p>}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'interactions' | 'notes' | 'opportunities'

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [channels, setChannels] = useState<ContactChannel[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [addingInteraction, setAddingInteraction] = useState(false)
  const [newInterType, setNewInterType] = useState<Interaction['type']>('call')
  const [newInterNotes, setNewInterNotes] = useState('')
  const [addingValueLog, setAddingValueLog] = useState(false)
  const [newVLType, setNewVLType] = useState<ValueLog['type']>('introduction')
  const [newVLDesc, setNewVLDesc] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  const { logs: valueLogs, add: addValueLog, remove: removeValueLog } = useValueLogs(user?.id ?? null, id)

  const load = useCallback(async () => {
    if (!id || !user) return
    setLoading(true)
    const [{ data: c }, { data: ints }, { data: chans }, { data: opps }] = await Promise.all([
      supabase.from('outreach_logs').select('*').eq('id', id).single(),
      supabase.from('interactions').select('*').eq('contact_id', id).order('interaction_date', { ascending: false }),
      supabase.from('contact_channels').select('*').eq('outreach_log_id', id),
      supabase
        .from('opportunity_contacts')
        .select('opportunity_id')
        .eq('outreach_log_id', id)
        .then(async ({ data: links }) => {
          if (!links || links.length === 0) return { data: [] }
          const ids = links.map(l => l.opportunity_id)
          return supabase.from('opportunities').select('*, company:companies(*)').in('id', ids)
        }),
    ])
    setContact(c ?? null)
    setNotesDraft(c?.notes ?? '')
    setInteractions(ints ?? [])
    setChannels(chans ?? [])
    setOpportunities((opps as { data: Opportunity[] }).data ?? [])
    setLoading(false)
  }, [id, user])

  useEffect(() => { load() }, [load])

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!id) return
    await supabase.from('outreach_logs').update({ [field]: value }).eq('id', id)
    setContact(prev => prev ? { ...prev, [field]: value } : null)
  }, [id])

  const saveNotes = async () => {
    setNotesSaving(true)
    await updateField('notes', notesDraft.trim() || null)
    setNotesSaving(false)
  }

  const logInteraction = async () => {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('interactions')
      .insert({
        user_id: user.id,
        contact_id: id,
        type: newInterType,
        direction: 'outbound',
        notes: newInterNotes.trim() || null,
        interaction_date: new Date().toISOString().split('T')[0],
      })
      .select().single()
    if (!error && data) {
      setInteractions(prev => [data as Interaction, ...prev])
      const now = new Date().toISOString()
      await supabase.from('outreach_logs').update({ last_interaction_at: now, updated_at: now }).eq('id', id)
      setContact(prev => prev ? { ...prev, last_interaction_at: now } : null)
    }
    setNewInterNotes('')
    setAddingInteraction(false)
  }

  const deleteInteraction = async (iid: string) => {
    await supabase.from('interactions').delete().eq('id', iid)
    setInteractions(prev => prev.filter(i => i.id !== iid))
  }

  const submitValueLog = async () => {
    if (!id) return
    await addValueLog({ outreach_log_id: id, type: newVLType, description: newVLDesc.trim() || undefined })
    setNewVLDesc('')
    setAddingValueLog(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-shuttle text-sm">
        Loading...
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-shuttle">Contact not found.</p>
        <Link to="/people" className="text-sm text-burnham underline">Back to People</Link>
      </div>
    )
  }

  const lastDays = daysSince(contact.last_interaction_at)
  const initials = contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const valueGiven = valueLogs.length
  const interactionCount = interactions.length

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* ── breadcrumb + nav ── */}
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-mercury">
        <Link to="/people" className="text-shuttle hover:text-burnham transition-colors">
          <ArrowLeft size={16} weight="bold" />
        </Link>
        <span className="text-shuttle text-sm">People</span>
        <CaretRight size={12} className="text-mercury" />
        <span className="text-sm font-medium text-midnight truncate max-w-[300px]">{contact.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate('/people')} className="text-shuttle hover:text-burnham p-1 rounded hover:bg-mercury transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex items-center gap-0 px-6 bg-white border-b border-mercury">
        {(['overview', 'interactions', 'notes', 'opportunities'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-burnham text-burnham font-medium'
                : 'border-transparent text-shuttle hover:text-midnight'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── main body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* left: content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── profile header ── */}
          <div className="flex items-start gap-4 mb-6">
            {contact.profile_photo_url ? (
              <img src={contact.profile_photo_url} alt={contact.name} className="w-14 h-14 rounded-full object-cover border border-mercury" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gossip flex items-center justify-center text-burnham font-semibold text-lg border border-pastel">
                {initials}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-midnight">{contact.name}</h1>
              <p className="text-sm text-shuttle">{[contact.job_title, contact.company].filter(Boolean).join(' · ') || 'No title'}</p>
              {contact.location && <p className="text-xs text-mercury mt-0.5">{contact.location}</p>}
            </div>
            {contact.tier && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[contact.tier]}`}>
                {TIER_LABELS[contact.tier]}
              </span>
            )}
          </div>

          {/* ── OVERVIEW tab ── */}
          {tab === 'overview' && (
            <>
              {/* highlights 2x3 grid */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <HighlightCard
                  icon={<Heart size={14} />}
                  label="Health"
                  value={healthLabel(lastDays)}
                  sub={formatAgo(lastDays)}
                  color={healthColor(lastDays)}
                />
                <HighlightCard
                  icon={<Lightning size={14} />}
                  label="Interactions"
                  value={String(interactionCount)}
                  sub="total logged"
                  color="text-shuttle"
                />
                <HighlightCard
                  icon={<HandCoins size={14} />}
                  label="Value Given"
                  value={String(valueGiven)}
                  sub="value logs"
                  color="text-burnham"
                />
                <HighlightCard
                  icon={<Buildings size={14} />}
                  label="Company"
                  value={contact.company || '—'}
                  sub={contact.job_title ?? undefined}
                  color="text-shuttle"
                />
                <HighlightCard
                  icon={<UserCircle size={14} />}
                  label="Status"
                  value={contact.status}
                  color="text-shuttle"
                />
                <HighlightCard
                  icon={<ChatCircle size={14} />}
                  label="Category"
                  value={contact.category?.replace('_', ' ') ?? '—'}
                  color="text-shuttle"
                />
              </div>

              {/* Recent interactions */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle">Recent Activity</h3>
                  <button
                    onClick={() => { setAddingInteraction(true); setTab('interactions') }}
                    className="flex items-center gap-1 text-xs text-burnham hover:underline"
                  >
                    <Plus size={12} /> Log
                  </button>
                </div>
                {interactions.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-mercury italic">No interactions yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {interactions.slice(0, 5).map(i => (
                      <div key={i.id} className="flex items-start gap-2 p-2 bg-white border border-mercury rounded-lg">
                        <span className="text-base leading-none mt-0.5">{INTERACTION_ICONS[i.type] ?? '📝'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-midnight capitalize">{i.type.replace('_', ' ')}</span>
                            <span className="text-xs text-shuttle">{i.direction === 'inbound' ? '← inbound' : '→ outbound'}</span>
                          </div>
                          {i.notes && <p className="text-xs text-shuttle mt-0.5 truncate">{i.notes}</p>}
                        </div>
                        <span className="text-xs text-mercury whitespace-nowrap">{i.interaction_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Value logs */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle">Value Given</h3>
                  <button
                    onClick={() => setAddingValueLog(true)}
                    className="flex items-center gap-1 text-xs text-burnham hover:underline"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>

                {addingValueLog && (
                  <div className="flex flex-col gap-2 mb-3 p-3 bg-white border border-mercury rounded-lg">
                    <select
                      value={newVLType}
                      onChange={e => setNewVLType(e.target.value as ValueLog['type'])}
                      className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                    >
                      {Object.entries(VALUE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Description (optional)"
                      value={newVLDesc}
                      onChange={e => setNewVLDesc(e.target.value)}
                      className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                    />
                    <div className="flex gap-2">
                      <button onClick={submitValueLog} className="text-xs px-3 py-1 bg-burnham text-gossip rounded">Save</button>
                      <button onClick={() => setAddingValueLog(false)} className="text-xs px-3 py-1 text-shuttle hover:text-burnham">Cancel</button>
                    </div>
                  </div>
                )}

                {valueLogs.length === 0 && !addingValueLog ? (
                  <p className="text-sm text-mercury italic">No value logs yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {valueLogs.map(vl => (
                      <div key={vl.id} className="flex items-start gap-2 p-2 bg-white border border-mercury rounded-lg group">
                        <span className="text-xs font-medium px-1.5 py-0.5 bg-gossip text-burnham rounded">
                          {VALUE_TYPE_LABELS[vl.type] ?? vl.type}
                        </span>
                        <p className="text-xs text-shuttle flex-1">{vl.description || '—'}</p>
                        <span className="text-xs text-mercury">{vl.date}</span>
                        <button
                          onClick={() => removeValueLog(vl.id)}
                          className="opacity-0 group-hover:opacity-100 text-mercury hover:text-red-400 transition-opacity"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── INTERACTIONS tab ── */}
          {tab === 'interactions' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-midnight">All Interactions ({interactions.length})</h3>
                <button
                  onClick={() => setAddingInteraction(v => !v)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-burnham text-gossip rounded-lg"
                >
                  <Plus size={12} /> Log interaction
                </button>
              </div>

              {addingInteraction && (
                <div className="flex flex-col gap-2 mb-4 p-3 bg-white border border-mercury rounded-lg">
                  <select
                    value={newInterType}
                    onChange={e => setNewInterType(e.target.value as Interaction['type'])}
                    className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                  >
                    {Object.entries(INTERACTION_ICONS).map(([k]) => (
                      <option key={k} value={k}>{k.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Notes (optional)"
                    value={newInterNotes}
                    onChange={e => setNewInterNotes(e.target.value)}
                    rows={2}
                    className="text-sm border border-mercury rounded px-2 py-1 resize-none focus:outline-none focus:border-burnham"
                  />
                  <div className="flex gap-2">
                    <button onClick={logInteraction} className="text-xs px-3 py-1 bg-burnham text-gossip rounded">Save</button>
                    <button onClick={() => setAddingInteraction(false)} className="text-xs px-3 py-1 text-shuttle hover:text-burnham">Cancel</button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {interactions.map(i => (
                  <div key={i.id} className="flex items-start gap-3 p-3 bg-white border border-mercury rounded-lg group">
                    <span className="text-xl leading-none mt-0.5">{INTERACTION_ICONS[i.type] ?? '📝'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-midnight capitalize">{i.type.replace(/_/g, ' ')}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white ${i.direction === 'inbound' ? 'bg-shuttle' : 'bg-burnham'}`}>
                          {i.direction}
                        </span>
                        {i.channel && (
                          <span className="text-xs px-1.5 py-0.5 bg-mercury text-shuttle rounded">{i.channel}</span>
                        )}
                      </div>
                      {i.notes && <p className="text-sm text-shuttle">{i.notes}</p>}
                      {i.next_step && (
                        <p className="text-xs text-burnham mt-1">
                          Next: {i.next_step}
                          {i.next_step_date && ` (by ${i.next_step_date})`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-shuttle">{i.interaction_date}</span>
                      <button
                        onClick={() => deleteInteraction(i.id)}
                        className="opacity-0 group-hover:opacity-100 text-mercury hover:text-red-400 transition-opacity"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {interactions.length === 0 && (
                  <p className="text-sm text-mercury italic text-center py-8">No interactions logged yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ── NOTES tab ── */}
          {tab === 'notes' && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-midnight">Personal Notes</h3>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="Add notes about this person — context, interests, follow-ups..."
                rows={10}
                className="w-full text-sm border border-mercury rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-burnham bg-white"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-burnham text-gossip rounded-lg disabled:opacity-50"
                >
                  <Check size={12} /> {notesSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {contact.personal_context && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-2">Personal Context</h4>
                  <p className="text-sm text-midnight whitespace-pre-wrap">{contact.personal_context}</p>
                </div>
              )}
            </div>
          )}

          {/* ── OPPORTUNITIES tab ── */}
          {tab === 'opportunities' && (
            <div>
              <h3 className="text-sm font-semibold text-midnight mb-4">Linked Opportunities ({opportunities.length})</h3>
              {opportunities.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase size={32} className="text-mercury mx-auto mb-2" />
                  <p className="text-sm text-shuttle">No opportunities linked.</p>
                  <Link to="/people/opportunities" className="text-xs text-burnham hover:underline mt-1 inline-block">
                    Go to Opportunities →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {opportunities.map(opp => (
                    <Link
                      key={opp.id}
                      to={`/people/opportunities/${opp.id}`}
                      className="flex items-center gap-3 p-3 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-midnight">{opp.title}</p>
                        <p className="text-xs text-shuttle">{opp.company?.name ?? 'No company'} · {opp.type}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        opp.stage === 'won' ? 'bg-gossip text-burnham' :
                        opp.stage === 'lost' ? 'bg-red-100 text-red-700' :
                        opp.stage === 'negotiating' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-mercury text-shuttle'
                      }`}>
                        {opp.stage}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right sidebar ── */}
        <aside className="w-[280px] flex-shrink-0 border-l border-mercury bg-white overflow-y-auto px-4 py-5">

          {/* Record Details */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Record Details</h4>
            <div className="flex flex-col gap-3">
              <EditableField label="Full Name" value={contact.name} onSave={v => updateField('name', v ?? contact.name)} />
              <EditableField label="Email" value={contact.email} onSave={v => updateField('email', v)} />
              <EditableField label="Phone" value={contact.phone} onSave={v => updateField('phone', v)} />
              <EditableField label="Job Title" value={contact.job_title} onSave={v => updateField('job_title', v)} />
              <EditableField label="Company" value={contact.company} onSave={v => updateField('company', v)} />
              <EditableField label="Location" value={contact.location} onSave={v => updateField('location', v)} />

              {/* Tier selector */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-shuttle uppercase tracking-wide">Tier</span>
                <select
                  value={contact.tier ?? ''}
                  onChange={e => updateField('tier', e.target.value ? Number(e.target.value) : null)}
                  className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                >
                  <option value="">— Not set</option>
                  <option value="1">T1 — Core</option>
                  <option value="2">T2 — Strategic</option>
                  <option value="3">T3 — Peripheral</option>
                </select>
              </div>

              {/* Status selector */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-shuttle uppercase tracking-wide">Status</span>
                <select
                  value={contact.status}
                  onChange={e => updateField('status', e.target.value)}
                  className="text-sm border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham"
                >
                  {['PROSPECT','INTRO','CONNECTED','ENGAGED','NURTURING','RECONNECT','DORMANT'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <EditableField label="Birthday" value={contact.birthday ?? null} onSave={v => updateField('birthday', v)} />
              <EditableField label="Interests" value={contact.interests ?? null} onSave={v => updateField('interests', v)} multiline />
              <EditableField label="Looking For" value={contact.looking_for ?? null} onSave={v => updateField('looking_for', v)} multiline />
              <EditableField label="Advisory Role" value={contact.advisory_role ?? null} onSave={v => updateField('advisory_role', v)} />
              {contact.linkedin_url && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-shuttle uppercase tracking-wide">LinkedIn</span>
                  <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-burnham hover:underline truncate">
                    {contact.linkedin_url.replace('https://www.linkedin.com/in/', '@')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Channels */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Channels</h4>
            {channels.length === 0 ? (
              <p className="text-xs text-mercury italic">No channels linked.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {channels.map(ch => (
                  <div key={ch.id} className="flex items-center gap-2 p-2 bg-[#FAFAFA] border border-mercury rounded">
                    {CHANNEL_ICONS[ch.channel]}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-midnight">{ch.channel_name || ch.channel_identifier}</p>
                      <p className="text-xs text-shuttle truncate">{ch.channel_identifier}</p>
                    </div>
                    {ch.verified && <Check size={12} className="text-pastel flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lists */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Lists</h4>
            <div className="flex flex-col gap-1">
              {contact.status === 'ENGAGED' || contact.tier === 1 ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gossip text-burnham rounded font-medium">
                  <Star size={10} weight="fill" /> Board of Directors
                </span>
              ) : (
                <p className="text-xs text-mercury italic">Not in any lists.</p>
              )}
            </div>
          </div>

          {/* Linked Opportunities (sidebar summary) */}
          {opportunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Opportunities</h4>
              <div className="flex flex-col gap-1.5">
                {opportunities.map(opp => (
                  <Link
                    key={opp.id}
                    to={`/people/opportunities/${opp.id}`}
                    className="flex items-center justify-between p-2 bg-[#FAFAFA] border border-mercury rounded hover:border-burnham transition-colors"
                  >
                    <span className="text-xs text-midnight truncate">{opp.title}</span>
                    <span className="text-xs text-shuttle ml-2 flex-shrink-0">{opp.stage}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Prev/Next nav */}
          <div className="mt-6 pt-4 border-t border-mercury flex items-center justify-between">
            <button className="flex items-center gap-1 text-xs text-shuttle hover:text-burnham" onClick={() => navigate(-1)}>
              <ArrowLeft size={12} /> Back
            </button>
            <div className="flex gap-2">
              <button className="p-1 text-shuttle hover:text-burnham">
                <ArrowLeft size={14} />
              </button>
              <button className="p-1 text-shuttle hover:text-burnham">
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
