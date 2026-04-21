import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass, Plus, Buildings, CaretUpDown, Users, UsersThree, MapPin } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company } from '@/types'

interface CompanyRow extends Company {
  people_count: number
  active_opps: number
  last_interaction_at: string | null
}

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

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-mercury">
        <div className="flex items-center gap-2">
          <Buildings size={20} className="text-shuttle" />
          <h1 className="text-lg font-semibold text-midnight">Companies</h1>
          <span className="text-xs text-shuttle bg-mercury px-1.5 py-0.5 rounded-full ml-1">{rows.length}</span>
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-burnham text-gossip text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> New Company
          </button>
        </div>
      </div>

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

      {/* table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-mercury bg-white sticky top-0 z-10">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle w-[280px]">
                <div className="flex items-center gap-1">Company <CaretUpDown size={10} /></div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Industry</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">
                <div className="flex items-center gap-1"><Users size={11} />Employees</div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">
                <div className="flex items-center gap-1"><UsersThree size={11} />Followers</div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">
                <div className="flex items-center gap-1"><MapPin size={11} />HQ</div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">People</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Opps</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-shuttle">Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-shuttle">Loading...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <Buildings size={32} className="text-mercury mx-auto mb-2" />
                  <p className="text-shuttle text-sm">
                    {search ? 'No companies match your search.' : 'No companies yet. Add your first company above.'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(row => {
                const employees = row.employees_count ?? row.members_on_linkedin
                return (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/people/companies/${row.id}`)}
                  className="border-b border-mercury hover:bg-gossip/20 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CompanyAvatar company={row} size={10} />
                      <div className="min-w-0">
                        <p className="font-medium text-midnight truncate">{row.name}</p>
                        {row.headline
                          ? <p className="text-[11px] text-shuttle truncate">{row.headline}</p>
                          : row.domain && <p className="text-[11px] text-shuttle">{row.domain}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-shuttle">
                    {row.sector ? (
                      <span className="px-2 py-0.5 bg-mercury text-midnight rounded text-xs">{row.sector}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-shuttle text-xs">
                    {employees != null ? (
                      <span className="text-midnight font-medium">{formatNumber(employees)}</span>
                    ) : row.size ? (
                      <span className="text-shuttle">{row.size}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-shuttle text-xs">
                    {row.followers_count != null
                      ? <span className="text-midnight font-medium">{formatNumber(row.followers_count)}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-shuttle text-xs max-w-[200px] truncate" title={row.hq_location ?? undefined}>
                    {row.hq_location || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-medium ${row.people_count > 0 ? 'text-midnight' : 'text-mercury'}`}>
                      {row.people_count}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.active_opps > 0 ? (
                      <span className="px-2 py-0.5 bg-gossip text-burnham rounded-full text-xs font-medium">
                        {row.active_opps}
                      </span>
                    ) : (
                      <span className="text-mercury">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-shuttle text-xs">
                    {formatAgo(daysSince(row.last_interaction_at))}
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="px-6 py-2 bg-white border-t border-mercury text-xs text-shuttle">
        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
      </div>
    </div>
  )
}
