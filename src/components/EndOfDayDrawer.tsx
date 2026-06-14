import { useMemo, useState, type DragEvent } from 'react'
import { ArrowBendDownRight, ArrowCounterClockwise, ArrowRight, CheckCircle, DotsSixVertical, MoonStars, Plus, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/types'

function cleanTodoText(text: string) {
  return text.replace(/\[\[mention:(person|company|opportunity):[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

type PlanSource = 'pending' | 'backlog' | 'new'

interface PlanItem {
  id: string
  text: string
  src: PlanSource
}

interface EndOfDayDrawerProps {
  todos: Todo[]
  backlog?: Todo[]
  today: string
  userId: string
  dailyGoal?: string | null
  committed?: boolean
  savedNote?: string | null
  savedPlan?: PlanItem[]
  savedTomorrowObjective?: string | null
  onClose: () => void
  onReopen?: () => void
  onNewDay?: () => void
  onComplete: (result: {
    tomorrowGoal?: string
    plannedItems?: PlanItem[]
    removedTodoIds: string[]
    removedBacklogIds?: string[]
    carriedCount: number
    clearedCount: number
    completedCount: number
    pendingCount: number
    energyLevel: number | null
    goalDone: boolean | null
  }) => void
}

function PlanChip({ item }: { item: PlanItem }) {
  return (
    <button
      className="cd-chip"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('text/plan-src', JSON.stringify(item))
      }}
      title="Drag into tomorrow"
    >
      <DotsSixVertical size={11} />
      <span>{item.text}</span>
      <span className="cd-chip-src">{item.src === 'backlog' ? 'backlog' : 'pending'}</span>
    </button>
  )
}

export default function EndOfDayDrawer({
  todos,
  backlog = [],
  today,
  userId,
  dailyGoal,
  committed = false,
  savedNote,
  savedPlan,
  savedTomorrowObjective,
  onClose,
  onReopen,
  onNewDay,
  onComplete,
}: EndOfDayDrawerProps) {
  const pending = useMemo(() => todos.filter(t => !t.completed), [todos])
  const [plan, setPlan] = useState<PlanItem[]>(savedPlan ?? [])
  const [draft, setDraft] = useState('')
  const [tomorrowObjective, setTomorrowObjective] = useState(savedTomorrowObjective ?? '')
  const [dayNote, setDayNote] = useState(savedNote ?? '')
  const [goalDone, setGoalDone] = useState<boolean | null>(null)
  const [over, setOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const dayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const tomorrow = (() => {
    const [y, m, day] = today.split('-').map(Number)
    const d = new Date(y, m - 1, day + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const sources = useMemo<PlanItem[]>(() => [
    ...pending.map(t => ({ id: t.id, text: cleanTodoText(t.text), src: 'pending' as const })),
    ...backlog.map(t => ({ id: t.id, text: cleanTodoText(t.text), src: 'backlog' as const })),
  ], [backlog, pending])
  const planIds = new Set(plan.map(p => p.id))
  const palette = sources.filter(s => !planIds.has(s.id))

  const addPlan = (item: PlanItem) => {
    setPlan(prev => prev.some(p => p.id === item.id) ? prev : [...prev, item])
  }

  const commitDraft = () => {
    const text = draft.trim()
    if (!text) return
    addPlan({ id: `new-${Date.now()}`, text, src: 'new' })
    setDraft('')
  }

  const onDropPlan = (e: DragEvent<HTMLDivElement>) => {
    setOver(false)
    const raw = e.dataTransfer.getData('text/plan-src')
    if (!raw) return
    try {
      addPlan(JSON.parse(raw) as PlanItem)
    } catch {
      // Ignore malformed drag payloads from outside this flow.
    }
  }

  const handleCloseDay = async () => {
    setSaving(true)
    const carriedPendingIds = plan.filter(p => p.src === 'pending').map(p => p.id)
    const carriedBacklogIds = plan.filter(p => p.src === 'backlog').map(p => p.id)
    const newItems = plan.filter(p => p.src === 'new')
    try {
      if (carriedPendingIds.length > 0) {
        await supabase.from('todos').update({ date: tomorrow }).in('id', carriedPendingIds)
      }
      if (carriedBacklogIds.length > 0) {
        await supabase.from('todos').update({ date: tomorrow, backlog_at: null, return_date: null }).in('id', carriedBacklogIds)
      }
      if (newItems.length > 0) {
        await supabase.from('todos').insert(newItems.map((item, index) => ({
          id: crypto.randomUUID(),
          user_id: userId,
          text: item.text,
          date: tomorrow,
          completed: false,
          waiting: false,
          sort_order: index,
          is_featured: false,
        })))
      }
      if (tomorrowObjective.trim()) {
        await supabase.from('reviews').upsert(
          { user_id: userId, date: tomorrow, one_thing: tomorrowObjective.trim() },
          { onConflict: 'user_id,date' },
        )
      }
      const reviewPayload = {
        user_id: userId,
        date: today,
        tomorrow_reviewed: true,
        day_locked_at: new Date().toISOString(),
        notes: dayNote.trim() || undefined,
        tomorrow_focus: tomorrowObjective.trim() || undefined,
        ...(goalDone !== null ? { one_thing_done: goalDone } : {}),
      }
      const { error } = await supabase.from('reviews').upsert(reviewPayload, { onConflict: 'user_id,date' })
      if (error && goalDone !== null) {
        await supabase.from('reviews').upsert({
          user_id: userId,
          date: today,
          tomorrow_reviewed: true,
          day_locked_at: reviewPayload.day_locked_at,
          notes: dayNote.trim() || undefined,
          tomorrow_focus: tomorrowObjective.trim() || undefined,
        }, { onConflict: 'user_id,date' })
      }
    } catch (err) {
      console.error('End of day save failed:', err)
    } finally {
      setSaving(false)
      onComplete({
        tomorrowGoal: tomorrowObjective.trim() || undefined,
        plannedItems: plan,
        removedTodoIds: carriedPendingIds,
        removedBacklogIds: carriedBacklogIds,
        carriedCount: carriedPendingIds.length + carriedBacklogIds.length + newItems.length,
        clearedCount: 0,
        completedCount: todos.filter(t => t.completed).length,
        pendingCount: pending.length,
        energyLevel: null,
        goalDone,
      })
    }
  }

  return (
    <div className="day-screen close-screen">
      <div className="ds-inner">
        <header className="ds-head">
          <div className="ds-eyebrow">
            <span className="ds-dot" />
            {committed ? 'Day closed' : 'Close the day'} · {dayLabel}
          </div>
          <button className="ds-x" onClick={onClose} title="Back without closing"><X size={15} /></button>
        </header>

        <h1 className="ds-title">{committed ? 'Day closed. Rest well.' : "Let's close the day."}</h1>

        <section className="cd-block">
          <div className="cd-label"><span className="cd-num">01</span> Today's objective</div>
          <p className="cd-objective">{dailyGoal || <em className="cd-muted">You didn't set an objective today.</em>}</p>
          <div className="cd-met">
            <button className={`cd-met-btn yes${goalDone === true ? ' on' : ''}`} onClick={() => setGoalDone(true)}>
              <CheckCircle size={16} /> Nailed it
            </button>
            <button className={`cd-met-btn no${goalDone === false ? ' on' : ''}`} onClick={() => setGoalDone(false)}>
              <ArrowBendDownRight size={16} /> Carry it over
            </button>
          </div>
        </section>

        <section className="cd-block">
          <div className="cd-label"><span className="cd-num">02</span> Note for the day</div>
          <textarea
            className="cd-note"
            rows={3}
            placeholder="What happened today? One line for tomorrow's you..."
            value={dayNote}
            onChange={e => setDayNote(e.target.value)}
            disabled={committed}
          />
        </section>

        <section className="cd-block">
          <div className="cd-label"><span className="cd-num">03</span> Set up tomorrow</div>
          <div
            className={`cd-plan${over ? ' over' : ''}`}
            onDragOver={(e) => {
              if (!committed && e.dataTransfer.types.includes('text/plan-src')) {
                e.preventDefault()
                setOver(true)
              }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDropPlan}
          >
            {plan.length === 0 && <div className="cd-plan-empty">Drag items up from below, or type a task for tomorrow.</div>}
            {plan.map(item => (
              <div className="cd-plan-row" key={item.id}>
                <span className="cd-plan-dot" />
                <span className="cd-plan-text">{item.text}</span>
                {!committed && <button onClick={() => setPlan(prev => prev.filter(p => p.id !== item.id))} title="Remove"><X size={11} /></button>}
              </div>
            ))}
            {!committed && (
              <div className="cd-plan-add">
                <Plus size={12} />
                <input
                  placeholder="Add a task for tomorrow..."
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={e => { if (e.key === 'Enter') commitDraft() }}
                />
              </div>
            )}
          </div>

          {!committed && palette.length > 0 && (
            <div className="cd-palette">
              <span className="cd-palette-lbl">Pending &amp; backlog — drag whatever you want to move:</span>
              <div className="cd-chips">
                {palette.map(item => <PlanChip key={`${item.src}-${item.id}`} item={item} />)}
              </div>
            </div>
          )}
        </section>

        <section className="cd-block">
          <div className="cd-label"><span className="cd-num">04</span> Tomorrow's objective</div>
          <input
            className="cd-next"
            placeholder="What's the one big thing tomorrow?"
            value={tomorrowObjective}
            onChange={e => setTomorrowObjective(e.target.value)}
            disabled={committed}
          />
        </section>

        <footer className="ds-foot">
          {!committed ? (
            <button className="ds-cta" onClick={handleCloseDay} disabled={saving}>
              {saving ? 'Saving...' : 'Close day'} {!saving && <MoonStars size={15} />}
            </button>
          ) : (
            <div className="cd-committed">
              <button className="ds-ghost" onClick={onReopen}><ArrowCounterClockwise size={13} /> Reopen today</button>
              <button className="ds-cta" onClick={onNewDay}>Start a new day <ArrowRight size={14} /></button>
            </div>
          )}
        </footer>
        {committed && <p className="cd-persist">This screen stays until you reopen the day — or midnight rolls into a new one.</p>}
      </div>
    </div>
  )
}
