import { useState, useEffect, useRef } from 'react'
import {
  Lightning, Check, Play, Pause, Stop,
  Timer, CalendarBlank, SidebarSimple,
  Flame, TrashSimple, NotePencil, GearSix,
  TextB, TextItalic, TextStrikethrough,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo, Habit, HabitLog, Review, Milestone, Goal } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
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

export default function Today() {
  const today = new Date().toISOString().split('T')[0]
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0]

  // Data
  const [todos, setTodos] = useState<Todo[]>([])
  const [yesterdayTodos, setYesterdayTodos] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [recentLogs, setRecentLogs] = useState<HabitLog[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [goals, setGoals] = useState<Pick<Goal, 'id' | 'text'>[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)

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

  // Mandatory objective drawer
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
  const [habitPanelOpen, setHabitPanelOpen] = useState(false)
  const [habitsCollapsed, setHabitsCollapsed] = useState(false)
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null)
  const [milestonesOpen, setMilestonesOpen] = useState(false)

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


  useKeyboardShortcuts({
    'cmd+b': () => setSidebarOpen(p => !p),
    'cmd+.': () => setSidebarOpen(p => !p),
    'cmd+n': () => setQuickAddOpen(true),
    'cmd+e': () => setShowEndOfDay(true),
  })

  // Space → play/pause; H → habit panel; 1-9 → mark habit; Escape → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true'

      if (e.key === 'Escape') {
        if (habitPanelOpen) { setHabitPanelOpen(false); return }
        if (showEndOfDay) { setShowEndOfDay(false); return }
      }

      if ((e.key === 'h' || e.key === 'H') && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setHabitPanelOpen(v => !v)
        return
      }

      if ((e.key === 'm' || e.key === 'M') && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setMilestonesOpen(v => !v)
        return
      }

      if (habitPanelOpen && !inInput && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        const pending = habits.filter(h => !logs.some(l => l.habit_id === h.id && l.value === 1))
        if (pending[idx]) {
          toggleHabit(pending[idx].id)
          if (pending.length <= 1) setHabitPanelOpen(false)
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
  }, [timerRunning, timerComplete, timerElapsed, showEndOfDay, habitPanelOpen, habits, logs])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

      const [todosRes, yesterdayTodosRes, habitsRes, logsRes, recentLogsRes, reviewRes, goalsRes, milestonesRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id)
          .or(`date.is.null,date.eq.${today}`),
        supabase.from('todos').select('*').eq('user_id', user.id)
          .eq('date', yesterdayStr).eq('completed', false),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('habit_logs').select('*').eq('user_id', user.id)
          .gte('log_date', thirtyAgoStr).order('log_date', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('goals').select('id, text').eq('user_id', user.id).eq('goal_type', 'ACTIVE'),
        supabase.from('milestones').select('*').eq('user_id', user.id)
          .or(`target_date.is.null,target_date.gte.${today}`).order('target_date', { nullsFirst: true }),
      ])
      setTodos(todosRes.data ?? [])
      setYesterdayTodos(yesterdayTodosRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setRecentLogs(recentLogsRes.data ?? [])
      setReview(reviewRes.data)
      setGoals(goalsRes.data ?? [])
      setMilestones((milestonesRes.data ?? []).slice(0, 10))
      setDataLoaded(true)
    }
    load()
  }, [today])

  useEffect(() => { setJournalValue(review?.notes ?? '') }, [review?.notes])
  useEffect(() => { setOnethingValue(review?.one_thing ?? '') }, [review?.one_thing])

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
  const pendingHabits = habits.filter(h => !logs.some(l => l.habit_id === h.id && l.value === 1))
  const doneHabits = habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1))

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
      const expected = checkDate.toISOString().split('T')[0]
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
    const existing = logs.find(l => l.habit_id === habitId)
    let justCompleted = false
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      await supabase.from('habit_logs').update({ value: newVal }).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
      justCompleted = newVal === 1
    } else {
      const { data } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: 1 })
        .select().single()
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
    }, { onConflict: 'habit_id,log_date' })
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
          session_type: timerDuration === 25 ? 'pomodoro' : timerDuration === 52 ? 'ultradian' : 'deep_work',
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

  return (
    <div className="h-screen bg-white text-burnham font-sans flex overflow-hidden">

      {/* ─── Main content ──────────────────────────────────────────────── */}
      <main className="flex-1 h-full flex flex-col relative">

        {/* ── One Thing header ──────────────────────────────────────── */}
        {onethingValue && (
          <div className="px-10 pt-7 pb-4 flex items-baseline gap-4 border-b border-mercury/30 shrink-0">
            <span className="text-[9px] font-mono text-shuttle/30 uppercase tracking-[0.15em] whitespace-nowrap">one thing</span>
            <span className="text-sm font-semibold text-burnham leading-snug">{onethingValue}</span>
          </div>
        )}

        {/* ── Shortcut hints ────────────────────────────────────────── */}
        <div className="px-10 pt-3 pb-1 flex items-center gap-5 shrink-0">
          {[
            { key: '⌘N', label: 'add task' },
            { key: 'H', label: 'habits' },
            { key: 'M', label: 'milestones' },
            { key: '⌘B', label: 'sidebar' },
            { key: '⌘E', label: 'end day' },
            { key: '⎵', label: 'focus' },
          ].map(s => (
            <span key={s.key} className="flex items-center gap-1 text-[9px] text-shuttle/25 font-mono">
              <kbd className="px-1 py-0.5 bg-mercury/20 rounded text-[8px] border border-mercury/40">{s.key}</kbd>
              <span>{s.label}</span>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-6 pb-32">
          <div className="max-w-2xl w-full">

            <p className="text-[10px] font-mono text-shuttle/40 mb-7">{monthStr}</p>

            {/* ── Yesterday's unfinished tasks ────────────────────── */}
            {yesterdayTodos.length > 0 && (
              <section className="mb-8">
                <h3 className="text-[9px] font-semibold text-shuttle/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-shuttle/20" />
                  Carried forward from yesterday
                </h3>
                <div className="space-y-1">
                  {yesterdayTodos.map(todo => (
                    <div key={todo.id} className="group flex items-start gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-amber-50/30 transition-colors">
                      <input
                        type="checkbox"
                        className="custom-checkbox mt-0.5 opacity-60"
                        checked={false}
                        onChange={async () => {
                          await supabase.from('todos').update({ completed: true }).eq('id', todo.id)
                          setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-shuttle">{todo.text}</span>
                        {todo.goal_id && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-pastel/50 shrink-0" />
                            <span className="text-[10px] text-shuttle/50 truncate">{goals.find(g => g.id === todo.goal_id)?.text}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          // Move to today
                          await supabase.from('todos').update({ date: today }).eq('id', todo.id)
                          const moved = { ...todo, date: today }
                          setTodos(prev => [...prev, moved])
                          setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-shuttle/50 hover:text-burnham transition-all px-2 py-0.5 rounded border border-mercury/50 hover:border-burnham/30 shrink-0"
                      >
                        move to today
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
                  ))}
                </div>
                <div className="h-px bg-mercury/30 mt-5" />
              </section>
            )}

            {/* ── To-Dos ─────────────────────────────────────────────── */}
            <section className="mb-10">
              {/* Ghost inline input — canvas feel */}
              <div className="relative mb-4">
                <div className="flex items-center gap-2 group">
                  <input
                    ref={inputRef}
                    className="flex-1 text-sm placeholder-mercury text-burnham bg-transparent border-none p-0 focus:ring-0 outline-none focus:placeholder-shuttle/40 transition-colors"
                    placeholder={newTask ? '' : 'Add a task…'}
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
                  {/* Tags appear only when typing */}
                  {newTask && (
                    <span className="text-[10px] text-shuttle/40 shrink-0 pointer-events-none">
                      {!newTask.includes('@') && '@goal'} {!newTask.includes('/am') && !newTask.includes('/pm') && '/am /pm'}
                    </span>
                  )}
                  {selectedGoalId && (
                    <button
                      onClick={() => setSelectedGoalId(null)}
                      className="text-[10px] bg-gossip text-burnham px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 hover:bg-gossip/70 transition-colors"
                    >
                      {goals.find(g => g.id === selectedGoalId)?.text?.slice(0, 22)}
                      <span className="opacity-60">×</span>
                    </button>
                  )}
                  {todoBlock && (
                    <button
                      onClick={() => setTodoBlock(null)}
                      className="text-[10px] bg-mercury/40 text-burnham px-2 py-0.5 rounded-full border border-mercury hover:bg-mercury/80 transition-colors shrink-0"
                    >
                      {todoBlock} ×
                    </button>
                  )}
                </div>
                {/* Subtle underline only when focused */}
                <div className="h-px bg-mercury mt-2 opacity-0 group-focus-within:opacity-100 transition-opacity" />

                {/* @ goal suggestions dropdown */}
                {showAtSuggestions && goalSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-mercury rounded-lg shadow-lg z-50 py-1 mt-1">
                    {goalSuggestions.map((g, i) => (
                      <button
                        key={g.id}
                        onMouseDown={e => { e.preventDefault(); selectGoalSuggestion(g) }}
                        className={`w-full text-left px-3 py-1.5 text-xs text-burnham truncate transition-colors ${
                          i === suggestionIndex ? 'bg-gossip' : 'hover:bg-mercury/10'
                        }`}
                      >
                        {g.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 mb-6">
                {pendingTodos.map(todo => {
                  const goalName = todo.goal_id ? goals.find(g => g.id === todo.goal_id)?.text : null
                  const isEditing = editingTodoId === todo.id
                  return (
                    <div key={todo.id} className="group flex items-start gap-3 py-1.5 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        className="custom-checkbox mt-0.5"
                        checked={false}
                        onChange={() => toggleTodo(todo.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          {isEditing ? (
                            <input
                              autoFocus
                              className="flex-1 text-sm font-medium text-burnham bg-transparent border-b border-burnham focus:outline-none"
                              value={editingTodoText}
                              onChange={e => setEditingTodoText(e.target.value)}
                              onBlur={() => saveTodoText(todo.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveTodoText(todo.id)
                                if (e.key === 'Escape') setEditingTodoId(null)
                              }}
                            />
                          ) : (
                            <span
                              className="text-sm font-medium text-burnham truncate cursor-text"
                              onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text) }}
                            >
                              {todo.text}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {todo.effort === 'DEEP' && (
                              <span className="text-[10px] bg-gossip text-burnham px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Lightning size={9} weight="fill" /> Deep
                              </span>
                            )}
                            {todo.block && (
                              <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{todo.block}</span>
                            )}
                            <button
                              onClick={() => deleteTodo(todo.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded"
                            >
                              <TrashSimple size={12} />
                            </button>
                          </div>
                        </div>
                        {goalName && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-pastel shrink-0" />
                            <span className="text-[10px] font-semibold text-shuttle truncate">{goalName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div
                  className="group flex items-center gap-3 py-2 px-2 -mx-2 opacity-40 hover:opacity-80 transition-opacity cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  <div className="w-[1.15em] h-[1.15em] border border-dashed border-shuttle rounded-[0.35em]" />
                  <span className="text-sm text-shuttle">Add task...</span>
                </div>
              </div>
              {doneTodos.length > 0 && (
                <div className="pt-5 border-t border-dashed border-mercury">
                  <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                  <div className="space-y-1">
                    {doneTodos.map(todo => (
                      <div key={todo.id} className="group flex items-start gap-3 py-1.5 px-2 -mx-2 opacity-60 hover:opacity-80 transition-opacity">
                        <input type="checkbox" className="custom-checkbox mt-0.5" checked onChange={() => toggleTodo(todo.id)} />
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm text-shuttle line-through decoration-pastel">{todo.text}</span>
                            <button
                              onClick={() => deleteTodo(todo.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded shrink-0"
                            >
                              <TrashSimple size={12} />
                            </button>
                          </div>
                          {todo.goal_id && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-pastel/50 shrink-0" />
                              <span className="text-[10px] text-shuttle/60 truncate">{goals.find(g => g.id === todo.goal_id)?.text}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── Habits ─────────────────────────────────────────────── */}
            <section className="pt-8 border-t border-mercury/60">
              {/* Collapsible header */}
              <button
                className="flex items-center justify-between w-full mb-3 group"
                onClick={() => setHabitsCollapsed(v => !v)}
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">Habits</h3>
                  <span className="text-[10px] font-mono text-shuttle/40">
                    {doneHabits.length}/{habits.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] font-mono text-shuttle/30 border border-mercury/50 rounded px-1">H</span>
                  <span className="text-[10px] text-shuttle/30">{habitsCollapsed ? '↓' : '↑'}</span>
                </div>
              </button>

              {!habitsCollapsed && (
                <>
                  <div className="space-y-0.5 mb-4">
                    {pendingHabits.map(habit => {
                      const streak = getStreak(habit.id)
                      const goalName = habit.goal_id ? goals.find(g => g.id === habit.goal_id)?.text : null
                      const isExpanded = expandedHabitId === habit.id
                      return (
                        <div key={habit.id}>
                          <div className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-gray-50/60 transition-colors">
                            <input
                              type="checkbox"
                              className="custom-checkbox shrink-0"
                              checked={false}
                              onChange={() => toggleHabit(habit.id)}
                            />
                            <span
                              className="flex-1 text-sm font-medium text-burnham cursor-pointer select-none"
                              onClick={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                            >
                              {habit.text}
                            </span>
                            {streak > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-shuttle/50 shrink-0">
                                <Flame size={10} weight="fill" className="text-pastel" />
                                {streak}d
                              </span>
                            )}
                            {goalName && (
                              <span className="hidden group-hover:block text-[10px] text-shuttle/40 truncate max-w-[80px] shrink-0">{goalName}</span>
                            )}
                          </div>

                          {/* Expanded controls — secondary, clean */}
                          {isExpanded && (
                            <div className="ml-7 mb-1 flex items-center gap-4 py-1.5 text-[10px] text-shuttle/50">
                              {habit.default_time && (
                                <span className="font-mono">{habit.default_time}</span>
                              )}
                              {(() => { const adh = getAdherence(habit.id); return adh < 90 ? <span>{adh}% this month</span> : null })()}
                              <button
                                onClick={() => setCalendarDialogHabitId(prev => prev === habit.id ? null : habit.id)}
                                className="flex items-center gap-1 hover:text-burnham transition-colors"
                              >
                                <CalendarBlank size={11} /> block time
                              </button>
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
                            </div>
                          )}

                          {calendarDialogHabitId === habit.id && (
                            <div className="ml-7 mb-2 p-3 bg-[#F8F9F9] border border-mercury rounded-lg space-y-2">
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
                      )
                    })}
                  </div>

                  {/* Done habits — minimal */}
                  {doneHabits.length > 0 && (
                    <div className="flex items-center gap-2 py-2 border-t border-dashed border-mercury">
                      <Check size={11} weight="bold" className="text-pastel" />
                      <span className="text-[10px] text-shuttle/50">
                        {doneHabits.length} habit{doneHabits.length > 1 ? 's' : ''} done
                        {doneHabits.map(h => ` · ${h.text}`).join('')}
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>

          </div>
        </div>
      </main>

      {/* ─── Left Sidebar 30% ─────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-[30%] min-w-[280px] max-w-[360px]' : 'w-10'} bg-white border-r border-mercury h-full flex flex-col relative z-10 transition-all duration-300 overflow-visible order-first`}>
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
        <div className={`flex items-center gap-1.5 bg-white border rounded-full px-2.5 py-1.5 shadow-md transition-colors ${timerRunning ? 'border-pastel/70' : 'border-mercury'}`}>
          <Timer size={11} className="text-shuttle/60 shrink-0" />
          <span className={`text-[11px] font-mono font-bold tabular-nums w-10 text-center ${timerRunning ? 'text-burnham' : 'text-shuttle'}`}>
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

      {/* ─── Habit Quick-Mark Panel (H shortcut) ────────────────────── */}
      {habitPanelOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white border border-mercury rounded-xl shadow-xl px-5 py-4 w-80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Habits · press number to mark</span>
            <button onClick={() => setHabitPanelOpen(false)} className="text-shuttle/40 hover:text-shuttle text-xs">Esc</button>
          </div>
          <div className="space-y-1">
            {habits.filter(h => !logs.some(l => l.habit_id === h.id && l.value === 1)).map((habit, idx) => (
              <button
                key={habit.id}
                onClick={() => { toggleHabit(habit.id); if (pendingHabits.length <= 1) setHabitPanelOpen(false) }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gossip/30 transition-colors text-left group"
              >
                <span className="text-[10px] font-mono w-4 text-shuttle/50 shrink-0 group-hover:text-burnham">{idx + 1}</span>
                <span className="text-sm text-burnham truncate">{habit.text}</span>
                {getStreak(habit.id) > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-shuttle/50 ml-auto shrink-0">
                    <Flame size={9} weight="fill" className="text-pastel/70" />
                    {getStreak(habit.id)}
                  </span>
                )}
              </button>
            ))}
            {habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1)).length > 0 && (
              <div className="pt-2 border-t border-mercury/60 mt-1 space-y-1">
                {habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1)).map(habit => (
                  <div key={habit.id} className="flex items-center gap-3 px-2 py-1 opacity-40">
                    <Check size={11} weight="bold" className="text-pastel shrink-0" />
                    <span className="text-xs text-shuttle line-through">{habit.text}</span>
                  </div>
                ))}
              </div>
            )}
            {habits.length === 0 && (
              <p className="text-xs text-shuttle/40 text-center py-2">No habits for today</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Milestones Bottom Panel ──────────────────────────────────── */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center" style={{ width: 'min(600px, calc(100vw - 80px))' }}>
        {milestonesOpen && (
          <div className="w-full bg-white border border-mercury rounded-2xl shadow-xl p-4 mb-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">Milestones</span>
              <button onClick={() => setMilestonesOpen(false)} className="text-shuttle/40 hover:text-shuttle text-xs">Esc</button>
            </div>
            {pendingMilestones.map(m => (
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
            {milestones.length === 0 && (
              <p className="text-xs text-shuttle/40 text-center py-4">No milestones yet</p>
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

      {/* ─── Mandatory Objective Drawer ───────────────────────────────── */}
      {dataLoaded && !onethingValue && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-burnham">
          <div className="w-full max-w-md px-8">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/25 mb-10 font-mono">{monthStr}</p>
            <h1 className="text-2xl font-semibold text-white mb-3 leading-tight">
              What's your one thing today?
            </h1>
            <p className="text-sm text-white/35 mb-10 leading-relaxed">
              The single outcome that makes today a win.<br />Everything else is secondary.
            </p>
            <input
              autoFocus
              value={objectiveDraft}
              onChange={e => setObjectiveDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && objectiveDraft.trim()) {
                  handleOnethingChange(objectiveDraft)
                }
              }}
              placeholder="e.g. Ship the auth integration"
              className="w-full bg-transparent border-b border-white/20 focus:border-white/50 outline-none text-xl text-white placeholder-white/15 pb-3 transition-colors"
            />
            <button
              onClick={() => { if (objectiveDraft.trim()) handleOnethingChange(objectiveDraft) }}
              disabled={!objectiveDraft.trim()}
              className="mt-10 px-8 py-3 bg-white text-burnham font-semibold rounded-xl text-sm disabled:opacity-20 transition-opacity hover:bg-gossip"
            >
              Begin the day →
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
          onComplete={() => setShowEndOfDay(false)}
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
