import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, MagnifyingGlass, Users, PencilSimple } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, useListMemberships } from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import ListEditorModal from '@/components/ListEditorModal'
import type { Contact, List, ListMembership } from '@/types'

interface EnrichedMember extends ListMembership {
  contact: Contact
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, reload: reloadLists } = useLists(user?.id)
  const { memberships, moveStage, addToList, removeFromList, reload } = useListMemberships(user?.id, { listId: id })
  const [contactsById, setContactsById] = useState<Record<string, Contact>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const list: List | undefined = lists.find(l => l.id === id)

  // Load contacts for each membership
  useEffect(() => {
    if (!user || memberships.length === 0) {
      setContactsById({})
      return
    }
    const ids = memberships.map(m => m.contact_id)
    supabase
      .from('outreach_logs')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, Contact> = {}
        for (const c of data as Contact[]) map[c.id] = c
        setContactsById(map)
      })
  }, [user, memberships])

  const enriched: EnrichedMember[] = useMemo(() =>
    memberships
      .map(m => ({ ...m, contact: contactsById[m.contact_id] }))
      .filter(m => m.contact) as EnrichedMember[],
    [memberships, contactsById],
  )

  const byStage = useMemo(() => {
    const groups: Record<string, EnrichedMember[]> = {}
    if (!list) return groups
    for (const s of list.stages) groups[s.key] = []
    for (const m of enriched) {
      const key = m.current_stage
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [list, enriched])

  function onDragStart(e: React.DragEvent, membershipId: string) {
    e.dataTransfer.setData('text/plain', membershipId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, stageKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stageKey)
  }

  function onDrop(e: React.DragEvent, stageKey: string) {
    e.preventDefault()
    setDragOver(null)
    const membershipId = e.dataTransfer.getData('text/plain')
    if (!membershipId) return
    const m = memberships.find(m => m.id === membershipId)
    if (m && m.current_stage !== stageKey) {
      moveStage(membershipId, stageKey)
    }
  }

  if (!list) {
    return (
      <div className="flex items-center justify-center h-full text-shuttle">
        <div className="text-center">
          <p className="mb-3">List not found.</p>
          <button onClick={() => navigate('/lists')} className="text-sm text-burnham hover:underline">
            ← Back to lists
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-mercury/60 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/lists')} className="text-shuttle hover:text-burnham">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            {list.icon && <span className="text-xl">{list.icon}</span>}
            <h1 className="text-base font-semibold text-burnham">{list.name}</h1>
            <span className="text-[11px] text-shuttle/40 font-mono">{enriched.length}</span>
          </div>
          {list.purpose && <p className="text-xs text-shuttle truncate max-w-md ml-2">{list.purpose}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditor(true)}
            className="text-xs text-shuttle hover:text-burnham px-2 py-1 rounded hover:bg-mercury/30 transition-colors flex items-center gap-1"
            title="Edit list"
          >
            <PencilSimple size={12} />
            Edit
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-burnham hover:bg-burnham/90 text-gossip text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} />
            Add contact
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="flex gap-3 min-h-full overflow-x-auto">
          {list.stages.map(stage => {
            const column = byStage[stage.key] ?? []
            const isDragTarget = dragOver === stage.key
            return (
              <div
                key={stage.key}
                className={`w-72 shrink-0 bg-white rounded-xl border ${isDragTarget ? 'border-burnham' : 'border-mercury'} transition-colors flex flex-col`}
                onDragOver={e => onDragOver(e, stage.key)}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => onDrop(e, stage.key)}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-mercury">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-shuttle">{stage.label}</h3>
                    <span className="text-[11px] text-shuttle/60 bg-mercury/30 px-1.5 py-0.5 rounded">{column.length}</span>
                  </div>
                </div>
                {stage.description && (
                  <p className="text-[10px] text-shuttle/60 px-3 py-1.5 border-b border-mercury bg-[#FAFAFA]">
                    {stage.description}
                  </p>
                )}
                <div className="flex-1 p-2 space-y-1.5 overflow-auto">
                  {column.map(m => (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={e => onDragStart(e, m.id)}
                      onClick={() => navigate(`/people/${m.contact.id}`)}
                      className="p-2.5 bg-white border border-mercury hover:border-burnham rounded-lg cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        {m.contact.profile_photo_url ? (
                          <img src={m.contact.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gossip flex items-center justify-center text-[11px] font-semibold text-burnham">
                            {m.contact.name[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-midnight truncate">{m.contact.name}</p>
                          {m.contact.job_title && (
                            <p className="text-[10px] text-shuttle truncate">
                              {m.contact.job_title}{m.contact.company ? ` @ ${m.contact.company}` : ''}
                            </p>
                          )}
                        </div>
                        {m.contact.tier != null && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-mercury text-shuttle rounded-full">T{m.contact.tier}</span>
                        )}
                      </div>
                      {m.notes && (
                        <p className="text-[10px] text-shuttle/70 mt-1.5 line-clamp-2 italic">{m.notes}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9px] text-shuttle/50">
                          {daysAgo(m.stage_changed_at)}d in stage
                        </span>
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (confirm(`Remove ${m.contact.name} from this list?`)) {
                              removeFromList(m.id)
                            }
                          }}
                          className="text-[9px] text-shuttle/0 group-hover:text-shuttle hover:text-red-600 transition-colors"
                        >
                          remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {column.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-shuttle/40">
                      Drop contacts here
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showAdd && (
        <AddContactToListModal
          list={list}
          existingIds={new Set(memberships.map(m => m.contact_id))}
          onClose={() => setShowAdd(false)}
          onAdded={async (contactId, stage, notes) => {
            await addToList(contactId, list.id, stage, notes)
            setShowAdd(false)
          }}
        />
      )}

      {showEditor && (
        <ListEditorModal
          open={showEditor}
          existing={list}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            reloadLists()
            reload()
            setShowEditor(false)
          }}
        />
      )}
    </div>
  )
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ─── Add Contact to List Modal ──────────────────────────────────────────────

interface AddContactProps {
  list: List
  existingIds: Set<string>
  onClose: () => void
  onAdded: (contactId: string, stage: string, notes?: string) => void
}

function AddContactToListModal({ list, existingIds, onClose, onAdded }: AddContactProps) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [stage, setStage] = useState<string>(list.stages[0]?.key ?? '')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('outreach_logs')
      .select('id, name, job_title, company, profile_photo_url, tier, relationship_domain')
      .eq('user_id', user.id)
      .order('name')
      .then(({ data }) => setContacts((data ?? []) as Contact[]))
  }, [user])

  const filtered = contacts
    .filter(c => !existingIds.has(c.id))
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 30)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[70vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">Add to {list.name}</h2>
        </div>

        <div className="px-4 py-3 border-b border-mercury">
          <div className="relative">
            <MagnifyingGlass size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-shuttle">
              <Users size={24} className="mx-auto mb-2 text-mercury" />
              No contacts found.
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${selectedContactId === c.id ? 'bg-gossip/40' : 'hover:bg-mercury/20'}`}
              >
                <div className="w-7 h-7 rounded-full bg-gossip flex items-center justify-center text-[11px] font-semibold text-burnham shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-midnight truncate">{c.name}</p>
                  {c.job_title && (
                    <p className="text-[10px] text-shuttle truncate">
                      {c.job_title}{c.company ? ` @ ${c.company}` : ''}
                    </p>
                  )}
                </div>
                {c.tier != null && <span className="text-[9px] px-1.5 py-0.5 bg-mercury text-shuttle rounded-full">T{c.tier}</span>}
              </button>
            ))
          )}
        </div>

        {selectedContactId && (
          <div className="border-t border-mercury p-3 space-y-2">
            <div>
              <label className="block text-[11px] text-shuttle mb-1">Start in stage</label>
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className="w-full text-sm border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham bg-white"
              >
                {list.stages.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-shuttle mb-1">Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Why are you adding them?"
                className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mercury">
          <button onClick={onClose} className="px-3 py-1 text-xs text-shuttle hover:text-burnham">
            Cancel
          </button>
          <button
            onClick={() => selectedContactId && onAdded(selectedContactId, stage, notes || undefined)}
            disabled={!selectedContactId}
            className="px-3 py-1.5 bg-burnham text-gossip text-xs rounded-lg disabled:opacity-40"
          >
            Add to list
          </button>
        </div>
      </div>
    </div>
  )
}
