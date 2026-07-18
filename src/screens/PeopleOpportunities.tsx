import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOpportunities } from '@/hooks/useOpportunities'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import {
  Icon, CompanyCell, AbmChip, StageChip, FilterCell, CloserCell, NextStepCell, Mono,
  AccountStageChip,
} from '@/components/crm/cells'
import { ICP_CFG } from '@/lib/crmConfig'
import type { Opportunity, OpportunityStage, OpportunityType, Company } from '@/types'

const TYPE_LABELS: Record<OpportunityType, string> = {
  job: 'Job', consulting: 'Consulting', business: 'Business', partnership: 'Partnership', other: 'Other',
}
const STAGES: OpportunityStage[] = ['exploring', 'active', 'negotiating', 'won', 'lost']

// Map real opp stage to handoff STAGE_CFG key for StageChip.
const STAGE_MAP: Record<OpportunityStage, string> = {
  exploring: 'prospect', active: 'qualified', negotiating: 'closing', won: 'won', lost: 'prospect',
}
// CLOSER score (1–6) derived from stage when not explicitly scored.
const CLOSER_BY_STAGE: Record<OpportunityStage, number> = {
  exploring: 2, active: 3, negotiating: 4, won: 6, lost: 1,
}

function normIcp(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s === 'icp1' || s === 'icp2' || s === 'icp3') return s
  if (/\b1\b|seed|series\s*a/.test(s)) return 'icp1'
  if (/\b2\b|series\s*b|saas/.test(s)) return 'icp2'
  if (/\b3\b|network|b2b/.test(s)) return 'icp3'
  return null
}

function formatValue(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
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

function AddOppForm({ companies, onSave, onCancel }: {
  companies: Company[]; onSave: (data: Partial<Opportunity>) => Promise<void>; onCancel: () => void
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
    await onSave({ title: title.trim(), type, stage, company_id: companyId || null, estimated_value: value ? Number(value) : null })
    setSaving(false)
  }
  return (
    <div className="people-record-addbar flex items-center gap-3 px-6 py-3 bg-white border-b border-mercury flex-wrap">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Opportunity title *" autoFocus
        className="flex-1 min-w-[200px] text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }} />
      <select value={type} onChange={e => setType(e.target.value as OpportunityType)} className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham">
        {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={stage} onChange={e => setStage(e.target.value as OpportunityStage)} className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham">
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham">
        <option value="">— No company</option>
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="Est. value ($)" type="number" className="w-28 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham" />
      <button onClick={save} disabled={saving || !title.trim()} className="px-3 py-1.5 bg-burnham text-gossip text-sm rounded disabled:opacity-50">Save</button>
      <button onClick={onCancel} className="text-sm text-shuttle hover:text-burnham">Cancel</button>
    </div>
  )
}

export default function PeopleOpportunities() {
  const { user } = useAuth()
  const { opportunities, loading, upsert } = useOpportunities(user?.id ?? null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [peekId, setPeekId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('companies').select('*').eq('user_id', user.id).order('name').then(({ data }) => setCompanies(data ?? []))
  }, [user])

  const rows = opportunities
  const peek = rows.find(o => o.id === peekId) ?? null
  const peekIndex = peek ? rows.findIndex(o => o.id === peek.id) : -1
  const mark = (o: Opportunity) => (o.company?.name?.[0] ?? o.title[0] ?? '?').toUpperCase()

  const columns: CrmColumn<Opportunity>[] = [
    { key: 'title', label: 'Opportunity', icon: <Icon name="target" size={12} />, width: '210px', locked: true, render: o => <span className="crm-name"><span className="crm-av sq logo opp">{mark(o)}</span><span className="link">{o.title}</span></span> },
    { key: 'company', label: 'Company', icon: <Icon name="buildings" size={12} />, width: '160px', render: o => o.company ? <CompanyCell name={o.company.name} mark={mark(o)} /> : <span className="crm-empty">—</span> },
    { key: 'icp', label: 'ICP', icon: <Icon name="crosshair" size={12} />, width: '120px', render: o => { const icp = normIcp(o.company?.icp); return icp ? <AbmChip cfg={ICP_CFG} value={icp} kind="icp" accent /> : <span className="crm-empty">—</span> } },
    { key: 'stage', label: 'Stage', icon: <Icon name="flag" size={12} />, width: '130px', render: o => <StageChip stage={STAGE_MAP[o.stage]} /> },
    { key: 'value', label: 'Value', icon: <Icon name="currency-dollar" size={12} />, width: '92px', align: 'right', render: o => <Mono dim={o.estimated_value == null}>{formatValue(o.estimated_value)}</Mono> },
    { key: 'filter', label: 'Decision filter', icon: <Icon name="funnel" size={12} />, width: '108px', render: o => <FilterCell pass={o.decision_filter_pass ?? false} /> },
    { key: 'closer', label: 'CLOSER', icon: <Icon name="squares-four" size={12} />, width: '146px', render: o => <CloserCell score={CLOSER_BY_STAGE[o.stage]} /> },
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
      target_date: null, notes: null, decision_filter_pass: null,
      interview_prep: null, interview_map: null, negotiation_prep: null,
    })
    setShowAdd(false)
  }

  return (
    <div className="ppl-page opportunities-page">
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
          viewName="Active pipeline"
          sortLabel="Stage"
          rows={rows}
          columns={columns}
          addLabel="New opportunity"
          onAdd={() => setShowAdd(v => !v)}
          onRowClick={o => setPeekId(o.id)}
          selectedId={peekId}
          storageKey="opportunities-abm"
        />
      )}

      <RecordPeek
        open={Boolean(peek)}
        title={peek?.title ?? ''}
        subtitle={peek ? [peek.company?.name, TYPE_LABELS[peek.type]].filter(Boolean).join(' · ') : undefined}
        eyebrow="Active pipeline"
        fields={peek ? [
          { label: 'Value', icon: <Icon name="currency-dollar" size={12} />, value: formatValue(peek.estimated_value) },
          { label: 'Company', icon: <Icon name="buildings" size={12} />, value: peek.company?.name || '—' },
        ] : []}
        highlights={peek ? [
          { label: 'Stage', icon: <Icon name="flag" size={13} />, value: <StageChip stage={STAGE_MAP[peek.stage]} /> },
          { label: 'Value', icon: <Icon name="currency-dollar" size={13} />, value: <Mono>{formatValue(peek.estimated_value)}</Mono> },
          { label: 'Decision filter', icon: <Icon name="funnel" size={13} />, value: <FilterCell pass={peek.decision_filter_pass ?? false} /> },
          { label: 'Next step', icon: <Icon name="arrow-bend-up-right" size={13} />, value: <NextStepCell value={peek.notes} /> },
        ] : []}
        overviewBeforeHighlights
        onClose={() => setPeekId(null)}
        onPrev={peekIndex > 0 ? () => setPeekId(rows[peekIndex - 1].id) : undefined}
        onNext={peekIndex >= 0 && peekIndex < rows.length - 1 ? () => setPeekId(rows[peekIndex + 1].id) : undefined}
      >
        {peek && (
          <>
            <div className="peek-block-label spaced">Account <span className="peek-hint">this role hangs off the account</span></div>
            <div className="opp-acct">
              <div className="opp-acct-top">
                <CompanyCell name={peek.company?.name ?? null} mark={mark(peek)} />
                {normIcp(peek.company?.icp) && <AbmChip cfg={ICP_CFG} value={normIcp(peek.company?.icp)} kind="icp" accent />}
                {peek.company?.account_stage && <AccountStageChip stage={peek.company.account_stage} />}
              </div>
            </div>

            <div className="peek-block-label spaced">Objective</div>
            <p className="peek-objective">{peek.notes || `${TYPE_LABELS[peek.type]} opportunity${peek.company ? ` with ${peek.company.name}` : ''}.`}</p>
            {peek.target_date && <div className="peek-ms-line"><Icon name="flag" size={12} />{formatTarget(peek.target_date)}</div>}

            <div className="peek-block-label spaced">Stakeholder map <span className="peek-hint">cast from the account roster</span></div>
            <div className="peek-stakeholders">
              <div className="stk-row ghost">
                <div className="stk-hd">
                  <span className="stk-ghost-av"><Icon name="user-circle-dashed" size={20} /></span>
                  <span className="stk-name">No stakeholders mapped</span>
                  <span className="stk-role">unknown</span>
                  <span className="stk-touch">not mapped</span>
                </div>
              </div>
            </div>
          </>
        )}
      </RecordPeek>
    </div>
  )
}
