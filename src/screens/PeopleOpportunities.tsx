import { useState, useEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Buildings, CalendarBlank, CurrencyDollar, MagnifyingGlass, Plus, Target, Table, Kanban,
  Flag, Funnel, ArrowBendUpRight,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOpportunities } from '@/hooks/useOpportunities'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
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

// ── main screen ───────────────────────────────────────────────────────────────

export default function PeopleOpportunities() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { opportunities, loading, upsert, updateStage } = useOpportunities(user?.id ?? null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [showAdd, setShowAdd] = useState(false)
  const [peekId, setPeekId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('companies').select('*').eq('user_id', user.id).order('name')
      .then(({ data }) => setCompanies(data ?? []))
  }, [user])

  const filtered = opportunities.filter(o =>
    o.title.toLowerCase().includes(search.toLowerCase()) ||
    (o.company?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const peek = filtered.find(row => row.id === peekId) ?? null
  const peekIndex = peek ? filtered.findIndex(row => row.id === peek.id) : -1

  const columns: CrmColumn<Opportunity>[] = [
    {
      key: 'title',
      label: 'Opportunity',
      locked: true,
      width: 'minmax(220px, 1.4fr)',
      icon: <Target size={12} />,
      render: opp => <span className="font-medium text-burnham">{opp.title}</span>,
    },
    {
      key: 'stage',
      label: 'Stage',
      width: '150px',
      render: opp => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_COLORS[opp.stage]}`}>
          {opp.stage}
        </span>
      ),
    },
    {
      key: 'company',
      label: 'Company',
      width: 'minmax(150px, 1fr)',
      icon: <Buildings size={12} />,
      render: opp => <span className="text-shuttle">{opp.company?.name ?? '—'}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      width: '120px',
      render: opp => <span className="text-shuttle">{TYPE_LABELS[opp.type]}</span>,
    },
    {
      key: 'value',
      label: 'Value',
      width: '110px',
      align: 'right',
      icon: <CurrencyDollar size={12} />,
      render: opp => <span className="font-medium text-burnham">{formatValue(opp.estimated_value)}</span>,
    },
    {
      key: 'target',
      label: 'Target',
      width: '120px',
      icon: <CalendarBlank size={12} />,
      render: opp => (
        <span className={daysUntil(opp.target_date) !== null && daysUntil(opp.target_date)! < 0 ? 'text-red-500' : 'text-shuttle'}>
          {formatTarget(opp.target_date)}
        </span>
      ),
    },
  ]

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
    <div className="ppl-page">
      {/* header */}
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Opportunities</h1>
          <p className="ppl-sub">Each one is a network of stakeholders, not a pipeline row. Who's in, who's missing, what's the gap.</p>
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
            className="crm-tool primary"
          >
            <Plus size={14} /> <span>New opportunity</span>
          </button>
        </div>
      </header>

      {showAdd && (
        <AddOppForm companies={companies} onSave={handleSave} onCancel={() => setShowAdd(false)} />
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-shuttle text-sm">Loading...</div>
      ) : (
        <div>
          <CrmTable
            entity="opportunities"
            title="Pipeline"
            viewName="Table"
            rows={filtered}
            columns={columns}
            view={viewMode}
            onViewChange={v => setViewMode(v as 'table' | 'kanban')}
            views={[
              { id: 'table', label: 'Table', type: 'table' },
              { id: 'kanban', label: 'Kanban', type: 'kanban' },
            ]}
            addLabel="New Opportunity"
            onAdd={() => setShowAdd(true)}
            onRowClick={opp => setPeekId(opp.id)}
            storageKey="opportunities"
            kanban={{
              groupLabel: 'Stage',
              stages: STAGES.map(stage => ({
                id: stage,
                label: stage,
                color: {
                  exploring: '#9CA3AF',
                  active: '#79D65E',
                  negotiating: '#EAB308',
                  won: '#22C55E',
                  lost: '#F87171',
                }[stage],
              })),
              groupValue: opp => opp.stage,
              cardColumns: ['company', 'value', 'target'],
              onMove: (opp, stage) => updateStage(opp.id, (stage ?? 'exploring') as OpportunityStage),
            }}
          />
        </div>
      )}

      <RecordPeek
        open={Boolean(peek)}
        title={peek?.title ?? ''}
        subtitle={peek ? [peek.company?.name, TYPE_LABELS[peek.type]].filter(Boolean).join(' · ') : undefined}
        eyebrow="Opportunity"
        highlights={peek ? [
          { label: 'Stage', icon: <Flag size={13} />, value: peek.stage },
          { label: 'Value', icon: <CurrencyDollar size={13} />, value: formatValue(peek.estimated_value) },
          { label: 'Decision filter', icon: <Funnel size={13} />, value: peek.decision_filter_pass == null ? '—' : peek.decision_filter_pass ? 'Pass' : 'Fail' },
          { label: 'Next step', icon: <ArrowBendUpRight size={13} />, value: peek.notes || '—' },
        ] : []}
        fields={peek ? [
          { label: 'Value', icon: <CurrencyDollar size={12} />, value: formatValue(peek.estimated_value) },
          { label: 'Company', icon: <Buildings size={12} />, value: peek.company?.name || '—' },
        ] : []}
        recommendedMove={peek?.notes ? {
          verb: peek.notes,
          detail: peek.target_date ? `Target ${formatTarget(peek.target_date)}` : 'Opportunity next step.',
          action: peek.notes,
          accent: 'var(--moss)',
        } : null}
        onClose={() => setPeekId(null)}
        onOpenFull={() => peek && navigate(`/people/opportunities/${peek.id}`)}
        onPrev={peekIndex > 0 ? () => setPeekId(filtered[peekIndex - 1].id) : undefined}
        onNext={peekIndex >= 0 && peekIndex < filtered.length - 1 ? () => setPeekId(filtered[peekIndex + 1].id) : undefined}
      >
        <div className="peek-block-label spaced">Account <span className="peek-hint">this role hangs off the account</span></div>
        <div className="opp-acct">
          <div className="opp-acct-top">
            <span className="crm-name">
              <span className="crm-av sq logo">{peek?.company?.name?.[0] ?? '?'}</span>
              <span>{peek?.company?.name || 'No company'}</span>
            </span>
          </div>
        </div>

        <div className="peek-block-label spaced">Objective</div>
        <p className="peek-objective">{peek?.notes || `${TYPE_LABELS[peek?.type ?? 'other']} opportunity`}</p>
        {peek?.target_date && <div className="peek-ms-line"><Flag size={12} />{formatTarget(peek.target_date)}</div>}

        <div className="peek-block-label spaced">Stakeholder map <span className="peek-hint">cast from the account roster</span></div>
        <div className="peek-stakeholders">
          <div className="stk-row ghost" style={{ '--stk': 'var(--fg-3)' } as CSSProperties}>
            <div className="stk-hd">
              <span className="stk-ghost-av">?</span>
              <span className="stk-name">No stakeholders mapped</span>
              <span className="stk-role">unknown</span>
              <span className="stk-touch">not mapped</span>
            </div>
          </div>
        </div>

        <div className="peek-block-label spaced">Gaps to close</div>
        <ul className="peek-gaps">
          <li><Target size={12} /> {peek?.interview_prep ? 'Review interview prep' : 'Map the stakeholder path'}</li>
        </ul>
      </RecordPeek>

    </div>
  )
}
