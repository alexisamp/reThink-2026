import { useState, useEffect } from 'react'
import { X, Plus, TrashSimple, CaretUp, CaretDown } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import type { List, ListStage } from '@/types'

interface ListEditorModalProps {
  open: boolean
  existing: List | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_STAGES: ListStage[] = [
  { key: 'new',      label: 'New',      description: '' },
  { key: 'in_progress', label: 'In Progress', description: '' },
  { key: 'done',     label: 'Done',     description: '' },
]

const COLORS = ['#79D65E', '#4ECDC4', '#F6B26B', '#9B6DDB', '#E8A87C', '#F67280', '#5D8AA8', '#6B7280']

export default function ListEditorModal({ open, existing, onClose, onSaved }: ListEditorModalProps) {
  const { user } = useAuth()
  const { createList, updateList } = useLists(user?.id)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [stages, setStages] = useState<ListStage[]>(DEFAULT_STAGES)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (existing) {
      setName(existing.name)
      setPurpose(existing.purpose ?? '')
      setIcon(existing.icon ?? '')
      setColor(existing.color ?? COLORS[0])
      setStages(existing.stages.length ? existing.stages : DEFAULT_STAGES)
    } else {
      setName('')
      setPurpose('')
      setIcon('')
      setColor(COLORS[0])
      setStages(DEFAULT_STAGES)
    }
  }, [open, existing])

  function addStage() {
    const newKey = `stage_${stages.length + 1}`
    setStages([...stages, { key: newKey, label: `Stage ${stages.length + 1}`, description: '' }])
  }

  function removeStage(idx: number) {
    if (stages.length <= 1) return
    setStages(stages.filter((_, i) => i !== idx))
  }

  function updateStage(idx: number, patch: Partial<ListStage>) {
    setStages(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= stages.length) return
    const next = [...stages]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setStages(next)
  }

  async function save() {
    if (!name.trim() || !user) return
    setSaving(true)
    // slug-ify keys if the user left them as labels
    const cleanStages: ListStage[] = stages.map(s => ({
      key: s.key || s.label.toLowerCase().replace(/\s+/g, '_'),
      label: s.label.trim() || s.key,
      description: s.description?.trim() || undefined,
      color: s.color,
    }))
    const payload = {
      name: name.trim(),
      purpose: purpose.trim() || null,
      icon: icon.trim() || null,
      color,
      stages: cleanStages,
    }
    if (existing) {
      await updateList(existing.id, payload)
    } else {
      await createList(payload)
    }
    setSaving(false)
    onSaved()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">
            {existing ? 'Edit list' : 'New list'}
          </h2>
          <button onClick={onClose} className="text-shuttle hover:text-burnham">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-shuttle mb-1">Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2026 Fundraising"
              className="w-full text-sm border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-shuttle mb-1">Purpose</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="What is this list for?"
              rows={2}
              className="w-full text-sm border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham resize-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-shuttle mb-1">Icon (emoji)</label>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="e.g. 💰"
                maxLength={3}
                className="w-full text-sm border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-shuttle mb-1">Color</label>
              <div className="flex gap-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-burnham scale-110' : 'border-mercury'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-shuttle">Stages</label>
              <button
                onClick={addStage}
                className="flex items-center gap-1 text-xs text-burnham hover:opacity-70"
              >
                <Plus size={12} /> Add stage
              </button>
            </div>
            <div className="space-y-1.5">
              {stages.map((s, idx) => (
                <div key={idx} className="flex items-center gap-1.5 p-2 bg-mercury/20 rounded-lg">
                  <div className="flex flex-col">
                    <button onClick={() => moveStage(idx, -1)} disabled={idx === 0} className="text-shuttle disabled:opacity-30 hover:text-burnham">
                      <CaretUp size={10} />
                    </button>
                    <button onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1} className="text-shuttle disabled:opacity-30 hover:text-burnham">
                      <CaretDown size={10} />
                    </button>
                  </div>
                  <input
                    value={s.label}
                    onChange={e => updateStage(idx, { label: e.target.value })}
                    placeholder="Stage name"
                    className="w-36 text-xs border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
                  />
                  <input
                    value={s.description ?? ''}
                    onChange={e => updateStage(idx, { description: e.target.value })}
                    placeholder="Entry criteria / description"
                    className="flex-1 text-xs border border-mercury rounded px-2 py-1 focus:outline-none focus:border-burnham bg-white"
                  />
                  <button
                    onClick={() => removeStage(idx)}
                    disabled={stages.length <= 1}
                    className="text-shuttle hover:text-red-600 disabled:opacity-30"
                    title="Remove stage"
                  >
                    <TrashSimple size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-mercury">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-shuttle hover:text-burnham">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || stages.length === 0}
            className="px-4 py-1.5 bg-burnham text-gossip text-sm rounded-lg disabled:opacity-40"
          >
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Create list'}
          </button>
        </div>
      </div>
    </div>
  )
}
