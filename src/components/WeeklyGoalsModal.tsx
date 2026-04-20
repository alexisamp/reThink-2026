/**
 * WeeklyGoalsModal — manage weekly habit goals (add, edit, reorder, delete).
 * Accessed via the gear icon on WeeklyPulse.
 */
import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash, ArrowUp, ArrowDown, Check } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { WeeklyHabit } from '@/types'

interface WeeklyGoalsModalProps {
  userId: string
  onClose: () => void
}

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual (tap dots to log)' },
  { value: 'interactions', label: 'Auto — Conversations (interactions table)' },
  { value: 'english_sessions', label: 'Auto — English (english_sessions table)' },
  { value: 'networkhub_tier_touches', label: 'Auto — Tier 1/2 touches (networkhub)' },
  { value: 'networkhub_expansion', label: 'Auto — Pipeline expansion (networkhub)' },
]

const TYPE_OPTIONS = [
  { value: 'count', label: 'Count (reps, sessions, etc.)' },
  { value: 'minutes', label: 'Minutes (shown as h/m)' },
]

interface EditingHabit {
  id: string | null // null = new
  name: string
  emoji: string
  type: 'count' | 'minutes' | 'hours'
  weekly_target: number
  integration_source: string
  position: number
}

function emptyHabit(position: number): EditingHabit {
  return { id: null, name: '', emoji: '', type: 'count', weekly_target: 5, integration_source: 'manual', position }
}

export function WeeklyGoalsModal({ userId, onClose }: WeeklyGoalsModalProps) {
  const [habits, setHabits] = useState<WeeklyHabit[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingHabit | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('weekly_habits')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('position')
    setHabits((data ?? []) as WeeklyHabit[])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return
    setSaving(true)
    try {
      if (editing.id) {
        await supabase.from('weekly_habits').update({
          name: editing.name.trim(),
          emoji: editing.emoji || null,
          type: editing.type,
          weekly_target: editing.weekly_target,
          integration_source: editing.integration_source,
        }).eq('id', editing.id)
      } else {
        await supabase.from('weekly_habits').insert({
          user_id: userId,
          name: editing.name.trim(),
          emoji: editing.emoji || null,
          type: editing.type,
          weekly_target: editing.weekly_target,
          integration_source: editing.integration_source,
          position: editing.position,
          is_active: true,
        })
      }
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const deleteHabit = async (id: string) => {
    setDeleting(id)
    await supabase.from('weekly_habits').update({ is_active: false }).eq('id', id)
    setDeleting(null)
    await load()
  }

  const moveHabit = async (id: string, dir: 'up' | 'down') => {
    const idx = habits.findIndex(h => h.id === id)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === habits.length - 1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    const updated = [...habits]
    ;[updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]]
    await Promise.all(updated.map((h, i) =>
      supabase.from('weekly_habits').update({ position: i }).eq('id', h.id)
    ))
    await load()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-burnham/10 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white border border-mercury rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mercury/50">
          <span className="text-[12px] font-semibold text-burnham uppercase tracking-widest">Weekly Goals</span>
          <button onClick={onClose} className="text-shuttle/30 hover:text-shuttle transition-colors p-0.5">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p className="text-[11px] text-shuttle/40 py-4 text-center">Loading...</p>
          ) : (
            <>
              {habits.map((h, idx) => (
                <div key={h.id}>
                  {editing?.id === h.id ? (
                    <EditForm
                      editing={editing}
                      setEditing={setEditing}
                      onSave={saveEdit}
                      onCancel={() => setEditing(null)}
                      saving={saving}
                    />
                  ) : (
                    <div className="flex items-center gap-2 py-2 group rounded-lg hover:bg-mercury/20 px-2 -mx-2 transition-colors">
                      {h.emoji && <span className="text-[14px] leading-none shrink-0">{h.emoji}</span>}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-burnham truncate">{h.name}</p>
                        <p className="text-[10px] text-shuttle/40 font-mono">
                          {h.weekly_target}{h.type === 'minutes' ? 'm' : h.type === 'hours' ? 'h' : ''}/wk
                          {' · '}{SOURCE_OPTIONS.find(s => s.value === h.integration_source)?.label.split(' — ')[0] ?? h.integration_source}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => moveHabit(h.id, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded text-shuttle/40 hover:text-shuttle disabled:opacity-20"
                        ><ArrowUp size={12} /></button>
                        <button
                          onClick={() => moveHabit(h.id, 'down')}
                          disabled={idx === habits.length - 1}
                          className="p-1 rounded text-shuttle/40 hover:text-shuttle disabled:opacity-20"
                        ><ArrowDown size={12} /></button>
                        <button
                          onClick={() => setEditing({ id: h.id, name: h.name, emoji: h.emoji ?? '', type: h.type, weekly_target: h.weekly_target, integration_source: h.integration_source, position: h.position })}
                          className="px-2 py-0.5 rounded text-[10px] text-shuttle/50 hover:text-burnham border border-mercury/50 hover:border-burnham/30 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => deleteHabit(h.id)}
                          disabled={deleting === h.id}
                          className="p-1 rounded text-shuttle/30 hover:text-red-400 disabled:opacity-30 transition-colors"
                        ><Trash size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New habit form or add button */}
              {editing?.id === null ? (
                <EditForm
                  editing={editing}
                  setEditing={setEditing}
                  onSave={saveEdit}
                  onCancel={() => setEditing(null)}
                  saving={saving}
                />
              ) : (
                <button
                  onClick={() => setEditing(emptyHabit(habits.length))}
                  className="flex items-center gap-1.5 mt-2 text-[11px] text-shuttle/40 hover:text-burnham transition-colors py-1"
                >
                  <Plus size={12} />
                  Add weekly goal
                </button>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-4 pt-2 border-t border-mercury/40">
          <p className="text-[10px] text-shuttle/30 font-mono">Goals appear as dot-rows on Today screen</p>
        </div>
      </div>
    </div>
  )
}

function EditForm({
  editing,
  setEditing,
  onSave,
  onCancel,
  saving,
}: {
  editing: EditingHabit
  setEditing: (e: EditingHabit) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="border border-burnham/15 rounded-xl p-3 bg-gossip/5 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          value={editing.emoji}
          onChange={e => setEditing({ ...editing, emoji: e.target.value })}
          placeholder="🎯"
          className="w-10 text-center text-[16px] border border-mercury rounded-lg py-1 focus:outline-none focus:border-burnham/30"
          maxLength={2}
        />
        <input
          autoFocus
          value={editing.name}
          onChange={e => setEditing({ ...editing, name: e.target.value })}
          placeholder="Goal name"
          className="flex-1 text-[13px] text-burnham border border-mercury rounded-lg px-3 py-1.5 focus:outline-none focus:border-burnham/30"
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Type</label>
          <select
            value={editing.type}
            onChange={e => setEditing({ ...editing, type: e.target.value as EditingHabit['type'] })}
            className="w-full text-[11px] text-shuttle border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham/30 bg-white"
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">
            Target / week {editing.type === 'minutes' ? '(min)' : ''}
          </label>
          <input
            type="number"
            min={1}
            value={editing.weekly_target}
            onChange={e => setEditing({ ...editing, weekly_target: parseInt(e.target.value) || 1 })}
            className="w-full text-[11px] text-burnham border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham/30"
          />
        </div>
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Data source</label>
        <select
          value={editing.integration_source}
          onChange={e => setEditing({ ...editing, integration_source: e.target.value })}
          className="w-full text-[11px] text-shuttle border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham/30 bg-white"
        >
          {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-[11px] text-shuttle/50 hover:text-shuttle transition-colors px-2 py-1">Cancel</button>
        <button
          onClick={onSave}
          disabled={!editing.name.trim() || saving}
          className="flex items-center gap-1.5 text-[11px] bg-burnham text-gossip px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-burnham/90 transition-colors font-medium"
        >
          <Check size={11} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
