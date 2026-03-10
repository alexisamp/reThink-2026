import { useState, useEffect, useRef, useCallback } from 'react'
import {
  House, Lightning, Check, PencilSimple,
  ArrowRight, Question, Play, Pause, Stop,
  CaretDown, Timer, Target,
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

  // Focus timer
  const [showTimer, setShowTimer] = useState(false)
  const [timerDuration, setTimerDuration] = useState(25)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerGoalId, setTimerGoalId] = useState<string | null>(null)
  const [timerComplete, setTimerComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useKeyboardShortcuts({
    '1': () => setTab('todos'),
    '2': () => setTab('milestones'),
    '3': () => setTab('habits'),
  })

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
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('review_date', today).maybeSingle(),
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

  const handleNotesChange = useCallback((value: string) => {
    setNotesValue(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => upsertReview({ notes: value }), 800)
  }, []) // eslint-disable-line

  const handleOnethingChange = useCallback((value: string) => {
    setOnethingValue(value)
    if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
    onethingTimerRef.current = setTimeout(() => upsertReview({ one_thing: value }), 800)
  }, []) // eslint-disable-line

  const handleTomorrowChange = useCallback((value: string) => {
    setTomorrowValue(value)
    if (tomorrowTimerRef.current) clearTimeout(tomorrowTimerRef.current)
    tomorrowTimerRef.current = setTimeout(() => upsertReview({ tomorrow_focus: value }), 800)
  }, []) // eslint-disable-line

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

  const toggleTodo = async (id: string) => {
    const t = todos.find(t => t.id === id)
    if (!t) return
    const newVal = !t.completed
    await supabase.from('todos').update({ completed: newVal }).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newVal } : t))
  }

  const toggleMilestone = async (id: string) => {
    const m = milestones.find(m => m.id === id)
    if (!m) return
    const newStatus = m.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
    await supabase.from('milestones').update({ status: newStatus }).eq('id', id)
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

  const upsertReview = async (updates: Partial<Review>) => {
    if (!userId) return
    const payload = { ...review, ...updates, user_id: userId, review_date: today }
    const { data } = await supabase.from('reviews').upsert(payload).select().single()
    if (data) setReview(data)
  }

  const logFriction = async (habitId: string, reason: string) => {
    if (!userId) return
    await supabase.from('friction_logs').upsert({
      habit_id: habitId, user_id: userId, log_date: today, reason,
    }, { onConflict: 'habit_id,log_date' })
  }

  const startTimer = () => { setTimerRunning(true); setTimerComplete(false) }
  const pauseTimer = () => setTimerRunning(false)
  const resetTimer = () => { setTimerRunning(false); setTimerElapsed(0); setTimerComplete(false) }

  const monthStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const timerRemaining = timerDuration * 60 - timerElapsed
  const timerPct = (timerElapsed / (timerDuration * 60)) * 100

  return (
    <div className="h-screen bg-white text-burnham font-sans flex overflow-hidden">
      {/* Main 70% */}
      <main className="flex-1 h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto px-16 py-12 pb-20">
          <div className="max-w-3xl mx-auto w-full">

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-medium text-shuttle mb-6">
              <House size={14} />
              <span>/</span>
              <span className="text-burnham font-semibold">{monthStr}</span>
            </div>

            {/* The One Thing */}
            <div className="mb-6 pb-6 border-b border-mercury">
              <p className="text-[10px] uppercase tracking-widest text-shuttle mb-2">
                What's the one thing that would make today a win?
              </p>
              <input
                className="w-full text-lg font-medium text-burnham border-b border-mercury focus:border-burnham outline-none bg-transparent pb-1 placeholder-mercury transition-colors"
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
                  className="w-full text-2xl font-medium placeholder-gray-300 text-burnham bg-transparent border-none p-0 focus:ring-0 mb-2"
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

            {/* Inline tab bar */}
            <div className="flex border-b border-mercury mb-8">
              {([
                { id: 'todos',      label: 'To-Dos',     key: '1' },
                { id: 'milestones', label: 'Milestones',  key: '2' },
                { id: 'habits',     label: 'Habits',      key: '3' },
              ] as { id: Tab; label: string; key: string }[]).map(({ id, label, key }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
                    tab === id
                      ? 'border-burnham text-burnham'
                      : 'border-transparent text-shuttle hover:text-burnham'
                  }`}
                >
                  {label}
                  <span className="font-mono text-[9px] opacity-40">{key}</span>
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
                        <div key={todo.id} className="group flex items-start gap-3 py-2 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
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
                                  className="flex-1 text-base font-medium text-burnham bg-transparent border-b border-burnham focus:outline-none"
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
                                  className="text-base font-medium text-burnham truncate cursor-text"
                                  onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text) }}
                                >
                                  {todo.text}
                                </span>
                              )}
                              <div className="flex gap-1.5 shrink-0">
                                {todo.effort === 'DEEP' && (
                                  <span className="text-[10px] bg-gossip text-burnham px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Lightning size={9} weight="fill" /> Deep
                                  </span>
                                )}
                                {todo.block && (
                                  <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{todo.block}</span>
                                )}
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
                          <div key={todo.id} className="flex items-start gap-3 py-2 px-2 -mx-2 opacity-60">
                            <input type="checkbox" className="custom-checkbox mt-0.5" checked onChange={() => toggleTodo(todo.id)} />
                            <div className="flex-1">
                              <span className="text-base text-shuttle line-through decoration-pastel">{todo.text}</span>
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
                      <div key={m.id} className="group flex items-start gap-3 py-2 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                        <input type="checkbox" className="custom-checkbox mt-0.5" checked={false} onChange={() => toggleMilestone(m.id)} />
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between">
                            <span className="text-base font-medium text-burnham">{m.text}</span>
                            {m.target_date && (
                              <span className="text-[10px] font-mono bg-gray-100 text-shuttle px-1.5 py-0.5 rounded shrink-0">{m.target_date}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="group flex items-center gap-3 py-2 px-2 -mx-2 opacity-40 hover:opacity-80 transition-opacity cursor-text">
                      <div className="w-[1.15em] h-[1.15em] border border-dashed border-shuttle rounded-[0.35em]" />
                      <span className="text-sm text-shuttle">Add milestone...</span>
                    </div>
                  </div>
                  {doneMilestones.length > 0 && (
                    <div className="pt-6 border-t border-dashed border-mercury">
                      <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                      {doneMilestones.map(m => (
                        <div key={m.id} className="flex items-start gap-3 py-2 px-2 -mx-2 opacity-60">
                          <input type="checkbox" className="custom-checkbox mt-0.5" checked onChange={() => toggleMilestone(m.id)} />
                          <span className="text-base text-shuttle line-through decoration-pastel">{m.text}</span>
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
                        <div key={habit.id} className="group flex items-start gap-3 py-3 hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                          <input type="checkbox" className="custom-checkbox mt-0.5" checked={false} onChange={() => toggleHabit(habit.id)} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className="text-base font-medium text-burnham">{habit.text}</span>
                                <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{habit.frequency}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  className="text-[9px] text-shuttle/50 bg-transparent border-none cursor-pointer hover:text-shuttle transition-colors focus:outline-none"
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
                                <span className="text-[10px] text-shuttle">🔥 {streak}d streak</span>
                              )}
                            </div>
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
                          <div key={h.id} className="flex items-center gap-3 py-2 px-2 -mx-2 opacity-60">
                            <input type="checkbox" className="custom-checkbox" checked onChange={() => toggleHabit(h.id)} />
                            <span className="text-base text-shuttle line-through decoration-pastel flex-1">{h.text}</span>
                            {streak > 0 && <span className="text-[10px] text-shuttle/60">🔥 {streak}d</span>}
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
      <aside className="w-[30%] min-w-[300px] max-w-[380px] bg-white border-l border-mercury h-full flex flex-col relative z-10">
        <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">Daily Overview</h2>
          <span className="text-xs font-mono text-shuttle">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

          {/* Progress */}
          <div className="bg-gray-50 rounded-xl p-5 border border-mercury/50">
            <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-4">Today's Progress</h3>
            <div className="space-y-4">
              {[
                { label: "To-Dos", val: `${doneTodos.length}/${todos.length}`, pct: todosProgress },
                { label: "Milestones", val: `${doneMilestones.length}/${milestones.length}`, pct: milestonesProgress },
                { label: "Habits", val: `${doneHabits.length}/${habits.length}`, pct: habitsProgress },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-burnham font-medium">{item.label}</span>
                    <span className="text-shuttle font-mono">{item.val}</span>
                  </div>
                  <div className="w-full bg-mercury rounded-full h-1">
                    <div className="bg-pastel h-1 rounded-full transition-all" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategic Alignment */}
          <div>
            <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Strategic Alignment</h3>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-shuttle">{todosWithGoal} of {todos.length} todos linked to goals</span>
              <span className={`text-xs font-bold font-mono ${alignmentPct >= 70 ? 'text-emerald-600' : alignmentPct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                {alignmentPct}%
              </span>
            </div>
            <div className="w-full bg-mercury rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${alignmentPct >= 70 ? 'bg-pastel' : alignmentPct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${alignmentPct}%` }}
              />
            </div>
          </div>

          {/* Energy 1-10 */}
          <div>
            <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Daily Energy</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => upsertReview({ energy_level: n })}
                  className={`h-8 rounded border flex items-center justify-center text-xs font-medium transition-all ${
                    review?.energy_level === n
                      ? 'bg-gossip border-pastel text-burnham font-bold shadow-sm'
                      : 'bg-white border-mercury text-shuttle hover:border-pastel hover:text-burnham'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Protocol */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">Daily Protocol</h3>
              <Question size={12} className="text-mercury hover:text-shuttle cursor-help" />
            </div>
            <div className="space-y-3">
              {[
                { key: 'inbox_zero' as keyof Review, label: 'Inbox Zero' },
                { key: 'time_logs_updated' as keyof Review, label: 'Update Time Logs' },
                { key: 'tomorrow_reviewed' as keyof Review, label: 'Review Tomorrow' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={!!(review?.[item.key])}
                    onChange={() => upsertReview({ [item.key]: !(review?.[item.key]) })}
                  />
                  <span className="text-sm text-shuttle group-hover:text-burnham transition-colors">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Focus Timer */}
          <div>
            <button
              onClick={() => setShowTimer(v => !v)}
              className="flex items-center gap-2 group mb-3"
            >
              <Timer size={12} className="text-shuttle group-hover:text-burnham transition-colors" />
              <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest group-hover:text-burnham transition-colors">Focus Timer</h3>
              <span className="text-[10px] text-shuttle/50">{showTimer ? '−' : '+'}</span>
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

                {/* Goal select */}
                <select
                  className="w-full text-[10px] border border-mercury rounded px-2 py-1.5 text-shuttle bg-white focus:outline-none focus:border-shuttle"
                  value={timerGoalId ?? ''}
                  onChange={e => setTimerGoalId(e.target.value || null)}
                  disabled={timerRunning}
                >
                  <option value="">No goal</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>{g.text}</option>
                  ))}
                </select>

                {/* Timer display */}
                <div className="text-center">
                  <div className={`text-3xl font-bold font-mono tracking-tight ${timerComplete ? 'text-pastel' : 'text-burnham'}`}>
                    {timerComplete ? '✓ Done' : formatTime(timerRemaining)}
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
                      onClick={startTimer}
                      disabled={timerComplete}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-burnham text-white text-[10px] font-bold hover:bg-burnham/90 transition-colors disabled:opacity-40"
                    >
                      <Play size={10} weight="fill" /> Start
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
              </div>
            )}
          </div>

          {/* Tomorrow's Focus */}
          <div>
            <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Tomorrow's Focus</h3>
            <textarea
              className="w-full bg-white border border-mercury rounded-lg p-3 text-sm text-burnham h-20 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0"
              placeholder="What will you prioritize tomorrow?"
              value={tomorrowValue}
              onChange={e => handleTomorrowChange(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-3">Notes</h3>
            <textarea
              className="w-full bg-white border border-mercury rounded-lg p-3 text-sm text-burnham h-24 resize-none placeholder-gray-300 focus:border-shuttle focus:ring-0"
              placeholder="Any blockers or quick thoughts?"
              value={notesValue}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>
        </div>

        {/* CTA */}
        <div className="p-8 border-t border-mercury bg-white">
          <button
            onClick={() => upsertReview({ tomorrow_reviewed: true })}
            className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 text-white py-3.5 rounded-lg text-sm font-medium transition-all"
          >
            <span>All done for today</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>
      </aside>

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
