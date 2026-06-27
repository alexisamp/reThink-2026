import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import ListCreateModal from '@/components/ListCreateModal'

export default function Lists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, loading } = useLists(user?.id)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (lists[0]) {
      navigate(`/lists/${lists[0].id}`, { replace: true })
      return
    }
    setCreateOpen(true)
  }, [lists, loading, navigate])

  return (
    <div className="atl-page flex h-full items-center justify-center bg-white px-6">
      <div className="text-center text-[14px] text-[#777]">
        {loading ? 'Loading lists...' : 'Create a list to get started.'}
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
