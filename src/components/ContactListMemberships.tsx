import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretRight, MagnifyingGlass, Plus, TrashSimple, X } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, useListMemberships } from '@/hooks/useLists'
import type { ListMembership } from '@/types'

export default function ContactListMemberships({ contactId }: { contactId: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists } = useLists(user?.id)
  const { memberships, addToList, removeFromList } = useListMemberships(user?.id, { contactId })
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<ListMembership | null>(null)

  const listsById = useMemo(() => {
    const map: Record<string, typeof lists[number]> = {}
    for (const list of lists) map[list.id] = list
    return map
  }, [lists])

  const availableLists = lists
    .filter(list => (list.parent_object ?? 'person') === 'person')
    .filter(list => [list.name, list.purpose].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))

  async function handleAdd(listId: string) {
    await addToList(contactId, listId, '')
    setShowAdd(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[#777]">
        <span>Lists</span>
        {!showAdd && availableLists.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e5] bg-white px-2 py-1 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f4]"
          >
            <Plus size={11} />
            Add to list
          </button>
        )}
      </div>

      {memberships.length === 0 && !showAdd && (
        <p className="text-[12px] text-[#777]">
          {lists.length === 0 ? 'No lists yet. Create one in Lists.' : 'Not in any list yet.'}
        </p>
      )}

      <div className="grid gap-1.5">
        {memberships.map(membership => {
          const list = listsById[membership.list_id]
          if (!list) return null
          return (
            <div key={membership.id} className="group flex min-h-[38px] items-center gap-2 rounded-lg border border-[#ececea] bg-white px-2 py-1.5">
              <button onClick={() => navigate(`/lists/${list.id}`)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-[#e7e7e5] bg-[#f7f7f5] text-[12px]">
                  {list.icon || '•'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[#202020]">{list.name}</span>
                  <span className="block text-[11px] text-[#777]">{daysAgo(membership.stage_changed_at)}d in stage</span>
                </span>
              </button>
              {membership.current_stage && (
                <span className="rounded-md bg-[#f4f4f2] px-2 py-0.5 text-[11px] text-[#666]">{membership.current_stage}</span>
              )}
              <button
                onClick={() => setConfirmRemove(membership)}
                className="rounded-md p-1 text-transparent transition-colors group-hover:text-[#777] hover:bg-[#f5f5f4] hover:text-[#d33f32]"
                title="Remove"
              >
                <X size={11} />
              </button>
              <button onClick={() => navigate(`/lists/${list.id}`)} className="rounded-md p-1 text-[#777] hover:bg-[#f5f5f4] hover:text-[#202020]" title="Open list">
                <CaretRight size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[#e4e4e2] bg-white shadow-[0_16px_44px_rgba(0,0,0,0.13),0_2px_8px_rgba(0,0,0,0.08)]">
          <div className="flex h-10 items-center gap-2 border-b border-[#e7e7e5] px-3 text-[#777]">
            <MagnifyingGlass size={14} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#202020] outline-none"
              placeholder="Search lists..."
              autoFocus
            />
          </div>
          <div className="max-h-[220px] overflow-auto p-1.5">
            {availableLists.map(list => (
              <button key={list.id} onClick={() => void handleAdd(list.id)} className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[#f5f5f4]">
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-[#e7e7e5] bg-[#f7f7f5] text-[12px]">
                  {list.icon || '•'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-[#202020]">{list.name}</span>
                  <span className="block truncate text-[11px] text-[#777]">{list.purpose || 'List'}</span>
                </span>
              </button>
            ))}
            {availableLists.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-[#777]">No matching lists.</div>}
          </div>
          <div className="flex h-9 items-center justify-end border-t border-[#e7e7e5] px-1.5">
            <button onClick={() => { setShowAdd(false); setQuery('') }} className="rounded-md px-2 py-1 text-[12px] text-[#555] hover:bg-[#f5f5f4]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/5" onMouseDown={() => setConfirmRemove(null)}>
          <div className="w-[360px] overflow-hidden rounded-xl border border-[#dededc] bg-white shadow-[0_22px_72px_rgba(0,0,0,0.16),0_2px_7px_rgba(0,0,0,0.08)]" onMouseDown={event => event.stopPropagation()}>
            <div className="flex h-11 items-center justify-between border-b border-[#e7e7e5] px-4">
              <h3 className="m-0 text-[14px] font-semibold text-[#202020]">Remove from list</h3>
              <button onClick={() => setConfirmRemove(null)} className="rounded-md p-1 text-[#777] hover:bg-[#f5f5f4]">
                <X size={14} />
              </button>
            </div>
            <p className="px-4 py-4 text-[13px] leading-5 text-[#555]">Remove this list entry? The underlying person record will stay intact.</p>
            <div className="flex h-11 items-center justify-end gap-2 border-t border-[#e7e7e5] px-2">
              <button onClick={() => setConfirmRemove(null)} className="rounded-lg border border-[#e7e7e5] bg-white px-3 py-1.5 text-[13px] text-[#333] hover:bg-[#f5f5f4]">Cancel</button>
              <button
                onClick={async () => {
                  await removeFromList(confirmRemove.id)
                  setConfirmRemove(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d33f32] bg-[#d33f32] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#bf3529]"
              >
                <TrashSimple size={14} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
