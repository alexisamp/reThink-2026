import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlass, Plus, Users, Funnel, Table, Kanban,
  WhatsappLogo, LinkedinLogo, X, TwitterLogo,
  DotOutline,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact, ContactStatus } from '@/types'
import { useContacts } from '@/hooks/useContacts'
import OutreachPanel from '@/components/OutreachPanel'
import { TierInfoHelper } from '@/components/TierInfoHelper'
import MergeContactsModal from '@/components/MergeContactsModal'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy,
} from '@dnd-kit/sortable'

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatAgo(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function healthIndicator(days: number | null): { dot: string; label: string } {
  if (days === null) return { dot: 'bg-mercury', label: 'Never' }
  if (days <= 14) return { dot: 'bg-pastel', label: 'Active' }
  if (days <= 30) return { dot: 'bg-yellow-400', label: 'Warm' }
  return { dot: 'bg-red-400', label: 'Cold' }
}

const TIER_COLORS: Record<number, string> = {
  1: 'bg-pastel text-burnham',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-mercury text-shuttle',
}

const STATUS_ORDER: ContactStatus[] = [
  'PROSPECT', 'INTRO', 'CONNECTED', 'ENGAGED', 'NURTURING', 'RECONNECT', 'DORMANT',
]

const KANBAN_COLUMNS: { status: ContactStatus; label: string; dot: string }[] = [
  { status: 'PROSPECT',   label: 'Prospect',   dot: 'bg-mercury' },
  { status: 'INTRO',      label: 'Intro',      dot: 'bg-blue-400' },
  { status: 'CONNECTED',  label: 'Connected',  dot: 'bg-pastel' },
  { status: 'ENGAGED',    label: 'Engaged',    dot: 'bg-pastel' },
  { status: 'NURTURING',  label: 'Nurturing',  dot: 'bg-burnham' },
  { status: 'DORMANT',    label: 'Dormant',    dot: 'bg-red-300' },
]

function ContactAvatar({ name, photoUrl, size = 28 }: { name: string; photoUrl?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div
      className="shrink-0 rounded-full overflow-hidden bg-mercury/60 flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {photoUrl && !imgFailed
        ? <img src={photoUrl} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        : <span className="font-semibold text-shuttle/60">{initials}</span>
      }
    </div>
  )
}

// ── Channel icons ─────────────────────────────────────────────────────────────
// Dedupe by channel type: contact_channels can have multiple rows per (contact,
// channel) — the same WA phone with and without "+", the same person's LID
// AND waname fallback AND a phone, plus residual rows from the deprecated
// extension's content-script. Show ONE icon per distinct channel type with a
// count badge when there's more than one underlying row.
function ChannelIcons({ channels }: { channels: Array<{ channel: string }> }) {
  const counts = channels.reduce<Record<string, number>>((acc, c) => {
    acc[c.channel] = (acc[c.channel] ?? 0) + 1
    return acc
  }, {})

  const renderIcon = (channel: string) => {
    if (channel === 'whatsapp') return <WhatsappLogo size={11} className="text-green-500" />
    if (channel === 'linkedin') return <LinkedinLogo size={11} className="text-blue-500" />
    if (channel === 'x') return <TwitterLogo size={11} className="text-shuttle" />
    if (channel === 'exit5') return <span className="text-[9px] font-bold text-shuttle/60">E5</span>
    return null
  }

  // Stable display order
  const ORDER = ['whatsapp', 'linkedin', 'x', 'exit5'] as const
  const entries = ORDER.filter(k => counts[k] > 0)

  return (
    <div className="flex items-center gap-1">
      {entries.map(channel => {
        const count = counts[channel]
        return (
          <span
            key={channel}
            className="inline-flex items-center gap-0.5"
            title={count > 1 ? `${count} ${channel} channels` : channel}
          >
            {renderIcon(channel)}
            {count > 1 && (
              <span className="text-[8px] font-mono text-shuttle/50">×{count}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Tag pills ─────────────────────────────────────────────────────────────────
function TagPill({ tag }: { tag: string }) {
  const isBod = tag === 'board_of_directors'
  return (
    <span className={[
      'text-[9px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap',
      isBod ? 'bg-burnham text-gossip' : 'bg-mercury/60 text-shuttle/60',
    ].join(' ')}>
      {tag.replace(/_/g, ' ')}
    </span>
  )
}

// ── Table row ─────────────────────────────────────────────────────────────────

interface TableRowProps {
  contact: Contact
  channels: Array<{ outreach_log_id: string; channel: string }>
  selected: boolean
  onToggleSelect: (id: string, checked: boolean) => void
  onRowClick: (c: Contact) => void
}

function TableRow({ contact, channels, selected, onToggleSelect, onRowClick }: TableRowProps) {
  const myChannels = channels.filter(ch => ch.outreach_log_id === contact.id)
  const days = daysSince(contact.last_interaction_at)
  const health = healthIndicator(days)
  const tags: string[] = Array.isArray((contact as unknown as Record<string, unknown>).tags)
    ? (contact as unknown as Record<string, unknown[]>).tags as string[]
    : []

  return (
    <tr
      className={`group border-b border-mercury/30 hover:bg-gossip/10 cursor-pointer transition-colors ${selected ? 'bg-gossip/20' : ''}`}
      onClick={() => onRowClick(contact)}
    >
      {/* Select checkbox */}
      <td className="py-2 pl-4 pr-1 w-8" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onToggleSelect(contact.id, e.target.checked)}
          className="h-3.5 w-3.5 accent-burnham cursor-pointer"
          aria-label={`Select ${contact.name}`}
        />
      </td>

      {/* Name + avatar */}
      <td className="py-2 pl-1 pr-3">
        <div className="flex items-center gap-2.5">
          <ContactAvatar name={contact.name} photoUrl={contact.profile_photo_url} size={26} />
          <span className="text-[13px] font-medium text-burnham truncate max-w-[160px]">{contact.name}</span>
        </div>
      </td>

      {/* Company */}
      <td className="py-2 px-3 text-[12px] text-shuttle truncate max-w-[120px]">
        {contact.company ?? '—'}
      </td>

      {/* Role */}
      <td className="py-2 px-3 text-[12px] text-shuttle truncate max-w-[120px]">
        {contact.job_title ?? '—'}
      </td>

      {/* Tier */}
      <td className="py-2 px-3">
        {contact.tier ? (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TIER_COLORS[contact.tier]}`}>
            T{contact.tier}
          </span>
        ) : <span className="text-shuttle/30 text-[11px]">—</span>}
      </td>

      {/* Last contact */}
      <td className="py-2 px-3 text-[12px] text-shuttle/70 whitespace-nowrap">
        {formatAgo(days)}
      </td>

      {/* Health */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${health.dot}`} />
          <span className="text-[11px] text-shuttle/60">{health.label}</span>
        </div>
      </td>

      {/* Tags */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1 flex-wrap max-w-[140px]">
          {tags.slice(0, 2).map(t => <TagPill key={t} tag={t} />)}
        </div>
      </td>

      {/* Channels */}
      <td className="py-2 pl-3 pr-4">
        <ChannelIcons channels={myChannels} />
      </td>
    </tr>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const days = daysSince(contact.last_interaction_at)
  const health = healthIndicator(days)
  return (
    <div
      onClick={onClick}
      className="bg-white border border-mercury rounded-lg p-2.5 cursor-pointer hover:border-burnham/20 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ContactAvatar name={contact.name} photoUrl={contact.profile_photo_url} size={22} />
        <span className="text-[12px] font-medium text-burnham truncate">{contact.name}</span>
      </div>
      {contact.company && (
        <p className="text-[10px] text-shuttle/60 truncate mb-1.5">{contact.company}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
        </div>
        {days !== null && (
          <span className="text-[9px] font-mono text-shuttle/40">{formatAgo(days)}</span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'kanban'

export default function People() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [outreachPanelOpen, setOutreachPanelOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTagging, setBulkTagging] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [tierFilter, setTierFilter] = useState<'all' | 'untagged' | 1 | 2 | 3>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ContactStatus>('all')
  const [healthFilter, setHealthFilter] = useState<'all' | 'active' | 'warm' | 'cold' | 'never'>('all')

  // Contact channels (loaded separately)
  const [channels, setChannels] = useState<Array<{ outreach_log_id: string; channel: string }>>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  // Load channels
  useEffect(() => {
    if (!userId) return
    supabase
      .from('contact_channels')
      .select('outreach_log_id, channel')
      .then(({ data }) => setChannels(data ?? []))
  }, [userId])

  const { contacts, loading, addContact, updateContact, deleteContact, mergeContacts } = useContacts(
    userId ?? undefined,
    [],
    async () => {},
  )

  // Goals for OutreachPanel
  const [goals, setGoals] = useState<{ id: string; text: string; alias: string | null }[]>([])
  useEffect(() => {
    if (!userId) return
    supabase.from('goals').select('id, text, alias').eq('user_id', userId).eq('goal_type', 'ACTIVE')
      .then(({ data }) => setGoals(data ?? []))
  }, [userId])

  const filtered = contacts.filter(c => {
    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hit = (
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.job_title ?? '').toLowerCase().includes(q)
      )
      if (!hit) return false
    }
    // Tier filter
    if (tierFilter === 'untagged' && c.tier != null) return false
    if (typeof tierFilter === 'number' && c.tier !== tierFilter) return false
    // Status filter
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    // Health filter
    if (healthFilter !== 'all') {
      const d = daysSince(c.last_interaction_at)
      const bucket = d === null ? 'never' : d <= 14 ? 'active' : d <= 30 ? 'warm' : 'cold'
      if (bucket !== healthFilter) return false
    }
    return true
  }).sort((a, b) => {
    const aDate = a.last_interaction_at ?? a.created_at
    const bDate = b.last_interaction_at ?? b.created_at
    return bDate.localeCompare(aDate)
  })

  const activeFilterCount =
    (tierFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (healthFilter !== 'all' ? 1 : 0)

  const clearFilters = () => { setTierFilter('all'); setStatusFilter('all'); setHealthFilter('all') }

  const handleRowClick = useCallback((c: Contact) => {
    navigate(`/people/${c.id}`)
  }, [navigate])

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const handleToggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAllVisible = useCallback((checked: boolean) => {
    if (checked) setSelectedIds(new Set(filtered.map(c => c.id)))
    else setSelectedIds(new Set())
  }, [filtered])

  const handleBulkTier = useCallback(async (tier: 1 | 2 | 3 | null) => {
    if (selectedIds.size === 0) return
    setBulkTagging(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => updateContact(id, { tier }))
      )
      setSelectedIds(new Set())
    } finally {
      setBulkTagging(false)
    }
  }, [selectedIds, updateContact])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleNewPerson = () => {
    setEditingContact(null)
    setOutreachPanelOpen(true)
  }

  // Kanban: update status via drag or click
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const contactId = active.id as string
    const newStatus = over.id as ContactStatus
    if (!STATUS_ORDER.includes(newStatus)) return
    await updateContact(contactId, { status: newStatus })
  }, [updateContact])

  return (
    <div className="h-screen flex flex-col bg-white text-burnham font-sans">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-mercury/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-sm bg-pastel flex items-center justify-center shrink-0">
              <Users size={11} weight="fill" className="text-white" />
            </span>
            <h1 className="text-base font-semibold text-burnham">People</h1>
          </div>
          <span className="text-[11px] text-shuttle/40 font-mono">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-mercury/20 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-burnham' : 'text-shuttle/50 hover:text-shuttle'}`}
              title="Table view"
            >
              <Table size={14} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-burnham' : 'text-shuttle/50 hover:text-shuttle'}`}
              title="Kanban view"
            >
              <Kanban size={14} />
            </button>
          </div>
          <button
            onClick={() => navigate('/people/classify')}
            className="text-xs text-shuttle hover:text-burnham px-2 py-1 rounded hover:bg-mercury/30 transition-colors"
            title="Classify contacts as professional or personal"
          >
            Classify
          </button>
          <button
            onClick={handleNewPerson}
            className="flex items-center gap-1.5 bg-burnham hover:bg-burnham/90 text-gossip text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} />
            New Person
          </button>
        </div>
      </header>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-mercury/30 shrink-0 flex-wrap">
        <div className="relative">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle/40" />
          <input
            type="text"
            placeholder="Search people…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1 text-xs border border-mercury rounded-lg bg-white focus:outline-none focus:border-burnham/30 w-48"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-shuttle/40 hover:text-shuttle">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Tier pill filter — primary filter for bulk tagging workflow */}
        <div className="flex items-center gap-1 bg-mercury/20 rounded-lg p-0.5">
          {([
            { val: 'all', label: 'All' },
            { val: 'untagged', label: 'Untagged' },
            { val: 1, label: 'T1' },
            { val: 2, label: 'T2' },
            { val: 3, label: 'T3' },
          ] as const).map(({ val, label }) => (
            <button
              key={String(val)}
              onClick={() => setTierFilter(val)}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                tierFilter === val
                  ? 'bg-white shadow-sm text-burnham'
                  : 'text-shuttle/60 hover:text-shuttle'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | ContactStatus)}
          className="text-[11px] text-shuttle border border-mercury rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-burnham/30"
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Health filter */}
        <select
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value as 'all' | 'active' | 'warm' | 'cold' | 'never')}
          className="text-[11px] text-shuttle border border-mercury rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-burnham/30"
        >
          <option value="all">Any health</option>
          <option value="active">Active (≤14d)</option>
          <option value="warm">Warm (15–30d)</option>
          <option value="cold">Cold (&gt;30d)</option>
          <option value="never">Never contacted</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-[10px] text-shuttle/50 hover:text-burnham transition-colors"
          >
            <X size={10} />
            Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
          </button>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-shuttle/50 ml-auto">
          <Funnel size={11} />
          <span>Sorted by last contact</span>
        </div>
      </div>

      {/* ── Bulk action bar (shows when ≥1 selected) ──────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 border-b border-mercury/50 bg-gossip/20 shrink-0">
          <span className="text-[11px] font-semibold text-burnham">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-shuttle/60 mr-1 flex items-center gap-1">
              Tag as:
              <TierInfoHelper />
            </span>
            {([1, 2, 3] as const).map(t => (
              <button
                key={t}
                onClick={() => handleBulkTier(t)}
                disabled={bulkTagging}
                title={
                  t === 1 ? 'Tier 1 — Airport pickup (close trust, daisy chain launch pad)'
                  : t === 2 ? 'Tier 2 — Shared identity (ex-colleagues, same school/industry)'
                  : 'Tier 3 — Loose connections'
                }
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-mercury hover:border-burnham/40 bg-white text-shuttle hover:text-burnham disabled:opacity-40 transition-colors"
              >
                T{t}
              </button>
            ))}
            <button
              onClick={() => handleBulkTier(null)}
              disabled={bulkTagging}
              className="text-[10px] text-shuttle/50 hover:text-shuttle px-2 py-0.5 disabled:opacity-40 transition-colors"
            >
              clear
            </button>
          </div>
          {selectedIds.size === 2 && (
            <button
              onClick={() => setMergeModalOpen(true)}
              disabled={bulkTagging}
              className="text-[10px] font-medium text-burnham border border-burnham/30 hover:border-burnham hover:bg-burnham hover:text-white px-2.5 py-0.5 rounded-full transition-colors disabled:opacity-40"
            >
              Merge these two…
            </button>
          )}

          <button
            onClick={clearSelection}
            className="ml-auto text-[10px] text-shuttle/50 hover:text-shuttle transition-colors"
          >
            Deselect all
          </button>
        </div>
      )}

      {/* Merge modal */}
      {mergeModalOpen && selectedIds.size === 2 && (() => {
        const [idA, idB] = Array.from(selectedIds)
        const a = contacts.find(c => c.id === idA)
        const b = contacts.find(c => c.id === idB)
        if (!a || !b) return null
        return (
          <MergeContactsModal
            contactA={a}
            contactB={b}
            onClose={() => setMergeModalOpen(false)}
            onMerge={async (survivorId, duplicateId) => {
              const r = await mergeContacts(survivorId, duplicateId)
              if (r.ok) setSelectedIds(new Set())
              return r
            }}
          />
        )
      })()}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
          </div>
        ) : viewMode === 'table' ? (
          /* ── Table view ─────────────────────────────────────────────── */
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-mercury/50 bg-white sticky top-0 z-10">
                <th className="py-2 pl-4 pr-1 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                    ref={el => {
                      if (el) {
                        const some = filtered.some(c => selectedIds.has(c.id))
                        const all = filtered.every(c => selectedIds.has(c.id))
                        el.indeterminate = some && !all
                      }
                    }}
                    onChange={e => handleSelectAllVisible(e.target.checked)}
                    className="h-3.5 w-3.5 accent-burnham cursor-pointer"
                    aria-label="Select all visible"
                  />
                </th>
                {['Name', 'Company', 'Role', 'Tier', 'Last Contact', 'Health', 'Tags', 'Channels'].map(h => (
                  <th key={h} className="py-2 px-3 last:pr-4 text-[10px] font-semibold text-shuttle/50 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-shuttle/40">
                    {search ? 'No results for this search' : 'No contacts yet — add your first person'}
                  </td>
                </tr>
              ) : filtered.map(contact => (
                <TableRow
                  key={contact.id}
                  contact={contact}
                  channels={channels}
                  selected={selectedIds.has(contact.id)}
                  onToggleSelect={handleToggleSelect}
                  onRowClick={handleRowClick}
                />
              ))}
            </tbody>
            {/* Footer count */}
            <tfoot>
              <tr className="border-t border-mercury/40">
                <td colSpan={9} className="py-2 pl-4 text-[10px] font-mono text-shuttle/40">
                  {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          /* ── Kanban view ─────────────────────────────────────────────── */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 p-6 h-full overflow-x-auto">
              {KANBAN_COLUMNS.map(col => {
                const colContacts = filtered.filter(c => c.status === col.status)
                return (
                  <div key={col.status} className="flex-shrink-0 w-52">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-[11px] font-semibold text-shuttle">{col.label}</span>
                      <span className="ml-auto text-[10px] font-mono text-shuttle/40">{colContacts.length}</span>
                    </div>
                    {/* Cards */}
                    <SortableContext items={[col.status]} strategy={horizontalListSortingStrategy}>
                      <div className="space-y-2 min-h-[80px]">
                        {colContacts.map(c => (
                          <KanbanCard key={c.id} contact={c} onClick={() => navigate(`/people/${c.id}`)} />
                        ))}
                        {colContacts.length === 0 && (
                          <div className="h-16 border border-dashed border-mercury/50 rounded-lg flex items-center justify-center">
                            <DotOutline size={16} className="text-mercury" />
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </div>
                )
              })}
            </div>
          </DndContext>
        )}
      </div>

      {/* OutreachPanel for adding/editing contacts */}
      <OutreachPanel
        open={outreachPanelOpen}
        editingLog={editingContact}
        onClose={() => { setOutreachPanelOpen(false); setEditingContact(null) }}
        goals={goals}
        onSave={async input => {
          if (editingContact) {
            await updateContact(editingContact.id, input)
          } else {
            await addContact(input)
          }
          setOutreachPanelOpen(false)
          setEditingContact(null)
        }}
        syncing={false}
        onSpawnTodo={() => {}}
      />
    </div>
  )
}
