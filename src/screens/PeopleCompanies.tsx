import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass, Plus, Buildings, Users, UsersThree, MapPin, ChartLineUp, RocketLaunch, Target, Briefcase } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import type { Company } from '@/types'

interface CompanyRow extends Company {
  people_count: number
  active_opps: number
  last_interaction_at: string | null
}

const COMPANY_STAGES = [
  { id: null, label: 'Unstaged', color: '#9CA3AF' },
  { id: 'research', label: 'Research', color: '#94A3B8' },
  { id: 'qualified', label: 'Qualified', color: '#79D65E' },
  { id: 'active', label: 'Active', color: '#3E7A4E' },
  { id: 'customer', label: 'Customer', color: '#22C55E' },
  { id: 'nurture', label: 'Nurture', color: '#EAB308' },
]

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatAgo(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function CompanyAvatar({ company, size = 8 }: { company: Company; size?: number }) {
  const logoSrc = company.logo_url
    || (company.domain
      ? `https://www.google.com/s2/favicons?domain=${company.domain}&sz=128`
      : null)

  const dim = `w-${size} h-${size}`
  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        className={`${dim} rounded object-cover border border-mercury bg-white`}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  const letter = company.name[0]?.toUpperCase() ?? '?'
  return (
    <div className={`${dim} rounded bg-gossip flex items-center justify-center text-burnham font-semibold text-sm border border-pastel`}>
      {letter}
    </div>
  )
}

export default function PeopleCompanies() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSector, setNewSector] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [peekId, setPeekId] = useState<string | null>(null)

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
      supabase.from('outreach_logs').select('id, company_id, last_interaction_at').eq('user_id', user.id),
      supabase.from('opportunities').select('id, company_id, stage').eq('user_id', user.id),
    ])

    const contactsByCompany = new Map<string, Array<{ id: string; company_id: string | null; last_interaction_at: string | null }>>()
    for (const c of (contacts ?? [])) {
      if (!c.company_id) continue
      const arr = contactsByCompany.get(c.company_id) ?? []
      arr.push(c)
      contactsByCompany.set(c.company_id, arr)
    }

    const oppsByCompany = new Map<string, number>()
    for (const o of (opps ?? [])) {
      if (!o.company_id) continue
      if (['exploring', 'active', 'negotiating'].includes(o.stage)) {
        oppsByCompany.set(o.company_id, (oppsByCompany.get(o.company_id) ?? 0) + 1)
      }
    }

    const enriched: CompanyRow[] = (companies ?? []).map(co => {
      const people = contactsByCompany.get(co.id) ?? []
      const lastInt = people
        .map(p => p.last_interaction_at)
        .filter((x): x is string => x !== null)
        .sort()
        .pop() ?? null
      return {
        ...co,
        people_count: people.length,
        active_opps: oppsByCompany.get(co.id) ?? 0,
        last_interaction_at: lastInt,
      }
    })

    setRows(enriched)
    setLoading(false)
  }

  const addCompany = async () => {
    if (!user || !newName.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      user_id: user.id,
      name: newName.trim(),
      sector: newSector.trim() || null,
      domain: newDomain.trim() || null,
    })
    setNewName('')
    setNewSector('')
    setNewDomain('')
    setShowAdd(false)
    setSaving(false)
    await load()
  }

  const filtered = rows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.sector ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const peek = filtered.find(row => row.id === peekId) ?? null
  const peekIndex = peek ? filtered.findIndex(row => row.id === peek.id) : -1

  const updateAccountStage = async (company: CompanyRow, stage: string | null) => {
    setRows(prev => prev.map(row => row.id === company.id ? { ...row, account_stage: stage } : row))
    await supabase.from('companies').update({ account_stage: stage }).eq('id', company.id)
  }

  const columns: CrmColumn<CompanyRow>[] = [
    {
      key: 'company',
      label: 'Company',
      locked: true,
      width: 'minmax(250px, 1.5fr)',
      icon: <Buildings size={12} />,
      render: row => (
        <span className="flex min-w-0 items-center gap-2.5">
          <CompanyAvatar company={row} size={8} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-burnham">{row.name}</span>
            <span className="block truncate text-[10px] text-shuttle/60">{row.headline || row.domain || '—'}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'stage',
      label: 'Stage',
      width: '130px',
      render: row => <span className="text-shuttle capitalize">{row.account_stage || '—'}</span>,
    },
    {
      key: 'icp',
      label: 'ICP',
      width: '120px',
      defaultOff: true,
      render: row => <span className="text-shuttle">{row.icp || '—'}</span>,
    },
    {
      key: 'motion',
      label: 'Motion',
      width: '120px',
      defaultOff: true,
      render: row => <span className="text-shuttle">{row.motion || '—'}</span>,
    },
    {
      key: 'sector',
      label: 'Industry',
      width: '150px',
      render: row => row.sector ? <span className="rounded bg-mercury px-2 py-0.5 text-[11px] text-burnham">{row.sector}</span> : <span className="text-shuttle">—</span>,
    },
    {
      key: 'employees',
      label: 'Employees',
      width: '110px',
      icon: <Users size={12} />,
      render: row => <span className="text-burnham">{formatNumber(row.employees_count ?? row.members_on_linkedin)}</span>,
    },
    {
      key: 'location',
      label: 'HQ',
      width: '170px',
      icon: <MapPin size={12} />,
      render: row => <span className="text-shuttle">{row.hq_location || '—'}</span>,
    },
    {
      key: 'people',
      label: 'People',
      width: '90px',
      icon: <UsersThree size={12} />,
      render: row => <span className={row.people_count > 0 ? 'font-medium text-burnham' : 'text-shuttle/40'}>{row.people_count || '—'}</span>,
    },
    {
      key: 'opps',
      label: 'Opps',
      width: '80px',
      render: row => <span className={row.active_opps > 0 ? 'font-medium text-burnham' : 'text-shuttle/40'}>{row.active_opps || '—'}</span>,
    },
    {
      key: 'next_step',
      label: 'Next Step',
      width: 'minmax(160px, 1fr)',
      defaultOff: true,
      render: row => <span className="text-shuttle">{row.next_step || '—'}</span>,
    },
    {
      key: 'last',
      label: 'Last Contact',
      width: '110px',
      render: row => <span className="text-shuttle">{formatAgo(daysSince(row.last_interaction_at))}</span>,
    },
  ]

  return (
    <div className="ppl-page wide">
      {/* header */}
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Companies</h1>
          <p className="ppl-sub">Every organization in your orbit — who you know inside, what's open there, and the next move.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="pl-8 pr-3 py-1.5 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham bg-white w-48"
            />
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="crm-tool primary"
          >
            <Plus size={14} /> <span>New</span>
          </button>
        </div>
      </header>

      {/* add form */}
      {showAdd && (
        <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-mercury">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Company name *"
            className="flex-1 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addCompany(); if (e.key === 'Escape') setShowAdd(false) }}
          />
          <input
            value={newSector}
            onChange={e => setNewSector(e.target.value)}
            placeholder="Sector"
            className="w-36 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
          />
          <input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="Domain (e.g. acme.com)"
            className="w-48 text-sm border border-mercury rounded px-2 py-1.5 focus:outline-none focus:border-burnham"
          />
          <button
            onClick={addCompany}
            disabled={saving || !newName.trim()}
            className="px-3 py-1.5 bg-burnham text-gossip text-sm rounded disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setShowAdd(false)} className="text-sm text-shuttle hover:text-burnham">Cancel</button>
        </div>
      )}

      <div>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-shuttle">Loading...</div>
        ) : (
          <CrmTable
            entity="companies"
            title={search ? `Search: ${search}` : 'Accounts'}
            viewName="Table"
            rows={filtered}
            columns={columns}
            view={viewMode}
            onViewChange={v => setViewMode(v as 'table' | 'kanban')}
            views={[
              { id: 'table', label: 'Table', type: 'table' },
              { id: 'kanban', label: 'Kanban', type: 'kanban' },
            ]}
            addLabel="New Company"
            onAdd={() => setShowAdd(true)}
            onRowClick={row => setPeekId(row.id)}
            storageKey="companies"
            kanban={{
              groupLabel: 'Account stage',
              stages: COMPANY_STAGES,
              groupValue: row => row.account_stage ?? null,
              cardColumns: ['sector', 'people', 'opps', 'next_step'],
              onMove: updateAccountStage,
            }}
          />
        )}
      </div>

      <RecordPeek
        open={Boolean(peek)}
        title={peek?.name ?? ''}
        subtitle={peek ? [peek.sector, peek.hq_location].filter(Boolean).join(' · ') || peek.domain || undefined : undefined}
        eyebrow="Company"
        highlights={peek ? [
          { label: 'Annual revenue', icon: <ChartLineUp size={13} />, value: '—' },
          { label: 'Funding', icon: <RocketLaunch size={13} />, value: '—' },
          { label: 'Linked people', icon: <Users size={13} />, value: `${peek.people_count} people` },
          { label: 'Open opportunities', icon: <Target size={13} />, value: peek.active_opps },
          { label: 'Headcount', icon: <UsersThree size={13} />, value: formatNumber(peek.employees_count) || peek.size || '—' },
          { label: 'Industry', icon: <Briefcase size={13} />, value: peek.sector || '—' },
        ] : []}
        fields={peek ? [
          { label: 'Name', icon: <Buildings size={12} />, value: peek.name },
          { label: 'People', icon: <Users size={12} />, value: peek.people_count },
          { label: 'Opportunities', icon: <Target size={12} />, value: peek.active_opps },
        ] : []}
        recommendedMove={peek?.next_step ? {
          verb: peek.next_step,
          detail: peek.key_insight || peek.notes || 'Account next step from the company record.',
          action: peek.next_step,
          accent: 'var(--moss)',
        } : null}
        onClose={() => setPeekId(null)}
        onOpenFull={() => peek && navigate(`/people/companies/${peek.id}`)}
        onPrev={peekIndex > 0 ? () => setPeekId(filtered[peekIndex - 1].id) : undefined}
        onNext={peekIndex >= 0 && peekIndex < filtered.length - 1 ? () => setPeekId(filtered[peekIndex + 1].id) : undefined}
      >
        <div className="peek-block-label spaced">Account strategy</div>
        <div className="peek-captured">
          <div className="pk-cap">
            <span className="pk-cap-ic">◎</span>
            <span className="pk-cap-tx">{peek?.icp || 'No ICP set'}{peek?.account_stage ? ` · ${peek.account_stage}` : ''}</span>
          </div>
          <div className="pk-cap">
            <span className="pk-cap-ic">↗</span>
            <span className="pk-cap-tx">{peek?.motion || peek?.source || 'No account motion captured yet.'}</span>
          </div>
        </div>
        <div className="peek-block-label spaced">Recent signals</div>
        <div className="peek-signals">
          <div className="pk-signal">
            <span className="pk-sig-ic">•</span>
            <span className="pk-sig-tx">{peek?.key_insight || peek?.notes || 'No recent signals captured yet.'}</span>
            <span className="pk-sig-when">{formatAgo(daysSince(peek?.last_interaction_at ?? null))}</span>
          </div>
        </div>
      </RecordPeek>

    </div>
  )
}
