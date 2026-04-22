import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlass, Plus, Target, Table, Kanban,
  DotOutline,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOpportunities } from '@/hooks/useOpportunities'
import type { Opportunity, OpportunityStage, OpportunityType, Company } from '@/types'

// ── constants ─────────────────────────────────────────────────────────────────

const STAGES: OpportunityStage[] = ['exploring', 'active', 'negotiating', 'won', 'lost']

const STAGE_COLORS: Record<OpportunityStage, string> = {
  exploring: 'text-shuttle bg-mercury',
  active: 'text-burnham bg-gossip',
  negotiating: 'text-yellow-800 bg-yellow-100',
  won: 'text-green-800 bg-green-100',
  lost: 'text-red-700 bg-red-100',
}

const STAGE_DOT_COLORS: Record<OpportunityStage, string> = {
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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function formatTarget(dateStr: string | null): string {
  if (!dateStr) return '—'
  const days = daysUntil(dateStr)!
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Today'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── add opp modal ─────────────────────────────────────────────────────────────

function AddOppForm({
  companies,
  onSave,
  onCancel,
}: {
  companies: Company[]
  onSave: (data: Partial<Opportunity>) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<OpportunityType>('job')
  const [stage, setStage] = useState<OpportunityStage>('exploring')
  const [companyId, setCompanyId] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      type,
      stage,
      company_id: companyId || null,
      estimated_value: value ? Number(value) : null,
    })
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-mercury flex-wrap">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Opportunity title *"
        className="flex-1 min-w-[200px] text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
      />
      <select
        value={type}
        onChange={e => setType(e.target.value as OpportunityType)}
        className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
      >
        {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select
        value={stage}
        onChange={e => setStage(e.target.value as OpportunityStage)}
        className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
      >
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={companyId}
        onChange={e => setCompanyId(e.target.value)}
        className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
      >
        <option value="">— No company</option>
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Est. value ($)"
        type="number"
        className="w-28 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
      />
      <button onClick={save} disabled={saving || !title.trim()} className="px-3 py-1.5 bg-burnham text-gossip text-sm rounded disabled:opacity-50">
        Save
      </button>
      <button onClick={onCancel} className="text-sm text-shuttle hover:text-burnham">Cancel</button>
    </div>
  )
}

// ── table view ────────────────────────────────────────────────────────────────

function TableView({
  opps,
  onRowClick,
}: {
  opps: Opportunity[]
  onRowClick: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-mercury bg-white sticky top-0 z-10">
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Title</th>
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Stage</th>
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Company</th>
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Type</th>
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Est. Value</th>
            <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Target Date</th>
          </tr>
        </thead>
        <tbody>
          {opps.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12">
                <Target size={32} className="text-mercury mx-auto mb-2" />
                <p className="text-shuttle text-sm">No opportunities yet.</p>
              </td>
            </tr>
          ) : (
            opps.map(opp => (
              <tr
                key={opp.id}
                onClick={() => onRowClick(opp.id)}
                className="border-b border-mercury hover:bg-gossip/20 cursor-pointer transition-colors"
              >
                <td className="px-3 py-1.5">
                  <p className="font-medium text-midnight">{opp.title}</p>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <DotOutline size={16} weight="fill" className={STAGE_DOT_COLORS[opp.stage]} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[opp.stage]}`}>
                      {opp.stage}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-shuttle">
                  {opp.company?.name ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  <span className="text-xs px-2 py-0.5 bg-mercury text-midnight rounded">{TYPE_LABELS[opp.type]}</span>
                </td>
                <td className="px-3 py-1.5 font-medium text-midnight">
                  {formatValue(opp.estimated_value)}
                </td>
                <td className="px-3 py-1.5 text-shuttle text-xs">
                  <span className={daysUntil(opp.target_date) !== null && daysUntil(opp.target_date)! < 0 ? 'text-red-500' : ''}>
                    {formatTarget(opp.target_date)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ opp, onClick }: { opp: Opportunity; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="p-3 bg-white border border-mercury rounded-lg cursor-pointer hover:border-burnham hover:shadow-sm transition-all"
    >
      <p className="text-sm font-medium text-midnight mb-1">{opp.title}</p>
      {opp.company?.name && (
        <p className="text-xs text-shuttle mb-2">{opp.company.name}</p>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs px-1.5 py-0.5 bg-mercury text-shuttle rounded">{TYPE_LABELS[opp.type]}</span>
        {opp.estimated_value && (
          <span className="text-xs text-burnham font-medium">{formatValue(opp.estimated_value)}</span>
        )}
        {opp.target_date && (
          <span className={`text-xs ml-auto ${daysUntil(opp.target_date)! < 0 ? 'text-red-500' : 'text-shuttle'}`}>
            {formatTarget(opp.target_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── kanban view ───────────────────────────────────────────────────────────────

function KanbanView({
  opps,
  onCardClick,
  onStageChange,
}: {
  opps: Opportunity[]
  onCardClick: (id: string) => void
  onStageChange: (id: string, stage: OpportunityStage) => Promise<void>
}) {
  const [dragging, setDragging] = useState<string | null>(null)

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = opps.filter(o => o.stage === s)
    return acc
  }, {} as Record<OpportunityStage, Opportunity[]>)

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 h-full px-4 py-4 min-w-max">
        {STAGES.map(stage => (
          <div
            key={stage}
            className="flex flex-col w-64 flex-shrink-0"
            onDragOver={e => e.preventDefault()}
            onDrop={async e => {
              e.preventDefault()
              const id = e.dataTransfer.getData('opp-id')
              if (id && id !== dragging) {
                await onStageChange(id, stage)
              }
              setDragging(null)
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <DotOutline size={16} weight="fill" className={STAGE_DOT_COLORS[stage]} />
              <span className="text-xs font-semibold uppercase tracking-wide text-shuttle capitalize">{stage}</span>
              <span className="ml-auto text-xs text-mercury">{byStage[stage].length}</span>
            </div>
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-[100px] p-2 bg-mercury/30 rounded-lg">
              {byStage[stage].map(opp => (
                <div
                  key={opp.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('opp-id', opp.id)
                    setDragging(opp.id)
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={dragging === opp.id ? 'opacity-50' : ''}
                >
                  <KanbanCard opp={opp} onClick={() => onCardClick(opp.id)} />
                </div>
              ))}
              {byStage[stage].length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-mercury">Drop here</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function PeopleOpportunities() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { opportunities, loading, upsert, updateStage } = useOpportunities(user?.id ?? null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('companies').select('*').eq('user_id', user.id).order('name')
      .then(({ data }) => setCompanies(data ?? []))
  }, [user])

  const filtered = opportunities.filter(o =>
    o.title.toLowerCase().includes(search.toLowerCase()) ||
    (o.company?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async (data: Partial<Opportunity>) => {
    if (!user) return
    await upsert({
      title: data.title ?? '',
      type: data.type ?? 'other',
      stage: data.stage ?? 'exploring',
      company_id: data.company_id ?? null,
      estimated_value: data.estimated_value ?? null,
      target_date: null,
      notes: null,
      decision_filter_pass: null,
      interview_prep: null,
      interview_map: null,
      negotiation_prep: null,
    })
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-mercury/60">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-shuttle" />
          <h1 className="text-base font-semibold text-burnham">Opportunities</h1>
          <span className="text-[11px] text-shuttle/40 font-mono">{opportunities.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham bg-white w-40"
            />
          </div>
          {/* view toggle */}
          <div className="flex border border-mercury rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-burnham text-gossip' : 'text-shuttle hover:bg-mercury'}`}
            >
              <Table size={16} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-burnham text-gossip' : 'text-shuttle hover:bg-mercury'}`}
            >
              <Kanban size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-burnham text-gossip text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> New Opportunity
          </button>
        </div>
      </div>

      {showAdd && (
        <AddOppForm companies={companies} onSave={handleSave} onCancel={() => setShowAdd(false)} />
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-shuttle text-sm">Loading...</div>
      ) : viewMode === 'table' ? (
        <TableView opps={filtered} onRowClick={id => navigate(`/people/opportunities/${id}`)} />
      ) : (
        <KanbanView
          opps={filtered}
          onCardClick={id => navigate(`/people/opportunities/${id}`)}
          onStageChange={updateStage}
        />
      )}

      <div className="px-6 py-2 bg-white border-t border-mercury text-xs text-shuttle">
        {filtered.length} {filtered.length === 1 ? 'opportunity' : 'opportunities'}
      </div>
    </div>
  )
}
