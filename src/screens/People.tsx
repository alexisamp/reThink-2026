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
function ChannelIcons({ channels }: { channels: Array<{ channel: string }> }) {
  return (
    <div className="flex items-center gap-1">
      {channels.map(c => {
        if (c.channel === 'whatsapp') return <WhatsappLogo key="wa" size={11} className="text-green-500" />
        if (c.channel === 'linkedin') return <LinkedinLogo key="li" size={11} className="text-blue-500" />
        if (c.channel === 'x') return <TwitterLogo key="x" size={11} className="text-shuttle" />
        if (c.channel === 'exit5') return <span key="e5" className="text-[9px] font-bold text-shuttle/60">E5</span>
        return null
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
  onRowClick: (c: Contact) => void
}

function TableRow({ contact, channels, onRowClick }: TableRowProps) {
  const myChannels = channels.filter(ch => ch.outreach_log_id === contact.id)
  const days = daysSince(contact.last_interaction_at)
  const health = healthIndicator(days)
  const tags: string[] = Array.isArray((contact as unknown as Record<string, unknown>).tags)
    ? (contact as unknown as Record<string, unknown[]>).tags as string[]
    : []

  return (
    <tr
      className="group border-b border-mercury/30 hover:bg-gossip/10 cursor-pointer transition-colors"
      onClick={() => onRowClick(contact)}
    >
      {/* Name + avatar */}
      <td className="py-2 pl-4 pr-3">
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

  const { contacts, loading, addContact, updateContact, deleteContact } = useContacts(
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
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.job_title ?? '').toLowerCase().includes(q)
    )
  }).sort((a, b) => {
    const aDate = a.last_interaction_at ?? a.created_at
    const bDate = b.last_interaction_at ?? b.created_at
    return bDate.localeCompare(aDate)
  })

  const handleRowClick = useCallback((c: Contact) => {
    navigate(`/people/${c.id}`)
  }, [navigate])

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
            onClick={handleNewPerson}
            className="flex items-center gap-1.5 bg-burnham hover:bg-burnham/90 text-gossip text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} />
            New Person
          </button>
        </div>
      </header>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-mercury/30 shrink-0">
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
        <div className="flex items-center gap-1.5 text-[11px] text-shuttle/50">
          <Funnel size={11} />
          <span>Sorted by last contact</span>
        </div>
      </div>

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
                {['Name', 'Company', 'Role', 'Tier', 'Last Contact', 'Health', 'Tags', 'Channels'].map(h => (
                  <th key={h} className="py-2 px-3 first:pl-4 last:pr-4 text-[10px] font-semibold text-shuttle/50 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-shuttle/40">
                    {search ? 'No results for this search' : 'No contacts yet — add your first person'}
                  </td>
                </tr>
              ) : filtered.map(contact => (
                <TableRow
                  key={contact.id}
                  contact={contact}
                  channels={channels}
                  onRowClick={handleRowClick}
                />
              ))}
            </tbody>
            {/* Footer count */}
            <tfoot>
              <tr className="border-t border-mercury/40">
                <td colSpan={8} className="py-2 pl-4 text-[10px] font-mono text-shuttle/40">
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
        userId={userId ?? ''}
        goals={goals}
        onAdd={async input => { await addContact(input); setOutreachPanelOpen(false) }}
        onUpdate={async (id, input) => { await updateContact(id, input); setOutreachPanelOpen(false) }}
        onDelete={async id => { await deleteContact(id); setOutreachPanelOpen(false) }}
      />
    </div>
  )
}
