import { useMemo, useState, type ReactNode } from 'react'
import { Buildings, Check, Users, X, Target } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { LIST_OBJECT_LABELS, useLists } from '@/hooks/useLists'
import type { List, ListRecordKind } from '@/types'

interface ListCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (list: List) => void
}

const OBJECTS: Array<{
  id: ListRecordKind
  title: string
  subtitle: string
  icon: ReactNode
  color: string
}> = [
  {
    id: 'company',
    title: 'Companies',
    subtitle: 'Accounts, targets, partners, and organizations.',
    icon: <Buildings size={16} weight="fill" />,
    color: '#2563eb',
  },
  {
    id: 'person',
    title: 'People',
    subtitle: 'Contacts, candidates, mentors, and relationships.',
    icon: <Users size={16} weight="fill" />,
    color: '#2563eb',
  },
  {
    id: 'opportunity',
    title: 'Deals',
    subtitle: 'Opportunities, roles, projects, and revenue motions.',
    icon: <Target size={16} weight="fill" />,
    color: '#ff6b2c',
  },
]

export default function ListCreateModal({ open, onClose, onCreated }: ListCreateModalProps) {
  const { user } = useAuth()
  const { createList } = useLists(user?.id)
  const [selectedObject, setSelectedObject] = useState<ListRecordKind | null>(null)
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const effectiveEmoji = useMemo(() => {
    if (emoji.trim()) return emoji.trim()
    if (!selectedObject) return ''
    return LIST_OBJECT_LABELS[selectedObject].icon
  }, [emoji, selectedObject])

  if (!open) return null

  async function handleCreate() {
    if (!selectedObject || !name.trim() || saving) return
    setSaving(true)
    const list = await createList({
      name,
      icon: effectiveEmoji,
      parent_object: selectedObject,
    })
    setSaving(false)
    if (list) {
      setSelectedObject(null)
      setEmoji('')
      setName('')
      onCreated(list)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-xl border border-mercury bg-white shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mercury px-5 py-3">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="font-medium text-shuttle">Templates</span>
            <span className="text-shuttle/60">/</span>
            <span className="font-semibold text-midnight">Start from scratch</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-shuttle hover:bg-mercury/40 hover:text-midnight" title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold text-midnight">Create a list</h2>
            <p className="mt-1 text-[13px] text-shuttle">Choose one object type for every entry in this list.</p>
          </div>

          <div className="mb-5 grid gap-2">
            {OBJECTS.map(object => {
              const active = selectedObject === object.id
              return (
                <button
                  key={object.id}
                  onClick={() => {
                    setSelectedObject(object.id)
                    if (!emoji.trim()) setEmoji(LIST_OBJECT_LABELS[object.id].icon)
                  }}
                  className={[
                    'flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition',
                    active ? 'border-burnham bg-gossip/30 shadow-sm' : 'border-mercury bg-white hover:border-shuttle/40 hover:bg-mercury/20',
                  ].join(' ')}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md text-white" style={{ background: object.color }}>
                    {object.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-midnight">{object.title}</span>
                    <span className="block truncate text-[12px] text-shuttle">{object.subtitle}</span>
                  </span>
                  {active && <Check size={15} className="text-burnham" weight="bold" />}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-[72px_1fr] gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium text-shuttle">Emoji</span>
              <input
                value={emoji}
                onChange={event => setEmoji(event.target.value.slice(0, 4))}
                placeholder={selectedObject ? LIST_OBJECT_LABELS[selectedObject].icon : '✨'}
                className="h-9 w-full rounded-lg border border-mercury px-2 text-center text-[18px] outline-none focus:border-burnham"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium text-shuttle">List name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={selectedObject ? `${LIST_OBJECT_LABELS[selectedObject].plural} list` : 'Name your list'}
                className="h-9 w-full rounded-lg border border-mercury px-3 text-[13px] text-midnight outline-none focus:border-burnham"
                autoFocus
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-mercury bg-alabaster/40 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-shuttle hover:bg-mercury/40 hover:text-midnight">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedObject || !name.trim() || saving}
            className="rounded-lg bg-burnham px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create list
          </button>
        </div>
      </div>
    </div>
  )
}
