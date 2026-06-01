// Today — daily cockpit, rebuilt to the reThink design bundle.
// Main column = todos (the hero). Right rail = Milestones / This Week / Next Steps /
// Journal (collapsible + drag-to-reorder, persisted). Wired to live Supabase data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, ChartLineUp, UsersThree, PencilSimple, Timer, Play, Pause, X, Check, Moon } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo, Milestone, Goal, Review, TodoContentSegment, TodoMentionKind } from '@/types'
import MilestonePanel from '@/components/MilestonePanel'
import DayStartDrawer from '@/components/DayStartDrawer'
import EndOfDayDrawer from '@/components/EndOfDayDrawer'
import TodoList from './today/TodoList'
import RightRail, { type RailSectionDef } from './today/RightRail'
import MilestoneRows, { type MilestoneRowData } from './today/MilestoneRows'
import ThisWeek from './today/ThisWeek'
import NextSteps from './today/NextSteps'
import FocusTimer from './today/FocusTimer'
import { useFocusTimer } from './today/useFocusTimer'
import type { GroupBy, Mention, TodoMilestoneOption } from './today/types'
import { companyImage, createCrmObject, firstRelation, mentionFromCompany, mentionFromContact, mentionFromOpportunity } from '@/lib/crmObjects'

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type GoalLite = Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>
interface MsTodo { id: string; milestone_id: string | null; completed: boolean }
interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}
interface RelationCompany {
  id: string
  name?: string | null
  logo_url?: string | null
  domain?: string | null
}
interface OpportunityMentionRow {
  id: string
  title: string | null
  stage?: string | null
  type?: string | null
  company_id?: string | null
  company?: RelationCompany | RelationCompany[] | null
}
type TodayReviewRow = Pick<Review, 'notes' | 'one_thing' | 'energy_level' | 'tomorrow_reviewed'>

const GROUP_KEY = 'rethink.today.groupBy'
const FALLBACK_COLORS = ['#3E7A4E', '#536471', '#7A3E68', '#3E5F7A', '#9A6B4F']

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDue(target: string | null, today: string): { label: string | null; urgent: boolean } {
  if (!target) return { label: null, urgent: false }
  const t = new Date(today + 'T12:00:00')
  const d = new Date(target + 'T12:00:00')
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days < 0) return { label: `${-days}d ago`, urgent: true }
  if (days === 0) return { label: 'today', urgent: true }
  return { label: `${days}d`, urgent: days <= 7 }
}

export default function Today() {
  const navigate = useNavigate()
  const today = localDate()
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const weekDates = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday); x.setDate(monday.getDate() + i)
      return localDate(x)
    })
  }, [])

  const [userId, setUserId] = useState<string | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [msTodos, setMsTodos] = useState<MsTodo[]>([])      // all milestone-linked todos (for progress)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [goalsMap, setGoalsMap] = useState<Map<string, GoalLite>>(new Map())
  const [goals, setGoals] = useState<GoalLite[]>([])
  const [mentions, setMentions] = useState<Map<string, Mention>>(new Map())  // key: `${kind}:${id}`
  const [mentionOptions, setMentionOptions] = useState<Mention[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>(() => (localStorage.getItem(GROUP_KEY) as GroupBy) || 'priority')
  const [expandedMs, setExpandedMs] = useState<string | null>(null)
  const [journal, setJournal] = useState('')
  const [dailyGoal, setDailyGoal] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const focus = useFocusTimer(userId)
  const [twRefresh, setTwRefresh] = useState(0)
  const journalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const journalInit = useRef(false)

  // ── load mentions for a set of todos ───────────────────────────
  const loadMentions = useCallback(async (uid: string, list: Todo[]) => {
    const contactIds = [...new Set(list.map(t => t.contact_id).filter(Boolean))] as string[]
    const companyIds = [...new Set(list.map(t => t.company_id).filter(Boolean))] as string[]
    const oppIds = [...new Set(list.map(t => t.opportunity_id).filter(Boolean))] as string[]
    const map = new Map<string, Mention>()
    await Promise.all([
      contactIds.length
        ? supabase.from('outreach_logs').select('id, name, profile_photo_url').in('id', contactIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`person:${c.id}`, { id: c.id, name: c.name, kind: 'person', imageUrl: c.profile_photo_url })))
        : null,
      companyIds.length
        ? supabase.from('companies').select('id, name, logo_url, domain').in('id', companyIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`company:${c.id}`, { id: c.id, name: c.name, kind: 'company', imageUrl: companyImage(c.logo_url, c.domain) })))
        : null,
      oppIds.length
        ? supabase.from('opportunities').select('id, title, company_id, company:companies(id, name, logo_url, domain)').in('id', oppIds).eq('user_id', uid)
            .then(({ data }) => ((data ?? []) as OpportunityMentionRow[]).forEach(o => {
              const company = firstRelation(o.company)
              map.set(`opportunity:${o.id}`, {
                id: o.id,
                name: o.title ?? 'Opportunity',
                kind: 'opportunity',
                sub: company?.name ?? null,
                imageUrl: companyImage(company?.logo_url, company?.domain),
                companyId: o.company_id ?? company?.id ?? null,
              })
            }))
        : null,
    ])
    setMentions(map)
  }, [])

  // ── initial load ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setUserId(user.id)

      const [todosRes, overdueTodosRes, msTodosRes, msRes, goalsRes, reviewRes, contactsRes, companiesRes, oppsRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id).eq('date', today).order('sort_order').order('created_at'),
        supabase.from('todos').select('*').eq('user_id', user.id).lt('date', today).eq('completed', false).order('date').order('sort_order').order('created_at'),
        supabase.from('todos').select('id, milestone_id, completed').eq('user_id', user.id).not('milestone_id', 'is', null),
        supabase.from('milestones').select('*').eq('user_id', user.id).neq('status', 'COMPLETE').order('target_date', { nullsFirst: false }),
        supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE').order('position'),
        supabase.from('reviews').select('notes, one_thing, energy_level, tomorrow_reviewed').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('outreach_logs').select('id, name, profile_photo_url, company, job_title, email').eq('user_id', user.id).order('name'),
        supabase.from('companies').select('id, name, logo_url, domain, sector, headline').eq('user_id', user.id).order('name'),
        supabase.from('opportunities').select('id, title, stage, type, company_id, company:companies(id, name, logo_url, domain)').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      if (cancelled) return

      const overdueTodos = ((overdueTodosRes.data ?? []) as Todo[]).map(t => ({ ...t, date: today }))
      if (overdueTodos.length > 0) {
        supabase.from('todos').update({ date: today }).in('id', overdueTodos.map(t => t.id)).then(() => {})
      }
      const byTodo = new Map<string, Todo>()
      ;[...overdueTodos, ...((todosRes.data ?? []) as Todo[])].forEach(t => byTodo.set(t.id, t))
      const todoList = [...byTodo.values()]
      const peopleOptions: Mention[] = (contactsRes.data ?? []).map(c => mentionFromContact(c))
      const companyOptions: Mention[] = (companiesRes.data ?? []).map(c => mentionFromCompany(c))
      const oppOptions: Mention[] = ((oppsRes.data ?? []) as OpportunityMentionRow[])
        .filter(o => o.stage !== 'won' && o.stage !== 'lost')
        .map(o => mentionFromOpportunity(o))
      const review = reviewRes.data as TodayReviewRow | null
      setTodos(todoList)
      setMsTodos((msTodosRes.data ?? []) as MsTodo[])
      setMilestones((msRes.data ?? []) as Milestone[])
      setMentionOptions([...peopleOptions, ...companyOptions, ...oppOptions])
      const gl = (goalsRes.data ?? []) as GoalLite[]
      setGoals(gl)
      setGoalsMap(new Map(gl.map(g => [g.id, g])))
      if (!journalInit.current) { setJournal(review?.notes ?? ''); journalInit.current = true }
      setDailyGoal(review?.one_thing ?? '')
      if (!review?.one_thing && !sessionStorage.getItem(`rethink.today.goalSkipped:${today}`)) setStartOpen(true)
      loadMentions(user.id, todoList)
    })()
    return () => { cancelled = true }
  }, [today, loadMentions])

  // ── milestone progress (done/total) from milestone-linked todos ──
  const msProgress = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    for (const t of msTodos) {
      if (!t.milestone_id) continue
      const cur = m.get(t.milestone_id) ?? { done: 0, total: 0 }
      cur.total++; if (t.completed) cur.done++
      m.set(t.milestone_id, cur)
    }
    return m
  }, [msTodos])

  const colorForGoal = useCallback((goalId: string | null) => {
    const g = goalId ? goalsMap.get(goalId) : null
    if (g?.color) return g.color
    // stable fallback by goal id hash
    const idx = goalId ? [...goalId].reduce((s, c) => s + c.charCodeAt(0), 0) % FALLBACK_COLORS.length : 0
    return FALLBACK_COLORS[idx]
  }, [goalsMap])

  // Manually curated focus set — the user picks which milestones surface here
  // (via the "Show in Today" toggle in the drawer / Manage screen).
  const milestoneRows: MilestoneRowData[] = useMemo(() => {
    return [...milestones]
      .filter(m => m.focused)
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31'))
      .slice(0, 6)
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          emoji: m.emoji ?? g?.emoji ?? null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  const milestoneOptions: TodoMilestoneOption[] = useMemo(() => {
    return [...milestones]
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31') ||
        a.text.localeCompare(b.text))
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          goalId: m.goal_id,
          goalLabel: g?.alias || g?.text || null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  // ── todo lookups for TodoList ──────────────────────────────────
  const milestoneName = useCallback((id: string | null) => {
    if (!id) return null
    const m = milestones.find(x => x.id === id)
    if (!m) return null
    const g = goalsMap.get(m.goal_id)
    return g?.alias || m.text
  }, [milestones, goalsMap])
  const milestoneColor = useCallback((id: string | null) => {
    if (!id) return null
    const m = milestones.find(x => x.id === id)
    if (!m) return null
    return m.color ?? colorForGoal(m.goal_id)
  }, [milestones, colorForGoal])

  const milestoneTotal = useCallback((id: string) => msProgress.get(id)?.total ?? 0, [msProgress])
  const milestoneOrder = useMemo(() => milestones.map(m => m.id), [milestones])

  const resolveMentions = useCallback((t: Todo): Mention[] => {
    const out: Mention[] = []
    if (t.contact_id) { const m = mentions.get(`person:${t.contact_id}`); if (m) out.push(m) }
    if (t.company_id) { const m = mentions.get(`company:${t.company_id}`); if (m) out.push(m) }
    if (t.opportunity_id) { const m = mentions.get(`opportunity:${t.opportunity_id}`); if (m) out.push(m) }
    return out
  }, [mentions])

  // ── todo handlers ──────────────────────────────────────────────
  const syncMsTodo = (id: string, patch: Partial<MsTodo>) =>
    setMsTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  const toggleTodo = async (id: string) => {
    const t = todos.find(x => x.id === id); if (!t) return
    const next = !t.completed
    setTodos(prev => prev.map(x => x.id === id ? { ...x, completed: next } : x))
    syncMsTodo(id, { completed: next })
    await supabase.from('todos').update({ completed: next, completed_at: next ? new Date().toISOString() : null }).eq('id', id)
  }
  const deleteTodo = async (id: string) => {
    const t = todos.find(x => x.id === id)
    if (t?.milestone_id) {
      // Belongs to a milestone → don't destroy it; just remove from today (return to milestone).
      // Permanent deletion only happens from inside the milestone drawer.
      setTodos(prev => prev.filter(x => x.id !== id))
      await supabase.from('todos').update({ date: null }).eq('id', id)
    } else {
      setTodos(prev => prev.filter(x => x.id !== id))
      setMsTodos(prev => prev.filter(x => x.id !== id))
      await supabase.from('todos').delete().eq('id', id)
    }
  }
  const starTodo = async (id: string) => {
    const t = todos.find(x => x.id === id); if (!t) return
    const next = !t.is_featured
    setTodos(prev => prev.map(x => x.id === id ? { ...x, is_featured: next } : x))
    await supabase.from('todos').update({ is_featured: next }).eq('id', id)
  }
  const toggleWaiting = async (id: string) => {
    const t = todos.find(x => x.id === id); if (!t) return
    const next = !t.waiting
    setTodos(prev => prev.map(x => x.id === id ? { ...x, waiting: next } : x))
    await supabase.from('todos').update({ waiting: next }).eq('id', id)
  }
  const createMention = useCallback(async (kind: TodoMentionKind, name: string, companyId?: string | null) => {
    if (!userId) return null
    const created = await createCrmObject(supabase, userId, kind, name, { today, companyId })
    if (!created) return null
    setMentionOptions(prev => {
      const exists = prev.some(m => m.kind === created.mention.kind && m.id === created.mention.id)
      return exists ? prev : [...prev, created.mention].sort((a, b) => a.name.localeCompare(b.name))
    })
    setMentions(prev => {
      const next = new Map(prev)
      if (created.mention.id) next.set(`${created.mention.kind}:${created.mention.id}`, created.mention)
      return next
    })
    return created.mention
  }, [today, userId])

  const editTodoText = async (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => {
    const patch: Partial<Todo> = { text, content_segments: contentSegments }
    if (links?.contactId !== undefined) patch.contact_id = links.contactId
    if (links?.companyId !== undefined) patch.company_id = links.companyId
    if (links?.opportunityId !== undefined) patch.opportunity_id = links.opportunityId
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    await supabase.from('todos').update({
      text,
      content_segments: contentSegments,
      ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
      ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
      ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
    }).eq('id', id)
    if (userId && links) loadMentions(userId, todos.map(x => x.id === id ? { ...x, ...patch } as Todo : x))
  }
  const addTodo = async (text: string, milestoneId: string | null, contentSegments: TodoContentSegment[], links: TodoLinks = {}) => {
    if (!userId) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const selectedOpp = links.opportunityId ? mentionOptions.find(m => m.kind === 'opportunity' && m.id === links.opportunityId) : null
    const companyId = links.companyId ?? selectedOpp?.companyId ?? null
    const { data } = await supabase.from('todos').insert({
      text, user_id: userId, date: today,
      content_segments: contentSegments,
      milestone_id: milestoneId, goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: companyId,
      opportunity_id: links.opportunityId ?? null,
    }).select().single()
    if (data) {
      const todo = data as Todo
      setTodos(prev => [...prev, todo])
      if (milestoneId) setMsTodos(prev => [...prev, { id: data.id, milestone_id: milestoneId, completed: false }])
      loadMentions(userId, [...todos, todo])
    }
  }

  const changeTodoMilestone = async (id: string, milestoneId: string | null) => {
    const todo = todos.find(x => x.id === id)
    if (!todo) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const patch: Partial<Todo> = {
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    setMsTodos(prev => {
      const without = prev.filter(x => x.id !== id)
      if (!milestoneId) return without
      return [...without, { id, milestone_id: milestoneId, completed: todo.completed }]
    })
    await supabase.from('todos').update({
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }).eq('id', id)
  }

  const reorderTodos = async (orderedActiveIds: string[]) => {
    setTodos(prev => {
      const byId = new Map(prev.map(t => [t.id, t]))
      const active = orderedActiveIds.map(id => byId.get(id)).filter(Boolean) as Todo[]
      const done = prev.filter(t => t.completed)
      return [...active, ...done]
    })
    await Promise.all(orderedActiveIds.map((id, i) => supabase.from('todos').update({ sort_order: i }).eq('id', id)))
  }

  // ── journal autosave ───────────────────────────────────────────
  const onJournalChange = (v: string) => {
    setJournal(v)
    if (!userId) return
    if (journalTimer.current) clearTimeout(journalTimer.current)
    journalTimer.current = setTimeout(() => {
      supabase.from('reviews').upsert({ user_id: userId, date: today, notes: v }, { onConflict: 'user_id,date' }).then(() => {})
    }, 700)
  }

  // ── milestone panel todo sync ──────────────────────────────────
  const onPanelTodoCreate = (t: Todo) => {
    if (t.milestone_id) setMsTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, { id: t.id, milestone_id: t.milestone_id, completed: t.completed }])
    if (t.date === today) setTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, t])
  }
  const onPanelTodoUpdate = (t: Todo) => {
    if (t.milestone_id) syncMsTodo(t.id, { completed: t.completed, milestone_id: t.milestone_id })
    setTodos(prev => {
      const inToday = t.date === today
      const exists = prev.some(x => x.id === t.id)
      if (inToday) return exists ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]
      return prev.filter(x => x.id !== t.id)
    })
  }
  const onPanelTodoDelete = (id: string) => {
    setTodos(prev => prev.filter(x => x.id !== id))
    setMsTodos(prev => prev.filter(x => x.id !== id))
  }

  const expandedMilestone = milestones.find(m => m.id === expandedMs) ?? null
  const expandedGoal = expandedMilestone ? goalsMap.get(expandedMilestone.goal_id) ?? null : null

  const setGroup = (g: GroupBy) => { setGroupBy(g); localStorage.setItem(GROUP_KEY, g) }

  // ── rail sections ──────────────────────────────────────────────
  const sections: RailSectionDef[] = userId ? [
    {
      id: 'milestones', title: 'Milestones', icon: <Target size={13} />, count: milestoneRows.length,
      body: <MilestoneRows rows={milestoneRows} activeId={expandedMs} onExpand={setExpandedMs} onManage={() => navigate('/milestone-plan')} />,
    },
    {
      id: 'thisweek', title: 'This week', icon: <ChartLineUp size={13} />, tone: 'lagging',
      body: <ThisWeek key={twRefresh} userId={userId} weekDates={weekDates} today={today} onManage={() => navigate('/plan')} />,
    },
    {
      id: 'nextsteps', title: 'Next steps', icon: <UsersThree size={13} />,
      body: <NextSteps userId={userId} today={today} weekEnd={weekDates[6]} onActioned={() => setTwRefresh(n => n + 1)} onManage={() => navigate('/people')} />,
    },
    {
      id: 'journal', title: 'Journal', icon: <PencilSimple size={13} />,
      body: (
        <>
          <textarea
            className="td-journal-area"
            placeholder="What's on your mind?"
            value={journal}
            onChange={e => onJournalChange(e.target.value)}
          />
          <div className="td-tw-foot">
            <button onClick={() => navigate('/library')}>
              <span>Open journal</span>
            </button>
          </div>
        </>
      ),
    },
  ] : []

  return (
    <div className="td-page">
      <div className="td-page-hd">
        <span className="date">{todayLabel}</span>
        <span className="sep">·</span>
        <span className="day-state">day in progress</span>
        <span className="hd-spacer" />
        {focus.complete ? (
          <div className="td-focus-live done" title={focus.intention || 'Focus complete'}>
            <Check size={12} weight="bold" />
            <span className="time">done</span>
            <button onClick={focus.dismiss} title="Dismiss"><X size={12} /></button>
          </div>
        ) : focus.active ? (
          <div className={`td-focus-live${focus.running ? ' running' : ''}`} title={focus.intention || 'Focus session'}>
            <span className="dot" />
            <span className="time">{fmtClock(focus.remaining)}</span>
            <button onClick={focus.running ? focus.pause : focus.resume} title={focus.running ? 'Pause' : 'Resume'}>
              {focus.running ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
            </button>
            <button onClick={focus.cancel} title="Cancel"><X size={12} /></button>
          </div>
        ) : (
          <button className="hd-act" onClick={() => setFocusOpen(true)} title="Start a focus session">
            <Timer size={13} /> focus
          </button>
        )}
        <button className="hd-act" onClick={() => setEndOpen(true)} title="Close the day">
          <Moon size={13} /> close
        </button>
      </div>

      {dailyGoal && (
        <div className="td-day-goal">
          <span className="label">one thing</span>
          <button onClick={() => setStartOpen(true)}>{dailyGoal}</button>
        </div>
      )}

      <div className="td-two-col">
        <div className="td-main-col">
          <TodoList
            todos={todos}
            milestoneName={milestoneName}
            milestoneColor={milestoneColor}
            milestoneTotal={milestoneTotal}
            milestoneOrder={milestoneOrder}
            resolveMentions={resolveMentions}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            groupBy={groupBy}
            onChangeGroup={setGroup}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onStar={starTodo}
            onToggleWaiting={toggleWaiting}
            onEditText={editTodoText}
            onAdd={addTodo}
            onCreateMention={createMention}
            onChangeMilestone={changeTodoMilestone}
            onMilestoneClick={setExpandedMs}
            onReorder={reorderTodos}
          />
        </div>

        <RightRail sections={sections} />
      </div>

      {userId && expandedMilestone && (
        <MilestonePanel
          milestone={expandedMilestone}
          goal={expandedGoal}
          userId={userId}
          today={today}
          onClose={() => setExpandedMs(null)}
          onMilestoneUpdate={(m) => {
            if (m.status === 'COMPLETE') {
              setMilestones(prev => prev.filter(x => x.id !== m.id))
              setExpandedMs(null)
            } else {
              setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
            }
          }}
          onMilestoneDelete={(id) => { setMilestones(prev => prev.filter(x => x.id !== id)); setExpandedMs(null) }}
          onTodoCreate={onPanelTodoCreate}
          onTodoUpdate={onPanelTodoUpdate}
          onTodoDelete={onPanelTodoDelete}
        />
      )}

      {userId && (
        <FocusTimer
          open={focusOpen}
          onClose={() => setFocusOpen(false)}
          onStart={focus.start}
          goals={goals.map(g => ({ id: g.id, text: g.text, emoji: g.emoji }))}
        />
      )}

      {userId && startOpen && (
        <DayStartDrawer
          today={today}
          userId={userId}
          initialGoal={dailyGoal}
          onClose={() => { sessionStorage.setItem(`rethink.today.goalSkipped:${today}`, '1'); setStartOpen(false) }}
          onSave={(goal) => { setDailyGoal(goal); setStartOpen(false) }}
        />
      )}

      {userId && endOpen && (
        <EndOfDayDrawer
          todos={todos}
          today={today}
          userId={userId}
          dailyGoal={dailyGoal}
          onClose={() => setEndOpen(false)}
          onComplete={({ tomorrowGoal, removedTodoIds }) => {
            if (tomorrowGoal) sessionStorage.removeItem(`rethink.today.goalSkipped:${today}`)
            setTodos(prev => prev.filter(t => !removedTodoIds.includes(t.id)))
            setEndOpen(false)
          }}
        />
      )}
    </div>
  )
}
