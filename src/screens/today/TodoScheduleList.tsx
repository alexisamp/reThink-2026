import { useState, type DragEvent, type FormEvent } from 'react'
import { Check, DotsSixVertical, Plus } from '@phosphor-icons/react'
import type { Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import EditableTodoText from './EditableTodoText'
import TodoPreviewTarget from './TodoPreviewTarget'
import type { Mention, TodoMilestoneOption } from './types'
import type { TodoLinks } from '@/lib/todoContent'

export default function TodoScheduleList({
  todos,
  onToggle,
  onAdd,
  onDropTodo,
  onDragArm,
  resolveMentions,
  mentionOptions,
  milestoneOptions,
  onEditText,
  onCreateMention,
  onChangeMilestone,
}: {
  todos: Todo[]
  onToggle: (id: string) => void
  onAdd: (text: string, milestoneId: string | null, contentSegments: TodoContentSegment[]) => void
  onDropTodo?: (id: string) => void
  onDragArm?: (armed: boolean) => void
  resolveMentions: (todo: Todo) => Mention[]
  mentionOptions: Mention[]
  milestoneOptions: TodoMilestoneOption[]
  onEditText: (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onChangeMilestone: (id: string, milestoneId: string | null) => void
}) {
  const [text, setText] = useState('')
  const [dropOver, setDropOver] = useState(false)

  const startDrag = (todo: Todo, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/todo-id', todo.id)
    event.dataTransfer.setData('text/plain', todo.id)
    onDragArm?.(true)
  }

  const dragTodoId = (event: DragEvent<HTMLElement>) => {
    return event.dataTransfer.getData('text/todo-id') || event.dataTransfer.getData('text/plain')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = text.trim()
    if (!next) return
    onAdd(next, null, [{ type: 'text', text: next }])
    setText('')
  }

  return (
    <aside className="todo-schedule-list" aria-label="Unscheduled todos">
      <header className="todo-schedule-hd">
        <div>
          <h3>Todos</h3>
          <span>Drag in or drop back here</span>
        </div>
        <strong>{todos.length}</strong>
      </header>

      <div
        className={`todo-schedule-items${dropOver ? ' drop-over' : ''}`}
        onDragOver={event => {
          if (!onDropTodo) return
          if (!Array.from(event.dataTransfer.types).some(type => type === 'text/todo-id' || type === 'text/plain')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropOver(true)
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={event => {
          event.preventDefault()
          setDropOver(false)
          const id = dragTodoId(event)
          if (id) onDropTodo?.(id)
        }}
      >
        {todos.length === 0 ? (
          <div className="todo-schedule-empty">
            <span>No unscheduled todos.</span>
            <small>Drop calendar blocks here to remove their time.</small>
          </div>
        ) : todos.map(todo => {
          const rowMentions = resolveMentions(todo)
          return (
            <TodoPreviewTarget
              as="div"
              key={todo.id}
              todo={todo}
              mentions={rowMentions}
              mentionOptions={mentionOptions}
              className={`todo-schedule-row${todo.completed ? ' done' : ''}`}
            >
              <span
                className="todo-schedule-grip"
                draggable
                onDragStart={event => startDrag(todo, event)}
                onDragEnd={() => onDragArm?.(false)}
                title="Drag to schedule"
              >
                <DotsSixVertical size={12} />
              </span>
              <button className={`todo-schedule-check${todo.completed ? ' checked' : ''}`} onClick={() => onToggle(todo.id)} title={todo.completed ? 'Mark active' : 'Mark complete'}>
                {todo.completed && <Check size={9} weight="bold" />}
              </button>
              <EditableTodoText
                todo={todo}
                mentions={rowMentions}
                mentionOptions={mentionOptions}
                milestoneOptions={milestoneOptions}
                className="todo-schedule-text"
                onEditText={onEditText}
                onCreateMention={onCreateMention}
                onChangeMilestone={onChangeMilestone}
              />
            </TodoPreviewTarget>
          )
        })}
      </div>

      <form className="todo-schedule-add" onSubmit={submit}>
        <Plus size={12} />
        <input value={text} placeholder="Add a task" onChange={event => setText(event.target.value)} />
      </form>
    </aside>
  )
}
