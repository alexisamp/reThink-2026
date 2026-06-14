import { useEffect, useRef, useState } from 'react'
import { Info, Star, SunHorizon, Target } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/types'

interface DayStartDrawerProps {
  today: string
  userId: string
  initialGoal?: string | null
  todos?: Todo[]
  userName?: string | null
  closedYesterday?: boolean
  yesterdayNote?: string | null
  onClose: () => void
  onSave: (goal: string) => void
}

function cleanTodoText(text: string) {
  return text.replace(/\[\[mention:(person|company|opportunity):[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

function todoTag(todo: Todo) {
  if (todo.backlog_at) return { label: 'from backlog', cls: 'backlog' }
  if (todo.return_date === todo.date) return { label: 'due today', cls: 'due' }
  return null
}

export default function DayStartDrawer({
  today,
  userId,
  initialGoal,
  todos = [],
  userName,
  closedYesterday = true,
  yesterdayNote,
  onClose,
  onSave,
}: DayStartDrawerProps) {
  const [goal, setGoal] = useState(initialGoal ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greetingBase = hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening'
  const greeting = `${greetingBase}${userName ? `, ${userName}` : ''}.`
  const activeTodos = todos.filter(t => !t.completed)
  const featured = activeTodos.find(t => t.is_featured)

  useEffect(() => {
    setGoal(initialGoal ?? '')
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [initialGoal])

  const save = async () => {
    const next = goal.trim()
    if (!next) return
    setSaving(true)
    await supabase.from('reviews').upsert(
      { user_id: userId, date: today, one_thing: next },
      { onConflict: 'user_id,date' }
    )
    setSaving(false)
    onSave(next)
  }

  return (
    <div className="day-screen start-screen">
      <div className="ds-inner">
        <header className="ds-head">
          <div className="ds-eyebrow start"><span className="ds-dot" /> {dayLabel}</div>
        </header>

        <h1 className="ds-title">{greeting}</h1>

        <section className="st-objective">
          <div className="st-obj-label"><Target size={12} /> Day objective</div>
          {closedYesterday && goal ? (
            <p className="st-obj-text">{goal}</p>
          ) : (
            <input
              ref={inputRef}
              className="st-obj-input"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
              placeholder="What's the one big thing today?"
            />
          )}
          {!closedYesterday && (
            <span className="st-hint"><Info size={11} /> You didn't close yesterday — set the objective and dive in.</span>
          )}
          {closedYesterday && yesterdayNote && (
            <div className="st-recall"><span><Info size={12} /></span>{yesterdayNote}</div>
          )}
        </section>

        <section className="st-summary">
          <div className="st-sum-hd">
            <span className="st-sum-title">On your list today</span>
            <span className="st-sum-count">{activeTodos.length} {activeTodos.length === 1 ? 'task' : 'tasks'}</span>
          </div>
          {activeTodos.length === 0 ? (
            <div className="st-empty">Clean slate. Start by adding the first thing of the day.</div>
          ) : (
            <ul className="st-list">
              {activeTodos.map(todo => {
                const tag = todoTag(todo)
                return (
                  <li className="st-row" key={todo.id}>
                    <span className={`st-bullet${todo.is_featured ? ' star' : ''}`}>{todo.is_featured ? <Star size={9} weight="fill" /> : null}</span>
                    <span className="st-row-text">{cleanTodoText(todo.text)}</span>
                    {tag && <span className={`st-tag ${tag.cls}`}>{tag.label}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          {featured && (
            <div className="st-onething"><Star size={11} weight="fill" /> Your one thing: <b>{cleanTodoText(featured.text)}</b></div>
          )}
        </section>

        <footer className="ds-foot">
          <button className="ds-cta start" onClick={save} disabled={saving || !goal.trim()}>
            {saving ? 'Saving...' : 'Start the day'}
            {!saving && <SunHorizon size={16} weight="bold" />}
          </button>
        </footer>
      </div>
    </div>
  )
}
