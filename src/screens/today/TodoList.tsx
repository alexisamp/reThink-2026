// TodoList — Today's todos (the HERO). Priority / milestone grouping, featured
// star, milestone + mention chips, AM/PM block, inline edit, add, done section.
// Visual contract ported from the reThink design bundle (TodoList.jsx).
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Star, TrashSimple, CaretDown, DotsSixVertical, HourglassMedium } from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import MentionEditor, { MentionChip as RichMentionChip } from './MentionEditor'
import type { GroupBy, Mention, TodoMilestoneOption } from './types'
import {
  editorToContentSegments,
  linksFromMentions as linksFromMentionItems,
  plainTextFromEditorSegments,
  segmentsForTodo,
  type EditorSegment,
} from '@/lib/todoContent'
import { pathForMention } from '@/lib/crmObjects'

interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}

function linksFromMentions(items: Mention[]): TodoLinks {
  return linksFromMentionItems(items)
}

function linksForTodoEdit(todo: Todo, originalMentions: Mention[], linked: Mention[]): TodoLinks {
  const selected = linksFromMentions(linked)
  return {
    contactId: originalMentions.some(m => m.kind === 'person') || !todo.contact_id ? selected.contactId : todo.contact_id,
    companyId: originalMentions.some(m => m.kind === 'company') || !todo.company_id ? selected.companyId : todo.company_id,
    opportunityId: originalMentions.some(m => m.kind === 'opportunity') || !todo.opportunity_id ? selected.opportunityId : todo.opportunity_id,
  }
}

function MilestoneOptionRow({
  option,
  selected,
  clear,
  onMouseDown,
}: {
  option?: TodoMilestoneOption
  selected?: boolean
  clear?: boolean
  onMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={`td-mention-row td-ms-option${selected ? ' active' : ''}${clear ? ' clear' : ''}`}
      onMouseDown={onMouseDown}
    >
      <span className="td-ms-option-dot" style={option ? { ['--ms' as string]: option.color } : undefined} />
      <span className="td-mention-copy">
        <span className="name">{clear ? 'No milestone' : option?.name}</span>
        {option ? (
          <span className="sub">{[option.goalLabel, option.due, option.total ? `${option.done}/${option.total}` : null].filter(Boolean).join(' · ')}</span>
        ) : (
          <span className="sub">Remove milestone from this todo</span>
        )}
      </span>
    </button>
  )
}

function MilestoneChipPicker({
  label,
  color,
  currentMilestoneId,
  options,
  onSelect,
  onOpenDetail,
}: {
  label?: string | null
  color?: string | null
  currentMilestoneId?: string | null
  options: TodoMilestoneOption[]
  onSelect: (milestoneId: string | null) => void
  onOpenDetail?: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const visible = options.slice(0, 10)
  return (
    <span ref={wrap} className="td-ms-chip-wrap">
      <button
        type="button"
        className={`td-chip-ms${label ? '' : ' ghost'}`}
        style={color ? { ['--ms' as string]: color } : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onOpenDetail?.()
        }}
      >
        {label ?? 'Add milestone'}
      </button>
      {open && (
        <div className="td-mention-picker td-ms-picker chip-pop">
          <div className="td-mention-header">Milestones</div>
          {currentMilestoneId && (
            <MilestoneOptionRow
              clear
              onMouseDown={(e) => { e.preventDefault(); onSelect(null); setOpen(false) }}
            />
          )}
          {visible.length === 0 ? (
            <div className="td-mention-empty">No active milestones</div>
          ) : visible.map(option => (
            <MilestoneOptionRow
              key={option.id}
              option={option}
              selected={option.id === currentMilestoneId}
              onMouseDown={(e) => { e.preventDefault(); onSelect(option.id); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </span>
  )
}

interface RowProps {
  todo: Todo
  priorityNumber?: number
  milestone?: string | null
  hideMilestone?: boolean
  mentions: Mention[]
  mentionOptions: Mention[]
  milestoneOptions: TodoMilestoneOption[]
  milestoneColor?: string | null
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onChangeMilestone: (id: string, milestoneId: string | null) => void
  onMilestoneClick?: (id: string) => void
  dragRef?: (el: HTMLElement | null) => void
  dragStyle?: CSSProperties
  dragHandle?: ReactNode
}

function TodoRow({
  todo, priorityNumber, milestone, hideMilestone, mentions, mentionOptions, milestoneOptions, milestoneColor,
  onToggle, onDelete, onStar, onToggleWaiting, onEditText, onCreateMention, onChangeMilestone, onMilestoneClick,
  dragRef, dragStyle, dragHandle,
}: RowProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [segmentPreview, setSegmentPreview] = useState<{
    todoId: string
    baseText: string
    baseContentKey: string
    text: string
    contentKey: string
    segments: EditorSegment[]
  } | null>(null)

  const goToMention = (m: Mention) => {
    if (!m.id) return
    navigate(pathForMention(m))
  }

  const renderBody = () => {
    const todoContentKey = JSON.stringify(todo.content_segments ?? [])
    const canUsePreview = segmentPreview?.todoId === todo.id && (
      (todo.text === segmentPreview.baseText && todoContentKey === segmentPreview.baseContentKey) ||
      (todo.text === segmentPreview.text && todoContentKey === segmentPreview.contentKey)
    )
    const segments = canUsePreview ? segmentPreview.segments : segmentsForTodo(todo, mentions, mentionOptions)
    return segments.map((segment, index) => (
      segment.type === 'text'
        ? <span className="body" key={`t-${index}`}>{segment.text}</span>
        : <RichMentionChip key={`m-${index}-${segment.mention.kind}-${segment.mention.id}`} mention={segment.mention} onClick={() => goToMention(segment.mention)} />
    ))
  }

  const commit = (nextSegments: EditorSegment[]) => {
    const nextLinked = nextSegments.filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention').map(s => s.mention)
    const nextText = plainTextFromEditorSegments(nextSegments)
    const contentSegments = editorToContentSegments(nextSegments)
    if (nextText || nextLinked.length > 0) {
      setSegmentPreview({
        todoId: todo.id,
        baseText: todo.text,
        baseContentKey: JSON.stringify(todo.content_segments ?? []),
        text: nextText,
        contentKey: JSON.stringify(contentSegments),
        segments: nextSegments,
      })
      const links = linksForTodoEdit(todo, mentions, nextLinked)
      const changedLinks =
        links.contactId !== (todo.contact_id ?? null) ||
        links.companyId !== (todo.company_id ?? null) ||
        links.opportunityId !== (todo.opportunity_id ?? null)
      const changedSegments = JSON.stringify(contentSegments) !== JSON.stringify(todo.content_segments ?? [])
      if (nextText !== todo.text || changedLinks || changedSegments) onEditText(todo.id, nextText, contentSegments, links)
    }
    setEditing(false)
  }
  const cancel = () => { setEditing(false) }

  return (
    <div ref={dragRef} style={dragStyle} className={`td-todo${editing ? ' editing' : ''}${todo.is_featured ? ' featured' : ''}${todo.completed ? ' done' : ''}${todo.waiting ? ' waiting' : ''}`}>
      {dragHandle}
      <span className="pri">{priorityNumber ?? ''}</span>
      <button className={`td-cb${todo.completed ? ' checked' : ''}`} onClick={() => onToggle(todo.id)} aria-label="Toggle done">
        {todo.completed && <Check size={9} weight="bold" />}
      </button>
      <div className="text-area" onClick={() => !editing && !todo.completed && setEditing(true)}>
        {editing ? (
          <MentionEditor
            autoFocus
            initialSegments={segmentsForTodo(todo, mentions, mentionOptions)}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            currentMilestoneId={todo.milestone_id}
            placeholder="Type @ to link CRM"
            onCommit={commit}
            onCancel={cancel}
            onOpenMention={goToMention}
            onCreateMention={onCreateMention}
            onSelectMilestone={(milestoneId) => onChangeMilestone(todo.id, milestoneId)}
          />
        ) : (
          <>
            <span className="td-flow">{renderBody()}</span>
            <span className="td-meta">
              {!hideMilestone && (
                <MilestoneChipPicker
                  label={milestone}
                  color={milestoneColor}
                  currentMilestoneId={todo.milestone_id}
                  options={milestoneOptions}
                  onSelect={(milestoneId) => onChangeMilestone(todo.id, milestoneId)}
                  onOpenDetail={() => { if (todo.milestone_id && onMilestoneClick) onMilestoneClick(todo.milestone_id) }}
                />
              )}
              {todo.waiting && (
                <button className="td-chip-waiting clickable" onClick={(e) => { e.stopPropagation(); onToggleWaiting(todo.id) }}>
                  <HourglassMedium size={10} /> on hold
                </button>
              )}
            </span>
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
  onAdd, mentionOptions, milestoneOptions, onCreateMention, label = 'Type a todo...',
}: {
  onAdd: (text: string, milestoneId: string | null, contentSegments: TodoContentSegment[], links: TodoLinks) => void
  mentionOptions: Mention[]
  milestoneOptions: TodoMilestoneOption[]
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  label?: string
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null)
  const selectedMilestoneRef = useRef<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const selectedMilestone = milestoneOptions.find(m => m.id === selectedMilestoneId) ?? null
  const selectMilestone = (id: string | null) => {
    selectedMilestoneRef.current = id
    setSelectedMilestoneId(id)
  }
  const commit = (segments: EditorSegment[]) => {
    const linked = segments.filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention').map(s => s.mention)
    const text = plainTextFromEditorSegments(segments)
    const contentSegments = editorToContentSegments(segments)
    if (text || linked.length > 0) {
      onAdd(text, selectedMilestoneRef.current, contentSegments, linksFromMentions(linked))
      selectMilestone(null)
      setEditorKey(k => k + 1)
      setEditing(true)
    } else {
      setEditing(false)
      selectMilestone(null)
    }
  }
  const cancel = () => {
    setEditing(false)
    selectMilestone(null)
    setEditorKey(k => k + 1)
  }

  if (!editing) {
    return (
      <button className="td-add empty-row" onClick={() => setEditing(true)}>
        <span className="td-cb ghost" />
        <span className="td-add-placeholder">{label}</span>
      </button>
    )
  }
  return (
    <div className="td-add">
      <span className="td-cb" />
      <MentionEditor
        key={editorKey}
        autoFocus
        placeholder="Type a todo...  @ for CRM, / for milestone"
        initialSegments={[]}
        mentionOptions={mentionOptions}
        milestoneOptions={milestoneOptions}
        currentMilestoneId={selectedMilestoneId}
        onCommit={commit}
        onCancel={cancel}
        onOpenMention={(mention) => { if (mention.id) navigate(pathForMention(mention)) }}
        onCreateMention={onCreateMention}
        onSelectMilestone={selectMilestone}
      />
      {selectedMilestone && (
        <button
          type="button"
          className="td-chip-ms"
          style={{ ['--ms' as string]: selectedMilestone.color }}
          onClick={() => selectMilestone(null)}
        >
          {selectedMilestone.name}
        </button>
      )}
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
  milestoneOptions: TodoMilestoneOption[]
  groupBy: GroupBy
  onChangeGroup: (g: GroupBy) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onToggleWaiting: (id: string) => void
  onEditText: (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onAdd: (text: string, milestoneId: string | null, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onChangeMilestone: (id: string, milestoneId: string | null) => void
  onMilestoneClick: (id: string) => void
  onReorder?: (orderedActiveIds: string[]) => void
}

export default function TodoList({
  todos, milestoneName, milestoneColor, milestoneTotal, milestoneOrder, resolveMentions, mentionOptions, milestoneOptions,
  groupBy, onChangeGroup, onToggle, onDelete, onStar, onToggleWaiting, onEditText, onAdd, onCreateMention, onChangeMilestone, onMilestoneClick, onReorder,
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

  const groups = (() => {
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
  })()

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
                  milestoneOptions={milestoneOptions}
                  milestoneColor={milestoneColor(t.milestone_id)}
                  onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onCreateMention={onCreateMention} onChangeMilestone={onChangeMilestone} onMilestoneClick={onMilestoneClick}
                />
              ))}
            </SortableContext>
          </DndContext>
          {active.length === 0 && (
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
          )}
          <AddTodo mentionOptions={mentionOptions} milestoneOptions={milestoneOptions} onCreateMention={onCreateMention} onAdd={onAdd} />
        </>
      )}

      {groupBy === 'milestone' && groups && (
        groups.length === 0 ? (
          <>
            <div className="td-ms-empty">Nothing yet. Add the first thing that matters today.</div>
            <AddTodo mentionOptions={mentionOptions} milestoneOptions={milestoneOptions} onCreateMention={onCreateMention} onAdd={onAdd} />
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
                milestoneOptions={milestoneOptions}
                milestoneColor={milestoneColor(t.milestone_id)}
                onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onCreateMention={onCreateMention} onChangeMilestone={onChangeMilestone} onMilestoneClick={onMilestoneClick}
              />
            ))}
            <AddTodo
              mentionOptions={mentionOptions}
              milestoneOptions={milestoneOptions}
              onCreateMention={onCreateMention}
              onAdd={(text, milestoneId, segments, links) => onAdd(text, milestoneId ?? (g.id === '__none__' ? null : g.id), segments, links)}
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
              milestoneOptions={milestoneOptions}
              milestoneColor={milestoneColor(t.milestone_id)}
              onToggle={onToggle} onDelete={onDelete} onStar={onStar} onToggleWaiting={onToggleWaiting} onEditText={onEditText} onCreateMention={onCreateMention} onChangeMilestone={onChangeMilestone} onMilestoneClick={onMilestoneClick}
            />
          ))}
        </div>
      )}
    </section>
  )
}
