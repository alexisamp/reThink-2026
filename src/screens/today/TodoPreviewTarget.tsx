import { createElement, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Archive, CalendarBlank, CheckCircle, Circle, Clock, LinkSimple } from '@phosphor-icons/react'
import type { Todo } from '@/types'
import { pathForMention } from '@/lib/crmObjects'
import { openTodoFile } from '@/lib/filePills'
import { segmentsForTodo } from '@/lib/todoContent'
import { FileChip, MentionChip } from './MentionEditor'
import type { Mention } from './types'

type PreviewAs = 'article' | 'div'

interface TodoPreviewTargetProps extends Omit<HTMLAttributes<HTMLElement>, 'as'> {
  as?: PreviewAs
  todo: Todo
  mentions: Mention[]
  mentionOptions: Mention[]
  scheduleLabel?: string
  children: ReactNode
  style?: CSSProperties
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function TodoPreviewTarget({
  as = 'div',
  todo,
  mentions,
  mentionOptions,
  scheduleLabel,
  children,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  ...props
}: TodoPreviewTargetProps) {
  const navigate = useNavigate()
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const timerRef = useRef<number | null>(null)
  const segments = segmentsForTodo(todo, mentions, mentionOptions)
  const hasRichContext = segments.some(segment => segment.type !== 'text') || Boolean(todo.url)

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const showAt = (clientX: number, clientY: number) => {
    const width = 380
    const height = 240
    setPoint({
      x: clamp(clientX + 18, 16, window.innerWidth - width - 16),
      y: clamp(clientY + 18, 16, window.innerHeight - height - 16),
    })
  }

  const handleMouseEnter = (event: ReactMouseEvent<HTMLElement>) => {
    onMouseEnter?.(event)
    clearTimer()
    const { clientX, clientY } = event
    timerRef.current = window.setTimeout(() => showAt(clientX, clientY), 260)
  }

  const handleMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    onMouseMove?.(event)
    if (point) showAt(event.clientX, event.clientY)
  }

  const handleMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    onMouseLeave?.(event)
    clearTimer()
    setPoint(null)
  }

  const preview = point ? createPortal(
    <aside className="todo-hover-card" style={{ left: point.x, top: point.y }} role="tooltip">
      <header className="todo-hover-hd">
        <span className={`todo-hover-status${todo.completed ? ' done' : ''}`}>
          {todo.completed ? <CheckCircle size={12} weight="fill" /> : <Circle size={12} />}
          {todo.completed ? 'Done' : 'Active'}
        </span>
        {scheduleLabel ? (
          <span className="todo-hover-meta"><Clock size={11} />{scheduleLabel}</span>
        ) : (
          <span className="todo-hover-meta"><CalendarBlank size={11} />Unscheduled</span>
        )}
      </header>
      <div className="todo-hover-body">
        {segments.map((segment, index) => (
          segment.type === 'text'
            ? <span className="todo-hover-text" key={`t-${index}`}>{segment.text}</span>
            : segment.type === 'mention'
              ? <MentionChip key={`m-${index}-${segment.mention.kind}-${segment.mention.id}`} mention={segment.mention} onClick={() => navigate(pathForMention(segment.mention))} />
              : <FileChip key={`f-${index}-${segment.file.id}`} file={segment.file} onClick={() => { void openTodoFile(segment.file) }} />
        ))}
      </div>
      <footer className="todo-hover-foot">
        {hasRichContext ? (
          <span><LinkSimple size={11} /> Linked context available</span>
        ) : (
          <span><Archive size={11} /> No linked context yet</span>
        )}
      </footer>
    </aside>,
    document.body,
  ) : null

  return (
    <>
      {createElement(as, {
        ...props,
        onMouseEnter: handleMouseEnter,
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
      }, children)}
      {preview}
    </>
  )
}
