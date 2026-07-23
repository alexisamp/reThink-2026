import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Archive, ArrowBendUpLeft, ArrowsOutSimple, CalendarBlank, CaretLeft, CaretRight, Check, DotsSixVertical, FunnelSimple, Plus, Star, Trash, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Goal, Milestone, Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import EditableTodoText from './today/EditableTodoText'
import MentionEditor from './today/MentionEditor'
import TodoPreviewTarget from './today/TodoPreviewTarget'
import type { Mention, TodoMilestoneOption } from './today/types'
import { createCrmObject, mentionFromCompany, mentionFromContact, mentionFromOpportunity } from '@/lib/crmObjects'
import { editorToContentSegments, linksFromMentions, plainTextFromEditorSegments, type EditorSegment, type TodoLinks } from '@/lib/todoContent'

const WEEK_SPLIT_KEY = 'rethink.weekPlan.split'
const DAY_START = 7 * 60
const DAY_END = 23 * 60
const SNAP = 15
const DEFAULT_DURATION = 30
const MIN_DURATION = 15
const PX_PER_MINUTE = 1.35
const TODO_DND_TYPE = 'text/todo-id'
const FALLBACK_COLORS = ['#3E7A4E', '#536471', '#7A3E68', '#3E5F7A', '#9A6B4F']

type GroupBy = 'milestone' | 'goal' | 'none'
type AttributeFilter = 'all' | 'must_do' | 'waiting' | 'unlinked' | 'crm'
type SortBy = 'created_desc' | 'created_asc' | 'milestone_due' | 'return_date' | 'text'

type WeekInteraction =
  | { type: 'move'; id: string; date: string; startY: number; start: number; duration: number }
  | { type: 'resize'; id: string; date: string; startY: number; start: number; duration: number }

type ZoomDraft = { date: string; start: number | null; duration: number | null }

type ZoomDropPreview =
  | { type: 'slot'; hour: number; start: number; duration: number }
  | { type: 'unscheduled' }

type ZoomPointerDrag = { id: string; pointerId: number; x: number; y: number; duration: number }
type ZoomSlotAdd = { hour: number; start: number }

interface WeekBlock {
  todo: Todo
  start: number
  duration: number
  col: number
  cols: number
}

interface BacklogGroup {
  key: string
  kind: GroupBy
  label: string
  color: string
  milestoneId: string | null
  goalId: string | null
  todos: Todo[]
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

function weekStart(date = localDate()) {
  const d = new Date(`${date}T12:00:00`)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return localDate(d)
}

function formatShortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatWeekRange(start: string) {
  return `${formatShortDate(start)} - ${formatShortDate(addDays(start, 6))}`
}

function formatDayName(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snap(value: number) {
  return Math.round(value / SNAP) * SNAP
}

function textFromTodo(todo: Todo) {
  return todo.content_segments?.map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'mention') return segment.label
    return segment.label
  }).join('').trim() || todo.text
}

function hasSchedule(todo: Todo) {
  return todo.scheduled_start_minutes != null && todo.scheduled_duration_minutes != null
}

function todoDragId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(TODO_DND_TYPE) || dataTransfer.getData('text/todo') || dataTransfer.getData('text/sched') || dataTransfer.getData('text/plain')
}

function hasTodoDrag(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types)
  return types.includes(TODO_DND_TYPE) || types.includes('text/todo') || types.includes('text/sched') || types.includes('text/plain')
}

function minutesFromPoint(clientY: number, grid: HTMLDivElement | null, pxPerMinute = PX_PER_MINUTE) {
  if (!grid) return DAY_START
  const rect = grid.getBoundingClientRect()
  const minutes = DAY_START + ((clientY - rect.top + grid.scrollTop) / pxPerMinute)
  return clamp(snap(minutes), DAY_START, DAY_END - DEFAULT_DURATION)
}

function layoutBlocks(todos: Todo[]): WeekBlock[] {
  const sorted = todos
    .filter(hasSchedule)
    .map(todo => ({
      todo,
      start: todo.scheduled_start_minutes as number,
      duration: todo.scheduled_duration_minutes as number,
    }))
    .sort((a, b) => a.start - b.start || a.duration - b.duration)

  const out: WeekBlock[] = []
  let cluster: typeof sorted = []
  let clusterEnd = -1

  const flush = () => {
    const colEnds: number[] = []
    const placed: WeekBlock[] = []
    for (const item of cluster) {
      const col = colEnds.findIndex(end => end <= item.start)
      const nextCol = col === -1 ? colEnds.length : col
      colEnds[nextCol] = item.start + item.duration
      placed.push({ ...item, col: nextCol, cols: 1 })
    }
    const cols = Math.max(1, colEnds.length)
    placed.forEach(item => out.push({ ...item, cols }))
    cluster = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.start + item.duration)
  }
  if (cluster.length) flush()
  return out
}

function shouldFallbackWithoutContentSegments(error: { message?: string; code?: string } | null) {
  return Boolean(error && /content_segments|schema cache|column .*does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`))
}

function legacyTextFromContentSegments(segments: TodoContentSegment[], fallback: string) {
  if (!segments.some(segment => segment.type !== 'text')) return fallback
  return segments.map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'mention') return `[[mention:${segment.kind}:${segment.id}]]`
    return segment.label
  }).join('').replace(/\s{2,}/g, ' ').trim()
}

function initialSplit() {
  const saved = Number(window.localStorage.getItem(WEEK_SPLIT_KEY))
  return Number.isFinite(saved) ? clamp(saved, 260, 560) : 360
}

export default function WeekPlan() {
  const { user } = useAuth()
  const userId = user?.id
  const [anchorWeek, setAnchorWeek] = useState(() => weekStart())
  const [loading, setLoading] = useState(true)
  const [todos, setTodos] = useState<Todo[]>([])
  const [backlog, setBacklog] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [goals, setGoals] = useState<Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>[]>([])
  const [mentionOptions, setMentionOptions] = useState<Mention[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>('milestone')
  const [attributeFilter, setAttributeFilter] = useState<AttributeFilter>('all')
  const [milestoneFilter, setMilestoneFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortBy>('created_desc')
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [openAddGroup, setOpenAddGroup] = useState<string | null>(null)
  const [showMilestoneCreate, setShowMilestoneCreate] = useState(false)
  const [newMilestoneText, setNewMilestoneText] = useState('')
  const [newMilestoneGoalId, setNewMilestoneGoalId] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState('')
  const [splitWidth, setSplitWidth] = useState(initialSplit)
  const [dropDate, setDropDate] = useState<string | null>(null)
  const [dropMinute, setDropMinute] = useState<Record<string, number | null>>({})
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<WeekInteraction | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { date: string; start: number; duration: number }>>({})
  const [zoomDate, setZoomDate] = useState<string | null>(null)
  const [zoomDrafts, setZoomDrafts] = useState<Record<string, ZoomDraft>>({})
  const [zoomDropMinute, setZoomDropMinute] = useState<number | null>(null)
  const [zoomDropPreview, setZoomDropPreview] = useState<ZoomDropPreview | null>(null)
  const [zoomPointerDrag, setZoomPointerDrag] = useState<ZoomPointerDrag | null>(null)
  const [openZoomSlotAdd, setOpenZoomSlotAdd] = useState<ZoomSlotAdd | null>(null)
  const [zoomSlotMilestones, setZoomSlotMilestones] = useState<Record<number, string | null>>({})
  const draftsRef = useRef(drafts)
  const zoomDraftsRef = useRef(zoomDrafts)
  const draggingTodoIdRef = useRef<string | null>(null)
  const zoomPointerDragRef = useRef<ZoomPointerDrag | null>(null)
  const dayGridRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchorWeek, i)), [anchorWeek])
  const weekEnd = weekDates[6]
  const hours = useMemo(() => Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60), [])
  const zoomHours = useMemo(() => hours.filter(hour => hour < DAY_END), [hours])
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MINUTE
  const today = localDate()

  const goalsMap = useMemo(() => new Map(goals.map(goal => [goal.id, goal])), [goals])
  const milestonesMap = useMemo(() => new Map(milestones.map(milestone => [milestone.id, milestone])), [milestones])

  const colorForGoal = useCallback((goalId: string | null) => {
    const goal = goalId ? goalsMap.get(goalId) : null
    if (goal?.color) return goal.color
    const idx = goalId ? [...goalId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % FALLBACK_COLORS.length : 0
    return FALLBACK_COLORS[idx]
  }, [goalsMap])

  const colorForTodo = useCallback((todo: Todo) => {
    const milestone = todo.milestone_id ? milestonesMap.get(todo.milestone_id) : null
    return milestone?.color ?? colorForGoal(milestone?.goal_id ?? todo.goal_id)
  }, [colorForGoal, milestonesMap])

  const milestoneOptions: TodoMilestoneOption[] = useMemo(() => milestones.map(milestone => {
    const goal = goalsMap.get(milestone.goal_id)
    const linked = [...todos, ...backlog].filter(todo => todo.milestone_id === milestone.id)
    return {
      id: milestone.id,
      name: milestone.text,
      goalId: milestone.goal_id,
      goalLabel: goal?.alias || goal?.text || null,
      color: milestone.color ?? colorForGoal(milestone.goal_id),
      due: milestone.target_date,
      urgent: Boolean(milestone.target_date && milestone.target_date <= weekEnd),
      done: linked.filter(todo => todo.completed).length,
      total: linked.length,
    }
  }), [backlog, colorForGoal, goalsMap, milestones, todos, weekEnd])

  const resolveMentions = useCallback((todo: Todo): Mention[] => {
    const out: Mention[] = []
    const byKey = new Map(mentionOptions.map(option => [`${option.kind}:${option.id}`, option]))
    if (todo.contact_id) {
      const mention = byKey.get(`person:${todo.contact_id}`)
      if (mention) out.push(mention)
    }
    if (todo.company_id) {
      const mention = byKey.get(`company:${todo.company_id}`)
      if (mention) out.push(mention)
    }
    if (todo.opportunity_id) {
      const mention = byKey.get(`opportunity:${todo.opportunity_id}`)
      if (mention) out.push(mention)
    }
    for (const segment of todo.content_segments ?? []) {
      if (segment.type !== 'mention') continue
      const mention = byKey.get(`${segment.kind}:${segment.id}`) ?? {
        id: segment.id,
        kind: segment.kind,
        name: segment.label,
        imageUrl: segment.imageUrl ?? null,
        companyId: segment.companyId ?? null,
      }
      if (!out.some(item => item.kind === mention.kind && item.id === mention.id)) out.push(mention)
    }
    return out
  }, [mentionOptions])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [
      scheduledRes,
      backlogRes,
      noDateRes,
      milestonesRes,
      goalsRes,
      contactsRes,
      companiesRes,
      opportunitiesRes,
    ] = await Promise.all([
      supabase.from('todos').select('*').eq('user_id', userId).eq('completed', false).gte('date', anchorWeek).lte('date', weekEnd).is('backlog_at', null).order('date').order('scheduled_start_minutes', { nullsFirst: false }).order('created_at'),
      supabase.from('todos').select('*').eq('user_id', userId).eq('completed', false).not('backlog_at', 'is', null).order('backlog_at', { ascending: false }),
      supabase.from('todos').select('*').eq('user_id', userId).eq('completed', false).is('date', null).is('backlog_at', null).order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').eq('user_id', userId).neq('status', 'COMPLETE').neq('status', 'ARCHIVED').order('target_date', { nullsFirst: false }),
      supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', userId).eq('goal_type', 'ACTIVE').order('position'),
      supabase.from('outreach_logs').select('id, name, profile_photo_url, company, job_title, email, status').eq('user_id', userId).order('name'),
      supabase.from('companies').select('id, name, logo_url, favicon_url, domain, sector, headline').eq('user_id', userId).order('name'),
      supabase.from('opportunities').select('id, title, stage, type, company_id, company:companies(id, name, logo_url, favicon_url, domain)').eq('user_id', userId).order('created_at', { ascending: false }),
    ])
    const backlogById = new Map<string, Todo>()
    ;([...(backlogRes.data ?? []), ...(noDateRes.data ?? [])] as Todo[]).forEach(todo => backlogById.set(todo.id, todo))
    setTodos((scheduledRes.data ?? []) as Todo[])
    setBacklog([...backlogById.values()])
    setMilestones((milestonesRes.data ?? []) as Milestone[])
    setGoals((goalsRes.data ?? []) as Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>[])
    const contactOptions = (contactsRes.data ?? []).map(contact => mentionFromContact({ ...contact, name: contact.name.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || contact.name }))
    const companyOptions = (companiesRes.data ?? []).map(company => mentionFromCompany(company))
    const opportunityOptions = (opportunitiesRes.data ?? []).filter(opp => opp.stage !== 'won' && opp.stage !== 'lost').map(opp => mentionFromOpportunity(opp))
    setMentionOptions([...contactOptions, ...companyOptions, ...opportunityOptions])
    setLoading(false)
  }, [anchorWeek, userId, weekEnd])

  useEffect(() => { void load() }, [load])

  useEffect(() => () => {
    document.body.classList.remove('wp-dragging-todo')
  }, [])

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  useEffect(() => {
    zoomDraftsRef.current = zoomDrafts
  }, [zoomDrafts])

  useEffect(() => {
    if (!newMilestoneGoalId && goals[0]?.id) setNewMilestoneGoalId(goals[0].id)
  }, [goals, newMilestoneGoalId])

  const setTodoEverywhere = (id: string, updater: (todo: Todo) => Todo | null) => {
    setTodos(prev => prev.flatMap(todo => todo.id === id ? [updater(todo)].filter(Boolean) as Todo[] : [todo]))
    setBacklog(prev => prev.flatMap(todo => todo.id === id ? [updater(todo)].filter(Boolean) as Todo[] : [todo]))
  }

  const scheduleTodo = async (id: string, date: string, startMinutes: number | null, durationMinutes: number | null = DEFAULT_DURATION) => {
    const existing = todos.find(todo => todo.id === id) ?? backlog.find(todo => todo.id === id)
    if (!existing || !userId) return
    const patch = {
      date,
      backlog_at: null,
      return_date: null,
      scheduled_start_minutes: startMinutes,
      scheduled_duration_minutes: startMinutes == null ? null : durationMinutes,
    }
    const nextTodo = { ...existing, ...patch }
    setBacklog(prev => prev.filter(todo => todo.id !== id))
    setTodos(prev => {
      const without = prev.filter(todo => todo.id !== id)
      return [...without, nextTodo]
    })
    const { error } = await supabase.from('todos').update(patch).eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not schedule todo', error)
      void load()
    }
  }

  const moveToBacklog = async (id: string) => {
    const existing = todos.find(todo => todo.id === id) ?? backlog.find(todo => todo.id === id)
    if (!existing || !userId) return
    const patch = {
      date: null,
      backlog_at: new Date().toISOString(),
      return_date: null,
      scheduled_start_minutes: null,
      scheduled_duration_minutes: null,
      must_do: false,
    }
    const nextTodo = { ...existing, ...patch }
    setTodos(prev => prev.filter(todo => todo.id !== id))
    setBacklog(prev => [nextTodo, ...prev.filter(todo => todo.id !== id)])
    const { error } = await supabase.from('todos').update(patch).eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not move todo to backlog', error)
      void load()
    }
  }

  const toggleTodo = async (id: string) => {
    const existing = todos.find(todo => todo.id === id) ?? backlog.find(todo => todo.id === id)
    if (!existing || !userId) return
    const completed = !existing.completed
    const completedAt = completed ? new Date().toISOString() : null
    if (completed) {
      setTodos(prev => prev.filter(todo => todo.id !== id))
      setBacklog(prev => prev.filter(todo => todo.id !== id))
      setZoomDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        zoomDraftsRef.current = next
        return next
      })
      setDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        draftsRef.current = next
        return next
      })
    } else {
      setTodoEverywhere(id, todo => ({ ...todo, completed, completed_at: completedAt }))
    }
    const { error } = await supabase.from('todos').update({ completed, completed_at: completedAt }).eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not toggle todo', error)
      void load()
    }
  }

  const toggleMustDo = async (id: string) => {
    const existing = todos.find(todo => todo.id === id) ?? backlog.find(todo => todo.id === id)
    if (!existing || !userId) return
    const must_do = !existing.must_do
    setTodoEverywhere(id, todo => ({ ...todo, must_do }))
    const { error } = await supabase.from('todos').update({ must_do }).eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not update must-do', error)
      void load()
    }
  }

  const editTodoText = async (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => {
    if (!userId) return
    const patch: Partial<Todo> = { text, content_segments: contentSegments }
    if (links?.contactId !== undefined) patch.contact_id = links.contactId
    if (links?.companyId !== undefined) patch.company_id = links.companyId
    if (links?.opportunityId !== undefined) patch.opportunity_id = links.opportunityId
    setTodoEverywhere(id, todo => ({ ...todo, ...patch }))
    const updatePayload = {
      text,
      content_segments: contentSegments,
      ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
      ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
      ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
    }
    const { error } = await supabase.from('todos').update(updatePayload).eq('user_id', userId).eq('id', id)
    if (shouldFallbackWithoutContentSegments(error)) {
      await supabase.from('todos').update({
        text: legacyTextFromContentSegments(contentSegments, text),
        ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
        ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
        ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
      }).eq('user_id', userId).eq('id', id)
    } else if (error) {
      console.error('Could not edit todo', error)
      void load()
    }
  }

  const changeTodoMilestone = async (id: string, milestoneId: string | null) => {
    if (!userId) return
    const milestone = milestoneId ? milestonesMap.get(milestoneId) : null
    const patch = { milestone_id: milestoneId, goal_id: milestone?.goal_id ?? null }
    setTodoEverywhere(id, todo => ({ ...todo, ...patch }))
    const { error } = await supabase.from('todos').update(patch).eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not change milestone', error)
      void load()
    }
  }

  const createMention = useCallback(async (kind: TodoMentionKind, name: string, companyId?: string | null) => {
    if (!userId) return null
    const created = await createCrmObject(supabase, userId, kind, name, { today, companyId })
    if (!created) return null
    setMentionOptions(prev => {
      const exists = prev.some(option => option.kind === created.mention.kind && option.id === created.mention.id)
      return exists ? prev : [...prev, created.mention].sort((a, b) => a.name.localeCompare(b.name))
    })
    return created.mention
  }, [today, userId])

  const addBacklogTodo = async (event: FormEvent, opts: { milestoneId?: string | null; goalId?: string | null; groupKey?: string } = {}) => {
    event.preventDefault()
    const text = (opts.groupKey ? groupDrafts[opts.groupKey] : '').trim()
    if (!text || !userId) return
    const milestone = opts.milestoneId ? milestonesMap.get(opts.milestoneId) : null
    const goalId = milestone?.goal_id ?? opts.goalId ?? null
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: Todo = {
      id,
      user_id: userId,
      text,
      content_segments: [{ type: 'text', text }],
      goal_id: goalId,
      milestone_id: milestone?.id ?? null,
      contact_id: null,
      company_id: null,
      opportunity_id: null,
      effort: null,
      block: null,
      completed: false,
      waiting: false,
      completed_at: null,
      date: null,
      backlog_at: now,
      return_date: null,
      scheduled_start_minutes: null,
      scheduled_duration_minutes: null,
      must_do: false,
      recurring_id: null,
      sort_order: backlog.length,
      url: null,
      outreach_log_id: null,
      attio_task_id: null,
      is_featured: false,
      created_at: now,
    }
    setBacklog(prev => [optimistic, ...prev])
    if (opts.groupKey) setGroupDrafts(prev => ({ ...prev, [opts.groupKey as string]: '' }))
    setOpenAddGroup(null)
    const { error } = await supabase.from('todos').insert({
      id,
      user_id: userId,
      text,
      content_segments: optimistic.content_segments,
      date: null,
      backlog_at: now,
      milestone_id: milestone?.id ?? null,
      goal_id: goalId,
      sort_order: backlog.length,
    })
    if (shouldFallbackWithoutContentSegments(error)) {
      await supabase.from('todos').insert({
        id,
        user_id: userId,
        text,
        date: null,
        backlog_at: now,
        milestone_id: milestone?.id ?? null,
        goal_id: goalId,
        sort_order: backlog.length,
      })
    } else if (error) {
      console.error('Could not add backlog todo', error)
      setBacklog(prev => prev.filter(todo => todo.id !== id))
    }
  }

  const createZoomTodo = async (segments: TodoContentSegment[], links: TodoLinks, startMinutes: number | null, milestoneId: string | null = null) => {
    const text = segments.map(segment => {
      if (segment.type === 'text') return segment.text
      if (segment.type === 'mention') return segment.label
      return segment.label
    }).join('').trim()
    if (!text || !userId || !zoomDate) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const duration = startMinutes == null ? null : DEFAULT_DURATION
    const milestone = milestoneId ? milestonesMap.get(milestoneId) : null
    const optimistic: Todo = {
      id,
      user_id: userId,
      text,
      content_segments: segments,
      goal_id: milestone?.goal_id ?? null,
      milestone_id: milestone?.id ?? null,
      contact_id: links.contactId ?? null,
      company_id: links.companyId ?? null,
      opportunity_id: links.opportunityId ?? null,
      effort: null,
      block: null,
      completed: false,
      waiting: false,
      completed_at: null,
      date: zoomDate,
      backlog_at: null,
      return_date: null,
      scheduled_start_minutes: startMinutes,
      scheduled_duration_minutes: duration,
      must_do: false,
      recurring_id: null,
      sort_order: todos.length,
      url: null,
      outreach_log_id: null,
      attio_task_id: null,
      is_featured: false,
      created_at: now,
    }
    setTodos(prev => [...prev, optimistic])
    const insertPayload = {
      id,
      user_id: userId,
      text,
      content_segments: segments,
      date: zoomDate,
      backlog_at: null,
      scheduled_start_minutes: startMinutes,
      scheduled_duration_minutes: duration,
      sort_order: todos.length,
      milestone_id: milestone?.id ?? null,
      goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: links.companyId ?? null,
      opportunity_id: links.opportunityId ?? null,
    }
    const { error } = await supabase.from('todos').insert(insertPayload)
    if (shouldFallbackWithoutContentSegments(error)) {
      await supabase.from('todos').insert({
        id,
        user_id: userId,
        text,
        date: zoomDate,
        backlog_at: null,
        scheduled_start_minutes: startMinutes,
        scheduled_duration_minutes: duration,
        sort_order: todos.length,
        milestone_id: milestone?.id ?? null,
        goal_id: milestone?.goal_id ?? null,
        contact_id: links.contactId ?? null,
        company_id: links.companyId ?? null,
        opportunity_id: links.opportunityId ?? null,
      })
    } else if (error) {
      console.error('Could not add day todo', error)
      setTodos(prev => prev.filter(todo => todo.id !== id))
    }
  }

  const commitZoomSlotTodo = async (segments: EditorSegment[], slot: ZoomSlotAdd) => {
    const text = plainTextFromEditorSegments(segments).trim()
    const rich = editorToContentSegments(segments)
    if (!text && !rich.some(segment => segment.type !== 'text')) return
    const linked = segments.filter((segment): segment is { type: 'mention'; mention: Mention } => segment.type === 'mention').map(segment => segment.mention)
    const milestoneId = zoomSlotMilestones[slot.start] ?? null
    setOpenZoomSlotAdd(null)
    setZoomSlotMilestones(prev => {
      const next = { ...prev }
      delete next[slot.start]
      return next
    })
    await createZoomTodo(rich, linksFromMentions(linked), slot.start, milestoneId || null)
  }

  const deleteTodo = async (id: string) => {
    const existing = todos.find(todo => todo.id === id) ?? backlog.find(todo => todo.id === id)
    if (!existing || !userId) return
    setTodos(prev => prev.filter(todo => todo.id !== id))
    setBacklog(prev => prev.filter(todo => todo.id !== id))
    const { error } = await supabase.from('todos').delete().eq('user_id', userId).eq('id', id)
    if (error) {
      console.error('Could not delete todo', error)
      void load()
    }
  }

  const updateGroupColor = async (group: BacklogGroup, color: string) => {
    if (!userId || group.key === '__none__') return
    if (group.kind === 'milestone') {
      setMilestones(prev => prev.map(milestone => milestone.id === group.key ? { ...milestone, color } : milestone))
      const { error } = await supabase.from('milestones').update({ color }).eq('user_id', userId).eq('id', group.key)
      if (error) {
        console.error('Could not update milestone color', error)
        void load()
      }
    } else if (group.kind === 'goal') {
      setGoals(prev => prev.map(goal => goal.id === group.key ? { ...goal, color } : goal))
      const { error } = await supabase.from('goals').update({ color }).eq('user_id', userId).eq('id', group.key)
      if (error) {
        console.error('Could not update goal color', error)
        void load()
      }
    }
  }

  const createMilestone = async (event: FormEvent) => {
    event.preventDefault()
    const text = newMilestoneText.trim()
    const goalId = newMilestoneGoalId || goals[0]?.id
    if (!text || !goalId || !userId) return
    const payload = {
      user_id: userId,
      goal_id: goalId,
      text,
      target_date: newMilestoneDate || null,
      status: 'PENDING',
      focused: false,
      color: goalsMap.get(goalId)?.color ?? null,
      position: milestones.length,
    }
    const { data, error } = await supabase.from('milestones').insert(payload).select('*').single()
    if (error) {
      console.error('Could not create milestone', error)
      void load()
      return
    }
    if (data) {
      setMilestones(prev => [...prev, data as Milestone])
      setGroupBy('milestone')
      setMilestoneFilter('all')
    }
    setNewMilestoneText('')
    setNewMilestoneDate('')
    setShowMilestoneCreate(false)
  }

  const archiveMilestone = async (milestone: Milestone) => {
    if (!userId) return
    const ok = window.confirm(`Delete "${milestone.text}" from Week Plan? Its todos will stay, but move to No milestone.`)
    if (!ok) return
    setMilestones(prev => prev.filter(item => item.id !== milestone.id))
    setTodos(prev => prev.map(todo => todo.milestone_id === milestone.id ? { ...todo, milestone_id: null, goal_id: milestone.goal_id } : todo))
    setBacklog(prev => prev.map(todo => todo.milestone_id === milestone.id ? { ...todo, milestone_id: null, goal_id: milestone.goal_id } : todo))
    if (milestoneFilter === milestone.id) setMilestoneFilter('all')

    const todosRes = await supabase
      .from('todos')
      .update({ milestone_id: null, goal_id: milestone.goal_id })
      .eq('user_id', userId)
      .eq('milestone_id', milestone.id)
    const milestoneRes = await supabase
      .from('milestones')
      .update({ status: 'ARCHIVED' })
      .eq('user_id', userId)
      .eq('id', milestone.id)

    if (todosRes.error || milestoneRes.error) {
      console.error('Could not delete milestone', todosRes.error ?? milestoneRes.error)
      void load()
    }
  }

  useEffect(() => {
    if (!interaction) return
    const move = (event: PointerEvent) => {
      const delta = snap((event.clientY - interaction.startY) / PX_PER_MINUTE)
      let nextStart = interaction.start
      let nextDuration = interaction.duration
      if (interaction.type === 'move') {
        nextStart = clamp(interaction.start + delta, DAY_START, DAY_END - interaction.duration)
      } else {
        nextDuration = clamp(snap(interaction.duration + delta), MIN_DURATION, DAY_END - interaction.start)
      }
      const nextDrafts = { ...draftsRef.current, [interaction.id]: { date: interaction.date, start: nextStart, duration: nextDuration } }
      draftsRef.current = nextDrafts
      setDrafts(nextDrafts)
    }
    const up = () => {
      const draft = draftsRef.current[interaction.id]
      if (draft) void scheduleTodo(interaction.id, draft.date, draft.start, draft.duration)
      setInteraction(null)
      const next = { ...draftsRef.current }
      delete next[interaction.id]
      draftsRef.current = next
      setDrafts(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [interaction])

  useEffect(() => {
    if (!zoomPointerDrag || !zoomDate) return
    const { id, pointerId, duration } = zoomPointerDrag
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const currentDrag = zoomPointerDragRef.current ?? zoomPointerDrag
      const nextDrag = { ...currentDrag, x: event.clientX, y: event.clientY }
      zoomPointerDragRef.current = nextDrag
      setZoomPointerDrag(nextDrag)
      setZoomDropPreview(zoomPreviewFromPoint(event.clientX, event.clientY, duration))
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const preview = zoomPreviewFromPoint(event.clientX, event.clientY, duration)
      if (preview?.type === 'unscheduled') {
        draftZoomSchedule(id, null)
      } else if (preview?.type === 'slot') {
        draftZoomSchedule(id, preview.start, preview.duration)
      }
      endDrag()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    window.addEventListener('pointercancel', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [zoomDate, zoomPointerDrag?.duration, zoomPointerDrag?.id, zoomPointerDrag?.pointerId])

  const startSplitResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = splitWidth
    let nextWidth = startWidth
    document.body.classList.add('resizing-sidebar')
    const move = (next: PointerEvent) => {
      nextWidth = clamp(startWidth + next.clientX - startX, 260, 560)
      setSplitWidth(nextWidth)
    }
    const up = () => {
      document.body.classList.remove('resizing-sidebar')
      window.localStorage.setItem(WEEK_SPLIT_KEY, String(Math.round(nextWidth)))
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const startBlockInteraction = (type: WeekInteraction['type'], todo: Todo, event: ReactPointerEvent<HTMLElement>) => {
    if (!todo.date || !hasSchedule(todo)) return
    event.preventDefault()
    event.stopPropagation()
    setInteraction({
      type,
      id: todo.id,
      date: todo.date,
      startY: event.clientY,
      start: todo.scheduled_start_minutes as number,
      duration: todo.scheduled_duration_minutes as number,
    })
  }

  const startDrag = (todo: Todo, event: DragEvent<HTMLElement>) => {
    event.stopPropagation()
    draggingTodoIdRef.current = todo.id
    setDraggingTodoId(todo.id)
    document.body.classList.add('wp-dragging-todo')
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(TODO_DND_TYPE, todo.id)
    event.dataTransfer.setData('text/todo', todo.id)
    event.dataTransfer.setData('text/sched', todo.id)
    event.dataTransfer.setData('text/plain', todo.id)
  }

  const endDrag = () => {
    draggingTodoIdRef.current = null
    zoomPointerDragRef.current = null
    document.body.classList.remove('wp-dragging-todo')
    setDraggingTodoId(null)
    setZoomPointerDrag(null)
    setDropDate(null)
    setDropMinute({})
    setZoomDropMinute(null)
    setZoomDropPreview(null)
  }

  const activeDragId = (dataTransfer: DataTransfer) => todoDragId(dataTransfer) || draggingTodoIdRef.current || draggingTodoId

  const canAcceptTodoDrag = (dataTransfer: DataTransfer) => draggingTodoIdRef.current != null || draggingTodoId != null || hasTodoDrag(dataTransfer)

  const filteredBacklog = useMemo(() => {
    const matches = backlog.filter(todo => {
      if (milestoneFilter !== 'all' && (todo.milestone_id ?? '__none__') !== milestoneFilter) return false
      if (attributeFilter === 'must_do' && !todo.must_do) return false
      if (attributeFilter === 'waiting' && !todo.waiting) return false
      if (attributeFilter === 'unlinked' && (todo.milestone_id || todo.goal_id || todo.contact_id || todo.company_id || todo.opportunity_id)) return false
      if (attributeFilter === 'crm' && !(todo.contact_id || todo.company_id || todo.opportunity_id)) return false
      return true
    })
    return [...matches].sort((a, b) => {
      if (sortBy === 'created_asc') return a.created_at.localeCompare(b.created_at)
      if (sortBy === 'created_desc') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'text') return textFromTodo(a).localeCompare(textFromTodo(b))
      if (sortBy === 'return_date') return (a.return_date ?? '9999-12-31').localeCompare(b.return_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at)
      if (sortBy === 'milestone_due') {
        const am = a.milestone_id ? milestonesMap.get(a.milestone_id) : null
        const bm = b.milestone_id ? milestonesMap.get(b.milestone_id) : null
        return (am?.target_date ?? '9999-12-31').localeCompare(bm?.target_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at)
      }
      return 0
    })
  }, [attributeFilter, backlog, milestoneFilter, milestonesMap, sortBy])

  const backlogGroups = useMemo(() => {
    const groups = new Map<string, BacklogGroup>()
    const ensure = (group: BacklogGroup) => {
      if (!groups.has(group.key)) groups.set(group.key, group)
      return groups.get(group.key)!
    }

    if (groupBy === 'milestone') {
      for (const milestone of milestones) {
        if (milestoneFilter !== 'all' && milestoneFilter !== milestone.id) continue
        ensure({
          key: milestone.id,
          kind: 'milestone',
          label: milestone.text,
          color: milestone.color ?? colorForGoal(milestone.goal_id),
          milestoneId: milestone.id,
          goalId: milestone.goal_id,
          todos: [],
        })
      }
      if (milestoneFilter === 'all' || milestoneFilter === '__none__') {
        ensure({ key: '__none__', kind: 'milestone', label: 'No milestone', color: colorForGoal(null), milestoneId: null, goalId: null, todos: [] })
      }
    } else if (groupBy === 'goal') {
      for (const goal of goals) {
        ensure({
          key: goal.id,
          kind: 'goal',
          label: goal.alias || goal.text,
          color: goal.color ?? colorForGoal(goal.id),
          milestoneId: null,
          goalId: goal.id,
          todos: [],
        })
      }
      ensure({ key: '__none__', kind: 'goal', label: 'No goal', color: colorForGoal(null), milestoneId: null, goalId: null, todos: [] })
    } else {
      ensure({ key: '__all__', kind: 'none', label: 'All backlog', color: colorForGoal(null), milestoneId: null, goalId: null, todos: [] })
    }

    for (const todo of filteredBacklog) {
      let key = '__none__'
      let label = 'No milestone'
      let color = colorForTodo(todo)
      let milestoneId: string | null = null
      let goalId: string | null = null
      if (groupBy === 'goal') {
        const resolvedGoalId = todo.goal_id ?? (todo.milestone_id ? milestonesMap.get(todo.milestone_id)?.goal_id : null) ?? '__none__'
        key = resolvedGoalId
        goalId = resolvedGoalId === '__none__' ? null : resolvedGoalId
        label = resolvedGoalId === '__none__' ? 'No goal' : goalsMap.get(resolvedGoalId)?.alias || goalsMap.get(resolvedGoalId)?.text || 'Goal'
        color = goalId ? colorForGoal(goalId) : color
      } else if (groupBy === 'milestone') {
        key = todo.milestone_id ?? '__none__'
        milestoneId = todo.milestone_id
        const milestone = todo.milestone_id ? milestonesMap.get(todo.milestone_id) : null
        goalId = milestone?.goal_id ?? null
        label = milestone ? milestone.text : 'No milestone'
        color = milestone?.color ?? colorForGoal(goalId) ?? color
      } else {
        key = '__all__'
        label = 'All backlog'
      }
      ensure({ key, kind: groupBy, label, color, milestoneId, goalId, todos: [] }).todos.push(todo)
    }
    return [...groups.values()]
  }, [colorForGoal, colorForTodo, filteredBacklog, goals, goalsMap, groupBy, milestoneFilter, milestones, milestonesMap])

  const visibleTodos = useMemo(() => todos.map(todo => {
    const draft = drafts[todo.id]
    return draft ? { ...todo, date: draft.date, scheduled_start_minutes: draft.start, scheduled_duration_minutes: draft.duration } : todo
  }), [drafts, todos])

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>()
    weekDates.forEach(date => map.set(date, []))
    visibleTodos.forEach(todo => {
      if (!todo.date || !map.has(todo.date)) return
      map.get(todo.date)!.push(todo)
    })
    return map
  }, [visibleTodos, weekDates])

  const zoomTodos = useMemo(() => {
    if (!zoomDate) return []
    const dayTodos = todosByDate.get(zoomDate) ?? []
    return dayTodos.map(todo => {
      const draft = zoomDrafts[todo.id]
      return draft ? { ...todo, date: draft.date, scheduled_start_minutes: draft.start, scheduled_duration_minutes: draft.duration } : todo
    })
  }, [todosByDate, zoomDate, zoomDrafts])

  const zoomPlanned = useMemo(() => zoomTodos.filter(todo => !hasSchedule(todo)), [zoomTodos])
  const zoomScheduled = useMemo(() => zoomTodos
    .filter(hasSchedule)
    .sort((a, b) => (a.scheduled_start_minutes ?? 0) - (b.scheduled_start_minutes ?? 0) || textFromTodo(a).localeCompare(textFromTodo(b))), [zoomTodos])

  const openDayZoom = (date: string) => {
    setZoomDate(date)
    setZoomDrafts({})
    zoomDraftsRef.current = {}
    setZoomDropMinute(null)
    setZoomDropPreview(null)
    setOpenZoomSlotAdd(null)
    setZoomSlotMilestones({})
  }

  const draftZoomSchedule = (id: string, start: number | null, duration = DEFAULT_DURATION) => {
    if (!zoomDate) return
    const existing = zoomTodos.find(todo => todo.id === id)
    const nextDuration = start == null ? null : existing?.scheduled_duration_minutes ?? duration
    const nextDrafts = {
      ...zoomDraftsRef.current,
      [id]: { date: zoomDate, start, duration: nextDuration },
    }
    zoomDraftsRef.current = nextDrafts
    setZoomDrafts(nextDrafts)
  }

  const zoomPreviewFromPoint = (clientX: number, clientY: number, duration: number): ZoomDropPreview | null => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!target) return null
    if (target.closest('[data-zoom-unscheduled="true"]')) return { type: 'unscheduled' }
    const slot = target.closest<HTMLElement>('[data-zoom-hour]')
    if (!slot) return null
    const hour = Number(slot.dataset.zoomHour)
    if (!Number.isFinite(hour)) return null
    const body = slot.querySelector<HTMLElement>('.wp-zoom-slot-body') ?? slot
    const rect = body.getBoundingClientRect()
    const rawStart = hour + ((clientY - rect.top) / Math.max(1, rect.height)) * 60
    const latestInSlot = Math.min(hour + 45, DAY_END - duration)
    const start = clamp(snap(rawStart), hour, latestInSlot)
    return { type: 'slot', hour, start, duration: clamp(duration, MIN_DURATION, DAY_END - start) }
  }

  const startZoomPointerDrag = (todo: Todo, event: ReactPointerEvent<HTMLElement>) => {
    if (todo.completed) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return
    event.preventDefault()
    event.stopPropagation()
    const duration = todo.scheduled_duration_minutes ?? DEFAULT_DURATION
    const drag = { id: todo.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, duration }
    draggingTodoIdRef.current = todo.id
    zoomPointerDragRef.current = drag
    document.body.classList.add('wp-dragging-todo')
    setDraggingTodoId(todo.id)
    setZoomPointerDrag(drag)
    setZoomDropPreview(zoomPreviewFromPoint(event.clientX, event.clientY, duration))
  }

  const resizeZoomDuration = (todo: Todo, delta: number) => {
    if (!zoomDate || !hasSchedule(todo)) return
    const start = todo.scheduled_start_minutes as number
    const duration = todo.scheduled_duration_minutes as number
    const nextDuration = clamp(duration + delta, MIN_DURATION, DAY_END - start)
    const nextDrafts = {
      ...zoomDraftsRef.current,
      [todo.id]: { date: zoomDate, start, duration: nextDuration },
    }
    zoomDraftsRef.current = nextDrafts
    setZoomDrafts(nextDrafts)
  }

  const commitDayZoom = async () => {
    if (!zoomDate || !userId) return
    const entries = Object.entries(zoomDraftsRef.current)
    if (entries.length === 0) {
      setZoomDate(null)
      return
    }

    const changedIds = new Set(entries.map(([id]) => id))
    const patches = new Map(entries.map(([id, draft]) => {
      const patch = {
        date: zoomDate,
        backlog_at: null,
        return_date: null,
        scheduled_start_minutes: draft.start,
        scheduled_duration_minutes: draft.start == null ? null : draft.duration ?? DEFAULT_DURATION,
      }
      return [id, patch]
    }))

    setBacklog(prev => prev.filter(todo => !changedIds.has(todo.id)))
    setTodos(prev => prev.map(todo => {
      const patch = patches.get(todo.id)
      return patch ? { ...todo, ...patch } : todo
    }))

    const results = await Promise.all(entries.map(([id, draft]) => {
      const patch = {
        date: zoomDate,
        backlog_at: null,
        return_date: null,
        scheduled_start_minutes: draft.start,
        scheduled_duration_minutes: draft.start == null ? null : draft.duration ?? DEFAULT_DURATION,
      }
      return supabase.from('todos').update(patch).eq('user_id', userId).eq('id', id)
    }))

    const failed = results.find(result => result.error)
    if (failed?.error) {
      console.error('Could not save day zoom plan', failed.error)
      void load()
    }

    setZoomDate(null)
    setZoomDrafts({})
    zoomDraftsRef.current = {}
  }

  const renderTodoRow = (todo: Todo, mode: 'backlog' | 'planned' = 'backlog') => {
    const mentions = resolveMentions(todo)
    return (
      <TodoPreviewTarget
        as="div"
        key={todo.id}
        todo={todo}
        mentions={mentions}
        mentionOptions={mentionOptions}
        className={`tp-row wp-todo-row${todo.completed ? ' done' : ''}${todo.must_do ? ' pri' : ''}`}
        style={{ '--row-accent': colorForTodo(todo) } as CSSProperties}
        draggable={!todo.completed}
        onDragStart={event => startDrag(todo, event)}
        onDragEnd={endDrag}
      >
        <button className={`tp-check${todo.completed ? ' on' : ''}`} onClick={() => void toggleTodo(todo.id)} title={todo.completed ? 'Mark active' : 'Mark complete'}>
          {todo.completed && <Check size={9} weight="bold" />}
        </button>
        <div className="tp-body-cell">
          <EditableTodoText
            todo={todo}
            mentions={mentions}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            className="tp-txt"
            onEditText={editTodoText}
            onCreateMention={createMention}
            onChangeMilestone={changeTodoMilestone}
          />
        </div>
        <span className="tp-row-acts">
          <button className={`wp-icon-btn${todo.must_do ? ' on' : ''}`} onClick={() => void toggleMustDo(todo.id)} title={todo.must_do ? 'Must-do' : 'Mark must-do'}>
            <Star size={12} weight={todo.must_do ? 'fill' : 'regular'} />
          </button>
          {mode === 'planned' && (
            <button className="wp-icon-btn" onClick={() => void moveToBacklog(todo.id)} title="Send to backlog">
              <Archive size={12} />
            </button>
          )}
          <button className="wp-icon-btn danger" onClick={() => void deleteTodo(todo.id)} title="Delete todo">
            <Trash size={12} />
          </button>
          <span className="grab" draggable onDragStart={event => startDrag(todo, event)} onDragEnd={endDrag} title="Drag to week calendar">
            <DotsSixVertical size={13} />
          </span>
        </span>
      </TodoPreviewTarget>
    )
  }

  const renderZoomTodoRow = (todo: Todo) => {
    const mentions = resolveMentions(todo)
    return (
      <TodoPreviewTarget
        as="div"
        key={todo.id}
        todo={todo}
        mentions={mentions}
        mentionOptions={mentionOptions}
        className={`tp-row wp-todo-row wp-zoom-row${todo.completed ? ' done' : ''}${todo.must_do ? ' pri' : ''}${zoomPointerDrag?.id === todo.id ? ' dragging' : ''}`}
        style={{ '--row-accent': colorForTodo(todo) } as CSSProperties}
        draggable={false}
        onPointerDown={event => startZoomPointerDrag(todo, event)}
      >
        <button className={`tp-check${todo.completed ? ' on' : ''}`} onClick={() => void toggleTodo(todo.id)} title={todo.completed ? 'Mark active' : 'Mark complete'}>
          {todo.completed && <Check size={9} weight="bold" />}
        </button>
        <div className="tp-body-cell">
          <EditableTodoText
            todo={todo}
            mentions={mentions}
            mentionOptions={mentionOptions}
            milestoneOptions={milestoneOptions}
            className="tp-txt"
            onEditText={editTodoText}
            onCreateMention={createMention}
            onChangeMilestone={changeTodoMilestone}
          />
        </div>
        <span className="tp-row-acts">
          <span className="grab" onPointerDown={event => startZoomPointerDrag(todo, event)} title="Drag to an hour">
            <DotsSixVertical size={13} />
          </span>
        </span>
      </TodoPreviewTarget>
    )
  }

  if (loading) return <div className="week-plan loading">Loading week plan...</div>

  return (
    <div className="week-plan" style={{ '--week-backlog-w': `${splitWidth}px`, '--week-cal-height': `${gridHeight}px` } as CSSProperties}>
      <header className="wp-head">
        <div className="wp-title">
          <CalendarBlank size={18} />
          <div>
            <h1>Week Plan</h1>
            <span>{formatWeekRange(anchorWeek)}</span>
          </div>
        </div>
        <div className="wp-week-nav">
          <button onClick={() => setAnchorWeek(addDays(anchorWeek, -7))} title="Previous week"><CaretLeft size={14} /></button>
          <button onClick={() => setAnchorWeek(weekStart())}>This week</button>
          <button onClick={() => setAnchorWeek(addDays(anchorWeek, 7))} title="Next week"><CaretRight size={14} /></button>
        </div>
      </header>

      <div className="wp-body">
        <aside
          className="wp-backlog"
          onDragOver={event => {
            if (!canAcceptTodoDrag(event.dataTransfer)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={event => {
            event.preventDefault()
            const id = activeDragId(event.dataTransfer)
            if (id) void moveToBacklog(id)
            endDrag()
          }}
        >
          <div className="wp-panel-hd">
            <div>
              <h2>Backlog</h2>
              <span>{filteredBacklog.length} todo{filteredBacklog.length === 1 ? '' : 's'}</span>
            </div>
            <button
              className="wp-panel-action"
              type="button"
              onClick={() => setShowMilestoneCreate(value => !value)}
              title="New milestone"
              disabled={goals.length === 0}
            >
              <Plus size={12} />
            </button>
          </div>

          {showMilestoneCreate && (
            <form className="wp-ms-create" onSubmit={event => void createMilestone(event)}>
              <Plus size={12} />
              <input
                autoFocus
                value={newMilestoneText}
                onChange={event => setNewMilestoneText(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') setShowMilestoneCreate(false) }}
                placeholder={goals.length ? 'New milestone...' : 'Create a goal first'}
                disabled={goals.length === 0}
              />
              <select value={newMilestoneGoalId} onChange={event => setNewMilestoneGoalId(event.target.value)} disabled={goals.length === 0}>
                {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.alias || goal.text}</option>)}
              </select>
              <input
                type="date"
                value={newMilestoneDate}
                onChange={event => setNewMilestoneDate(event.target.value)}
                disabled={goals.length === 0}
              />
            </form>
          )}

          <div className="wp-viewbar">
            <label className="wp-view-pill">
              <FunnelSimple size={11} />
              <span>Group</span>
              <select value={groupBy} onChange={event => setGroupBy(event.target.value as GroupBy)}>
                <option value="milestone">Milestone</option>
                <option value="goal">Goal</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="wp-view-pill">
              <span>Filter</span>
              <select value={attributeFilter} onChange={event => setAttributeFilter(event.target.value as AttributeFilter)}>
                <option value="all">All</option>
                <option value="must_do">Must-do</option>
                <option value="waiting">Waiting</option>
                <option value="crm">CRM linked</option>
                <option value="unlinked">Unlinked</option>
              </select>
            </label>
            <label className="wp-view-pill">
              <span>Milestone</span>
              <select value={milestoneFilter} onChange={event => setMilestoneFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="__none__">No milestone</option>
                {milestones.map(milestone => <option key={milestone.id} value={milestone.id}>{milestone.text}</option>)}
              </select>
            </label>
            <label className="wp-view-pill">
              <span>Sort</span>
              <select value={sortBy} onChange={event => setSortBy(event.target.value as SortBy)}>
                <option value="created_desc">Newest</option>
                <option value="created_asc">Oldest</option>
                <option value="milestone_due">Milestone due</option>
                <option value="return_date">Return date</option>
                <option value="text">Text</option>
              </select>
            </label>
            <button className="wp-view-reset" type="button" onClick={() => { setAttributeFilter('all'); setMilestoneFilter('all'); setGroupBy('milestone'); setSortBy('created_desc') }}>
              <X size={10} /> Reset
            </button>
          </div>

          <div className="wp-backlog-scroll">
            {backlogGroups.length === 0 ? (
              <div className="tp-bl-empty">
                <span>No backlog todos.</span>
                <small>Add one above or drag a scheduled block here.</small>
              </div>
            ) : backlogGroups.map(group => (
              <section key={`${group.kind}:${group.key}`} className="wp-group">
                <div className="wp-group-hd" style={{ '--group-color': group.color } as CSSProperties}>
                  {group.key === '__none__' || group.kind === 'none' ? (
                    <span className="wp-color-dot" />
                  ) : (
                    <label className="wp-color-dot editable" title="Change group color">
                      <input type="color" value={group.color} onChange={event => void updateGroupColor(group, event.target.value)} />
                    </label>
                  )}
                  <span className="wp-group-title">{group.label}</span>
                  <span className="wp-group-count">{group.todos.length}</span>
                  {group.kind === 'milestone' && group.milestoneId && milestonesMap.has(group.milestoneId) && (
                    <button
                      className="wp-group-delete"
                      title="Delete milestone"
                      onClick={() => void archiveMilestone(milestonesMap.get(group.milestoneId as string)!)}
                    >
                      <Trash size={11} />
                    </button>
                  )}
                  <button
                    className="wp-group-add"
                    title="Add todo to this group"
                    onClick={() => setOpenAddGroup(openAddGroup === `${group.kind}:${group.key}` ? null : `${group.kind}:${group.key}`)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {openAddGroup === `${group.kind}:${group.key}` && (
                  <form
                    className="wp-inline-add"
                    onSubmit={event => addBacklogTodo(event, { milestoneId: group.milestoneId, goalId: group.goalId, groupKey: `${group.kind}:${group.key}` })}
                  >
                    <Plus size={12} />
                    <input
                      autoFocus
                      value={groupDrafts[`${group.kind}:${group.key}`] ?? ''}
                      onChange={event => setGroupDrafts(prev => ({ ...prev, [`${group.kind}:${group.key}`]: event.target.value }))}
                      onKeyDown={event => { if (event.key === 'Escape') setOpenAddGroup(null) }}
                      placeholder="New todo..."
                    />
                  </form>
                )}
                {group.todos.map(todo => renderTodoRow(todo))}
              </section>
            ))}
          </div>
        </aside>

        <div className="wp-resizer" onPointerDown={startSplitResize} />

        <section className="wp-calendar" aria-label="Weekly calendar">
          <div className="wp-calendar-head">
            <div className="wp-time-head" />
            {weekDates.map(date => {
              const dayTodos = todosByDate.get(date) ?? []
              const planned = dayTodos.filter(todo => !hasSchedule(todo))
              return (
                <div
                  key={date}
                  className={`wp-day-head${date === today ? ' today' : ''}${dropDate === date ? ' dropping' : ''}`}
                  onDragOver={event => {
                    if (!canAcceptTodoDrag(event.dataTransfer)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropDate(date)
                  }}
                  onDragLeave={() => setDropDate(current => current === date ? null : current)}
                  onDrop={event => {
                    event.preventDefault()
                    setDropDate(null)
                    const id = activeDragId(event.dataTransfer)
                    if (id) void scheduleTodo(id, date, null, null)
                    endDrag()
                  }}
                >
                  <div className="wp-day-head-top">
                    <div>
                      <strong>{formatDayName(date)}</strong>
                      <span>{formatShortDate(date)}</span>
                    </div>
                    <button
                      className="wp-day-zoom-btn"
                      type="button"
                      onClick={event => {
                        event.stopPropagation()
                        openDayZoom(date)
                      }}
                      title="Open day zoom"
                      aria-label={`Open ${formatDayName(date)} zoom`}
                    >
                      <ArrowsOutSimple size={12} />
                    </button>
                  </div>
                  {planned.length > 0 && (
                    <div className="wp-planned">
                      {planned.map(todo => renderTodoRow(todo, 'planned'))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="wp-calendar-scroll">
            <div className="wp-grid" style={{ height: `${gridHeight}px` }}>
              <div className="wp-hours" aria-hidden>
                {hours.map(hour => (
                  <div key={hour} className="wp-hour" style={{ top: `${(hour - DAY_START) * PX_PER_MINUTE}px` }}>
                    <span>{formatClock(hour)}</span>
                  </div>
                ))}
              </div>
              <div className="wp-days">
                {weekDates.map(date => {
                  const dayTodos = todosByDate.get(date) ?? []
                  const blocks = layoutBlocks(dayTodos)
                  const overMinute = dropMinute[date]
                  return (
                    <div
                      key={date}
                      ref={node => { dayGridRefs.current[date] = node }}
                      className={`wp-day-grid${overMinute != null ? ' dropping' : ''}`}
                      onDragOver={event => {
                        if (!canAcceptTodoDrag(event.dataTransfer)) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        setDropMinute(prev => ({ ...prev, [date]: minutesFromPoint(event.clientY, dayGridRefs.current[date]) }))
                      }}
                      onDragLeave={() => setDropMinute(prev => ({ ...prev, [date]: null }))}
                      onDrop={event => {
                        event.preventDefault()
                        const id = activeDragId(event.dataTransfer)
                        const start = minutesFromPoint(event.clientY, dayGridRefs.current[date])
                        setDropMinute(prev => ({ ...prev, [date]: null }))
                        if (id) void scheduleTodo(id, date, start, DEFAULT_DURATION)
                        endDrag()
                      }}
                    >
                      {overMinute != null && (
                        <div className="tp-dropline wp-dropline" style={{ top: `${(overMinute - DAY_START) * PX_PER_MINUTE}px` }}>
                          <span className="lab">{formatClock(overMinute)}</span>
                        </div>
                      )}
                      {blocks.map(({ todo, start, duration, col, cols }) => {
                        const mentions = resolveMentions(todo)
                        const accent = colorForTodo(todo)
                        const width = `calc(${100 / cols}% - 4px)`
                        const left = `calc(${(100 / cols) * col}% + 2px)`
                        return (
                          <TodoPreviewTarget
                            as="article"
                            key={todo.id}
                            todo={todo}
                            mentions={mentions}
                            mentionOptions={mentionOptions}
                            scheduleLabel={`${formatClock(start)} - ${formatClock(start + duration)}`}
                            className={`tp-block todo wp-block${todo.completed ? ' done' : ''}${duration <= 30 ? ' compact' : ''}${interaction?.id === todo.id ? ' moving' : ''}`}
                            style={{
                              '--block-accent': accent,
                              top: `${(start - DAY_START) * PX_PER_MINUTE}px`,
                              height: `${Math.max(28, duration * PX_PER_MINUTE - 3)}px`,
                              left,
                              width,
                            } as CSSProperties}
                            draggable={!todo.completed}
                            onDragStart={event => startDrag(todo, event)}
                            onDragEnd={endDrag}
                            onPointerDown={event => startBlockInteraction('move', todo, event)}
                          >
                            <button className={`tp-check${todo.completed ? ' on' : ''}`} onPointerDown={event => event.stopPropagation()} onClick={() => void toggleTodo(todo.id)} title={todo.completed ? 'Mark active' : 'Mark complete'}>
                              {todo.completed && <Check size={8} weight="bold" />}
                            </button>
                            <div className="bl-body" onPointerDown={event => event.stopPropagation()}>
                              <span className="bl-time">{formatClock(start)} - {formatClock(start + duration)}</span>
                              <EditableTodoText
                                todo={todo}
                                mentions={mentions}
                                mentionOptions={mentionOptions}
                                milestoneOptions={milestoneOptions}
                                className="bl-title"
                                onEditText={editTodoText}
                                onCreateMention={createMention}
                                onChangeMilestone={changeTodoMilestone}
                              />
                              {todo.milestone_id && <span className="bl-sub">{milestonesMap.get(todo.milestone_id)?.text}</span>}
                            </div>
                            <span className="bl-acts" onPointerDown={event => event.stopPropagation()}>
                              <button className={todo.must_do ? 'on' : ''} onClick={() => void toggleMustDo(todo.id)} title={todo.must_do ? 'Must-do' : 'Mark must-do'}>
                                <Star size={10} weight={todo.must_do ? 'fill' : 'regular'} />
                              </button>
                              <button onClick={() => void moveToBacklog(todo.id)} title="Move to backlog">
                                <ArrowBendUpLeft size={10} />
                              </button>
                              <button onClick={() => void deleteTodo(todo.id)} title="Delete todo">
                                <Trash size={10} />
                              </button>
                              <span className="wp-block-grip" draggable onDragStart={event => startDrag(todo, event)} onDragEnd={endDrag} onPointerDown={event => event.stopPropagation()} title="Drag to another day">
                                <DotsSixVertical size={11} />
                              </span>
                            </span>
                            <span className="tp-resize" onPointerDown={event => startBlockInteraction('resize', todo, event)} />
                          </TodoPreviewTarget>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {zoomDate && (
        <div className="wp-zoom-scrim" role="presentation">
          <section className="wp-zoom-modal" role="dialog" aria-modal="true" aria-label={`${formatDayName(zoomDate)} day planner`}>
            <header className="wp-zoom-hd">
              <div>
                <span>Day zoom</span>
                <h2>{formatDayName(zoomDate)} · {formatShortDate(zoomDate)}</h2>
              </div>
              <div className="wp-zoom-actions">
                <button
                  className="wp-zoom-secondary"
                  type="button"
                  onClick={() => {
                    setZoomDate(null)
                    setZoomDrafts({})
                    zoomDraftsRef.current = {}
                  }}
                >
                  Cancel
                </button>
                <button className="wp-zoom-primary" type="button" onClick={() => void commitDayZoom()}>
                  <Check size={12} weight="bold" />
                  OK
                </button>
                <button
                  className="wp-icon-btn"
                  type="button"
                  onClick={() => {
                    setZoomDate(null)
                    setZoomDrafts({})
                    zoomDraftsRef.current = {}
                  }}
                  title="Close"
                  aria-label="Close day zoom"
                >
                  <X size={12} />
                </button>
              </div>
            </header>

            <div className="wp-zoom-board">
              <section
                className="wp-zoom-tray"
                data-zoom-unscheduled="true"
                onDragOver={event => {
                  if (!canAcceptTodoDrag(event.dataTransfer)) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={event => {
                  event.preventDefault()
                  const id = activeDragId(event.dataTransfer)
                  if (id) draftZoomSchedule(id, null)
                  endDrag()
                }}
              >
                <div className="wp-zoom-section-title">
                  <span>No time</span>
                  <small>{zoomPlanned.length}</small>
                </div>
                <div className="wp-zoom-list">
                  {zoomPlanned.length ? zoomPlanned.map(renderZoomTodoRow) : (
                    <div className="wp-zoom-empty">Drop here to keep it on the day without an hour.</div>
                  )}
                </div>
              </section>

              <section className="wp-zoom-slots" aria-label="Hour slots">
                {zoomHours.map(hour => {
                  const slotTodos = zoomScheduled.filter(todo => {
                    const start = todo.scheduled_start_minutes ?? DAY_START
                    return start >= hour && start < hour + 60
                  })
                  return (
                    <div
                      key={hour}
                      data-zoom-hour={hour}
                      className={`wp-zoom-slot${zoomDropMinute === hour ? ' dropping' : ''}${slotTodos.length ? ' filled' : ''}`}
                      onDragOver={event => {
                        if (!canAcceptTodoDrag(event.dataTransfer)) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        setZoomDropMinute(hour)
                        setZoomDropPreview({ type: 'slot', hour, start: hour, duration: DEFAULT_DURATION })
                      }}
                      onDragLeave={() => {
                        setZoomDropMinute(current => current === hour ? null : current)
                        setZoomDropPreview(current => current?.type === 'slot' && current.hour === hour ? null : current)
                      }}
                      onDrop={event => {
                        event.preventDefault()
                        const id = activeDragId(event.dataTransfer)
                        setZoomDropMinute(null)
                        setZoomDropPreview(null)
                        if (id) draftZoomSchedule(id, hour, DEFAULT_DURATION)
                        endDrag()
                      }}
                    >
                      <div className="wp-zoom-slot-time">
                        <span>{formatClock(hour)}</span>
                      </div>
                      <div
                        className="wp-zoom-slot-body"
                        onClick={event => {
                          const target = event.target as HTMLElement
                          if (target.closest('.wp-zoom-slot-card, .wp-zoom-slot-new, button, input, textarea, select, a, [contenteditable="true"]')) return
                          const rect = event.currentTarget.getBoundingClientRect()
                          const rawStart = hour + ((event.clientY - rect.top) / Math.max(1, rect.height)) * 60
                          const start = clamp(snap(rawStart), hour, Math.min(hour + 45, DAY_END - DEFAULT_DURATION))
                          setOpenZoomSlotAdd({ hour, start })
                        }}
                      >
                        {zoomDropPreview?.type === 'slot' && zoomDropPreview.hour === hour && (
                          <>
                            <div
                              className="wp-zoom-slot-line"
                              style={{ top: `${((zoomDropPreview.start - hour) / 60) * 100}%` }}
                            >
                              <span>{formatClock(zoomDropPreview.start)}</span>
                            </div>
                            <div
                              className="wp-zoom-slot-line end"
                              style={{ top: `${((zoomDropPreview.start + zoomDropPreview.duration - hour) / 60) * 100}%` }}
                            >
                              <span>{formatClock(zoomDropPreview.start + zoomDropPreview.duration)}</span>
                            </div>
                          </>
                        )}
                        {openZoomSlotAdd?.hour === hour && (
                          <div className="wp-zoom-slot-new" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
                            <Plus size={11} />
                            <MentionEditor
                              key={`${openZoomSlotAdd.hour}:${openZoomSlotAdd.start}`}
                              autoFocus
                              initialSegments={[]}
                              mentionOptions={mentionOptions}
                              milestoneOptions={milestoneOptions}
                              currentMilestoneId={zoomSlotMilestones[openZoomSlotAdd.start] ?? null}
                              placeholder={`New todo at ${formatClock(openZoomSlotAdd.start)}...`}
                              onCommit={segments => { void commitZoomSlotTodo(segments, openZoomSlotAdd) }}
                              onCancel={() => setOpenZoomSlotAdd(null)}
                              onOpenMention={() => {}}
                              onCreateMention={createMention}
                              onSelectMilestone={milestoneId => setZoomSlotMilestones(prev => ({ ...prev, [openZoomSlotAdd.start]: milestoneId }))}
                            />
                          </div>
                        )}
                        {slotTodos.map(todo => {
                          const mentions = resolveMentions(todo)
                          const accent = colorForTodo(todo)
                          const start = todo.scheduled_start_minutes as number
                          const duration = todo.scheduled_duration_minutes as number
                          return (
                            <TodoPreviewTarget
                              as="article"
                              key={todo.id}
                              todo={todo}
                              mentions={mentions}
                              mentionOptions={mentionOptions}
                              scheduleLabel={`${formatClock(start)} - ${formatClock(start + duration)}`}
                              className={`tp-block todo wp-zoom-slot-card${todo.completed ? ' done' : ''}${zoomPointerDrag?.id === todo.id ? ' dragging' : ''}`}
                              style={{ '--block-accent': accent } as CSSProperties}
                              draggable={false}
                              onPointerDown={event => startZoomPointerDrag(todo, event)}
                            >
                              <button className={`tp-check${todo.completed ? ' on' : ''}`} onPointerDown={event => event.stopPropagation()} onClick={() => void toggleTodo(todo.id)} title={todo.completed ? 'Mark active' : 'Mark complete'}>
                                {todo.completed && <Check size={8} weight="bold" />}
                              </button>
                              <div className="bl-body">
                                <span className="bl-time">{formatClock(start)} - {formatClock(start + duration)}</span>
                                <EditableTodoText
                                  todo={todo}
                                  mentions={mentions}
                                  mentionOptions={mentionOptions}
                                  milestoneOptions={milestoneOptions}
                                  className="bl-title"
                                  onEditText={editTodoText}
                                  onCreateMention={createMention}
                                  onChangeMilestone={changeTodoMilestone}
                                />
                              </div>
                              <span className="bl-acts" onPointerDown={event => event.stopPropagation()}>
                                <button onClick={() => resizeZoomDuration(todo, -SNAP)} title="Shorten 15 min">-</button>
                                <button onClick={() => resizeZoomDuration(todo, SNAP)} title="Extend 15 min">+</button>
                                <button onClick={() => draftZoomSchedule(todo.id, null)} title="Remove hour">
                                  <ArrowBendUpLeft size={10} />
                                </button>
                                <span className="wp-block-grip" onPointerDown={event => startZoomPointerDrag(todo, event)} title="Drag to another slot">
                                  <DotsSixVertical size={11} />
                                </span>
                              </span>
                            </TodoPreviewTarget>
                          )
                        })}
                        {openZoomSlotAdd?.hour !== hour && (
                          <button
                            className={`wp-zoom-empty-add${slotTodos.length ? ' after-cards' : ''}`}
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              const rect = event.currentTarget.closest<HTMLElement>('.wp-zoom-slot-body')?.getBoundingClientRect()
                              const rawStart = rect ? hour + ((event.clientY - rect.top) / Math.max(1, rect.height)) * 60 : hour
                              const start = clamp(snap(rawStart), hour, Math.min(hour + 45, DAY_END - DEFAULT_DURATION))
                              setOpenZoomSlotAdd({ hour, start })
                            }}
                            title="Add todo here"
                            aria-label={`Add todo at ${formatClock(hour)}`}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            </div>
          </section>
          {zoomPointerDrag && (
            <div
              className="wp-zoom-drag-ghost"
              style={{ left: zoomPointerDrag.x + 12, top: zoomPointerDrag.y + 12 } as CSSProperties}
            >
              {(() => {
                const todo = zoomTodos.find(item => item.id === zoomPointerDrag.id) ?? todos.find(item => item.id === zoomPointerDrag.id) ?? backlog.find(item => item.id === zoomPointerDrag.id)
                return todo ? textFromTodo(todo) : 'Todo'
              })()}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
