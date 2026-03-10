import { useState, useEffect, useRef } from 'react'
import {
  Lightning, Check, PencilSimple,
  ArrowRight, Question, Play, Pause, Stop,
  CaretDown, Timer, Target, CalendarBlank,
  CaretRight, CaretLeft, Flame, TrashSimple,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Todo, Habit, HabitLog, Review, Milestone, Goal } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import StreakCelebration from '@/components/StreakCelebration'

type Tab = 'todos' | 'milestones' | 'habits'

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

export default function Today() {
  const today = new Date().toISOString().split('T')[0]
  const [tab, setTab] = useState<Tab>('todos')

  // Data
  const [todos, setTodos] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [recentLogs, setRecentLogs] = useState<HabitLog[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [goals, setGoals] = useState<Pick<Goal, 'id' | 'text'>[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Add task
  const [newTask, setNewTask] = useState('')
  const [taskDeep, setTaskDeep] = useState(false)
  const [todoBlock, setTodoBlock] = useState<'AM' | 'PM' | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Add milestone
  const [newMilestone, setNewMilestone] = useState('')
  const milestoneInputRef = useRef<HTMLInputElement>(null)

  // Inline edit todo
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')

  // Autosave refs
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onethingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tomorrowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local autosave values
  const [notesValue, setNotesValue] = useState('')
  const [onethingValue, setOnethingValue] = useState('')
  const [tomorrowValue, setTomorrowValue] = useState('')

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
  const [showTimer, setShowTimer] = useState(false)
  const [timerDuration, setTimerDuration] = useState(25)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerGoalId, setTimerGoalId] = useState<string | null>(null)
  const [timerComplete, setTimerComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showWrapUp, setShowWrapUp] = useState(true)



  // Sprint 16 — Pomodoro Enhanced
  const [timerIntention, setTimerIntention] = useState('')
  const [showIntentionInput, setShowIntentionInput] = useState(false)
  const [timerHabitId, setTimerHabitId] = useState<string | null>(null)
  const [ambientSound, setAmbientSound] = useState<'brown' | 'rain' | 'none'>('none')
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Sprint 19 — Morning Ritual
  const [ritualStep, setRitualStep] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [ritualYesterdayReview, setRitualYesterdayReview] = useState<'done' | 'carried' | 'missed' | null>(null)
  const [ritualPulledTodos, setRitualPulledTodos] = useState<string[]>([])

  useKeyboardShortcuts({
    '1': () => setTab('todos'),
    '2': () => setTab('milestones'),
    '3': () => setTab('habits'),
    'cmd+b': () => setSidebarOpen(p => !p),
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setSidebarOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

      const [todosRes, habitsRes, logsRes, recentLogsRes, reviewRes, goalsRes, milestonesRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id)
          .or(`date.is.null,date.eq.${today}`),
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
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setRecentLogs(recentLogsRes.data ?? [])
      setReview(reviewRes.data)
      setGoals(goalsRes.data ?? [])
      setMilestones((milestonesRes.data ?? []).slice(0, 10))

      // Sprint 19 — Morning ritual trigger
      const hour = new Date().getHours()
      const isMorning = hour >= 5 && hour < 10
      const loadedReview = reviewRes.data
      const loadedTodos = todosRes.data ?? []
      const hasPlannedToday = !!loadedReview?.one_thing || loadedTodos.filter(t => t.date === today).length > 0
      if (isMorning && !hasPlannedToday) {
        setRitualStep(1)
      }
    }
    load()
  }, [today])

  useEffect(() => { setNotesValue(review?.notes ?? '') }, [review?.notes])
  useEffect(() => { setOnethingValue(review?.one_thing ?? '') }, [review?.one_thing])
  useEffect(() => { setTomorrowValue(review?.tomorrow_focus ?? '') }, [review?.tomorrow_focus])

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

  // Ambient sound (Sprint 16)
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

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
      if (tomorrowTimerRef.current) clearTimeout(tomorrowTimerRef.current)
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
    }
  }, [])

  const handleNotesChange = (value: string) => {
    setNotesValue(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => upsertReview({ notes: value }), 800)
  }

  const handleOnethingChange = (value: string) => {
    setOnethingValue(value)
    if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
    onethingTimerRef.current = setTimeout(() => upsertReview({ one_thing: value }), 800)
  }

  const handleTomorrowChange = (value: string) => {
    setTomorrowValue(value)
    if (tomorrowTimerRef.current) clearTimeout(tomorrowTimerRef.current)
    tomorrowTimerRef.current = setTimeout(() => upsertReview({ tomorrow_focus: value }), 800)
  }

  // Computed
  const pendingTodos = todos.filter(t => !t.completed)
  const doneTodos = todos.filter(t => t.completed)
  const pendingMilestones = milestones.filter(m => m.status !== 'COMPLETE')
  const doneMilestones = milestones.filter(m => m.status === 'COMPLETE')
  const pendingHabits = habits.filter(h => !logs.some(l => l.habit_id === h.id && l.value === 1))
  const doneHabits = habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1))

  const todosProgress = todos.length > 0 ? Math.round((doneTodos.length / todos.length) * 100) : 0
  const milestonesProgress = milestones.length > 0 ? Math.round((doneMilestones.length / milestones.length) * 100) : 0
  const habitsProgress = habits.length > 0 ? Math.round((doneHabits.length / habits.length) * 100) : 0

  // Strategic alignment score
  const todosWithGoal = todos.filter(t => t.goal_id !== null).length
  const alignmentPct = todos.length > 0 ? Math.round((todosWithGoal / todos.length) * 100) : 0

  // Streak computation per habit
  const getStreak = (habitId: string): number => {
    const habitLogs = recentLogs
      .filter(l => l.habit_id === habitId)
      .sort((a, b) => b.log_date.localeCompare(a.log_date))

    let streak = 0
    let checkDate = new Date()
    // if today isn't logged yet, allow counting from yesterday
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

  // Sprint 17.1 — Habit adherence %
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

    // Check for milestone streak celebration
    if (justCompleted) {
      const streak = getStreak(habitId) + 1 // +1 because today's log just happened
      const MILESTONE_STREAKS = [7, 30, 100, 365]
      if (MILESTONE_STREAKS.includes(streak)) {
        const habit = habits.find(h => h.id === habitId)
        if (habit) setCelebrationStreak({ habit, streak })
      }
    }
  }

  const addTodo = async () => {
    if (!newTask.trim() || !userId) return
    const { data } = await supabase.from('todos')
      .insert({
        text: newTask.trim(),
        user_id: userId,
        effort: taskDeep ? 'DEEP' : 'NORMAL',
        date: today,
        block: todoBlock,
        goal_id: selectedGoalId,
      })
      .select().single()
    if (data) setTodos(prev => [...prev, data])
    setNewTask('')
    setTodoBlock(null)
    setSelectedGoalId(null)
    setShowGoalPicker(false)
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

  const addMilestone = async () => {
    if (!newMilestone.trim() || !userId) return
    const { data } = await supabase.from('milestones')
      .insert({ text: newMilestone.trim(), user_id: userId, status: 'PENDING' })
      .select().single()
    if (data) setMilestones(prev => [...prev, data])
    setNewMilestone('')
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
          headers: {
            'Authorization': `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        })

        if (res.ok) {
          const created = await res.json()
          await supabase.from('habits').update({ calendar_event_id: created.id }).eq('id', habit.id)
          setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, calendar_event_id: created.id } : h))
          setCalendarDialogHabitId(null)
          setCalToast(`Blocked for ${base.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${calTime}`)
          if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
          calToastTimerRef.current = setTimeout(() => setCalToast(null), 3000)
        } else {
          setCalToast('Calendar permission needed. Re-sign in with calendar access.')
          if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
          calToastTimerRef.current = setTimeout(() => setCalToast(null), 4000)
        }
      } else {
        setCalToast('Calendar access not enabled. Re-sign in with calendar permission.')
        if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
        calToastTimerRef.current = setTimeout(() => setCalToast(null), 4000)
      }
    } catch {
      setCalToast('Could not connect to Google Calendar.')
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
      calToastTimerRef.current = setTimeout(() => setCalToast(null), 3000)
    } finally {
      setCalSaving(false)
    }
  }

  const startTimer = () => { setTimerRunning(true); setTimerComplete(false) }
  const pauseTimer = () => setTimerRunning(false)
  const resetTimer = () => { setTimerRunning(false); setTimerElapsed(0); setTimerComplete(false) }

  // Sprint 16 — Save focus session
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

  return (
    <div className="h-screen bg-white text-burnham font-sans flex overflow-hidden">
      {/* Main 70% */}
      <main className="flex-1 h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto px-16 py-12 pb-20">
          <div className="max-w-3xl mx-auto w-full">

            {/* The One Thing */}
            <div className="mb-8 pb-8 border-b border-mercury">
              <p className="text-[10px] font-mono text-shuttle/50 mb-3">{monthStr}</p>
              <p className="text-[10px] uppercase tracking-widest text-shuttle mb-2">
                What's the one thing that would make today a win?
              </p>
              <input
                className="w-full text-xl font-semibold text-burnham border-b border-mercury focus:border-burnham outline-none bg-transparent pb-1 placeholder-mercury transition-colors"
                placeholder="Write it here…"
                value={onethingValue}
                onChange={e => handleOnethingChange(e.target.value)}
              />
            </div>

            {/* Quick add task */}
            <div className="flex items-start gap-4 border-b border-mercury pb-4 mb-8 group focus-within:border-shuttle transition-colors relative">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  className="w-full text-base font-medium placeholder-gray-300 text-burnham bg-transparent border-none p-0 focus:ring-0 mb-2"
                  placeholder="What needs to get done?"
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                />
                <div className="flex items-center gap-2">
                  {/* Goal picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowGoalPicker(p => !p)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                        selectedGoalId
                          ? 'text-burnham bg-gossip border border-gossip'
                          : 'text-shuttle bg-white border border-mercury hover:border-shuttle hover:text-burnham'
                      }`}
                    >
                      <Target size={9} />
                      {selectedGoalId ? goals.find(g => g.id === selectedGoalId)?.text?.slice(0, 20) + '…' : '# Goal'}
                      <CaretDown size={8} />
                    </button>
                    {showGoalPicker && (
                      <div className="absolute top-6 left-0 z-50 bg-white border border-mercury rounded-lg shadow-lg py-1 min-w-[200px]">
                        <button
                          onClick={() => { setSelectedGoalId(null); setShowGoalPicker(false) }}
                          className="w-full text-left px-3 py-1.5 text-xs text-shuttle hover:bg-gray-50"
                        >
                          No goal
                        </button>
                        {goals.map(g => (
                          <button
                            key={g.id}
                            onClick={() => { setSelectedGoalId(g.id); setShowGoalPicker(false) }}
                            className="w-full text-left px-3 py-1.5 text-xs text-burnham hover:bg-gray-50 truncate"
                          >
                            {g.text}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setTodoBlock(b => b === null ? 'AM' : b === 'AM' ? 'PM' : null)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      todoBlock
                        ? 'text-burnham bg-mercury/40 border border-mercury'
                        : 'text-shuttle bg-white border border-mercury hover:border-shuttle hover:text-burnham'
                    }`}
                  >
                    {todoBlock ?? 'AM / PM'}
                  </button>
                  <button
                    onClick={() => setTaskDeep(p => !p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                      taskDeep
                        ? 'text-burnham bg-gossip border border-gossip'
                        : 'text-shuttle bg-white border border-mercury hover:border-shuttle'
                    }`}
                  >
                    <Lightning size={10} weight="fill" /> Deep
                  </button>
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex bg-[#F0F1F1] rounded-xl p-1 mb-8 gap-0.5">
              {([
                { id: 'todos',      label: 'To-Dos' },
                { id: 'milestones', label: 'Milestones' },
                { id: 'habits',     label: 'Habits' },
              ] as { id: Tab; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    tab === id
                      ? 'bg-white text-burnham shadow-sm'
                      : 'text-shuttle hover:text-burnham'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-12">
              {/* TO-DOS */}
              {tab === 'todos' && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">To-Dos</h3>
                    <span className="text-xs font-mono text-shuttle">{pendingTodos.length} Pending</span>
                  </div>
                  <div className="space-y-1 mb-8">
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
                    <div className="pt-6 border-t border-dashed border-mercury">
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
              )}

              {/* MILESTONES */}
              {tab === 'milestones' && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">Milestones</h3>
                    <span className="text-xs font-mono text-shuttle">{pendingMilestones.length} Pending</span>
                  </div>
                  <div className="space-y-1 mb-8">
                    {pendingMilestones.map(m => (
                      <div key={m.id} className="group flex items-start gap-3 py-1.5 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                        <input type="checkbox" className="custom-checkbox mt-0.5" checked={false} onChange={() => toggleMilestone(m.id)} />
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium text-burnham">{m.text}</span>
                            {m.target_date && (
                              <span className="text-[10px] font-mono bg-gray-100 text-shuttle px-1.5 py-0.5 rounded shrink-0">{m.target_date}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div
                      className="flex items-center gap-3 py-2 px-2 -mx-2 opacity-40 hover:opacity-80 focus-within:opacity-100 transition-opacity cursor-text"
                      onClick={() => milestoneInputRef.current?.focus()}
                    >
                      <div className="w-[1.15em] h-[1.15em] border border-dashed border-shuttle rounded-[0.35em] shrink-0" />
                      <input
                        ref={milestoneInputRef}
                        className="flex-1 text-sm text-shuttle bg-transparent border-none focus:outline-none focus:text-burnham placeholder-shuttle/50"
                        placeholder="Add milestone..."
                        value={newMilestone}
                        onChange={e => setNewMilestone(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addMilestone()
                          if (e.key === 'Escape') { setNewMilestone(''); milestoneInputRef.current?.blur() }
                        }}
                        onBlur={() => { if (newMilestone.trim()) addMilestone() }}
                      />
                    </div>
                  </div>
                  {doneMilestones.length > 0 && (
                    <div className="pt-6 border-t border-dashed border-mercury">
                      <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                      {doneMilestones.map(m => (
                        <div key={m.id} className="flex items-start gap-3 py-1.5 px-2 -mx-2 opacity-60">
                          <input type="checkbox" className="custom-checkbox mt-0.5" checked onChange={() => toggleMilestone(m.id)} />
                          <span className="text-sm text-shuttle line-through decoration-pastel">{m.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* HABITS */}
              {tab === 'habits' && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">Habits</h3>
                    <span className="text-xs font-mono text-shuttle">{pendingHabits.length} Pending</span>
                  </div>
                  <div className="space-y-1 mb-8">
                    {pendingHabits.map(habit => {
                      const goalName = habit.goal_id ? goals.find(g => g.id === habit.goal_id)?.text : null
                      const streak = getStreak(habit.id)
                      return (
                        <div key={habit.id} className="group flex items-start gap-3 py-1.5 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                          <input type="checkbox" className="custom-checkbox mt-0.5" checked={false} onChange={() => toggleHabit(habit.id)} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-medium text-burnham">{habit.text}</span>
                                <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{habit.frequency}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setCalendarDialogHabitId(prev => prev === habit.id ? null : habit.id)}
                                  className={`text-shuttle hover:text-burnham transition-colors ${habit.calendar_event_id ? 'opacity-50' : ''}`}
                                  title={habit.calendar_event_id ? 'Time already blocked' : 'Block time in calendar'}
                                >
                                  <CalendarBlank size={12} />
                                </button>
                                <select
                                  className="text-[10px] text-shuttle/50 border border-mercury rounded px-1 py-0.5 bg-white cursor-pointer hover:text-shuttle transition-colors focus:outline-none"
                                  onChange={e => {
                                    if (e.target.value) logFriction(habit.id, e.target.value)
                                    e.target.value = ''
                                  }}
                                  defaultValue=""
                                >
                                  <option value="" disabled>Why not?</option>
                                  <option value="Travel">Travel</option>
                                  <option value="Forgot">Forgot</option>
                                  <option value="Too tired">Too tired</option>
                                  <option value="External blocker">External blocker</option>
                                  <option value="Other">Other</option>
                                </select>
                                <button
                                  onClick={() => toggleHabit(habit.id)}
                                  className="text-[10px] font-semibold text-burnham bg-gossip hover:brightness-95 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                                >
                                  <Check size={9} weight="bold" /> Done
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              {goalName && (
                                <div className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-pastel shrink-0" />
                                  <span className="text-[10px] font-semibold text-shuttle">{goalName}</span>
                                </div>
                              )}
                              {habit.default_time && (
                                <span className="text-[10px] font-mono text-shuttle/60">{habit.default_time}</span>
                              )}
                              {streak > 0 && (
                                <span className="flex items-center gap-1 text-[10px] text-shuttle">
                                  <Flame size={10} weight="fill" className="text-pastel" />
                                  {streak}d
                                  {(() => { const adh = getAdherence(habit.id); return adh < 90 ? ` · ${adh}%` : '' })()}
                                </span>
                              )}
                              {habit.calendar_event_id && (
                                <span className="flex items-center gap-1 text-[10px] text-shuttle/60">
                                  <CalendarBlank size={10} className="text-pastel/60" />
                                  Blocked
                                </span>
                              )}
                            </div>
                            {calendarDialogHabitId === habit.id && (
                              <div className="mt-2 p-3 bg-[#F8F9F9] border border-mercury rounded-lg space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">Block time in calendar</p>
                                <div className="flex items-center gap-2">
                                  <select value={calWhen} onChange={e => setCalWhen(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none focus:border-shuttle">
                                    <option value="today">Today</option>
                                    <option value="tomorrow">Tomorrow</option>
                                    <option value="next_monday">Next Monday</option>
                                  </select>
                                  <span className="text-xs text-shuttle">at</span>
                                  <input type="time" value={calTime} onChange={e => setCalTime(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none focus:border-shuttle" />
                                  <select value={calDuration} onChange={e => setCalDuration(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none focus:border-shuttle">
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
                        </div>
                      )
                    })}
                  </div>
                  {doneHabits.length > 0 && (
                    <div className="pt-6 border-t border-dashed border-mercury">
                      <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                      {doneHabits.map(h => {
                        const streak = getStreak(h.id)
                        return (
                          <div key={h.id} className="flex items-center gap-3 py-1.5 px-2 -mx-2 opacity-60">
                            <input type="checkbox" className="custom-checkbox" checked onChange={() => toggleHabit(h.id)} />
                            <span className="text-sm text-shuttle line-through decoration-pastel flex-1">{h.text}</span>
                            {streak > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-shuttle/60">
                                <Flame size={10} weight="fill" className="text-pastel/70" />
                                {streak}d
                                {(() => { const adh = getAdherence(h.id); return adh < 90 ? ` · ${adh}%` : '' })()}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Right 30% Daily Overview */}
      {/* Right Daily Overview */}
      <aside className={`${sidebarOpen ? 'w-[30%] min-w-[280px] max-w-[360px]' : 'w-10'} bg-white border-l border-mercury h-full flex flex-col relative z-10 transition-all duration-300 overflow-hidden`}>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="absolute -left-3 top-8 w-6 h-6 bg-white border border-mercury rounded-full flex items-center justify-center text-shuttle hover:text-burnham hover:border-shuttle transition-all shadow-sm z-20"
          title={sidebarOpen ? 'Collapse \u2318.' : 'Expand \u2318.'}
        >
          {sidebarOpen ? <CaretRight size={10} /> : <CaretLeft size={10} />}
        </button>
        {sidebarOpen && (
          <>
            <div className="px-6 pt-6 pb-3 flex items-center justify-between border-b border-mercury">
              <h2 className="text-xs font-semibold text-burnham">Daily Overview</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* PULSE */}
              <div>
                <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest mb-3">Pulse</h3>
                <div className="space-y-3 mb-4">
                  {[
                    { label: "To-Dos", val: `${doneTodos.length}/${todos.length}`, pct: todosProgress, isDynamic: true },
                    { label: "Milestones", val: `${doneMilestones.length}/${milestones.length}`, pct: milestonesProgress, isDynamic: false },
                    { label: "Habits", val: `${doneHabits.length}/${habits.length}`, pct: habitsProgress, isDynamic: false },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-burnham font-medium">{item.label}</span>
                        <span className="text-shuttle font-mono">{item.val}</span>
                      </div>
                      <div className="w-full bg-mercury rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all ${
                            item.isDynamic
                              ? alignmentPct >= 70 ? 'bg-pastel' : alignmentPct >= 40 ? 'bg-amber-400' : 'bg-red-400/60'
                              : 'bg-pastel'
                          }`}
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Energy inline */}
                <div className="grid grid-cols-10 gap-1 mt-3">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      onClick={() => upsertReview({ energy_level: n })}
                      className={`h-6 rounded text-[9px] font-medium transition-all ${
                        review?.energy_level === n
                          ? 'bg-gossip border border-pastel text-burnham font-bold'
                          : 'bg-white border border-mercury text-shuttle hover:border-pastel'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* FOCUS */}
              <div>
                <button
                  onClick={() => setShowTimer(v => !v)}
                  className="flex items-center justify-between w-full group mb-3"
                >
                  <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest group-hover:text-burnham transition-colors">Focus</h3>
                  <span className="text-[10px] text-shuttle/40">{showTimer ? '\u2212' : '+'}</span>
                </button>
            {showTimer && (
              <div className="bg-gray-50 rounded-xl p-4 border border-mercury/50 space-y-3">
                {/* Duration picker */}
                <div className="flex gap-1.5">
                  {FOCUS_DURATIONS.map(d => (
                    <button
                      key={d.minutes}
                      onClick={() => { setTimerDuration(d.minutes); resetTimer() }}
                      disabled={timerRunning}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                        timerDuration === d.minutes
                          ? 'bg-burnham text-white'
                          : 'bg-white border border-mercury text-shuttle hover:border-shuttle'
                      }`}
                      title={d.desc}
                    >
                      {d.label}m
                    </button>
                  ))}
                </div>

                {/* Ambient sound picker */}
                <div className="flex gap-1 mt-1">
                  {(['none', 'brown', 'rain'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setAmbientSound(s)}
                      className={[
                        'flex-1 text-[10px] py-1 rounded border transition-colors',
                        ambientSound === s
                          ? 'border-burnham text-burnham bg-burnham/5'
                          : 'border-mercury text-shuttle hover:border-burnham/30',
                      ].join(' ')}
                    >
                      {s === 'none' ? '— Silence' : s === 'brown' ? 'Brown' : 'Rain'}
                    </button>
                  ))}
                </div>

                {/* Goal & Habit selects */}
                <div className="flex gap-1.5">
                  <select
                    className="flex-1 text-[10px] border border-mercury rounded px-1.5 py-1 bg-white text-burnham outline-none disabled:opacity-50"
                    value={timerGoalId ?? ''}
                    onChange={e => setTimerGoalId(e.target.value || null)}
                    disabled={timerRunning}
                  >
                    <option value="">No goal</option>
                    {goals.map(g => (
                      <option key={g.id} value={g.id}>{g.text}</option>
                    ))}
                  </select>
                  <select
                    value={timerHabitId ?? ''}
                    onChange={e => setTimerHabitId(e.target.value || null)}
                    disabled={timerRunning}
                    className="flex-1 text-[10px] border border-mercury rounded px-1.5 py-1 bg-white text-burnham outline-none disabled:opacity-50"
                  >
                    <option value="">No habit</option>
                    {habits
                      .filter(h => !timerGoalId || h.goal_id === timerGoalId)
                      .map(h => <option key={h.id} value={h.id}>{h.text}</option>)}
                  </select>
                </div>

                {/* Intention input */}
                {showIntentionInput && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-shuttle">What will you accomplish?</p>
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
                      placeholder="Session intention..."
                      className="w-full text-xs border-b border-mercury outline-none bg-transparent pb-1 text-burnham placeholder-shuttle/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowIntentionInput(false)
                          setTimerStartedAt(new Date().toISOString())
                          setTimerRunning(true)
                        }}
                        className="text-[10px] font-semibold text-white bg-burnham px-2.5 py-1 rounded"
                      >Begin</button>
                      <button
                        onClick={() => {
                          setShowIntentionInput(false)
                          setTimerIntention('')
                          setTimerStartedAt(new Date().toISOString())
                          setTimerRunning(true)
                        }}
                        className="text-[10px] text-shuttle"
                      >Skip</button>
                    </div>
                  </div>
                )}

                {/* Timer display / Post-session */}
                {timerComplete ? (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-shuttle text-center">Did you finish?</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => saveSession('COMPLETE')}
                        className="flex-1 text-[10px] font-semibold text-white bg-burnham py-1.5 rounded"
                      >Yes</button>
                      <button
                        onClick={() => saveSession('CARRIED_OVER')}
                        className="flex-1 text-[10px] text-shuttle border border-mercury py-1.5 rounded"
                      >Carry over</button>
                      <button
                        onClick={() => saveSession('INCOMPLETE')}
                        className="flex-1 text-[10px] text-shuttle border border-mercury py-1.5 rounded"
                      >No</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="text-3xl font-bold font-mono tracking-tight text-burnham">
                        {formatTime(timerRemaining)}
                      </div>
                      {timerRunning && (
                        <div className="w-full bg-mercury rounded-full h-0.5 mt-2">
                          <div className="bg-pastel h-0.5 rounded-full transition-all" style={{ width: `${timerPct}%` }} />
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2">
                      {!timerRunning ? (
                        <button
                          onClick={() => {
                            if (!timerRunning && timerElapsed === 0) {
                              setShowIntentionInput(true)
                            } else {
                              setTimerRunning(r => !r)
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-burnham text-white text-[10px] font-bold hover:bg-burnham/90 transition-colors"
                        >
                          <Play size={10} weight="fill" /> {timerElapsed > 0 ? 'Resume' : 'Start'}
                        </button>
                      ) : (
                        <button
                          onClick={pauseTimer}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-amber-500 text-white text-[10px] font-bold hover:bg-amber-600 transition-colors"
                        >
                          <Pause size={10} weight="fill" /> Pause
                        </button>
                      )}
                      <button
                        onClick={resetTimer}
                        className="px-3 py-2 rounded border border-mercury text-shuttle text-[10px] hover:border-shuttle transition-colors"
                      >
                        <Stop size={10} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
              </div>

              {/* WRAP UP */}
              <div>
                <button
                  onClick={() => setShowWrapUp(v => !v)}
                  className="flex items-center justify-between w-full group mb-3"
                >
                  <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest group-hover:text-burnham transition-colors">Wrap Up</h3>
                  <span className="text-[10px] text-shuttle/40">{showWrapUp ? '\u2212' : '+'}</span>
                </button>
                {showWrapUp && (
                  <div className="space-y-4">
                    {/* Protocol */}
                    <div className="space-y-2">
                      {[
                        { key: 'inbox_zero' as keyof Review, label: 'Inbox Zero' },
                        { key: 'time_logs_updated' as keyof Review, label: 'Update Time Logs' },
                        { key: 'tomorrow_reviewed' as keyof Review, label: 'Review Tomorrow' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            className="custom-checkbox"
                            checked={!!(review?.[item.key])}
                            onChange={() => upsertReview({ [item.key]: !(review?.[item.key]) })}
                          />
                          <span className="text-xs text-shuttle group-hover:text-burnham transition-colors">{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Tomorrow */}
                    <div>
                      <p className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-1.5">Tomorrow</p>
                      <textarea
                        className="w-full bg-white border border-mercury rounded-lg p-2.5 text-xs text-burnham h-14 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0"
                        placeholder="What will you prioritize tomorrow?"
                        value={tomorrowValue}
                        onChange={e => handleTomorrowChange(e.target.value)}
                      />
                    </div>
                    {/* Notes */}
                    <div>
                      <p className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-1.5">Notes</p>
                      <textarea
                        className="w-full bg-white border border-mercury rounded-lg p-2.5 text-xs text-burnham h-14 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0"
                        placeholder="Blockers or quick thoughts?"
                        value={notesValue}
                        onChange={e => handleNotesChange(e.target.value)}
                      />
                    </div>
                    {/* CTA */}
                    <button
                      onClick={() => upsertReview({ tomorrow_reviewed: true })}
                      className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 text-white py-3 rounded-lg text-xs font-medium transition-all"
                    >
                      <span>All done for today</span>
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </aside>

      {/* Morning Ritual Overlay (Sprint 19) */}
      {ritualStep >= 1 && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="w-full max-w-lg px-8 py-10 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-shuttle">
                Morning Planning · Step {ritualStep} of 3
              </p>
              <button
                onClick={() => setRitualStep(0)}
                className="text-xs text-shuttle hover:text-burnham"
              >
                Skip
              </button>
            </div>

            {/* Step 1 — Yesterday review */}
            {ritualStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-burnham">Yesterday's recap</h2>
                <div className="space-y-2 text-sm text-shuttle">
                  <p>One thing was: <span className="text-burnham font-medium">{onethingValue || 'not set'}</span></p>
                </div>
                <div>
                  <p className="text-sm text-burnham mb-3">Did you accomplish it?</p>
                  <div className="flex gap-2">
                    {([['done', 'Yes'], ['carried', 'Carried over'], ['missed', 'No']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setRitualYesterdayReview(v)}
                        className={[
                          'flex-1 py-2 text-xs rounded border transition-colors',
                          ritualYesterdayReview === v
                            ? 'border-burnham text-burnham bg-burnham/5'
                            : 'border-mercury text-shuttle hover:border-burnham/30',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setRitualStep(2)}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-burnham rounded-lg"
                >
                  Next
                </button>
              </div>
            )}

            {/* Step 2 — Set One Thing */}
            {ritualStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-burnham">What's your One Thing today?</h2>
                <p className="text-sm text-shuttle">The one thing that would make today a win.</p>
                <input
                  autoFocus
                  value={onethingValue}
                  onChange={e => {
                    setOnethingValue(e.target.value)
                    if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
                    onethingTimerRef.current = setTimeout(() => upsertReview({ one_thing: e.target.value }), 800)
                  }}
                  placeholder="e.g. Finish the auth integration"
                  className="w-full text-lg font-medium border-b-2 border-mercury focus:border-burnham outline-none bg-transparent pb-2 text-burnham placeholder-shuttle/30"
                />
                <button
                  onClick={() => setRitualStep(3)}
                  disabled={!onethingValue.trim()}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-burnham rounded-lg disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            {/* Step 3 — Commit */}
            {ritualStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-burnham">Today's plan</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-shuttle w-20 shrink-0 pt-0.5">One Thing</span>
                    <span className="text-burnham font-medium">{onethingValue}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-shuttle w-20 shrink-0 pt-0.5">Habits</span>
                    <span className="text-burnham">{habits.length} to track today</span>
                  </div>
                </div>
                <button
                  onClick={() => setRitualStep(0)}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-burnham rounded-lg"
                >
                  Begin the Day
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar Toast */}
      {calToast && (
        <div className="fixed bottom-24 right-4 bg-burnham text-white text-xs px-4 py-2.5 rounded-lg shadow-lg z-50 max-w-xs">
          {calToast}
        </div>
      )}

      {/* Streak Celebration Overlay */}
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
