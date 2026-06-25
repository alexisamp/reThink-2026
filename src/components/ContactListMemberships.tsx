import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, CaretRight } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, useListMemberships } from '@/hooks/useLists'

/**
 * Shows the lists this contact is in + their stage.
 * Inline add/remove/move stage. Click → opens list detail.
 */
export default function ContactListMemberships({ contactId }: { contactId: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists } = useLists(user?.id)
  const { memberships, addToList, moveStage, removeFromList } = useListMemberships(user?.id, { contactId })
  const [showAdd, setShowAdd] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')

  const listsById = useMemo(() => {
    const m: Record<string, typeof lists[number]> = {}
    for (const l of lists) m[l.id] = l
    return m
  }, [lists])

  const availableLists = lists.filter(l => (l.parent_object ?? 'person') === 'person')

  useEffect(() => {
    if (availableLists.length && !selectedListId) {
      setSelectedListId(availableLists[0].id)
      setSelectedStage(availableLists[0].stages[0]?.key ?? '')
    }
  }, [availableLists, selectedListId])

  async function handleAdd() {
    if (!selectedListId) return
    await addToList(contactId, selectedListId, selectedStage)
    setShowAdd(false)
    setSelectedListId('')
    setSelectedStage('')
  }

  const selectedList = lists.find(l => l.id === selectedListId)

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-shuttle/60 mb-2 flex items-center justify-between">
        <span>Active in lists</span>
        {!showAdd && availableLists.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-0.5 text-[10px] text-burnham hover:opacity-70 normal-case tracking-normal"
          >
            <Plus size={10} /> Add
          </button>
        )}
      </div>

      {memberships.length === 0 && !showAdd && (
        <p className="text-[11px] text-shuttle/50 italic">
          {lists.length === 0 ? 'No lists yet. Create one in Lists.' : 'Not in any list.'}
        </p>
      )}

      <div className="space-y-1.5">
        {memberships.map(m => {
          const list = listsById[m.list_id]
          if (!list) return null
          return (
            <div key={m.id} className="flex items-center gap-2 p-2 bg-mercury/20 rounded-lg group">
              <button
                onClick={() => navigate(`/lists/${list.id}`)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:opacity-80"
              >
                {list.icon && <span className="text-sm">{list.icon}</span>}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-midnight truncate">{list.name}</p>
                  <p className="text-[10px] text-shuttle">
                    {daysAgo(m.stage_changed_at)}d in stage
                  </p>
                </div>
              </button>
              <select
                value={m.current_stage ?? ''}
                onChange={e => moveStage(m.id, e.target.value)}
                className="text-[11px] border border-mercury bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-burnham max-w-[110px]"
              >
                <option value="">No stage</option>
                {list.stages.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (confirm(`Remove from ${list.name}?`)) removeFromList(m.id)
                }}
                className="text-shuttle/0 group-hover:text-shuttle hover:text-red-600 transition-colors"
                title="Remove"
              >
                <X size={11} />
              </button>
              <button
                onClick={() => navigate(`/lists/${list.id}`)}
                className="text-shuttle hover:text-burnham"
                title="Open list"
              >
                <CaretRight size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <div className="mt-2 p-2 bg-gossip/20 border border-pastel/40 rounded-lg space-y-1.5">
          <div className="flex items-center gap-1.5">
            <select
              value={selectedListId}
              onChange={e => {
                setSelectedListId(e.target.value)
                const l = lists.find(l => l.id === e.target.value)
                setSelectedStage(l?.stages[0]?.key ?? '')
              }}
              className="flex-1 text-xs border border-mercury bg-white rounded px-1.5 py-1 focus:outline-none focus:border-burnham"
            >
              <option value="">Select list…</option>
              {availableLists.map(l => (
                <option key={l.id} value={l.id}>{l.icon ? `${l.icon} ` : ''}{l.name}</option>
              ))}
            </select>
            {selectedList && (
              <select
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className="text-xs border border-mercury bg-white rounded px-1.5 py-1 focus:outline-none focus:border-burnham"
              >
                <option value="">No stage</option>
                {selectedList.stages.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => setShowAdd(false)} className="text-[11px] text-shuttle hover:text-burnham">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedListId}
              className="text-[11px] px-2 py-0.5 bg-burnham text-gossip rounded disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
