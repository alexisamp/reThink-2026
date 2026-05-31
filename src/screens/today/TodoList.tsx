// TodoList — Today's todos (the HERO). Priority / milestone grouping, featured
// star, milestone + mention chips, AM/PM block, inline edit, add, done section.
// Visual contract ported from the reThink design bundle (TodoList.jsx).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Star, TrashSimple, Plus, CaretDown } from '@phosphor-icons/react'
import type { Todo } from '@/types'
import type { GroupBy, Mention } from './types'

function MentionChip({ name, kind, imageUrl }: Mention) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const squared = kind === 'company' || kind === 'opportunity'
  const label = kind === 'person' ? name.split(' ')[0] : name
  return (
    <span className="td-chip-mention">
      <span className={`av${squared ? ' sq' : ''}`}>
        {imageUrl ? <img src={imageUrl} alt="" /> : initial}
      </span>
      {label}
    </span>
  )
}

interface RowProps {
  todo: Todo
  priorityNumber?: number
  milestone?: string | null
  hideMilestone?: boolean
  mentions: Mention[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onEditText: (id: string, text: string) => void
  onMilestoneClick?: (id: string) => void
}

function TodoRow({
  todo, priorityNumber, milestone, hideMilestone, mentions,
  onToggle, onDelete, onStar, onEditText, onMilestoneClick,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(todo.text)
  useEffect(() => setText(todo.text), [todo.text])

  const commit = () => {
    if (text.trim() && text.trim() !== todo.text) onEditText(todo.id, text.trim())
    setEditing(false)
  }

  return (
    <div className={`td-todo${todo.is_featured ? ' featured' : ''}${todo.completed ? ' done' : ''}`}>
      <span className="pri">{priorityNumber ?? ''}</span>
      <button className={`td-cb${todo.completed ? ' checked' : ''}`} onClick={() => onToggle(todo.id)} aria-label="Toggle done">
        {todo.completed && <Check size={9} weight="bold" />}
      </button>
      <div className="text-area" onClick={() => !editing && !todo.completed && setEditing(true)}>
        {editing ? (
          <input
            autoFocus value={text}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setText(todo.text); setEditing(false) }
            }}
          />
        ) : (
          <>
            <span className="body">{todo.text}</span>
            {milestone && !hideMilestone && (
              <button
                className="td-chip-ms"
                onClick={(e) => { e.stopPropagation(); if (todo.milestone_id && onMilestoneClick) onMilestoneClick(todo.milestone_id) }}
              >
                {milestone}
              </button>
            )}
            {mentions.map((m, i) => <MentionChip key={i} {...m} />)}
          </>
        )}
      </div>
      {todo.block && <span className="block">{todo.block}</span>}
      <span className="actions">
        <button
          className={`star${todo.is_featured ? ' on' : ''}`}
          title={todo.is_featured ? 'Unstar' : 'Star as one thing'}
          onClick={() => onStar(todo.id)}
        >
          <Star size={12} weight={todo.is_featured ? 'fill' : 'regular'} />
        </button>
        <button title="Delete" onClick={() => onDelete(todo.id)}><TrashSimple size={12} /></button>
      </span>
    </div>
  )
}

function AddTodo({ onAdd, label = 'Add a task' }: { onAdd: (text: string) => void; label?: string }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const commit = () => { if (text.trim()) onAdd(text.trim()); setText(''); setEditing(false) }

  if (!editing) {
    return (
      <button className="td-add" onClick={() => setEditing(true)}>
        <Plus size={13} />
        <span>{label}</span>
      </button>
    )
  }
  return (
    <div className="td-add">
      <span className="td-cb" />
      <input
        autoFocus placeholder="What's next?" value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(''); setEditing(false) } }}
      />
    </div>
  )
}

function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (g: GroupBy) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span ref={wrap} style={{ position: 'relative' }}>
      <button className="group-toggle" onClick={() => setOpen(o => !o)}>
        group: {value}
        <CaretDown size={9} />
      </button>
      {open && (
        <div className="td-popover">
          {(['priority', 'milestone'] as GroupBy[]).map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}>
              {opt}
              {value === opt && <Check size={10} />}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

interface TodoListProps {
  todos: Todo[]
  milestoneName: (id: string | null) => string | null
  milestoneTotal: (id: string) => number
  milestoneOrder: string[]
  resolveMentions: (todo: Todo) => Mention[]
  groupBy: GroupBy
  onChangeGroup: (g: GroupBy) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onEditText: (id: string, text: string) => void
  onAdd: (text: string, milestoneId: string | null) => void
  onMilestoneClick: (id: string) => void
}

export default function TodoList({
  todos, milestoneName, milestoneTotal, milestoneOrder, resolveMentions,
  groupBy, onChangeGroup, onToggle, onDelete, onStar, onEditText, onAdd, onMilestoneClick,
}: TodoListProps) {
  const active = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)

  // priority numbers global to active list (1..3)
  const priMap = new Map<string, number>()
  active.forEach((t, i) => { if (i < 3) priMap.set(t.id, i + 1) })

  const groups = useMemo(() => {
    if (groupBy !== 'milestone') return null
    const map = new Map<string, Todo[]>()
    active.forEach(t => {
      const key = t.milestone_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    const out: { id: string; name: string; todos: Todo[]; total: number }[] = []
    milestoneOrder.forEach(mid => {
      if (map.has(mid)) out.push({ id: mid, name: milestoneName(mid) ?? 'Milestone', todos: map.get(mid)!, total: milestoneTotal(mid) })
    })
    if (map.has('__none__')) out.push({ id: '__none__', name: 'No milestone', todos: map.get('__none__')!, total: 0 })
    return out
  }, [active, groupBy, milestoneOrder, milestoneName, milestoneTotal])

  return (
    <section className="td-section">
      <div className="td-section-hd">
        <h3>Today's todos</h3>
        <div className="rule" />
        <span className="count">{active.length} active · {done.length} done</span>
        <GroupToggle value={groupBy} onChange={onChangeGroup} />
      </div>

      {groupBy === 'priority' && (
        <>
          {active.map(t => (
            <TodoRow
              key={t.id} todo={t} priorityNumber={priMap.get(t.id)}
              milestone={milestoneName(t.milestone_id)} mentions={resolveMentions(t)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
            />
          ))}
          {active.length === 0 && (
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
          )}
          <AddTodo onAdd={(text) => onAdd(text, null)} />
        </>
      )}

      {groupBy === 'milestone' && groups && groups.map(g => (
        <div key={g.id}>
          <div className={`td-group-hd${g.id === '__none__' ? ' no-ms' : ''}`}>
            <span className="dot" />
            <span className="name">{g.name}</span>
            <span className="rule" />
            <span className="count">
              {g.todos.length}{g.total ? ` of ${g.total} here` : ` todo${g.todos.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {g.todos.map(t => (
            <TodoRow
              key={t.id} todo={t} priorityNumber={priMap.get(t.id)}
              milestone={milestoneName(t.milestone_id)} hideMilestone={g.id !== '__none__'}
              mentions={resolveMentions(t)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
            />
          ))}
          <AddTodo
            onAdd={(text) => onAdd(text, g.id === '__none__' ? null : g.id)}
            label={g.id === '__none__' ? 'Add a task' : `Add to ${g.name}…`}
          />
        </div>
      ))}

      {done.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="td-group-hd no-ms">
            <span className="dot" style={{ background: 'color-mix(in oklab, var(--shuttle) 20%, transparent)' }} />
            <span className="name">Done</span>
            <span className="rule" />
            <span className="count">{done.length}</span>
          </div>
          {done.map(t => (
            <TodoRow
              key={t.id} todo={t} milestone={milestoneName(t.milestone_id)} mentions={resolveMentions(t)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
            />
          ))}
        </div>
      )}
    </section>
  )
}
