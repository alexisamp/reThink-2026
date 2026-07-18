import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import {
  Icon, CompanyCell, AbmChip, AccountStageChip, CoverageMini, PeopleStack,
  NextStepCell, Mono, Avatar, AbmStrategyBlock, CoverageStrip,
  type StackPerson,
} from '@/components/crm/cells'
import {
  ICP_CFG, ACCOUNT_SOURCE_CFG, MOTION_CFG, ACCOUNT_STAGE_CFG, ACCOUNT_STAGE_ORDER,
} from '@/lib/crmConfig'
import { accountCoverage, personForCoverage, type CoveragePerson, type Coverage } from '@/lib/abm'
import { companyImage } from '@/lib/crmObjects'
import type { Company } from '@/types'

interface CompanyRow extends Company {
  people: StackPerson[]
  active_opps: number
  last_interaction_at: string | null
  _icp: string | null
  _stage: string | null
  _cov: Coverage | null
}

// Real `icp` is free text — map onto the handoff's closed ICP keys.
function normIcp(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s === 'icp1' || s === 'icp2' || s === 'icp3') return s
  if (/\b1\b|seed|series\s*a/.test(s)) return 'icp1'
  if (/\b2\b|series\s*b|saas/.test(s)) return 'icp2'
  if (/\b3\b|network|b2b/.test(s)) return 'icp3'
  return null
}

// Real `account_stage` to handoff stage key (keep raw if unknown; chip renders it).
function normStage(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (ACCOUNT_STAGE_CFG[s]) return s
  if (/qualified|research|prospect/.test(s)) return 'target'
  if (/active|engaged/.test(s)) return 'conversation'
  if (/customer|won|opportunit/.test(s)) return 'opportunity'
  return v
}

function normMotion(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  return MOTION_CFG[s] ? s : null
}
function normSource(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  return ACCOUNT_SOURCE_CFG[s] ? s : null
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
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

export default function PeopleCompanies() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('table')
  const [peekId, setPeekId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSector, setNewSector] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: companies }, { data: contacts }, { data: opps }] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', user.id).order('name'),
      supabase.from('contacts').select('id, name, company, company_id, job_title, connection_strength, last_interaction_at, profile_photo_url, tier').eq('user_id', user.id),
      supabase.from('opportunities').select('id, company_id, stage').eq('user_id', user.id),
    ])

    // people grouped per company (by id and by name, since contacts can carry either)
    const byId = new Map<string, typeof contacts>()
    const byName = new Map<string, typeof contacts>()
    for (const c of contacts ?? []) {
      if (c.company_id) { const a = byId.get(c.company_id) ?? []; a.push(c); byId.set(c.company_id, a) }
      if (c.company) { const k = c.company.toLowerCase(); const a = byName.get(k) ?? []; a.push(c); byName.set(k, a) }
    }
    const coveragePeople: CoveragePerson[] = (contacts ?? []).map(personForCoverage)

    const oppsByCompany = new Map<string, number>()
    for (const o of opps ?? []) {
      if (!o.company_id) continue
      if (['exploring', 'active', 'negotiating'].includes(o.stage)) {
        oppsByCompany.set(o.company_id, (oppsByCompany.get(o.company_id) ?? 0) + 1)
      }
    }

    const enriched: CompanyRow[] = (companies ?? []).map(co => {
      const people = byId.get(co.id) ?? byName.get(co.name.toLowerCase()) ?? []
      const lastInt = people.map(p => p.last_interaction_at).filter((x): x is string => !!x).sort().pop() ?? null
      const _icp = normIcp(co.icp)
      return {
        ...co,
        people: people.map(p => ({ id: p.id, name: p.name, avatar: p.profile_photo_url })),
        active_opps: oppsByCompany.get(co.id) ?? 0,
        last_interaction_at: lastInt,
        _icp,
        _stage: normStage(co.account_stage),
        _cov: accountCoverage({ name: co.name, icp: _icp }, coveragePeople),
      }
    })
    setRows(enriched)
    setLoading(false)
  }

  const addCompany = async () => {
    if (!user || !newName.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({ user_id: user.id, name: newName.trim(), sector: newSector.trim() || null })
    setNewName(''); setNewSector(''); setShowAdd(false); setSaving(false)
    await load()
  }

  const moveStage = async (row: CompanyRow, stage: string | null) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, _stage: stage, account_stage: stage } : r))
    await supabase.from('companies').update({ account_stage: stage }).eq('id', row.id)
  }

  const peek = rows.find(r => r.id === peekId) ?? null
  const peekIndex = peek ? rows.findIndex(r => r.id === peek.id) : -1

  const columns: CrmColumn<CompanyRow>[] = useMemo(() => [
    { key: 'name', label: 'Company', icon: <Icon name="buildings" size={12} />, width: '190px', locked: true, render: r => <CompanyCell name={r.name} mark={r.name[0]?.toUpperCase()} /> },
    { key: 'icp', label: 'ICP', icon: <Icon name="crosshair" size={12} />, width: '150px', render: r => r._icp ? <AbmChip cfg={ICP_CFG} value={r._icp} kind="icp" accent /> : <span className="crm-chip muted">Connector</span> },
    { key: 'stage', label: 'Stage', icon: <Icon name="flag" size={12} />, width: '128px', render: r => <AccountStageChip stage={r._stage} /> },
    { key: 'coverage', label: 'Coverage', icon: <Icon name="users-three" size={12} />, width: '96px', render: r => <CoverageMini cov={r._cov} icp={r._icp} /> },
    { key: 'people', label: 'Who you know', icon: <Icon name="users" size={12} />, width: '128px', render: r => <PeopleStack people={r.people} /> },
    { key: 'next', label: 'Next step', icon: <Icon name="arrow-bend-up-right" size={12} />, width: 'minmax(240px, 1fr)', render: r => <NextStepCell value={r.next_step} /> },
    // available attributes
    { key: 'source', label: 'Source', icon: <Icon name="magnet" size={12} />, width: '128px', defaultOff: true, render: r => normSource(r.source) ? <AbmChip cfg={ACCOUNT_SOURCE_CFG} value={normSource(r.source)} kind="src" /> : <span className="crm-empty">—</span> },
    { key: 'motion', label: 'Motion', icon: <Icon name="crosshair" size={12} />, width: '170px', defaultOff: true, render: r => normMotion(r.motion) ? <AbmChip cfg={MOTION_CFG} value={normMotion(r.motion)} kind="mot" /> : <span className="crm-empty">—</span> },
    { key: 'opps', label: 'Opportunities', icon: <Icon name="target" size={12} />, width: '108px', align: 'right', defaultOff: true, render: r => <Mono dim={!r.active_opps}>{r.active_opps || '—'}</Mono> },
    { key: 'industry', label: 'Industry', icon: <Icon name="briefcase" size={12} />, width: '150px', defaultOff: true, render: r => r.sector ? <span className="crm-chip muted">{r.sector}</span> : <span className="crm-empty">—</span> },
    { key: 'last', label: 'Last activity', icon: <Icon name="clock" size={12} />, width: '96px', align: 'right', defaultOff: true, render: r => <Mono dim>{formatAgo(r.last_interaction_at)}</Mono> },
  ], [])

  const views = [
    { id: 'table', label: 'All companies', type: 'table' as const },
    { id: 'stage', label: 'By stage', type: 'kanban' as const },
    { id: 'icp', label: 'By ICP', type: 'kanban' as const },
  ]

  const kanban = view === 'stage'
    ? {
        groupLabel: 'Stage',
        stages: [{ id: null, label: 'Unstaged', color: 'var(--mercury)' }, ...ACCOUNT_STAGE_ORDER.map(id => ({ id, label: ACCOUNT_STAGE_CFG[id].label!, color: ACCOUNT_STAGE_CFG[id].color }))],
        groupValue: (r: CompanyRow) => (r._stage && ACCOUNT_STAGE_CFG[r._stage] ? r._stage : null),
        cardColumns: ['icp', 'coverage', 'next'],
        onMove: moveStage,
      }
    : view === 'icp'
    ? {
        groupLabel: 'ICP',
        stages: [...Object.keys(ICP_CFG).map(id => ({ id, label: `${ICP_CFG[id].label} · ${ICP_CFG[id].tag}`, color: ICP_CFG[id].color })), { id: null, label: 'Connector / investor', color: 'var(--shuttle)' }],
        groupValue: (r: CompanyRow) => r._icp,
        cardColumns: ['stage', 'coverage', 'next'],
      }
    : undefined

  return (
    <div className="ppl-page wide">
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Companies</h1>
          <p className="ppl-sub">The account is the unit. ICP sets the play, coverage shows who's inside, next step keeps it moving.</p>
        </div>
      </header>

      {showAdd && (
        <div className="people-record-addbar flex items-center gap-3 px-6 py-3 bg-white border-b border-mercury">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Company name *" autoFocus
            className="flex-1 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
            onKeyDown={e => { if (e.key === 'Enter') addCompany(); if (e.key === 'Escape') setShowAdd(false) }} />
          <input value={newSector} onChange={e => setNewSector(e.target.value)} placeholder="Industry"
            className="w-44 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham" />
          <button onClick={addCompany} disabled={saving || !newName.trim()} className="px-3 py-1.5 bg-burnham text-gossip text-sm rounded disabled:opacity-50">Save</button>
          <button onClick={() => setShowAdd(false)} className="text-sm text-shuttle hover:text-burnham">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-shuttle">Loading...</div>
      ) : (
        <CrmTable
          entity="companies"
          viewName="All companies"
          sortLabel="Stage"
          rows={rows}
          columns={columns}
          view={view}
          onViewChange={setView}
          views={views}
          addLabel="New company"
          onAdd={() => setShowAdd(v => !v)}
          onRowClick={r => setPeekId(r.id)}
          selectedId={peekId}
          storageKey="companies-abm"
          kanban={kanban}
        />
      )}

      <RecordPeek
        open={Boolean(peek)}
        title={peek?.name ?? ''}
        subtitle={peek?.sector || peek?.hq_location || undefined}
        eyebrow="All companies"
        avatar={peek ? <Avatar src={companyImage(peek.logo_url, peek.domain, peek.favicon_url)} name={peek.name} sq size={40} /> : undefined}
        fields={peek ? [
          { label: 'Name', icon: <Icon name="buildings" size={12} />, value: peek.name },
          { label: 'People', icon: <Icon name="users" size={12} />, value: peek.people.length },
          { label: 'Opportunities', icon: <Icon name="target" size={12} />, value: peek.active_opps },
        ] : []}
        highlights={peek ? [
          { label: 'Annual revenue', icon: <Icon name="chart-line-up" size={13} />, value: '—' },
          { label: 'Funding', icon: <Icon name="rocket-launch" size={13} />, value: '—' },
          { label: 'Linked people', icon: <Icon name="users" size={13} />, value: `${peek.people.length} people` },
          { label: 'Open opportunities', icon: <Icon name="target" size={13} />, value: peek.active_opps },
          { label: 'Headcount', icon: <Icon name="users-three" size={13} />, value: formatNumber(peek.employees_count) },
          { label: 'Industry', icon: <Icon name="briefcase" size={13} />, value: peek.sector || '—' },
        ] : []}
        overviewBeforeHighlights
        onClose={() => setPeekId(null)}
        onPrev={peekIndex > 0 ? () => setPeekId(rows[peekIndex - 1].id) : undefined}
        onNext={peekIndex >= 0 && peekIndex < rows.length - 1 ? () => setPeekId(rows[peekIndex + 1].id) : undefined}
      >
        {peek && (
          <>
            <div className="peek-block-label">Account strategy</div>
            <AbmStrategyBlock company={{ icp: peek._icp, source: normSource(peek.source), motion: normMotion(peek.motion), stage: peek._stage, reason: peek.key_insight, gtm: peek.description, nextStep: peek.next_step }} />
            <div className="peek-block-label spaced">Account coverage <Icon name="users-three" size={11} /></div>
            <CoverageStrip cov={peek._cov} icp={peek._icp} />
            <div className="peek-block-label spaced">Linked people <span className="peek-count">{peek.people.length}</span></div>
            {peek.people.length ? (
              <div className="peek-linked">
                {peek.people.map(p => (
                  <div className="pk-person" key={p.id}>
                    <Avatar src={p.avatar} name={p.name} size={28} />
                    <div className="pk-person-txt"><span className="pk-person-name">{p.name}</span></div>
                  </div>
                ))}
              </div>
            ) : <p className="peek-empty-lists">No one mapped inside yet — a company you can't reach.</p>}
          </>
        )}
      </RecordPeek>
    </div>
  )
}
