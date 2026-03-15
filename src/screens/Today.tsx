import { useState, useEffect, useRef } from 'react'
import {
  Lightning, Check, Play, Pause, Stop,
  Timer, CalendarBlank, SidebarSimple,
  Flame, TrashSimple, NotePencil, GearSix,
  TextB, TextItalic, TextStrikethrough, DotsSixVertical,
  X, ListBullets, ListNumbers,
} from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Todo, Habit, HabitLog, Review, Milestone, Goal, LeadingIndicator, IndicatorDailyLog } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useHabitNotifications } from '@/hooks/useHabitNotifications'
import StreakCelebration from '@/components/StreakCelebration'
import EndOfDayDrawer from '@/components/EndOfDayDrawer'

const FOCUS_DURATIONS = [
  { label: '25', minutes: 25, desc: 'Pomodoro' },
  { label: '52', minutes: 52, desc: 'Ultradian' },
  { label: '90', minutes: 90, desc: 'Deep Work' },
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/** Simple markdown → HTML renderer (no external lib). XSS-safe: HTML escapes first. */
function renderMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/^# (.+)$/gm, '<div class="font-semibold text-burnham text-sm mt-2 mb-0.5">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="font-medium text-burnham text-xs mt-1.5">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<div class="ml-3 before:content-[\'·\'] before:mr-1.5 before:text-shuttle">$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-1.5 items-start"><span class="font-mono text-shuttle/40 shrink-0 text-[10px] pt-px">$1.</span><span>$2</span></div>')
    .replace(/\n/g, '<br>')
}

/** Wrap textarea selection in markdown syntax markers. */
function wrapSelection(
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const selected = value.slice(s, e)
  const newValue = value.slice(0, s) + before + selected + after + value.slice(e)
  onChange(newValue)
  setTimeout(() => {
    ta.setSelectionRange(s + before.length, e + before.length)
    ta.focus()
  }, 0)
}

/** Local YYYY-MM-DD (avoids UTC offset shifting date at night) */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SortableTodoRowProps {
  todo: Todo
  goal: Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'> | null | undefined
  isEditing: boolean
  editingText: string
  onEditStart: () => void
  onEditChange: (text: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onToggle: () => void
  onDelete: () => void
}

function SortableTodoRow({ todo, goal, isEditing, editingText, onEditStart, onEditChange, onEditSave, onEditCancel, onToggle, onDelete }: SortableTodoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-2 py-1.5 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-25 hover:!opacity-60 cursor-grab active:cursor-grabbing text-shuttle shrink-0 transition-opacity touch-none"
        title="Drag to reorder"
      >
        <DotsSixVertical size={13} />
      </div>
      <input
        type="checkbox"
        className="custom-checkbox shrink-0"
        checked={false}
        onChange={onToggle}
      />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditing ? (
          <input
            autoFocus
            className="flex-1 text-sm font-medium text-burnham bg-transparent border-b border-burnham focus:outline-none"
            value={editingText}
            onChange={e => onEditChange(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={e => {
              if (e.key === 'Enter') onEditSave()
              if (e.key === 'Escape') onEditCancel()
            }}
          />
        ) : (
          <span
            className="text-[13px] font-medium text-burnham truncate cursor-text flex-1"
            onClick={onEditStart}
          >
            {todo.text}
          </span>
        )}
        {goal && (
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 leading-none"
            style={{
              backgroundColor: goal.color ? `${goal.color}25` : '#E5F9BD',
              color: goal.color ?? '#003720',
              border: `1px solid ${goal.color ? `${goal.color}40` : '#79D65E40'}`,
            }}
          >
            {goal.emoji ? `${goal.emoji} ` : ''}{goal.alias ?? goal.text.slice(0, 6)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {todo.block && (
          <span className="text-[9px] font-mono text-shuttle/40">{todo.block}</span>
        )}
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded"
        >
          <TrashSimple size={12} />
        </button>
      </div>
    </div>
  )
}

export default function Today() {
  const today = localDate()
  const tomorrow = localDate(new Date(new Date().getTime() + 86400000))
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = localDate(yesterdayDate)

  const startOfWeek = (() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return localDate(monday)
  })()

  // Data
  const [todos, setTodos] = useState<Todo[]>([])
  const [yesterdayTodos, setYesterdayTodos] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [recentLogs, setRecentLogs] = useState<HabitLog[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [tomorrowReview, setTomorrowReview] = useState<Review | null>(null)
  const [goals, setGoals] = useState<Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)

  // Leading Indicators
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [indicatorLogs, setIndicatorLogs] = useState<IndicatorDailyLog[]>([])
  const [weekIndicatorLogs, setWeekIndicatorLogs] = useState<IndicatorDailyLog[]>([])
  const [liPanelOpen, setLiPanelOpen] = useState(false)
  const [liDraftValues, setLiDraftValues] = useState<Record<string, string>>({})

  // Add task
  const [newTask, setNewTask] = useState('')
  const [todoBlock, setTodoBlock] = useState<'AM' | 'PM' | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Inline edit todo
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')

  // Autosave refs
  const journalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onethingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local autosave values
  const [journalValue, setJournalValue] = useState('')
  const [onethingValue, setOnethingValue] = useState('')
  const [journalEditing, setJournalEditing] = useState(false)
  const journalRef = useRef<HTMLTextAreaElement>(null)

  // Day State Machine
  const [dayStartedLocal, setDayStartedLocal] = useState(() =>
    localStorage.getItem(`day_started_${localDate()}`) === 'true'
  )

  type DayState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  const getDayState = (rev: Review | null): DayState => {
    if (rev?.tomorrow_reviewed) return 'COMPLETED'
    if (dayStartedLocal) return 'IN_PROGRESS'
    return 'NOT_STARTED'
  }
  const dayState: DayState | null = dataLoaded ? getDayState(review) : null

  // Mandatory objective draft
  const [objectiveDraft, setObjectiveDraft] = useState('')

  // Pomodoro settings panel
  const [showPomSettings, setShowPomSettings] = useState(false)

  // End of day
  const [showEndOfDay, setShowEndOfDay] = useState(false)

  // Streak celebration
  const [celebrationStreak, setCelebrationStreak] = useState<{ habit: Habit; streak: number } | null>(null)

  // Calendar dialog
  const [calendarDialogHabitId, setCalendarDialogHabitId] = useState<string | null>(null)
  const [calWhen, setCalWhen] = useState('tomorrow')
  const [calTime, setCalTime] = useState('09:00')
  const [calDuration, setCalDuration] = useState('30')
  const [calSaving, setCalSaving] = useState(false)
  const [calToast, setCalToast] = useState<string | null>(null)
  const calToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus timer
  const [timerDuration, setTimerDuration] = useState(25)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerGoalId, setTimerGoalId] = useState<string | null>(null)
  const [timerComplete, setTimerComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [habitDrawerOpen, setHabitDrawerOpen] = useState(false)
  const [habitsCollapsed, setHabitsCollapsed] = useState(false)
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null)
  const [milestonesOpen, setMilestonesOpen] = useState(false)

  // QUANTIFIED habit inline editing
  const [editingQuantifiedHabitId, setEditingQuantifiedHabitId] = useState<string | null>(null)
  const [quantifiedInputValue, setQuantifiedInputValue] = useState('')

  // Quick-add overlay (⌘N — works from anywhere)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')
  const quickAddRef = useRef<HTMLInputElement>(null)

  // Pomodoro Enhanced (Sprint 16)
  const [timerIntention, setTimerIntention] = useState('')
  const [showIntentionInput, setShowIntentionInput] = useState(false)
  const [timerHabitId, setTimerHabitId] = useState<string | null>(null)
  const [ambientSound, setAmbientSound] = useState<'brown' | 'rain' | 'none'>('none')
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useHabitNotifications(habits, logs, today)

  useKeyboardShortcuts({
    'cmd+b': () => setSidebarOpen(p => !p),
    'cmd+.': () => setSidebarOpen(p => !p),
    'cmd+n': () => setQuickAddOpen(true),
    'cmd+e': () => setShowEndOfDay(true),
    'cmd+h': () => setHabitDrawerOpen(v => !v),
    'cmd+l': () => {
      const drafts: Record<string, string> = {}
      indicators.filter(ind => !ind.habit_id).forEach(ind => {
        const todayLog = indicatorLogs.find(l => l.leading_indicator_id === ind.id)
        drafts[ind.id] = todayLog ? String(todayLog.value) : ''
      })
      setLiDraftValues(drafts)
      setLiPanelOpen(true)
    },
  })

  // Space → play/pause; 1-9 → mark habit in drawer; Escape → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true'

      if (e.key === 'Escape') {
        if (liPanelOpen) { setLiPanelOpen(false); return }
        if (habitDrawerOpen) { setHabitDrawerOpen(false); return }
        if (showEndOfDay) { setShowEndOfDay(false); return }
      }

      if ((e.key === 'm' || e.key === 'M') && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setMilestonesOpen(v => !v)
        return
      }

      if (habitDrawerOpen && !inInput && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        const pending = habits.filter(h => !isHabitDone(h))
        if (pending[idx]) {
          toggleHabit(pending[idx].id)
          if (pending.length <= 1) setHabitDrawerOpen(false)
        }
        return
      }

      if (e.key === ' ' && !inInput && !timerComplete) {
        e.preventDefault()
        if (timerRunning) pauseTimer()
        else if (timerElapsed === 0) setShowIntentionInput(true)
        else setTimerRunning(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [timerRunning, timerComplete, timerElapsed, showEndOfDay, habitDrawerOpen, liPanelOpen, habits, logs])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyAgoStr = localDate(thirtyDaysAgo)

      const [todosRes, yesterdayTodosRes, habitsRes, logsRes, recentLogsRes, reviewRes, goalsRes, milestonesRes, tomorrowRes, indicatorsRes, indicatorLogsRes, weekLogsRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id)
          .or(`date.is.null,date.eq.${today}`).order('sort_order', { ascending: true }),
        supabase.from('todos').select('*').eq('user_id', user.id)
          .lt('date', today).eq('completed', false).order('date', { ascending: false }),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('habit_logs').select('*').eq('user_id', user.id)
          .gte('log_date', thirtyAgoStr).order('log_date', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE'),
        supabase.from('milestones').select('*').eq('user_id', user.id)
          .or(`target_date.is.null,target_date.gte.${today}`).order('target_date', { nullsFirst: true }),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', tomorrow).maybeSingle(),
        supabase.from('leading_indicators').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('indicator_daily_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('indicator_daily_logs').select('*').eq('user_id', user.id).gte('log_date', startOfWeek).lte('log_date', today),
      ])
      setTodos(todosRes.data ?? [])
      setYesterdayTodos(yesterdayTodosRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setRecentLogs(recentLogsRes.data ?? [])
      setReview(reviewRes.data)
      setTomorrowReview(tomorrowRes.data ?? null)
      setGoals(goalsRes.data ?? [])
      setMilestones((milestonesRes.data ?? []).slice(0, 10))
      setIndicators(indicatorsRes.data ?? [])
      setIndicatorLogs(indicatorLogsRes.data ?? [])
      setWeekIndicatorLogs(weekLogsRes.data ?? [])
      setDataLoaded(true)
    }
    load()
  }, [today])

  useEffect(() => { setJournalValue(review?.notes ?? '') }, [review?.notes])
  useEffect(() => {
    const val = review?.one_thing ?? ''
    setOnethingValue(val)
    if (val && !objectiveDraft) setObjectiveDraft(val) // pre-fill drawer if set from yesterday
  }, [review?.one_thing])

  // Focus timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerElapsed(e => {
          const next = e + 1
          if (next >= timerDuration * 60) {
            setTimerRunning(false)
            setTimerComplete(true)
            if (timerRef.current) clearInterval(timerRef.current)
          }
          return Math.min(next, timerDuration * 60)
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning, timerDuration])

  // Ambient sound
  useEffect(() => {
    if (timerRunning && ambientSound !== 'none') {
      const audio = new Audio(`/sounds/${ambientSound}-noise.mp3`)
      audio.loop = true
      audio.volume = 0.25
      audioRef.current = audio
      audio.play().catch(() => {})
    } else {
      audioRef.current?.pause()
      audioRef.current = null
    }
    return () => { audioRef.current?.pause(); audioRef.current = null }
  }, [timerRunning, ambientSound])

  // Cleanup
  useEffect(() => {
    return () => {
      if (journalTimerRef.current) clearTimeout(journalTimerRef.current)
      if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
    }
  }, [])

  // Global shortcut ⌘⇧Space — Rust calls window.rethinkFocusQuickAdd()
  useEffect(() => {
    (window as Window & { rethinkFocusQuickAdd?: () => void }).rethinkFocusQuickAdd = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    return () => {
      delete (window as Window & { rethinkFocusQuickAdd?: () => void }).rethinkFocusQuickAdd
    }
  }, [])

  const handleJournalChange = (value: string) => {
    setJournalValue(value)
    if (journalTimerRef.current) clearTimeout(journalTimerRef.current)
    journalTimerRef.current = setTimeout(() => upsertReview({ notes: value }), 800)
  }

  const handleOnethingChange = (value: string) => {
    setOnethingValue(value)
    if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
    onethingTimerRef.current = setTimeout(() => upsertReview({ one_thing: value }), 800)
  }

  // Computed
  const pendingTodos = todos.filter(t => !t.completed)
  const doneTodos = todos.filter(t => t.completed)
  const pendingMilestones = milestones.filter(m => m.status !== 'COMPLETE')
  const doneMilestones = milestones.filter(m => m.status === 'COMPLETE')

  // BINARY / QUANTIFIED habit helpers
  const isHabitDone = (habit: Habit): boolean => {
    const log = logs.find(l => l.habit_id === habit.id)
    if (!log) return false
    if (habit.habit_type === 'QUANTIFIED' && habit.daily_target) {
      return log.value >= habit.daily_target
    }
    return log.value === 1
  }

  const doneHabits = habits.filter(h => isHabitDone(h))
  const pendingHabits = habits.filter(h => !isHabitDone(h))

  const todosProgress = todos.length > 0 ? Math.round((doneTodos.length / todos.length) * 100) : 0
  const habitsProgress = habits.length > 0 ? Math.round((doneHabits.length / habits.length) * 100) : 0
  const milestonesProgress = milestones.length > 0 ? Math.round((doneMilestones.length / milestones.length) * 100) : 0

  // Streak per habit
  const getStreak = (habitId: string): number => {
    const habitLogs = recentLogs
      .filter(l => l.habit_id === habitId)
      .sort((a, b) => b.log_date.localeCompare(a.log_date))

    let streak = 0
    const checkDate = new Date()
    const todayLogged = habitLogs.some(l => l.log_date === today && l.value === 1)
    if (!todayLogged) checkDate.setDate(checkDate.getDate() - 1)

    for (const log of habitLogs) {
      const logDate = log.log_date
      const expected = localDate(checkDate)
      if (logDate === expected && log.value === 1) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else if (logDate < expected) {
        break
      }
    }
    return streak
  }

  // Habit adherence %
  const getAdherence = (habitId: string): number => {
    const daysElapsed = new Date().getDate()
    if (daysElapsed === 0) return 0
    const currentYearMonth = today.slice(0, 7)
    const monthLogs = recentLogs.filter(l =>
      l.habit_id === habitId &&
      l.log_date.startsWith(currentYearMonth) &&
      l.value === 1
    )
    return Math.round((monthLogs.length / daysElapsed) * 100)
  }

  const toggleTodo = async (id: string) => {
    if (!userId) return
    const t = todos.find(t => t.id === id)
    if (!t) return
    const newVal = !t.completed
    await supabase.from('todos').update({ completed: newVal }).eq('id', id).eq('user_id', userId)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newVal } : t))
  }

  const toggleMilestone = async (id: string) => {
    if (!userId) return
    const m = milestones.find(m => m.id === id)
    if (!m) return
    const newStatus = m.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
    await supabase.from('milestones').update({ status: newStatus }).eq('id', id).eq('user_id', userId)
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m))
  }

  const toggleHabit = async (habitId: string) => {
    if (!userId) return
    const existing = logs.find(l => l.habit_id === habitId && l.log_date === today)
    let justCompleted = false
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      const { error } = await supabase.from('habit_logs')
        .update({ value: newVal })
        .eq('id', existing.id)
        .eq('user_id', userId)
      if (error) { console.error('toggleHabit update failed:', error); return }
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
      justCompleted = newVal === 1
    } else {
      const { data, error } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: 1 })
        .select().single()
      if (error) { console.error('toggleHabit insert failed:', error); return }
      if (data) setLogs(prev => [...prev, data])
      justCompleted = true
    }

    if (justCompleted) {
      const streak = getStreak(habitId) + 1
      const MILESTONE_STREAKS = [7, 30, 100, 365]
      if (MILESTONE_STREAKS.includes(streak)) {
        const habit = habits.find(h => h.id === habitId)
        if (habit) setCelebrationStreak({ habit, streak })
      }
    }
  }

  const logHabitValue = async (habitId: string, value: number) => {
    if (!userId) return
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const existing = logs.find(l => l.habit_id === habitId && l.log_date === today)
    if (existing) {
      const { data, error } = await supabase.from('habit_logs')
        .update({ value })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select().single()
      if (error || !data) return
      setLogs(prev => prev.map(l => l.id === existing.id ? data : l))
    } else {
      const { data, error } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value })
        .select().single()
      if (error || !data) return
      setLogs(prev => [...prev, data])
    }
  }

  const saveIndicatorLogs = async () => {
    if (!userId) return
    const manualIndicators = indicators.filter(ind => !ind.habit_id)
    await Promise.all(manualIndicators.map(async ind => {
      const val = parseFloat(liDraftValues[ind.id] ?? '')
      if (isNaN(val)) return
      const { data } = await supabase.from('indicator_daily_logs')
        .upsert(
          { user_id: userId, leading_indicator_id: ind.id, log_date: today, value: val },
          { onConflict: 'user_id,leading_indicator_id,log_date' }
        )
        .select().single()
      if (data) {
        setIndicatorLogs(prev => {
          const idx = prev.findIndex(l => l.leading_indicator_id === ind.id)
          return idx >= 0 ? prev.map(l => l.leading_indicator_id === ind.id ? data : l) : [...prev, data]
        })
        setWeekIndicatorLogs(prev => {
          const idx = prev.findIndex(l => l.leading_indicator_id === ind.id && l.log_date === today)
          return idx >= 0 ? prev.map(l => l.leading_indicator_id === ind.id && l.log_date === today ? data : l) : [...prev, data]
        })
      }
    }))
    setLiPanelOpen(false)
  }

  // Core todo submission (used by inline input and quick-add overlay)
  const submitTodo = async (rawText: string, blockOverride?: 'AM' | 'PM' | null) => {
    if (!rawText.trim() || !userId) return
    let text = rawText.trim()
    let goalId = selectedGoalId
    let block: 'AM' | 'PM' | null = blockOverride !== undefined ? blockOverride : todoBlock

    const blockMatch = text.match(/\/\s*(am|pm)\b/i)
    if (blockMatch) {
      block = blockMatch[1].toUpperCase() as 'AM' | 'PM'
      text = text.replace(blockMatch[0], '').trim()
    }

    if (!goalId) {
      const goalMatch = text.match(/@(\S+)/)
      if (goalMatch) {
        const match = goals.find(g => g.text.toLowerCase().includes(goalMatch[1].toLowerCase()))
        if (match) goalId = match.id
      }
    }

    text = text.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim()
    if (!text) return

    const { data } = await supabase.from('todos')
      .insert({ text, user_id: userId, effort: 'NORMAL', date: today, block, goal_id: goalId })
      .select().single()
    if (data) setTodos(prev => [...prev, data])
  }

  // Parse @goal and /am /pm inline from input, then add todo
  const parseAndAddTodo = async () => {
    await submitTodo(newTask)
    setNewTask('')
    setTodoBlock(null)
    setSelectedGoalId(null)
  }

  // Quick-add from overlay
  const submitQuickAdd = async () => {
    if (!quickAddText.trim()) return
    await submitTodo(quickAddText, null)
    setQuickAddText('')
    setQuickAddOpen(false)
  }

  const saveTodoText = async (id: string) => {
    if (!editingTodoText.trim()) { setEditingTodoId(null); return }
    await supabase.from('todos').update({ text: editingTodoText.trim() }).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: editingTodoText.trim() } : t))
    setEditingTodoId(null)
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const reorderTodos = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTodos(prev => {
      const pending = prev.filter(t => !t.completed)
      const done = prev.filter(t => t.completed)
      const oldIdx = pending.findIndex(t => t.id === active.id)
      const newIdx = pending.findIndex(t => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(pending, oldIdx, newIdx).map((t, i) => ({ ...t, sort_order: i }))
      Promise.all(reordered.map(t => supabase.from('todos').update({ sort_order: t.sort_order }).eq('id', t.id)))
      return [...reordered, ...done]
    })
  }

  const upsertReview = async (updates: Partial<Review>) => {
    if (!userId) return
    const payload = { ...review, ...updates, user_id: userId, date: today }
    const { data } = await supabase.from('reviews').upsert(payload, { onConflict: 'user_id,date' }).select().single()
    if (data) setReview(data)
  }

  const logFriction = async (habitId: string, reason: string) => {
    if (!userId) return
    await supabase.from('friction_logs').upsert({
      habit_id: habitId, user_id: userId, log_date: today, reason,
    }, { onConflict: 'habit_id,user_id,log_date' })
  }

  const blockHabitTime = async (habit: Habit) => {
    setCalSaving(true)
    try {
      const base = new Date()
      if (calWhen === 'tomorrow') base.setDate(base.getDate() + 1)
      else if (calWhen === 'next_monday') {
        const daysUntilMon = (8 - base.getDay()) % 7 || 7
        base.setDate(base.getDate() + daysUntilMon)
      }
      const [h, m] = calTime.split(':')
      base.setHours(parseInt(h), parseInt(m), 0, 0)
      const endDate = new Date(base.getTime() + parseInt(calDuration) * 60 * 1000)

      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token

      if (providerToken) {
        const event = {
          summary: habit.text,
          description: `Habit block — reThink 2026`,
          start: { dateTime: base.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endDate.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        }
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })

        if (res.ok) {
          const created = await res.json()
          await supabase.from('habits').update({ calendar_event_id: created.id }).eq('id', habit.id)
          setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, calendar_event_id: created.id } : h))
          setCalendarDialogHabitId(null)
          setCalToast(`Blocked for ${base.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${calTime}`)
        } else {
          setCalToast('Calendar permission needed. Re-sign in with calendar access.')
        }
      } else {
        setCalToast('Calendar access not enabled. Re-sign in with calendar permission.')
      }
    } catch {
      setCalToast('Could not connect to Google Calendar.')
    } finally {
      setCalSaving(false)
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
      calToastTimerRef.current = setTimeout(() => setCalToast(null), 3500)
    }
  }

  const startTimer = () => { setTimerRunning(true); setTimerComplete(false) }
  const pauseTimer = () => setTimerRunning(false)
  const resetTimer = () => { setTimerRunning(false); setTimerElapsed(0); setTimerComplete(false) }

  const saveSession = async (completionStatus: 'COMPLETE' | 'CARRIED_OVER' | 'INCOMPLETE') => {
    if (userId && timerStartedAt) {
      try {
        await supabase.from('focus_sessions').insert({
          user_id: userId,
          goal_id: timerGoalId,
          habit_id: timerHabitId,
          started_at: timerStartedAt,
          ended_at: new Date().toISOString(),
          duration_minutes: timerDuration,
          session_type: timerDuration === 25 ? 'POMODORO' : timerDuration === 52 ? 'ULTRADIAN' : 'DEEP_WORK',
          intention: timerIntention || null,
          completion_status: completionStatus,
        })
      } catch (err) {
        console.error('Failed to save focus session:', err)
      }
    }
    setTimerComplete(false)
    setTimerRunning(false)
    setTimerElapsed(0)
    setTimerIntention('')
    setTimerStartedAt(null)
    setShowIntentionInput(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const monthStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const timerRemaining = timerDuration * 60 - timerElapsed
  const timerPct = (timerElapsed / (timerDuration * 60)) * 100

  // @ suggestion logic (computed, no extra state)
  const atMatch = newTask.match(/@([^\s]*)$/)
  const atQuery = atMatch ? atMatch[1].toLowerCase() : null
  const showAtSuggestions = atQuery !== null
  const goalSuggestions = atQuery !== null
    ? (atQuery ? goals.filter(g => g.text.toLowerCase().includes(atQuery)) : goals.slice(0, 5))
    : []

  // Reset suggestion index when list changes
  useEffect(() => { setSuggestionIndex(-1) }, [atQuery])

  const selectGoalSuggestion = (goal: Pick<Goal, 'id' | 'text'>) => {
    setNewTask(prev => prev.replace(/@[^\s]*$/, '').trim())
    setSelectedGoalId(goal.id)
    setSuggestionIndex(-1)
    inputRef.current?.focus()
  }

  // Suppress Lightning unused warning
  void Lightning

  return (
    <div className="h-screen bg-white text-burnham font-sans">

      {/* ─── Main content ──────────────────────────────────────────────── */}
      <main
        className="h-screen flex flex-col relative overflow-hidden transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? 'clamp(280px, 30%, 360px)' : '2.5rem' }}
      >

        {/* ── One Thing header ──────────────────────────────────────── */}
        {onethingValue && (
          <div className="px-10 pt-7 pb-4 flex items-baseline gap-4 border-b border-mercury/30 shrink-0">
            <span className="text-[9px] font-mono text-shuttle/30 uppercase tracking-[0.15em] whitespace-nowrap">one thing</span>
            <span className="text-sm font-semibold text-burnham leading-snug">{onethingValue}</span>
          </div>
        )}


        {dayState === 'COMPLETED' ? (
          /* ── Day Complete Summary View ──────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-8">
            <div className="w-full max-w-sm">
              <p className="text-[9px] uppercase tracking-[0.2em] text-shuttle/40 mb-2 font-mono">Day complete</p>
              <h1 className="text-xl font-semibold text-burnham mb-1">{onethingValue}</h1>
              <p className="text-xs text-shuttle/50 mb-8">Today's one thing</p>
              <div className="flex items-center gap-3 mb-8 text-xs text-shuttle flex-wrap">
                <span><strong className="text-burnham font-semibold">{todos.filter(t => t.completed).length}</strong> tasks done</span>
                <span className="text-mercury">·</span>
                <span><strong className="text-burnham font-semibold">{doneHabits.length}/{habits.length}</strong> habits</span>
                {review?.energy_level && (
                  <>
                    <span className="text-mercury">·</span>
                    <span>energy <strong className="text-burnham font-semibold">{review.energy_level}/10</strong></span>
                  </>
                )}
              </div>
              {(tomorrowReview?.one_thing || todos.filter(t => t.date === tomorrow).length > 0) && (
                <div className="border-t border-mercury pt-6 mb-8">
                  <p className="text-[9px] uppercase tracking-widest text-shuttle/40 mb-3 font-mono">Tomorrow</p>
                  {tomorrowReview?.one_thing && (
                    <p className="text-sm font-medium text-burnham mb-3">"{tomorrowReview.one_thing}"</p>
                  )}
                  <div className="space-y-1.5">
                    {todos.filter(t => t.date === tomorrow).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-shuttle">
                        <span className="w-1 h-1 rounded-full bg-mercury shrink-0 mt-px" />
                        {t.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-shuttle/30 italic">See you tomorrow.</p>
            </div>
          </div>
        ) : (
          /* ── Normal Today Content ───────────────────────────────── */
          <div className="flex-1 overflow-y-auto">
            <div className={`w-full ${!sidebarOpen ? 'max-w-2xl mx-auto' : ''} px-8 py-8 pt-10`}>

              <p className="text-[10px] font-mono text-shuttle/40 mb-7">{monthStr}</p>

              {/* ── Habits — horizontal chip strip ──────────────────── */}
              <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest flex items-center gap-2">
                    Habits
                    <span className="font-mono font-normal text-shuttle/40 normal-case">{doneHabits.length}/{habits.length}</span>
                  </h3>
                  <span className="text-[9px] font-mono text-shuttle/25 border border-mercury/50 rounded px-1">⌘H</span>
                </div>

                {/* Chip strip — all habits always visible */}
                <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
                  {habits.map(habit => {
                    const currentLog = logs.find(l => l.habit_id === habit.id)
                    const currentVal = currentLog?.value ?? 0
                    const isDone = isHabitDone(habit)
                    const pct = habit.habit_type === 'QUANTIFIED' && habit.daily_target
                      ? Math.min(100, (currentVal / habit.daily_target) * 100)
                      : (isDone ? 100 : 0)
                    const streak = getStreak(habit.id)
                    const isExpanded = expandedHabitId === habit.id
                    const label = habit.alias ?? habit.text.split(' ').slice(0, 3).join(' ')

                    // Chip color based on type and state
                    let chipClass = ''
                    if (habit.habit_type === 'QUANTIFIED') {
                      if (pct >= 100) chipClass = 'bg-gossip/60 border-pastel/50 text-burnham'
                      else if (pct >= 50) chipClass = 'bg-lime-50 border-lime-400 text-lime-800'
                      else if (pct > 0) chipClass = 'bg-amber-50 border-amber-300 text-amber-800'
                      else chipClass = 'bg-white border-mercury text-shuttle'
                    } else {
                      chipClass = isDone
                        ? 'bg-gossip/60 border-pastel/50 text-burnham'
                        : 'bg-white border-mercury text-shuttle hover:border-shuttle/30'
                    }

                    return (
                      <div key={habit.id} className="flex flex-col items-start">
                        {/* The pill itself */}
                        <div className={`flex items-center gap-1.5 rounded-full border text-[11px] font-medium transition-all duration-200 ${chipClass}`}>
                          {habit.habit_type === 'QUANTIFIED' ? (
                            /* QUANTIFIED chip */
                            <button
                              onClick={() => {
                                setEditingQuantifiedHabitId(habit.id)
                                setQuantifiedInputValue(String(currentVal))
                              }}
                              className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full"
                              title={habit.text}
                            >
                              {habit.emoji && <span className="leading-none">{habit.emoji}</span>}
                              {editingQuantifiedHabitId === habit.id ? (
                                <input
                                  autoFocus
                                  type="number"
                                  min={0}
                                  className="w-14 text-center text-xs bg-transparent border-b border-current outline-none"
                                  value={quantifiedInputValue}
                                  onChange={e => setQuantifiedInputValue(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  onKeyDown={e => {
                                    e.stopPropagation()
                                    if (e.key === 'Enter') {
                                      const val = Math.max(0, parseInt(quantifiedInputValue) || 0)
                                      logHabitValue(habit.id, val)
                                      setEditingQuantifiedHabitId(null)
                                    }
                                    if (e.key === 'Escape') setEditingQuantifiedHabitId(null)
                                  }}
                                  onBlur={() => {
                                    const val = Math.max(0, parseInt(quantifiedInputValue) || 0)
                                    logHabitValue(habit.id, val)
                                    setEditingQuantifiedHabitId(null)
                                  }}
                                />
                              ) : (
                                <span>{label}</span>
                              )}
                              <span className="text-[9px] font-mono opacity-60">{currentVal}/{habit.daily_target}</span>
                              {isDone
                                ? <Check size={10} weight="bold" className="text-pastel shrink-0" />
                                : <span className="w-1.5 h-1.5 rounded-full bg-mercury/80 shrink-0" />
                              }
                              {streak > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] opacity-60">
                                  <Flame size={8} weight="fill" className="text-pastel" />
                                  {streak}
                                </span>
                              )}
                            </button>
                          ) : (
                            /* BINARY chip */
                            <button
                              onClick={() => toggleHabit(habit.id)}
                              className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full"
                              title={habit.text}
                            >
                              {habit.emoji && <span className="leading-none">{habit.emoji}</span>}
                              <span>{label}</span>
                              {isDone
                                ? <Check size={10} weight="bold" className="text-pastel shrink-0" />
                                : <span className="w-1.5 h-1.5 rounded-full bg-mercury/80 shrink-0" />
                              }
                              {streak > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] opacity-60">
                                  <Flame size={8} weight="fill" className="text-pastel" />
                                  {streak}
                                </span>
                              )}
                            </button>
                          )}
                          {/* Expand toggle — visible on hover */}
                          <button
                            onClick={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                            className={`pr-2 py-1.5 text-[10px] transition-colors rounded-r-full ${isExpanded ? 'text-shuttle/60' : 'text-shuttle/20 hover:text-shuttle/50'}`}
                            title="Details"
                          >
                            {isExpanded ? '↑' : '↓'}
                          </button>
                        </div>

                        {/* Expanded details — shown below the chip */}
                        {isExpanded && (
                          <div className="mt-1.5 ml-1 flex items-center flex-wrap gap-3 text-[10px] text-shuttle/50">
                            {habit.default_time && <span className="font-mono">{habit.default_time}</span>}
                            {(() => { const adh = getAdherence(habit.id); return adh < 90 ? <span>{adh}% adherence</span> : null })()}
                            <button
                              onClick={() => setCalendarDialogHabitId(prev => prev === habit.id ? null : habit.id)}
                              className="flex items-center gap-1 hover:text-burnham transition-colors"
                            >
                              <CalendarBlank size={10} /> schedule
                            </button>
                            {!isDone && (
                              <select
                                className="bg-transparent border-0 cursor-pointer hover:text-shuttle transition-colors focus:outline-none text-[10px]"
                                onChange={e => { if (e.target.value) logFriction(habit.id, e.target.value); e.target.value = '' }}
                                defaultValue=""
                              >
                                <option value="" disabled>why not?</option>
                                <option value="Travel">Travel</option>
                                <option value="Forgot">Forgot</option>
                                <option value="Too tired">Too tired</option>
                                <option value="External blocker">External blocker</option>
                                <option value="Other">Other</option>
                              </select>
                            )}

                            {calendarDialogHabitId === habit.id && (
                              <div className="mt-1.5 w-full p-3 bg-[#F8F9F9] border border-mercury rounded-lg space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">Block time in calendar</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <select value={calWhen} onChange={e => setCalWhen(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none">
                                    <option value="today">Today</option>
                                    <option value="tomorrow">Tomorrow</option>
                                    <option value="next_monday">Next Monday</option>
                                  </select>
                                  <span className="text-xs text-shuttle">at</span>
                                  <input type="time" value={calTime} onChange={e => setCalTime(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none" />
                                  <select value={calDuration} onChange={e => setCalDuration(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none">
                                    <option value="15">15 min</option>
                                    <option value="30">30 min</option>
                                    <option value="45">45 min</option>
                                    <option value="60">1 hour</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => blockHabitTime(habit)}
                                    disabled={calSaving}
                                    className="text-xs bg-burnham text-white px-3 py-1.5 rounded hover:bg-burnham/90 disabled:opacity-50 transition-colors"
                                  >
                                    {calSaving ? 'Blocking...' : 'Block time'}
                                  </button>
                                  <button onClick={() => setCalendarDialogHabitId(null)} className="text-xs text-shuttle hover:text-burnham transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* ── Separator before todos ───────────────────────────── */}
              <div className="h-px bg-mercury/40 mb-8" />

              {/* ── Backlog (all past incomplete todos) ─────────────── */}
              {yesterdayTodos.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-[9px] font-semibold text-shuttle/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-shuttle/20" />
                    Backlog · {yesterdayTodos.length} unfinished
                  </h3>
                  <div className="space-y-0.5">
                    {yesterdayTodos.map(todo => {
                      const daysAgo = Math.round((new Date(today).getTime() - new Date(todo.date ?? today).getTime()) / 86400000)
                      const ageLabel = daysAgo === 1 ? 'yesterday' : daysAgo <= 7 ? `${daysAgo}d ago` : `${todo.date}`
                      return (
                        <div key={todo.id} className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-amber-50/30 transition-colors">
                          <input
                            type="checkbox"
                            className="custom-checkbox shrink-0 opacity-60"
                            checked={false}
                            onChange={async () => {
                              await supabase.from('todos').update({ completed: true }).eq('id', todo.id)
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                          />
                          <span className="flex-1 text-sm text-shuttle/70 min-w-0 truncate">{todo.text}</span>
                          <span className="text-[9px] font-mono text-shuttle/25 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{ageLabel}</span>
                          <button
                            onClick={async () => {
                              await supabase.from('todos').update({ date: today }).eq('id', todo.id)
                              setTodos(prev => [...prev, { ...todo, date: today }])
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-shuttle/50 hover:text-burnham transition-all px-2 py-0.5 rounded border border-mercury/50 hover:border-burnham/30 shrink-0"
                          >
                            →today
                          </button>
                          <button
                            onClick={async () => {
                              await supabase.from('todos').delete().eq('id', todo.id)
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded shrink-0"
                          >
                            <TrashSimple size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div className="h-px bg-mercury/30 mt-5" />
                </section>
              )}

              {/* ── To-Dos ─────────────────────────────────────────────── */}
              <section className="mb-10">
                {/* Hidden input — only used programmatically by ⌘N overlay */}
                <input
                  ref={inputRef}
                  className="sr-only"
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown' && showAtSuggestions) {
                      e.preventDefault()
                      setSuggestionIndex(i => Math.min(i + 1, goalSuggestions.length - 1))
                    } else if (e.key === 'ArrowUp' && showAtSuggestions) {
                      e.preventDefault()
                      setSuggestionIndex(i => Math.max(i - 1, -1))
                    } else if (e.key === 'Enter' && showAtSuggestions && suggestionIndex >= 0) {
                      e.preventDefault()
                      selectGoalSuggestion(goalSuggestions[suggestionIndex])
                    } else if (e.key === 'Enter' && !showAtSuggestions) {
                      parseAndAddTodo()
                    } else if (e.key === 'Escape' && showAtSuggestions) {
                      setNewTask(prev => prev.replace(/@[^\s]*$/, '').trim())
                      setSuggestionIndex(-1)
                    }
                  }}
                />
                {/* Placeholder section — not needed but keep structure */}
                <div className="relative">
                  <div className="flex items-center gap-2 group">
                    <span />
                    {/* Tags appear only when typing */}
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderTodos}>
                  <SortableContext items={pendingTodos.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5 mb-6">
                      {pendingTodos.map(todo => (
                        <SortableTodoRow
                          key={todo.id}
                          todo={todo}
                          goal={todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null}
                          isEditing={editingTodoId === todo.id}
                          editingText={editingTodoText}
                          onEditStart={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text) }}
                          onEditChange={setEditingTodoText}
                          onEditSave={() => saveTodoText(todo.id)}
                          onEditCancel={() => setEditingTodoId(null)}
                          onToggle={() => toggleTodo(todo.id)}
                          onDelete={() => deleteTodo(todo.id)}
                        />
                      ))}
                      <button
                        className="flex items-center gap-2 py-2 px-2 -mx-2 opacity-30 hover:opacity-70 transition-opacity"
                        onClick={() => setQuickAddOpen(true)}
                      >
                        <div className="w-[1.15em] h-[1.15em] border border-dashed border-shuttle/60 rounded-[0.35em]" />
                        <span className="text-xs text-shuttle font-mono">⌘N to add a task</span>
                      </button>
                    </div>
                  </SortableContext>
                </DndContext>
                {doneTodos.length > 0 && (
                  <div className="pt-5 border-t border-dashed border-mercury">
                    <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                    <div className="space-y-1">
                      {doneTodos.map(todo => {
                        const goal = todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null
                        return (
                          <div key={todo.id} className="group flex items-center gap-3 py-1.5 px-2 -mx-2 opacity-50 hover:opacity-70 transition-opacity">
                            <input type="checkbox" className="custom-checkbox shrink-0" checked onChange={() => toggleTodo(todo.id)} />
                            <span className="text-[13px] text-shuttle line-through decoration-pastel flex-1 truncate">{todo.text}</span>
                            {goal && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 opacity-60"
                                style={{ backgroundColor: goal.color ? `${goal.color}20` : '#E5F9BD', color: goal.color ?? '#003720' }}
                              >
                                {goal.alias ?? goal.text.slice(0, 6)}
                              </span>
                            )}
                            <button
                              onClick={() => deleteTodo(todo.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded shrink-0"
                            >
                              <TrashSimple size={12} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>

            </div>
          </div>
        )}
      </main>

      {/* ─── Left Sidebar — fixed so it never scrolls away ────────────── */}
      <aside className={`${sidebarOpen ? 'w-[clamp(280px,30%,360px)]' : 'w-10'} fixed top-0 left-0 h-screen bg-white border-r border-mercury flex flex-col z-20 transition-all duration-300 overflow-visible`}>
        {/* ─── Sidebar header: logo + name + toggle ─── */}
        {sidebarOpen ? (
          <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <img src="/logo-sm.png" alt="reThink" className="w-6 h-6 rounded-md object-cover shrink-0" />
              <span className="text-sm font-semibold text-burnham tracking-tight">reThink</span>
            </div>
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="p-1.5 rounded hover:bg-mercury/60 text-shuttle/50 hover:text-burnham transition-colors"
              title="Collapse ⌘B"
            >
              <SidebarSimple size={14} weight="regular" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-4 pb-3 gap-3 shrink-0">
            <img src="/logo-sm.png" alt="reThink" className="w-6 h-6 rounded-md object-cover" />
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="p-1 rounded hover:bg-mercury/60 text-shuttle/50 hover:text-burnham transition-colors"
              title="Expand ⌘B"
            >
              <SidebarSimple size={14} weight="regular" />
            </button>
          </div>
        )}

        {sidebarOpen && (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-mercury">
              <p className="text-[10px] uppercase tracking-widest text-shuttle/60 mb-3">Today's objective</p>
              <input
                className="w-full text-base font-semibold text-burnham border-b border-mercury focus:border-burnham outline-none bg-transparent pb-1 placeholder-mercury/80 transition-colors"
                placeholder="What would make today a win?"
                value={onethingValue}
                onChange={e => handleOnethingChange(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* PULSE */}
              <div>
                <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest mb-3">Pulse</h3>
                <div className="space-y-3 mb-4">
                  {[
                    { label: 'To-Dos',      val: `${doneTodos.length}/${todos.length}`,           pct: todosProgress },
                    { label: 'Habits',      val: `${doneHabits.length}/${habits.length}`,         pct: habitsProgress },
                    { label: 'Milestones',  val: `${doneMilestones.length}/${milestones.length}`, pct: milestonesProgress },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-burnham font-medium">{item.label}</span>
                        <span className="text-shuttle font-mono">{item.val}</span>
                      </div>
                      <div className="w-full bg-mercury rounded-full h-1">
                        <div className="h-1 rounded-full bg-pastel transition-all" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* JOURNALING — rich text with markdown storage */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest flex items-center gap-1.5">
                    <NotePencil size={11} /> Journal
                  </h3>
                  {journalEditing && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onMouseDown={e => { e.preventDefault(); if (journalRef.current) wrapSelection(journalRef.current, '**', '**', handleJournalChange) }}
                        className="w-5 h-5 rounded flex items-center justify-center text-shuttle hover:text-burnham hover:bg-mercury/30 transition-colors"
                        title="Bold"
                      >
                        <TextB size={11} weight="bold" />
                      </button>
                      <button
                        onMouseDown={e => { e.preventDefault(); if (journalRef.current) wrapSelection(journalRef.current, '*', '*', handleJournalChange) }}
                        className="w-5 h-5 rounded flex items-center justify-center text-shuttle hover:text-burnham hover:bg-mercury/30 transition-colors"
                        title="Italic"
                      >
                        <TextItalic size={11} />
                      </button>
                      <button
                        onMouseDown={e => { e.preventDefault(); if (journalRef.current) wrapSelection(journalRef.current, '~~', '~~', handleJournalChange) }}
                        className="w-5 h-5 rounded flex items-center justify-center text-shuttle hover:text-burnham hover:bg-mercury/30 transition-colors"
                        title="Strikethrough"
                      >
                        <TextStrikethrough size={11} />
                      </button>
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          const ta = journalRef.current
                          if (!ta) return
                          const { selectionStart, value } = ta
                          const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
                          const lineContent = value.substring(lineStart, selectionStart)
                          if (!lineContent.startsWith('- ')) {
                            const newVal = value.substring(0, lineStart) + '- ' + lineContent + value.substring(selectionStart)
                            handleJournalChange(newVal)
                            setTimeout(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 2 }, 0)
                          }
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center text-shuttle hover:text-burnham hover:bg-mercury/30 transition-colors"
                        title="Bullet list"
                      ><ListBullets size={11} /></button>
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          const ta = journalRef.current
                          if (!ta) return
                          const { selectionStart, value } = ta
                          const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
                          const lineContent = value.substring(lineStart, selectionStart)
                          if (!lineContent.match(/^\d+\. /)) {
                            const lines = value.substring(0, lineStart).split('\n')
                            const prevNum = lines.reduce((n: number, l: string) => { const m = l.match(/^(\d+)\. /); return m ? parseInt(m[1]) : n }, 0)
                            const nextNum = prevNum + 1
                            const newVal = value.substring(0, lineStart) + `${nextNum}. ` + lineContent + value.substring(selectionStart)
                            handleJournalChange(newVal)
                            setTimeout(() => { ta.selectionStart = ta.selectionEnd = selectionStart + `${nextNum}. `.length }, 0)
                          }
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center text-shuttle hover:text-burnham hover:bg-mercury/30 transition-colors"
                        title="Numbered list"
                      ><ListNumbers size={11} /></button>
                    </div>
                  )}
                </div>

                {journalEditing ? (
                  <textarea
                    ref={journalRef}
                    autoFocus
                    className="flex-1 w-full bg-transparent border-none p-0 text-xs text-burnham resize-none placeholder-shuttle/30 focus:ring-0 outline-none leading-relaxed min-h-[160px]"
                    placeholder="What's on your mind…"
                    value={journalValue}
                    onChange={e => handleJournalChange(e.target.value)}
                    onBlur={() => setJournalEditing(false)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const ta = e.currentTarget
                        const { selectionStart, value } = ta
                        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
                        const currentLine = value.substring(lineStart, selectionStart)
                        if (currentLine.startsWith('- ')) {
                          e.preventDefault()
                          if (currentLine.trim() === '-') {
                            const newVal = value.substring(0, lineStart) + '\n' + value.substring(selectionStart)
                            handleJournalChange(newVal)
                            setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1 }, 0)
                          } else {
                            const newVal = value.substring(0, selectionStart) + '\n- ' + value.substring(selectionStart)
                            handleJournalChange(newVal)
                            setTimeout(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 3 }, 0)
                          }
                          return
                        }
                        const numMatch = currentLine.match(/^(\d+)\. (.+)/)
                        if (numMatch) {
                          e.preventDefault()
                          const nextNum = parseInt(numMatch[1]) + 1
                          const insert = `\n${nextNum}. `
                          const newVal = value.substring(0, selectionStart) + insert + value.substring(selectionStart)
                          handleJournalChange(newVal)
                          setTimeout(() => { ta.selectionStart = ta.selectionEnd = selectionStart + insert.length }, 0)
                        }
                      }
                    }}
                  />
                ) : (
                  <div
                    className="flex-1 min-h-[160px] cursor-text"
                    onClick={() => setJournalEditing(true)}
                  >
                    {journalValue ? (
                      <div
                        className="text-xs text-burnham leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(journalValue) }}
                      />
                    ) : (
                      <p className="text-xs text-shuttle/30 italic">What's on your mind…</p>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* End of day CTA */}
            <div className="px-6 py-5 border-t border-mercury">
              <button
                onClick={() => setShowEndOfDay(true)}
                className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 text-white py-3 rounded-lg text-xs font-medium transition-all"
              >
                <span>Done for today</span>
                <span className="opacity-60">→</span>
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ─── Floating Pomodoro Widget ────────────────────────────────── */}
      <div className="fixed top-4 right-14 z-40 flex flex-col items-end gap-1.5">
        {/* Pill: icon + time + controls + gear */}
        <div className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1.5 shadow-md transition-all duration-300 ${timerRunning ? 'bg-gossip/60 border-pastel/50 shadow-pastel/20' : 'bg-white border-mercury'}`}>
          <Timer size={11} className={`shrink-0 transition-colors ${timerRunning ? 'text-burnham' : 'text-shuttle/60'}`} />
          <span className={`text-[11px] font-mono font-bold tabular-nums w-10 text-center transition-colors ${timerRunning ? 'text-burnham' : 'text-shuttle'}`}>
            {formatTime(timerRemaining)}
          </span>
          {timerComplete ? null : !timerRunning ? (
            <button
              onClick={() => { if (timerElapsed === 0) setShowIntentionInput(true); else setTimerRunning(true) }}
              className="w-5 h-5 rounded-full bg-burnham flex items-center justify-center hover:bg-burnham/80 transition-colors"
            >
              <Play size={8} weight="fill" className="text-white" />
            </button>
          ) : (
            <button
              onClick={pauseTimer}
              className="w-5 h-5 rounded-full bg-burnham/10 border border-burnham/20 flex items-center justify-center hover:bg-burnham/20 transition-colors"
            >
              <Pause size={8} weight="fill" className="text-burnham" />
            </button>
          )}
          {timerElapsed > 0 && !timerComplete && (
            <button
              onClick={resetTimer}
              className="w-5 h-5 rounded-full border border-mercury flex items-center justify-center text-shuttle hover:border-shuttle transition-colors"
            >
              <Stop size={8} />
            </button>
          )}
          <button
            onClick={() => setShowPomSettings(v => !v)}
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              showPomSettings ? 'border-burnham text-burnham bg-burnham/5' : 'border-mercury text-shuttle/40 hover:text-shuttle hover:border-shuttle'
            }`}
          >
            <GearSix size={9} />
          </button>
        </div>

        {/* Progress bar when running */}
        {timerRunning && (
          <div className="w-full bg-mercury rounded-full h-0.5">
            <div className="bg-pastel h-0.5 rounded-full transition-all" style={{ width: `${timerPct}%` }} />
          </div>
        )}

        {/* Settings panel */}
        {showPomSettings && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52">
            <div className="flex gap-1">
              {FOCUS_DURATIONS.map(d => (
                <button
                  key={d.minutes}
                  onClick={() => { setTimerDuration(d.minutes); resetTimer() }}
                  disabled={timerRunning}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                    timerDuration === d.minutes
                      ? 'bg-burnham text-white'
                      : 'border border-mercury text-shuttle hover:border-shuttle bg-white'
                  }`}
                  title={d.desc}
                >
                  {d.label}m
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['none', 'brown', 'rain'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setAmbientSound(s)}
                  className={[
                    'flex-1 text-[10px] py-0.5 rounded border transition-colors',
                    ambientSound === s
                      ? 'border-burnham text-burnham bg-burnham/5'
                      : 'border-mercury text-shuttle hover:border-burnham/30',
                  ].join(' ')}
                >
                  {s === 'none' ? 'Off' : s === 'brown' ? 'Brown' : 'Rain'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <select
                className="flex-1 text-[10px] border border-mercury rounded px-1 py-0.5 bg-white text-burnham outline-none disabled:opacity-50"
                value={timerGoalId ?? ''}
                onChange={e => setTimerGoalId(e.target.value || null)}
                disabled={timerRunning}
              >
                <option value="">No goal</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
              </select>
              <select
                value={timerHabitId ?? ''}
                onChange={e => setTimerHabitId(e.target.value || null)}
                disabled={timerRunning}
                className="flex-1 text-[10px] border border-mercury rounded px-1 py-0.5 bg-white text-burnham outline-none disabled:opacity-50"
              >
                <option value="">No habit</option>
                {habits
                  .filter(h => !timerGoalId || h.goal_id === timerGoalId)
                  .map(h => <option key={h.id} value={h.id}>{h.text}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Intention input */}
        {showIntentionInput && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52">
            <input
              autoFocus
              value={timerIntention}
              onChange={e => setTimerIntention(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setShowIntentionInput(false)
                  setTimerStartedAt(new Date().toISOString())
                  setTimerRunning(true)
                }
              }}
              placeholder="Session intention…"
              className="w-full text-xs border-b border-mercury outline-none bg-transparent pb-1 text-burnham placeholder-shuttle/40"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowIntentionInput(false); setTimerStartedAt(new Date().toISOString()); startTimer() }}
                className="text-[10px] font-semibold text-white bg-burnham px-2 py-1 rounded"
              >Begin</button>
              <button
                onClick={() => { setShowIntentionInput(false); setTimerIntention(''); setTimerStartedAt(new Date().toISOString()); startTimer() }}
                className="text-[10px] text-shuttle"
              >Skip</button>
            </div>
          </div>
        )}

        {/* Post-session check */}
        {timerComplete && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52">
            <p className="text-[10px] uppercase tracking-widest text-shuttle text-center">Did you finish?</p>
            <div className="flex gap-1">
              <button onClick={() => saveSession('COMPLETE')} className="flex-1 text-[10px] font-semibold text-white bg-burnham py-1 rounded">Yes</button>
              <button onClick={() => saveSession('CARRIED_OVER')} className="flex-1 text-[10px] text-shuttle border border-mercury py-1 rounded">Carry</button>
              <button onClick={() => saveSession('INCOMPLETE')} className="flex-1 text-[10px] text-shuttle border border-mercury py-1 rounded">No</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Habit Drawer (⌘H) ───────────────────────────────── */}
      {habitDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[185] bg-black/10 backdrop-blur-[1px]"
            onClick={() => setHabitDrawerOpen(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-[190] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-mercury shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-burnham">Habits</h2>
                <span className="text-[10px] font-mono text-shuttle/40">{doneHabits.length}/{habits.length}</span>
              </div>
              <button onClick={() => setHabitDrawerOpen(false)} className="text-shuttle hover:text-burnham transition-colors p-1">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {habits.filter(h => h.habit_type !== 'QUANTIFIED').length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/40 mb-3">Yes / No</p>
                  <div className="space-y-1">
                    {habits.filter(h => h.habit_type !== 'QUANTIFIED').map((habit, idx) => {
                      const done = isHabitDone(habit)
                      const streak = getStreak(habit.id)
                      return (
                        <div key={habit.id} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-gray-50/60 transition-colors">
                          <input
                            type="checkbox"
                            className="custom-checkbox shrink-0"
                            checked={done}
                            onChange={() => toggleHabit(habit.id)}
                          />
                          {habit.emoji && <span className="text-base leading-none shrink-0">{habit.emoji}</span>}
                          <span className={`flex-1 text-sm ${done ? 'line-through text-shuttle/40' : 'font-medium text-burnham'}`}>
                            {habit.text}
                          </span>
                          {streak > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-shuttle/40 shrink-0">
                              <Flame size={10} weight="fill" className="text-pastel" />
                              {streak}
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-shuttle/20 border border-mercury/40 rounded px-1 shrink-0">{idx + 1}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {habits.filter(h => h.habit_type === 'QUANTIFIED').length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/40 mb-3">Track Progress</p>
                  <div className="space-y-4">
                    {habits.filter(h => h.habit_type === 'QUANTIFIED').map(habit => {
                      const currentLog = logs.find(l => l.habit_id === habit.id)
                      const currentVal = currentLog?.value ?? 0
                      const pct = habit.daily_target ? Math.min(100, (currentVal / habit.daily_target) * 100) : 0
                      const done = isHabitDone(habit)
                      const streak = getStreak(habit.id)
                      return (
                        <div key={habit.id} className="space-y-2">
                          <div className="flex items-center gap-2">
                            {habit.emoji && <span className="text-base leading-none shrink-0">{habit.emoji}</span>}
                            <span className="flex-1 text-sm font-medium text-burnham">{habit.text}</span>
                            {streak > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-shuttle/40 shrink-0">
                                <Flame size={10} weight="fill" className="text-pastel" />
                                {streak}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => logHabitValue(habit.id, Math.max(0, currentVal - 1))}
                              className="w-7 h-7 rounded border border-mercury flex items-center justify-center text-shuttle hover:text-burnham hover:border-shuttle transition-colors font-medium"
                            >−</button>
                            <div className="flex-1 text-center">
                              <span className="text-lg font-semibold text-burnham">{currentVal}</span>
                              <span className="text-[10px] text-shuttle/40 ml-1">/ {habit.daily_target}{habit.unit ? ` ${habit.unit}` : ''}</span>
                            </div>
                            <button
                              onClick={() => logHabitValue(habit.id, currentVal + 1)}
                              className="w-7 h-7 rounded border border-mercury flex items-center justify-center text-shuttle hover:text-burnham hover:border-shuttle transition-colors font-medium"
                            >+</button>
                          </div>
                          <div className="h-1 rounded-full bg-mercury/40 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-pastel' : pct >= 50 ? 'bg-lime-400' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {habits.length === 0 && (
                <p className="text-xs text-shuttle/40 italic text-center py-8">No habits configured yet.</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-mercury shrink-0">
              <p className="text-[9px] font-mono text-shuttle/25 text-center">⌘H to close</p>
            </div>
          </div>
        </>
      )}

      {/* ─── Milestones — bottom-right floating panel ─────────────────── */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2 items-end" style={{ maxWidth: 'min(400px, calc(100vw - 6rem))' }}>
        {milestonesOpen && (
          <div className="w-full bg-white border border-mercury rounded-2xl shadow-xl p-4 max-h-72 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Milestones</span>
              <button onClick={() => setMilestonesOpen(false)} className="text-shuttle/40 hover:text-shuttle text-xs">Esc</button>
            </div>

            {/* Pending — grouped by goal */}
            {(() => {
              const goalOrder = goals.map(g => g.id)
              const grouped = pendingMilestones.reduce<Record<string, typeof pendingMilestones>>((acc, m) => {
                const key = m.goal_id ?? '__none__'
                ;(acc[key] ??= []).push(m)
                return acc
              }, {})
              const sortedKeys = Object.keys(grouped).sort((a, b) => {
                const ai = goalOrder.indexOf(a), bi = goalOrder.indexOf(b)
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
              })
              if (sortedKeys.length === 0) return <p className="text-xs text-shuttle/40 text-center py-3">No pending milestones</p>
              return sortedKeys.map(key => {
                const goal = goals.find(g => g.id === key)
                const label = goal ? (goal.emoji ? `${goal.emoji} ` : '') + (goal.alias ?? goal.text.slice(0, 20)) : null
                return (
                  <div key={key} className="mb-3 last:mb-0">
                    {label && (
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/40 mb-1.5">{label}</p>
                    )}
                    {grouped[key].map(m => (
                      <div key={m.id} className="flex items-start gap-3 py-1.5 hover:bg-gray-50/60 px-1 -mx-1 rounded transition-colors">
                        <input type="checkbox" className="custom-checkbox mt-0.5 shrink-0" checked={false} onChange={() => toggleMilestone(m.id)} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-burnham">{m.text}</span>
                          {m.target_date && (
                            <span className="text-[10px] text-shuttle/40 font-mono ml-2">{m.target_date}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            })()}

            {/* Done milestones */}
            {doneMilestones.length > 0 && (
              <div className="pt-2 mt-2 border-t border-dashed border-mercury">
                {doneMilestones.map(m => (
                  <div key={m.id} className="flex items-center gap-3 py-1.5 px-1 -mx-1 opacity-50">
                    <input type="checkbox" className="custom-checkbox shrink-0" checked onChange={() => toggleMilestone(m.id)} />
                    <span className="text-sm text-shuttle line-through decoration-pastel">{m.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setMilestonesOpen(v => !v)}
          className="flex items-center gap-3 bg-white border border-mercury rounded-full px-4 py-2 shadow-md hover:shadow-lg transition-all text-[11px] group"
        >
          <span className="font-mono text-shuttle/30 border border-mercury/50 rounded px-1 py-0.5 text-[9px] group-hover:text-shuttle/60 transition-colors">M</span>
          <span className="text-burnham font-medium">Milestones</span>
          <span className="text-shuttle/40">{pendingMilestones.length} pending</span>
          <span className="text-shuttle/25 text-[10px]">{milestonesOpen ? '↓' : '↑'}</span>
        </button>
        <button
          onClick={() => setLiPanelOpen(true)}
          className="flex items-center gap-2 bg-white border border-mercury rounded-full px-3 py-1.5 shadow-md text-[11px] text-shuttle hover:border-shuttle/40 transition-colors"
        >
          <span className="text-[9px] font-mono border border-mercury/50 rounded px-1">⌘L</span>
          <span>Indicators</span>
        </button>
      </div>

      {/* ─── Quick-Add Overlay (⌘N — from anywhere) ──────────────────── */}
      {quickAddOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-40 bg-black/10 backdrop-blur-[2px]"
          onClick={e => { if (e.target === e.currentTarget) setQuickAddOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-mercury p-6 w-full max-w-lg mx-4">
            <p className="text-[9px] uppercase tracking-[0.15em] text-shuttle/30 mb-4 font-mono">Quick Add Task · ⌘N</p>
            <input
              ref={quickAddRef}
              autoFocus
              value={quickAddText}
              onChange={e => setQuickAddText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { submitQuickAdd() }
                if (e.key === 'Escape') { setQuickAddOpen(false); setQuickAddText('') }
              }}
              placeholder="What needs to get done?"
              className="w-full text-lg text-burnham placeholder-shuttle/20 border-none outline-none bg-transparent"
            />
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-mercury">
              <span className="text-[9px] text-shuttle/25 font-mono flex items-center gap-3">
                <span>↵ add</span>
                <span>Esc close</span>
              </span>
              <span className="text-[9px] text-shuttle/20 font-mono">supports @goal /am /pm</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Leading Indicators Panel (⌘L) ───────────────────────────── */}
      {liPanelOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-40 bg-black/10 backdrop-blur-[2px]"
          onClick={e => { if (e.target === e.currentTarget) setLiPanelOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-mercury p-6 w-full max-w-md mx-4">
            <p className="text-[9px] uppercase tracking-[0.15em] text-shuttle/30 mb-5 font-mono">Indicators · Today · ⌘L</p>
            {indicators.length === 0 ? (
              <p className="text-sm text-shuttle/40 italic">No leading indicators configured yet.</p>
            ) : (
              <div className="space-y-4">
                {indicators.filter(ind => !ind.habit_id).map(ind => {
                  const weekTotal = weekIndicatorLogs
                    .filter(l => l.leading_indicator_id === ind.id)
                    .reduce((sum, l) => sum + Number(l.value), 0)
                  return (
                    <div key={ind.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-burnham truncate">{ind.name}</p>
                        <p className="text-[10px] text-shuttle/40">
                          {weekTotal % 1 === 0 ? weekTotal : weekTotal.toFixed(1)}{ind.unit ? ` ${ind.unit}` : ''} this week
                          {ind.target ? ` · target ${ind.target}` : ''}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={liDraftValues[ind.id] ?? ''}
                        onChange={e => setLiDraftValues(prev => ({ ...prev, [ind.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveIndicatorLogs() }}
                        placeholder="0"
                        className="w-20 text-right text-sm text-burnham border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-shuttle transition-colors"
                      />
                      {ind.unit && <span className="text-xs text-shuttle/40 w-8 shrink-0">{ind.unit}</span>}
                    </div>
                  )
                })}
                {indicators.filter(ind => !!ind.habit_id).map(ind => {
                  const todayLog = indicatorLogs.find(l => l.leading_indicator_id === ind.id)
                  const weekTotal = weekIndicatorLogs
                    .filter(l => l.leading_indicator_id === ind.id)
                    .reduce((sum, l) => sum + Number(l.value), 0)
                  const sourceHabit = habits.find(h => h.id === ind.habit_id)
                  return (
                    <div key={ind.id} className="flex items-center gap-3 opacity-60">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-burnham truncate">{ind.name}</p>
                        <p className="text-[10px] text-shuttle/40">
                          via {sourceHabit?.alias ?? sourceHabit?.text ?? 'habit'} · {weekTotal}{ind.unit ? ` ${ind.unit}` : ''} this week
                        </p>
                      </div>
                      <span className="text-sm text-shuttle font-mono">{todayLog?.value ?? 0}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-mercury">
              <span className="text-[9px] text-shuttle/25 font-mono">↵ save · Esc close</span>
              <button onClick={saveIndicatorLogs} className="text-xs font-semibold text-burnham hover:text-burnham/70 transition-colors">
                Save →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Day NOT_STARTED overlay ───────────────────────────────── */}
      {dayState === 'NOT_STARTED' && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-burnham">
          <div className="w-full max-w-md px-8">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/25 mb-10 font-mono">{monthStr}</p>
            {onethingValue ? (
              <h1 className="text-2xl font-semibold text-white mb-8 leading-tight">Good morning. Ready to focus?</h1>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-white mb-3 leading-tight">What's your one thing today?</h1>
                <p className="text-sm text-white/35 mb-8 leading-relaxed">The single outcome that makes today a win.</p>
              </>
            )}
            {!onethingValue && (
              <input
                autoFocus
                value={objectiveDraft}
                onChange={e => setObjectiveDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && objectiveDraft.trim()) {
                    handleOnethingChange(objectiveDraft)
                    localStorage.setItem(`day_started_${today}`, 'true')
                    setDayStartedLocal(true)
                  }
                }}
                placeholder="e.g. Ship the auth integration"
                className="w-full bg-transparent border-b border-white/20 focus:border-white/50 outline-none text-xl text-white placeholder-white/15 pb-3 transition-colors mb-10"
              />
            )}
            <button
              autoFocus={!!onethingValue}
              onClick={() => {
                if (objectiveDraft.trim()) handleOnethingChange(objectiveDraft)
                localStorage.setItem(`day_started_${today}`, 'true')
                setDayStartedLocal(true)
              }}
              disabled={!onethingValue && !objectiveDraft.trim()}
              className="mt-2 px-8 py-3 bg-white text-burnham font-semibold rounded-xl text-sm disabled:opacity-20 transition-opacity hover:bg-gossip"
            >
              {onethingValue ? 'Begin the day →' : 'Set & Begin →'}
            </button>
          </div>
        </div>
      )}

      {/* ─── End of Day Drawer ───────────────────────────────────────── */}
      {showEndOfDay && userId && (
        <EndOfDayDrawer
          todos={todos}
          today={today}
          userId={userId}
          onClose={() => setShowEndOfDay(false)}
          onComplete={async () => {
            setShowEndOfDay(false)
            if (!userId) return
            const { data } = await supabase.from('reviews').select('*')
              .eq('user_id', userId).eq('date', today).maybeSingle()
            if (data) setReview(data)
          }}
        />
      )}

      {/* ─── Toasts ──────────────────────────────────────────────────── */}
      {calToast && (
        <div className="fixed bottom-24 right-4 bg-burnham text-white text-xs px-4 py-2.5 rounded-lg shadow-lg z-50 max-w-xs">
          {calToast}
        </div>
      )}

      {/* ─── Streak Celebration ──────────────────────────────────────── */}
      {celebrationStreak && (
        <StreakCelebration
          streak={celebrationStreak.streak}
          habitName={celebrationStreak.habit.text}
          onDismiss={() => setCelebrationStreak(null)}
        />
      )}
    </div>
  )
}
