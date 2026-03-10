import { useState, useEffect, useRef, useCallback } from 'react'
import {
  House, Lightning, X, Check, PencilSimple,
  ArrowRight, Question
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Todo, Habit, HabitLog, Review, Milestone } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

type Tab = 'todos' | 'milestones' | 'habits'

export default function Today() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const [tab, setTab] = useState<Tab>('todos')

  const [todos, setTodos] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [goals, setGoals] = useState<{ id: string; text: string }[]>([])
  const [newTask, setNewTask] = useState('')
  const [taskType, setTaskType] = useState<'To-Do' | 'Milestone'>('To-Do')
  const [taskDeep, setTaskDeep] = useState(false)
  const [todoBlock, setTodoBlock] = useState<'AM' | 'PM' | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Subtab keyboard shortcuts: 1=Todos, 2=Milestones, 3=Habits
  useKeyboardShortcuts({
    '1': () => setTab('todos'),
    '2': () => setTab('milestones'),
    '3': () => setTab('habits'),
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [todosRes, habitsRes, logsRes, reviewRes, goalsRes, milestonesRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id)
          .or(`date.is.null,date.eq.${today}`),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('review_date', today).maybeSingle(),
        supabase.from('goals').select('id, text').eq('user_id', user.id).eq('goal_type', 'ACTIVE'),
        supabase.from('milestones').select('*').eq('user_id', user.id)
          .or(`target_date.is.null,target_date.gte.${today}`).order('target_date', { nullsFirst: true }),
      ])
      setTodos(todosRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setReview(reviewRes.data)
      setGoals(goalsRes.data ?? [])
      setMilestones((milestonesRes.data ?? []).slice(0, 10))
    }
    load()
  }, [today])

  // Sync notesValue with review when it loads
  useEffect(() => {
    setNotesValue(review?.notes ?? '')
  }, [review?.notes])

  const handleNotesChange = useCallback((value: string) => {
    setNotesValue(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      upsertReview({ notes: value })
    }, 800)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingTodos = todos.filter(t => !t.completed)
  const doneTodos = todos.filter(t => t.completed)
  const pendingMilestones = milestones.filter(m => m.status !== 'COMPLETE')
  const doneMilestones = milestones.filter(m => m.status === 'COMPLETE')
  const pendingHabits = habits.filter(h => !logs.some(l => l.habit_id === h.id && l.value === 1))
  const doneHabits = habits.filter(h => logs.some(l => l.habit_id === h.id && l.value === 1))

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = logs.find(l => l.habit_id === habitId)
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      await supabase.from('habit_logs').update({ value: newVal }).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
    } else {
      const { data } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: user.id, log_date: today, value: 1 })
        .select().single()
      if (data) setLogs(prev => [...prev, data])
    }
  }

  const addTodo = async () => {
    if (!newTask.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('todos')
      .insert({
        text: newTask.trim(),
        user_id: user.id,
        effort: taskDeep ? 'DEEP' : 'NORMAL',
        date: today,
        block: todoBlock,
      })
      .select().single()
    if (data) setTodos(prev => [...prev, data])
    setNewTask('')
    setTodoBlock(null)
  }

  const upsertReview = async (updates: Partial<Review>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { ...review, ...updates, user_id: user.id, review_date: today }
    const { data } = await supabase.from('reviews').upsert(payload).select().single()
    if (data) setReview(data)
  }

  const todosProgress = todos.length > 0 ? Math.round((doneTodos.length / todos.length) * 100) : 0
  const milestonesProgress = milestones.length > 0 ? Math.round((doneMilestones.length / milestones.length) * 100) : 0
  const habitsProgress = habits.length > 0 ? Math.round((doneHabits.length / habits.length) * 100) : 0

  const monthStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  return (
    <div className="h-screen bg-white text-burnham font-sans flex overflow-hidden">
      {/* Main 70% */}
      <main className="flex-1 h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto px-16 py-12 pb-20">
          <div className="max-w-3xl mx-auto w-full mb-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-medium text-shuttle mb-4">
              <House size={14} />
              <span>/</span>
              <span className="text-burnham font-semibold">{monthStr}</span>
            </div>

            {/* Quick add task */}
            <div className="flex items-start gap-4 border-b border-mercury pb-4 group focus-within:border-shuttle transition-colors">
              <button className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-md text-sm font-medium text-shuttle transition-colors shrink-0 mt-1">
                <span>{taskType}</span>
              </button>
              <div className="flex-1">
                <input
                  ref={inputRef}
                  className="w-full text-2xl font-medium placeholder-gray-300 text-burnham bg-transparent border-none p-0 focus:ring-0 mb-2"
                  placeholder="What needs to get done?"
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button className="px-2 py-0.5 rounded text-[10px] font-semibold text-shuttle bg-white border border-mercury hover:border-shuttle hover:text-burnham transition-colors">
                    # Add Goal
                  </button>
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
          </div>

          {/* Inline tab bar — replaces old floating bottom pill */}
          <div className="max-w-3xl mx-auto w-full mb-8">
            <div className="flex border-b border-mercury">
              {([
                { id: 'todos',      label: 'To-Dos',    key: '1' },
                { id: 'milestones', label: 'Milestones', key: '2' },
                { id: 'habits',     label: 'Habits',     key: '3' },
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
          </div>

          <div className="max-w-3xl mx-auto w-full space-y-12">
            {/* TO-DOS */}
            {(tab === 'todos') && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest">To-Dos</h3>
                  <span className="text-xs font-mono text-shuttle">{pendingTodos.length} Pending</span>
                </div>
                <div className="space-y-1 mb-8">
                  {pendingTodos.map(todo => (
                    <div key={todo.id} className="group flex items-start gap-3 py-2 border-b border-transparent hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        className="custom-checkbox mt-0.5"
                        checked={false}
                        onChange={() => toggleTodo(todo.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-base font-medium text-burnham">{todo.text}</span>
                          <div className="flex gap-2">
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
                      </div>
                    </div>
                  ))}
                  <div className="group flex items-center gap-3 py-2 px-2 -mx-2 opacity-40 hover:opacity-80 transition-opacity cursor-text">
                    <div className="w-[1.15em] h-[1.15em] border border-dashed border-shuttle rounded-[0.35em]" />
                    <span className="text-sm text-shuttle" onClick={() => inputRef.current?.focus()}>Add task...</span>
                  </div>
                </div>
                {doneTodos.length > 0 && (
                  <div className="pt-6 border-t border-dashed border-mercury">
                    <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                    <div className="space-y-1">
                      {doneTodos.map(todo => (
                        <div key={todo.id} className="flex items-start gap-3 py-2 px-2 -mx-2 opacity-60">
                          <input type="checkbox" className="custom-checkbox mt-0.5" checked onChange={() => toggleTodo(todo.id)} />
                          <div className="flex-1 flex justify-between items-baseline">
                            <span className="text-base text-shuttle line-through decoration-pastel">{todo.text}</span>
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
                  <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest">Milestones</h3>
                  <span className="text-xs font-mono text-shuttle">{pendingMilestones.length} Pending</span>
                </div>
                <div className="space-y-1 mb-8">
                  {pendingMilestones.map(m => (
                    <div key={m.id} className="group flex items-start gap-3 py-2 border-b border-transparent hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                      <input type="checkbox" className="custom-checkbox mt-0.5" checked={false} onChange={() => toggleMilestone(m.id)} />
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-base font-medium text-burnham">{m.text}</span>
                          <div className="flex gap-2">
                            {m.target_date && <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{m.target_date}</span>}
                          </div>
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
                  <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest">Habits</h3>
                  <span className="text-xs font-mono text-shuttle">{pendingHabits.length} Pending</span>
                </div>
                <div className="space-y-1 mb-8">
                  {pendingHabits.map(habit => (
                    <div key={habit.id} className="group flex items-center gap-3 py-2 border-b border-transparent hover:bg-gray-50/50 px-2 -mx-2 rounded transition-colors">
                      <input type="checkbox" className="custom-checkbox" checked={false} onChange={() => toggleHabit(habit.id)} />
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-medium text-burnham">{habit.text}</span>
                          <span className="text-[10px] bg-gray-100 text-shuttle px-1.5 py-0.5 rounded">{habit.frequency}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleHabit(habit.id)}
                            className="text-[10px] font-semibold text-burnham bg-gossip hover:brightness-95 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                          >
                            <Check size={9} weight="bold" /> Commit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {doneHabits.length > 0 && (
                  <div className="pt-6 border-t border-dashed border-mercury">
                    <h4 className="text-[10px] font-semibold text-shuttle/60 uppercase tracking-widest mb-3">Done</h4>
                    {doneHabits.map(h => (
                      <div key={h.id} className="flex items-center gap-3 py-2 px-2 -mx-2 opacity-60">
                        <input type="checkbox" className="custom-checkbox" checked onChange={() => toggleHabit(h.id)} />
                        <span className="text-base text-shuttle line-through decoration-pastel">{h.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
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
            <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest mb-4">Today's Progress</h3>
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

          {/* Energy */}
          <div>
            <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest mb-4">Daily Energy</h3>
            <div className="flex gap-2 justify-between">
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  onClick={() => upsertReview({ energy_level: n })}
                  className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-medium transition-all ${
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
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest">Daily Protocol</h3>
              <Question size={14} className="text-mercury hover:text-shuttle cursor-help" />
            </div>
            <div className="space-y-4">
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

          {/* Notes */}
          <div>
            <h3 className="text-xs font-semibold text-shuttle uppercase tracking-widest mb-4">Notes</h3>
            <textarea
              className="w-full bg-white border border-mercury rounded-lg p-3 text-sm text-burnham h-32 resize-none placeholder-gray-400 focus:border-shuttle focus:ring-0"
              placeholder="Any blockers or quick thoughts?"
              value={notesValue}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>
        </div>

        {/* CTA */}
        <div className="p-8 border-t border-mercury bg-white">
          <button className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 text-white py-3.5 rounded-lg text-sm font-medium transition-all">
            <span>All done for today</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>
      </aside>
    </div>
  )
}
