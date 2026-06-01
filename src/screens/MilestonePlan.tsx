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
        className="group relative w-full flex items-center gap-3 pl-4 pr-3 py-3 bg-white rounded-xl cursor-pointer transition-all hover:-translate-y-px"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: c, opacity: isComplete ? 0.4 : 1 }} />
        <span className="text-[17px] leading-none shrink-0" style={{ filter: isComplete ? 'grayscale(0.6)' : 'none' }}>{emojiOf(m)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[13.5px] font-medium truncate ${isComplete ? 'text-shuttle/50 line-through' : 'text-burnham'}`}>{m.text}</span>
            {isComplete && <Check size={12} weight="bold" className="text-moss shrink-0" />}
          </div>
          <div className="flex items-center gap-2.5 mt-1.5">
            <div className="h-[3px] w-24 rounded-full overflow-hidden" style={{ background: `color-mix(in oklab, ${c} 16%, var(--mercury))` }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: c }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color: `color-mix(in oklab, ${c} 60%, #000)` }}>{cnt.done}/{cnt.total}</span>
            {due && <span className={`text-[10px] font-mono ${due.urgent ? 'font-semibold' : 'text-shuttle/45'}`} style={due.urgent ? { color: c } : undefined}>· {due.label}</span>}
          </div>
        </div>
        <button onClick={e => toggleFocus(m, e)} title={m.focused ? 'In Today' : 'Show in Today'}
          className={`shrink-0 p-1.5 rounded-lg transition-all ${m.focused ? 'text-white' : 'text-shuttle/30 hover:text-shuttle/60 opacity-0 group-hover:opacity-100'}`}
          style={m.focused ? { background: c } : undefined}>
          <Star size={13} weight={m.focused ? 'fill' : 'regular'} />
        </button>
        <button onClick={e => archive(m, e)} title="Archive"
          className="shrink-0 p-1.5 rounded-lg text-shuttle/25 hover:text-burnham hover:bg-mercury/40 opacity-0 group-hover:opacity-100 transition-all">
          <Archive size={13} />
        </button>
        <CaretRight size={13} className="shrink-0 text-shuttle/25 group-hover:text-shuttle/50 transition-colors" />
      </div>
    )
  }

  const pending = milestones.filter(m => m.status !== 'COMPLETE')
  const roadmap = [...pending].sort((a, b) => (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31'))

  return (
    <div className="min-h-screen bg-canvas font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur border-b border-mercury/40 px-8 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-shuttle/40 hover:text-burnham transition-colors p-1 rounded"><ArrowLeft size={16} /></button>
        <h1 className="font-serif text-[22px] text-burnham" style={{ letterSpacing: '-0.022em' }}>Milestones</h1>
        <span className="text-[10px] font-mono text-shuttle/40">{pending.length} active · {focusedCount} in Today</span>
        {/* view toggle */}
        <div className="ml-auto flex items-center gap-0.5 bg-mercury/30 rounded-lg p-0.5">
          <button onClick={() => setView('overview')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${view === 'overview' ? 'bg-white text-burnham shadow-sm' : 'text-shuttle hover:text-burnham'}`}>
            <SquaresFour size={12} /> Overview
          </button>
          <button onClick={() => setView('roadmap')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${view === 'roadmap' ? 'bg-white text-burnham shadow-sm' : 'text-shuttle hover:text-burnham'}`}>
            <ChartLineUp size={12} /> Roadmap
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-10">
        {loading ? (
          <p className="text-[13px] text-shuttle/40">Loading…</p>
        ) : view === 'overview' ? (
          <div className="space-y-9">
            {goals.map(g => {
              const list = pending.filter(m => m.goal_id === g.id)
              const gc = g.color ?? '#3E7A4E'
              return (
                <div key={g.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full" style={{ background: gc }} />
                    <h2 className="text-[13px] font-semibold text-burnham">{g.emoji ? `${g.emoji} ` : ''}{g.alias ?? g.text}</h2>
                    <span className="text-[10px] font-mono text-shuttle/35">{list.length}</span>
                    <div className="flex-1 h-px bg-mercury/40" />
                  </div>
                  <div className="space-y-2">
                    {list.map(m => <Card key={m.id} m={m} />)}
                    {addingForGoal === g.id ? (
                      <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 bg-white rounded-xl" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <Plus size={13} className="text-shuttle/40 shrink-0" />
                        <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
                          onBlur={() => addMilestone(g.id)}
                          onKeyDown={e => { if (e.key === 'Enter') addMilestone(g.id); if (e.key === 'Escape') { setNewText(''); setAddingForGoal(null) } }}
                          placeholder="New milestone…" className="flex-1 text-[13px] text-burnham bg-transparent border-0 outline-none placeholder-shuttle/30" />
                      </div>
                    ) : (
                      <button onClick={() => { setAddingForGoal(g.id); setNewText('') }}
                        className="flex items-center gap-2 pl-4 py-2 text-[12px] text-shuttle/40 hover:text-burnham transition-colors">
                        <Plus size={13} /> Add milestone
                      </button>
                    )}
                  </div>
                </div>
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
