/**
 * MilestonePanel — right-side milestone drawer, rebuilt to the reThink design system.
 *
 * - Header themed by the milestone's chosen color (--c): emoji picker, editable
 *   title, inline color swatches, target-date chip, "Show in Today" focus toggle,
 *   segmented progress.
 * - Subtasks (= todos linked by milestone_id): inline-editable text, one-tap
 *   "↑ today", date chip with presets, "· in today" label, permanent delete.
 * - Adding a step, scheduling, and add-to-today all live here. Removing a step from
 *   Today (elsewhere) only clears its date; the drawer trash deletes permanently.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Plus, Check, Trash, CalendarBlank, Warning, ArrowLineUp, Star,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Milestone, Todo, Goal } from '@/types'

const EMOJI_PRESETS = ['🎯','🧑‍💼','💰','🎒','✍️','🚀','📈','🤝','🏋️','📚','🧠','🌱','🏡','❤️','🎨','🔧','📞','✈️','🏆','⚡']
const COLOR_PRESETS = ['#4F5BD5','#2A8C82','#7C5CBF','#C16A4F','#C9943F','#3E7A4E','#3E5F7A','#7A3E68','#C2566E','#536471']

interface MilestonePanelProps {
  milestone: Milestone | null
  goal: Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'> | null
  userId: string
  today: string
  onClose: () => void
  onMilestoneUpdate: (m: Milestone & { description?: string }) => void
  onMilestoneDelete: (id: string) => void
  onTodoCreate: (todo: Todo) => void
  onTodoUpdate: (todo: Todo) => void
  onTodoDelete: (todoId: string) => void
}

// ── Date chip with presets ────────────────────────────────────────────────────
function DateChip({ value, today, onChange }: {
  value: string | null; today: string; onChange: (d: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const fmt = (d: string) => {
    const date = new Date(d + 'T12:00:00'), t = new Date(today + 'T12:00:00')
    const diff = Math.round((date.getTime() - t.getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    if (diff === -1) return 'yesterday'
    if (diff > 1 && diff < 7) return date.toLocaleDateString('en-US', { weekday: 'short' })
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const presets = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: 'Mon', offset: ((1 - new Date().getDay() + 7) % 7) || 7 },
    { label: 'Next week', offset: 7 },
  ]
  const setOff = (off: number) => {
    const d = new Date(); d.setDate(d.getDate() + off)
    onChange(d.toISOString().slice(0, 10)); setOpen(false)
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className={`td-date-chip${value ? (value === today ? ' is-today' : '') : ' empty'}`}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      >
        {value ? fmt(value) : 'no date'}
      </button>
      {open && (
        <div className="td-date-pop" onClick={e => e.stopPropagation()}>
          {presets.map(p => <button key={p.label} onClick={() => setOff(p.offset)}>{p.label}</button>)}
          <div className="sep" />
          <input type="date" value={value ?? ''} onChange={e => { onChange(e.target.value || null); setOpen(false) }} />
          {value && <>
            <div className="sep" />
            <button onClick={() => { onChange(null); setOpen(false) }} style={{ color: 'var(--fg-3)' }}>Clear date</button>
          </>}
        </div>
      )}
    </span>
  )
}

// ── Single subtask row ────────────────────────────────────────────────────────
function SubtaskRow({ todo, today, onToggle, onText, onDate, onAddToday, onDelete }: {
  todo: Todo; today: string
  onToggle: () => void
  onText: (t: string) => void
  onDate: (d: string | null) => void
  onAddToday: () => void
  onDelete: () => void
}) {
  const isToday = todo.date === today
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(todo.text)
  useEffect(() => setText(todo.text), [todo.text])
  const commit = () => { if (text.trim() && text.trim() !== todo.text) onText(text.trim()); setEditing(false) }

  return (
    <div className={`td-subtask${todo.completed ? ' done' : ''}`}>
      <button className={`cbx${todo.completed ? ' checked' : ''}`} onClick={onToggle} aria-label="Toggle done">
        {todo.completed && <Check size={9} weight="bold" />}
      </button>
      <span className="text" onClick={() => !editing && !todo.completed && setEditing(true)}>
        {editing
          ? <input autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(todo.text); setEditing(false) } }} />
          : todo.text}
      </span>
      <div className="date-cell">
        {isToday
          ? <span className="in-today">· in today</span>
          : <DateChip value={todo.date} today={today} onChange={onDate} />}
      </div>
      <span className="acts">
        {!isToday && !todo.completed && (
          <button className="to-today" title="Add to today" onClick={onAddToday}><ArrowLineUp size={12} /></button>
        )}
        <button className="del" title="Delete permanently" onClick={onDelete}><Trash size={11} /></button>
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function MilestonePanel({
  milestone, goal, userId, today,
  onClose, onMilestoneUpdate, onMilestoneDelete, onTodoCreate, onTodoUpdate, onTodoDelete,
}: MilestonePanelProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [visible, setVisible] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [emoji, setEmoji] = useState<string | null>(milestone?.emoji ?? null)
  const [color, setColor] = useState<string | null>(milestone?.color ?? null)
  const [focused, setFocused] = useState<boolean>(milestone?.focused ?? false)
  const [showEmoji, setShowEmoji] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const c = color ?? goal?.color ?? '#3E7A4E'

  useEffect(() => {
    if (milestone) { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t) }
    setVisible(false)
  }, [milestone?.id])

  const fetchTodos = useCallback(async () => {
    if (!milestone || !userId) return
    setLoading(true)
    const { data } = await supabase
      .from('todos').select('*')
      .eq('milestone_id', milestone.id).eq('user_id', userId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setTodos((data ?? []) as Todo[])
    setLoading(false)
  }, [milestone?.id, userId])

  useEffect(() => {
    if (!milestone) return
    setDescription((milestone as { description?: string }).description ?? '')
    setEmoji(milestone.emoji ?? null)
    setColor(milestone.color ?? null)
    setFocused(milestone.focused ?? false)
    setShowEmoji(false)
    setEditingTitle(false)
    setTodos([])
    setConfirmDelete(false)
    setAdding(false)
    fetchTodos()
  }, [milestone?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!milestone) return null

  const pending = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)
  const ordered = [...pending, ...done]
  const doneCount = done.length
  const total = todos.length

  const handleClose = () => { setVisible(false); setTimeout(onClose, 260) }

  // ── handlers ──────────────────────────────────────────────────────────────
  const saveEmoji = async (val: string | null) => {
    setEmoji(val); setShowEmoji(false)
    await supabase.from('milestones').update({ emoji: val }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, emoji: val } as Milestone)
  }
  const saveColor = async (val: string) => {
    const next = color === val ? null : val   // click selected swatch → reset to goal color
    setColor(next)
    await supabase.from('milestones').update({ color: next }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, color: next } as Milestone)
  }
  const toggleFocus = async () => {
    const next = !focused
    setFocused(next)
    await supabase.from('milestones').update({ focused: next }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, focused: next } as Milestone)
  }
  const saveTitle = async () => {
    setEditingTitle(false)
    const v = titleDraft.trim()
    if (!v || v === milestone.text) return
    await supabase.from('milestones').update({ text: v }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, text: v } as Milestone)
  }
  const handleDescChange = (val: string) => {
    setDescription(val)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      await supabase.from('milestones').update({ description: val } as Record<string, unknown>).eq('id', milestone.id)
      onMilestoneUpdate({ ...milestone, description: val } as Milestone & { description?: string })
    }, 600)
  }
  const handleTargetDate = async (val: string | null) => {
    await supabase.from('milestones').update({ target_date: val }).eq('id', milestone.id)
    onMilestoneUpdate({ ...milestone, target_date: val } as Milestone)
  }
  const handleDeleteMilestone = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    await supabase.from('todos').delete().eq('milestone_id', milestone.id)
    await supabase.from('milestones').delete().eq('id', milestone.id)
    onMilestoneDelete(milestone.id)
    handleClose()
  }
  const toggleTodo = async (todo: Todo) => {
    const marking = !todo.completed
    const patch = { completed: marking, completed_at: marking ? new Date().toISOString() : null }
    const updated = { ...todo, ...patch }
    const next = todos.map(t => t.id === todo.id ? updated : t)
    setTodos(next)
    await supabase.from('todos').update(patch).eq('id', todo.id)
    onTodoUpdate(updated)
    if (marking && next.every(t => t.completed) && milestone.status !== 'COMPLETE') {
      await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', milestone.id)
      onMilestoneUpdate({ ...milestone, status: 'COMPLETE' } as Milestone)
    }
  }
  const editText = async (todo: Todo, text: string) => {
    const updated = { ...todo, text }
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t))
    await supabase.from('todos').update({ text }).eq('id', todo.id)
    onTodoUpdate(updated)
  }
  const changeDate = async (todo: Todo, date: string | null) => {
    const updated = { ...todo, date }
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t))
    await supabase.from('todos').update({ date }).eq('id', todo.id)
    onTodoUpdate(updated)
  }
  const deleteTodo = async (todo: Todo) => {
    setTodos(prev => prev.filter(t => t.id !== todo.id))
    await supabase.from('todos').delete().eq('id', todo.id)
    onTodoDelete(todo.id)
  }
  const addStep = async () => {
    if (!newText.trim()) { setAdding(false); return }
    const { data } = await supabase.from('todos').insert({
      text: newText.trim(), user_id: userId, milestone_id: milestone.id,
      goal_id: goal?.id ?? null, date: null, sort_order: todos.length, completed: false,
    }).select().single()
    if (data) { setTodos(prev => [...prev, data as Todo]); onTodoCreate(data as Todo) }
    setNewText('')
    setTimeout(() => addRef.current?.focus(), 0)
  }

  return (
    <>
      <div className="td-drawer-bg" style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 260ms ease' }} onClick={handleClose} />
      <div
        className="td-drawer"
        style={{ ['--c' as string]: c, transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)' }}
      >
        {/* Header */}
        <div className="td-drawer-hd">
          {goal && (
            <div className="td-drawer-goal">
              {goal.emoji ? `${goal.emoji} ` : ''}{goal.alias ?? goal.text.slice(0, 32)}
            </div>
          )}

          <div className="td-drawer-titlerow">
            <span style={{ position: 'relative' }}>
              <button className="td-drawer-emoji" onClick={() => setShowEmoji(v => !v)} title="Set emoji">
                {emoji ?? goal?.emoji ?? '🎯'}
              </button>
              {showEmoji && (
                <div className="td-date-pop" style={{ left: 0, right: 'auto', width: 212, padding: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
                    {EMOJI_PRESETS.map(e => (
                      <button key={e} onClick={() => saveEmoji(e)} style={{ fontSize: 16, padding: 4, justifyContent: 'center' }}>{e}</button>
                    ))}
                  </div>
                  <div className="sep" />
                  <button onClick={() => saveEmoji(null)} style={{ fontSize: 11, color: 'var(--fg-3)' }}>Use goal emoji</button>
                </div>
              )}
            </span>

            <div className="td-drawer-title">
              {editingTitle ? (
                <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }} />
              ) : (
                <span onClick={() => { setTitleDraft(milestone.text); setEditingTitle(true) }} style={{ cursor: 'text' }}>{milestone.text}</span>
              )}
            </div>

            <div className="td-drawer-acts">
              {confirmDelete ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Warning size={12} style={{ color: 'var(--danger)' }} />
                  <button className="danger" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }} onClick={handleDeleteMilestone}>{deleting ? '…' : 'delete'}</button>
                  <button onClick={() => setConfirmDelete(false)}><X size={12} /></button>
                </span>
              ) : (
                <button className="danger" onClick={() => setConfirmDelete(true)} title="Delete milestone"><Trash size={13} /></button>
              )}
              <button onClick={handleClose} title="Close"><X size={15} /></button>
            </div>
          </div>

          <div className="td-drawer-meta">
            <button className="due" onClick={e => e.stopPropagation()} style={{ padding: 0 }}>
              <CalendarBlank size={11} />
              <DateChip value={milestone.target_date} today={today} onChange={handleTargetDate} />
            </button>
            <div className="td-swatches">
              {COLOR_PRESETS.map(sw => (
                <button
                  key={sw}
                  className={`td-swatch${(color ?? goal?.color) === sw ? ' sel' : ''}`}
                  style={{ background: sw, color: sw }}
                  onClick={() => saveColor(sw)}
                  title={sw}
                />
              ))}
            </div>
            <button className={`focus-toggle${focused ? ' on' : ''}`} onClick={toggleFocus} title="Show this milestone in Today's rail">
              <Star size={11} weight={focused ? 'fill' : 'regular'} />
              {focused ? 'In Today' : 'Show in Today'}
            </button>
          </div>

          {total > 0 && (
            <>
              <div className="td-ms-progress">
                {todos.map((t, i) => <span key={i} className={`seg${t.completed ? ' done' : ''}`} />)}
              </div>
              <div className="td-ms-progress-label">{doneCount} of {total} done</div>
            </>
          )}
        </div>

        {/* Note */}
        <div className="td-drawer-note-wrap">
          <input className="td-drawer-note" value={description} onChange={e => handleDescChange(e.target.value)} placeholder="Add a note…" />
        </div>

        {/* Steps */}
        <div className="td-drawer-body">
          {loading ? (
            <div className="td-drawer-empty">loading…</div>
          ) : total === 0 ? (
            <div className="td-drawer-empty">Add the first step toward this milestone.</div>
          ) : (
            ordered.map(t => (
              <SubtaskRow
                key={t.id} todo={t} today={today}
                onToggle={() => toggleTodo(t)}
                onText={(text) => editText(t, text)}
                onDate={(d) => changeDate(t, d)}
                onAddToday={() => changeDate(t, today)}
                onDelete={() => deleteTodo(t)}
              />
            ))
          )}

          <div className="td-subtask-add" onClick={() => { setAdding(true); setTimeout(() => addRef.current?.focus(), 0) }}>
            <Plus size={13} />
            {adding ? (
              <input
                ref={addRef} autoFocus value={newText}
                onChange={e => setNewText(e.target.value)}
                onBlur={() => { if (!newText.trim()) setAdding(false) }}
                onKeyDown={e => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') { setNewText(''); setAdding(false) } }}
                placeholder="Add a step and press Enter…"
              />
            ) : (
              <span>Add a step…</span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
