import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import MentionEditor, { FileChip, MentionChip as RichMentionChip } from './MentionEditor'
import type { Mention, TodoMilestoneOption } from './types'
import {
  editorToContentSegments,
  linksFromMentions,
  normalizeEditorSegments,
  plainTextFromEditorSegments,
  segmentsForTodo,
  type EditorSegment,
  type TodoLinks,
} from '@/lib/todoContent'
import { pathForMention } from '@/lib/crmObjects'
import { openTodoFile } from '@/lib/filePills'

function stripTrailingMilestoneCommand(segments: EditorSegment[]) {
  const next = segments.map(segment => segment.type === 'text' ? { ...segment } : segment)
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const segment = next[i]
    if (segment.type !== 'text') break
    const stripped = segment.text.replace(/(^|\s)\/[^\s@/]*\s*$/, '$1')
    if (stripped !== segment.text) {
      segment.text = stripped
      break
    }
    if (segment.text.trim()) break
  }
  return normalizeEditorSegments(next)
}

export default function EditableTodoText({
  todo,
  mentions,
  mentionOptions,
  milestoneOptions,
  className,
  autoFocus,
  onEditText,
  onCreateMention,
  onChangeMilestone,
  onEditingChange,
}: {
  todo: Todo
  mentions: Mention[]
  mentionOptions: Mention[]
  milestoneOptions: TodoMilestoneOption[]
  className?: string
  autoFocus?: boolean
  onEditText: (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => void
  onCreateMention: (kind: TodoMentionKind, name: string, companyId?: string | null) => Promise<Mention | null>
  onChangeMilestone: (id: string, milestoneId: string | null) => void
  onEditingChange?: (editing: boolean) => void
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(Boolean(autoFocus))

  const goToMention = (mention: Mention) => {
    if (mention.id) navigate(pathForMention(mention))
  }

  const startEditing = () => {
    if (todo.completed) return
    setEditing(true)
    onEditingChange?.(true)
  }

  const stopEditing = () => {
    setEditing(false)
    onEditingChange?.(false)
  }

  const commit = (nextSegments: EditorSegment[]) => {
    const cleanSegments = stripTrailingMilestoneCommand(nextSegments)
    const linked = cleanSegments.filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention').map(s => s.mention)
    const text = plainTextFromEditorSegments(cleanSegments)
    const contentSegments = editorToContentSegments(cleanSegments)
    if (text || linked.length > 0 || contentSegments.some(segment => segment.type !== 'text')) {
      onEditText(todo.id, text, contentSegments, linksFromMentions(linked))
    }
    stopEditing()
  }

  if (editing) {
    return (
      <div className={className} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <MentionEditor
          autoFocus
          initialSegments={segmentsForTodo(todo, mentions, mentionOptions)}
          mentionOptions={mentionOptions}
          milestoneOptions={milestoneOptions}
          currentMilestoneId={todo.milestone_id}
          placeholder="Type @ to link CRM"
          onCommit={commit}
          onCancel={stopEditing}
          onOpenMention={goToMention}
          onCreateMention={onCreateMention}
          onSelectMilestone={(milestoneId) => onChangeMilestone(todo.id, milestoneId)}
        />
      </div>
    )
  }

  const renderedSegments = segmentsForTodo(todo, mentions, mentionOptions)

  return (
    <span className={`${className ?? ''} editable-todo-text`} onClick={startEditing}>
      <span className="editable-todo-inline">
        {renderedSegments.map((segment, index) => (
          segment.type === 'text'
            ? <span className="editable-todo-body" key={`t-${index}`}>{segment.text}</span>
            : segment.type === 'mention'
              ? <RichMentionChip key={`m-${index}-${segment.mention.kind}-${segment.mention.id}`} mention={segment.mention} onClick={() => goToMention(segment.mention)} />
              : <FileChip key={`f-${index}-${segment.file.id}`} file={segment.file} onClick={() => { void openTodoFile(segment.file) }} />
        ))}
      </span>
    </span>
  )
}
