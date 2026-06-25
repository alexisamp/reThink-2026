import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import ListCreateModal from '@/components/ListCreateModal'

export default function Lists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, loading } = useLists(user?.id)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex h-full items-center justify-center bg-alabaster px-6">
      <div className="w-full max-w-[520px] rounded-xl border border-mercury bg-white p-6 text-center shadow-sm">
        <h1 className="text-[18px] font-semibold text-midnight">Lists</h1>
        <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-5 text-shuttle">
          Create a list from the sidebar or open one of your existing lists.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {loading ? (
            <div className="py-6 text-[12px] text-shuttle">Loading...</div>
          ) : lists.length > 0 ? (
            lists.map(list => (
              <button
                key={list.id}
                onClick={() => navigate(`/lists/${list.id}`)}
                className="flex items-center gap-2 rounded-lg border border-mercury bg-white px-3 py-2 text-left hover:border-shuttle/40 hover:bg-mercury/20"
              >
                <span className="text-[15px]">{list.icon || '•'}</span>
                <span className="flex-1 truncate text-[13px] font-medium text-midnight">{list.name}</span>
              </button>
            ))
          ) : (
            <div className="py-6 text-[12px] text-shuttle">No lists yet.</div>
          )}
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-lg bg-burnham px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm"
        >
          <Plus size={13} />
          <span>Create list</span>
        </button>
      </div>

      <ListCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={list => {
          setCreateOpen(false)
          navigate(`/lists/${list.id}`)
        }}
      />
    </div>
  )
}
