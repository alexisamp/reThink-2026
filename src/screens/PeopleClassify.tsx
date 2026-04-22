import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Briefcase, House, Handshake, Check, CaretRight,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Contact, RelationshipDomain, PersonalTier, ContactCategory } from '@/types'

/**
 * One-time classifier tool: bucket every contact into professional / personal / mixed.
 * Rules:
 *  - category = 'family'                    → suggest 'personal' + personal_tier 'inner_circle'
 *  - category = 'friend'                    → suggest 'personal' + personal_tier 'close'
 *  - any other category (or null)           → suggest 'professional'
 * User can override per-row, then bulk-save.
 */

type Decision = RelationshipDomain
type Row = Contact & { _decision: Decision; _personal_tier?: PersonalTier | null }

function suggestDecision(c: Contact): { decision: Decision; personal_tier?: PersonalTier | null } {
  if (c.category === 'family') return { decision: 'personal', personal_tier: 'inner_circle' }
  if (c.category === 'friend') return { decision: 'personal', personal_tier: 'close' }
  return { decision: 'professional', personal_tier: null }
}

const DOMAIN_META: Record<Decision, { label: string; icon: React.ReactNode; color: string }> = {
  professional: { label: 'Professional', icon: <Briefcase size={14} />, color: 'bg-burnham text-gossip' },
  personal:     { label: 'Personal',     icon: <House size={14} />,     color: 'bg-pastel text-burnham' },
  mixed:        { label: 'Mixed',        icon: <Handshake size={14} />, color: 'bg-gossip text-burnham border border-pastel' },
}

const PERSONAL_TIERS: PersonalTier[] = ['inner_circle', 'close', 'casual']
const PERSONAL_TIER_LABEL: Record<PersonalTier, string> = {
  inner_circle: 'Inner Circle',
  close: 'Close',
  casual: 'Casual',
}

export default function PeopleClassify() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unchanged' | 'modified'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!user) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('outreach_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
    const prepared = (data ?? []).map((c: Contact) => {
      // If already set to something non-default, keep it. Otherwise apply suggestion.
      const suggestion = suggestDecision(c)
      // Heuristic: if relationship_domain is exactly 'professional' AND category is family/friend,
      // it's likely the default and we should suggest personal. If user has already classified
      // to something that conflicts with category, preserve.
      const userAlreadyClassified =
        (c.relationship_domain === 'personal' || c.relationship_domain === 'mixed') ||
        (c.relationship_domain === 'professional' && c.category !== 'family' && c.category !== 'friend')
      return {
        ...c,
        _decision: userAlreadyClassified
          ? c.relationship_domain
          : suggestion.decision,
        _personal_tier: c.personal_tier ?? suggestion.personal_tier ?? null,
      } as Row
    })
    setRows(prepared)
    setLoading(false)
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function bulkApply(category: ContactCategory | null, decision: Decision, personal_tier?: PersonalTier | null) {
    setRows(prev => prev.map(r => {
      if (r.category === category) {
        return { ...r, _decision: decision, _personal_tier: personal_tier ?? null }
      }
      return r
    }))
  }

  async function saveAll() {
    if (!user) return
    setSaving(true)
    // Only send rows where _decision or _personal_tier differ from what's in DB
    const toUpdate = rows.filter(r =>
      r._decision !== r.relationship_domain ||
      (r._decision === 'personal' && r._personal_tier !== (r.personal_tier ?? null))
    )
    // Batch in chunks of 50
    for (let i = 0; i < toUpdate.length; i += 50) {
      const chunk = toUpdate.slice(i, i + 50)
      await Promise.all(chunk.map(r =>
        supabase.from('outreach_logs').update({
          relationship_domain: r._decision,
          personal_tier: r._decision === 'personal' ? r._personal_tier : null,
        }).eq('id', r.id)
      ))
    }
    setSaving(false)
    await load()
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      const changed = r._decision !== r.relationship_domain
      if (filter === 'modified' && !changed) return false
      if (filter === 'unchanged' && changed) return false
      return true
    })
  }, [rows, filter, search])

  const stats = useMemo(() => {
    const s = { professional: 0, personal: 0, mixed: 0, modified: 0 }
    for (const r of rows) {
      s[r._decision]++
      if (r._decision !== r.relationship_domain) s.modified++
    }
    return s
  }, [rows])

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-mercury">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/people')} className="text-shuttle hover:text-burnham">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold text-midnight">Classify Contacts</h1>
          <span className="text-xs text-shuttle">Tag everyone as professional or personal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-shuttle">
            {stats.modified > 0 ? `${stats.modified} unsaved` : 'No changes'}
          </span>
          <button
            onClick={saveAll}
            disabled={saving || stats.modified === 0}
            className="px-4 py-1.5 bg-burnham text-gossip text-sm rounded-lg disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Save ${stats.modified} changes`}
          </button>
        </div>
      </div>

      {/* stats + bulk actions */}
      <div className="px-6 py-3 bg-white border-b border-mercury">
        <div className="flex items-center gap-4 mb-3">
          <StatPill label="Total" value={rows.length} />
          <StatPill label="Professional" value={stats.professional} color="text-burnham" />
          <StatPill label="Personal" value={stats.personal} color="text-burnham" />
          <StatPill label="Mixed" value={stats.mixed} color="text-burnham" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-shuttle">Bulk actions:</span>
          <button onClick={() => bulkApply('family', 'personal', 'inner_circle')} className="px-2 py-1 bg-mercury hover:bg-gossip rounded">
            All <code className="font-mono">family</code> → Personal · Inner Circle
          </button>
          <button onClick={() => bulkApply('friend', 'personal', 'close')} className="px-2 py-1 bg-mercury hover:bg-gossip rounded">
            All <code className="font-mono">friend</code> → Personal · Close
          </button>
          <button
            onClick={() => setRows(prev => prev.map(r => {
              const s = suggestDecision(r)
              return { ...r, _decision: s.decision, _personal_tier: s.personal_tier ?? null }
            }))}
            className="px-2 py-1 bg-mercury hover:bg-gossip rounded"
          >
            Reset to suggestions
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-mercury">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="px-3 py-1 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham w-64"
        />
        <div className="flex rounded-lg border border-mercury overflow-hidden text-xs">
          {(['all', 'modified', 'unchanged'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 ${filter === f ? 'bg-burnham text-gossip' : 'bg-white text-shuttle hover:bg-mercury'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-shuttle">
          {filtered.length} shown
        </span>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-12 text-shuttle">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mercury bg-white sticky top-0 z-10">
                <th className="text-left px-6 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle">Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle">Category</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle">Tier</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle">Domain</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle">Personal Tier</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-shuttle"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const changed = r._decision !== r.relationship_domain
                return (
                  <tr key={r.id} className={`border-b border-mercury ${changed ? 'bg-pastel/10' : ''}`}>
                    <td className="px-6 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-midnight">{r.name}</span>
                        {changed && <span title="Modified" className="text-[10px] text-burnham">●</span>}
                      </div>
                      {r.job_title && (
                        <div className="text-[11px] text-shuttle">{r.job_title}{r.company ? ` @ ${r.company}` : ''}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.category ? (
                        <span className="px-1.5 py-0.5 bg-mercury text-midnight text-xs rounded">{r.category}</span>
                      ) : <span className="text-mercury">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-shuttle">
                      {r.tier != null ? `T${r.tier}` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {(['professional', 'personal', 'mixed'] as Decision[]).map(d => {
                          const meta = DOMAIN_META[d]
                          const active = r._decision === d
                          return (
                            <button
                              key={d}
                              onClick={() => updateRow(r.id, { _decision: d })}
                              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${active ? meta.color : 'bg-white text-shuttle border border-mercury hover:border-burnham'}`}
                            >
                              {meta.icon}
                              <span>{meta.label}</span>
                              {active && <Check size={10} />}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {r._decision === 'personal' ? (
                        <select
                          value={r._personal_tier ?? ''}
                          onChange={e => updateRow(r.id, { _personal_tier: (e.target.value || null) as PersonalTier | null })}
                          className="text-xs border border-mercury rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="">—</option>
                          {PERSONAL_TIERS.map(t => (
                            <option key={t} value={t}>{PERSONAL_TIER_LABEL[t]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-mercury">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => navigate(`/people/${r.id}`)}
                        className="text-shuttle hover:text-burnham"
                        title="Open contact"
                      >
                        <CaretRight size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-shuttle text-sm">
                    No contacts match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value, color = 'text-midnight' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-lg font-semibold ${color}`}>{value}</span>
      <span className="text-xs text-shuttle uppercase tracking-wide">{label}</span>
    </div>
  )
}
