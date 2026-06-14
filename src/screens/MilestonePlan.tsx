/**
 * /milestone-plan — "Manage milestones".
 * Overview (grouped by goal) + Roadmap (timeline by target date) of every milestone.
 * Curate which surface in Today (focus star), edit via the drawer, create, complete,
 * archive. Single source of truth: todos.milestone_id (no more milestone_todos split).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Star, Plus, Archive, CaretRight, SquaresFour, ChartLineUp, Check,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import MilestonePanel from '@/components/MilestonePanel'
import type { Milestone, Goal, Todo } from '@/types'

type GoalLite = Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>
const FALLBACK = ['#3E7A4E', '#536471', '#7A3E68', '#3E5F7A', '#9A6B4F']

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDue(target: string | null): { label: string; urgent: boolean } | null {
  if (!target) return null
  const t = new Date(localDate() + 'T12:00:00'), d = new Date(target + 'T12:00:00')
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days < 0) return { label: `${-days}d overdue`, urgent: true }
  if (days === 0) return { label: 'due today', urgent: true }
  if (days <= 14) return { label: `${days}d left`, urgent: days <= 7 }
  return { label: new Date(target + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false }
}

export default function MilestonePlan() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const today = localDate()
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [goals, setGoals] = useState<GoalLite[]>([])
  const [counts, setCounts] = useState<Map<string, { done: number; total: number }>>(new Map())
  const [view, setView] = useState<'overview' | 'roadmap'>('overview')
  const [loading, setLoading] = useState(true)
  const [expandedMs, setExpandedMs] = useState<string | null>(null)
  const [addingForGoal, setAddingForGoal] = useState<string | null>(null)
  const [newText, setNewText] = useState('')

  const goalsMap = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals])

  const loadCounts = useCallback(async (uid: string) => {
    const { data } = await supabase.from('todos').select('milestone_id, completed').eq('user_id', uid).not('milestone_id', 'is', null)
    const m = new Map<string, { done: number; total: number }>()
    ;(data ?? []).forEach((t: { milestone_id: string | null; completed: boolean }) => {
      if (!t.milestone_id) return
      const cur = m.get(t.milestone_id) ?? { done: 0, total: 0 }
      cur.total++; if (t.completed) cur.done++
      m.set(t.milestone_id, cur)
    })
    setCounts(m)
  }, [])

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const [msRes, goalsRes] = await Promise.all([
      supabase.from('milestones').select('*').eq('user_id', user.id).neq('status', 'ARCHIVED').order('position', { nullsFirst: false }).order('target_date', { nullsFirst: false }),
      supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE').order('position'),
    ])
    setMilestones((msRes.data ?? []) as Milestone[])
    setGoals((goalsRes.data ?? []) as GoalLite[])
    await loadCounts(user.id)
    setLoading(false)
  }, [user?.id, loadCounts])

  useEffect(() => { load() }, [load])

  const colorOf = (m: Milestone) => {
    if (m.color) return m.color
    const g = goalsMap.get(m.goal_id)
    if (g?.color) return g.color
    const idx = [...m.goal_id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % FALLBACK.length
    return FALLBACK[idx]
  }
  const emojiOf = (m: Milestone) => m.emoji ?? goalsMap.get(m.goal_id)?.emoji ?? '🎯'

  const toggleFocus = async (m: Milestone, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !m.focused
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, focused: next } : x))
    await supabase.from('milestones').update({ focused: next }).eq('id', m.id)
  }
  const archive = async (m: Milestone, e: React.MouseEvent) => {
    e.stopPropagation()
    setMilestones(prev => prev.filter(x => x.id !== m.id))
    await supabase.from('milestones').update({ status: 'ARCHIVED' }).eq('id', m.id)
  }
  const addMilestone = async (goalId: string) => {
    if (!newText.trim() || !user?.id) { setAddingForGoal(null); setNewText(''); return }
    const { data } = await supabase.from('milestones').insert({
      text: newText.trim(), goal_id: goalId, user_id: user.id, status: 'PENDING',
    }).select().single()
    if (data) setMilestones(prev => [...prev, data as Milestone])
    setNewText(''); setAddingForGoal(null)
  }

  const focusedCount = milestones.filter(m => m.focused && m.status !== 'COMPLETE').length
  const expanded = milestones.find(m => m.id === expandedMs) ?? null
  const expandedGoal = expanded ? goalsMap.get(expanded.goal_id) ?? null : null

  // ── milestone card ──────────────────────────────────────────────
  const Card = ({ m }: { m: Milestone }) => {
    const cnt = counts.get(m.id) ?? { done: 0, total: 0 }
    const pct = cnt.total > 0 ? (cnt.done / cnt.total) * 100 : 0
    const due = fmtDue(m.target_date)
    const c = colorOf(m)
    const isComplete = m.status === 'COMPLETE'
    return (
      <div
        onClick={() => setExpandedMs(m.id)}
        className={`msc-card group${isComplete ? ' done' : ''}`}
        style={{ '--c': c } as React.CSSProperties}
      >
        <div className="msc-card-top">
          <span className="msc-emoji" style={{ filter: isComplete ? 'grayscale(0.6)' : 'none' }}>{emojiOf(m)}</span>
          <span className="msc-name">{m.text}</span>
          {due && <span className={`msc-due${due.urgent ? ' urgent' : ''}`}>{due.label}</span>}
        </div>
        <div className="msc-prog">
          <div className="msc-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="msc-frac">{cnt.done}<span className="msc-frac-d">/{cnt.total}</span></span>
          {isComplete && <Check size={12} weight="bold" className="text-moss shrink-0" />}
        </div>
        <div className="msc-link">
          <button onClick={e => toggleFocus(m, e)} title={m.focused ? 'In Today' : 'Show in Today'} className="msc-chip">
            <Star size={11} weight={m.focused ? 'fill' : 'regular'} /> {m.focused ? 'Today' : 'Focus'}
          </button>
          <button onClick={e => archive(m, e)} title="Archive" className="msc-chip">
            <Archive size={11} /> Archive
          </button>
          <span className="ml-auto text-shuttle/40"><CaretRight size={13} /></span>
        </div>
      </div>
    )
  }

  const pending = milestones.filter(m => m.status !== 'COMPLETE')
  const roadmap = [...pending].sort((a, b) => (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31'))

  return (
    <div className="page msc-page">
      {/* Header */}
      <header className="msc-hd">
        <div className="msc-hd-l">
          <button onClick={() => navigate(-1)} className="crm-tool ghost mb-3"><ArrowLeft size={13} /><span>Back</span></button>
          <h1 className="msc-title">Milestones</h1>
          <p className="msc-sub">Goals hold milestones. Milestones hold the tasks — and the people, accounts and next step that actually move them.</p>
        </div>
        <div className="msc-hd-stat">
          <span className="msc-hd-num">{focusedCount}<span className="msc-hd-den">/{pending.length}</span></span>
          <span className="msc-hd-lbl">in Today</span>
        </div>
        {/* view toggle */}
        <div className="ppl-tabs">
          <button onClick={() => setView('overview')} className={`ppl-tab ${view === 'overview' ? 'active' : ''}`}>
            <SquaresFour size={12} /> <span>Overview</span>
          </button>
          <button onClick={() => setView('roadmap')} className={`ppl-tab ${view === 'roadmap' ? 'active' : ''}`}>
            <ChartLineUp size={12} /> <span>Roadmap</span>
          </button>
        </div>
      </header>

      <div className="goal-list">
        {loading ? (
          <p className="text-[13px] text-shuttle/40">Loading…</p>
        ) : view === 'overview' ? (
          <div className="space-y-9">
            {goals.map(g => {
              const list = pending.filter(m => m.goal_id === g.id)
              const gc = g.color ?? '#3E7A4E'
              return (
                <section key={g.id} className="goal-sec" style={{ '--c': gc } as React.CSSProperties}>
                  <header className="goal-hd">
                    <span className="goal-emoji">{g.emoji ?? '🎯'}</span>
                    <div className="goal-hd-txt">
                      <div className="goal-hd-top">
                        <h2 className="goal-name">{g.alias ?? g.text}</h2>
                        <span className="goal-area">{list.length} milestones</span>
                      </div>
                      <p className="goal-north">{g.text}</p>
                    </div>
                    <div className="goal-stat">
                      <div className="goal-stat-line"><span className="goal-stat-num">{list.filter(m => m.status === 'COMPLETE').length}<span className="goal-stat-den">/{list.length}</span></span><span className="goal-stat-lbl">done</span></div>
                      <div className="goal-stat-bar"><span style={{ width: `${list.length ? (list.filter(m => m.status === 'COMPLETE').length / list.length) * 100 : 0}%` }} /></div>
                    </div>
                  </header>
                  <div className="goal-grid">
                    {list.map(m => <Card key={m.id} m={m} />)}
                    {addingForGoal === g.id ? (
                      <div className="msc-card add active">
                        <div className="msc-addrow">
                          <Plus size={13} />
                          <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
                            onBlur={() => addMilestone(g.id)}
                            onKeyDown={e => { if (e.key === 'Enter') addMilestone(g.id); if (e.key === 'Escape') { setNewText(''); setAddingForGoal(null) } }}
                            placeholder="New milestone..." />
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingForGoal(g.id); setNewText('') }} className="msc-card add">
                        <span className="msc-addlbl"><Plus size={13} /> Add milestone</span>
                      </button>
                    )}
                  </div>
                </section>
              )
            })}
            {goals.length === 0 && <p className="text-[13px] text-shuttle/40">No active goals. Create goals first to plan milestones.</p>}
          </div>
        ) : (
          /* Roadmap */
          <div className="relative pl-5">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-mercury/50" />
            {roadmap.length === 0 && <p className="text-[13px] text-shuttle/40">No active milestones.</p>}
            <div className="space-y-2.5">
              {roadmap.map(m => {
                const due = fmtDue(m.target_date)
                const c = colorOf(m)
                return (
                  <div key={m.id} className="relative">
                    <span className="absolute -left-[18px] top-[18px] w-2.5 h-2.5 rounded-full border-2 border-canvas" style={{ background: c }} />
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-mono w-20 shrink-0" style={{ color: due?.urgent ? c : 'var(--shuttle)' }}>
                        {m.target_date ? new Date(m.target_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'no date'}
                      </span>
                      <Card m={m} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {user && expanded && (
        <MilestonePanel
          milestone={expanded}
          goal={expandedGoal}
          userId={user.id}
          today={today}
          onClose={() => setExpandedMs(null)}
          onMilestoneUpdate={(m) => setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))}
          onMilestoneDelete={(id) => { setMilestones(prev => prev.filter(x => x.id !== id)); setExpandedMs(null) }}
          onTodoCreate={() => user && loadCounts(user.id)}
          onTodoUpdate={() => user && loadCounts(user.id)}
          onTodoDelete={() => user && loadCounts(user.id)}
        />
      )}
    </div>
  )
}
