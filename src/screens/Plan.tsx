import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ChartBar, CalendarBlank, Target, Lightning,
  CheckCircle, Circle, DotOutline, ArrowRight,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Opportunity } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getWeekStartFor(weeksAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - weeksAgo * 7)
  return getWeekStart(d)
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'text-shuttle bg-mercury',
  ON_TRACK: 'text-burnham bg-gossip',
  AT_RISK: 'text-shuttle bg-mercury',
  BLOCKED: 'text-red-700 bg-red-100',
  COMPLETE: 'text-burnham bg-gossip',
}

// ── mini bar chart ─────────────────────────────────────────────────────────────

function MiniBarChart({
  data, color = 'var(--attio-cobalt, #266DF0)', maxVal,
}: {
  data: Array<{ label: string; value: number }>
  color?: string
  maxVal?: number
}) {
  const max = maxVal ?? Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map(d => (
        <div key={d.label} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${Math.max(2, (d.value / max) * 52)}px`,
              backgroundColor: color,
              opacity: d.value === 0 ? 0.2 : 1,
            }}
          />
          <span className="text-[10px] text-shuttle">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: Goal }) {
  return (
    <div className="p-4 bg-white border border-mercury rounded-lg">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {goal.emoji && <span className="text-base">{goal.emoji}</span>}
          <h3 className="text-sm font-semibold text-midnight line-clamp-2">{goal.text}</h3>
        </div>
        <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[goal.status]}`}>
          {goal.status.replace(/_/g, ' ')}
        </span>
      </div>
      {goal.metric && (
        <p className="text-xs text-shuttle mb-2">{goal.metric}</p>
      )}
      {goal.next_30_days && (
        <p className="text-xs text-burnham mt-2 border-t border-mercury pt-2">
          <span className="text-shuttle">Next 30d: </span>{goal.next_30_days}
        </p>
      )}
    </div>
  )
}

// ── opportunity card ──────────────────────────────────────────────────────────

function OppPipelineCard({ opp }: { opp: Opportunity }) {
  const stageColor = {
    exploring: 'text-shuttle', active: 'text-burnham',
    negotiating: 'text-shuttle', won: 'text-burnham', lost: 'text-red-400',
  }[opp.stage] ?? 'text-shuttle'

  return (
    <Link
      to={`/people/opportunities/${opp.id}`}
      className="flex items-center gap-3 p-3 bg-white border border-mercury rounded-lg hover:border-burnham transition-colors"
    >
      <DotOutline size={16} weight="fill" className={stageColor} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-midnight truncate">{opp.title}</p>
        <p className="text-xs text-shuttle">{opp.company?.name ?? 'No company'}</p>
      </div>
      <span className="text-xs text-shuttle capitalize">{opp.stage}</span>
    </Link>
  )
}

// ── main screen ───────────────────────────────────────────────────────────────

type ViewMode = 'weekly' | 'monthly'

export default function Plan() {
  const { user } = useAuth()
  const [view, setView] = useState<ViewMode>('weekly')
  const [loading, setLoading] = useState(true)

  // Data
  const [goals, setGoals] = useState<Goal[]>([])
  const [convData, setConvData] = useState<Array<{ label: string; value: number }>>([])
  const [englishData, setEnglishData] = useState<Array<{ label: string; value: number }>>([])
  const [todosDone, setTodosDone] = useState(0)
  const [todosTotal, setTodosTotal] = useState(0)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [thisWeekConvs, setThisWeekConvs] = useState(0)
  const [thisWeekEnglish, setThisWeekEnglish] = useState(0)

  // Monthly
  const [monthlyReflection, setMonthlyReflection] = useState('')
  const [reflectionSaving, setReflectionSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const thisWeek = getWeekStart()
    const today = new Date().toISOString().split('T')[0]
    const thisMonth = today.slice(0, 7)

    // Build 8 weeks of data
    const weeks = Array.from({ length: 8 }, (_, i) => getWeekStartFor(7 - i))

    const [
      { data: goalsData },
      { data: interactions },
      { data: englishSessions },
      { data: todosData },
      { data: oppsData },
    ] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id).eq('goal_type', 'ACTIVE').order('position'),
      supabase.from('interactions')
        .select('interaction_date, contact_id')
        .eq('user_id', user.id)
        .gte('interaction_date', weeks[0]),
      supabase.from('english_sessions')
        .select('date, minutes')
        .eq('user_id', user.id)
        .gte('date', weeks[0]),
      supabase.from('todos')
        .select('id, completed, date')
        .eq('user_id', user.id)
        .gte('date', thisWeek),
      supabase.from('opportunities')
        .select('*, company:companies(*)')
        .eq('user_id', user.id)
        .in('stage', ['exploring', 'active', 'negotiating'])
        .order('created_at', { ascending: false }),
    ])

    setGoals(goalsData ?? [])
    setOpportunities(oppsData ?? [])

    // Todos this week
    const weekTodos = (todosData ?? []).filter(t => t.date >= thisWeek)
    setTodosTotal(weekTodos.length)
    setTodosDone(weekTodos.filter(t => t.completed).length)

    // Build 8-week conversation chart
    const convByWeek = new Map<string, Set<string>>()
    for (const i of (interactions ?? [])) {
      const d = new Date(i.interaction_date)
      const ws = getWeekStart(d)
      if (!convByWeek.has(ws)) convByWeek.set(ws, new Set())
      convByWeek.get(ws)!.add(i.contact_id)
    }
    const convChart = weeks.map(ws => ({
      label: formatWeekLabel(ws),
      value: convByWeek.get(ws)?.size ?? 0,
    }))
    setConvData(convChart)
    setThisWeekConvs(convByWeek.get(thisWeek)?.size ?? 0)

    // Build 8-week English chart (hours)
    const engByWeek = new Map<string, number>()
    for (const s of (englishSessions ?? [])) {
      const d = new Date(s.date)
      const ws = getWeekStart(d)
      engByWeek.set(ws, (engByWeek.get(ws) ?? 0) + s.minutes)
    }
    const engChart = weeks.map(ws => ({
      label: formatWeekLabel(ws),
      value: Math.round((engByWeek.get(ws) ?? 0) / 60 * 10) / 10, // hours
    }))
    setEnglishData(engChart)
    setThisWeekEnglish(engByWeek.get(thisWeek) ?? 0)

    // Monthly reflection — load from reviews table
    const { data: review } = await supabase
      .from('reviews')
      .select('notes')
      .eq('user_id', user.id)
      .gte('date', `${thisMonth}-01`)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    setMonthlyReflection(review?.notes ?? '')

    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const saveReflection = async () => {
    if (!user) return
    setReflectionSaving(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('reviews').upsert({
      user_id: user.id,
      date: today,
      notes: monthlyReflection.trim() || null,
    }, { onConflict: 'user_id,date' })
    setReflectionSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-full text-shuttle text-sm">Loading...</div>

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-mercury">
        <div className="flex items-center gap-2">
          <ChartBar size={20} className="text-shuttle" />
          <h1 className="text-lg font-semibold text-midnight">Plan</h1>
        </div>
        <div className="flex border border-mercury rounded-lg overflow-hidden">
          <button
            onClick={() => setView('weekly')}
            className={`px-3 py-1.5 text-sm transition-colors ${view === 'weekly' ? 'bg-burnham text-gossip' : 'text-shuttle hover:bg-mercury'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setView('monthly')}
            className={`px-3 py-1.5 text-sm transition-colors ${view === 'monthly' ? 'bg-burnham text-gossip' : 'text-shuttle hover:bg-mercury'}`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {view === 'weekly' ? (
          <div className="max-w-4xl mx-auto">

            {/* 3 Goals */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Active Goals</h2>
              {goals.length === 0 ? (
                <p className="text-sm text-shuttle/60">No active goals.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {goals.slice(0, 3).map(g => <GoalCard key={g.id} goal={g} />)}
                </div>
              )}
            </section>

            {/* KPI Trends */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">8-Week KPI Trends</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white border border-mercury rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-midnight">Conversations</p>
                    <div className="text-right">
                      <span className="text-lg font-semibold text-midnight">{thisWeekConvs}</span>
                      <span className="text-xs text-shuttle"> / 6 this week</span>
                    </div>
                  </div>
                  <MiniBarChart data={convData} color="var(--attio-cobalt, #266DF0)" maxVal={6} />
                </div>
                <div className="p-4 bg-white border border-mercury rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-midnight">English Hours</p>
                    <div className="text-right">
                      <span className="text-lg font-semibold text-midnight">{Math.round(thisWeekEnglish / 60 * 10) / 10}h</span>
                      <span className="text-xs text-shuttle"> / 5h this week</span>
                    </div>
                  </div>
                  <MiniBarChart data={englishData} color="var(--attio-slate-600, #6F7988)" maxVal={5} />
                </div>
              </div>
            </section>

            {/* This week progress */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">This Week</h2>
              <div className="p-4 bg-white border border-mercury rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {todosDone === todosTotal && todosTotal > 0 ? (
                      <CheckCircle size={20} weight="fill" className="text-burnham" />
                    ) : (
                      <Circle size={20} className="text-mercury" />
                    )}
                    <span className="text-sm text-midnight font-medium">{todosDone} / {todosTotal} tasks done</span>
                  </div>
                  {todosTotal > 0 && (
                    <div className="flex-1 bg-mercury rounded-sm h-1.5 overflow-hidden">
                      <div
                        className="bg-burnham h-1.5 rounded-sm transition-all"
                        style={{ width: `${Math.round((todosDone / todosTotal) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Opportunities Pipeline */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle">Active Pipeline</h2>
                <Link to="/people/opportunities" className="inline-flex items-center gap-1 text-xs text-burnham hover:underline">View all <ArrowRight size={11} /></Link>
              </div>
              {opportunities.length === 0 ? (
                <p className="text-sm text-shuttle/60">No active opportunities.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {opportunities.map(o => <OppPipelineCard key={o.id} opp={o} />)}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* Monthly view */
          <div className="max-w-2xl mx-auto">
            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Monthly KPIs</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white border border-mercury rounded-lg">
                  <p className="text-xs text-shuttle mb-1">Conversations (this month)</p>
                  <p className="text-2xl font-semibold text-midnight">
                    {convData.slice(-4).reduce((sum, d) => sum + d.value, 0)}
                  </p>
                  <p className="text-xs text-shuttle mt-1">target: 24/month</p>
                </div>
                <div className="p-4 bg-white border border-mercury rounded-lg">
                  <p className="text-xs text-shuttle mb-1">English Hours (this month)</p>
                  <p className="text-2xl font-semibold text-midnight">
                    {Math.round(englishData.slice(-4).reduce((sum, d) => sum + d.value, 0) * 10) / 10}h
                  </p>
                  <p className="text-xs text-shuttle mt-1">target: 20h/month</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-shuttle mb-3">Monthly Reflection</h2>
              <div className="flex flex-col gap-3 p-4 bg-white border border-mercury rounded-lg">
                <p className="text-xs text-shuttle">What went well? What needs to change? What's the focus for next month?</p>
                <textarea
                  value={monthlyReflection}
                  onChange={e => setMonthlyReflection(e.target.value)}
                  rows={8}
                  placeholder="Write your monthly reflection..."
                  className="w-full text-sm border border-mercury rounded px-3 py-2 resize-none focus:outline-none focus:border-burnham"
                />
                <button
                  onClick={saveReflection}
                  disabled={reflectionSaving}
                  className="self-start flex items-center gap-1 text-xs px-3 py-1.5 bg-burnham text-gossip rounded-lg disabled:opacity-50"
                >
                  <Lightning size={12} /> {reflectionSaving ? 'Saving...' : 'Save Reflection'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
