// TodoList — Today's todos (the HERO). Priority / milestone grouping, featured
// star, milestone + mention chips, AM/PM block, inline edit, add, done section.
// Visual contract ported from the reThink design bundle (TodoList.jsx).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Star, TrashSimple, Plus, CaretDown, DotsSixVertical, X, HourglassMedium } from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Todo } from '@/types'
import type { GroupBy, Mention } from './types'

interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}

const KIND_LABEL: Record<Mention['kind'], string> = {
  person: 'People',
  company: 'Companies',
  opportunity: 'Opportunities',
}

function mentionKey(m: Mention) {
  return `${m.kind}:${m.id ?? m.name}`
}

function findMentionTrigger(value: string, cursor: number | null): { start: number; end: number; query: string } | null {
  const end = cursor ?? value.length
  const left = value.slice(0, end)
  const match = /(^|\s)@([^\s@/]*)$/.exec(left)
  if (!match || match.index === undefined) return null
  return { start: match.index + match[1].length, end, query: match[2] ?? '' }
}

function groupedMentionOptions(options: Mention[], query: string) {
  const q = query.trim().toLowerCase()
  return (['person', 'company', 'opportunity'] as Mention['kind'][]).map(kind => ({
    kind,
    items: options
      .filter(m => m.kind === kind)
      .filter(m => !q || `${m.name} ${m.sub ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6),
  })).filter(g => g.items.length > 0)
}

function linksFromMentions(items: Mention[]): TodoLinks {
  return {
    contactId: items.find(m => m.kind === 'person')?.id ?? null,
    companyId: items.find(m => m.kind === 'company')?.id ?? items.find(m => m.kind === 'opportunity')?.companyId ?? null,
    opportunityId: items.find(m => m.kind === 'opportunity')?.id ?? null,
  }
}

function linksForTodoEdit(todo: Todo, originalMentions: Mention[], linked: Mention[]): TodoLinks {
  const selected = linksFromMentions(linked)
  return {
    contactId: originalMentions.some(m => m.kind === 'person') || !todo.contact_id ? selected.contactId : todo.contact_id,
    companyId: originalMentions.some(m => m.kind === 'company') || !todo.company_id ? selected.companyId : todo.company_id,
    opportunityId: originalMentions.some(m => m.kind === 'opportunity') || !todo.opportunity_id ? selected.opportunityId : todo.opportunity_id,
  }
}

function MentionChip({ name, kind, imageUrl, onClick }: Mention & { onClick?: () => void }) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const squared = kind === 'company' || kind === 'opportunity'
  const label = kind === 'person' ? name.split(' ')[0] : name
  return (
    <span
      className={`td-chip-mention${onClick ? ' clickable' : ''}`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={`av${squared ? ' sq' : ''}`}>
        {imageUrl ? <img src={imageUrl} alt="" /> : initial}
      </span>
      {label}
    </span>
  )
}

function MentionPicker({
  groups, activeKey, onSelect,
}: {
  groups: ReturnType<typeof groupedMentionOptions>
  activeKey: string | null
  onSelect: (m: Mention) => void
}) {
  return (
    <div className="td-mention-picker">
      {groups.length === 0 ? (
        <div className="td-mention-empty">No matches</div>
      ) : groups.map(group => (
        <div className="td-mention-section" key={group.kind}>
          <div className="td-mention-header">{KIND_LABEL[group.kind]}</div>
          {group.items.map(item => {
            const initial = (item.name || '?').charAt(0).toUpperCase()
            const squared = item.kind !== 'person'
            return (
              <button
                key={mentionKey(item)}
                type="button"
                className={`td-mention-row${activeKey === mentionKey(item) ? ' active' : ''}`}
                onMouseDown={e => { e.preventDefault(); onSelect(item) }}
              >
                <span className={`td-mention-avatar${squared ? ' sq' : ''}`}>
                  {item.imageUrl ? <img src={item.imageUrl} alt="" /> : initial}
                </span>
                <span className="td-mention-copy">
                  <span className="name">{item.name}</span>
                  {item.sub && <span className="sub">{item.sub}</span>}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MentionTextInput({
  value, onValueChange, linked, onLinkedChange, mentionOptions, placeholder, autoFocus,
  onCommit, onCancel,
}: {
  value: string
  onValueChange: (value: string) => void
  linked: Mention[]
  onLinkedChange: (items: Mention[]) => void
  mentionOptions: Mention[]
  placeholder?: string
  autoFocus?: boolean
  onCommit: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [trigger, setTrigger] = useState<{ start: number; end: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const groups = useMemo(() => groupedMentionOptions(mentionOptions, trigger?.query ?? ''), [mentionOptions, trigger])
  const flat = groups.flatMap(g => g.items)
  const activeKey = flat[active] ? mentionKey(flat[active]) : null

  const refreshTrigger = (nextValue: string, cursor: number | null) => {
    const next = findMentionTrigger(nextValue, cursor)
    setTrigger(next)
    setActive(0)
  }

  const selectMention = (item: Mention) => {
    if (!trigger) return
    const before = value.slice(0, trigger.start)
    const after = value.slice(trigger.end).replace(/^\s+/, '')
    const nextValue = `${before}${after}`.replace(/\s{2,}/g, ' ').trimStart()
    onValueChange(nextValue)
    onLinkedChange(prevLinked(linked, item, mentionOptions))
    setTrigger(null)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="td-mention-wrap">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={e => {
          onValueChange(e.currentTarget.value)
          refreshTrigger(e.currentTarget.value, e.currentTarget.selectionStart)
        }}
        onClick={e => refreshTrigger(value, e.currentTarget.selectionStart)}
        onBlur={onCommit}
        onKeyDown={e => {
          if (trigger) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => flat.length ? (i + 1) % flat.length : 0); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => flat.length ? (i - 1 + flat.length) % flat.length : 0); return }
            if ((e.key === 'Enter' || e.key === 'Tab') && flat[active]) { e.preventDefault(); selectMention(flat[active]); return }
            if (e.key === 'Escape') { e.preventDefault(); setTrigger(null); return }
          }
          if (e.key === 'Enter') onCommit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      {linked.length > 0 && (
        <span className="td-linked-mentions">
          {linked.map(m => (
            <button
              key={mentionKey(m)}
              type="button"
              className="td-linked-chip"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onLinkedChange(linked.filter(x => mentionKey(x) !== mentionKey(m)))}
            >
              <MentionChip {...m} />
              <X size={9} />
            </button>
          ))}
        </span>
      )}
      {trigger && <MentionPicker groups={groups} activeKey={activeKey} onSelect={selectMention} />}
    </div>
  )
}

function prevLinked(current: Mention[], item: Mention, options: Mention[]) {
  const next = current.filter(m => m.kind !== item.kind)
  next.push(item)
  if (item.kind === 'opportunity' && item.companyId && !next.some(m => m.kind === 'company')) {
    const company = options.find(m => m.kind === 'company' && m.id === item.companyId)
    if (company) next.push(company)
  }
  return next
}

interface RowProps {
  todo: Todo
  priorityNumber?: number
  milestone?: string | null
  hideMilestone?: boolean
  mentions: Mention[]
  mentionOptions: Mention[]
  milestoneColor?: string | null
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, links?: TodoLinks) => void
  onMilestoneClick?: (id: string) => void
  dragRef?: (el: HTMLElement | null) => void
  dragStyle?: CSSProperties
  dragHandle?: ReactNode
}

function TodoRow({
  todo, priorityNumber, milestone, hideMilestone, mentions, mentionOptions, milestoneColor,
  onToggle, onDelete, onStar, onToggleWaiting, onEditText, onMilestoneClick,
  dragRef, dragStyle, dragHandle,
}: RowProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(todo.text)
  const [linked, setLinked] = useState<Mention[]>(mentions)
  useEffect(() => setText(todo.text), [todo.text])
  useEffect(() => { if (!editing) setLinked(mentions) }, [mentions, editing])

  const commit = () => {
    if (text.trim()) {
      const links = linksForTodoEdit(todo, mentions, linked)
      const changedLinks =
        links.contactId !== (todo.contact_id ?? null) ||
        links.companyId !== (todo.company_id ?? null) ||
        links.opportunityId !== (todo.opportunity_id ?? null)
      if (text.trim() !== todo.text || changedLinks) onEditText(todo.id, text.trim(), links)
    }
    setEditing(false)
  }
  const cancel = () => { setText(todo.text); setLinked(mentions); setEditing(false) }

  return (
    <div ref={dragRef} style={dragStyle} className={`td-todo${todo.is_featured ? ' featured' : ''}${todo.completed ? ' done' : ''}${todo.waiting ? ' waiting' : ''}`}>
      {dragHandle}
      <span className="pri">{priorityNumber ?? ''}</span>
      <button className={`td-cb${todo.completed ? ' checked' : ''}`} onClick={() => onToggle(todo.id)} aria-label="Toggle done">
        {todo.completed && <Check size={9} weight="bold" />}
      </button>
      <div className="text-area" onClick={() => !editing && !todo.completed && setEditing(true)}>
        {editing ? (
          <MentionTextInput
            autoFocus
            value={text}
            onValueChange={setText}
            linked={linked}
            onLinkedChange={setLinked}
            mentionOptions={mentionOptions}
            placeholder="Type @ to link CRM"
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <>
            <span className="body">{todo.text}</span>
            {mentions.map((m, i) => (
              <MentionChip
                key={i}
                {...m}
                onClick={m.id ? () => {
                  if (m.kind === 'person') navigate(`/people/${m.id}`)
                  if (m.kind === 'company') navigate(`/people/companies/${m.id}`)
                  if (m.kind === 'opportunity') navigate(`/people/opportunities/${m.id}`)
                } : undefined}
              />
            ))}
            {todo.waiting && <span className="td-chip-waiting"><HourglassMedium size={10} /> on hold</span>}
            {milestone && !hideMilestone && (
              <button
                className="td-chip-ms"
                style={milestoneColor ? { ['--ms' as string]: milestoneColor } : undefined}
                onClick={(e) => { e.stopPropagation(); if (todo.milestone_id && onMilestoneClick) onMilestoneClick(todo.milestone_id) }}
              >
                {milestone}
              </button>
            )}
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
        <button
          className={`hold${todo.waiting ? ' on' : ''}`}
          title={todo.waiting ? 'Remove on hold' : 'Mark on hold'}
          onClick={() => onToggleWaiting(todo.id)}
        >
          <HourglassMedium size={12} weight={todo.waiting ? 'fill' : 'regular'} />
        </button>
        <button title="Delete" onClick={() => onDelete(todo.id)}><TrashSimple size={12} /></button>
      </span>
    </div>
  )
}

function SortableTodoRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.todo.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 20 : undefined,
  }
  const handle = (
    <button className="grip-todo" {...attributes} {...listeners} title="Drag to reorder" aria-label="Drag to reorder">
      <DotsSixVertical size={11} />
    </button>
  )
  return <TodoRow {...props} dragRef={setNodeRef} dragStyle={style} dragHandle={handle} />
}

function AddTodo({
  onAdd, mentionOptions, label = 'Add a task',
}: {
  onAdd: (text: string, links: TodoLinks) => void
  mentionOptions: Mention[]
  label?: string
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [linked, setLinked] = useState<Mention[]>([])
  const commit = () => {
    if (text.trim()) onAdd(text.trim(), linksFromMentions(linked))
    setText('')
    setLinked([])
    setEditing(false)
  }
  const cancel = () => {
    setText('')
    setLinked([])
    setEditing(false)
  }

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
      <MentionTextInput
        autoFocus
        placeholder="What's next? Type @ to link CRM"
        value={text}
        onValueChange={setText}
        linked={linked}
        onLinkedChange={setLinked}
        mentionOptions={mentionOptions}
        onCommit={commit}
        onCancel={cancel}
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
  milestoneColor: (id: string | null) => string | null
  milestoneTotal: (id: string) => number
  milestoneOrder: string[]
  resolveMentions: (todo: Todo) => Mention[]
  mentionOptions: Mention[]
  groupBy: GroupBy
  onChangeGroup: (g: GroupBy) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, links?: TodoLinks) => void
  onAdd: (text: string, milestoneId: string | null, links?: TodoLinks) => void
  onMilestoneClick: (id: string) => void
  onReorder?: (orderedActiveIds: string[]) => void
}

export default function TodoList({
  todos, milestoneName, milestoneColor, milestoneTotal, milestoneOrder, resolveMentions, mentionOptions,
  groupBy, onChangeGroup, onToggle, onDelete, onStar, onToggleWaiting, onEditText, onAdd, onMilestoneClick, onReorder,
}: TodoListProps) {
  const active = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e
    if (!over || a.id === over.id || !onReorder) return
    const ids = active.map(t => t.id)
    const from = ids.indexOf(a.id as string)
    const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={active.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {active.map(t => (
                <SortableTodoRow
                  key={t.id} todo={t} priorityNumber={priMap.get(t.id)}
                  milestone={milestoneName(t.milestone_id)} mentions={resolveMentions(t)}
                  mentionOptions={mentionOptions}
                  milestoneColor={milestoneColor(t.milestone_id)}
                  onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
                />
              ))}
            </SortableContext>
          </DndContext>
          {active.length === 0 && (
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
          )}
          <AddTodo mentionOptions={mentionOptions} onAdd={(text, links) => onAdd(text, null, links)} />
        </>
      )}

      {groupBy === 'milestone' && groups && (
        groups.length === 0 ? (
          <>
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
            <AddTodo mentionOptions={mentionOptions} onAdd={(text, links) => onAdd(text, null, links)} />
          </>
        ) : groups.map(g => (
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
                mentionOptions={mentionOptions}
                milestoneColor={milestoneColor(t.milestone_id)}
                onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
              />
            ))}
            <AddTodo
              mentionOptions={mentionOptions}
              onAdd={(text, links) => onAdd(text, g.id === '__none__' ? null : g.id, links)}
              label={g.id === '__none__' ? 'Add a task' : `Add to ${g.name}…`}
            />
          </div>
        ))
      )}

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
              mentionOptions={mentionOptions}
              milestoneColor={milestoneColor(t.milestone_id)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onMilestoneClick={onMilestoneClick}
            />
          ))}
        </div>
      )}
    </section>
  )
}
